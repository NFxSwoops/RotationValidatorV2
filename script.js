// script.js
console.log("script.js loaded – version 0.31");

// Convert "HH:MM" -> minutes since midnight
function parseTime(str) {
  if (!str || str.trim() === "") return NaN;
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}
// script.js

console.log("script.js loaded – slot-aware v0.4");

// Convert "HH:MM" -> minutes since midnight
function parseTime(str) {
  if (!str || str.trim() === "") return NaN;
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}

// Convert minutes -> "h:mm AM/PM"
function formatTime(minutes) {
  if (isNaN(minutes)) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// Helper: is TM available (on shift, not on any meal) at a specific minute?
function isAvailableAt(tm, minute) {
  if (isNaN(tm.shiftStart) || isNaN(tm.shiftEnd)) return false;
  if (minute < tm.shiftStart || minute >= tm.shiftEnd) return false;

  // 1st meal window
  if (!isNaN(tm.m1Start) && !isNaN(tm.m1End) &&
      minute >= tm.m1Start && minute < tm.m1End) {
    return false;
  }
  // 2nd meal window
  if (!isNaN(tm.m2Start) && !isNaN(tm.m2End) &&
      minute >= tm.m2Start && minute < tm.m2End) {
    return false;
  }

  return true;
}

// Read rotation grid from DOM, including slot index inside cell
function getRotationData() {
  const table = document.getElementById("rotationTable");
  if (!table) return [];

  const bodyRows = Array.from(table.tBodies[0].rows);
  const data = [];

  bodyRows.forEach(row => {
    const cells = row.querySelectorAll("td");
    const timeBlock = cells[0].textContent;           // "0900 - 1000"
    const [startStr] = timeBlock.split(" - ");        // "0900"
    const startHour = parseInt(startStr.slice(0, 2), 10);
    const startTime = startHour * 60;
    const endTime = startTime + 60;

    for (let c = 1; c < cells.length; c++) {
      const input = cells[c].querySelector("input");
      if (!input) continue;
      const value = input.value.trim();
      if (!value) continue;

      const initialsList = value
        .toUpperCase()
        .split("/")
        .map(s => s.trim())
        .filter(Boolean);

      initialsList.forEach((initials, idx) => {
        data.push({
          initials,
          position: table.tHead.rows[0].cells[c].textContent,
          time: { start: startTime, end: endTime },
          block: timeBlock,
          slotIndex: idx,
          slotCount: initialsList.length
        });
      });
    }
  });

  return data;
}

// Build teamInfo dictionary from localStorage
function getTeamInfo() {
  const raw = localStorage.getItem("teamInfo");
  const info = {};
  if (!raw) return info;

  const arr = JSON.parse(raw);
  for (const entry of arr) {
    if (!entry.initials) continue; // skip blank rows
    const key = entry.initials.toUpperCase();
    info[key] = {
      shiftStart: parseTime(entry.shiftStart),
      shiftEnd:   parseTime(entry.shiftEnd),
      m1Start:    parseTime(entry.firstMealStart),
      m1End:      parseTime(entry.firstMealEnd),
      m2Start:    entry.secondMealStart ? parseTime(entry.secondMealStart) : NaN,
      m2End:      entry.secondMealEnd   ? parseTime(entry.secondMealEnd)   : NaN
    };
  }
  return info;
}

// Main conflict checking logic
function checkConflicts() {
  const data = getRotationData();
  const team = getTeamInfo();
  const conflicts = [];

  // sanity: check shift & meal ordering once per TM
  for (const [initials, tm] of Object.entries(team)) {
    if (!isNaN(tm.shiftStart) && !isNaN(tm.shiftEnd) && tm.shiftEnd < tm.shiftStart) {
      conflicts.push(
        `${initials} shift ends before it starts (${formatTime(tm.shiftEnd)} < ${formatTime(tm.shiftStart)}).`
      );
    }
    if (!isNaN(tm.m1Start) && !isNaN(tm.m1End) && tm.m1End < tm.m1Start) {
      conflicts.push(
        `${initials} 1st meal ends before it starts (${formatTime(tm.m1End)} < ${formatTime(tm.m1Start)}).`
      );
    }
    if (!isNaN(tm.m2Start) && !isNaN(tm.m2End) && tm.m2End < tm.m2Start) {
      conflicts.push(
        `${initials} 2nd meal ends before it starts (${formatTime(tm.m2End)} < ${formatTime(tm.m2Start)}).`
      );
    }
  }

  // per-hour assignment tracker for double-position conflicts
  const hourAssignments = {}; // { "0900 - 1000": { RF: [ "OP", "Green" ], ... } }

  for (const entry of data) {
    const { initials, position, time, block, slotIndex, slotCount } = entry;
    const tm = team[initials];

    if (!tm) {
      conflicts.push(`${initials} at ${block} (${position}) has no team info.`);
      continue;
    }

    const startMinute = time.start;
    const endMinute = time.end - 1; // last minute of the hour

    const isFirst = slotIndex === 0;
    const isLast  = slotIndex === slotCount - 1;
    const solo    = slotCount === 1;

    // coverage rules based on slot position
    if (solo) {
      // only initial in the cell: must be available at both start & end
      if (!isAvailableAt(tm, startMinute) || !isAvailableAt(tm, endMinute)) {
        conflicts.push(
          `${initials} cannot cover full hour ${block} in ${position} ` +
          `(unavailable at start and/or end of the hour).`
        );
      }
    } else {
      if (isFirst && !isAvailableAt(tm, startMinute)) {
        conflicts.push(
          `${initials} is first in ${block} (${position}) but is not available at hour start ` +
          `(${formatTime(startMinute)}).`
        );
      }
      if (isLast && !isAvailableAt(tm, endMinute)) {
        conflicts.push(
          `${initials} is last in ${block} (${position}) but is not available at hour end ` +
          `(${formatTime(endMinute)}).`
        );
      }
      // middle slots: optional sanity – ensure they are available for at least some part
      if (!isFirst && !isLast) {
        const mid = startMinute + 30; // midpoint of the hour
        if (!isAvailableAt(tm, mid)) {
          conflicts.push(
            `${initials} is in the middle of ${block} (${position}) but not available during mid-hour.`
          );
        }
      }
    }

    // track assignments per hour for multi-position detection
    if (!hourAssignments[block]) hourAssignments[block] = {};
    if (!hourAssignments[block][initials]) hourAssignments[block][initials] = [];
    hourAssignments[block][initials].push(position);
  }

  // basic double-assignment: same TM in multiple positions in same hour
  for (const block in hourAssignments) {
    const perHour = hourAssignments[block];
    for (const initials in perHour) {
      const posList = perHour[initials];
      if (posList.length > 1) {
        conflicts.push(
          `${initials} is assigned to multiple positions at ${block}: ${posList.join(", ")}.`
        );
      }
    }
  }

  // save for log page
  localStorage.setItem("conflictLog", JSON.stringify(conflicts));

  // show result immediately
  if (conflicts.length === 0) {
    alert("No conflicts found.");
  } else {
    alert("Conflicts found:\n\n" + conflicts.join("\n"));
  }
}

// hook up button on rotation page
const checkButton = document.getElementById("checkConflictsBtn");
if (checkButton) {
  checkButton.addEventListener("click", () => {
    console.log("Check Conflicts clicked");
    checkConflicts();
  });
}

// Convert minutes -> "h:mm AM/PM"
function formatTime(minutes) {
  if (isNaN(minutes)) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// Read rotation grid from DOM
function getRotationData() {
  const table = document.getElementById("rotationTable");
  if (!table) return [];

  const rows = Array.from(table.tBodies[0].rows);
  const data = [];

  rows.forEach(row => {
    const cells = row.querySelectorAll("td");
    const timeBlock = cells[0].textContent;           // "0900 - 1000"
    const [startStr] = timeBlock.split(" - ");        // "0900"
    const startHour = parseInt(startStr.slice(0, 2), 10);
    const startTime = startHour * 60;
    const endTime = startTime + 60;

    for (let c = 1; c < cells.length; c++) {
      const input = cells[c].querySelector("input");
      if (!input) continue;
      const value = input.value.trim();
      if (!value) continue;

      const initialsList = value.toUpperCase().split("/").map(s => s.trim()).filter(Boolean);

      initialsList.forEach(initials => {
        data.push({
          initials,
          position: table.tHead.rows[0].cells[c].textContent,
          time: { start: startTime, end: endTime },
          block: timeBlock
        });
      });
    }
  });

  return data;
}

// Build teamInfo dictionary from localStorage
function getTeamInfo() {
  const raw = localStorage.getItem("teamInfo");
  const info = {};
  if (!raw) return info;

  const arr = JSON.parse(raw);
  for (const entry of arr) {
    if (!entry.initials) continue; // skip blank rows
    const key = entry.initials.toUpperCase();
    info[key] = {
      shiftStart: parseTime(entry.shiftStart),
      shiftEnd:   parseTime(entry.shiftEnd),
      m1Start:    parseTime(entry.firstMealStart),
      m1End:      parseTime(entry.firstMealEnd),
      m2Start:    entry.secondMealStart ? parseTime(entry.secondMealStart) : NaN,
      m2End:      entry.secondMealEnd   ? parseTime(entry.secondMealEnd)   : NaN
    };
  }
  return info;
}

// Main conflict checking logic
function checkConflicts() {
  const data = getRotationData();
  const team = getTeamInfo();
  const conflicts = [];

  // per-hour assignment tracker
  const hourAssignments = {}; // { "0900 - 1000": { RF: [ "OP", "Green" ], ... } }

  for (const entry of data) {
    const { initials, position, time, block } = entry;
    const info = team[initials];

    if (!info) {
      conflicts.push(`${initials} at ${block} (${position}) has no team info.`);
      continue;
    }

    // sanity: shift window order
    if (!isNaN(info.shiftStart) && !isNaN(info.shiftEnd) && info.shiftEnd < info.shiftStart) {
      conflicts.push(
        `${initials} shift ends before it starts (${formatTime(info.shiftEnd)} < ${formatTime(info.shiftStart)}).`
      );
    }

    // sanity: meal order
    if (!isNaN(info.m1Start) && !isNaN(info.m1End) && info.m1End < info.m1Start) {
      conflicts.push(
        `${initials} 1st meal ends before it starts (${formatTime(info.m1End)} < ${formatTime(info.m1Start)}).`
      );
    }
    if (!isNaN(info.m2Start) && !isNaN(info.m2End) && info.m2End < info.m2Start) {
      conflicts.push(
        `${initials} 2nd meal ends before it starts (${formatTime(info.m2End)} < ${formatTime(info.m2Start)}).`
      );
    }

    // working outside shift bounds
    if (!isNaN(info.shiftStart) && time.start < info.shiftStart) {
      conflicts.push(
        `${initials} scheduled too early at ${block} (${position}). Shift starts ${formatTime(info.shiftStart)}.`
      );
    }
    if (!isNaN(info.shiftEnd) && time.end > info.shiftEnd) {
      conflicts.push(
        `${initials} scheduled too late at ${block} (${position}). Shift ends ${formatTime(info.shiftEnd)}.`
      );
    }

    // scheduled during 1st meal
    const inM1 =
      !isNaN(info.m1Start) &&
      !isNaN(info.m1End) &&
      time.start < info.m1End &&
      time.end > info.m1Start;

    if (inM1) {
      conflicts.push(
        `${initials} is scheduled at ${block} (${position}) during 1st meal ` +
        `(${formatTime(info.m1Start)}–${formatTime(info.m1End)}).`
      );
    }

    // scheduled during 2nd meal
    const inM2 =
      !isNaN(info.m2Start) &&
      !isNaN(info.m2End) &&
      time.start < info.m2End &&
      time.end > info.m2Start;

    if (inM2) {
      conflicts.push(
        `${initials} is scheduled at ${block} (${position}) during 2nd meal ` +
        `(${formatTime(info.m2Start)}–${formatTime(info.m2End)}).`
      );
    }

    // track assignments per hour
    if (!hourAssignments[block]) hourAssignments[block] = {};
    if (!hourAssignments[block][initials]) hourAssignments[block][initials] = [];
    hourAssignments[block][initials].push(position);
  }

  // basic double-assignment: same TM in multiple positions in same hour
  for (const block in hourAssignments) {
    const perHour = hourAssignments[block];
    for (const initials in perHour) {
      const posList = perHour[initials];
      if (posList.length > 1) {
        conflicts.push(
          `${initials} is assigned to multiple positions at ${block}: ${posList.join(", ")}.`
        );
      }
    }
  }

  // save for log page
  localStorage.setItem("conflictLog", JSON.stringify(conflicts));

  // show result immediately
  if (conflicts.length === 0) {
    alert("No conflicts found.");
  } else {
    alert("Conflicts found:\n\n" + conflicts.join("\n"));
  }
}

// hook up button on rotation page
const checkButton = document.getElementById("checkConflictsBtn");
if (checkButton) {
  checkButton.addEventListener("click", () => {
    console.log("Check Conflicts clicked");
    checkConflicts();
  });
}

