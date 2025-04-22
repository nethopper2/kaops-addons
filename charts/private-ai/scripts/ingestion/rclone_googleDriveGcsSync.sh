#!/bin/bash

# ┌───────────────────────────────────────────────────────────────┐
# │                     Google Drive to GCS Sync                  │
# │                  with Dependency, Env Checks, &               │
# |                     OS-Aware Base64 Handling                  │
# └───────────────────────────────────────────────────────────────┘

#  
# TODO : 
# This script appears to write text files to the target GCS bucket in 
# the form of "perm_test_<timestamp>.txt". It is not clear what the 
# purpose of this file is, but it's not being deleted at the end of the
# script, or should be avoided altogether.
#
# Also, to get this script to run, I had to change the Google Drive
# permissions from "Viewer" to "Editor" for the service account email.
# This not acceptable and must be changed. The service account should
# only have "Viewer" permissions to the Google Drive folder.
#

# ─── Dependency Checks ───────────────────────────────────────────

detect_os() {
  case "$(uname -s)" in
    Linux*)  os=Linux ;;
    Darwin*) os=macOS ;;
    CYGWIN*) os=Cygwin ;;
    MINGW*)  os=MinGw ;;
    *)       os="Unknown" ;;
  esac
  echo "$os"
}

get_install_cmd() {
  local os=$1
  case "$os" in
    Linux)
      if command -v apt-get &> /dev/null; then
        echo "sudo apt-get install"
      elif command -v yum &> /dev/null; then
        echo "sudo yum install"
      elif command -v dnf &> /dev/null; then
        echo "sudo dnf install"
      elif command -v pacman &> /dev/null; then
        echo "sudo pacman -Sy"
      elif command -v zypper &> /dev/null; then
        echo "sudo zypper install"
      else
        echo "sudo apt-get install"
      fi
      ;;
    macOS)
      if command -v brew &> /dev/null; then
        echo "brew install"
      else
        echo "brew install (install Homebrew first from https://brew.sh)"
      fi
      ;;
    *)
      echo "Please install"
      ;;
  esac
}

check_dependencies() {
  local missing=()
  local os=$(detect_os)
  local install_cmd=$(get_install_cmd "$os")

  if ! command -v rclone &> /dev/null; then
    case "$os" in
      Linux)  missing+=("rclone (Install: curl https://rclone.org/install.sh | sudo bash)") ;;
      macOS)  missing+=("rclone (Install: brew install rclone)") ;;
      *)      missing+=("rclone (See https://rclone.org/install/)") ;;
    esac
  fi

  if ! command -v jq &> /dev/null; then
    case "$os" in
      Linux)  missing+=("jq (Install: $install_cmd jq)") ;;
      macOS)  missing+=("jq (Install: $install_cmd jq)") ;;
      *)      missing+=("jq (See https://stedolan.github.io/jq/download/)") ;;
    esac
  fi

  if ! command -v base64 &> /dev/null; then
    case "$os" in
      Linux)  missing+=("coreutils (Install: $install_cmd coreutils)") ;;
      macOS)  missing+=("base64 (Should be pre-installed)") ;;
      *)      missing+=("base64 (Use system package manager)") ;;
    esac
  fi

  if [ ${#missing[@]} -ne 0 ]; then
    echo -e "\n❌ Missing dependencies:"
    for dep in "${missing[@]}"; do
      echo "  - $dep"
    done
    
    echo -e "\n🔧 Quick Fix Options:"
    case "$os" in
      Linux)
        echo "  For Debian/Ubuntu: sudo apt-get install -y jq"
        echo "  For RHEL/CentOS: sudo yum install -y jq"
        ;;
      macOS)
        echo "  Ensure Homebrew is installed, then run:"
        echo "  brew install jq rclone"
        ;;
    esac
    exit 1
  fi
}

# ─── Environment Validation ───────────────────────────────────────

