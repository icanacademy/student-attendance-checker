// Use dynamic API URL so it works from other computers on the network and Cloudflare
const isProxied = window.location.hostname.includes('icanacademy.work') || window.location.hostname.includes('ngrok');
const API_URL = isProxied
  ? `${window.location.protocol}//${window.location.hostname}/api`
  : `${window.location.protocol}//${window.location.hostname}:3002/api`;

let students = [];
let teachers = []; // For substitute assignments when students are absent
let attendanceData = {};
let selectedDate = null;
let fullDailyReportData = null;
let currentReportDate = null;
let datesWithData = [];
let flatpickrInstance = null;
let individualRecordsData = null;
let currentIndividualStudent = null;

// Helper function to get local date in YYYY-MM-DD format (timezone-safe)
function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to get the selected date (used by modal-handler.js)
function getSelectedDate() {
  return selectedDate;
}

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  initializeDateDisplays();
  initializeTabs();
  initializeEventListeners();
  initializeModals();
  await fetchDatesWithData();
  initializeDateNavigation();
});

// Fetch all dates that have attendance data
async function fetchDatesWithData() {
  try {
    const response = await fetch(`${API_URL}/attendance-dates`);
    const data = await response.json();
    if (data.success) {
      datesWithData = data.dates;
      console.log('📅 Dates with attendance data:', datesWithData);
    }
  } catch (error) {
    console.error('Error fetching dates with data:', error);
    datesWithData = [];
  }
}

// Refresh the calendar to update date indicators
async function refreshCalendarDates() {
  await fetchDatesWithData();
  if (flatpickrInstance) {
    // Destroy and recreate the instance to properly refresh dots
    const currentDate = selectedDate;
    flatpickrInstance.destroy();

    flatpickrInstance = flatpickr('#selectedDate', {
      defaultDate: currentDate,
      dateFormat: 'Y-m-d',
      onDayCreate: function(dObj, dStr, fp, dayElem) {
        // Fix timezone issue - use local date formatting instead of UTC
        const date = dayElem.dateObj;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        if (datesWithData.includes(dateStr)) {
          // Add a dot indicator to dates with data
          dayElem.innerHTML += '<span class="flatpickr-day-dot"></span>';
          console.log('✅ Adding dot to:', dateStr);
        }
      },
      onChange: function(selectedDates, dateStr, instance) {
        selectedDate = dateStr;
        updateDateContext();
        checkAndLoadExistingData();
        syncReportDate();
      }
    });
  }
}

// Initialize date displays
function initializeDateDisplays() {
  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  document.getElementById('currentDate').textContent = dateString;
  document.getElementById('footerYear').textContent = today.getFullYear();

  // Set default dates for reports (using local timezone)
  const todayISO = getLocalDateString(today);
  document.getElementById('reportDate').value = todayISO;
  document.getElementById('overviewEndDate').value = todayISO;

  // Set start date to 7 days ago
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  document.getElementById('overviewStartDate').value = getLocalDateString(weekAgo);
}

// Initialize tabs
function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');

      // Remove active class from all
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      // Add active class to clicked
      button.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');

      // Auto-load daily report when switching to reports tab
      if (tabName === 'reports' && selectedDate) {
        const reportDate = document.getElementById('reportDate');
        if (reportDate && reportDate.value === selectedDate) {
          // Silently refresh the report if it's for the same date
          refreshDailyReportSilently();
        }
      }
    });
  });
}

// Initialize date navigation
function initializeDateNavigation() {
  const today = new Date();
  const todayISO = getLocalDateString(today);

  // Set default date to today
  selectedDate = todayISO;

  // Initialize Flatpickr
  flatpickrInstance = flatpickr('#selectedDate', {
    defaultDate: todayISO,
    dateFormat: 'Y-m-d',
    onDayCreate: function(dObj, dStr, fp, dayElem) {
      // Fix timezone issue - use local date formatting instead of UTC
      const date = dayElem.dateObj;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      if (datesWithData.includes(dateStr)) {
        // Add a dot indicator to dates with data
        dayElem.innerHTML += '<span class="flatpickr-day-dot"></span>';
        console.log('✅ Adding dot to:', dateStr);
      }
    },
    onChange: function(selectedDates, dateStr, instance) {
      selectedDate = dateStr;
      updateDateContext();
      checkAndLoadExistingData();
      syncReportDate();
    }
  });

  // Update date context and try to load existing data
  updateDateContext();
  checkAndLoadExistingData();
  syncReportDate();

  // Add event listeners for prev/next buttons
  document.getElementById('prevDayBtn').addEventListener('click', () => {
    const current = new Date(selectedDate + 'T00:00:00');
    current.setDate(current.getDate() - 1);
    const newDate = getLocalDateString(current);
    flatpickrInstance.setDate(newDate);
    selectedDate = newDate;
    updateDateContext();
    checkAndLoadExistingData();
    syncReportDate();
  });

  document.getElementById('nextDayBtn').addEventListener('click', () => {
    const current = new Date(selectedDate + 'T00:00:00');
    current.setDate(current.getDate() + 1);
    const newDate = getLocalDateString(current);
    flatpickrInstance.setDate(newDate);
    selectedDate = newDate;
    updateDateContext();
    checkAndLoadExistingData();
    syncReportDate();
  });
}

// Check if attendance data exists for the selected date and load it
async function checkAndLoadExistingData() {
  const teachersList = document.getElementById('teachersList');

  try {
    const response = await fetch(`${API_URL}/attendance/${selectedDate}`);
    const data = await response.json();

    if (data.success && data.attendance && data.attendance.length > 0) {
      // Data exists - load students and populate with existing attendance
      teachersList.innerHTML = '<div class="loading">Loading saved attendance data...</div>';
      await loadStudentsWithExistingData(data.attendance);
    } else {
      // No data exists, show import message
      teachersList.innerHTML = '<div class="info-text">No attendance data for this date. Click "Import from Notion" to load students.</div>';
      students = [];
      attendanceData = {};
    }
  } catch (error) {
    console.error('Error checking existing data:', error);
    teachersList.innerHTML = '<div class="info-text">Click "Import from Notion" to load students for this date</div>';
    students = [];
    attendanceData = {};
  }
}

// Load students with existing attendance data
async function loadStudentsWithExistingData(existingAttendance) {
  const teachersList = document.getElementById('teachersList');

  try {
    // Fetch both students and teachers from Notion
    const [studentsResponse, teachersResponse] = await Promise.all([
      fetch(`${API_URL}/students`),
      fetch(`${API_URL}/teachers`)
    ]);

    const studentsData = await studentsResponse.json();
    const teachersData = await teachersResponse.json();

    if (studentsData.success && teachersData.success) {
      students = studentsData.students;
      teachers = teachersData.teachers;
      attendanceData = {};

      // Load the existing attendance data with all details
      existingAttendance.forEach(record => {
        attendanceData[record.student_id] = {
          studentId: record.student_id,
          studentName: record.student_name,
          startTime: record.start_time,
          endTime: record.end_time,
          status: record.status,
          lateReason: record.late_reason || null,
          absentReason: record.absent_reason || null,
          classAssignments: record.classAssignments || [],
          is_active: record.is_active
        };
      });

      renderTeachersList();
    } else {
      throw new Error(studentsData.error || teachersData.error);
    }
  } catch (error) {
    console.error('Error loading students with existing data:', error);
    teachersList.innerHTML = `<div class="error-message">Error loading students: ${error.message}</div>`;
  }
}

