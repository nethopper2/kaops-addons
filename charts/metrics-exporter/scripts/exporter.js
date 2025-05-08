// Import required modules
const axios = require("axios");
const fs = require("fs");
const path = require("path");
// Import S3 client from AWS SDK v3
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

// Configuration from environment variables
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || "http://localhost:9090";
const S3_BUCKET = process.env.S3_BUCKET || "nh-metrics-exporter";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const QUERIES_FILE =
  process.env.QUERIES_FILE || path.join(__dirname, "queries.json");

// Create S3 client with v3 SDK
const s3Client = new S3Client({ region: AWS_REGION });

/**
 * Load PromQL queries from the JSON file
 * @returns {Array} Array of query objects with name and query properties
 */
function loadQueries() {
  try {
    const queriesData = fs.readFileSync(QUERIES_FILE, "utf8");
    console.log(`Loaded queries from ${QUERIES_FILE}`);
    return JSON.parse(queriesData);
  } catch (error) {
    console.error(
      `Error loading queries from ${QUERIES_FILE}: ${error.message}`
    );
    console.warn("Falling back to default queries");

    // Return default queries if file loading fails
    return [
      { 
        name: "default_metrics", 
        calculateTotal: true,
        queries: [
          { name: "up_query", valueName: "instance", query: "up" },
          { name: "node_cpu", valueName: "instance", query: "node_cpu_seconds_total" }
        ]
      }
    ];
  }
}

/**
 * Executes a Prometheus query using the instant query API
 * @param {string} query - The PromQL query string
 * @param {string} time - ISO-8601 formatted timestamp
 * @returns {Promise<Array>} - Returns a promise with the query result
 */
