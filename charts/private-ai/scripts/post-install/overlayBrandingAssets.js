// Description: This script downloads the branding assets from the S3 bucket 
//              and saves them to the local file system running Open WebUI.
//
// Note: This script is intended to be run on the Open WebUI server and requires
//       the `axios` package to be installed.
// Note: Once we implement this script, we can remove all of the the branding 
//       assets that we manually copied into our forked repo from Open WebUI.
//
// Usage: node scripts/post-install/overlayBrandingAssets.js
//
// TODO:
// 1. Uncomment the code for saving the files to the system in the Docker environment.
// 2. Run the script using the command mentioned above.

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Define the mapping of S3 URLs to local file paths
const fileMapping = [
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/images/bridge.jpg', localPath: 'static/assets/images/bridge.jpg' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/images/chess.jpg', localPath: 'static/assets/images/chess.jpg' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/images/climber.jpg', localPath: 'static/assets/images/climber.jpg' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/images/lock.jpg', localPath: 'static/assets/images/lock.jpg' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/favicon.png', localPath: 'static/favicon.png' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/apple-touch-icon.png', localPath: 'static/static/apple-touch-icon.png' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/favicon-96x96.png', localPath: 'static/static/favicon-96x96.png' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/favicon-dark.png', localPath: 'static/static/favicon-dark.png' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/favicon.ico', localPath: 'static/static/favicon.ico' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/favicon.png', localPath: 'static/static/favicon.png' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/favicon.svg', localPath: 'static/static/favicon.svg' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/ollama.png', localPath: 'static/static/ollama.png' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/splash-dark.png', localPath: 'static/static/splash-dark.png' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/splash.png', localPath: 'static/static/splash.png' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/web-app-manifest-192x192.png', localPath: 'static/static/web-app-manifest-192x192.png' },
  { s3Url: 'https://nh-addon-themes.s3.us-east-1.amazonaws.com/private-ai/web-app-manifest-512x512.png', localPath: 'static/static/web-app-manifest-512x512.png' },
];

async function downloadAndSaveImage(s3Url, localPath) {
  try {
    const response = await axios({
      method: 'get',
      url: s3Url,
      responseType: 'arraybuffer'
    });

    const buffer = Buffer.from(response.data, 'binary');

    // Log the successful download
    console.log(`Successfully downloaded from ${s3Url}`);

    // Commented out code for saving the file to the system
    /*
    await fs.writeFile(localPath, buffer);
    console.log(`Saved to ${localPath}`);
    */
  } catch (error) {
    console.error(`Error downloading ${s3Url}:`, error.message);
  }
}

async function processAllImages() {
  for (const file of fileMapping) {
    await downloadAndSaveImage(file.s3Url, file.localPath);
  }
}

processAllImages()
  .then(() => console.log('All images processed'))
  .catch(error => console.error('An error occurred:', error));
