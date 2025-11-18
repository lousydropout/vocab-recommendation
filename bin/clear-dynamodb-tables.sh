#!/bin/bash

# Script to delete all rows from DynamoDB tables using AWS CLI
# Clears data from: Essays, Teachers, Students, Assignments tables
# Note: Metrics tables (ClassMetrics, StudentMetrics) were removed - metrics computed on-demand
# Usage: ./bin/clear-dynamodb-tables.sh [--region REGION] [--confirm]

set -e

# Default region
REGION="${AWS_REGION:-us-east-1}"

# Parse arguments
CONFIRM=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --region)
      REGION="$2"
      shift 2
      ;;
    --confirm)
      CONFIRM=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--region REGION] [--confirm]"
      exit 1
      ;;
  esac
done

# List of all DynamoDB tables
# Note: ClassMetrics and StudentMetrics tables were removed - metrics are computed on-demand from Essays table
TABLES=(
  "VincentVocabEssays"
  "VincentVocabTeachers"
  "VincentVocabStudents"
  "VincentVocabAssignments"
)

# Function to delete all items from a table
delete_table_items() {
  local table_name=$1
  local deleted_count=0
  
  echo "Processing table: $table_name"
  
  # Check if table exists
  if ! aws dynamodb describe-table --table-name "$table_name" --region "$REGION" >/dev/null 2>&1; then
    echo "  ⚠️  Warning: Table $table_name does not exist or no permissions"
    return
  fi
  
  # Get table key schema
  local key_schema=$(aws dynamodb describe-table \
    --table-name "$table_name" \
    --region "$REGION" \
    --query 'Table.KeySchema' \
    --output json)
  
  local partition_key=$(echo "$key_schema" | jq -r '.[] | select(.KeyType == "HASH") | .AttributeName' | head -1)
  local sort_key=$(echo "$key_schema" | jq -r '.[] | select(.KeyType == "RANGE") | .AttributeName' | head -1)
  
  # Scan table and delete items in batches
  local last_evaluated_key_file=""
  local batch_count=0
  local temp_dir=$(mktemp -d)
  
  while true; do
    # Build scan command
    local scan_cmd="aws dynamodb scan --table-name $table_name --region $REGION --output json"
    
    if [ -n "$last_evaluated_key_file" ] && [ -f "$last_evaluated_key_file" ]; then
      scan_cmd="$scan_cmd --exclusive-start-key file://$last_evaluated_key_file"
    fi
    
    # Execute scan
    local scan_output=$(eval $scan_cmd)
    local items=$(echo "$scan_output" | jq -c '.Items[]?' 2>/dev/null || echo "")
    
    # Check for pagination
    local has_more=$(echo "$scan_output" | jq -r 'has("LastEvaluatedKey")' 2>/dev/null || echo "false")
    local next_key_file=""
    
    if [ "$has_more" == "true" ]; then
      local next_key=$(echo "$scan_output" | jq -c '.LastEvaluatedKey' 2>/dev/null)
      if [ -n "$next_key" ] && [ "$next_key" != "null" ]; then
        next_key_file="$temp_dir/next_key_$$.json"
        echo "$next_key" > "$next_key_file"
      fi
    fi
    
    # Clean up previous key file
    if [ -n "$last_evaluated_key_file" ] && [ -f "$last_evaluated_key_file" ]; then
      rm -f "$last_evaluated_key_file"
    fi
    last_evaluated_key_file="$next_key_file"
    
    if [ -z "$items" ] || [ "$items" == "" ]; then
      break
    fi
    
    # Prepare batch delete requests (max 25 items per batch)
    local delete_requests=()
    local item_count=0
    
    while IFS= read -r item; do
      if [ -z "$item" ] || [ "$item" == "null" ]; then
        continue
      fi
      
      # Extract key attributes from item (DynamoDB format)
      local key_obj="{}"
      
      # Add partition key
      local pk_attr=$(echo "$item" | jq -c ".[\"$partition_key\"]")
      key_obj=$(echo "$key_obj" | jq -c ". + {\"$partition_key\": $pk_attr}")
      
      # Add sort key if exists
      if [ -n "$sort_key" ] && [ "$sort_key" != "null" ] && [ "$sort_key" != "" ]; then
        local sk_attr=$(echo "$item" | jq -c ".[\"$sort_key\"]")
        key_obj=$(echo "$key_obj" | jq -c ". + {\"$sort_key\": $sk_attr}")
      fi
      
      # Create delete request
      local delete_req=$(echo "{}" | jq -c ". + {\"DeleteRequest\": {\"Key\": $key_obj}}")
      delete_requests+=("$delete_req")
      item_count=$((item_count + 1))
      
      # Batch write supports max 25 items
      if [ $item_count -ge 25 ]; then
        # Build batch JSON
        local batch_array=$(printf '%s\n' "${delete_requests[@]}" | jq -s '.')
        local batch_json=$(echo "{}" | jq -c ". + {\"$table_name\": $batch_array}")
        
        # Execute batch delete
        local batch_file="$temp_dir/batch_$$.json"
        echo "$batch_json" > "$batch_file"
        aws dynamodb batch-write-item \
          --request-items "file://$batch_file" \
          --region "$REGION" \
          --output json > /dev/null 2>&1
        rm -f "$batch_file"
        
        deleted_count=$((deleted_count + item_count))
        batch_count=$((batch_count + 1))
        echo "  Deleted batch $batch_count: $item_count items (total: $deleted_count)"
        
        # Reset for next batch
        delete_requests=()
        item_count=0
      fi
    done <<< "$items"
    
    # Process remaining items in batch
    if [ $item_count -gt 0 ]; then
      local batch_array=$(printf '%s\n' "${delete_requests[@]}" | jq -s '.')
      local batch_json=$(echo "{}" | jq -c ". + {\"$table_name\": $batch_array}")
      
      local batch_file="$temp_dir/batch_$$.json"
      echo "$batch_json" > "$batch_file"
      aws dynamodb batch-write-item \
        --request-items "file://$batch_file" \
        --region "$REGION" \
        --output json > /dev/null 2>&1
      rm -f "$batch_file"
      
      deleted_count=$((deleted_count + item_count))
      batch_count=$((batch_count + 1))
      echo "  Deleted batch $batch_count: $item_count items (total: $deleted_count)"
    fi
    
    # Check if there are more items
    if [ "$has_more" != "true" ] || [ -z "$next_key_file" ]; then
      break
    fi
  done
  
  # Cleanup
  rm -rf "$temp_dir"
  
  if [ $deleted_count -eq 0 ]; then
    echo "  ✓ Table is empty"
  else
    echo "  ✓ Deleted $deleted_count items from $table_name"
  fi
}

# Main execution
echo "=========================================="
echo "DynamoDB Table Cleanup Script"
echo "=========================================="
echo "Region: $REGION"
echo "Tables to clear:"
for table in "${TABLES[@]}"; do
  echo "  - $table"
done
echo ""

if [ "$CONFIRM" != "true" ]; then
  echo "⚠️  WARNING: This will delete ALL data from the above tables!"
  echo ""
  read -p "Type 'yes' to confirm: " confirmation
  if [ "$confirmation" != "yes" ]; then
    echo "Aborted."
    exit 0
  fi
fi

echo ""
echo "Starting deletion..."
echo ""

# Delete items from each table
for table in "${TABLES[@]}"; do
  delete_table_items "$table"
  echo ""
done

echo "=========================================="
echo "✓ Cleanup complete!"
echo "=========================================="
