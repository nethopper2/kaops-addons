/**
 * This script synchronizes files from a Google Drive folder to a Google Cloud Storage 
 * bucket using Google Drive and Google Cloud Storage APIs.
 * 
 * KEY FEATURES:
 *   - Automated Drive-to-GCS sync
 *     • uploadedFiles: Tracks all new/changed files
 *     • deletedFiles: Tracks orphaned files removed from GCS
 *     • skippedFiles: Counts unchanged files
 * 
 * ACCOUNTING METRICS:
 *   - Audit Logging: Detailed records of added/updated/deleted files
 *   - Performance Metrics: Measures total runtime and per-file transfer speeds
 *   - API Call Tracking: Counts every Drive/GCS operation for cost monitoringa
 * 
 * ------------------------------------------------------------
 * Script Configuration
 * ------------------------------------------------------------
 * This script requires a Google Cloud service account with the following roles:
 *   - Google Drive API access
 *   - Google Cloud Storage access
 * 
 * Environment Variables:
 *   - GOOGLE_APPLICATION_CREDENTIALS_BASE64: Base64 encoded service account credentials.
 *   - GOOGLE_API_SCOPES: Comma-separated list of scopes for Google APIs.
 *   - DRIVE_FOLDER_ID: The ID of the Google Drive folder to sync.
 *   - GCS_BUCKET_NAME: The name of the Google Cloud Storage bucket.
 * 
 * Install dependencies:
 *   - googleapis: For accessing Google APIs.
 *   - @google-cloud/storage: For accessing Google Cloud Storage.
 *   - dotenv: For loading environment variables from a .env file.
 *     ```bash
 *      npm install googleapis
 *      npm install @google-cloud/storage
 *      npm install dotenv
 *     ```
 * 
 * ------------------------------------------------------------
 * Usage
 * ------------------------------------------------------------
 *   1. Install the required dependencies.
 *   2. Encode your service account JSON file to base64 and set it as the environment variable 
 *      GOOGLE_APPLICATION_CREDENTIALS_BASE64.
 *   3. Copy the service account JSON file to your .env file or set the environment variable.
 *   4. Run the script using Node.js:
 *      ```bash
 *       node googleDriveGcsSync.js
 *      ```
 *   5. Monitor the console output for sync progress and summary.
 *   6. Check the Google Cloud Storage bucket for the synced files.
 *   7. Optionally, set up a cron job or scheduler to run the script periodically.
 * 
 * ------------------------------------------------------------
 * Google Cloud Setup 
 * ------------------------------------------------------------
 * Service Account:
 *   - Create a service account in the Google Cloud Console.
 *   - Grant the service account the necessary roles:
 *     • "Storage Object Admin" role for the GCS bucket.
 *     • "Drive File" role for the Google Drive folder.
 *     • "Drive API" enabled in the Google Cloud Console.
 *   - We need to base64 encode the service account JSON file. This is how to obtain it:
 *     1. Go to the Google Cloud Console: https://console.cloud.google.com/
 *     2. Navigate to "IAM & Admin" > "Service accounts".
 *     3. Create or select a service account.
 *       - for new service account, select "Create Service Account".
 *       - for existing service account, select the service account you want to use.
 *     4. Generate JSON key for the service account.
 *       - Click on "Keys" tab, then "Add Key" > "Create new key".
 *       - Select "JSON" as the key type and click "Create".
 *     5. Download the JSON key file.
 *     6. Encode the JSON key file to base64:
 *       ```bash
 *         # For systems with GNU coreutils (most Linux)
 *         base64 -w 0 yourfile.json
 *         # For systems with BSD coreutils (macOS), systems (no -w flag)
 *         base64 --i yourfile.json | tr -d '\n'
 *       ```
 * 
 * Google Drive configuration:
 *   - Grant the service account access to the Google Drive folder:
 *     1. Go to the Google Drive folder you want to sync.
 *     2. Click on the "Share" button.
 *     3. Add the service account email (found in the service account JSON file) as a collaborator.
 *     4. Set the permissions to "Viewer".
 *  
 *     OR 
 * 
 *     ```bash
 *       # Grant Drive READ access
 *       gcloud projects add-iam-policy-binding nh-sandbox-451309 \
 *         --member="serviceAccount:google-drive-gcs-sync@nh-sandbox-451309.iam.gserviceaccount.com" \
 *         --role="roles/drive.reader"
 * 
 *       # Grant GCS READ/WRITE access (Should not need this.  I think the above is enough)
 *       gcloud projects add-iam-policy-binding nh-sandbox-451309 \
 *         --member="serviceAccount:google-drive-gcs-sync@nh-sandbox-451309.iam.gserviceaccount.com" \
 *         --role="roles/storage.admin"
 *     ```
 * 
 *     NOTE: I was not able to get the Drive access command above to work, so I shared my 
 *           drive folder by adding the service account email directly.  
 *           Should try this again later.
 * 
 *   Finding a Google Drive Folder ID
 *     1. Open Google Drive in your web browser.
 *     2. Navigate to the folder you want to sync.
 *     3. Look at the URL in the address bar. It should look something like this:
 *        https://drive.google.com/drive/folders/1a2B3cD4e5F6g7H8i9J0kL
 *     4. The part after "folders/" is the folder ID. In this example, the folder ID is "1a2B3cD4e5F6g7H8i9J0kL".
 *     5. Copy the folder ID and set it as the environment variable DRIVE_FOLDER_ID.
 * 
 * GCS Bucket
 *   - To create a Google Cloud Storage bucket, follow these steps:
 *     1. Go to the Google Cloud Console: https://console.cloud.google.com/
 *     2. Navigate to "Storage" > "Browser".
 *     3. Click on "Create bucket".
 *     4. Enter a unique name for your bucket (e.g., "my-bucket-name").
 *     5. Choose a location for your bucket (e.g., "US").
 *     6. Choose a storage class (e.g., "Standard").
 *     7. Choose how to control access to your bucket (e.g., "Uniform").
 *     8. Choose how to protect object data (e.g., "Default").
 *     9. Click "Create" to create the bucket.
 *     10. Public access is not required for this script, but you can set it if needed.
 *     11. Copy the bucket name and set it as the environment variable GCS_BUCKET_NAME.
 * 
 *   - Direct Bucket Access:
 *     https://console.cloud.google.com/storage/browser/YOUR_BUCKET_NAME
 * 
 * Useful gcloud commands:
 *  ```bash
 *   gcloud storage buckets list # List all GCS buckets
 *   gcloud projects list        # List all GCP projects
 *  ```
 */


