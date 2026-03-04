// 20-Day Billing Tracker JavaScript

let billingStudents = [];
let billingHistory = [];
let billingHolidays = [];
let selectedForCharge = new Set();

// Password for billing tab access (encoded to not be immediately visible)
const BILLING_PASSWORD = 'stevenpogi';
const BILLING_AUTH_KEY = 'billingTabAuthenticated';

// Initialize billing tracker when tab is clicked
document.addEventListener('DOMContentLoaded', () => {
  // Load billing data when tab is clicked (with password check)
  document.getElementById('billingTabBtn').addEventListener('click', handleBillingTabClick);

  // Add student button
  document.getElementById('addToBillingBtn').addEventListener('click', addStudentToBilling);

  // Charge selected button
  document.getElementById('chargeSelectedBtn').addEventListener('click', chargeSelectedStudents);

  // Export history button
  document.getElementById('exportBillingHistoryBtn').addEventListener('click', exportBillingHistory);

  // Holiday management
  document.getElementById('addHolidayBtn').addEventListener('click', handleAddHoliday);

  // Set default start date to today
  document.getElementById('billingStartDate').value = getLocalDateString();

  // Password modal event listeners
  document.getElementById('billingPasswordSubmitBtn').addEventListener('click', handlePasswordSubmit);
  document.getElementById('billingPasswordCancelBtn').addEventListener('click', handlePasswordCancel);

  // Allow Enter key to submit password
  document.getElementById('billingPasswordInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handlePasswordSubmit();
    }
  });

  // Close modal on outside click
  document.getElementById('billingPasswordModal').addEventListener('click', (e) => {
    if (e.target.id === 'billingPasswordModal') {
      handlePasswordCancel();
    }
  });

  // Edit modal event listeners
  document.getElementById('billingEditSaveBtn').addEventListener('click', handleEditSave);
  document.getElementById('billingEditCancelBtn').addEventListener('click', handleEditCancel);

  // Edit carried days input
  document.getElementById('editCarriedDaysInput').addEventListener('input', handleEditCarriedDaysChange);
  document.querySelectorAll('input[name="editCarryType"]').forEach(radio => {
    radio.addEventListener('change', updateEditCarryDescription);
  });

  // Close edit modal on outside click
  document.getElementById('billingEditModal').addEventListener('click', (e) => {
    if (e.target.id === 'billingEditModal') {
      handleEditCancel();
    }
  });

  // Charge modal event listeners
  document.getElementById('chargeGenerateSlipBtn').addEventListener('click', handleGenerateSlip);
  document.getElementById('chargeCancelBtn').addEventListener('click', handleChargeCancel);

  // Custom dates toggle
  document.getElementById('useCustomDatesCheck').addEventListener('change', (e) => {
    const customDatesSection = document.getElementById('customDatesSection');
    customDatesSection.style.display = e.target.checked ? 'block' : 'none';
  });

  // Carry-over radio buttons
  document.querySelectorAll('input[name="carryOverType"]').forEach(radio => {
    radio.addEventListener('change', updateCarryOverDescription);
  });

  // Manual absences edit buttons
  document.getElementById('editAbsencesBtn').addEventListener('click', showManualAbsencesInput);
  document.getElementById('applyAbsencesBtn').addEventListener('click', applyManualAbsences);
  document.getElementById('cancelAbsencesBtn').addEventListener('click', hideManualAbsencesInput);

  // Close charge modal on outside click
  document.getElementById('billingChargeModal').addEventListener('click', (e) => {
    if (e.target.id === 'billingChargeModal') {
      handleChargeCancel();
    }
  });

  // Slip modal event listeners
  document.getElementById('slipCloseBtn').addEventListener('click', handleSlipClose);
  document.getElementById('slipDownloadBtn').addEventListener('click', downloadSlipAsImage);
  document.getElementById('slipConfirmChargeBtn').addEventListener('click', confirmAndSaveCharge);

  // Close slip modal on outside click
  document.getElementById('billingSlipModal').addEventListener('click', (e) => {
    if (e.target.id === 'billingSlipModal') {
      handleSlipClose();
    }
  });
});

// Current student being edited
let editingStudent = null;

// Current student being charged
let chargingStudent = null;
let chargingAttendanceDates = [];

// Handle billing tab click - check authentication first
function handleBillingTabClick(e) {
  // Check if already authenticated this session
  if (sessionStorage.getItem(BILLING_AUTH_KEY) === 'true') {
    // Already authenticated, proceed to load billing tracker
    initializeBillingTracker();
    return;
  }

  // Not authenticated - show password modal
  e.preventDefault();
  e.stopPropagation();
  showPasswordModal();
}

// Show the password modal
function showPasswordModal() {
  const modal = document.getElementById('billingPasswordModal');
  const input = document.getElementById('billingPasswordInput');
  const error = document.getElementById('billingPasswordError');

  // Reset modal state
  input.value = '';
  error.style.display = 'none';

  // Show modal
  modal.classList.add('show');

  // Focus on input
  setTimeout(() => input.focus(), 100);
}

// Handle password submission
function handlePasswordSubmit() {
  const input = document.getElementById('billingPasswordInput');
  const error = document.getElementById('billingPasswordError');
  const enteredPassword = input.value;

  if (enteredPassword === BILLING_PASSWORD) {
    // Correct password - authenticate and proceed
    sessionStorage.setItem(BILLING_AUTH_KEY, 'true');

    // Hide modal
    document.getElementById('billingPasswordModal').classList.remove('show');

    // Activate the billing tab
    activateBillingTab();

    // Initialize billing tracker
    initializeBillingTracker();
  } else {
    // Wrong password - show error
    error.style.display = 'block';
    input.value = '';
    input.focus();

    // Shake animation
    input.style.animation = 'shake 0.5s';
    setTimeout(() => {
      input.style.animation = '';
    }, 500);
  }
}

// Handle password cancel
function handlePasswordCancel() {
  document.getElementById('billingPasswordModal').classList.remove('show');
  document.getElementById('billingPasswordInput').value = '';
  document.getElementById('billingPasswordError').style.display = 'none';
}

// Activate the billing tab (switch to it)
function activateBillingTab() {
  // Remove active class from all tabs and content
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  // Add active class to billing tab
  document.getElementById('billingTabBtn').classList.add('active');
  document.getElementById('billing-tab').classList.add('active');
}

// Initialize the billing tracker
async function initializeBillingTracker() {
  await loadStudentsForBillingDropdown();
  await loadBillingData();
  await loadBillingHistory();
  await loadHolidays();
}

