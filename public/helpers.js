// Helper functions for attendance app

// Convert time string like "8am" to hour number
function timeStringToHour(timeStr) {
  if (!timeStr) return null;

  const match = timeStr.match(/(\d+)(am|pm)/i);
  if (!match) return null;

  let hour = parseInt(match[1]);
  const period = match[2].toLowerCase();

  if (period === 'pm' && hour !== 12) {
    hour += 12;
  } else if (period === 'am' && hour === 12) {
    hour = 0;
  }

  return hour;
}

// Calculate class slots based on start and end time
// Class slots: 8-10, 10-12, 1-3, 3-5, 5-7, 7-9
function calculateClassSlots(startTime, endTime) {
  const startHour = timeStringToHour(startTime);
  const endHour = timeStringToHour(endTime);

  if (startHour === null || endHour === null) return [];

  const classSlots = [
    { label: '8am - 10am', start: 8, end: 10 },
    { label: '10am - 12pm', start: 10, end: 12 },
    { label: '1pm - 3pm', start: 13, end: 15 },
    { label: '3pm - 5pm', start: 15, end: 17 },
    { label: '5pm - 7pm', start: 17, end: 19 },
    { label: '7pm - 9pm', start: 19, end: 21 }
  ];

  // Filter slots that fall within the teacher's shift
  return classSlots.filter(slot => {
    return slot.start >= startHour && slot.end <= endHour;
  });
}

// Late reasons (for students)
const LATE_REASONS = [
  'Didn\'t disclose',
  'Woke up late / Overslept',
  'Service delay',
  'Traffic jam',
  'Forgot class time',
  'Previous class ran late',
  'Family matter',
  'Doctor/Dentist appointment',
  'Bad weather',
  'Lost track of time',
  'Parent delay',
  'School event',
  'Student didn\'t tell',
  'Other (specify)'
];

// Absent reasons (for students)
const ABSENT_REASONS = [
  'Didn\'t disclose',
  'AWOL (No notification)',
  'Sick / Not feeling well',
  'Cold / Flu symptoms',
  'COVID-19 symptoms',
  'Doctor appointment',
  'Hospital visit',
  'Family emergency',
  'Family vacation/travel',
  'School exam/event',
  'Visiting grandparents (할머니/할아버지)',
  'Mental health day',
  'Weather / Typhoon',
  'Personal matter',
  'Bereavement',
  'Other (specify)'
];

// Undertime/Left Early reasons (for students)
const UNDERTIME_REASONS = [
  'Personal emergency',
  'Family emergency',
  'Feeling unwell',
  'Doctor/Dentist appointment',
  'Hospital visit',
  'Parent picked up early',
  'School event',
  'Transportation issue',
  'Personal matter',
  'Family matter',
  'Other (specify)'
];

// Get class slot details by label (for checking availability)
function getClassSlotByLabel(slotLabel) {
  const allSlots = [
    { label: '8am - 10am', start: 8, end: 10 },
    { label: '10am - 12pm', start: 10, end: 12 },
    { label: '1pm - 3pm', start: 13, end: 15 },
    { label: '3pm - 5pm', start: 15, end: 17 },
    { label: '5pm - 7pm', start: 17, end: 19 },
    { label: '7pm - 9pm', start: 19, end: 21 }
  ];

  return allSlots.find(slot => slot.label === slotLabel);
}

// Calculate which class slots a late student will miss (need coverage for)
function getSlotsNeedingSubstitute(student, minutesLate) {
  const studentStartHour = timeStringToHour(student.startTime);
  if (studentStartHour === null || minutesLate === null || minutesLate === 0) {
    return []; // No slots affected if not late
  }

  const expectedArrivalHour = studentStartHour + (minutesLate / 60);

  const allSlots = [
    { label: '8am - 10am', start: 8, end: 10 },
    { label: '10am - 12pm', start: 10, end: 12 },
    { label: '1pm - 3pm', start: 13, end: 15 },
    { label: '3pm - 5pm', start: 15, end: 17 },
    { label: '5pm - 7pm', start: 17, end: 19 },
    { label: '7pm - 9pm', start: 19, end: 21 }
  ];

  // Student will miss slots where they arrive after the slot has started
  return allSlots.filter(slot => {
    return expectedArrivalHour > slot.start;
  }).map(slot => slot.label);
}

// Calculate which class slots a student who left early will miss
function getSlotsNeedingSubstituteForUndertime(student, minutesEarly) {
  const studentEndHour = timeStringToHour(student.endTime);
  if (studentEndHour === null || minutesEarly === null || minutesEarly === 0) {
    return []; // No slots affected if didn't leave early
  }

  const actualDepartureHour = studentEndHour - (minutesEarly / 60);

  const allSlots = [
    { label: '8am - 10am', start: 8, end: 10 },
    { label: '10am - 12pm', start: 10, end: 12 },
    { label: '1pm - 3pm', start: 13, end: 15 },
    { label: '3pm - 5pm', start: 15, end: 17 },
    { label: '5pm - 7pm', start: 17, end: 19 },
    { label: '7pm - 9pm', start: 19, end: 21 }
  ];

  // Student will miss slots where they left before the slot ends
  return allSlots.filter(slot => {
    return actualDepartureHour < slot.end;
  }).map(slot => slot.label);
}
