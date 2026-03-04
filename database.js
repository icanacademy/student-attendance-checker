const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'student-attendance.db'));

// Initialize database schema
function initializeDatabase() {
  // Create attendance table
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_name TEXT NOT NULL,
      student_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      late_reason TEXT,
      absent_reason TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, date)
    )
  `);

  // Create class assignments table for substitute teachers
  db.exec(`
    CREATE TABLE IF NOT EXISTS class_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendance_id INTEGER NOT NULL,
      class_slot TEXT NOT NULL,
      no_class INTEGER DEFAULT 0,
      online_class INTEGER DEFAULT 0,
      substitute_teacher_id TEXT,
      substitute_teacher_name TEXT,
      students TEXT,
      FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE
    )
  `);

  // Add no_class column if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE class_assignments ADD COLUMN no_class INTEGER DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add online_class column if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE class_assignments ADD COLUMN online_class INTEGER DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Migrate existing attendance table to add late_reason and absent_reason columns
  try {
    db.exec(`ALTER TABLE attendance ADD COLUMN late_reason TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec(`ALTER TABLE attendance ADD COLUMN absent_reason TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add is_active column (1 = active, 0 = deactivated/not applicable)
  try {
    db.exec(`ALTER TABLE attendance ADD COLUMN is_active INTEGER DEFAULT 1`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add minutes_late column to track how many minutes late
  try {
    db.exec(`ALTER TABLE attendance ADD COLUMN minutes_late INTEGER`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add undertime columns
  try {
    db.exec(`ALTER TABLE attendance ADD COLUMN has_undertime INTEGER DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec(`ALTER TABLE attendance ADD COLUMN undertime_minutes INTEGER`);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec(`ALTER TABLE attendance ADD COLUMN undertime_reason TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add assignment_type column to class_assignments to distinguish between late/absent and undertime
  try {
    db.exec(`ALTER TABLE class_assignments ADD COLUMN assignment_type TEXT DEFAULT 'regular'`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Create billing_tracking table for 20-day billing cycle tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL UNIQUE,
      student_name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      cycle_number INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create billing_history table for charge records
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      cycle_number INTEGER NOT NULL,
      days_counted INTEGER NOT NULL,
      charged_date TEXT NOT NULL,
      cycle_start_date TEXT NOT NULL,
      cycle_end_date TEXT NOT NULL,
      tuition_amount REAL,
      currency TEXT DEFAULT '₱',
      attendance_dates TEXT,
      payment_status TEXT DEFAULT 'unpaid',
      paid_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add new columns to existing billing_history table if they don't exist
  try {
    db.exec(`ALTER TABLE billing_history ADD COLUMN tuition_amount REAL`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE billing_history ADD COLUMN currency TEXT DEFAULT '₱'`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE billing_history ADD COLUMN attendance_dates TEXT`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE billing_history ADD COLUMN payment_status TEXT DEFAULT 'unpaid'`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE billing_history ADD COLUMN paid_date TEXT`);
  } catch (e) { /* Column already exists */ }

  // Add carry-over columns to billing_tracking
  try {
    db.exec(`ALTER TABLE billing_tracking ADD COLUMN carried_days INTEGER DEFAULT 0`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE billing_tracking ADD COLUMN carry_type TEXT DEFAULT NULL`);
  } catch (e) { /* Column already exists */ }

  // Add carry-over columns to billing_history
  try {
    db.exec(`ALTER TABLE billing_history ADD COLUMN absences_in_period INTEGER DEFAULT 0`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE billing_history ADD COLUMN carried_to_next INTEGER DEFAULT 0`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE billing_history ADD COLUMN carry_type_applied TEXT DEFAULT NULL`);
  } catch (e) { /* Column already exists */ }

  // Create billing_holidays table for non-working days
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Database initialized successfully');
}