// Load students for the dropdown (from Notion)
async function loadStudentsForBillingDropdown() {
  const select = document.getElementById('billingStudentSelect');

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
        option.textContent = student.name;
        option.dataset.name = student.name;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading students for billing dropdown:', error);
  }
}

// Load billing tracking data
async function loadBillingData() {
  try {
    const response = await fetch(`${API_URL}/billing/tracking`);
    const data = await response.json();

    if (data.success) {
      billingStudents = data.students;
      renderBillingStudents();
    }
  } catch (error) {
    console.error('Error loading billing data:', error);
  }
}

// Load billing history
async function loadBillingHistory() {
  try {
    const response = await fetch(`${API_URL}/billing/history?limit=100`);
    const data = await response.json();

    if (data.success) {
      billingHistory = data.history;
      renderBillingHistory();
    }
  } catch (error) {
    console.error('Error loading billing history:', error);
  }
}

// Render all billing students
function renderBillingStudents() {
  const dueSection = document.getElementById('billingDueSection');
  const dueList = document.getElementById('billingDueList');
  const approachingSection = document.getElementById('billingApproachingSection');
  const approachingList = document.getElementById('billingApproachingList');
  const progressSection = document.getElementById('billingProgressSection');
  const progressList = document.getElementById('billingProgressList');
  const noStudentsMsg = document.getElementById('billingNoStudents');
  const chargeBtn = document.getElementById('chargeSelectedBtn');

  // Filter students by category
  const dueStudents = billingStudents.filter(s => s.isDue);
  const approachingStudents = billingStudents.filter(s => s.isApproaching);
  const inProgressStudents = billingStudents.filter(s => !s.isDue && !s.isApproaching);

  // Show/hide sections based on data
  if (billingStudents.length === 0) {
    noStudentsMsg.style.display = 'block';
    dueSection.style.display = 'none';
    approachingSection.style.display = 'none';
    progressSection.style.display = 'none';
    return;
  }

  noStudentsMsg.style.display = 'none';

  // Render Due for Charging
  if (dueStudents.length > 0) {
    dueSection.style.display = 'block';
    chargeBtn.style.display = 'inline-block';
    dueList.innerHTML = dueStudents.map(student => renderDueCard(student)).join('');

    // Add event listeners for checkboxes
    dueList.querySelectorAll('.billing-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', handleChargeCheckboxChange);
    });

    // Add event listeners for individual charge buttons
    dueList.querySelectorAll('.charge-single-btn').forEach(btn => {
      btn.addEventListener('click', handleSingleCharge);
    });
  } else {
    dueSection.style.display = 'none';
    chargeBtn.style.display = 'none';
  }

  // Render Approaching
  if (approachingStudents.length > 0) {
    approachingSection.style.display = 'block';
    approachingList.innerHTML = approachingStudents.map(student => renderApproachingCard(student)).join('');
  } else {
    approachingSection.style.display = 'none';
  }

  // Render In Progress
  if (inProgressStudents.length > 0) {
    progressSection.style.display = 'block';
    progressList.innerHTML = inProgressStudents.map(student => renderProgressCard(student)).join('');
  } else {
    progressSection.style.display = 'none';
  }

  // Add remove button listeners
  document.querySelectorAll('.remove-billing-btn').forEach(btn => {
    btn.addEventListener('click', handleRemoveStudent);
  });

  // Add edit button listeners
  document.querySelectorAll('.edit-billing-btn').forEach(btn => {
    btn.addEventListener('click', handleEditStudent);
  });

  // Add charge early button listeners
  document.querySelectorAll('.charge-early-btn').forEach(btn => {
    btn.addEventListener('click', handleSingleCharge);
  });

  // Update tab badge
  updateBillingBadge(dueStudents.length);
}

// Render a due student card
function renderDueCard(student) {
  const startDateFormatted = formatDate(student.start_date);
  const target = student.cycleTarget || 20;
  const chargeFor = student.chargeForDays || 20;

  let carryInfo = '';
  if (student.carriedDays > 0) {
    if (student.carryType === 'reduce') {
      carryInfo = `<div class="billing-carry-info">📉 Billing credit: ${student.carriedDays} days (charge for ${chargeFor} days)</div>`;
    } else {
      carryInfo = `<div class="billing-carry-info">📈 Extended cycle: +${student.carriedDays} days</div>`;
    }
  }

  return `
    <div class="billing-card billing-card-due" data-student-id="${student.student_id}">
      <div class="billing-card-header">
        <label class="billing-checkbox-label">
          <input type="checkbox" class="billing-checkbox" data-student-id="${student.student_id}"
                 data-student-name="${student.student_name}" data-cycle="${student.cycle_number}"
                 data-start-date="${student.start_date}" data-days="${student.daysCount}"
                 data-cycle-end="${student.cycleEndDate || ''}" data-cycle-target="${target}">
          <span class="billing-student-name">${student.student_name}</span>
        </label>
        <span class="billing-badge billing-badge-due">DUE</span>
      </div>
      <div class="billing-card-body">
        <div class="billing-progress-bar">
          <div class="billing-progress-fill billing-progress-due" style="width: 100%"></div>
        </div>
        <div class="billing-stats">
          <span><strong>${student.daysCount}/${target}</strong> days</span>
          <span>Cycle #${student.cycle_number}</span>
          <span>Started: ${startDateFormatted}</span>
        </div>
        ${carryInfo}
      </div>
      <div class="billing-card-actions">
        <button class="btn btn-primary btn-sm charge-single-btn" data-student-id="${student.student_id}"
                data-student-name="${student.student_name}" data-cycle="${student.cycle_number}"
                data-start-date="${student.start_date}" data-days="${student.daysCount}"
                data-cycle-end="${student.cycleEndDate || ''}" data-cycle-target="${target}">
          Charge
        </button>
        <button class="btn btn-outline btn-sm edit-billing-btn" data-student-id="${student.student_id}"
                data-student-name="${student.student_name}" data-cycle="${student.cycle_number}"
                data-start-date="${student.start_date}">
          Edit
        </button>
        <button class="btn btn-secondary btn-sm remove-billing-btn" data-student-id="${student.student_id}">Remove</button>
      </div>
    </div>
  `;
}