require('dotenv').config();
const { google } = require('googleapis');
const { Storage } = require('@google-cloud/storage');

// Metrics tracking
let totalApiCalls = 0;
const scriptStartTime = Date.now();

// Load environment variables
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
const SCOPES = process.env.GOOGLE_API_SCOPES.split(',');
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;

// Decode service account
const credentials = JSON.parse(
  Buffer.from(SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8')
);

// Auth clients
const auth = new google.auth.JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: SCOPES
});
const drive = google.drive({ version: 'v3', auth });
const storage = new Storage({ credentials });
const bucket = storage.bucket(GCS_BUCKET_NAME);

// Helper for formatting bytes
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let size = parseInt(bytes, 10);
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(2)} ${units[i]}`;
}

// Helper to parse ISO date strings
function parseDate(dateStr) {
  return dateStr ? new Date(dateStr) : null;
}

// Recursive file listing with path construction
async function listFilesRecursively(folderId, currentPath = '', allFiles = []) {
  try {
    totalApiCalls++;
    const { data: { files } } = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, modifiedTime, createdTime, parents)',
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    // Process each file/folder in current directory level
    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        await listFilesRecursively(
          file.id,                        // Child folder's unique ID
          `${currentPath}${file.name}/`,  // Preserve directory structure
          allFiles                        // Maintain cumulative file list        
        );
      } else {
        allFiles.push({
          ...file,                                // Preserve original file metadata
          fullPath: `${currentPath}${file.name}`  // Construct full path
        });
      }
    }
  } catch (error) {
    console.error('Listing failed:', error.message);
  }
  return allFiles;
}

async function syncDriveToGCS() {
  console.log('Starting recursive sync...');
  
  let uploadedFiles = [];
  let deletedFiles = [];
  let skippedFiles = 0;

  try {
    // 1. List all files recursively with paths
    const files = await listFilesRecursively(DRIVE_FOLDER_ID);
    console.log(`Found ${files.length} files in directory structure`);

    // 2. List all GCS files
    totalApiCalls++;
    const [gcsFiles] = await bucket.getFiles();
    const gcsFileMap = new Map(gcsFiles.map(f => [f.name, f]));
    const driveFilePaths = new Set(files.map(f => f.fullPath));

    // 3. Delete orphaned GCS files
    for (const [gcsName, gcsFile] of gcsFileMap) {
      if (!driveFilePaths.has(gcsName)) {
        totalApiCalls++;
        const [metadata] = await gcsFile.getMetadata();
        
        totalApiCalls++;
        await gcsFile.delete();
        
        deletedFiles.push({
          name: gcsName,
          size: metadata.size,
          timeCreated: metadata.timeCreated
        });
        console.log(`[${new Date().toISOString()}] Deleted orphan: ${gcsName}`);
      }
    }

    // 4. Upload new/changed files
    for (const file of files) {
      const blob = bucket.file(file.fullPath);
      
      totalApiCalls++;
      const [exists] = await blob.exists();
      
      let needsUpload = false;
      let reason = '';

      if (!exists) {
        needsUpload = true;
        reason = 'New file';
      } else {
        totalApiCalls++;
        const [metadata] = await blob.getMetadata();
        const gcsUpdated = parseDate(metadata.updated);
        const driveModified = parseDate(file.modifiedTime);

        if (driveModified && gcsUpdated && driveModified > gcsUpdated) {
          needsUpload = true;
          reason = `Drive version newer (${file.modifiedTime} > ${metadata.updated})`;
        }
      }

      if (needsUpload) {
        const startTime = Date.now();
        
        totalApiCalls++;
        const media = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'stream' }
        );

        await new Promise((resolve, reject) => {
          media.data
            .pipe(blob.createWriteStream({
              resumable: false,
              metadata: { contentType: file.mimeType }
            }))
            .on('finish', async () => {
              try {
                totalApiCalls++;
                const [metadata] = await blob.getMetadata();
                uploadedFiles.push({
                  path: file.fullPath,
                  type: exists ? 'updated' : 'new',
                  size: metadata.size,
                  driveModified: file.modifiedTime,
                  durationMs: Date.now() - startTime,
                  reason
                });
                resolve();
              } catch (err) {
                reject(err);
              }
            })
            .on('error', reject);
        });

        console.log(`[${new Date().toISOString()}] ${exists ? 'Updated' : 'Uploaded'} ${file.fullPath}`);
      } else {
        skippedFiles++;
      }
    }

    // 5. Enhanced summary
    console.log('\nSync Summary:');
    uploadedFiles.forEach(file => {
      const symbol = file.type === 'new' ? '+' : '^';
      console.log(
        ` ${symbol} ${file.path} | ${formatBytes(file.size)} | ${file.durationMs}ms | ${file.reason}`
      );
    });

    deletedFiles.forEach(file => {
      console.log(` - ${file.name} | ${formatBytes(file.size)} | Created: ${file.timeCreated}`);
    });

    const totalRuntime = Date.now() - scriptStartTime;
    console.log(`\nAccounting Metrics:`);
    console.log(`⏱️  Total Runtime: ${(totalRuntime/1000).toFixed(2)} seconds`);
    console.log(`📊 Billable API Calls: ${totalApiCalls}`);
    console.log(`📦 Files Processed: ${files.length}`);
    console.log(`🗑️  Orphans Removed: ${deletedFiles.length}`);

    console.log(`\nTotal: +${uploadedFiles.filter(f => f.type === 'new').length} added, ` +
      `^${uploadedFiles.filter(f => f.type === 'updated').length} updated, ` +
      `-${deletedFiles.length} removed, ${skippedFiles} skipped`);
    
  } catch (error) {
    console.error('Sync failed:', error.message);
    process.exit(1);
  }
}

syncDriveToGCS();
