# Google Drive to GCS Sync

This Helm chart deploys a Camel K integration that provides an API for synchronizing files from Google Drive to Google Cloud Storage (GCS) using user-provided authentication tokens.

## Architecture

This chart uses Apache Camel K Kamelets to implement a flexible and efficient synchronization system:

1. **REST API Endpoint**: Exposes an HTTP POST endpoint that accepts synchronization requests
2. **User Authentication**: Uses user-provided OAuth tokens for Google Drive access
3. **Idempotent Processing**: Prevents concurrent sync operations for the same user
4. **File Filtering**: Supports filtering by file extension
5. **Custom Storage Paths**: Allows storing files in user-specific folders within the GCS bucket

## Configuration

### Basic Configuration

- **enabled**: Enable/disable the integration
- **googleCredentialsSecret**: Base64-encoded Google service account credentials with GCS access
- **gcsBucketName**: Name of the GCS bucket to store files
- **allowedFileExtensions**: Optional file extensions to filter (e.g., .pdf, .docx)

### API Configuration

- **endpoint.path**: Path for the API endpoint (default: "/sync/gdrive")
- **endpoint.port**: Port for the API service (default: 8080)

### Advanced Settings

- **idempotency.enabled**: Enable/disable idempotent processing
- **idempotency.repository**: Storage type for idempotency (memory or redis)
  - When set to 'redis', the addon will automatically use the shared Redis configuration from the Redis addon
- **idempotency.expiration**: Lock time in milliseconds (default: 600000 = 10 minutes)
- **camelK.replicas**: Number of integration instances to run

## Usage

Once deployed, you can trigger a sync operation by sending a POST request to the API endpoint:

```bash
curl -X POST \
  "http://<service-url>/sync/gdrive" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "123",
    "accessToken": "ya29.a0AfB_...",
    "refreshToken": "1//04u_...",
    "allowedExtensions": "pdf,docx,xlsx"
    # userFolder will be automatically set to "user-123"
  }'
```

Or with a custom folder name:

```bash
curl -X POST \
  "http://<service-url>/sync/gdrive" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "123",
    "accessToken": "ya29.a0AfB_...",
    "refreshToken": "1//04u_...",
    "allowedExtensions": "pdf,docx,xlsx",
    "userFolder": "custom-folder-structure/123"
  }'
```

### Request Parameters

- **userId**: (Required) Unique identifier for the user
- **accessToken**: (Required) Google Drive OAuth2 access token
- **refreshToken**: (Required) Google Drive OAuth2 refresh token
- **allowedExtensions**: (Optional) Comma-separated list of file extensions to filter
- **userFolder**: (Optional) User-specific folder within the GCS bucket - will be automatically derived as `user-{userId}` if not provided

## Implementation Details

### Kamelets

This integration uses custom Kamelets:

1. **user-gdrive-source**: Lists and retrieves files from Google Drive using user tokens
2. **user-gcs-sink**: Uploads files to GCS with user-specific paths

### Idempotent Processing

The integration uses Camel's idempotent consumer pattern to prevent concurrent syncs for the same user. When a request is received, the user ID is used as the idempotency key. If a sync is already in progress for that user, the request is rejected.

### Concurrency

Multiple users can sync simultaneously, but each user can only have one active sync at a time.

## Dependencies

- Apache Camel K operator must be installed in the cluster
- Google service account with GCS access
- (Optional) Redis addon if using redis idempotency repository
  - When Redis is selected as the idempotency repository, the addon will automatically use the Redis configuration from the shared ConfigMap (`shared-configmap-redis`) provided by the Redis addon
