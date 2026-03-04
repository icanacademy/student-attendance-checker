// Modal handling for late and absent reasons

let currentStudentData = null;
let allStudents = [];
let classAssignments = {};
let undertimeClassAssignments = {};

// Initialize modal handlers
function initializeModals() {
  // Load students for modal dropdowns
  loadStudentsForModals();

  // Populate reason dropdowns
  populateLateReasons();
  populateAbsentReasons();
  populateUndertimeReasons();

  // Late modal handlers
  document.getElementById('lateReasonSelect').addEventListener('change', function() {
    const customContainer = document.getElementById('lateCustomReasonContainer');
    customContainer.style.display = this.value === 'Other (specify)' ? 'block' : 'none';
  });

  document.getElementById('lateSaveBtn').addEventListener('click', saveLateAttendance);
  document.getElementById('lateCancelBtn').addEventListener('click', () => closeLateModal(true));

  // Absent modal handlers
  document.getElementById('absentReasonSelect').addEventListener('change', function() {
    const customContainer = document.getElementById('absentCustomReasonContainer');
    customContainer.style.display = this.value === 'Other (specify)' ? 'block' : 'none';
  });

  document.getElementById('absentSaveBtn').addEventListener('click', saveAbsentAttendance);
  document.getElementById('absentCancelBtn').addEventListener('click', () => closeAbsentModal(true));

  // Undertime modal handlers
  document.getElementById('undertimeReasonSelect').addEventListener('change', function() {
    const customContainer = document.getElementById('undertimeCustomReasonContainer');
    customContainer.style.display = this.value === 'Other (specify)' ? 'block' : 'none';
  });

  document.getElementById('undertimeSaveBtn').addEventListener('click', saveUndertimeAttendance);
  document.getElementById('undertimeCancelBtn').addEventListener('click', () => closeUndertimeModal(true));

  // Close modals on outside click
  document.getElementById('lateModal').addEventListener('click', function(e) {
    if (e.target === this) closeLateModal(true);
  });

  document.getElementById('absentModal').addEventListener('click', function(e) {
    if (e.target === this) closeAbsentModal(true);
  });

  document.getElementById('undertimeModal').addEventListener('click', function(e) {
    if (e.target === this) closeUndertimeModal(true);
  });
}

// Load students from API for modal dropdowns
async function loadStudentsForModals() {
  try {
    const response = await fetch(`${API_URL}/students`);
    const data = await response.json();
    if (data.success) {
      allStudents = data.students;
    }
  } catch (error) {
    console.error('Error loading students for modals:', error);
  }
}

// Populate late reasons dropdown
function populateLateReasons() {
  const select = document.getElementById('lateReasonSelect');
  select.innerHTML = '<option value="">-- Select Reason --</option>';

  LATE_REASONS.forEach(reason => {
    const option = document.createElement('option');
    option.value = reason;
    option.textContent = reason;
    select.appendChild(option);
  });
}

// Populate absent reasons dropdown
function populateAbsentReasons() {
  const select = document.getElementById('absentReasonSelect');
  select.innerHTML = '<option value="">-- Select Reason --</option>';

  ABSENT_REASONS.forEach(reason => {
    const option = document.createElement('option');
    option.value = reason;
    option.textContent = reason;
    select.appendChild(option);
  });
}