validate_env_vars() {
  local missing=()
  
  declare -a required_vars=(
    DRIVE_FOLDER_ID
    GCS_BUCKET_NAME
    GOOGLE_APPLICATION_CREDENTIALS_BASE64
  )

  # Check variable existence
  for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
      missing+=("$var")
    fi
  done

  if [ ${#missing[@]} -ne 0 ]; then
    echo -e "\n❌ Missing required environment variables:"
    for var in "${missing[@]}"; do
      echo "  - $var"
    done
    
    echo -e "\n🔧 Fix: Set these variables before execution:"
    echo "  export DRIVE_FOLDER_ID='your-drive-folder-id'"
    echo "  export GCS_BUCKET_NAME='your-bucket-name'"
    echo "  export GOOGLE_APPLICATION_CREDENTIALS_BASE64='$(echo -n '{"type":"service_account"}' | base64)'"
    exit 1
  fi

  # Base64 format validation (OS-agnostic)
  if ! (echo "$GOOGLE_APPLICATION_CREDENTIALS_BASE64" | base64 --decode >/dev/null 2>&1 || 
        echo "$GOOGLE_APPLICATION_CREDENTIALS_BASE64" | base64 -D >/dev/null 2>&1); then
    echo -e "\n❌ Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64: Not valid base64"
    echo "🔧 Possible causes:"
    echo "   - Line breaks in variable (use 'tr -d '\n'')"
    echo "   - Special characters not escaped"
    echo "🔧 Regenerate with:"
    echo "   Linux: base64 --wrap=0 service-account.json"
    echo "   macOS: base64 -i service-account.json | tr -d '\n'"
    echo "   Universal: openssl base64 -A -in service-account.json"
    exit 1
  fi
}

# ─── Credential Conversion Section ─────────────────────────────────

convert_credentials() {
  echo "🔐 Converting credentials..."
  mkdir -p ./config
  
  # Decode with OS-specific fallbacks
  if ! echo "$GOOGLE_APPLICATION_CREDENTIALS_BASE64" | base64 --decode > ./config/service-account.json 2>/dev/null; then
    if ! echo "$GOOGLE_APPLICATION_CREDENTIALS_BASE64" | base64 -D > ./config/service-account.json 2>/dev/null; then
      echo -e "\n❌ Critical: Base64 decoding failed on all methods"
      echo "🔧 Possible causes:"
      echo "   - Hidden whitespace/newlines in variable"
      echo "   - Special characters not URL-safe encoded"
      echo "   - Corrupted credentials during copy/paste"
      echo "🔧 Verify with:"
      echo "   echo \"\$GOOGLE_APPLICATION_CREDENTIALS_BASE64\" | head -c50"
      echo "🔧 Regenerate using:"
      echo "   Linux: base64 --wrap=0 service-account.json"
      echo "   macOS: base64 -i service-account.json | tr -d '\n'"
      exit 1
    fi
  fi

  # JSON structure validation
  if ! jq -e . ./config/service-account.json >/dev/null 2>&1; then
    echo -e "\n❌ Decoded credentials contain invalid JSON"
    echo "First 100 characters (with hidden chars):"
    head -c100 ./config/service-account.json | cat -vet
    echo -e "\n🔧 Possible causes:"
    echo "   - File corruption during encoding"
    echo "   - Non-JSON content mistakenly encoded"
    echo "   - Partial credential file used"
    echo "🔧 Fix:"
    echo "   1. Redownload from Google Cloud Console"
    echo "   2. Verify with: jq . service-account.json"
    exit 1
  fi

  # Field validation
  declare -a required_fields=(
    "type"
    "project_id"
    "private_key"
    "client_email"
  )

  for field in "${required_fields[@]}"; do
    if ! jq -e "has(\"$field\")" ./config/service-account.json >/dev/null; then
      echo -e "\n❌ Missing required field: $field"
      echo "🔧 Possible causes:"
      echo "   - Wrong credential type (use JSON key)"
      echo "   - Google Cloud API error during generation"
      echo "   - Manual modification of the JSON file"
      echo "🔧 Fix: Regenerate credentials in Cloud Console"
      exit 1
    fi
  done

  if ! jq -e '.type == "service_account"' ./config/service-account.json >/dev/null; then
    echo -e "\n❌ Invalid type: $(jq -r .type ./config/service-account.json)"
    echo "🔧 Possible causes:"
    echo "   - Using OAuth client ID instead of service account"
    echo "   - Credentials generated for wrong auth type"
    echo "🔧 Required: service_account"
    exit 1
  fi

  echo "✅ Credentials validated successfully"
}

# ─── Rclone Configuration ────────────────────────────────────────

configure_rclone_remotes() {
  echo "🔧 Configuring Rclone remotes..."
  
  # Create config directory if missing
  mkdir -p "$HOME/.config/rclone"
  
  # Generate Google Drive config
  cat > "$HOME/.config/rclone/rclone.conf" <<EOF
[gdrive_env]
type = drive
scope = drive
service_account_file = $(pwd)/config/service-account.json
root_folder_id = $DRIVE_FOLDER_ID

[gcs_env]
type = google cloud storage
service_account_file = $(pwd)/config/service-account.json
bucket_policy_only = true
EOF
}

validate_rclone_config() {
  echo "🔍 Validating Rclone configuration..."
  
  # 1. Config file existence check
  if [ ! -f "$HOME/.config/rclone/rclone.conf" ]; then
    echo "❌ Rclone config file missing at $HOME/.config/rclone/rclone.conf"
    exit 1
  fi

  # 2. Remote section verification
  if ! rclone config show gdrive_env &>/dev/null; then
    echo "❌ gdrive_env remote missing"
    echo "🔧 Verify config contains:"
    echo "   [gdrive_env]"
    echo "   type = drive"
    echo "   scope = drive"
    echo "   service_account_file = ./config/service-account.json"
    exit 1
  fi

  if ! rclone config show gcs_env &>/dev/null; then
    echo "❌ gcs_env remote missing"
    echo "🔧 Verify config contains:"
    echo "   [gcs_env]"
    echo "   type = google cloud storage"
    echo "   service_account_file = ./config/service-account.json"
    exit 1
  fi

  # 3. Service account path verification
  local sa_path=$(rclone config show gdrive_env | awk -F' = ' '/service_account_file/{print $2}')
  if [ ! -f "$sa_path" ]; then
    echo "❌ Service account file not found at $sa_path"
    echo "🔧 Verify convert_credentials() created the file"
    exit 1
  fi

  # 4. Folder ID verification (new)
  local config_folder_id=$(rclone config show gdrive_env | awk -F' = ' '/root_folder_id/{print $2}')
  if [ -z "$config_folder_id" ]; then
    echo "❌ root_folder_id missing in gdrive_env config"
    exit 1
  fi

  if [ "$config_folder_id" != "$DRIVE_FOLDER_ID" ]; then
    echo "❌ Config folder ID mismatch"
    echo "   Config: $config_folder_id"
    echo "   Env Var: $DRIVE_FOLDER_ID"
    exit 1
  fi

  # 5. Basic operation test (new)
  if ! rclone lsf gdrive_env:/ --max-depth 1 &>/dev/null; then
    echo "❌ Failed to list Drive contents"
    echo "🔧 Possible causes:"
    echo "   - Service account lacks Drive API access"
    echo "   - Folder $DRIVE_FOLDER_ID not shared with SA"
    echo "   - Drive API not enabled in Google Cloud"
    exit 1
  fi

  # 6. GCS bucket existence check (new)
  if ! rclone lsf gcs_env:"$GCS_BUCKET_NAME" --max-depth 0 &>/dev/null; then
    echo "❌ GCS bucket $GCS_BUCKET_NAME not accessible"
    echo "🔧 Verify:"
    echo "   - Bucket exists"
    echo "   - Service account has Storage Admin role"
    exit 1
  fi
}

# Permission checks
check_drive_permissions() {
  echo "🔑 Verifying Drive permissions..."
  
  local sa_email=$(jq -r .client_email ./config/service-account.json)
  echo "Service Account Email: $sa_email"
  
  # Test file operations
  local test_file="perm_test_$(date +%s).txt"
  echo "test" > "$test_file"

  if ! rclone copy "$test_file" gdrive_env:/; then
    echo -e "\n❌ Critical: Folder $DRIVE_FOLDER_ID not shared with"
    echo "   $sa_email"
    echo "🔧 Required actions:"
    echo "   1. Open folder in Drive"
    echo "      https://console.cloud.google.com/apis/library/drive.googleapis.com"
    echo "   2. Share → Add $sa_email as Editor"
    echo "   3. Wait 5 minutes for permissions to propagate"
    exit 1
  fi

  rclone deletefile "gdrive_env:/$test_file" 2>/dev/null
  rm "$test_file"
}

verify_service_account() {
  local sa_email=$(jq -r .client_email ./config/service-account.json)
  
  echo "🔑 Service Account Email: $sa_email"
  echo "   ➔ Share your Drive folder ($DRIVE_FOLDER_ID) with this email"
  echo "   ➔ Required permission: Editor"
  
  # Test access
  if ! rclone lsf gdrive_env:/ &>/dev/null; then
    echo "❌ Folder not shared with service account or Drive API disabled"
    exit 1
  fi
}


# ─── Main Script ──────────────────────────────────────────────────

# Load environment variables
source .env 2>/dev/null


# Clear previous logs
true > sync.log

# Start timing for setup processes
SETUP_START=$(date +%s)

# Validate system dependencies and environment variables
check_dependencies
validate_env_vars
convert_credentials
configure_rclone_remotes
validate_rclone_config
check_drive_permissions

# Configure rclone remotes
configure_rclone drive gdrive_env
configure_rclone gcs gcs_env

# Execute Sync
echo "========================================"
echo "🚀 Starting Google Drive → GCS Sync"
echo "----------------------------------------"
echo "Source:          Google Drive Folder ID: $DRIVE_FOLDER_ID"
echo "Destination:     GCS Bucket: $GCS_BUCKET_NAME"
echo "Service Account: $(jq -r .client_email ./config/service-account.json)"
echo "========================================"
echo "Starting recursive sync..."

# Calculate setup time
SETUP_END=$(date +%s)
SETUP_TIME=$((SETUP_END - SETUP_START))

# Start sync timing
SYNC_START=$(date +%s)

rclone sync gdrive_env: gcs_env:"$GCS_BUCKET_NAME" \
  --drive-root-folder-id "$DRIVE_FOLDER_ID" \
  --fast-list \
  --progress \
  --stats-one-line \
  --stats 5s \
  --use-server-modtime \
  --checksum \
  --delete-during \
  --drive-chunk-size=64M \
  --transfers=8 \
  --checkers=16 \
  --retries=10 \
  --log-format 'time="%(asctime)s" level=%(levelname)s msg="%(message)"' \
  --stats-file-name-length 0 \
  --log-file sync.log \
  --log-level INFO \
  --stats-log-level NOTICE || {
    echo "❌ Sync failed - check sync.log for details"
    exit 1
  }

# Calculate sync time
SYNC_END=$(date +%s)
SYNC_TIME=$((SYNC_END - SYNC_START))

# Generate report
echo -e "\nSync Summary"
echo "============"
echo "- New files copied:   $(grep -c 'Copied (new)' sync.log)"
echo "- Replaced existing:  $(grep -c 'Copied (replaced existing)' sync.log)"
echo "- Orphans removed:    $(grep -c 'Deleted' sync.log)"

# Accounting Metrics Section
echo -e "\nAccounting Metrics"
echo "=================="
echo "- Setup time:          ${SETUP_TIME} seconds"
echo "- Sync time:           ${SYNC_TIME} seconds"
echo "- Total runtime:       $((SETUP_TIME + SYNC_TIME)) seconds"
printf -- "- %-30s %5d %s\n" \
  "Total files transferred:" "$(grep -c 'Copied' sync.log)" "files" \
  "Total billable Google APIs:" "$(grep -E 'Copied|Deleted' sync.log | wc -l)" "operations"

# File Action Details Section
echo -e "\nFile action details"
echo "==================="
if grep -qE 'INFO.*: (Copied|Deleted)' sync.log; then
    grep 'INFO.*: Copied' sync.log | awk -F': ' '{
        filename = $2
        action = ($3 ~ /replaced existing/) ? "REPLACED" : "COPIED"
        printf "%-8s %s\n", action ":", filename
    }'
    grep 'INFO.*: Deleted' sync.log | awk -F': ' '{printf "%-8s %s\n", "DELETED:", $2}'
else
    echo "none"
fi
echo -e "\n"

# Cleanup
rm -f ./config/service-account.json

exit 0