// Render an approaching student card
function renderApproachingCard(student) {
  const target = student.cycleTarget || 20;
  const chargeFor = student.chargeForDays || 20;
  const progressPercent = (student.daysCount / target) * 100;
  const startDateFormatted = formatDate(student.start_date);
  const estimatedEndFormatted = student.estimatedEndDate ? formatDate(student.estimatedEndDate) : '-';

  let carryInfo = '';
  if (student.carriedDays > 0) {
    if (student.carryType === 'reduce') {
      carryInfo = `<div class="billing-carry-info">📉 Billing credit: ${student.carriedDays} days (charge for ${chargeFor} days)</div>`;
    } else {
      carryInfo = `<div class="billing-carry-info">📈 Extended cycle: +${student.carriedDays} days</div>`;
    }
  }

  return `
    <div class="billing-card billing-card-approaching" data-student-id="${student.student_id}">
      <div class="billing-card-header">
        <span class="billing-student-name">${student.student_name}</span>
        <span class="billing-badge billing-badge-approaching">${student.daysToNextCharge} days left</span>
      </div>
      <div class="billing-card-body">
        <div class="billing-progress-bar">
          <div class="billing-progress-fill billing-progress-approaching" style="width: ${progressPercent}%"></div>
        </div>
        <div class="billing-stats">
          <span><strong>${student.daysCount}/${target}</strong> days</span>
          <span>Cycle #${student.cycle_number}</span>
          <span>Started: ${startDateFormatted}</span>
        </div>
        ${carryInfo}
        <div class="billing-estimated">📅 Est. completion: <strong>${estimatedEndFormatted}</strong></div>
      </div>
      <div class="billing-card-actions">
        <button class="btn btn-warning btn-sm charge-early-btn" data-student-id="${student.student_id}"
                data-student-name="${student.student_name}" data-cycle="${student.cycle_number}"
                data-start-date="${student.start_date}" data-days="${student.daysCount}"
                data-cycle-end="${student.cycleEndDate || ''}"
                data-last-attendance="${student.lastAttendanceDate || ''}"
                data-cycle-target="${target}">
          Charge Early
        </button>
        <button class="btn btn-outline btn-sm edit-billing-btn" data-student-id="${student.student_id}"
                data-student-name="${student.student_name}" data-cycle="${student.cycle_number}"
                data-start-date="${student.start_date}">
          Edit
        </button>
        <button class="btn btn-secondary btn-sm remove-billing-btn" data-student-id="${student.student_id}">Remove</button>
      </div>
    </div>
  `;
}

// Render an in-progress student card
function renderProgressCard(student) {
  const target = student.cycleTarget || 20;
  const chargeFor = student.chargeForDays || 20;
  const progressPercent = (student.daysCount / target) * 100;
  const startDateFormatted = formatDate(student.start_date);
  const estimatedEndFormatted = student.estimatedEndDate ? formatDate(student.estimatedEndDate) : '-';

  let carryInfo = '';
  if (student.carriedDays > 0) {
    if (student.carryType === 'reduce') {
      carryInfo = `<div class="billing-carry-info">📉 Billing credit: ${student.carriedDays} days (charge for ${chargeFor} days)</div>`;
    } else {
      carryInfo = `<div class="billing-carry-info">📈 Extended cycle: +${student.carriedDays} days</div>`;
    }
  }

  return `
    <div class="billing-card billing-card-progress" data-student-id="${student.student_id}">
      <div class="billing-card-header">
        <span class="billing-student-name">${student.student_name}</span>
        <span class="billing-badge billing-badge-progress">${student.daysToNextCharge} days left</span>
      </div>
      <div class="billing-card-body">
        <div class="billing-progress-bar">
          <div class="billing-progress-fill" style="width: ${progressPercent}%"></div>
        </div>
        <div class="billing-stats">
          <span><strong>${student.daysCount}/${target}</strong> days</span>
          <span>Cycle #${student.cycle_number}</span>
          <span>Started: ${startDateFormatted}</span>
        </div>
        ${carryInfo}
        <div class="billing-estimated">📅 Est. completion: <strong>${estimatedEndFormatted}</strong></div>
      </div>
      <div class="billing-card-actions">
        <button class="btn btn-warning btn-sm charge-early-btn" data-student-id="${student.student_id}"
                data-student-name="${student.student_name}" data-cycle="${student.cycle_number}"
                data-start-date="${student.start_date}" data-days="${student.daysCount}"
                data-cycle-end="${student.cycleEndDate || ''}"
                data-last-attendance="${student.lastAttendanceDate || ''}"
                data-cycle-target="${target}">
          Charge Early
        </button>
        <button class="btn btn-outline btn-sm edit-billing-btn" data-student-id="${student.student_id}"
                data-student-name="${student.student_name}" data-cycle="${student.cycle_number}"
                data-start-date="${student.start_date}">
          Edit
        </button>
        <button class="btn btn-secondary btn-sm remove-billing-btn" data-student-id="${student.student_id}">Remove</button>
      </div>
    </div>
  `;
}

// Render billing history
function renderBillingHistory() {
  const historyList = document.getElementById('billingHistoryList');

  if (billingHistory.length === 0) {
    historyList.innerHTML = '<p class="info-text">No charge history yet.</p>';
    return;
  }

  historyList.innerHTML = `
    <table class="report-table billing-history-table">
      <thead>
        <tr>
          <th>Charged Date</th>
          <th>Student Name</th>
          <th>Amount</th>
          <th>Period</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${billingHistory.map(record => {
          const paidDateStr = record.paid_date ? ` (${formatDate(record.paid_date)})` : '';
          return `
          <tr class="history-row ${record.payment_status === 'paid' ? 'history-paid' : 'history-unpaid'}">
            <td>${formatDate(record.charged_date)}</td>
            <td>${record.student_name}</td>
            <td>${record.tuition_amount ? `${record.currency || '₱'}${record.tuition_amount.toLocaleString()}` : '-'}</td>
            <td>${formatDate(record.cycle_start_date)} - ${formatDate(record.cycle_end_date)}</td>
            <td>
              <span class="payment-status-badge ${record.payment_status === 'paid' ? 'status-paid' : 'status-unpaid'}">
                ${record.payment_status === 'paid' ? '납부완료' + paidDateStr : '미납'}
              </span>
            </td>
            <td>
              <button class="btn btn-sm btn-outline view-slip-btn" data-history-id="${record.id}">View Slip</button>
              <button class="btn btn-sm btn-danger delete-history-btn" data-history-id="${record.id}" data-student-name="${record.student_name}">Delete</button>
            </td>
          </tr>
        `;}).join('')}
      </tbody>
    </table>
  `;

  // Add click event listeners to view slip buttons
  historyList.querySelectorAll('.view-slip-btn').forEach(btn => {
    btn.addEventListener('click', handleViewSlipFromHistory);
  });

  // Add click event listeners to delete buttons
  historyList.querySelectorAll('.delete-history-btn').forEach(btn => {
    btn.addEventListener('click', handleDeleteHistory);
  });
}

