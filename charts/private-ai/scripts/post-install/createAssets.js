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

// Base URL for the API
const BASE_URL = 'https://chat.trudog.kaops.dev';
// User details for signup
const SIGNUP_NAME = 'Peter';
const SIGNUP_PASSWORD = 'Nethopper123$';
const SIGNUP_EMAIL = 'peter@nethopper.io';

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
    console.error('Error during signup:', error.response ? error.response.data : error.message);
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
    console.error('Error creating group:', error.response ? error.response.data : error.message);
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
    console.error('Error creating knowledge:', error.response ? error.response.data : error.message);
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
    console.error('Error creating prompt:', error.response ? error.response.data : error.message);
    throw error;
  }
}


async function deleteUser(token, userId) {
  const deleteUrl = `${BASE_URL}/api/v1/users/${userId}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    const response = await axios.delete(deleteUrl, { headers });
    console.log('User deleted successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error deleting user:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Data for groups, knowledge, and prompts
const groupsToCreate = [
  {
    name: "Engineering Team",
    description: "A group for software engineers"
  },
  {
    name: "Product Management",
    description: "A group for product managers"
  },
  {
    name: "Marketing Team",
    description: "A group for marketing professionals"
  },
  {
    name: "Customer Support",
    description: "A group for customer support representatives"
  }
];

const engineeringPrompts = [
  {
    command: "/code_review",
    title: "Code Review Best Practices",
    content: "As a software engineer, provide a step-by-step guide for conducting an effective code review. Include best practices for giving constructive feedback, what to look for in the code, and how to ensure the review process is efficient and beneficial for the team.",
    access_control: {}
  },
  {
    command: "/debug_strategy",
    title: "Debugging Strategy",
    content: "Outline a systematic approach to debugging complex software issues. Include steps for reproducing the problem, isolating the cause, and implementing a solution. Provide examples of common debugging tools and techniques.",
    access_control: {}
  },
  {
    command: "/architecture_design",
    title: "Software Architecture Design",
    content: "Explain the process of designing a scalable and maintainable software architecture. Cover topics such as choosing appropriate design patterns, considering performance and security, and documenting the architecture effectively.",
    access_control: {}
  }
];

const productManagementPrompts = [
  {
    command: "/product_roadmap",
    title: "Product Roadmap Creation",
    content: "As a product manager, outline the key steps and considerations for creating a comprehensive product roadmap. Include how to prioritize features, align with business goals, and communicate the roadmap effectively to stakeholders.",
    access_control: {}
  },
  {
    command: "/user_research",
    title: "Conducting User Research",
    content: "Provide a guide on conducting effective user research for product development. Include methods for gathering user feedback, analyzing user behavior, and translating insights into actionable product improvements.",
    access_control: {}
  },
  {
    command: "/feature_prioritization",
    title: "Feature Prioritization Framework",
    content: "Describe a framework for prioritizing product features. Include techniques such as impact vs effort analysis, user story mapping, and how to balance user needs with business objectives.",
    access_control: {}
  }
];

const marketingPrompts = [
  {
    command: "/campaign_strategy",
    title: "Marketing Campaign Strategy",
    content: "As a marketing professional, provide a framework for developing a successful marketing campaign strategy. Include steps for identifying target audience, choosing appropriate channels, creating compelling content, and measuring campaign effectiveness.",
    access_control: {}
  },
  {
    command: "/social_media_plan",
    title: "Social Media Marketing Plan",
    content: "Outline a comprehensive social media marketing plan. Cover topics such as platform selection, content calendar creation, engagement strategies, and performance metrics to track.",
    access_control: {}
  },
  {
    command: "/brand_positioning",
    title: "Brand Positioning Strategy",
    content: "Explain the process of developing a strong brand positioning strategy. Include steps for identifying unique selling propositions, analyzing competitors, and creating a compelling brand narrative.",
    access_control: {}
  }
];

const customerSupportPrompts = [
  {
    command: "/support_scenarios",
    title: "Customer Support Scenario Handling",
    content: "As a customer support representative, describe how to handle the following common scenarios: 1) An angry customer demanding a refund, 2) A customer reporting a technical issue with the product, 3) A customer requesting a feature that doesn't exist. Provide step-by-step guidance for each scenario.",
    access_control: {}
  },
  {
    command: "/customer_empathy",
    title: "Building Customer Empathy",
    content: "Provide techniques for developing and demonstrating empathy in customer interactions. Include examples of empathetic language, active listening skills, and how to handle emotionally charged situations.",
    access_control: {}
  },
  {
    command: "/support_efficiency",
    title: "Improving Support Efficiency",
    content: "Outline strategies for improving efficiency in customer support operations. Cover topics such as creating and maintaining a knowledge base, using macros for common responses, and effectively escalating complex issues.",
    access_control: {}
  }
];

const knowledgeToCreate = [
  {
    name: "Best Practices for Code Reviews",
    description: "This guide outlines the key steps for effective code reviews."
  },
  {
    name: "Social Media Strategy For This Year",
    description: "An overview of our social media approach for the upcoming year."
  },
  {
    name: "Agile Project Management Tips",
    description: "Key insights for managing agile projects effectively."
  },
  {
    name: "Handling Difficult Customers",
    description: "Techniques and strategies for resolving challenging customer situations."
  }  
];

async function main() {
  let token, userId;
  try {
    // Sign up and get token and user ID
    ({ token, id: userId } = await signUp(SIGNUP_NAME, SIGNUP_PASSWORD, SIGNUP_EMAIL));

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

    // TODO: Need to integrate this with SSO and the Docker environment
    //
    // Attempt to delete the user (this will fail for the first admin account)
    // try {
    //   await deleteUser(token, userId);
    //   console.log('Temporary user deleted');
    // } catch (deleteError) {
    //   console.log('Unable to delete user. This may be the primary admin account.');
    // }

  } catch (error) {
    console.error('An error occurred:', error);
  }
}


main();
