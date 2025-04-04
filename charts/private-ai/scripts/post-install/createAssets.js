// Description: 
//   This script creates groups, knowledge entries, and prompts in the Open WebUI server.
//   It is intended to be run after the Open WebUI server has been installed and configured.
//   It will create a user, groups, knowledge entries, and prompts.
// 
// Usage: node createAssets.js
// 
// Required Libraries:
//   - axios: For making HTTP requests to the Open WebUI API.
//   - dotenv: For loading environment variables from a .env file.//
//   - fs: For reading the assets.json file containing group, knowledge, and prompt data.
// 
// Installing required libraries:
//   - To install the axios library, run: `npm install axios`
//   - To install dotenv, run: `npm install dotenv`
//   - To install fs, run: `npm install fs`             

const axios = require('axios');
const fs = require('fs');
require('dotenv').config(); // Load environment variables from .env file

// Base URL for the API
const BASE_URL = process.env.BASE_URL || 'http://open-webui';
// User details for signup
const SIGNUP_NAME = process.env.SIGNUP_NAME || 'Shawn';
const SIGNUP_PASSWORD = process.env.SIGNUP_PASSWORD || 'Nethopper123$';
const SIGNUP_EMAIL = process.env.SIGNUP_EMAIL || 'shawn@nethopper.io';
const ENABLE_OAUTH_SIGNUP = process.env.ENABLE_OAUTH_SIGNUP;

async function signUp(name, password, email) {
  const signupUrl = `${BASE_URL}/api/v1/auths/signup`;
  const signupData = { name, password, email };

  try {
    const signupResponse = await axios.post(signupUrl, signupData);
    const { token, id, email } = signupResponse.data;

    if (!token || !id || !email) {
      throw new Error('token, id, or email not found in signup response');
    }

    console.log('User created successfully.');
    console.log('  email:', email);
    console.log('  id:', id);
    return { token, id };
  } catch (error) {
    console.error('Error during signup');
    throw error;  
  }
}

async function createGroup(token, groupName, description) {
  const url = `${BASE_URL}/api/v1/groups/create`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  const data = { name: groupName, description };

  try {
    const response = await axios.post(url, data, { headers });
    console.log('Group created successfully:', response.data?.name);
    return response.data.id; // Return the group ID
  } catch (error) {
    console.error('Error creating group');
    throw error;
  }
}

async function createKnowledge(token, name, description, groupIds) {
  const url = `${BASE_URL}/api/v1/knowledge/create`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  const accessControl = groupIds
    ? {
        read: { user_ids: [], group_ids: [groupIds] },
        write: { user_ids: [], group_ids: [groupIds] },
        delete: { user_ids: [], group_ids: [groupIds] }
      }
    : {
        read: { user_ids: [], group_ids: [] },
        write: { user_ids: [], group_ids: [] },
        delete: { user_ids: [], group_ids: [] }
      };

  const data = { name, description, access_control: accessControl };

  try {
    const response = await axios.post(url, data, { headers });
    console.log('Knowledge created successfully:', response.data?.name);
    return response.data;
  } catch (error) {
    console.error('Error creating knowledge');
    throw error;
  }
}

async function createPrompt(token, command, title, content, accessControl) {
  const url = `${BASE_URL}/api/v1/prompts/create`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  const data = {
    command,
    title,
    content,
    access_control: accessControl
  };

  try {
    const response = await axios.post(url, data, { headers });
    console.log('  Prompt created successfully:', response.data?.title);
    return response.data;
  } catch (error) {
    console.error('  Error creating prompt');
    throw error;
  }
}

async function getAdminConfig(token) {
  const url = `${BASE_URL}/api/v1/auths/admin/config`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    const response = await axios.get(url, { headers });
    console.log('Current Admin Config:');
    console.log(JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Error fetching admin config');
    throw error;
  }
}

async function postAdminConfig(token, configData) {
  const url = `${BASE_URL}/api/v1/auths/admin/config`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    const response = await axios.post(url, configData, { headers });
    console.log('Updated Admin Config:');
    console.log(JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Error updating admin config');
    throw error;
  }
}