// Add student to billing tracking
async function addStudentToBilling() {
  const select = document.getElementById('billingStudentSelect');
  const startDateInput = document.getElementById('billingStartDate');

  const studentId = select.value;
  const studentName = select.options[select.selectedIndex].dataset.name;
  const startDate = startDateInput.value;

  if (!studentId) {
    alert('Please select a student.');
    return;
  }

  if (!startDate) {
    alert('Please select a start date.');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/billing/tracking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ studentId, studentName, startDate })
    });

    const data = await response.json();

    if (data.success) {
      // Reset form
      select.value = '';
      startDateInput.value = getLocalDateString();

      // Reload data
      await loadBillingData();

      alert(`${studentName} has been added to billing tracking.`);
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error adding student to billing:', error);
    alert(`Error: ${error.message}`);
  }
}

// Handle checkbox change for charge selection
function handleChargeCheckboxChange(e) {
  const checkbox = e.target;
  const studentId = checkbox.dataset.studentId;

  if (checkbox.checked) {
    selectedForCharge.add(studentId);
  } else {
    selectedForCharge.delete(studentId);
  }

  // Update charge button text
  const chargeBtn = document.getElementById('chargeSelectedBtn');
  if (selectedForCharge.size > 0) {
    chargeBtn.textContent = `Mark ${selectedForCharge.size} Selected as Charged`;
    chargeBtn.disabled = false;
  } else {
    chargeBtn.textContent = 'Mark Selected as Charged';
    chargeBtn.disabled = true;
  }
}

// Handle single student charge - show tuition modal
async function handleSingleCharge(e) {
  const btn = e.target;
  const studentId = btn.dataset.studentId;
  const studentName = btn.dataset.studentName;
  const cycleNumber = parseInt(btn.dataset.cycle);
  const cycleStartDate = btn.dataset.startDate;
  const daysCount = parseInt(btn.dataset.days);
  // Use cycleEndDate if due (20+ days), otherwise use lastAttendanceDate for early charges
  const cycleEndDate = btn.dataset.cycleEnd || btn.dataset.lastAttendance || getLocalDateString();

  // Store charging student data
  chargingStudent = {
    studentId,
    studentName,
    cycleNumber,
    cycleStartDate,
    daysCount,
    cycleEndDate
  };

  // Fetch attendance dates for this student
  try {
    const response = await fetch(`${API_URL}/billing/attendance-dates/${studentId}?startDate=${cycleStartDate}&limit=20`);
    const data = await response.json();

    if (data.success) {
      chargingAttendanceDates = data.dates;
    } else {
      chargingAttendanceDates = [];
    }
  } catch (error) {
    console.error('Error fetching attendance dates:', error);
    chargingAttendanceDates = [];
  }

  // Show charge modal
  showChargeModal();
}

// Charge selected students
async function chargeSelectedStudents() {
  if (selectedForCharge.size === 0) {
    alert('Please select students to charge.');
    return;
  }

  const confirmMsg = `Mark ${selectedForCharge.size} student(s) as charged?\n\nThis will record the charges and reset their counters.`;

  if (!confirm(confirmMsg)) return;

  const checkboxes = document.querySelectorAll('.billing-checkbox:checked');

  for (const checkbox of checkboxes) {
    const studentId = checkbox.dataset.studentId;
    const studentName = checkbox.dataset.studentName;
    const cycleNumber = parseInt(checkbox.dataset.cycle);
    const cycleStartDate = checkbox.dataset.startDate;
    const daysCount = parseInt(checkbox.dataset.days);
    const cycleEndDate = checkbox.dataset.cycleEnd || getLocalDateString();

    await chargeStudent(studentId, studentName, cycleNumber, daysCount, cycleStartDate, cycleEndDate);
  }

  selectedForCharge.clear();
}

