#!/bin/bash

# Student Attendance Checker Database Backup Script
# Creates timestamped backups of the student attendance database

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_FILE="$SCRIPT_DIR/student-attendance.db"
BACKUP_DIR="$SCRIPT_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database exists
if [ ! -f "$DB_FILE" ]; then
    echo "❌ Error: Database file not found at $DB_FILE"
    exit 1
fi

echo "📦 Creating backup of attendance database..."

# Create SQLite database backup (binary copy)
DB_BACKUP="$BACKUP_DIR/attendance_backup_$TIMESTAMP.db"
cp "$DB_FILE" "$DB_BACKUP"

# Create SQL dump (text format - more portable)
SQL_BACKUP="$BACKUP_DIR/attendance_backup_$TIMESTAMP.sql"
sqlite3 "$DB_FILE" ".dump" > "$SQL_BACKUP"

# Verify backups were created
if [ -f "$DB_BACKUP" ] && [ -f "$SQL_BACKUP" ]; then
    DB_SIZE=$(du -h "$DB_BACKUP" | cut -f1)
    SQL_SIZE=$(du -h "$SQL_BACKUP" | cut -f1)

    echo "✅ Backup successful!"
    echo "   Database backup: $DB_BACKUP ($DB_SIZE)"
    echo "   SQL dump: $SQL_BACKUP ($SQL_SIZE)"

    # Show record count
    RECORD_COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM attendance;")
    echo "   Total records backed up: $RECORD_COUNT"

    # Keep only last 30 backups to save space
    echo ""
    echo "🧹 Cleaning up old backups (keeping last 30)..."
    cd "$BACKUP_DIR"
    ls -t attendance_backup_*.db | tail -n +31 | xargs -I {} rm -- {}
    ls -t attendance_backup_*.sql | tail -n +31 | xargs -I {} rm -- {}

    echo "✅ Backup complete!"
else
    echo "❌ Error: Backup failed!"
    exit 1
fi
