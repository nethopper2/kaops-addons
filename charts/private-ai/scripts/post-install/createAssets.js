// Description: This script creates groups, knowledge entries, and prompts in 
//              the Open WebUI server. It is intended to be run after the Open 
//              WebUI server has been installed and configured.
//
// Usage: node createAssets.js
//
// Note: This script requires Node.js and the axios library to be installed.
//
// TODO: Need to integrate this with SSO and the Docker environment
// 
//       Update the SIGNUP_NAME, SIGNUP_PASSWORD, and SIGNUP_EMAIL constants with
//       the desired user details for signup. The script will create a user with
//       these details and use the generated token for creating groups, knowledge
//       entries, and prompts. The script will attempt to delete the user after
//       creating the assets, but this will fail for the first admin account.
//
//       Update the groupsToCreate, engineeringPrompts, productManagementPrompts,
//       marketingPrompts, customerSupportPrompts, and knowledgeToCreate arrays
//       with the desired group names, descriptions, prompts, and knowledge entries.
//       The script will create groups, prompts, and knowledge entries based on these
//       arrays. The prompts will be associated with the corresponding groups.
//
//       Update the BASE_URL constant with the base URL of the Open WebUI server.
//       The script will make API requests to this URL to create the assets.

const axios = require('axios');
const fs = require('fs');
require('dotenv').config(); // Load environment variables from .env file

// TODO: In production, we should log errors if the environment variables do not exist?

// Base URL for the API
const BASE_URL = process.env.BASE_URL || 'http://open-webui';
// User details for signup
const SIGNUP_NAME = process.env.SIGNUP_NAME || 'Shawn';
const SIGNUP_PASSWORD = process.env.SIGNUP_PASSWORD || 'Nethopper123$';
const SIGNUP_EMAIL = process.env.SIGNUP_EMAIL || 'shawn@nethopper.io';

async function signUp(name, password, email) {
  const signupUrl = `${BASE_URL}/api/v1/auths/signup`;
  const signupData = { name, password, email };

  try {
    const signupResponse = await axios.post(signupUrl, signupData);
    const { token, id } = signupResponse.data;

    if (!token || !id) {
      throw new Error('Token or user ID not found in signup response');
    }

    console.log('User created successfully. Token and user ID received.');
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
    console.log('Group created successfully:', response.data);
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
    console.log('Knowledge created successfully:', response.data);
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
    console.log('Prompt created successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error creating prompt');
    throw error;
  }
}

// Add server availability check function
async function checkServerAvailability() {
  const maxAttempts = 300; // 5 minutes * 60 seconds
  const checkInterval = 1000; // 1 second
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(BASE_URL);
      if (response.status >= 200 && response.status < 300) {
        console.log(`Server available after ${attempt} seconds`);
        return true;
      }
    } catch (error) {
      console.log(`Attempt ${attempt}/${maxAttempts}: Server unavailable`);
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  console.error('Server not available after 5 minutes');
  return false;
}

async function main() {
  let token, userId;
  try {
    // First check server availability
    if (!(await checkServerAvailability())) {
      process.exit(1);
    }

    // Sign up and get token and user ID
    ({ token, id: userId } = await signUp(SIGNUP_NAME, SIGNUP_PASSWORD, SIGNUP_EMAIL));

    // Load group, knowledge, and prompt assets from external file
    const assets = JSON.parse(fs.readFileSync('assets.json', 'utf-8'));
    const groupsToCreate = assets.groups;
    const engineeringPrompts = assets.engineeringPrompts;
    const productManagementPrompts = assets.productManagementPrompts;
    const marketingPrompts = assets.marketingPrompts;
    const customerSupportPrompts = assets.customerSupportPrompts;
    const knowledgeToCreate = assets.knowledge;

    // Create all groups
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

    // Create all knowledge entries
    for (let i = 0; i < knowledgeToCreate.length; i++) {
      const knowledge = knowledgeToCreate[i];
      const groupId = i < createdGroupIds.length ? createdGroupIds[i] : undefined;
      await createKnowledge(token, knowledge.name, knowledge.description, groupId);
    }

    console.log('All groups, knowledge entries, and prompts created successfully');

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
  }
}


main();