// Open late modal
async function openLateModal(studentData) {
  currentStudentData = studentData;

  document.getElementById('lateStudentName').textContent = studentData.studentName;

  // Try to load existing data
  try {
    const selectedDate = getSelectedDate();
    const response = await fetch(`${API_URL}/attendance/student/${studentData.studentId}?date=${selectedDate}`);
    const data = await response.json();

    if (data.success && data.attendance && data.attendance.status === 'late') {
      let lateReason = data.attendance.late_reason;

      // Parse notification status from reason (format: "With notif - Traffic" or "No notif - Traffic")
      const notifiedCheckbox = document.getElementById('lateNotifiedCheckbox');
      if (lateReason && lateReason.startsWith('With notif - ')) {
        notifiedCheckbox.checked = true;
        lateReason = lateReason.replace('With notif - ', '');
      } else if (lateReason && lateReason.startsWith('No notif - ')) {
        notifiedCheckbox.checked = false;
        lateReason = lateReason.replace('No notif - ', '');
      } else {
        // Old format without notification prefix
        notifiedCheckbox.checked = false;
      }

      // Load minutes late
      if (data.attendance.minutes_late) {
        document.getElementById('lateMinutesInput').value = data.attendance.minutes_late;
      } else {
        document.getElementById('lateMinutesInput').value = '';
      }

      // Check if it's a custom reason
      const standardReasons = LATE_REASONS.filter(r => r !== 'Other (specify)');
      if (lateReason && standardReasons.includes(lateReason)) {
        document.getElementById('lateReasonSelect').value = lateReason;
        document.getElementById('lateCustomReasonContainer').style.display = 'none';
      } else if (lateReason) {
        document.getElementById('lateReasonSelect').value = 'Other (specify)';
        document.getElementById('lateCustomReason').value = lateReason;
        document.getElementById('lateCustomReasonContainer').style.display = 'block';
      } else {
        document.getElementById('lateReasonSelect').value = '';
        document.getElementById('lateCustomReasonContainer').style.display = 'none';
      }
    } else {
      document.getElementById('lateReasonSelect').value = '';
      document.getElementById('lateCustomReason').value = '';
      document.getElementById('lateCustomReasonContainer').style.display = 'none';
      document.getElementById('lateNotifiedCheckbox').checked = false;
      document.getElementById('lateMinutesInput').value = '';
    }
  } catch (error) {
    console.error('Error loading late data:', error);
    document.getElementById('lateReasonSelect').value = '';
    document.getElementById('lateCustomReason').value = '';
    document.getElementById('lateCustomReasonContainer').style.display = 'none';
    document.getElementById('lateNotifiedCheckbox').checked = false;
    document.getElementById('lateMinutesInput').value = '';
  }

  document.getElementById('lateModal').classList.add('show');
}

// Close late modal
function closeLateModal(uncheckBox = false) {
  document.getElementById('lateModal').classList.remove('show');

  // Uncheck the late checkbox only if explicitly cancelled
  if (uncheckBox && currentStudentData) {
    const lateCheckbox = document.querySelector(
      `input[data-student-id="${currentStudentData.studentId}"][data-status="late"]`
    );
    if (lateCheckbox) lateCheckbox.checked = false;
  }

  currentStudentData = null;
}