// Mark attendance
function markAttendance(studentId, studentName, date, status, startTime, endTime, lateReason = null, absentReason = null, isActive = 1, minutesLate = null, hasUndertime = 0, undertimeMinutes = null, undertimeReason = null) {
  const stmt = db.prepare(`
    INSERT INTO attendance (student_id, student_name, date, status, start_time, end_time, late_reason, absent_reason, is_active, minutes_late, has_undertime, undertime_minutes, undertime_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_id, date) DO UPDATE SET
      status = excluded.status,
      late_reason = excluded.late_reason,
      absent_reason = excluded.absent_reason,
      is_active = excluded.is_active,
      minutes_late = excluded.minutes_late,
      has_undertime = excluded.has_undertime,
      undertime_minutes = excluded.undertime_minutes,
      undertime_reason = excluded.undertime_reason,
      timestamp = CURRENT_TIMESTAMP
  `);

  stmt.run(studentId, studentName, date, status, startTime, endTime, lateReason, absentReason, isActive, minutesLate, hasUndertime, undertimeMinutes, undertimeReason);

  // Get the actual ID of the record (whether inserted or updated)
  const getIdStmt = db.prepare(`
    SELECT id FROM attendance WHERE student_id = ? AND date = ?
  `);

  const record = getIdStmt.get(studentId, date);
  return { id: record.id };
}

// Toggle student active status for a specific date
function toggleStudentActiveStatus(studentId, studentName, date, isActive, startTime = '', endTime = '') {
  try {
    const stmt = db.prepare(`
      INSERT INTO attendance (student_id, student_name, date, status, start_time, end_time, is_active)
      VALUES (?, ?, ?, 'unmarked', ?, ?, ?)
      ON CONFLICT(student_id, date) DO UPDATE SET
        is_active = excluded.is_active
    `);

    stmt.run(studentId, studentName, date, startTime, endTime, isActive);
    return true;
  } catch (error) {
    console.error('Error toggling student active status:', error);
    throw error;
  }
}

// Save class assignments for absent/late student or undertime
function saveClassAssignments(attendanceId, classAssignments, assignmentType = 'regular') {
  // Delete existing assignments of this type only
  const deleteStmt = db.prepare(`DELETE FROM class_assignments WHERE attendance_id = ? AND assignment_type = ?`);
  deleteStmt.run(attendanceId, assignmentType);

  // Insert new assignments
  const insertStmt = db.prepare(`
    INSERT INTO class_assignments (attendance_id, class_slot, no_class, online_class, substitute_teacher_id, substitute_teacher_name, students, assignment_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const assignment of classAssignments) {
    insertStmt.run(
      attendanceId,
      assignment.classSlot,
      assignment.noClass ? 1 : 0,
      assignment.onlineClass ? 1 : 0,
      assignment.substituteTeacherId,
      assignment.substituteTeacherName,
      JSON.stringify(assignment.students || []),
      assignmentType
    );
  }
}

// Get class assignments for an attendance record
function getClassAssignments(attendanceId, assignmentType = null) {
  let stmt;
  let assignments;

  if (assignmentType) {
    stmt = db.prepare(`
      SELECT * FROM class_assignments WHERE attendance_id = ? AND assignment_type = ?
    `);
    assignments = stmt.all(attendanceId, assignmentType);
  } else {
    stmt = db.prepare(`
      SELECT * FROM class_assignments WHERE attendance_id = ?
    `);
    assignments = stmt.all(attendanceId);
  }

  return assignments.map(a => ({
    ...a,
    noClass: a.no_class === 1,
    onlineClass: a.online_class === 1,
    students: JSON.parse(a.students || '[]')
  }));
}

// Get attendance for a specific date
function getAttendanceByDate(date) {
  const stmt = db.prepare(`
    SELECT * FROM attendance WHERE date = ? ORDER BY student_name
  `);

  return stmt.all(date);
}

// Get attendance for date range
function getAttendanceByDateRange(startDate, endDate) {
  const stmt = db.prepare(`
    SELECT * FROM attendance
    WHERE date BETWEEN ? AND ?
    ORDER BY date DESC, student_name
  `);

  return stmt.all(startDate, endDate);
}

// Get summary statistics
function getAttendanceSummary(startDate, endDate) {
  const stmt = db.prepare(`
    SELECT
      date,
      COUNT(*) as total_students,
      SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_count,
      SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late_count,
      SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count
    FROM attendance
    WHERE date BETWEEN ? AND ?
    GROUP BY date
    ORDER BY date DESC
  `);

  return stmt.all(startDate, endDate);
}

// Get student attendance history
function getStudentHistory(studentId, limit = 30) {
  const stmt = db.prepare(`
    SELECT * FROM attendance
    WHERE student_id = ?
    ORDER BY date DESC
    LIMIT ?
  `);

  return stmt.all(studentId, limit);
}

// Delete all attendance records for a specific date
function deleteAttendanceByDate(date) {
  const stmt = db.prepare(`
    DELETE FROM attendance WHERE date = ?
  `);

  const result = stmt.run(date);
  return result.changes; // Returns number of deleted records
}

// Delete attendance for a specific student on a specific date
function deleteStudentAttendance(studentId, date) {
  const stmt = db.prepare(`
    DELETE FROM attendance WHERE student_id = ? AND date = ?
  `);

  const result = stmt.run(studentId, date);
  return result.changes; // Returns number of deleted records
}

// Get all unique dates that have attendance data
function getAllDatesWithData() {
  const stmt = db.prepare(`
    SELECT DISTINCT date FROM attendance ORDER BY date DESC
  `);

  return stmt.all().map(row => row.date);
}

// ==================== BILLING TRACKING FUNCTIONS ====================

// Add student to billing tracking
function addStudentToBilling(studentId, studentName, startDate) {
  const stmt = db.prepare(`
    INSERT INTO billing_tracking (student_id, student_name, start_date, cycle_number, is_active)
    VALUES (?, ?, ?, 1, 1)
    ON CONFLICT(student_id) DO UPDATE SET
      start_date = excluded.start_date,
      is_active = 1
  `);

  stmt.run(studentId, studentName, startDate);
  return { success: true };
}

// Get all students being tracked for billing
function getAllBillingTracking() {
  const stmt = db.prepare(`
    SELECT * FROM billing_tracking WHERE is_active = 1 ORDER BY student_name
  `);
  return stmt.all();
}

// Get billing tracking for a specific student
function getBillingTrackingByStudent(studentId) {
  const stmt = db.prepare(`
    SELECT * FROM billing_tracking WHERE student_id = ? AND is_active = 1
  `);
  return stmt.get(studentId);
}

// Count attendance days (present + late) for a student from a start date
function countAttendanceDays(studentId, startDate) {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM attendance
    WHERE student_id = ?
    AND date >= ?
    AND (status = 'present' OR status = 'late')
    AND is_active = 1
  `);
  const result = stmt.get(studentId, startDate);
  return result ? result.count : 0;
}

