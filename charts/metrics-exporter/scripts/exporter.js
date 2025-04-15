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
      { name: "up_query", query: "up" },
      { name: "node_cpu", query: "node_cpu_seconds_total" },
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
 * Converts query results to CSV format
 * @param {string} queryName - The name identifier of the query
 * @param {Array} data - The result data from Prometheus
 * @returns {string} - CSV string
 */
function convertDataToCSV(queryName, valueName, data) {
  // CSV header
  let csv = `${valueName},value\n`;

  data.forEach((metricSeries) => {
    const name = metricSeries.metric[valueName];
    // Handle both vector and matrix result types
    if (metricSeries.value) {
      // Instant query returns a value pair [timestamp, value]
      csv += `${name},${metricSeries.value[1]}\n`;
    }
  });

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

  // Load queries
  const queries = loadQueries();

  // Process each query and upload directly to S3
  for (const q of queries) {
    console.log(`Running query: ${q.name}`);
    try {
      // Fetch data for this query
      const data = await fetchPrometheusData(q.query, timestamp);

      // Convert to CSV
      const csvData = convertDataToCSV(q.name, q.valueName, data);

      // Create filename based on the date (YYYY-MM-DD)
      const fileName = `${dateStr}.csv`;

      // Create S3 key with query name as directory
      const s3Key = `${q.name}/${fileName}`;

      // Upload directly to S3
      await uploadDirectlyToS3(csvData, s3Key);
      console.log(
        `Query results for "${q.name}" uploaded to s3://${S3_BUCKET}/${s3Key}`
      );
    } catch (error) {
      console.error(`Error processing query ${q.name}: ${error.message}`);
    }
  }

  console.log("All query results processed and uploaded to S3");
}

// Execute the job
runJob().catch((error) => {
  console.error(`Job failed: ${error.message}`);
  process.exit(1);
});