async function fetchPrometheusData(query, time) {
  const url = `${PROMETHEUS_URL}/api/v1/query`;

  // Create a PromQL query string that should be properly escaped
  // Try a more direct approach by using URLSearchParams
  const params = new URLSearchParams();
  params.append("query", query);
  params.append("time", time);

  try {
    console.log(`Executing Prometheus query...`);

    // Use axios with a string body
    const response = await axios({
      method: "post",
      url: url,
      data: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (response.data.status !== "success") {
      throw new Error(`Prometheus query failed: ${response.data.error}`);
    }
    return response.data.data.result;
  } catch (error) {
    // Enhanced error logging for debugging
    if (error.response) {
      console.error(`Error response data:`, error.response.data);
      console.error(`Error response status:`, error.response.status);
      console.error(`Error response headers:`, error.response.headers);
    } else if (error.request) {
      console.error(`No response received:`, error.request);
    } else {
      console.error(`Error setting up request:`, error.message);
    }
    throw new Error(`Error fetching Prometheus data: ${error.message}`);
  }
}

/**
 * Process a group of queries and combine results into a single CSV
 * @param {Object} queryGroup - Object with name and array of queries
 * @param {string} timestamp - ISO timestamp for the query
 * @returns {Promise<string>} - CSV data
 */
async function processQueryGroup(queryGroup, timestamp) {
  console.log(`Processing query group: ${queryGroup.name}`);
  
  const queryResults = {};
  const valueNameMap = {};
  
  // Execute all queries in the group
  for (const query of queryGroup.queries) {
    try {
      console.log(`Executing query: ${query.name}`);
      const data = await fetchPrometheusData(query.query, timestamp);
      queryResults[query.name] = data;
      valueNameMap[query.name] = query.valueName;
    } catch (error) {
      console.error(`Error executing query ${query.name}: ${error.message}`);
      queryResults[query.name] = [];
    }
  }
  
  // Convert to combined CSV
  return convertGroupToCSV(queryGroup, queryResults, valueNameMap);
}

/**
 * Convert query group results to CSV with each query as a column
 * @param {Object} queryGroup - The query group object
 * @param {Object} resultsMap - Map of query names to results
 * @param {Object} valueNameMap - Map of query names to their value names
 * @returns {string} - Combined CSV string
 */
function convertGroupToCSV(queryGroup, resultsMap, valueNameMap) {
  // First, gather all unique keys (like namespace names)
  const allKeys = new Set();
  const firstQueryName = queryGroup.queries[0]?.name;
  const firstValueName = valueNameMap[firstQueryName];
  
  // Extract all unique keys from all queries to ensure we get complete data
  Object.keys(resultsMap).forEach(queryName => {
    const valueName = valueNameMap[queryName];
    const results = resultsMap[queryName];
    
    results.forEach(item => {
      if (item.metric && item.metric[valueName]) {
        allKeys.add(item.metric[valueName]);
      }
    });
  });
  
  // Create a map to store values for each key and query
  const dataMap = {};
  Array.from(allKeys).forEach(key => {
    dataMap[key] = {};
  });
  
  // Populate the dataMap with values from each query
  Object.keys(resultsMap).forEach(queryName => {
    const valueName = valueNameMap[queryName];
    const results = resultsMap[queryName];
    
    results.forEach(item => {
      const key = item.metric[valueName];
      if (key && dataMap[key]) {
        // Convert string to float and format to 2 decimal places for numerical values
        const rawValue = parseFloat(item.value[1]);
        dataMap[key][queryName] = isNaN(rawValue) ? item.value[1] : rawValue;
      }
    });
  });
  
  // Create formatted column headers based on query names
  const columnHeaders = {};
  queryGroup.queries.forEach(query => {
    // Map query names to formatted headers
    switch(query.name) {
      case 'cpu_cost':
        columnHeaders[query.name] = 'CPU Cost';
        break;
      case 'memory_cost':
        columnHeaders[query.name] = 'RAM Cost';
        break;
      case 'gpu_cost':
        columnHeaders[query.name] = 'GPU Cost';
        break;
      case 'pv_cost':
        columnHeaders[query.name] = 'PV Cost';
        break;
      default:
        columnHeaders[query.name] = query.name.charAt(0).toUpperCase() + query.name.slice(1).replace(/_/g, ' ');
    }
  });
  
  // Generate CSV header
  const headers = [firstValueName, ...queryGroup.queries.map(q => columnHeaders[q.name])];
  if (queryGroup.calculateTotal) {
    headers.push('Total Cost');
  }
  
  let csv = headers.join(',') + '\n';
  
  // Generate CSV rows
  Object.keys(dataMap).sort().forEach(key => {
    const row = [key];
    
    let rowTotal = 0;
    
    // Add values for each query or zero if missing
    queryGroup.queries.forEach(query => {
      const value = dataMap[key][query.name] || 0;
      rowTotal += parseFloat(value) || 0;
      // Format numerical values to 2 decimal places with dollar sign
      row.push(typeof value === 'number' ? `$${value.toFixed(2)}` : `$${parseFloat(value || 0).toFixed(2)}`);
    });
    
    // Add total if required
    if (queryGroup.calculateTotal) {
      row.push(`$${rowTotal.toFixed(2)}`);
    }
    
    csv += row.join(',') + '\n';
  });
  
  // Add total row if required
  // if (queryGroup.calculateTotal) {
  //   const totalRow = ['TOTAL'];
  //   let grandTotal = 0;
    
  //   queryGroup.queries.forEach(query => {
  //     let total = 0;
  //     Object.keys(dataMap).forEach(key => {
  //       const val = dataMap[key][query.name];
  //       total += parseFloat(val || 0);
  //     });
  //     grandTotal += total;
  //     totalRow.push(`$${total.toFixed(2)}`);
  //   });
    
  //   // Add grand total
  //   totalRow.push(`$${grandTotal.toFixed(2)}`);
    
  //   csv += totalRow.join(',') + '\n';
  // }
  
  return csv;
}

/**
 * Upload a file to S3
 * @param {string} filePath - Local file path
 * @param {string} s3Key - S3 object key
 * @returns {Promise} - S3 upload promise
 */
async function uploadToS3(filePath, s3Key) {
  const fileContent = fs.readFileSync(filePath);
  const params = {
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: fileContent,
    ContentType: "text/csv",
  };

  try {
    const command = new PutObjectCommand(params);
    await s3Client.send(command);
    console.log(`File uploaded successfully to s3://${S3_BUCKET}/${s3Key}`);
  } catch (error) {
    throw new Error(`S3 upload failed: ${error.message}`);
  }
}

/**
 * Upload data directly to S3 without creating a local file
 * @param {string} data - The data to upload
 * @param {string} s3Key - S3 object key
 * @returns {Promise} - S3 upload promise
 */
async function uploadDirectlyToS3(data, s3Key) {
  const params = {
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: data,
    ContentType: "text/csv",
  };

  try {
    const command = new PutObjectCommand(params);
    await s3Client.send(command);
    console.log(`Data uploaded successfully to s3://${S3_BUCKET}/${s3Key}`);
  } catch (error) {
    throw new Error(`S3 upload failed: ${error.message}`);
  }
}

/**
 * Main job function to fetch metrics and upload to S3
 */
async function runJob() {
  // Get timestamp for query (midnight UTC today)
  const timestamp =
    new Date(new Date().setUTCHours(0, 0, 0, 0))
      .toISOString()
      .split(".")[0] + "Z";
  const timestampDate = new Date(timestamp);
  const dateStr = new Date(timestampDate - 1).toISOString().split("T")[0];

  console.log(`Fetching data for: ${dateStr}`);

  // Load query groups
  const queryGroups = loadQueries();

  // Process each query group
  for (const queryGroup of queryGroups) {
    console.log(`Processing query group: ${queryGroup.name}`);
    try {
      // Process this group of queries
      const csvData = await processQueryGroup(queryGroup, timestamp);

      // Create filename based on the date (YYYY-MM-DD)
      const fileName = `${dateStr}.csv`;

      // Create S3 key with query group name as directory
      const s3Key = `${queryGroup.name}/${fileName}`;

      // Upload directly to S3
      await uploadDirectlyToS3(csvData, s3Key);
      console.log(
        `Query group results for "${queryGroup.name}" uploaded to s3://${S3_BUCKET}/${s3Key}`
      );
    } catch (error) {
      console.error(`Error processing query group ${queryGroup.name}: ${error.message}`);
    }
  }

  console.log("All query groups processed and uploaded to S3");
}

// Execute the job
runJob().catch((error) => {
  console.error(`Job failed: ${error.message}`);
  process.exit(1);
});