// Save late attendance
async function saveLateAttendance() {
  const reasonSelect = document.getElementById('lateReasonSelect');
  const customReason = document.getElementById('lateCustomReason');
  const notifiedCheckbox = document.getElementById('lateNotifiedCheckbox');
  const minutesLateInput = document.getElementById('lateMinutesInput');

  let reason = reasonSelect.value;
  if (reason === 'Other (specify)') {
    reason = customReason.value.trim();
    if (!reason) {
      alert('Please specify a custom reason');
      return;
    }
  } else if (!reason) {
    alert('Please select a reason');
    return;
  }

  // Get minutes late value
  const minutesLate = minutesLateInput.value ? parseInt(minutesLateInput.value) : null;

  // Combine notification status with reason
  const notificationPrefix = notifiedCheckbox.checked ? 'With notif' : 'No notif';
  const fullReason = `${notificationPrefix} - ${reason}`;

  if (!currentStudentData) return;

  const statusElement = document.getElementById(`status-${currentStudentData.studentId}`);

  try {
    statusElement.textContent = 'Saving...';
    statusElement.className = 'save-status saving';

    const response = await fetch(`${API_URL}/attendance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        date: getSelectedDate(),
        attendance: [{
          studentId: currentStudentData.studentId,
          studentName: currentStudentData.studentName,
          startTime: currentStudentData.startTime,
          endTime: currentStudentData.endTime,
          status: 'late',
          lateReason: fullReason,
          minutesLate: minutesLate
        }]
      })
    });

    const data = await response.json();

    if (data.success) {
      statusElement.textContent = '✓ Saved';
      statusElement.className = 'save-status saved';

      // Refresh the daily report to keep it in sync
      refreshDailyReportSilently();

      setTimeout(() => {
        statusElement.textContent = '';
        statusElement.className = 'save-status';
      }, 2000);

      closeLateModal();
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error saving late attendance:', error);
    statusElement.textContent = '✗ Error';
    statusElement.className = 'save-status error';
  }
}

// Open absent modal
async function openAbsentModal(studentData) {
  currentStudentData = studentData;
  classAssignments = {};

  document.getElementById('absentStudentName').textContent = studentData.studentName;

  // Try to load existing data
  let existingData = null;
  try {
    const selectedDate = getSelectedDate();
    const response = await fetch(`${API_URL}/attendance/student/${studentData.studentId}?date=${selectedDate}`);
    const data = await response.json();

    if (data.success && data.attendance && data.attendance.status === 'absent') {
      existingData = data.attendance;

      let absentReason = data.attendance.absent_reason;

      // Parse notification status from reason (format: "With notif - Sick" or "No notif - Sick")
      const notifiedCheckbox = document.getElementById('absentNotifiedCheckbox');
      if (absentReason.startsWith('With notif - ')) {
        notifiedCheckbox.checked = true;
        absentReason = absentReason.replace('With notif - ', '');
      } else if (absentReason.startsWith('No notif - ')) {
        notifiedCheckbox.checked = false;
        absentReason = absentReason.replace('No notif - ', '');
      } else {
        // Old format without notification prefix
        notifiedCheckbox.checked = false;
      }

      // Check if it's a custom reason
      const standardReasons = ABSENT_REASONS.filter(r => r !== 'Other (specify)');
      if (standardReasons.includes(absentReason)) {
        document.getElementById('absentReasonSelect').value = absentReason;
        document.getElementById('absentCustomReasonContainer').style.display = 'none';
      } else {
        document.getElementById('absentReasonSelect').value = 'Other (specify)';
        document.getElementById('absentCustomReason').value = absentReason;
        document.getElementById('absentCustomReasonContainer').style.display = 'block';
      }
    } else {
      document.getElementById('absentReasonSelect').value = '';
      document.getElementById('absentCustomReason').value = '';
      document.getElementById('absentCustomReasonContainer').style.display = 'none';
      document.getElementById('absentNotifiedCheckbox').checked = false;
    }
  } catch (error) {
    console.error('Error loading absent data:', error);
    document.getElementById('absentReasonSelect').value = '';
    document.getElementById('absentCustomReason').value = '';
    document.getElementById('absentCustomReasonContainer').style.display = 'none';
  }

  // For student attendance, we don't need class slots/substitutes
  // Just show the reason selection

  document.getElementById('absentModal').classList.add('show');
}

// Close absent modal
function closeAbsentModal(uncheckBox = false) {
  document.getElementById('absentModal').classList.remove('show');

  // Uncheck the absent checkbox only if explicitly cancelled
  if (uncheckBox && currentStudentData) {
    const absentCheckbox = document.querySelector(
      `input[data-student-id="${currentStudentData.studentId}"][data-status="absent"]`
    );
    if (absentCheckbox) absentCheckbox.checked = false;
  }

  currentStudentData = null;
  classAssignments = {};
}

// Render class slots in the modal
function renderClassSlots(classSlots, existingAssignments = []) {
  const container = document.getElementById('classSlotsList');

  if (classSlots.length === 0) {
    container.innerHTML = '<p class="info-text">No class slots found for this teacher\'s shift.</p>';
    return;
  }

  // Create a map of existing assignments by class slot
  const assignmentMap = {};
  existingAssignments.forEach(assignment => {
    assignmentMap[assignment.class_slot] = assignment;
  });

  container.innerHTML = classSlots.map((slot, index) => {
    const existingAssignment = assignmentMap[slot.label];
    const noClass = existingAssignment?.noClass || false;
    const onlineClass = existingAssignment?.onlineClass || false;
    const substituteId = existingAssignment?.substitute_teacher_id || '';

    return `
    <div class="class-slot-card" data-slot-index="${index}">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h5 style="margin: 0;">${slot.label}</h5>
        <div style="display: flex; gap: 15px;">
          <label style="display: flex; align-items: center; gap: 5px; margin: 0;">
            <input type="checkbox" class="no-class-checkbox" data-slot="${slot.label}" data-index="${index}" ${noClass ? 'checked' : ''}>
            No class scheduled
          </label>
          <label style="display: flex; align-items: center; gap: 5px; margin: 0;">
            <input type="checkbox" class="online-class-checkbox" data-slot="${slot.label}" data-index="${index}" ${onlineClass ? 'checked' : ''}>
            Online class
          </label>
        </div>
      </div>

      <div class="class-details" id="class-details-${index}" style="${(noClass || onlineClass) ? 'display: none;' : ''}">
        <label>Substitute Teacher:</label>
        <select class="sub-teacher-select" data-slot="${slot.label}">
          <option value="">-- Select Substitute --</option>
          ${teachers.map(t => `<option value="${t.id}" data-name="${t.name}" ${t.id === substituteId ? 'selected' : ''}>${t.name}</option>`).join('')}
        </select>

        <label>Students:</label>
        <select class="students-select" data-slot="${slot.label}" multiple size="5">
          ${allStudents.map(s => {
            const isSelected = existingAssignment?.students?.some(student => student.id === s.id) || false;
            return `<option value="${s.id}" data-name="${s.name}" ${isSelected ? 'selected' : ''}>${s.name}</option>`;
          }).join('')}
        </select>

        <div class="student-chips" id="students-chips-${index}"></div>
      </div>
    </div>
  `;
  }).join('');

  // Add event listeners for substitute and student selection
  container.querySelectorAll('.sub-teacher-select').forEach(select => {
    select.addEventListener('change', function() {
      const slot = this.dataset.slot;
      const studentId = this.value;
      const studentName = this.options[this.selectedIndex].dataset.name;

      if (!classAssignments[slot]) {
        classAssignments[slot] = { classSlot: slot, students: [] };
      }

      classAssignments[slot].substituteTeacherId = studentId;
      classAssignments[slot].substituteTeacherName = studentName;
    });
  });

  container.querySelectorAll('.students-select').forEach(select => {
    select.addEventListener('change', function() {
      const slot = this.dataset.slot;
      const selectedStudents = Array.from(this.selectedOptions).map(opt => ({
        id: opt.value,
        name: opt.dataset.name
      }));

      if (!classAssignments[slot]) {
        classAssignments[slot] = { classSlot: slot };
      }

      classAssignments[slot].students = selectedStudents;

      // Update chips display
      const slotIndex = this.closest('.class-slot-card').dataset.slotIndex;
      renderStudentChips(slotIndex, selectedStudents);
    });
  });

  // Add event listeners for "no class" checkboxes
  container.querySelectorAll('.no-class-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const index = this.dataset.index;
      const slot = this.dataset.slot;
      const detailsDiv = document.getElementById(`class-details-${index}`);
      const onlineCheckbox = container.querySelector(`.online-class-checkbox[data-index="${index}"]`);

      if (this.checked) {
        // Uncheck online class (mutually exclusive)
        onlineCheckbox.checked = false;

        // Hide class details
        detailsDiv.style.display = 'none';

        // Mark this slot as "no class" in assignments
        if (!classAssignments[slot]) {
          classAssignments[slot] = { classSlot: slot };
        }
        classAssignments[slot].noClass = true;
        classAssignments[slot].onlineClass = false;
        classAssignments[slot].substituteTeacherId = null;
        classAssignments[slot].substituteTeacherName = null;
        classAssignments[slot].students = [];
      } else {
        // Show class details
        detailsDiv.style.display = 'block';

        // Remove "no class" flag
        if (classAssignments[slot]) {
          delete classAssignments[slot].noClass;
        }
      }
    });
  });

  // Add event listeners for "online class" checkboxes
  container.querySelectorAll('.online-class-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const index = this.dataset.index;
      const slot = this.dataset.slot;
      const detailsDiv = document.getElementById(`class-details-${index}`);
      const noClassCheckbox = container.querySelector(`.no-class-checkbox[data-index="${index}"]`);

      if (this.checked) {
        // Uncheck no class (mutually exclusive)
        noClassCheckbox.checked = false;

        // Hide class details (online doesn't need substitute)
        detailsDiv.style.display = 'none';

        // Mark this slot as "online class" in assignments
        if (!classAssignments[slot]) {
          classAssignments[slot] = { classSlot: slot };
        }
        classAssignments[slot].onlineClass = true;
        classAssignments[slot].noClass = false;
        classAssignments[slot].substituteTeacherId = null;
        classAssignments[slot].substituteTeacherName = null;
        classAssignments[slot].students = [];
      } else {
        // Show class details
        detailsDiv.style.display = 'block';

        // Remove "online class" flag
        if (classAssignments[slot]) {
          delete classAssignments[slot].onlineClass;
        }
      }
    });
  });

  // Pre-populate classAssignments and student chips with existing data
  existingAssignments.forEach((assignment, index) => {
    const slot = assignment.class_slot;
    classAssignments[slot] = {
      classSlot: slot,
      noClass: assignment.noClass || false,
      onlineClass: assignment.onlineClass || false,
      substituteTeacherId: assignment.substitute_teacher_id,
      substituteTeacherName: assignment.substitute_teacher_name,
      students: assignment.students || []
    };

    // Find the slot index and render student chips
    const slotIndex = classSlots.findIndex(s => s.label === slot);
    if (slotIndex !== -1 && assignment.students && assignment.students.length > 0) {
      renderStudentChips(slotIndex, assignment.students);
    }
  });
}

// Render student chips
function renderStudentChips(slotIndex, students) {
  const container = document.getElementById(`students-chips-${slotIndex}`);

  if (students.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = students.map(student => `
    <div class="student-chip">
      ${student.name}
    </div>
  `).join('');
}

// Save absent attendance
async function saveAbsentAttendance() {
  const reasonSelect = document.getElementById('absentReasonSelect');
  const customReason = document.getElementById('absentCustomReason');
  const notifiedCheckbox = document.getElementById('absentNotifiedCheckbox');

  let reason = reasonSelect.value;
  if (reason === 'Other (specify)') {
    reason = customReason.value.trim();
    if (!reason) {
      alert('Please specify a custom reason');
      return;
    }
  } else if (!reason) {
    alert('Please select a reason');
    return;
  }

  // Combine notification status with reason
  const notificationPrefix = notifiedCheckbox.checked ? 'With notif' : 'No notif';
  const fullReason = `${notificationPrefix} - ${reason}`;

  if (!currentStudentData) return;

  const statusElement = document.getElementById(`status-${currentStudentData.studentId}`);

  try {
    statusElement.textContent = 'Saving...';
    statusElement.className = 'save-status saving';

    // For students, we only save the absence reason (no class assignments needed)
    const response = await fetch(`${API_URL}/attendance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        date: getSelectedDate(),
        attendance: [{
          studentId: currentStudentData.studentId,
          studentName: currentStudentData.studentName,
          startTime: currentStudentData.startTime,
          endTime: currentStudentData.endTime,
          status: 'absent',
          absentReason: fullReason
        }]
      })
    });

    const data = await response.json();

    if (data.success) {
      statusElement.textContent = '✓ Saved';
      statusElement.className = 'save-status saved';

      // Refresh the daily report to keep it in sync
      refreshDailyReportSilently();

      setTimeout(() => {
        statusElement.textContent = '';
        statusElement.className = 'save-status';
      }, 2000);

      closeAbsentModal();
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error saving absent attendance:', error);
    statusElement.textContent = '✗ Error';
    statusElement.className = 'save-status error';
  }
}

