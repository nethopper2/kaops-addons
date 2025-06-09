// camel-k: language=js
// camel-k: dependency=camel:google-drive
// camel-k: dependency=camel:google-storage
// camel-k: dependency=camel:jackson

const allowedExtensionsStr = '__ALLOWED_EXTENSIONS__';
const allowedExtensions = allowedExtensionsStr ?
  allowedExtensionsStr.split(',').map(ext => ext.trim()).filter(ext => ext.length > 0) :
  [];
const syncIntervalSeconds = __SYNC_INTERVAL_SECONDS__;
const gcsBucketName = '__GCS_BUCKET_NAME__';
const credentialsPath = '/etc/google-credentials/google-credentials.json';

// Configure the route to sync Google Drive files to GCS
from('timer:gdrivegcs?period=' + syncIntervalSeconds + 's')
  .routeId('gdrivegcs-sync')
  .log('Starting Google Drive to GCS sync')
  // Use a processor to list files from Google Drive
  .process(exchange => {
    const processor = () => {
      const camel = exchange.getContext();
      const googleDriveClient = camel.getComponent('google-drive');

      // Configure a Google Drive component with credentials
      googleDriveClient.getConfiguration().setServiceAccountKey(credentialsPath);
      googleDriveClient.getConfiguration().setApplicationName('gdrivegcs-sync');

      // List files from Google Drive including shared files
      const driveService = googleDriveClient.getClient();
      let files = [];

      try {
        // Query to get user's files and files shared with them
        const response = driveService.files().list({
          q: "trashed = false",
          fields: "files(id, name, mimeType, fileExtension, webContentLink)",
          includeItemsFromAllDrives: true,
          supportsAllDrives: true
        }).execute();

        files = response.getFiles();

        // Filter by allowed extensions (if specified)
        if (allowedExtensions.length > 0) {
          files = files.filter(file => {
            if (!file.getFileExtension()) return false;
            return allowedExtensions.includes(file.getFileExtension().toLowerCase());
          });
        }
        // If no extensions specified, sync ALL files

        exchange.getIn().setBody(files);
      } catch (e) {
        exchange.getIn().setBody([]);
        throw new Error('Error listing Google Drive files: ' + e);
      }
    };
    return processor();
  })
  // Split the list to process each file
  .split(body())
  // Download each file and upload to GCS
  .process(exchange => {
    const processor = () => {
      const file = exchange.getIn().getBody();
      const camel = exchange.getContext();
      const googleDriveClient = camel.getComponent('google-drive');

      try {
        // Configure Google Drive with credentials
        googleDriveClient.getConfiguration().setServiceAccountKey(credentialsPath);
        googleDriveClient.getConfiguration().setApplicationName('gdrivegcs-sync');

        // Download file content
        const driveService = googleDriveClient.getClient();
        const fileId = file.getId();
        const fileName = file.getName();

        // Get file content
        const content = driveService.files().get(fileId).executeMediaAsInputStream();

        // Set exchange headers for the GCS sink
        exchange.getIn().setHeader('CamelGoogleStorage.bucketName', gcsBucketName);
        exchange.getIn().setHeader('CamelGoogleStorage.objectName', fileName);
        exchange.getIn().setHeader('CamelGoogleStorage.serviceAccountKey', credentialsPath);
        exchange.getIn().setBody(content);

        exchange.getIn().setHeader('fileName', fileName);
      } catch (e) {
        throw new Error('Error processing file: ' + e);
      }
    };
    return processor();
  })
  // Upload to Google Cloud Storage
  .to('google-storage:' + gcsBucketName)
  .log('Uploaded ${header.fileName} to GCS bucket: ' + gcsBucketName)
  .end();