// Get the date when student reached their Nth attendance day
function getAttendanceDateAtCount(studentId, startDate, targetCount) {
  const stmt = db.prepare(`
    SELECT date FROM attendance
    WHERE student_id = ?
    AND date >= ?
    AND (status = 'present' OR status = 'late')
    AND is_active = 1
    ORDER BY date ASC
    LIMIT 1 OFFSET ?
  `);
  const result = stmt.get(studentId, startDate, targetCount - 1);
  return result ? result.date : null;
}

// Helper function to add days to a date string (timezone-safe)
function addDaysToDateString(dateStr, days) {
  // Parse the date string (YYYY-MM-DD) directly to avoid timezone issues
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day); // month is 0-indexed
  date.setDate(date.getDate() + days);

  // Format back to YYYY-MM-DD
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, '0');
  const newDay = String(date.getDate()).padStart(2, '0');
  return `${newYear}-${newMonth}-${newDay}`;
}

// Get today's date in local timezone (YYYY-MM-DD)
function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Mark student as charged and start new cycle
function markStudentCharged(studentId, studentName, cycleNumber, daysCount, cycleStartDate, cycleEndDate, tuitionAmount = null, currency = '₱', attendanceDates = null, absencesInPeriod = 0, carriedToNext = 0, carryType = null) {
  const chargedDate = getLocalDateString();

  // Add to billing history
  const insertHistory = db.prepare(`
    INSERT INTO billing_history (student_id, student_name, cycle_number, days_counted, charged_date, cycle_start_date, cycle_end_date, tuition_amount, currency, attendance_dates, payment_status, absences_in_period, carried_to_next, carry_type_applied)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?)
  `);
  const attendanceDatesJson = attendanceDates ? JSON.stringify(attendanceDates) : null;
  insertHistory.run(studentId, studentName, cycleNumber, daysCount, chargedDate, cycleStartDate, cycleEndDate, tuitionAmount, currency, attendanceDatesJson, absencesInPeriod, carriedToNext, carryType);

  // Update billing tracking - new cycle starts from the day after cycle_end_date
  const newStartDateStr = addDaysToDateString(cycleEndDate, 1);

  const updateTracking = db.prepare(`
    UPDATE billing_tracking
    SET start_date = ?, cycle_number = cycle_number + 1, carried_days = ?, carry_type = ?
    WHERE student_id = ?
  `);
  updateTracking.run(newStartDateStr, carriedToNext, carryType, studentId);

  return { success: true, newStartDate: newStartDateStr };
}