// Populate undertime reasons dropdown
function populateUndertimeReasons() {
  const select = document.getElementById('undertimeReasonSelect');
  if (!select) return;

  select.innerHTML = '<option value="">-- Select Reason --</option>';

  UNDERTIME_REASONS.forEach(reason => {
    const option = document.createElement('option');
    option.value = reason;
    option.textContent = reason;
    select.appendChild(option);
  });
}

// Open undertime modal
async function openUndertimeModal(studentData) {
  currentStudentData = studentData;
  undertimeClassAssignments = {};

  document.getElementById('undertimeStudentName').textContent = studentData.studentName;

  // Try to load existing data
  try {
    const selectedDate = getSelectedDate();
    const response = await fetch(`${API_URL}/attendance/student/${studentData.studentId}?date=${selectedDate}`);
    const data = await response.json();

    if (data.success && data.attendance && data.attendance.has_undertime === 1) {
      // Load undertime minutes
      if (data.attendance.undertime_minutes) {
        document.getElementById('undertimeMinutesInput').value = data.attendance.undertime_minutes;
      } else {
        document.getElementById('undertimeMinutesInput').value = '';
      }

      // Load undertime reason
      const undertimeReason = data.attendance.undertime_reason;
      const standardReasons = UNDERTIME_REASONS.filter(r => r !== 'Other (specify)');
      if (undertimeReason && standardReasons.includes(undertimeReason)) {
        document.getElementById('undertimeReasonSelect').value = undertimeReason;
        document.getElementById('undertimeCustomReasonContainer').style.display = 'none';
      } else if (undertimeReason) {
        document.getElementById('undertimeReasonSelect').value = 'Other (specify)';
        document.getElementById('undertimeCustomReason').value = undertimeReason;
        document.getElementById('undertimeCustomReasonContainer').style.display = 'block';
      } else {
        document.getElementById('undertimeReasonSelect').value = '';
        document.getElementById('undertimeCustomReasonContainer').style.display = 'none';
      }
    } else {
      document.getElementById('undertimeReasonSelect').value = '';
      document.getElementById('undertimeCustomReason').value = '';
      document.getElementById('undertimeCustomReasonContainer').style.display = 'none';
      document.getElementById('undertimeMinutesInput').value = '';
    }
  } catch (error) {
    console.error('Error loading undertime data:', error);
    document.getElementById('undertimeReasonSelect').value = '';
    document.getElementById('undertimeCustomReason').value = '';
    document.getElementById('undertimeCustomReasonContainer').style.display = 'none';
    document.getElementById('undertimeMinutesInput').value = '';
  }

  document.getElementById('undertimeModal').classList.add('show');
}