// Add server availability check function
async function checkServerAvailability() {
  const maxAttempts = 300; // 5 minutes * 60 seconds
  const checkInterval = 1000; // 1 second

  console.log("Starting server availability check...");
  console.log("Base URL:", BASE_URL);
  const startTime = new Date();
  console.log(`Start Time: ${startTime.toISOString()}`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(BASE_URL);
      if (response.status >= 200 && response.status < 300) {
        console.log("\nServer is available!");
        const endTime = new Date();
        console.log(`End Time: ${endTime.toISOString()}`);
        const elapsedTime = (endTime - startTime) / 1000;
        console.log(`Elapsed Time: ${formatElapsedTime(elapsedTime)}`);
        return true;
      }
    } catch (error) {
      process.stdout.write('.'); // Print a dot for each attempt
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  console.error("\nServer not available after 5 minutes.");
  const endTime = new Date();
  console.log(`End Time: ${endTime.toISOString()}`);
  const elapsedTime = (endTime - startTime) / 1000;
  console.log(`Elapsed Time: ${formatElapsedTime(elapsedTime)}`);
  return false;
}

// Format elapsed time into seconds or fractional minutes
function formatElapsedTime(seconds) {
  if (seconds < 60) {
    return `${seconds.toFixed(2)} seconds`;
  } else {
    const minutes = seconds / 60;
    return `${minutes.toFixed(2)} minutes`;
  }
}

async function main() {
  let token, userId;
  console.log("==================================================================");
  console.log("                 Open WebUI Asset Creation Script       ");
  console.log("==================================================================");
  console.log("  This script creates groups, knowledge entries, and prompts");
  console.log("  in the Open WebUI server. It is intended to be run");
  console.log("  after the Open WebUI server has been installed and configured.");
  console.log("  It will create a user, groups, knowledge entries, and prompts.");

  try {
    // First check server availability
    console.log("\n------------------------------------");
    console.log("  Server Availability Check ");
    console.log("------------------------------------");
    if (!(await checkServerAvailability())) {
      process.exit(1);
    }

    // Sign up and get token and user ID
    console.log("\n------------------------------------");
    console.log("  Create Iniital User and Get Token ");
    console.log("------------------------------------");
    ({ token, id: userId } = await signUp(SIGNUP_NAME, SIGNUP_PASSWORD, SIGNUP_EMAIL));

    // Load group, knowledge, and prompt assets from external file
    const assets = JSON.parse(fs.readFileSync('assets.json', 'utf-8'));
    const groupsToCreate = assets.groups;
    const engineeringPrompts = assets.engineeringPrompts;
    const productManagementPrompts = assets.productManagementPrompts;
    const marketingPrompts = assets.marketingPrompts;
    const customerSupportPrompts = assets.customerSupportPrompts;
    const knowledgeToCreate = assets.knowledge;

    // Create all groups and prompts
    console.log("\n------------------------------------");
    console.log("  Create groups and prompts");
    console.log("------------------------------------");
    const createdGroupIds = [];
    const promptGroups = [engineeringPrompts, productManagementPrompts, marketingPrompts, customerSupportPrompts];

    for (let i = 0; i < groupsToCreate.length; i++) {
      const group = groupsToCreate[i];
      const groupId = await createGroup(token, group.name, group.description);
      createdGroupIds.push(groupId);

      // Create prompts associated with this group
      const groupPrompts = promptGroups[i];
      if (groupPrompts) {
        for (const prompt of groupPrompts) {
          const accessControl = {
            read: { user_ids: [], group_ids: [groupId] },
            write: { user_ids: [], group_ids: [groupId] },
            delete: { user_ids: [], group_ids: [groupId] }
          };
          await createPrompt(token, prompt.command, prompt.title, prompt.content, accessControl);
        }
      }
    }

    // Create all knowledge collections
    console.log("\n------------------------------------");
    console.log("  Create Knowledge Collections ");
    console.log("------------------------------------");

    for (let i = 0; i < knowledgeToCreate.length; i++) {
      const knowledge = knowledgeToCreate[i];
      const groupId = i < createdGroupIds.length ? createdGroupIds[i] : undefined;
      await createKnowledge(token, knowledge.name, knowledge.description, groupId);
    }


    // Fetch current admin config
    console.log("\n------------------------------------");
    console.log("Fetching Current Admin Config...");
    console.log("------------------------------------");
    
    const currentConfig = await getAdminConfig(token);

    // Conditionally update admin config based on ENABLE_OAUTH_SIGNUP
    console.log("ENABLE_OAUTH_SIGNUP:", ENABLE_OAUTH_SIGNUP);
    console.log("ENABLE_OAUTH_SIGNUP === 'true': ", ENABLE_OAUTH_SIGNUP === 'true');
    if (ENABLE_OAUTH_SIGNUP.trim() === 'true') {
      console.log("Updating Admin Config with ENABLE_OAUTH_SIGNUP Enabled...");

      // Use values from GET response as payload for POST, but always set ENABLE_SIGNUP to true
      const updatedConfigPayload = {
        ...currentConfig,
        ENABLE_SIGNUP: true,
      };

      await postAdminConfig(token, updatedConfigPayload);
      console.log("Admin Config Updated Successfully.");
      
    } else {
      console.log("ENABLE_OAUTH_SIGNUP is not enabled. Skipping Admin Config Update.");
    }

    console.log("\n**");
    console.log('** All groups, knowledge collections, and prompts created successfully');
    console.log("**");

  } catch (error) {
    if (error.response) {
      console.error('An error occurred:', {
        status: error.response.status,
        data: error.response.data,
      });
    } else if (error.request) {
      console.error('No response received:', error.request._currentUrl || 'Request details unavailable');
    } else {
      console.error('An error occurred:', error.message);
    }
    console.log('BASE_URL:', BASE_URL);
    console.log('SIGNUP_NAME:', SIGNUP_NAME);
    console.log('SIGNUP_PASSWORD:', SIGNUP_PASSWORD);
    console.log('SIGNUP_EMAIL:', SIGNUP_EMAIL);
    process.exit(1);
  } finally {
    console.log("\n==================================================================");
    console.log(" end");
    console.log("==================================================================");
  }
}


main();
