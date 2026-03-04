const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');
const {
  initializeDatabase,
  markAttendance,
  toggleStudentActiveStatus,
  saveClassAssignments,
  getClassAssignments,
  getAttendanceByDate,
  getAttendanceByDateRange,
  getAttendanceSummary,
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
  updateBillingTracking
} = require('./database');

const app = express();
const PORT = 3002;

// Notion setup
const NOTION_API_KEY = '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';
const STUDENT_DATABASE_ID = '1abd37d666308071bfe1e37d1d155035';
const TEACHER_DATABASE_ID = '1abd37d6663080ae9307ddbee22c48b1';

const notion = new Client({ auth: NOTION_API_KEY });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize database
initializeDatabase();

// Helper function to get today's date in YYYY-MM-DD format (timezone-safe)
function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to convert time string to 24-hour number for sorting
function timeToSortValue(timeString) {
  if (!timeString) return 9999; // Put empty times at the end

  const match = timeString.match(/(\d+)(am|pm)/i);
  if (!match) return 9999;

  let hour = parseInt(match[1]);
  const period = match[2].toLowerCase();

  if (period === 'pm' && hour !== 12) {
    hour += 12;
  } else if (period === 'am' && hour === 12) {
    hour = 0;
  }

  return hour;
}

// API Routes