// Close undertime modal
function closeUndertimeModal(uncheckBox = false) {
  document.getElementById('undertimeModal').classList.remove('show');

  if (uncheckBox && currentStudentData) {
    const undertimeCheckbox = document.querySelector(
      `input.undertime-checkbox[data-student-id="${currentStudentData.studentId}"]`
    );
    if (undertimeCheckbox) undertimeCheckbox.checked = false;
  }

  currentStudentData = null;
  undertimeClassAssignments = {};
}

// Save undertime attendance
async function saveUndertimeAttendance() {
  const reasonSelect = document.getElementById('undertimeReasonSelect');
  const customReason = document.getElementById('undertimeCustomReason');
  const minutesInput = document.getElementById('undertimeMinutesInput');

  let reason = reasonSelect.value;
  if (reason === 'Other (specify)') {
    reason = customReason.value.trim();
    if (!reason) {
      alert('Please specify a custom reason');
      return;
    }
  } else if (!reason) {
    alert('Please select a reason');
    return;
  }

  const undertimeMinutes = minutesInput.value ? parseInt(minutesInput.value) : null;

  if (!currentStudentData) return;

  const statusElement = document.getElementById(`status-${currentStudentData.studentId}`);

  try {
    statusElement.textContent = 'Saving...';
    statusElement.className = 'save-status saving';

    // Get current attendance to preserve existing status
    const selectedDate = getSelectedDate();
    const currentResponse = await fetch(`${API_URL}/attendance/student/${currentStudentData.studentId}?date=${selectedDate}`);
    const currentData = await currentResponse.json();

    let currentStatus = 'present';
    let lateReason = null;
    let minutesLate = null;

    if (currentData.success && currentData.attendance) {
      currentStatus = currentData.attendance.status;
      lateReason = currentData.attendance.late_reason;
      minutesLate = currentData.attendance.minutes_late;
    }

    const response = await fetch(`${API_URL}/attendance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        date: selectedDate,
        attendance: [{
          studentId: currentStudentData.studentId,
          studentName: currentStudentData.studentName,
          startTime: currentStudentData.startTime,
          endTime: currentStudentData.endTime,
          status: currentStatus,
          lateReason: lateReason,
          minutesLate: minutesLate,
          hasUndertime: 1,
          undertimeMinutes: undertimeMinutes,
          undertimeReason: reason
        }]
      })
    });

    const data = await response.json();

    if (data.success) {
      statusElement.textContent = '✓ Saved';
      statusElement.className = 'save-status saved';

      // Update local attendance data
      if (attendanceData[currentStudentData.studentId]) {
        attendanceData[currentStudentData.studentId].has_undertime = 1;
        attendanceData[currentStudentData.studentId].undertime_minutes = undertimeMinutes;
        attendanceData[currentStudentData.studentId].undertime_reason = reason;
      }

      refreshDailyReportSilently();

      setTimeout(() => {
        statusElement.textContent = '';
        statusElement.className = 'save-status';
      }, 2000);

      closeUndertimeModal();
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error saving undertime:', error);
    statusElement.textContent = '✗ Error';
    statusElement.className = 'save-status error';
  }
}