// Update date context message
function updateDateContext() {
  const dateContextEl = document.getElementById('dateContext');
  const selectedDateObj = new Date(selectedDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dateString = selectedDateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  if (selectedDateObj.getTime() === today.getTime()) {
    dateContextEl.textContent = `Viewing Today's Attendance (${dateString})`;
  } else if (selectedDateObj < today) {
    dateContextEl.textContent = `Viewing Past Attendance (${dateString})`;
  } else {
    dateContextEl.textContent = `Viewing Future Date (${dateString})`;
  }
}

// Sync report date with selected attendance date
function syncReportDate() {
  if (selectedDate) {
    document.getElementById('reportDate').value = selectedDate;
  }
}

// Initialize event listeners
function initializeEventListeners() {
  document.getElementById('loadStudentsBtn').addEventListener('click', loadStudents);
  document.getElementById('clearDataBtn').addEventListener('click', clearData);
  document.getElementById('submitAttendanceBtn').addEventListener('click', submitAttendance);
  document.getElementById('loadDailyReportBtn').addEventListener('click', loadDailyReport);
  document.getElementById('loadOverviewBtn').addEventListener('click', loadOverview);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
  document.getElementById('downloadReportBtn').addEventListener('click', downloadDailyReportAsImage);
  document.getElementById('downloadAnalyticsBtn').addEventListener('click', downloadAnalytics);

  // Individual Records tab event listeners
  document.getElementById('loadIndividualRecordsBtn').addEventListener('click', loadIndividualRecords);
  document.getElementById('downloadIndividualRecordsBtn').addEventListener('click', downloadIndividualRecordsAsImage);

  // Load students for dropdown when Individual tab is clicked
  document.querySelector('[data-tab="individual"]').addEventListener('click', loadStudentsForDropdown);

  // Status filter checkboxes
  document.getElementById('filterAll').addEventListener('change', handleFilterAllChange);
  document.getElementById('filterPresent').addEventListener('change', handleStatusFilterChange);
  document.getElementById('filterLate').addEventListener('change', handleStatusFilterChange);
  document.getElementById('filterAbsent').addEventListener('change', handleStatusFilterChange);

  // Shift filter checkboxes
  document.getElementById('filterAllShifts').addEventListener('change', handleFilterAllShiftsChange);
  // Add event listeners for all shift checkboxes
  ['8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm'].forEach(shift => {
    const checkbox = document.getElementById(`filterShift${shift}`);
    if (checkbox) {
      checkbox.addEventListener('change', handleShiftFilterChange);
    }
  });
}

// Load students from Notion
async function loadStudents() {
  if (!selectedDate) {
    alert('Please select a date first');
    return;
  }

  const teachersList = document.getElementById('teachersList');

  try {
    // First, check if attendance data already exists for this date
    const checkResponse = await fetch(`${API_URL}/attendance/${selectedDate}`);
    const checkData = await checkResponse.json();

    if (checkData.success && checkData.attendance && checkData.attendance.length > 0) {
      // Data exists - show warning
      const existingCount = checkData.attendance.length;
      const confirmMessage = `⚠️ WARNING: Attendance data already exists for this date!\n\n` +
        `Found ${existingCount} existing attendance record(s) for ${selectedDate}.\n\n` +
        `Importing from Notion will DELETE all existing attendance data for this date, including:\n` +
        `• All attendance records (Present/Late/Absent)\n` +
        `• All late/absent reasons\n` +
        `• All class assignments and substitute coverage\n\n` +
        `This action CANNOT be undone.\n\n` +
        `Do you want to continue and DELETE the existing data?`;

      const userConfirmed = confirm(confirmMessage);

      if (!userConfirmed) {
        // User cancelled - don't proceed
        teachersList.innerHTML = '<div class="info-text">Import cancelled. Existing data preserved.</div>';
        return;
      }

      // User confirmed - delete existing data
      teachersList.innerHTML = '<div class="loading">Deleting existing data...</div>';

      const deleteResponse = await fetch(`${API_URL}/attendance/${selectedDate}`, {
        method: 'DELETE'
      });

      const deleteData = await deleteResponse.json();

      if (!deleteData.success) {
        throw new Error('Failed to delete existing data: ' + deleteData.error);
      }

      console.log(`Deleted ${deleteData.deletedCount} existing record(s)`);
    }

    // Proceed with loading students from Notion
    teachersList.innerHTML = '<div class="loading">Loading students from Notion...</div>';

    // Fetch both students and teachers (teachers for substitute assignments)
    const [studentsResponse, teachersResponse] = await Promise.all([
      fetch(`${API_URL}/students`),
      fetch(`${API_URL}/teachers`)
    ]);

    const studentsData = await studentsResponse.json();
    const teachersData = await teachersResponse.json();

    if (studentsData.success && teachersData.success) {
      students = studentsData.students;
      teachers = teachersData.teachers;
      attendanceData = {};
      // Don't load existing attendance - start with a blank slate
      renderTeachersList();

      // Refresh calendar date indicators (in case we deleted data)
      refreshCalendarDates();
    } else {
      throw new Error(studentsData.error || teachersData.error);
    }
  } catch (error) {
    console.error('Error loading students:', error);
    teachersList.innerHTML = `<div class="error-message">Error loading students: ${error.message}</div>`;
  }
}

// Clear all data for the current date (both UI and database)
async function clearData() {
  if (!selectedDate) {
    alert('Please select a date first');
    return;
  }

  if (students.length === 0) {
    alert('No students loaded. Please import from Notion first.');
    return;
  }

  // First check if there's any saved data for this date
  try {
    const checkResponse = await fetch(`${API_URL}/attendance/${selectedDate}`);
    const checkData = await checkResponse.json();

    const hasSavedData = checkData.success && checkData.attendance && checkData.attendance.length > 0;
    const savedCount = hasSavedData ? checkData.attendance.length : 0;

    let confirmMessage;
    if (hasSavedData) {
      confirmMessage = `⚠️ WARNING: This will permanently delete all attendance data for ${selectedDate}!\n\n` +
        `Found ${savedCount} saved attendance record(s) including:\n` +
        `• All attendance records (Present/Late/Absent)\n` +
        `• All late/absent reasons\n` +
        `• All class assignments and substitute coverage\n\n` +
        `This action CANNOT be undone.\n\n` +
        `Do you want to continue and DELETE all data for this date?`;
    } else {
      confirmMessage = `Are you sure you want to clear all checkmarks?\n\n` +
        `This will uncheck all boxes on the screen.\n` +
        `(No saved data found in the database for this date)`;
    }

    const confirmation = confirm(confirmMessage);

    if (!confirmation) {
      return;
    }

    // Delete from database if there's saved data
    if (hasSavedData) {
      const deleteResponse = await fetch(`${API_URL}/attendance/${selectedDate}`, {
        method: 'DELETE'
      });

      const deleteData = await deleteResponse.json();

      if (!deleteData.success) {
        throw new Error('Failed to delete data from database: ' + deleteData.error);
      }

      console.log(`Deleted ${deleteData.deletedCount} record(s) from database`);
    }

    // Clear the UI
    attendanceData = {};

    // Uncheck all checkboxes
    const allCheckboxes = document.querySelectorAll('.present-checkbox, .late-checkbox, .absent-checkbox');
    allCheckboxes.forEach(checkbox => {
      checkbox.checked = false;
    });

    // Clear all status indicators
    const allStatusElements = document.querySelectorAll('.save-status');
    allStatusElements.forEach(status => {
      status.textContent = '';
      status.className = 'save-status';
    });

    // Refresh calendar date indicators
    refreshCalendarDates();

    if (hasSavedData) {
      alert(`Successfully deleted ${savedCount} attendance record(s) for ${selectedDate}.\n\nStudents list is still loaded. You can re-enter attendance if needed.`);
    } else {
      alert('All checkmarks cleared. Students list is still loaded.');
    }

  } catch (error) {
    console.error('Error clearing data:', error);
    alert(`Error clearing data: ${error.message}`);
  }
}

// Load attendance for a specific date
async function loadDateAttendance(date) {
  try {
    const response = await fetch(`${API_URL}/attendance/${date}`);
    const data = await response.json();

    if (data.success && data.attendance) {
      data.attendance.forEach(record => {
        attendanceData[record.student_id] = {
          studentId: record.student_id,
          studentName: record.student_name,
          startTime: record.start_time,
          endTime: record.end_time,
          status: record.status
        };
      });
    }
  } catch (error) {
    console.error('Error loading attendance for date:', error);
  }
}

// Render students list grouped by shift
function renderTeachersList() {
  const teachersList = document.getElementById('teachersList');

  if (students.length === 0) {
    teachersList.innerHTML = '<div class="info-text">No active students found.</div>';
    return;
  }

  // Group students by start time
  const shiftGroups = {};
  const shiftLabels = {
    '8am': '8am Shift',
    '10am': '10am Shift',
    '1pm': '1pm Shift',
    '3pm': '3pm Shift',
    '5pm': '5pm Shift',
    '7pm': '7pm Shift'
  };

  students.forEach(student => {
    const startTime = student.startTime || 'No Shift';
    if (!shiftGroups[startTime]) {
      shiftGroups[startTime] = [];
    }
    shiftGroups[startTime].push(student);
  });

  // Order shifts
  const orderedShifts = ['8am', '10am', '1pm', '3pm', '5pm', '7pm'];
  let html = '';

  orderedShifts.forEach(shift => {
    if (shiftGroups[shift] && shiftGroups[shift].length > 0) {
      html += `<div class="shift-section">
        <div class="shift-header">${shiftLabels[shift]}</div>
        <div class="shift-teachers">`;

      shiftGroups[shift].forEach(student => {
        const attendance = attendanceData[student.id];
        const isPresent = attendance?.status === 'present';
        const isLate = attendance?.status === 'late';
        const isAbsent = attendance?.status === 'absent';
        const isActive = attendance?.is_active !== 0; // Default to active if not set
        const hasUndertime = attendance?.has_undertime === 1;
        const showUndertimeBtn = isPresent || isLate;

        html += `
        <div class="teacher-card ${!isActive ? 'deactivated' : ''}" id="card-${student.id}" data-student-id="${student.id}">
          <div class="teacher-info">
            <div class="teacher-name">${student.name}</div>
            <div class="teacher-time">
              ${student.startTime ? `Start: ${student.startTime}` : ''}
              ${student.endTime ? ` | End: ${student.endTime}` : ''}
              ${attendance?.minutes_late ? ` | <span style="color: #e65100;">${attendance.minutes_late} min late</span>` : ''}
              ${hasUndertime ? ` | <span style="color: #d32f2f;">${attendance.undertime_minutes || ''} min early</span>` : ''}
            </div>
            <div class="teacher-actions">
              <button class="toggle-active-btn"
                      data-student-id="${student.id}"
                      data-student-name="${student.name}"
                      data-start-time="${student.startTime}"
                      data-end-time="${student.endTime}"
                      data-is-active="${isActive}"
                      title="${isActive ? 'Mark as Not Applicable' : 'Mark as Active'}">
                ${isActive ? '🚫 NA' : '✓ Activate'}
              </button>
            </div>
          </div>
          <div class="attendance-controls">
            <div class="checkbox-group">
              <label>
                <input
                  type="checkbox"
                  class="present-checkbox"
                  data-student-id="${student.id}"
                  data-student-name="${student.name}"
                  data-start-time="${student.startTime}"
                  data-end-time="${student.endTime}"
                  data-status="present"
                  onchange="handleAttendanceChange(this)"
                  ${isPresent ? 'checked' : ''}
                />
                Present
              </label>
              <label>
                <input
                  type="checkbox"
                  class="late-checkbox"
                  data-student-id="${student.id}"
                  data-student-name="${student.name}"
                  data-start-time="${student.startTime}"
                  data-end-time="${student.endTime}"
                  data-status="late"
                  onchange="handleAttendanceChange(this)"
                  ${isLate ? 'checked' : ''}
                />
                Late
              </label>
              <label>
                <input
                  type="checkbox"
                  class="absent-checkbox"
                  data-student-id="${student.id}"
                  data-student-name="${student.name}"
                  data-start-time="${student.startTime}"
                  data-end-time="${student.endTime}"
                  data-status="absent"
                  onchange="handleAttendanceChange(this)"
                  ${isAbsent ? 'checked' : ''}
                />
                Absent
              </label>
              <label style="display: flex; align-items: center; gap: 5px; margin-left: 15px; padding-left: 15px; border-left: 1px solid #ddd;">
                <input
                  type="checkbox"
                  class="undertime-checkbox"
                  data-student-id="${student.id}"
                  data-student-name="${student.name}"
                  data-start-time="${student.startTime}"
                  data-end-time="${student.endTime}"
                  onchange="handleUndertimeChange(this)"
                  ${hasUndertime ? 'checked' : ''}
                  ${isAbsent || (!isPresent && !isLate) ? 'disabled' : ''}
                />
                Left Early
              </label>
            </div>
            <span class="save-status" id="status-${student.id}"></span>
          </div>
        </div>`;
      });

      html += '</div></div>';
    }
  });

  // Add teachers with no shift or unrecognized shifts
  const otherTeachers = Object.keys(shiftGroups).filter(shift => !orderedShifts.includes(shift));
  if (otherTeachers.length > 0) {
    otherTeachers.forEach(shift => {
      html += `<div class="shift-section">
        <div class="shift-header">${shift}</div>
        <div class="shift-teachers">`;

      shiftGroups[shift].forEach(student => {
        const attendance = attendanceData[student.id];
        const isPresent = attendance?.status === 'present';
        const isLate = attendance?.status === 'late';
        const isAbsent = attendance?.status === 'absent';
        const isActive = attendance?.is_active !== 0; // Default to active if not set
        const hasUndertime = attendance?.has_undertime === 1;
        const showUndertimeBtn = isPresent || isLate;

        html += `
        <div class="teacher-card ${!isActive ? 'deactivated' : ''}" id="card-${student.id}" data-student-id="${student.id}">
          <div class="teacher-info">
            <div class="teacher-name">${student.name}</div>
            <div class="teacher-time">
              ${student.startTime ? `Start: ${student.startTime}` : ''}
              ${student.endTime ? ` | End: ${student.endTime}` : ''}
              ${attendance?.minutes_late ? ` | <span style="color: #e65100;">${attendance.minutes_late} min late</span>` : ''}
              ${hasUndertime ? ` | <span style="color: #d32f2f;">${attendance.undertime_minutes || ''} min early</span>` : ''}
            </div>
            <div class="teacher-actions">
              <button class="toggle-active-btn"
                      data-student-id="${student.id}"
                      data-student-name="${student.name}"
                      data-start-time="${student.startTime}"
                      data-end-time="${student.endTime}"
                      data-is-active="${isActive}"
                      title="${isActive ? 'Mark as Not Applicable' : 'Mark as Active'}">
                ${isActive ? '🚫 NA' : '✓ Activate'}
              </button>
            </div>
          </div>
          <div class="attendance-controls">
            <div class="checkbox-group">
              <label>
                <input
                  type="checkbox"
                  class="present-checkbox"
                  data-student-id="${student.id}"
                  data-student-name="${student.name}"
                  data-start-time="${student.startTime}"
                  data-end-time="${student.endTime}"
                  data-status="present"
                  onchange="handleAttendanceChange(this)"
                  ${isPresent ? 'checked' : ''}
                />
                Present
              </label>
              <label>
                <input
                  type="checkbox"
                  class="late-checkbox"
                  data-student-id="${student.id}"
                  data-student-name="${student.name}"
                  data-start-time="${student.startTime}"
                  data-end-time="${student.endTime}"
                  data-status="late"
                  onchange="handleAttendanceChange(this)"
                  ${isLate ? 'checked' : ''}
                />
                Late
              </label>
              <label>
                <input
                  type="checkbox"
                  class="absent-checkbox"
                  data-student-id="${student.id}"
                  data-student-name="${student.name}"
                  data-start-time="${student.startTime}"
                  data-end-time="${student.endTime}"
                  data-status="absent"
                  onchange="handleAttendanceChange(this)"
                  ${isAbsent ? 'checked' : ''}
                />
                Absent
              </label>
              <label style="display: flex; align-items: center; gap: 5px; margin-left: 15px; padding-left: 15px; border-left: 1px solid #ddd;">
                <input
                  type="checkbox"
                  class="undertime-checkbox"
                  data-student-id="${student.id}"
                  data-student-name="${student.name}"
                  data-start-time="${student.startTime}"
                  data-end-time="${student.endTime}"
                  onchange="handleUndertimeChange(this)"
                  ${hasUndertime ? 'checked' : ''}
                  ${isAbsent || (!isPresent && !isLate) ? 'disabled' : ''}
                />
                Left Early
              </label>
            </div>
            <span class="save-status" id="status-${student.id}"></span>
          </div>
        </div>`;
      });

      html += '</div></div>';
    });
  }

  teachersList.innerHTML = html;
  document.getElementById('submitAttendanceBtn').style.display = 'none';

  // Attach event listeners to all toggle-active buttons
  document.querySelectorAll('.toggle-active-btn').forEach(button => {
    button.addEventListener('click', function() {
      const studentId = this.getAttribute('data-student-id');
      const studentName = this.getAttribute('data-student-name');
      const startTime = this.getAttribute('data-start-time');
      const endTime = this.getAttribute('data-end-time');
      const isActive = this.getAttribute('data-is-active') === 'true';

      toggleStudentActive(studentId, studentName, startTime, endTime, isActive);
    });
  });
}

// Handle attendance checkbox change
async function handleAttendanceChange(checkbox) {
  const studentId = checkbox.getAttribute('data-student-id');
  const studentName = checkbox.getAttribute('data-student-name');
  const startTime = checkbox.getAttribute('data-start-time');
  const endTime = checkbox.getAttribute('data-end-time');
  const status = checkbox.getAttribute('data-status');

  // Get all three checkboxes for this teacher
  const presentCheckbox = document.querySelector(
    `input[data-student-id="${studentId}"][data-status="present"]`
  );
  const lateCheckbox = document.querySelector(
    `input[data-student-id="${studentId}"][data-status="late"]`
  );
  const absentCheckbox = document.querySelector(
    `input[data-student-id="${studentId}"][data-status="absent"]`
  );

  // Get the undertime checkbox for this student
  const undertimeCheckbox = document.querySelector(
    `.undertime-checkbox[data-student-id="${studentId}"]`
  );

  // Ensure only one is checked
  if (checkbox.checked) {
    // Uncheck the other two
    if (status === 'present') {
      lateCheckbox.checked = false;
      absentCheckbox.checked = false;
    } else if (status === 'late') {
      presentCheckbox.checked = false;
      absentCheckbox.checked = false;
    } else {
      presentCheckbox.checked = false;
      lateCheckbox.checked = false;
    }

    attendanceData[studentId] = {
      studentId,
      studentName,
      startTime,
      endTime,
      status
    };

    // Enable/disable undertime checkbox based on status
    if (undertimeCheckbox) {
      if (status === 'present' || status === 'late') {
        undertimeCheckbox.disabled = false;
      } else {
        // Disable and uncheck for absent
        undertimeCheckbox.disabled = true;
        undertimeCheckbox.checked = false;
      }
    }

    // Handle different statuses
    if (status === 'late') {
      // Open modal for late reason
      openLateModal({ studentId, studentName, startTime, endTime });
    } else if (status === 'absent') {
      // Open modal for absent details
      openAbsentModal({ studentId, studentName, startTime, endTime });
    } else {
      // Present status - auto-save immediately
      await saveAttendance(studentId, studentName, startTime, endTime, status);
    }
  } else {
    // Unchecked - delete from database
    delete attendanceData[studentId];

    // Disable and uncheck undertime checkbox when unchecked
    if (undertimeCheckbox) {
      undertimeCheckbox.disabled = true;
      undertimeCheckbox.checked = false;
    }

    await deleteStudentAttendance(studentId);
  }
}

// Handle undertime checkbox change
async function handleUndertimeChange(checkbox) {
  const studentId = checkbox.getAttribute('data-student-id');
  const studentName = checkbox.getAttribute('data-student-name');
  const startTime = checkbox.getAttribute('data-start-time');
  const endTime = checkbox.getAttribute('data-end-time');

  if (checkbox.checked) {
    // Open the undertime modal to capture details
    openUndertimeModal({ studentId, studentName, startTime, endTime });
  } else {
    // Checkbox was unchecked - clear undertime data
    await clearUndertimeData(studentId);
  }
}

// Clear undertime data when checkbox is unchecked
async function clearUndertimeData(studentId) {
  const statusElement = document.getElementById(`status-${studentId}`);

  try {
    statusElement.textContent = 'Saving...';
    statusElement.className = 'save-status saving';

    // Get current attendance data to preserve it
    const response = await fetch(`${API_URL}/attendance/student/${studentId}?date=${selectedDate}`);
    const data = await response.json();

    if (data.success && data.attendance) {
      const current = data.attendance;

      // Save with undertime cleared but preserve other data
      const saveResponse = await fetch(`${API_URL}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date: selectedDate,
          attendance: [{
            studentId: studentId,
            studentName: current.student_name,
            startTime: current.start_time,
            endTime: current.end_time,
            status: current.status,
            lateReason: current.late_reason,
            minutesLate: current.minutes_late,
            hasUndertime: 0,
            undertimeMinutes: null,
            undertimeReason: null
          }]
        })
      });

      const saveData = await saveResponse.json();

      if (saveData.success) {
        statusElement.textContent = '✓ Saved';
        statusElement.className = 'save-status saved';

        // Update local attendance data
        if (attendanceData[studentId]) {
          attendanceData[studentId].has_undertime = 0;
          attendanceData[studentId].undertime_minutes = null;
          attendanceData[studentId].undertime_reason = null;
        }

        refreshDailyReportSilently();

        setTimeout(() => {
          statusElement.textContent = '';
          statusElement.className = 'save-status';
        }, 2000);
      } else {
        throw new Error(saveData.error);
      }
    }
  } catch (error) {
    console.error('Error clearing undertime data:', error);
    statusElement.textContent = '✗ Error';
    statusElement.className = 'save-status error';
  }
}

// Delete teacher attendance from database
async function deleteStudentAttendance(studentId) {
  const statusElement = document.getElementById(`status-${studentId}`);

  try {
    statusElement.textContent = 'Deleting...';
    statusElement.className = 'save-status saving';

    const response = await fetch(`${API_URL}/attendance/${selectedDate}/${studentId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      statusElement.textContent = '✓ Deleted';
      statusElement.className = 'save-status saved';

      // Refresh the daily report to keep it in sync
      refreshDailyReportSilently();

      // Refresh calendar date indicators
      refreshCalendarDates();

      setTimeout(() => {
        statusElement.textContent = '';
        statusElement.className = 'save-status';
      }, 2000);
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error deleting attendance:', error);
    statusElement.textContent = '✗ Error';
    statusElement.className = 'save-status error';

    setTimeout(() => {
      statusElement.textContent = '';
      statusElement.className = 'save-status';
    }, 3000);
  }
}

// Auto-save individual attendance
async function saveAttendance(studentId, studentName, startTime, endTime, status) {
  const statusElement = document.getElementById(`status-${studentId}`);

  try {
    statusElement.textContent = 'Saving...';
    statusElement.className = 'save-status saving';

    const response = await fetch(`${API_URL}/attendance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        date: selectedDate,
        attendance: [{
          studentId,
          studentName,
          startTime,
          endTime,
          status
        }]
      })
    });

    const data = await response.json();

    if (data.success) {
      statusElement.textContent = '✓ Saved';
      statusElement.className = 'save-status saved';

      // Refresh the daily report to keep it in sync
      refreshDailyReportSilently();

      // Refresh calendar date indicators
      refreshCalendarDates();

      setTimeout(() => {
        statusElement.textContent = '';
        statusElement.className = 'save-status';
      }, 2000);
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error saving attendance:', error);
    statusElement.textContent = '✗ Error';
    statusElement.className = 'save-status error';

    setTimeout(() => {
      statusElement.textContent = '';
      statusElement.className = 'save-status';
    }, 3000);
  }
}

// Submit attendance
async function submitAttendance() {
  const attendance = Object.values(attendanceData);

  if (attendance.length === 0) {
    alert('Please mark attendance for at least one teacher.');
    return;
  }

  const submitBtn = document.getElementById('submitAttendanceBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const response = await fetch(`${API_URL}/attendance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ attendance })
    });

    const data = await response.json();

    if (data.success) {
      showMessage('success', 'Attendance submitted successfully!');
      // Reset after 2 seconds
      setTimeout(() => {
        loadStudents();
      }, 2000);
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error submitting attendance:', error);
    showMessage('error', `Error submitting attendance: ${error.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Attendance';
  }
}

// Load daily report
async function loadDailyReport() {
  const date = document.getElementById('reportDate').value;
  const reportContent = document.getElementById('dailyReportContent');

  if (!date) {
    alert('Please select a date.');
    return;
  }

  reportContent.innerHTML = '<div class="loading">Loading report...</div>';

  try {
    const response = await fetch(`${API_URL}/attendance/${date}`);
    const data = await response.json();

    if (data.success) {
      fullDailyReportData = data.attendance;
      currentReportDate = date;

      // Show filter controls if there's data
      if (data.attendance.length > 0) {
        document.getElementById('reportFilterControls').style.display = 'block';
      } else {
        document.getElementById('reportFilterControls').style.display = 'none';
      }

      renderDailyReport(data.attendance, date);
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error loading report:', error);
    reportContent.innerHTML = `<div class="error-message">Error loading report: ${error.message}</div>`;
    document.getElementById('reportFilterControls').style.display = 'none';
  }
}

// Refresh daily report silently (called after attendance saves to keep in sync)
async function refreshDailyReportSilently() {
  // Only refresh if there's already report data loaded
  if (!currentReportDate) return;

  try {
    const response = await fetch(`${API_URL}/attendance/${currentReportDate}`);
    const data = await response.json();

    if (data.success) {
      fullDailyReportData = data.attendance;

      // Show filter controls if there's data
      if (data.attendance.length > 0) {
        document.getElementById('reportFilterControls').style.display = 'block';
      } else {
        document.getElementById('reportFilterControls').style.display = 'none';
      }

      renderDailyReport(data.attendance, currentReportDate);
    }
  } catch (error) {
    console.error('Error refreshing report:', error);
    // Silently fail - don't show error to user
  }
}

// Render daily report
function renderDailyReport(attendance, date) {
  const reportContent = document.getElementById('dailyReportContent');

  if (attendance.length === 0) {
    reportContent.innerHTML = `<div class="info-text">No attendance records found for ${date}.</div>`;
    return;
  }

  // Sort attendance by start time
  const sortedAttendance = [...attendance].sort((a, b) => {
    const timeA = timeStringToHour(a.start_time);
    const timeB = timeStringToHour(b.start_time);

    if (timeA === null && timeB === null) return 0;
    if (timeA === null) return 1;
    if (timeB === null) return -1;

    if (timeA !== timeB) return timeA - timeB;

    // If same time, sort by name (with safety check)
    const nameA = a.student_name || '';
    const nameB = b.student_name || '';
    return nameA.localeCompare(nameB);
  });

  const presentCount = sortedAttendance.filter(a => a.status === 'present').length;
  const lateCount = sortedAttendance.filter(a => a.status === 'late').length;
  const absentCount = sortedAttendance.filter(a => a.status === 'absent').length;
  const undertimeCount = sortedAttendance.filter(a => a.has_undertime === 1).length;
  const totalMinutesLate = sortedAttendance.reduce((sum, a) => sum + (a.minutes_late || 0), 0);
  const totalMinutesEarly = sortedAttendance.reduce((sum, a) => sum + (a.undertime_minutes || 0), 0);

  reportContent.innerHTML = `
    <div class="summary-section">
      <div class="summary-card">
        <h3>Total Students</h3>
        <div class="value">${attendance.length}</div>
      </div>
      <div class="summary-card">
        <h3>Present</h3>
        <div class="value" style="color: #4caf50;">${presentCount}</div>
      </div>
      <div class="summary-card">
        <h3>Late</h3>
        <div class="value" style="color: #ff9800;">${lateCount}</div>
        ${totalMinutesLate > 0 ? `<div style="font-size: 0.8rem; color: #e65100;">${totalMinutesLate} total min</div>` : ''}
      </div>
      <div class="summary-card">
        <h3>Absent</h3>
        <div class="value" style="color: #f44336;">${absentCount}</div>
      </div>
      <div class="summary-card">
        <h3>Left Early</h3>
        <div class="value" style="color: #d32f2f;">${undertimeCount}</div>
        ${totalMinutesEarly > 0 ? `<div style="font-size: 0.8rem; color: #d32f2f;">${totalMinutesEarly} total min</div>` : ''}
      </div>
    </div>

    <table class="report-table">
      <thead>
        <tr>
          <th>Student Name</th>
          <th>Status</th>
          <th>Shift</th>
          <th>Details</th>
          <th>Recorded At</th>
        </tr>
      </thead>
      <tbody>
        ${sortedAttendance.map(record => {
          let detailsHtml = '';

          // PRESENT status
          if (record.status === 'present') {
            detailsHtml = '<div style="padding: 8px; background: #e8f5e9; border-radius: 4px; border-left: 3px solid #4caf50;">✓ On time</div>';
          }

          // LATE status - show minutes and reason
          else if (record.status === 'late') {
            detailsHtml = `<div style="padding: 8px; background: #fff3e0; border-radius: 4px; border-left: 3px solid #ff9800;">
              <strong>⏰ Late Arrival</strong><br>`;

            if (record.minutes_late) {
              detailsHtml += `<span style="color: #e65100; font-weight: 600;">${record.minutes_late} minutes late</span><br>`;
            }

            if (record.late_reason) {
              detailsHtml += `<strong>Reason:</strong> ${record.late_reason}`;
            }
            detailsHtml += '</div>';
          }

          // ABSENT status
          else if (record.status === 'absent') {
            detailsHtml = `<div style="padding: 8px; background: #ffebee; border-radius: 4px; border-left: 3px solid #f44336;">
              <strong>✗ Absent</strong><br>
              <strong>Reason:</strong> ${record.absent_reason || 'Not specified'}
            </div>`;

            if (record.classAssignments && record.classAssignments.length > 0) {
              detailsHtml += '<div style="margin-top: 8px;"><strong>Class Coverage:</strong></div>';
              record.classAssignments.forEach(assignment => {
                if (assignment.online_class || assignment.onlineClass) {
                  detailsHtml += `<div style="margin: 5px 0; padding: 5px; background: #e3f2fd; border-radius: 4px;">
                    📅 <strong>${assignment.class_slot}:</strong> 💻 Online class
                  </div>`;
                } else if (assignment.no_class || assignment.noClass) {
                  detailsHtml += `<div style="margin: 5px 0; padding: 5px; background: #f8f9fa; border-radius: 4px;">
                    📅 <strong>${assignment.class_slot}:</strong> No class scheduled
                  </div>`;
                } else {
                  detailsHtml += `<div style="margin: 5px 0; padding: 5px; background: #f8f9fa; border-radius: 4px;">
                    📅 <strong>${assignment.class_slot}</strong><br>
                    👨‍🏫 Substitute: ${assignment.substitute_teacher_name || 'Not assigned'}<br>`;

                  if (assignment.students) {
                    const students = typeof assignment.students === 'string' ? JSON.parse(assignment.students) : assignment.students;
                    if (students && students.length > 0) {
                      detailsHtml += `👥 Students: ${students.map(s => s.name).join(', ')}`;
                    }
                  }
                  detailsHtml += '</div>';
                }
              });
            }
          }

          // Default for unmarked
          else {
            detailsHtml = '<span style="color: #999;">-</span>';
          }

          // Add UNDERTIME info if applicable (can apply to present or late)
          if (record.has_undertime === 1) {
            detailsHtml += `<div style="margin-top: 8px; padding: 8px; background: #fce4ec; border-radius: 4px; border-left: 3px solid #d32f2f;">
              <strong>⏱ Left Early / Undertime</strong><br>
              <span style="color: #d32f2f; font-weight: 600;">${record.undertime_minutes || '?'} minutes early</span><br>
              <strong>Reason:</strong> ${record.undertime_reason || 'Not specified'}
            </div>`;
          }

          return `
          <tr>
            <td>${record.student_name}</td>
            <td>
              <span class="status-badge status-${record.status}">
                ${record.status.toUpperCase()}
              </span>
              ${record.minutes_late ? `<span class="status-badge" style="background: #ff9800; margin-left: 5px;">${record.minutes_late} MIN LATE</span>` : ''}
              ${record.has_undertime === 1 ? `<span class="status-badge" style="background: #d32f2f; margin-left: 5px;">${record.undertime_minutes || ''} MIN EARLY</span>` : ''}
            </td>
            <td>${record.start_time && record.end_time ? `${record.start_time} - ${record.end_time}` : '-'}</td>
            <td>${detailsHtml}</td>
            <td>${new Date(record.timestamp + 'Z').toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</td>
          </tr>
        `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// Store chart instances
let chartInstances = {};

// Load overview with comprehensive analytics
async function loadOverview() {
  const startDate = document.getElementById('overviewStartDate').value;
  const endDate = document.getElementById('overviewEndDate').value;

  if (!startDate || !endDate) {
    alert('Please select both start and end dates.');
    return;
  }

  const overviewSummary = document.getElementById('overviewSummary');

  overviewSummary.innerHTML = '<div class="loading">Loading analytics...</div>';

  try {
    const response = await fetch(`${API_URL}/reports/range?startDate=${startDate}&endDate=${endDate}`);
    const data = await response.json();

    if (data.success) {
      await renderComprehensiveAnalytics(data.attendance, startDate, endDate);
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error loading overview:', error);
    overviewSummary.innerHTML = `<div class="error-message">Error loading overview: ${error.message}</div>`;
  }
}

// Render overview - now handled by analytics.js
// Function kept for compatibility but functionality moved to renderComprehensiveAnalytics()

// Helper function to use timeStringToHour from helpers.js
// (Already defined in helpers.js, just making sure it's available)

// Export CSV
function exportCSV() {
  const startDate = document.getElementById('overviewStartDate').value;
  const endDate = document.getElementById('overviewEndDate').value;

  if (!startDate || !endDate) {
    alert('Please select both start and end dates before exporting.');
    return;
  }

  const url = `${API_URL}/export/csv?startDate=${startDate}&endDate=${endDate}`;
  window.open(url, '_blank');
}

// Show message
function showMessage(type, message) {
  const messageDiv = document.createElement('div');
  messageDiv.className = type === 'success' ? 'success-message' : 'error-message';
  messageDiv.textContent = message;

  const teachersList = document.getElementById('teachersList');
  teachersList.insertBefore(messageDiv, teachersList.firstChild);

  setTimeout(() => {
    messageDiv.remove();
  }, 5000);
}

// Handle "All" filter checkbox
function handleFilterAllChange() {
  const allCheckbox = document.getElementById('filterAll');
  const presentCheckbox = document.getElementById('filterPresent');
  const lateCheckbox = document.getElementById('filterLate');
  const absentCheckbox = document.getElementById('filterAbsent');

  if (allCheckbox.checked) {
    presentCheckbox.checked = true;
    lateCheckbox.checked = true;
    absentCheckbox.checked = true;
  } else {
    presentCheckbox.checked = false;
    lateCheckbox.checked = false;
    absentCheckbox.checked = false;
  }

  applyFiltersToReport();
}

// Handle individual status filter change
function handleStatusFilterChange() {
  const allCheckbox = document.getElementById('filterAll');
  const presentCheckbox = document.getElementById('filterPresent');
  const lateCheckbox = document.getElementById('filterLate');
  const absentCheckbox = document.getElementById('filterAbsent');

  // Update "All" checkbox based on individual checkboxes
  if (presentCheckbox.checked && lateCheckbox.checked && absentCheckbox.checked) {
    allCheckbox.checked = true;
  } else {
    allCheckbox.checked = false;
  }

  applyFiltersToReport();
}

// All shift time slots
const ALL_SHIFTS = ['8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm'];

// Apply filters to the daily report
function applyFiltersToReport() {
  if (!fullDailyReportData) return;

  const presentCheckbox = document.getElementById('filterPresent');
  const lateCheckbox = document.getElementById('filterLate');
  const absentCheckbox = document.getElementById('filterAbsent');
  const allShiftsCheckbox = document.getElementById('filterAllShifts');

  // Get all shift checkboxes
  const shiftCheckboxes = {};
  ALL_SHIFTS.forEach(shift => {
    shiftCheckboxes[shift] = document.getElementById(`filterShift${shift}`);
  });

  let filteredData = fullDailyReportData.filter(record => {
    // Check status filter
    let statusMatch = false;
    if (record.status === 'present' && presentCheckbox.checked) statusMatch = true;
    if (record.status === 'late' && lateCheckbox.checked) statusMatch = true;
    if (record.status === 'absent' && absentCheckbox.checked) statusMatch = true;

    if (!statusMatch) return false;

    // Check shift filter (case-insensitive)
    const startTimeLower = (record.start_time || '').toLowerCase();

    // If "All Shifts" is checked, match everything
    if (allShiftsCheckbox.checked) {
      return true;
    }

    // Check if any matching shift checkbox is checked
    const checkbox = shiftCheckboxes[startTimeLower];
    return checkbox && checkbox.checked;
  });

  renderDailyReport(filteredData, currentReportDate);
}

// Handle "All Shifts" filter checkbox
function handleFilterAllShiftsChange() {
  const allShiftsCheckbox = document.getElementById('filterAllShifts');
  const isChecked = allShiftsCheckbox.checked;

  ALL_SHIFTS.forEach(shift => {
    const checkbox = document.getElementById(`filterShift${shift}`);
    if (checkbox) checkbox.checked = isChecked;
  });

  applyFiltersToReport();
}

// Handle individual shift filter change
function handleShiftFilterChange() {
  const allShiftsCheckbox = document.getElementById('filterAllShifts');

  // Update "All Shifts" checkbox based on individual checkboxes
  const allChecked = ALL_SHIFTS.every(shift => {
    const checkbox = document.getElementById(`filterShift${shift}`);
    return checkbox && checkbox.checked;
  });

  allShiftsCheckbox.checked = allChecked;

  applyFiltersToReport();
}

// Download daily report as image
async function downloadDailyReportAsImage() {
  const downloadBtn = document.getElementById('downloadReportBtn');

  if (!fullDailyReportData || fullDailyReportData.length === 0) {
    alert('No report data to download. Please load a report first.');
    return;
  }

  try {
    downloadBtn.disabled = true;
    downloadBtn.textContent = '📸 Generating...';

    // Debug: Log the data being used for download
    console.log('[Download Debug] Full data:', fullDailyReportData);
    const lateRecords = fullDailyReportData.filter(r => r.status === 'late');
    console.log('[Download Debug] Late records:', lateRecords);
    lateRecords.forEach(r => {
      console.log(`[Download Debug] ${r.student_name}: minutes_late=${r.minutes_late}, has_undertime=${r.has_undertime}`);
    });

    // Get filtered data based on current filters
    const presentCheckbox = document.getElementById('filterPresent');
    const lateCheckbox = document.getElementById('filterLate');
    const absentCheckbox = document.getElementById('filterAbsent');

    const allShiftsCheckbox = document.getElementById('filterAllShifts');

    // Get all shift checkboxes
    const shiftCheckboxes = {};
    ALL_SHIFTS.forEach(shift => {
      shiftCheckboxes[shift] = document.getElementById(`filterShift${shift}`);
    });

    let filteredData = fullDailyReportData.filter(record => {
      // Check status filter
      let statusMatch = false;
      if (record.status === 'present' && presentCheckbox.checked) statusMatch = true;
      if (record.status === 'late' && lateCheckbox.checked) statusMatch = true;
      if (record.status === 'absent' && absentCheckbox.checked) statusMatch = true;

      if (!statusMatch) return false;

      // Check shift filter (case-insensitive)
      const startTimeLower = (record.start_time || '').toLowerCase();

      // If "All Shifts" is checked, match everything
      if (allShiftsCheckbox.checked) {
        return true;
      }

      // Check if any matching shift checkbox is checked
      const checkbox = shiftCheckboxes[startTimeLower];
      return checkbox && checkbox.checked;
    });

    // Sort by time
    const sortedData = [...filteredData].sort((a, b) => {
      const timeA = timeStringToHour(a.start_time);
      const timeB = timeStringToHour(b.start_time);

      if (timeA === null && timeB === null) return 0;
      if (timeA === null) return 1;
      if (timeB === null) return -1;

      if (timeA !== timeB) return timeA - timeB;

      // Sort by name with safety check
      const nameA = a.student_name || '';
      const nameB = b.student_name || '';
      return nameA.localeCompare(nameB);
    });

    // Format the date nicely
    const dateObj = new Date(currentReportDate + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Create a temporary container for download
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.background = '#ffffff';
    tempContainer.style.padding = '30px';
    tempContainer.style.width = '1200px';

    tempContainer.innerHTML = `
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #EA580C; font-size: 2rem; margin-bottom: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.5px; font-weight: 700;">
          Student Attendance Report
        </h1>
        <p style="color: #64748B; font-size: 1.2rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-weight: 500;">
          ${formattedDate}
        </p>
      </div>

      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);">
        <thead>
          <tr>
            <th style="padding: 14px 18px; text-align: left; background: #EA580C; color: white; font-weight: 600; border-bottom: 1px solid #E2E8F0; letter-spacing: 0.3px;">Student Name</th>
            <th style="padding: 14px 18px; text-align: left; background: #EA580C; color: white; font-weight: 600; border-bottom: 1px solid #E2E8F0; letter-spacing: 0.3px;">Status</th>
            <th style="padding: 14px 18px; text-align: left; background: #EA580C; color: white; font-weight: 600; border-bottom: 1px solid #E2E8F0; letter-spacing: 0.3px;">Shift</th>
            <th style="padding: 14px 18px; text-align: left; background: #EA580C; color: white; font-weight: 600; border-bottom: 1px solid #E2E8F0; letter-spacing: 0.3px;">Details</th>
          </tr>
        </thead>
        <tbody>
          ${sortedData.map(record => {
            let detailsHtml = '';

            // PRESENT status
            if (record.status === 'present') {
              detailsHtml = '<div style="padding: 8px; background: #e8f5e9; border-radius: 4px; border-left: 3px solid #4caf50;">✓ On time</div>';
            }

            // LATE status - show minutes and reason
            else if (record.status === 'late') {
              detailsHtml = `<div style="padding: 8px; background: #fff3e0; border-radius: 4px; border-left: 3px solid #ff9800;">
                <strong>⏰ Late Arrival</strong><br>`;

              if (record.minutes_late) {
                detailsHtml += `<span style="color: #e65100; font-weight: 600;">${record.minutes_late} minutes late</span><br>`;
              }

              if (record.late_reason) {
                detailsHtml += `<strong>Reason:</strong> ${record.late_reason}`;
              }
              detailsHtml += '</div>';
            }

            // ABSENT status
            else if (record.status === 'absent') {
              detailsHtml = `<div style="padding: 8px; background: #ffebee; border-radius: 4px; border-left: 3px solid #f44336;">
                <strong>✗ Absent</strong><br>
                <strong>Reason:</strong> ${record.absent_reason || 'Not specified'}
              </div>`;

              if (record.classAssignments && record.classAssignments.length > 0) {
                detailsHtml += '<div style="margin-top: 8px;"><strong>Class Coverage:</strong></div>';
                record.classAssignments.forEach(assignment => {
                  if (assignment.online_class || assignment.onlineClass) {
                    detailsHtml += `<div style="margin: 5px 0; padding: 5px; background: #E3F2FD; border-radius: 8px; border: 1px solid #90CAF9;">
                      📅 <strong>${assignment.class_slot}:</strong> 💻 Online class
                    </div>`;
                  } else if (assignment.no_class || assignment.noClass) {
                    detailsHtml += `<div style="margin: 5px 0; padding: 5px; background: #F7F9FC; border-radius: 8px; border: 1px solid #E2E8F0;">
                      📅 <strong>${assignment.class_slot}:</strong> No class scheduled
                    </div>`;
                  } else {
                    detailsHtml += `<div style="margin: 5px 0; padding: 5px; background: #F7F9FC; border-radius: 8px; border: 1px solid #E2E8F0;">
                      📅 <strong>${assignment.class_slot}</strong><br>
                      👨‍🏫 Substitute: ${assignment.substitute_teacher_name || 'Not assigned'}<br>`;

                    if (assignment.students) {
                      const students = typeof assignment.students === 'string' ? JSON.parse(assignment.students) : assignment.students;
                      if (students && students.length > 0) {
                        detailsHtml += `👥 Students: ${students.map(s => s.name).join(', ')}`;
                      }
                    }
                    detailsHtml += '</div>';
                  }
                });
              }
            }

            // Default for unmarked
            else {
              detailsHtml = '<span style="color: #999;">-</span>';
            }

            // Add UNDERTIME info if applicable (can apply to present or late)
            if (record.has_undertime === 1) {
              detailsHtml += `<div style="margin-top: 8px; padding: 8px; background: #fce4ec; border-radius: 4px; border-left: 3px solid #d32f2f;">
                <strong>⏱ Left Early / Undertime</strong><br>
                <span style="color: #d32f2f; font-weight: 600;">${record.undertime_minutes || '?'} minutes early</span><br>
                <strong>Reason:</strong> ${record.undertime_reason || 'Not specified'}
              </div>`;
            }

            let statusBgColor = '#D1FAE5';
            let statusTextColor = '#065F46';
            let statusBorderColor = '#10B981';
            if (record.status === 'late') {
              statusBgColor = '#FEF3C7';
              statusTextColor = '#92400E';
              statusBorderColor = '#F59E0B';
            } else if (record.status === 'absent') {
              statusBgColor = '#FEE2E2';
              statusTextColor = '#991B1B';
              statusBorderColor = '#EF4444';
            }

            // Build status badges
            let statusBadges = `<span style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; background: ${statusBgColor}; color: ${statusTextColor}; border: 1px solid ${statusBorderColor};">
                  ${record.status.toUpperCase()}
                </span>`;

            if (record.minutes_late) {
              statusBadges += `<span style="display: inline-block; margin-left: 5px; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; background: #ff9800; color: white;">
                  ${record.minutes_late} MIN LATE
                </span>`;
            }

            if (record.has_undertime === 1) {
              statusBadges += `<span style="display: inline-block; margin-left: 5px; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; background: #d32f2f; color: white;">
                  ${record.undertime_minutes || ''} MIN EARLY
                </span>`;
            }

            return `
            <tr style="border-bottom: 1px solid #E2E8F0;">
              <td style="padding: 12px 15px; vertical-align: top; font-size: 0.95rem; color: #1A202C;">${record.student_name}</td>
              <td style="padding: 12px 15px; vertical-align: top;">
                ${statusBadges}
              </td>
              <td style="padding: 12px 15px; vertical-align: top; font-size: 0.9rem; color: #64748B;">${record.start_time && record.end_time ? `${record.start_time} - ${record.end_time}` : '-'}</td>
              <td style="padding: 12px 15px; vertical-align: top; max-width: 400px; font-size: 0.9rem; line-height: 1.5; color: #1A202C;">${detailsHtml}</td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    `;

    document.body.appendChild(tempContainer);

    // Use html2canvas to convert to image
    const canvas = await html2canvas(tempContainer, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true
    });

    // Remove temp container
    document.body.removeChild(tempContainer);

    // Convert canvas to blob and download
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `attendance-report-${currentReportDate}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      downloadBtn.disabled = false;
      downloadBtn.textContent = '📷 Download as Image';
    });
  } catch (error) {
    console.error('Error generating image:', error);
    alert('Error generating image. Please try again.');
    downloadBtn.disabled = false;
    downloadBtn.textContent = '📷 Download as Image';
  }
}

// Toggle student active status (mark as NA or activate)
async function toggleStudentActive(studentId, studentName, startTime, endTime, currentlyActive) {
  try {
    console.log('Toggle student active called with:', { studentId, studentName, startTime, endTime, currentlyActive, selectedDate });

    const newActiveStatus = !currentlyActive;

    // Update the database via API
    const response = await fetch(`${API_URL}/attendance/${selectedDate}/${studentId}/active`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        isActive: newActiveStatus,
        studentName: studentName,
        startTime: startTime,
        endTime: endTime
      })
    });

    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);

    if (data.success) {
      // Update or create the local attendanceData
      if (!attendanceData[studentId]) {
        attendanceData[studentId] = {
          studentId: studentId,
          studentName: studentName,
          status: 'unmarked',
          startTime: startTime,
          endTime: endTime,
          is_active: newActiveStatus ? 1 : 0
        };
      } else {
        attendanceData[studentId].is_active = newActiveStatus ? 1 : 0;
      }

      // Re-render the teachers list to reflect the change
      renderTeachersList();

      // Also refresh the daily report if it's visible
      refreshDailyReportSilently();

      console.log('Successfully toggled student active status');
    } else {
      console.error('API returned error:', data.message);
      alert(`Error: ${data.message}`);
    }
  } catch (error) {
    console.error('Error toggling student active status:', error);
    console.error('Error details:', error.message, error.stack);
    alert(`Failed to update student status. Error: ${error.message}`);
  }
}

// ==================== INDIVIDUAL RECORDS TAB FUNCTIONS ====================

// Load students for the dropdown
async function loadStudentsForDropdown() {
  const select = document.getElementById('individualStudentSelect');

  // Only load if dropdown is empty (except for the default option)
  if (select.options.length > 1) return;

  try {
    const response = await fetch(`${API_URL}/students`);
    const data = await response.json();

    if (data.success) {
      // Sort students alphabetically
      const sortedStudents = data.students.sort((a, b) => a.name.localeCompare(b.name));

      sortedStudents.forEach(student => {
        const option = document.createElement('option');
        option.value = student.id;
        option.textContent = `${student.name} (${student.startTime || 'No shift'})`;
        option.dataset.name = student.name;
        option.dataset.startTime = student.startTime || '';
        option.dataset.endTime = student.endTime || '';
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading students for dropdown:', error);
  }
}

// Load individual student records
async function loadIndividualRecords() {
  const select = document.getElementById('individualStudentSelect');
  const studentId = select.value;
  const startDate = document.getElementById('individualStartDate').value;
  const endDate = document.getElementById('individualEndDate').value;
  const content = document.getElementById('individualRecordsContent');
  const summary = document.getElementById('individualSummary');
  const downloadBtn = document.getElementById('downloadIndividualRecordsBtn');

  if (!studentId) {
    alert('Please select a student first.');
    return;
  }

  content.innerHTML = '<div class="loading">Loading records...</div>';
  summary.style.display = 'none';
  downloadBtn.style.display = 'none';

  try {
    let url = `${API_URL}/attendance/history/${studentId}`;
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.success) {
      individualRecordsData = data.attendance;
      currentIndividualStudent = {
        id: studentId,
        name: select.options[select.selectedIndex].dataset.name,
        startTime: select.options[select.selectedIndex].dataset.startTime,
        endTime: select.options[select.selectedIndex].dataset.endTime
      };

      renderIndividualRecords();
      downloadBtn.style.display = 'inline-block';
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error loading individual records:', error);
    content.innerHTML = `<div class="error-message">Error loading records: ${error.message}</div>`;
  }
}

// Render individual student records
function renderIndividualRecords() {
  const content = document.getElementById('individualRecordsContent');
  const summary = document.getElementById('individualSummary');
  const startDate = document.getElementById('individualStartDate').value;
  const endDate = document.getElementById('individualEndDate').value;

  if (!individualRecordsData || individualRecordsData.length === 0) {
    content.innerHTML = '<div class="info-text">No attendance records found for this student.</div>';
    summary.style.display = 'none';
    return;
  }

  // Filter to only show marked records (present, late, absent) - exclude unmarked
  const markedRecordsData = individualRecordsData.filter(r =>
    r.status === 'present' || r.status === 'late' || r.status === 'absent'
  );

  if (markedRecordsData.length === 0) {
    content.innerHTML = '<div class="info-text">No attendance records found for this student.</div>';
    summary.style.display = 'none';
    return;
  }

  // Calculate summary statistics from marked records only
  const presentCount = markedRecordsData.filter(r => r.status === 'present').length;
  const lateCount = markedRecordsData.filter(r => r.status === 'late').length;
  const absentCount = markedRecordsData.filter(r => r.status === 'absent').length;
  const undertimeCount = markedRecordsData.filter(r => r.has_undertime === 1).length;
  const totalMinutesLate = markedRecordsData.reduce((sum, r) => sum + (r.minutes_late || 0), 0);
  const totalMinutesEarly = markedRecordsData.reduce((sum, r) => sum + (r.undertime_minutes || 0), 0);

  const totalRecords = markedRecordsData.length;
  const attendanceRate = totalRecords > 0 ? ((presentCount + lateCount) / totalRecords * 100).toFixed(1) : 0;

  // Build date range string
  let dateRangeStr = '';
  if (startDate && endDate) {
    dateRangeStr = `From ${startDate} to ${endDate}`;
  } else if (startDate) {
    dateRangeStr = `From ${startDate}`;
  } else if (endDate) {
    dateRangeStr = `Until ${endDate}`;
  } else {
    dateRangeStr = 'All time';
  }

  // Render summary
  summary.innerHTML = `
    <div class="individual-stat-card">
      <div class="stat-label">Total Days</div>
      <div class="stat-value">${totalRecords}</div>
    </div>
    <div class="individual-stat-card present">
      <div class="stat-label">Present</div>
      <div class="stat-value">${presentCount}</div>
    </div>
    <div class="individual-stat-card late">
      <div class="stat-label">Late</div>
      <div class="stat-value">${lateCount}</div>
      ${totalMinutesLate > 0 ? `<div class="stat-sub">${totalMinutesLate} min total</div>` : ''}
    </div>
    <div class="individual-stat-card absent">
      <div class="stat-label">Absent</div>
      <div class="stat-value">${absentCount}</div>
    </div>
    <div class="individual-stat-card" style="background: linear-gradient(135deg, #fce4ec 0%, #f8bbd9 100%);">
      <div class="stat-label">Left Early</div>
      <div class="stat-value">${undertimeCount}</div>
      ${totalMinutesEarly > 0 ? `<div class="stat-sub">${totalMinutesEarly} min total</div>` : ''}
    </div>
    <div class="individual-stat-card rate">
      <div class="stat-label">Attendance Rate</div>
      <div class="stat-value">${attendanceRate}%</div>
    </div>
  `;
  summary.style.display = 'grid';

  // Render records table
  content.innerHTML = `
    <div class="individual-teacher-header">
      <h3>${currentIndividualStudent.name}</h3>
      <p>${currentIndividualStudent.startTime ? `Shift: ${currentIndividualStudent.startTime} - ${currentIndividualStudent.endTime}` : 'No shift assigned'} | ${dateRangeStr}</p>
    </div>

    <table class="report-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Status</th>
          <th>Details</th>
          <th>Recorded At</th>
        </tr>
      </thead>
      <tbody>
        ${markedRecordsData.map(record => {
          let detailsHtml = '';

          // PRESENT status
          if (record.status === 'present') {
            detailsHtml = '<span style="color: #4caf50;">✓ On time</span>';
          }

          // LATE status - show minutes and reason
          else if (record.status === 'late') {
            detailsHtml = '<div style="padding: 6px; background: #fff3e0; border-radius: 4px; border-left: 3px solid #ff9800;">';
            if (record.minutes_late) {
              detailsHtml += `<span style="color: #e65100; font-weight: 600;">${record.minutes_late} minutes late</span><br>`;
            }
            if (record.late_reason) {
              detailsHtml += `<strong>Reason:</strong> ${record.late_reason}`;
            }
            detailsHtml += '</div>';
          }

          // ABSENT status
          else if (record.status === 'absent') {
            detailsHtml = `<div style="padding: 6px; background: #ffebee; border-radius: 4px; border-left: 3px solid #f44336;">
              <strong>Reason:</strong> ${record.absent_reason || 'Not specified'}
            </div>`;

            if (record.classAssignments && record.classAssignments.length > 0) {
              detailsHtml += '<div style="margin-top: 8px;"><strong>Class Coverage:</strong></div>';
              record.classAssignments.forEach(assignment => {
                if (assignment.online_class || assignment.onlineClass) {
                  detailsHtml += `<div style="margin: 5px 0; padding: 5px; background: #e3f2fd; border-radius: 4px;">
                    📅 <strong>${assignment.class_slot}:</strong> 💻 Online class
                  </div>`;
                } else if (assignment.no_class || assignment.noClass) {
                  detailsHtml += `<div style="margin: 5px 0; padding: 5px; background: #f8f9fa; border-radius: 4px;">
                    📅 <strong>${assignment.class_slot}:</strong> No class scheduled
                  </div>`;
                } else {
                  detailsHtml += `<div style="margin: 5px 0; padding: 5px; background: #f8f9fa; border-radius: 4px;">
                    📅 <strong>${assignment.class_slot}</strong><br>
                    👨‍🏫 Substitute: ${assignment.substitute_teacher_name || 'Not assigned'}<br>`;

                  if (assignment.students) {
                    const students = typeof assignment.students === 'string' ? JSON.parse(assignment.students) : assignment.students;
                    if (students && students.length > 0) {
                      detailsHtml += `👥 Students: ${students.map(s => s.name).join(', ')}`;
                    }
                  }
                  detailsHtml += '</div>';
                }
              });
            }
          }

          // Default for unmarked
          else {
            detailsHtml = '<span style="color: #999;">-</span>';
          }

          // Add UNDERTIME info if applicable (can apply to present or late)
          if (record.has_undertime === 1) {
            detailsHtml += `<div style="margin-top: 8px; padding: 6px; background: #fce4ec; border-radius: 4px; border-left: 3px solid #d32f2f;">
              <strong>⏱ Left Early</strong><br>
              <span style="color: #d32f2f; font-weight: 600;">${record.undertime_minutes || '?'} minutes early</span><br>
              <strong>Reason:</strong> ${record.undertime_reason || 'Not specified'}
            </div>`;
          }

          // Format date nicely
          const dateObj = new Date(record.date + 'T00:00:00');
          const formattedDate = dateObj.toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });

          return `
          <tr>
            <td>${formattedDate}</td>
            <td>
              <span class="status-badge status-${record.status}">
                ${record.status.toUpperCase()}
              </span>
            </td>
            <td>${detailsHtml}</td>
            <td>${new Date(record.timestamp + 'Z').toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</td>
          </tr>
        `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// Download individual records as image
async function downloadIndividualRecordsAsImage() {
  const downloadBtn = document.getElementById('downloadIndividualRecordsBtn');

  if (!individualRecordsData || individualRecordsData.length === 0) {
    alert('No records to download. Please load records first.');
    return;
  }

  try {
    downloadBtn.disabled = true;
    downloadBtn.textContent = '📸 Generating...';

    const startDate = document.getElementById('individualStartDate').value;
    const endDate = document.getElementById('individualEndDate').value;

    // Filter to only show marked records (present, late, absent)
    const markedRecordsData = individualRecordsData.filter(r =>
      r.status === 'present' || r.status === 'late' || r.status === 'absent'
    );

    // Calculate summary statistics from marked records only
    const presentCount = markedRecordsData.filter(r => r.status === 'present').length;
    const lateCount = markedRecordsData.filter(r => r.status === 'late').length;
    const absentCount = markedRecordsData.filter(r => r.status === 'absent').length;
    const undertimeCount = markedRecordsData.filter(r => r.has_undertime === 1).length;
    const totalMinutesLate = markedRecordsData.reduce((sum, r) => sum + (r.minutes_late || 0), 0);
    const totalMinutesEarly = markedRecordsData.reduce((sum, r) => sum + (r.undertime_minutes || 0), 0);

    const totalRecords = markedRecordsData.length;
    const attendanceRate = totalRecords > 0 ? ((presentCount + lateCount) / totalRecords * 100).toFixed(1) : 0;

    // Build date range string
    let dateRangeStr = '';
    if (startDate && endDate) {
      dateRangeStr = `From ${startDate} to ${endDate}`;
    } else if (startDate) {
      dateRangeStr = `From ${startDate}`;
    } else if (endDate) {
      dateRangeStr = `Until ${endDate}`;
    } else {
      dateRangeStr = 'All time';
    }

    // Create a temporary container for download
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.background = '#ffffff';
    tempContainer.style.padding = '30px';
    tempContainer.style.width = '1200px';

    tempContainer.innerHTML = `
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #EA580C; font-size: 2rem; margin-bottom: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.5px; font-weight: 700;">
          Individual Student Attendance Records
        </h1>
        <p style="color: #1A202C; font-size: 1.3rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-weight: 600; margin-bottom: 5px;">
          ${currentIndividualStudent.name}
        </p>
        <p style="color: #64748B; font-size: 1rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          ${currentIndividualStudent.startTime ? `Shift: ${currentIndividualStudent.startTime} - ${currentIndividualStudent.endTime}` : 'No shift assigned'} | ${dateRangeStr}
        </p>
      </div>

      <!-- Summary Stats -->
      <div style="display: flex; justify-content: center; gap: 15px; margin-bottom: 30px; flex-wrap: wrap;">
        <div style="background: #f8f9fa; padding: 12px 20px; border-radius: 10px; text-align: center; min-width: 100px;">
          <div style="font-size: 0.8rem; color: #64748B; font-weight: 600; text-transform: uppercase;">Total Days</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #1A202C;">${totalRecords}</div>
        </div>
        <div style="background: #D1FAE5; padding: 12px 20px; border-radius: 10px; text-align: center; min-width: 100px;">
          <div style="font-size: 0.8rem; color: #065F46; font-weight: 600; text-transform: uppercase;">Present</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #10B981;">${presentCount}</div>
        </div>
        <div style="background: #FEF3C7; padding: 12px 20px; border-radius: 10px; text-align: center; min-width: 100px;">
          <div style="font-size: 0.8rem; color: #92400E; font-weight: 600; text-transform: uppercase;">Late</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #F59E0B;">${lateCount}</div>
          ${totalMinutesLate > 0 ? `<div style="font-size: 0.7rem; color: #e65100;">${totalMinutesLate} min</div>` : ''}
        </div>
        <div style="background: #FEE2E2; padding: 12px 20px; border-radius: 10px; text-align: center; min-width: 100px;">
          <div style="font-size: 0.8rem; color: #991B1B; font-weight: 600; text-transform: uppercase;">Absent</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #EF4444;">${absentCount}</div>
        </div>
        <div style="background: #FCE4EC; padding: 12px 20px; border-radius: 10px; text-align: center; min-width: 100px;">
          <div style="font-size: 0.8rem; color: #880E4F; font-weight: 600; text-transform: uppercase;">Left Early</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #D32F2F;">${undertimeCount}</div>
          ${totalMinutesEarly > 0 ? `<div style="font-size: 0.7rem; color: #d32f2f;">${totalMinutesEarly} min</div>` : ''}
        </div>
        <div style="background: #DBEAFE; padding: 12px 20px; border-radius: 10px; text-align: center; min-width: 100px;">
          <div style="font-size: 0.8rem; color: #1E40AF; font-weight: 600; text-transform: uppercase;">Rate</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #3B82F6;">${attendanceRate}%</div>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);">
        <thead>
          <tr>
            <th style="padding: 14px 18px; text-align: left; background: #EA580C; color: white; font-weight: 600; border-bottom: 1px solid #E2E8F0; letter-spacing: 0.3px;">Date</th>
            <th style="padding: 14px 18px; text-align: left; background: #EA580C; color: white; font-weight: 600; border-bottom: 1px solid #E2E8F0; letter-spacing: 0.3px;">Status</th>
            <th style="padding: 14px 18px; text-align: left; background: #EA580C; color: white; font-weight: 600; border-bottom: 1px solid #E2E8F0; letter-spacing: 0.3px;">Details</th>
          </tr>
        </thead>
        <tbody>
          ${markedRecordsData.map(record => {
            let detailsHtml = '';

            // PRESENT status
            if (record.status === 'present') {
              detailsHtml = '<span style="color: #4caf50;">✓ On time</span>';
            }

            // LATE status - show minutes and reason
            else if (record.status === 'late') {
              detailsHtml = '<div style="padding: 6px; background: #fff3e0; border-radius: 4px; border-left: 3px solid #ff9800;">';
              if (record.minutes_late) {
                detailsHtml += `<span style="color: #e65100; font-weight: 600;">${record.minutes_late} minutes late</span><br>`;
              }
              if (record.late_reason) {
                detailsHtml += `<strong>Reason:</strong> ${record.late_reason}`;
              }
              detailsHtml += '</div>';
            }

            // ABSENT status
            else if (record.status === 'absent') {
              detailsHtml = `<div style="padding: 6px; background: #ffebee; border-radius: 4px; border-left: 3px solid #f44336;">
                <strong>Reason:</strong> ${record.absent_reason || 'Not specified'}
              </div>`;

              if (record.classAssignments && record.classAssignments.length > 0) {
                detailsHtml += '<div style="margin-top: 8px;"><strong>Class Coverage:</strong></div>';
                record.classAssignments.forEach(assignment => {
                  if (assignment.online_class || assignment.onlineClass) {
                    detailsHtml += `<div style="margin: 5px 0; padding: 5px; background: #E3F2FD; border-radius: 8px; border: 1px solid #90CAF9;">
                      📅 <strong>${assignment.class_slot}:</strong> 💻 Online class
                    </div>`;
                  } else if (assignment.no_class || assignment.noClass) {
                    detailsHtml += `<div style="margin: 5px 0; padding: 5px; background: #F7F9FC; border-radius: 8px; border: 1px solid #E2E8F0;">
                      📅 <strong>${assignment.class_slot}:</strong> No class scheduled
                    </div>`;
                  } else {
                    detailsHtml += `<div style="margin: 5px 0; padding: 5px; background: #F7F9FC; border-radius: 8px; border: 1px solid #E2E8F0;">
                      📅 <strong>${assignment.class_slot}</strong><br>
                      👨‍🏫 Substitute: ${assignment.substitute_teacher_name || 'Not assigned'}<br>`;

                    if (assignment.students) {
                      const studentsData = typeof assignment.students === 'string' ? JSON.parse(assignment.students) : assignment.students;
                      if (studentsData && studentsData.length > 0) {
                        detailsHtml += `👥 Students: ${studentsData.map(s => s.name).join(', ')}`;
                      }
                    }
                    detailsHtml += '</div>';
                  }
                });
              }
            }

            // Default for unmarked
            else {
              detailsHtml = '<span style="color: #999;">-</span>';
            }

            // Add UNDERTIME info if applicable (can apply to present or late)
            if (record.has_undertime === 1) {
              detailsHtml += `<div style="margin-top: 8px; padding: 6px; background: #fce4ec; border-radius: 4px; border-left: 3px solid #d32f2f;">
                <strong>⏱ Left Early</strong><br>
                <span style="color: #d32f2f; font-weight: 600;">${record.undertime_minutes || '?'} minutes early</span><br>
                <strong>Reason:</strong> ${record.undertime_reason || 'Not specified'}
              </div>`;
            }

            // Format date nicely
            const dateObj = new Date(record.date + 'T00:00:00');
            const formattedDate = dateObj.toLocaleDateString('en-US', {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });

            let statusBgColor = '#D1FAE5';
            let statusTextColor = '#065F46';
            let statusBorderColor = '#10B981';
            if (record.status === 'late') {
              statusBgColor = '#FEF3C7';
              statusTextColor = '#92400E';
              statusBorderColor = '#F59E0B';
            } else if (record.status === 'absent') {
              statusBgColor = '#FEE2E2';
              statusTextColor = '#991B1B';
              statusBorderColor = '#EF4444';
            }

            return `
            <tr style="border-bottom: 1px solid #E2E8F0;">
              <td style="padding: 12px 15px; vertical-align: top; font-size: 0.95rem; color: #1A202C;">${formattedDate}</td>
              <td style="padding: 12px 15px; vertical-align: top;">
                <span style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; background: ${statusBgColor}; color: ${statusTextColor}; border: 1px solid ${statusBorderColor};">
                  ${record.status.toUpperCase()}
                </span>
              </td>
              <td style="padding: 12px 15px; vertical-align: top; max-width: 500px; font-size: 0.9rem; line-height: 1.5; color: #1A202C;">${detailsHtml}</td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    `;

    document.body.appendChild(tempContainer);

    // Use html2canvas to convert to image
    const canvas = await html2canvas(tempContainer, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true
    });

    // Remove temp container
    document.body.removeChild(tempContainer);

    // Convert canvas to blob and download
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileName = `${currentIndividualStudent.name.replace(/\s+/g, '-')}-attendance-records.png`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      downloadBtn.disabled = false;
      downloadBtn.textContent = '📷 Download as Image';
    });
  } catch (error) {
    console.error('Error generating image:', error);
    alert('Error generating image. Please try again.');
    downloadBtn.disabled = false;
    downloadBtn.textContent = '📷 Download as Image';
  }
}