// Get all active students from Notion
app.get('/api/students', async (req, res) => {
  try {
    const response = await notion.databases.query({
      database_id: STUDENT_DATABASE_ID,
      filter: {
        property: 'Status',
        select: {
          equals: 'Active'
        }
      }
    });

    const students = response.results.map(page => {
      const properties = page.properties;

      return {
        id: page.id,
        name: properties['Full Name']?.title?.[0]?.plain_text || 'Unknown',
        status: properties['Status']?.select?.name || 'Unknown',
        startTime: properties['Start Time']?.select?.name || '',
        endTime: properties['End Time']?.select?.name || ''
      };
    });

    // Sort by shift time (start time), then by name
    students.sort((a, b) => {
      const timeA = timeToSortValue(a.startTime);
      const timeB = timeToSortValue(b.startTime);

      if (timeA !== timeB) {
        return timeA - timeB;
      }

      // If same start time, sort by name
      return a.name.localeCompare(b.name);
    });

    res.json({ success: true, students });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all active teachers from Notion (for substitute assignments)
app.get('/api/teachers', async (req, res) => {
  try {
    const response = await notion.databases.query({
      database_id: TEACHER_DATABASE_ID,
      filter: {
        property: 'Status',
        select: {
          equals: 'Active'
        }
      },
      sorts: [
        {
          property: 'Full Name',
          direction: 'ascending'
        }
      ]
    });

    const teachers = response.results.map(page => {
      const properties = page.properties;
      return {
        id: page.id,
        name: properties['Full Name']?.title?.[0]?.plain_text || 'Unknown',
        startTime: properties['Start Time']?.select?.name || '',
        endTime: properties['End Time']?.select?.name || ''
      };
    });

    res.json({ success: true, teachers });
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit attendance for a specific date
app.post('/api/attendance', async (req, res) => {
  try {
    const { attendance, date } = req.body;
    const targetDate = date || getTodayDate();

    // Save each attendance record
    for (const record of attendance) {
      const result = markAttendance(
        record.studentId,
        record.studentName,
        targetDate,
        record.status,
        record.startTime,
        record.endTime,
        record.lateReason || null,
        record.absentReason || null,
        record.isActive !== undefined ? record.isActive : 1,
        record.minutesLate || null,
        record.hasUndertime || 0,
        record.undertimeMinutes || null,
        record.undertimeReason || null
      );

      // If absent and has class assignments, save them
      if (record.status === 'absent' && record.classAssignments && record.classAssignments.length > 0) {
        saveClassAssignments(result.id, record.classAssignments, 'regular');
      }

      // If late and has class assignments, save them
      if (record.status === 'late' && record.classAssignments && record.classAssignments.length > 0) {
        saveClassAssignments(result.id, record.classAssignments, 'regular');
      }

      // If has undertime class assignments, save them separately
      if (record.hasUndertime && record.undertimeClassAssignments && record.undertimeClassAssignments.length > 0) {
        saveClassAssignments(result.id, record.undertimeClassAssignments, 'undertime');
      }
    }

    res.json({ success: true, message: 'Attendance recorded successfully' });
  } catch (error) {
    console.error('Error saving attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete all attendance for a specific date
app.delete('/api/attendance/:date', (req, res) => {
  try {
    const { date } = req.params;
    const deletedCount = deleteAttendanceByDate(date);

    res.json({
      success: true,
      message: `Deleted ${deletedCount} attendance record(s) for ${date}`,
      deletedCount
    });
  } catch (error) {
    console.error('Error deleting attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete attendance for a specific student on a specific date
app.delete('/api/attendance/:date/:studentId', (req, res) => {
  try {
    const { date, studentId } = req.params;
    const deletedCount = deleteStudentAttendance(studentId, date);

    res.json({
      success: true,
      message: `Deleted attendance for student ${studentId} on ${date}`,
      deletedCount
    });
  } catch (error) {
    console.error('Error deleting student attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Toggle student active status for a specific date
app.patch('/api/attendance/:date/:studentId/active', (req, res) => {
  try {
    const { date, studentId } = req.params;
    const { isActive, studentName, startTime, endTime } = req.body;

    const updated = toggleStudentActiveStatus(
      studentId,
      studentName,
      date,
      isActive ? 1 : 0,
      startTime || '',
      endTime || ''
    );

    res.json({
      success: true,
      message: `Student ${studentName || studentId} ${isActive ? 'activated' : 'deactivated'} for ${date}`
    });
  } catch (error) {
    console.error('Error toggling student active status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get attendance history for a specific student (must be before /api/attendance/:date)
app.get('/api/attendance/history/:studentId', (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;
    const limit = parseInt(req.query.limit) || 500;
    const { db } = require('./database');

    let query = `SELECT * FROM attendance WHERE student_id = ?`;
    const params = [studentId];

    if (startDate) {
      query += ` AND date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND date <= ?`;
      params.push(endDate);
    }

    query += ` ORDER BY date DESC LIMIT ?`;
    params.push(limit);

    const stmt = db.prepare(query);
    const attendance = stmt.all(...params);

    // Add class assignments for absent records
    const attendanceWithAssignments = attendance.map(record => {
      let additionalData = {};
      if (record.status === 'absent') {
        const classAssignments = getClassAssignments(record.id);
        additionalData.classAssignments = classAssignments;
      }
      return { ...record, ...additionalData };
    });

    res.json({ success: true, attendance: attendanceWithAssignments });
  } catch (error) {
    console.error('Error fetching student history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get attendance for a specific date
app.get('/api/attendance/:date', (req, res) => {
  try {
    const { date } = req.params;
    const attendance = getAttendanceByDate(date);

    // Add class assignments for absent/late students and undertime assignments
    const attendanceWithAssignments = attendance.map(record => {
      let additionalData = {};

      if (record.status === 'absent' || record.status === 'late') {
        additionalData.classAssignments = getClassAssignments(record.id, 'regular');
      }

      if (record.has_undertime === 1) {
        additionalData.undertimeClassAssignments = getClassAssignments(record.id, 'undertime');
      }

      return { ...record, ...additionalData };
    });

    res.json({ success: true, attendance: attendanceWithAssignments });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get attendance details for a specific student on a specific date
app.get('/api/attendance/student/:studentId', (req, res) => {
  try {
    const { studentId } = req.params;
    const date = req.query.date || getTodayDate();
    const { db } = require('./database');

    const stmt = db.prepare(`
      SELECT * FROM attendance WHERE student_id = ? AND date = ?
    `);
    const attendance = stmt.get(studentId, date);

    if (!attendance) {
      return res.json({ success: true, attendance: null });
    }

    // Get class assignments if absent or late
    let classAssignments = [];
    if (attendance.status === 'absent' || attendance.status === 'late') {
      classAssignments = getClassAssignments(attendance.id, 'regular');
    }

    // Get undertime class assignments
    let undertimeClassAssignments = [];
    if (attendance.has_undertime === 1) {
      undertimeClassAssignments = getClassAssignments(attendance.id, 'undertime');
    }

    res.json({
      success: true,
      attendance: {
        ...attendance,
        classAssignments,
        undertimeClassAssignments
      }
    });
  } catch (error) {
    console.error('Error fetching student attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get today's attendance
app.get('/api/attendance/today', (req, res) => {
  try {
    const date = getTodayDate();
    const attendance = getAttendanceByDate(date);
    res.json({ success: true, date, attendance });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all dates that have attendance data
app.get('/api/attendance-dates', (req, res) => {
  try {
    const dates = getAllDatesWithData();
    res.json({ success: true, dates });
  } catch (error) {
    console.error('Error fetching attendance dates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get attendance report for date range
app.get('/api/reports/range', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const attendance = getAttendanceByDateRange(startDate, endDate);
    const summary = getAttendanceSummary(startDate, endDate);

    // Add class assignments for absent/late records and undertime assignments
    const attendanceWithAssignments = attendance.map(record => {
      let additionalData = {};

      if (record.status === 'absent' || record.status === 'late') {
        additionalData.classAssignments = getClassAssignments(record.id, 'regular');
      }

      if (record.has_undertime === 1) {
        additionalData.undertimeClassAssignments = getClassAssignments(record.id, 'undertime');
      }

      return { ...record, ...additionalData };
    });

    res.json({ success: true, attendance: attendanceWithAssignments, summary });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export attendance to CSV
app.get('/api/export/csv', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const attendance = getAttendanceByDateRange(startDate, endDate);

    // Create CSV content
    const headers = ['Date', 'Student Name', 'Status', 'Start Time', 'End Time', 'Late Reason', 'Minutes Late', 'Absent Reason', 'Has Undertime', 'Undertime Minutes', 'Undertime Reason', 'Timestamp'];
    const csvRows = [headers.join(',')];

    attendance.forEach(record => {
      const row = [
        record.date,
        `"${record.student_name}"`,
        record.status,
        record.start_time || '',
        record.end_time || '',
        `"${record.late_reason || ''}"`,
        record.minutes_late || '',
        `"${record.absent_reason || ''}"`,
        record.has_undertime || 0,
        record.undertime_minutes || '',
        `"${record.undertime_reason || ''}"`,
        record.timestamp
      ];
      csvRows.push(row.join(','));
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="student_attendance_${startDate}_to_${endDate}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== BILLING TRACKER API ROUTES ====================

// Helper: Calculate estimated end date (excluding weekends and holidays)
// Calculates: startDate + cycleTarget business days, accounting for absences
function calculateEstimatedEndDate(startDate, cycleTarget, absences, holidays = []) {
  if (cycleTarget <= 0) return null;

  const holidaySet = new Set(holidays);

  // Parse start date
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  let currentDate = new Date(startYear, startMonth - 1, startDay);
  let count = 0;

  // Total business days needed = cycleTarget + absences
  const totalDaysNeeded = cycleTarget + absences;

  // Count business days from start date
  while (count < totalDaysNeeded) {
    const dayOfWeek = currentDate.getDay();
    // Format date in local timezone
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Skip weekends (0 = Sunday, 6 = Saturday) and holidays
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateStr)) {
      count++;
    }

    if (count < totalDaysNeeded) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // Format as YYYY-MM-DD
  const endYear = currentDate.getFullYear();
  const endMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
  const endDay = String(currentDate.getDate()).padStart(2, '0');
  return `${endYear}-${endMonth}-${endDay}`;
}

// Helper: Count business days between two dates (inclusive)
function countBusinessDaysBetween(startDate, endDate, holidays = []) {
  const holidaySet = new Set(holidays);
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

  let currentDate = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);
  let count = 0;

  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateStr)) {
      count++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return count;
}

// Get all students being tracked for billing with their progress
app.get('/api/billing/tracking', (req, res) => {
  try {
    const trackedStudents = getAllBillingTracking();
    const { db, getAllHolidays } = require('./database');

    // Get ALL holidays (past and future) for accurate calculations
    // Past holidays are needed for businessDaysElapsed, future holidays for estimatedEndDate
    const holidays = getAllHolidays().map(h => h.date);
    const todayStr = getTodayDate();

    // Calculate progress for each student
    const studentsWithProgress = trackedStudents.map(student => {
      const daysCount = countAttendanceDays(student.student_id, student.start_date);

      // Calculate target based on carry-over
      // REDUCE: Still complete 20 days, but charge for fewer days
      // EXTEND: Complete more than 20 days, charge for 20 days
      const carriedDays = student.carried_days || 0;
      const carryType = student.carry_type;
      let cycleTarget = 20;
      let chargeForDays = 20;

      if (carryType === 'reduce' && carriedDays > 0) {
        // REDUCE: Cycle stays 20, but charge for fewer days
        cycleTarget = 20;
        chargeForDays = 20 - carriedDays;
      } else if (carryType === 'extend' && carriedDays > 0) {
        // EXTEND: Cycle extended, charge for 20 days
        cycleTarget = 20 + carriedDays;
        chargeForDays = 20;
      }

      const daysToNextCharge = Math.max(0, cycleTarget - daysCount);
      const isDue = daysCount >= cycleTarget;
      const isApproaching = daysCount >= (cycleTarget - 5) && daysCount < cycleTarget;

      // Get the date when they hit target days (if they have)
      let cycleEndDate = null;
      if (isDue) {
        cycleEndDate = getAttendanceDateAtCount(student.student_id, student.start_date, cycleTarget);
      }

      // Get last attendance date for early charges (when not yet at target)
      let lastAttendanceDate = null;
      if (daysCount > 0) {
        const lastDateStmt = db.prepare(`
          SELECT date FROM attendance
          WHERE student_id = ?
          AND date >= ?
          AND (status = 'present' OR status = 'late')
          AND is_active = 1
          ORDER BY date DESC
          LIMIT 1
        `);
        const lastDateResult = lastDateStmt.get(student.student_id, student.start_date);
        lastAttendanceDate = lastDateResult ? lastDateResult.date : null;
      }

      // Calculate estimated end date
      // Logic: startDate + cycleTarget + absences (in business days)
      // Absences = business days elapsed since start - days attended
      let estimatedEndDate = null;
      let absences = 0;
      if (!isDue) {
        const businessDaysElapsed = countBusinessDaysBetween(student.start_date, todayStr, holidays);
        absences = Math.max(0, businessDaysElapsed - daysCount);
        estimatedEndDate = calculateEstimatedEndDate(student.start_date, cycleTarget, absences, holidays);
      }

      return {
        ...student,
        daysCount,
        cycleTarget,
        chargeForDays,
        carriedDays,
        carryType,
        daysToNextCharge,
        isDue,
        isApproaching,
        cycleEndDate,
        lastAttendanceDate,
        estimatedEndDate
      };
    });

    // Sort: due first, then approaching, then by days count desc
    studentsWithProgress.sort((a, b) => {
      if (a.isDue && !b.isDue) return -1;
      if (!a.isDue && b.isDue) return 1;
      if (a.isApproaching && !b.isApproaching) return -1;
      if (!a.isApproaching && b.isApproaching) return 1;
      return b.daysCount - a.daysCount;
    });

    res.json({ success: true, students: studentsWithProgress });
  } catch (error) {
    console.error('Error fetching billing tracking:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add student to billing tracking
app.post('/api/billing/tracking', (req, res) => {
  try {
    const { studentId, studentName, startDate } = req.body;

    if (!studentId || !studentName || !startDate) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    addStudentToBilling(studentId, studentName, startDate);
    res.json({ success: true, message: 'Student added to billing tracking' });
  } catch (error) {
    console.error('Error adding student to billing:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update student's start date
app.patch('/api/billing/tracking/:studentId', (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, carriedDays, carryType } = req.body;

    if (!startDate) {
      return res.status(400).json({ success: false, error: 'Start date is required' });
    }

    updateBillingTracking(studentId, startDate, carriedDays, carryType);
    res.json({ success: true, message: 'Billing settings updated' });
  } catch (error) {
    console.error('Error updating billing settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove student from billing tracking
app.delete('/api/billing/tracking/:studentId', (req, res) => {
  try {
    const { studentId } = req.params;
    removeStudentFromBilling(studentId);
    res.json({ success: true, message: 'Student removed from billing tracking' });
  } catch (error) {
    console.error('Error removing student from billing:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark student as charged
app.post('/api/billing/charge', (req, res) => {
  try {
    const { studentId, studentName, cycleNumber, daysCount, cycleStartDate, cycleEndDate, tuitionAmount, currency, attendanceDates, absencesInPeriod, carriedToNext, carryType } = req.body;

    if (!studentId || !cycleStartDate || !cycleEndDate) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = markStudentCharged(studentId, studentName, cycleNumber, daysCount, cycleStartDate, cycleEndDate, tuitionAmount, currency, attendanceDates, absencesInPeriod || 0, carriedToNext || 0, carryType || null);
    res.json({ success: true, message: 'Student charged successfully', newStartDate: result.newStartDate });
  } catch (error) {
    console.error('Error marking student as charged:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get absences count for a student in a date range
app.get('/api/billing/absences/:studentId', (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate) {
      return res.status(400).json({ success: false, error: 'Start date is required' });
    }

    const { db } = require('./database');

    // Count absences in the date range
    let query = `
      SELECT COUNT(*) as count FROM attendance
      WHERE student_id = ?
      AND date >= ?
      AND status = 'absent'
      AND is_active = 1
    `;
    const params = [studentId, startDate];

    if (endDate) {
      query += ` AND date <= ?`;
      params.push(endDate);
    }

    const stmt = db.prepare(query);
    const result = stmt.get(...params);

    // Also get the absence dates
    let datesQuery = `
      SELECT date FROM attendance
      WHERE student_id = ?
      AND date >= ?
      AND status = 'absent'
      AND is_active = 1
    `;
    if (endDate) {
      datesQuery += ` AND date <= ?`;
    }
    datesQuery += ` ORDER BY date ASC`;

    const datesStmt = db.prepare(datesQuery);
    const datesResult = datesStmt.all(...params);
    const absenceDates = datesResult.map(r => r.date);

    res.json({ success: true, count: result.count, dates: absenceDates });
  } catch (error) {
    console.error('Error fetching absences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single billing history record
app.get('/api/billing/history/:id', (req, res) => {
  try {
    const { id } = req.params;
    const record = getBillingHistoryById(parseInt(id));

    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    // Parse attendance_dates JSON if it exists
    if (record.attendance_dates) {
      record.attendance_dates = JSON.parse(record.attendance_dates);
    }

    res.json({ success: true, record });
  } catch (error) {
    console.error('Error fetching billing history record:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update payment status
app.patch('/api/billing/history/:id/payment', (req, res) => {
  try {
    const { id } = req.params;
    const { status, paidDate } = req.body;

    if (!status || !['paid', 'unpaid'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Must be "paid" or "unpaid"' });
    }

    updatePaymentStatus(parseInt(id), status, paidDate);
    res.json({ success: true, message: `Payment status updated to ${status}` });
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete billing history record
app.delete('/api/billing/history/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { db } = require('./database');

    const stmt = db.prepare('DELETE FROM billing_history WHERE id = ?');
    const result = stmt.run(parseInt(id));

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Error deleting billing history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get billing history
app.get('/api/billing/history', (req, res) => {
  try {
    const { studentId, limit } = req.query;
    const history = getBillingHistory(studentId || null, parseInt(limit) || 50);
    res.json({ success: true, history });
  } catch (error) {
    console.error('Error fetching billing history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get attendance dates for a student (for billing slip)
app.get('/api/billing/attendance-dates/:studentId', (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, limit } = req.query;
    const { db } = require('./database');

    if (!startDate) {
      return res.status(400).json({ success: false, error: 'Start date is required' });
    }

    // Get attendance records for this student from start date
    const stmt = db.prepare(`
      SELECT date FROM attendance
      WHERE student_id = ?
      AND date >= ?
      AND (status = 'present' OR status = 'late')
      AND is_active = 1
      ORDER BY date ASC
      LIMIT ?
    `);

    const records = stmt.all(studentId, startDate, parseInt(limit) || 20);
    const dates = records.map(r => r.date);

    res.json({ success: true, dates });
  } catch (error) {
    console.error('Error fetching attendance dates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== HOLIDAY API ROUTES ====================

// Get all holidays
app.get('/api/billing/holidays', (req, res) => {
  try {
    const { getAllHolidays } = require('./database');
    const holidays = getAllHolidays();
    res.json({ success: true, holidays });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a holiday
app.post('/api/billing/holidays', (req, res) => {
  try {
    const { date, description } = req.body;

    if (!date) {
      return res.status(400).json({ success: false, error: 'Date is required' });
    }

    const { addHoliday } = require('./database');
    addHoliday(date, description || '');
    res.json({ success: true, message: 'Holiday added successfully' });
  } catch (error) {
    console.error('Error adding holiday:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a holiday
app.delete('/api/billing/holidays/:date', (req, res) => {
  try {
    const { date } = req.params;
    const { removeHoliday } = require('./database');
    removeHoliday(date);
    res.json({ success: true, message: 'Holiday removed successfully' });
  } catch (error) {
    console.error('Error removing holiday:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Student Attendance Checker running on http://localhost:${PORT}`);
  console.log(`Server is accessible from other devices on your network`);
  console.log(`Connected to Notion database: ${STUDENT_DATABASE_ID}`);
});
