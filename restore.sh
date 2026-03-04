#!/bin/bash

# Attendance Checker Database Restore Script
# Restores the database from a backup file

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_FILE="$SCRIPT_DIR/student-attendance.db"
BACKUP_DIR="$SCRIPT_DIR/backups"

echo "📋 Available backups:"
echo ""

# List all backup files with numbers
backups=($(ls -t "$BACKUP_DIR"/attendance_backup_*.db 2>/dev/null))

if [ ${#backups[@]} -eq 0 ]; then
    echo "❌ No backup files found in $BACKUP_DIR"
    exit 1
fi

for i in "${!backups[@]}"; do
    backup="${backups[$i]}"
    size=$(du -h "$backup" | cut -f1)
    timestamp=$(basename "$backup" | sed 's/attendance_backup_//;s/.db$//')

    # Format timestamp for display
    year=${timestamp:0:4}
    month=${timestamp:4:2}
    day=${timestamp:6:2}
    hour=${timestamp:9:2}
    min=${timestamp:11:2}
    sec=${timestamp:13:2}

    # Get record count from backup
    records=$(sqlite3 "$backup" "SELECT COUNT(*) FROM attendance;" 2>/dev/null || echo "unknown")

    echo "[$((i+1))] $year-$month-$day $hour:$min:$sec - $size - $records records"
done

echo ""
read -p "Enter backup number to restore (or 'q' to quit): " choice

if [ "$choice" = "q" ]; then
    echo "Cancelled."
    exit 0
fi

# Validate choice
if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt ${#backups[@]} ]; then
    echo "❌ Invalid choice!"
    exit 1
fi

selected_backup="${backups[$((choice-1))]}"

echo ""
echo "⚠️  WARNING: This will replace your current database!"
echo "   Current DB: $DB_FILE"
echo "   Restore from: $selected_backup"
echo ""

# Create a safety backup of current database
SAFETY_BACKUP="$BACKUP_DIR/pre_restore_backup_$(date +%Y%m%d_%H%M%S).db"
if [ -f "$DB_FILE" ]; then
    cp "$DB_FILE" "$SAFETY_BACKUP"
    echo "✅ Safety backup created: $SAFETY_BACKUP"
fi

read -p "Type 'YES' to confirm restore: " confirm

if [ "$confirm" != "YES" ]; then
    echo "Cancelled."
    exit 0
fi

# Perform restore
cp "$selected_backup" "$DB_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database restored successfully!"

    # Show record count
    records=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM attendance;")
    dates=$(sqlite3 "$DB_FILE" "SELECT COUNT(DISTINCT date) FROM attendance;")

    echo "   Total records: $records"
    echo "   Unique dates: $dates"
else
    echo "❌ Restore failed!"
    exit 1
fi
