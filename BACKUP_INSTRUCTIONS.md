# Attendance Checker - Backup & Restore Instructions

## 📦 Your Data is Safe!

**Current Status:**
- ✅ 61 attendance records in database
- ✅ 4 backups created (as of setup)
- ✅ Automatic backup system ready

---

## Quick Commands

### Create a Backup (Manual)
```bash
cd /Users/icanacademy/attendance-checker
./backup.sh
```

### Restore from Backup
```bash
cd /Users/icanacademy/attendance-checker
./restore.sh
```

---

## Backup System Details

### Where are backups stored?
`/Users/icanacademy/attendance-checker/backups/`

### What gets backed up?
- **Database file** (`.db`) - Binary copy of the full database
- **SQL dump** (`.sql`) - Text version that can be opened/imported anywhere

### How long are backups kept?
- Last **30 backups** are kept automatically
- Older backups are deleted to save disk space

### Backup file naming
- Format: `attendance_backup_YYYYMMDD_HHMMSS.db`
- Example: `attendance_backup_20251021_104713.db`

---

## Recovery Scenarios

### Scenario 1: Accidental Data Deletion
If you accidentally delete attendance data:

1. Run restore script: `./restore.sh`
2. Choose the most recent backup
3. Confirm restoration
4. Your data is back!

### Scenario 2: Restore Specific Date
If you need data from a specific time:

1. Look at backup timestamps in `/backups/` folder
2. Run `./restore.sh`
3. Choose backup from that time period

### Scenario 3: Database Corruption
If the database becomes corrupted:

1. Run `./restore.sh`
2. Select most recent working backup
3. If `.db` file doesn't work, use the `.sql` file:
   ```bash
   cd /Users/icanacademy/attendance-checker
   mv attendance.db attendance.db.corrupted
   sqlite3 attendance.db < backups/attendance_backup_TIMESTAMP.sql
   ```

---

## Best Practices

### When to Create Manual Backups
- ✅ Before importing new data from Notion
- ✅ Before clearing data for a date
- ✅ At end of each week
- ✅ Before making bulk changes

### Automatic Backup (Future Enhancement)
You can set up automatic daily backups using cron:

1. Open terminal
2. Type: `crontab -e`
3. Add this line:
   ```
   0 2 * * * /Users/icanacademy/attendance-checker/backup.sh >> /Users/icanacademy/attendance-checker/backup.log 2>&1
   ```
   (This runs backup at 2 AM every day)

---

## What Happened to Your Previous Backups?

If you created backups manually (copy-paste files), they might have been:
- Saved to Desktop (check `/Users/icanacademy/Desktop`)
- Saved to Downloads (check `/Users/icanacademy/Downloads`)
- Accidentally deleted
- In Trash (but access denied - need to check Finder)

### To Find Old Backups:
```bash
# Search entire home directory
find /Users/icanacademy -name "*attendance*backup*" -o -name "*attendance*.db*" 2>/dev/null

# Search Downloads
ls -lah ~/Downloads/ | grep attendance

# Search Desktop
ls -lah ~/Desktop/ | grep attendance
```

---

## Additional Protection

### Cloud Backup Options
Consider backing up to:
- **iCloud Drive**: Copy backups folder to iCloud
- **Google Drive**: Upload weekly backups
- **Dropbox**: Sync backups folder

### Time Machine
Your Mac's Time Machine should also have copies if enabled.
To check: System Settings → General → Time Machine

---

## Questions?

- Check backup status: `ls -lah backups/`
- Check current data: `sqlite3 attendance.db "SELECT COUNT(*) FROM attendance;"`
- View backup contents: `sqlite3 backups/FILENAME.db "SELECT * FROM attendance LIMIT 5;"`

**Remember:** Always create a backup before major changes!