// Update payment status
function updatePaymentStatus(historyId, status, customPaidDate = null) {
  // Use custom paid date if provided, otherwise use today for 'paid' status
  const paidDate = status === 'paid' ? (customPaidDate || getLocalDateString()) : null;
  const stmt = db.prepare(`
    UPDATE billing_history SET payment_status = ?, paid_date = ? WHERE id = ?
  `);
  stmt.run(status, paidDate, historyId);
  return { success: true };
}

// Get single billing history record
function getBillingHistoryById(historyId) {
  const stmt = db.prepare(`SELECT * FROM billing_history WHERE id = ?`);
  return stmt.get(historyId);
}

// Get billing history for all students or a specific student
function getBillingHistory(studentId = null, limit = 50) {
  let stmt;
  if (studentId) {
    stmt = db.prepare(`
      SELECT * FROM billing_history
      WHERE student_id = ?
      ORDER BY charged_date DESC, id DESC
      LIMIT ?
    `);
    return stmt.all(studentId, limit);
  } else {
    stmt = db.prepare(`
      SELECT * FROM billing_history
      ORDER BY charged_date DESC, id DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }
}

// Remove student from billing tracking (soft delete)
function removeStudentFromBilling(studentId) {
  const stmt = db.prepare(`
    UPDATE billing_tracking SET is_active = 0 WHERE student_id = ?
  `);
  stmt.run(studentId);
  return { success: true };
}

// Update student's start date (for manual adjustments)
function updateBillingStartDate(studentId, newStartDate) {
  const stmt = db.prepare(`
    UPDATE billing_tracking SET start_date = ? WHERE student_id = ?
  `);
  stmt.run(newStartDate, studentId);
  return { success: true };
}

// Update billing tracking with start date and carried days
function updateBillingTracking(studentId, newStartDate, carriedDays = 0, carryType = null) {
  const stmt = db.prepare(`
    UPDATE billing_tracking
    SET start_date = ?, carried_days = ?, carry_type = ?
    WHERE student_id = ?
  `);
  stmt.run(newStartDate, carriedDays || 0, carryType, studentId);
  return { success: true };
}

// ==================== HOLIDAY MANAGEMENT FUNCTIONS ====================

// Add a holiday
function addHoliday(date, description = '') {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO billing_holidays (date, description)
    VALUES (?, ?)
  `);
  stmt.run(date, description);
  return { success: true };
}

// Remove a holiday
function removeHoliday(date) {
  const stmt = db.prepare(`DELETE FROM billing_holidays WHERE date = ?`);
  stmt.run(date);
  return { success: true };
}

// Get all holidays
function getAllHolidays() {
  const stmt = db.prepare(`SELECT * FROM billing_holidays ORDER BY date ASC`);
  return stmt.all();
}

// Get holidays in a date range
function getHolidaysInRange(startDate, endDate) {
  const stmt = db.prepare(`
    SELECT date FROM billing_holidays
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC
  `);
  return stmt.all(startDate, endDate).map(h => h.date);
}

// Check if a date is a holiday
function isHoliday(date) {
  const stmt = db.prepare(`SELECT 1 FROM billing_holidays WHERE date = ?`);
  return stmt.get(date) !== undefined;
}

module.exports = {
  initializeDatabase,
  markAttendance,
  toggleStudentActiveStatus,
  saveClassAssignments,
  getClassAssignments,
  getAttendanceByDate,
  getAttendanceByDateRange,
  getAttendanceSummary,
  getStudentHistory,
  deleteAttendanceByDate,
  deleteStudentAttendance,
  getAllDatesWithData,
  // Billing functions
  addStudentToBilling,
  getAllBillingTracking,
  getBillingTrackingByStudent,
  countAttendanceDays,
  getAttendanceDateAtCount,
  markStudentCharged,
  getBillingHistory,
  getBillingHistoryById,
  updatePaymentStatus,
  removeStudentFromBilling,
  updateBillingStartDate,
  updateBillingTracking,
  // Holiday functions
  addHoliday,
  removeHoliday,
  getAllHolidays,
  getHolidaysInRange,
  isHoliday,
  db
};
