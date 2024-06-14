function export_env_from_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    export $(cat "$env_file" | xargs)
    echo "Environment variables set from .env file."
  else
    echo "No $env_file file found!"
    exit 1
  fi
}