// Charge a single student
async function chargeStudent(studentId, studentName, cycleNumber, daysCount, cycleStartDate, cycleEndDate) {
  try {
    const response = await fetch(`${API_URL}/billing/charge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        studentId,
        studentName,
        cycleNumber,
        daysCount,
        cycleStartDate,
        cycleEndDate
      })
    });

    const data = await response.json();

    if (data.success) {
      console.log(`Charged ${studentName} - new cycle starts ${data.newStartDate}`);
      // Reload data
      await loadBillingData();
      await loadBillingHistory();
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error charging student:', error);
    alert(`Error charging ${studentName}: ${error.message}`);
  }
}

// Handle remove student from tracking
async function handleRemoveStudent(e) {
  const btn = e.target;
  const studentId = btn.dataset.studentId;
  const card = btn.closest('.billing-card');
  const studentName = card.querySelector('.billing-student-name').textContent;

  if (!confirm(`Remove ${studentName} from billing tracking?\n\nThis will stop tracking their attendance for billing. Their history will be preserved.`)) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/billing/tracking/${studentId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      await loadBillingData();
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error removing student:', error);
    alert(`Error: ${error.message}`);
  }
}

// Export billing history to CSV
function exportBillingHistory() {
  if (billingHistory.length === 0) {
    alert('No history to export.');
    return;
  }

  const headers = ['Charged Date', 'Student Name', 'Cycle Number', 'Days Counted', 'Cycle Start', 'Cycle End'];
  const rows = billingHistory.map(record => [
    record.charged_date,
    `"${record.student_name}"`,
    record.cycle_number,
    record.days_counted,
    record.cycle_start_date,
    record.cycle_end_date
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `billing-history-${getLocalDateString()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Update the tab badge with due count
function updateBillingBadge(dueCount) {
  const tabBtn = document.getElementById('billingTabBtn');

  if (dueCount > 0) {
    tabBtn.innerHTML = `20-Day Billing <span class="tab-badge">${dueCount}</span>`;
  } else {
    tabBtn.textContent = '20-Day Billing';
  }
}

// Helper: Format date for display
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// ==================== EDIT FUNCTIONALITY ====================

// Handle edit button click
function handleEditStudent(e) {
  const btn = e.target;
  const studentId = btn.dataset.studentId;
  const studentName = btn.dataset.studentName;
  const cycleNumber = btn.dataset.cycle;
  const startDate = btn.dataset.startDate;

  // Find the student in billingStudents to get carried days info
  const student = billingStudents.find(s => s.student_id === studentId);
  const carriedDays = student?.carriedDays || 0;
  const carryType = student?.carryType || 'reduce';

  // Store the student being edited
  editingStudent = {
    studentId,
    studentName,
    cycleNumber,
    startDate,
    carriedDays,
    carryType
  };

  // Populate modal
  document.getElementById('editStudentName').textContent = studentName;
  document.getElementById('editStartDateInput').value = startDate;
  document.getElementById('editCurrentCycle').textContent = `#${cycleNumber}`;
  document.getElementById('editCurrentStartDate').textContent = formatDate(startDate);

  // Show current carry-over info if any
  const carryInfoEl = document.getElementById('editCurrentCarryInfo');
  const carryTextEl = document.getElementById('editCurrentCarryText');
  if (carriedDays > 0) {
    carryInfoEl.style.display = 'block';
    carryTextEl.textContent = `${carriedDays} days (${carryType === 'reduce' ? 'Reduce' : 'Extend'})`;
  } else {
    carryInfoEl.style.display = 'none';
  }

  // Populate carried days input
  document.getElementById('editCarriedDaysInput').value = carriedDays;
  if (carriedDays > 0) {
    document.getElementById('editCarryTypeSection').style.display = 'block';
    document.querySelector(`input[name="editCarryType"][value="${carryType}"]`).checked = true;
    updateEditCarryDescription();
  } else {
    document.getElementById('editCarryTypeSection').style.display = 'none';
  }

  // Show modal
  document.getElementById('billingEditModal').classList.add('show');
}

// Handle carried days input change in edit modal
function handleEditCarriedDaysChange() {
  const days = parseInt(document.getElementById('editCarriedDaysInput').value) || 0;
  const carryTypeSection = document.getElementById('editCarryTypeSection');

  if (days > 0) {
    carryTypeSection.style.display = 'block';
    updateEditCarryDescription();
  } else {
    carryTypeSection.style.display = 'none';
  }
}

// Update carry description in edit modal
function updateEditCarryDescription() {
  const days = parseInt(document.getElementById('editCarriedDaysInput').value) || 0;
  const carryType = document.querySelector('input[name="editCarryType"]:checked')?.value || 'reduce';
  const descEl = document.getElementById('editCarryDescription');

  if (carryType === 'reduce') {
    const chargeFor = 20 - days;
    descEl.innerHTML = `<strong>Cycle: 20 days, Charge for: ${chargeFor} days</strong>. Student completes 20 days but pays for only ${chargeFor}.`;
  } else {
    const target = 20 + days;
    descEl.innerHTML = `<strong>Cycle: ${target} days, Charge for: 20 days</strong>. Student completes ${target} days (gets ${days} extra).`;
  }
}

// Handle edit save
async function handleEditSave() {
  if (!editingStudent) return;

  const newStartDate = document.getElementById('editStartDateInput').value;
  const carriedDays = parseInt(document.getElementById('editCarriedDaysInput').value) || 0;
  const carryType = carriedDays > 0 ? (document.querySelector('input[name="editCarryType"]:checked')?.value || 'reduce') : null;

  if (!newStartDate) {
    alert('Please select a start date.');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/billing/tracking/${editingStudent.studentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        startDate: newStartDate,
        carriedDays: carriedDays,
        carryType: carryType
      })
    });

    const data = await response.json();

    if (data.success) {
      // Save name before closing (handleEditCancel sets editingStudent to null)
      const studentName = editingStudent.studentName;

      // Close modal
      handleEditCancel();

      // Reload data
      await loadBillingData();

      alert(`Settings updated for ${studentName}.`);
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error updating settings:', error);
    alert(`Error: ${error.message}`);
  }
}

// Handle edit cancel
function handleEditCancel() {
  document.getElementById('billingEditModal').classList.remove('show');
  document.getElementById('editStartDateInput').value = '';
  document.getElementById('editCarriedDaysInput').value = '0';
  document.getElementById('editCarryTypeSection').style.display = 'none';
  document.getElementById('editCurrentCarryInfo').style.display = 'none';
  document.querySelector('input[name="editCarryType"][value="reduce"]').checked = true;
  editingStudent = null;
}

// ==================== CHARGE SLIP FUNCTIONALITY ====================

// Show charge modal with tuition input
async function showChargeModal() {
  if (!chargingStudent) return;

  // Calculate class period string
  const startDateFormatted = formatDateKorean(chargingStudent.cycleStartDate);
  const endDateFormatted = formatDateKorean(chargingStudent.cycleEndDate);
  const classPeriod = `${startDateFormatted} - ${endDateFormatted}`;

  // Populate modal
  document.getElementById('chargeStudentName').textContent = chargingStudent.studentName;
  document.getElementById('chargeClassPeriod').textContent = classPeriod;
  document.getElementById('chargeDaysCount').textContent = chargingStudent.daysCount;
  document.getElementById('chargeTuitionInput').value = '';

  // Reset custom dates section (hidden by default)
  document.getElementById('useCustomDatesCheck').checked = false;
  document.getElementById('customDatesSection').style.display = 'none';
  document.getElementById('chargeStartDate').value = chargingStudent.cycleStartDate;
  document.getElementById('chargeEndDate').value = chargingStudent.cycleEndDate;

  // Fetch and display absences for this period
  await fetchAndDisplayAbsences();

  // Show modal
  document.getElementById('billingChargeModal').classList.add('show');

  // Focus on tuition input
  setTimeout(() => document.getElementById('chargeTuitionInput').focus(), 100);
}

// Fetch absences and display in charge modal
async function fetchAndDisplayAbsences() {
  if (!chargingStudent) return;

  try {
    const response = await fetch(`${API_URL}/billing/absences/${chargingStudent.studentId}?startDate=${chargingStudent.cycleStartDate}&endDate=${chargingStudent.cycleEndDate}`);
    const data = await response.json();

    if (data.success) {
      const absencesCount = data.count || 0;
      chargingStudent.absencesInPeriod = absencesCount;
      chargingStudent.absenceDates = data.dates || [];

      // Update absences display
      document.getElementById('chargeAbsencesCount').textContent = absencesCount;

      // Show carry-over options if there are absences
      const carryOverOptions = document.getElementById('carryOverOptions');
      if (absencesCount > 0) {
        carryOverOptions.style.display = 'block';
        // Reset to 'none' by default
        document.querySelector('input[name="carryOverType"][value="none"]').checked = true;
        updateCarryOverDescription();
      } else {
        carryOverOptions.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Error fetching absences:', error);
    document.getElementById('chargeAbsencesCount').textContent = '0';
    document.getElementById('carryOverOptions').style.display = 'none';
  }
}

// Update carry-over description based on selection
function updateCarryOverDescription() {
  const selectedType = document.querySelector('input[name="carryOverType"]:checked')?.value || 'none';
  const absencesCount = chargingStudent?.absencesInPeriod || 0;
  const descEl = document.getElementById('carryOverDescription');

  if (selectedType === 'none') {
    descEl.innerHTML = '<em>No carry-over. Next cycle will be the standard 20 days.</em>';
  } else if (selectedType === 'reduce') {
    const chargeFor = 20 - absencesCount;
    descEl.innerHTML = `<strong>REDUCE:</strong> Next cycle = 20 days, but charge for only ${chargeFor} days. Student gets billing credit.`;
  } else if (selectedType === 'extend') {
    const nextTarget = 20 + absencesCount;
    descEl.innerHTML = `<strong>EXTEND:</strong> Next cycle = ${nextTarget} days (20 + ${absencesCount}). Student completes extra days, pays for 20.`;
  }
}

// Show manual absences input section
function showManualAbsencesInput() {
  document.getElementById('manualAbsencesSection').style.display = 'block';
  const currentAbsences = chargingStudent?.absencesInPeriod || 0;
  document.getElementById('manualAbsencesInput').value = currentAbsences;
  document.getElementById('manualAbsencesInput').focus();
}

// Hide manual absences input section
function hideManualAbsencesInput() {
  document.getElementById('manualAbsencesSection').style.display = 'none';
}

// Apply manual absences count
function applyManualAbsences() {
  const input = document.getElementById('manualAbsencesInput');
  const newAbsences = parseInt(input.value) || 0;

  if (newAbsences < 0 || newAbsences > 20) {
    alert('Absences must be between 0 and 20');
    input.focus();
    return;
  }

  // Update the charging student absences
  if (chargingStudent) {
    chargingStudent.absencesInPeriod = newAbsences;
    chargingStudent.isManualAbsences = true; // Flag to indicate manual override
  }

  // Update display
  document.getElementById('chargeAbsencesCount').textContent = newAbsences;

  // Show/hide carry-over options based on new count
  const carryOverOptions = document.getElementById('carryOverOptions');
  if (newAbsences > 0) {
    carryOverOptions.style.display = 'block';
    document.querySelector('input[name="carryOverType"][value="none"]').checked = true;
    updateCarryOverDescription();
  } else {
    carryOverOptions.style.display = 'none';
  }

  // Hide the manual input section
  hideManualAbsencesInput();
}

// Handle generate slip button
function handleGenerateSlip() {
  const tuitionInput = document.getElementById('chargeTuitionInput');
  const currencySelect = document.getElementById('chargeCurrencySelect');
  const useCustomDates = document.getElementById('useCustomDatesCheck').checked;
  const tuitionAmount = tuitionInput.value;
  const currency = currencySelect.value;

  if (!tuitionAmount || tuitionAmount <= 0) {
    alert('Please enter a valid tuition amount.');
    tuitionInput.focus();
    return;
  }

  // Store tuition amount and currency
  chargingStudent.tuitionAmount = parseFloat(tuitionAmount);
  chargingStudent.currency = currency;

  // Use custom dates only if checkbox is checked
  if (useCustomDates) {
    const startDateInput = document.getElementById('chargeStartDate');
    const endDateInput = document.getElementById('chargeEndDate');
    const customStartDate = startDateInput.value;
    const customEndDate = endDateInput.value;
    const today = getLocalDateString();

    if (!customStartDate || !customEndDate) {
      alert('Please enter both start and end dates.');
      return;
    }

    if (customStartDate > customEndDate) {
      alert('Start date must be before end date.');
      startDateInput.focus();
      return;
    }

    if (customEndDate > today) {
      alert('End date cannot be in the future.');
      endDateInput.focus();
      return;
    }

    chargingStudent.cycleStartDate = customStartDate;
    chargingStudent.cycleEndDate = customEndDate;
  } else {
    // Even for auto dates, validate end date is not in the future
    const today = getLocalDateString();
    if (chargingStudent.cycleEndDate > today) {
      chargingStudent.cycleEndDate = today;
    }
  }

  // Capture carry-over selection
  const carryOverType = document.querySelector('input[name="carryOverType"]:checked')?.value || 'none';
  if (carryOverType !== 'none' && chargingStudent.absencesInPeriod > 0) {
    chargingStudent.carryType = carryOverType;
    chargingStudent.carriedToNext = chargingStudent.absencesInPeriod;
  } else {
    chargingStudent.carryType = null;
    chargingStudent.carriedToNext = 0;
  }

  // Hide charge modal
  document.getElementById('billingChargeModal').classList.remove('show');

  // Generate and show slip preview
  generateSlipPreview();
}

// Handle charge cancel
function handleChargeCancel() {
  document.getElementById('billingChargeModal').classList.remove('show');
  document.getElementById('chargeTuitionInput').value = '';
  document.getElementById('useCustomDatesCheck').checked = false;
  document.getElementById('customDatesSection').style.display = 'none';
  document.getElementById('chargeStartDate').value = '';
  document.getElementById('chargeEndDate').value = '';
  // Reset absences section
  document.getElementById('chargeAbsencesCount').textContent = '0';
  document.getElementById('carryOverOptions').style.display = 'none';
  document.getElementById('manualAbsencesSection').style.display = 'none';
  document.getElementById('manualAbsencesInput').value = '0';
  document.querySelector('input[name="carryOverType"][value="none"]').checked = true;
  chargingStudent = null;
  chargingAttendanceDates = [];
}

// Generate slip preview
function generateSlipPreview() {
  if (!chargingStudent) return;

  // Calculate class period
  const startDateFormatted = formatDateKorean(chargingStudent.cycleStartDate);
  const endDateFormatted = formatDateKorean(chargingStudent.cycleEndDate);
  const classPeriod = `${startDateFormatted} - ${endDateFormatted}`;

  // Populate slip
  document.getElementById('slipStudentName').textContent = chargingStudent.studentName;
  document.getElementById('slipClassPeriod').textContent = classPeriod;
  document.getElementById('slipTuitionAmount').textContent = `${chargingStudent.currency}${chargingStudent.tuitionAmount.toLocaleString()}`;
  document.getElementById('slipDatesCount').textContent = chargingAttendanceDates.length;

  // Populate attendance dates grid
  const datesGrid = document.getElementById('slipDatesGrid');
  datesGrid.innerHTML = chargingAttendanceDates.map(date => {
    const d = new Date(date + 'T00:00:00');
    const formatted = `${d.getMonth() + 1}/${d.getDate()}`;
    return `<div class="date-item">${formatted}</div>`;
  }).join('');

  // Show carry-over info if applicable
  const carryOverSection = document.getElementById('slipCarryOverSection');
  const carryOverText = document.getElementById('slipCarryOverText');

  if (chargingStudent.carriedToNext > 0 && chargingStudent.carryType) {
    carryOverSection.style.display = 'block';
    const absences = chargingStudent.absencesInPeriod || 0;

    if (chargingStudent.carryType === 'reduce') {
      const nextTarget = 20 - chargingStudent.carriedToNext;
      carryOverText.innerHTML = `결석 (Absences): ${absences}일 | 다음 수업: ${nextTarget}일 (20 - ${chargingStudent.carriedToNext})<br><em>📉 Reduced next cycle - pay for ${nextTarget} days only</em>`;
    } else if (chargingStudent.carryType === 'extend') {
      const nextTarget = 20 + chargingStudent.carriedToNext;
      carryOverText.innerHTML = `결석 (Absences): ${absences}일 | 다음 수업: ${nextTarget}일 (20 + ${chargingStudent.carriedToNext})<br><em>📈 Extended next cycle - ${chargingStudent.carriedToNext} extra days added</em>`;
    }
  } else {
    carryOverSection.style.display = 'none';
  }

  // Set footer date
  const today = new Date();
  const footerDate = today.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  document.getElementById('slipFooter').textContent = `Generated on ${footerDate}`;

  // Show slip modal
  document.getElementById('billingSlipModal').classList.add('show');
}

// Handle slip close
function handleSlipClose() {
  document.getElementById('billingSlipModal').classList.remove('show');
}

// Download slip as image
async function downloadSlipAsImage() {
  const slipContainer = document.getElementById('slipContainer');
  const downloadBtn = document.getElementById('slipDownloadBtn');

  // Get student name from either charging or viewing history
  let studentName = 'student';
  if (chargingStudent && chargingStudent.studentName) {
    studentName = chargingStudent.studentName;
  } else if (viewingHistoryRecord && viewingHistoryRecord.student_name) {
    studentName = viewingHistoryRecord.student_name;
  }

  try {
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Generating...';

    // Use html2canvas to convert to image
    const canvas = await html2canvas(slipContainer, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true
    });

    // Convert canvas to blob and download
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileName = `charge-slip-${studentName.replace(/[^a-zA-Z0-9가-힣]/g, '-')}-${getLocalDateString()}.png`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Download as Image';
    });
  } catch (error) {
    console.error('Error generating slip image:', error);
    alert('Error generating image. Please try again.');
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download as Image';
  }
}

// Confirm and save the charge
async function confirmAndSaveCharge() {
  if (!chargingStudent) return;

  const confirmBtn = document.getElementById('slipConfirmChargeBtn');

  try {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving...';

    // Save the charge with slip data and carry-over info
    const response = await fetch(`${API_URL}/billing/charge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        studentId: chargingStudent.studentId,
        studentName: chargingStudent.studentName,
        cycleNumber: chargingStudent.cycleNumber,
        daysCount: chargingStudent.daysCount,
        cycleStartDate: chargingStudent.cycleStartDate,
        cycleEndDate: chargingStudent.cycleEndDate,
        tuitionAmount: chargingStudent.tuitionAmount,
        currency: chargingStudent.currency,
        attendanceDates: chargingAttendanceDates,
        absencesInPeriod: chargingStudent.absencesInPeriod || 0,
        carriedToNext: chargingStudent.carriedToNext || 0,
        carryType: chargingStudent.carryType || null
      })
    });

    const data = await response.json();

    if (data.success) {
      // Close slip modal
      handleSlipClose();

      // Reset charging data
      chargingStudent = null;
      chargingAttendanceDates = [];

      // Reload billing data
      await loadBillingData();
      await loadBillingHistory();

      alert('Charge saved successfully! New cycle has started.');
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error saving charge:', error);
    alert(`Error: ${error.message}`);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm & Save Charge';
  }
}

// Helper: Format date in Korean style (월 일)
function formatDateKorean(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr + 'T00:00:00');
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}월 ${day}일`;
}

// ==================== VIEW SLIP FROM HISTORY ====================

let viewingHistoryRecord = null;

// Handle view slip from history
async function handleViewSlipFromHistory(e) {
  const btn = e.target;
  const historyId = btn.dataset.historyId;

  try {
    // Fetch the history record
    const response = await fetch(`${API_URL}/billing/history/${historyId}`);
    const data = await response.json();

    if (data.success) {
      viewingHistoryRecord = data.record;
      generateSlipFromHistory(data.record);
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error fetching history record:', error);
    alert(`Error: ${error.message}`);
  }
}

// Generate slip from history record
function generateSlipFromHistory(record) {
  // Calculate class period
  const startDateFormatted = formatDateKorean(record.cycle_start_date);
  const endDateFormatted = formatDateKorean(record.cycle_end_date);
  const classPeriod = `${startDateFormatted} - ${endDateFormatted}`;

  // Populate slip
  document.getElementById('slipStudentName').textContent = record.student_name;
  document.getElementById('slipClassPeriod').textContent = classPeriod;

  // Set tuition amount
  if (record.tuition_amount) {
    document.getElementById('slipTuitionAmount').textContent = `${record.currency || '₱'}${record.tuition_amount.toLocaleString()}`;
  } else {
    document.getElementById('slipTuitionAmount').textContent = '-';
  }

  // Parse and display attendance dates
  const attendanceDates = record.attendance_dates || [];
  document.getElementById('slipDatesCount').textContent = attendanceDates.length;

  const datesGrid = document.getElementById('slipDatesGrid');
  if (attendanceDates.length > 0) {
    datesGrid.innerHTML = attendanceDates.map(date => {
      const d = new Date(date + 'T00:00:00');
      const formatted = `${d.getMonth() + 1}/${d.getDate()}`;
      return `<div class="date-item">${formatted}</div>`;
    }).join('');
  } else {
    datesGrid.innerHTML = '<div class="date-item">No dates recorded</div>';
  }

  // Update payment status display
  const paymentStatusEl = document.querySelector('#slipContainer .slip-value.slip-unpaid, #slipContainer .slip-value.slip-paid');
  if (paymentStatusEl) {
    if (record.payment_status === 'paid') {
      const paidDateFormatted = record.paid_date ? formatDateKorean(record.paid_date) : '';
      paymentStatusEl.textContent = paidDateFormatted ? `납부완료 (${paidDateFormatted})` : '납부완료';
      paymentStatusEl.classList.remove('slip-unpaid');
      paymentStatusEl.classList.add('slip-paid');
    } else {
      paymentStatusEl.textContent = '미납';
      paymentStatusEl.classList.remove('slip-paid');
      paymentStatusEl.classList.add('slip-unpaid');
    }
  }

  // Set footer date
  const footerDate = formatDate(record.charged_date);
  document.getElementById('slipFooter').textContent = `Generated on ${footerDate}`;

  // Update buttons for history view mode
  const confirmBtn = document.getElementById('slipConfirmChargeBtn');
  if (record.payment_status === 'paid') {
    confirmBtn.textContent = 'Mark as Unpaid';
    confirmBtn.classList.remove('btn-success');
    confirmBtn.classList.add('btn-warning');
  } else {
    confirmBtn.textContent = 'Mark as Paid';
    confirmBtn.classList.remove('btn-warning');
    confirmBtn.classList.add('btn-success');
  }

  // Change button handler for history mode
  confirmBtn.onclick = () => togglePaymentStatus(record.id, record.payment_status);

  // Show slip modal
  document.getElementById('billingSlipModal').classList.add('show');
}

// Toggle payment status
async function togglePaymentStatus(historyId, currentStatus) {
  const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
  const confirmBtn = document.getElementById('slipConfirmChargeBtn');

  // If marking as paid, prompt for the payment date
  let paidDate = null;
  if (newStatus === 'paid') {
    const today = getLocalDateString();
    paidDate = prompt('Enter payment date (YYYY-MM-DD):', today);

    if (paidDate === null) {
      // User cancelled
      return;
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
      alert('Invalid date format. Please use YYYY-MM-DD format.');
      return;
    }
  }

  try {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Updating...';

    const response = await fetch(`${API_URL}/billing/history/${historyId}/payment`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: newStatus, paidDate: paidDate })
    });

    const data = await response.json();

    if (data.success) {
      // Update viewing record
      viewingHistoryRecord.payment_status = newStatus;
      viewingHistoryRecord.paid_date = paidDate;

      // Update slip display
      const paymentStatusEl = document.querySelector('#slipContainer .slip-value.slip-unpaid, #slipContainer .slip-value.slip-paid');
      if (paymentStatusEl) {
        if (newStatus === 'paid') {
          const paidDateFormatted = formatDateKorean(paidDate);
          paymentStatusEl.textContent = `납부완료 (${paidDateFormatted})`;
          paymentStatusEl.classList.remove('slip-unpaid');
          paymentStatusEl.classList.add('slip-paid');
        } else {
          paymentStatusEl.textContent = '미납';
          paymentStatusEl.classList.remove('slip-paid');
          paymentStatusEl.classList.add('slip-unpaid');
        }
      }

      // Update button
      if (newStatus === 'paid') {
        confirmBtn.textContent = 'Mark as Unpaid';
        confirmBtn.classList.remove('btn-success');
        confirmBtn.classList.add('btn-warning');
      } else {
        confirmBtn.textContent = 'Mark as Paid';
        confirmBtn.classList.remove('btn-warning');
        confirmBtn.classList.add('btn-success');
      }

      // Update onclick handler
      confirmBtn.onclick = () => togglePaymentStatus(historyId, newStatus);

      // Reload history
      await loadBillingHistory();

      const msg = newStatus === 'paid' ? `납부완료 (Paid on ${paidDate})` : '미납 (Unpaid)';
      alert(`Payment status updated to ${msg}`);
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error updating payment status:', error);
    alert(`Error: ${error.message}`);
  } finally {
    confirmBtn.disabled = false;
  }
}

// Override slip close to reset state
const originalHandleSlipClose = handleSlipClose;
handleSlipClose = function() {
  // Reset viewing record
  viewingHistoryRecord = null;

  // Reset confirm button to original state
  const confirmBtn = document.getElementById('slipConfirmChargeBtn');
  confirmBtn.textContent = 'Confirm & Save Charge';
  confirmBtn.classList.remove('btn-warning');
  confirmBtn.classList.add('btn-success');
  confirmBtn.onclick = confirmAndSaveCharge;

  // Call original close
  document.getElementById('billingSlipModal').classList.remove('show');
};

// ==================== DELETE HISTORY ====================

// Handle delete history record
async function handleDeleteHistory(e) {
  const btn = e.target;
  const historyId = btn.dataset.historyId;
  const studentName = btn.dataset.studentName;

  if (!confirm(`Delete charge record for ${studentName}?\n\nThis action cannot be undone.`)) {
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = 'Deleting...';

    const response = await fetch(`${API_URL}/billing/history/${historyId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      // Reload history
      await loadBillingHistory();
      alert('Record deleted successfully.');
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error deleting history record:', error);
    alert(`Error: ${error.message}`);
    btn.disabled = false;
    btn.textContent = 'Delete';
  }
}

// ==================== HOLIDAY MANAGEMENT ====================

// Load holidays
async function loadHolidays() {
  try {
    const response = await fetch(`${API_URL}/billing/holidays`);
    const data = await response.json();

    if (data.success) {
      billingHolidays = data.holidays;
      renderHolidays();
    }
  } catch (error) {
    console.error('Error loading holidays:', error);
  }
}

// Render holidays list
function renderHolidays() {
  const holidayList = document.getElementById('holidayList');

  if (billingHolidays.length === 0) {
    holidayList.innerHTML = '<span class="info-text">No holidays added yet.</span>';
    return;
  }

  holidayList.innerHTML = billingHolidays.map(holiday => {
    const dateFormatted = formatDate(holiday.date);
    const desc = holiday.description ? ` - ${holiday.description}` : '';
    return `
      <div class="holiday-tag" data-date="${holiday.date}">
        <span class="holiday-date">${dateFormatted}</span>
        <span class="holiday-desc">${desc}</span>
        <span class="holiday-remove" onclick="removeHoliday('${holiday.date}')">&times;</span>
      </div>
    `;
  }).join('');
}

// Handle add holiday
async function handleAddHoliday() {
  const dateInput = document.getElementById('holidayDateInput');
  const descInput = document.getElementById('holidayDescInput');
  const date = dateInput.value;
  const description = descInput.value.trim();

  if (!date) {
    alert('Please select a date.');
    dateInput.focus();
    return;
  }

  try {
    const response = await fetch(`${API_URL}/billing/holidays`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ date, description })
    });

    const data = await response.json();

    if (data.success) {
      // Clear inputs
      dateInput.value = '';
      descInput.value = '';

      // Reload holidays and billing data (to refresh estimated dates)
      await loadHolidays();
      await loadBillingData();
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error adding holiday:', error);
    alert(`Error: ${error.message}`);
  }
}

// Remove holiday
async function removeHoliday(date) {
  if (!confirm(`Remove holiday on ${formatDate(date)}?`)) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/billing/holidays/${date}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      // Reload holidays and billing data (to refresh estimated dates)
      await loadHolidays();
      await loadBillingData();
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error removing holiday:', error);
    alert(`Error: ${error.message}`);
  }
}
