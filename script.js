// script.js

// Convert time string (e.g. "09:00") to minutes since midnight
function parseTime(str) {
  if (!str || str.trim() === "") return NaN;
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

// Convert minutes since midnight to "HH:MM AM/PM"
function formatTime(minutes) {
  if (isNaN(minutes)) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// Parse rotation grid into structured data
function getRotationData() {
  const table = document.getElementById("rotationTable");
  const rows = Array.from(table.getElementsByTagName("tr")).slice(1);
  const data = [];

  rows.forEach(row => {
    const cells = row.getElementsByTagName("td");
    const timeBlock = cells[0].textContent;
    const [startTimeStr, endTimeStr] = timeBlock.split(" - ");
    const startTime = parseInt(startTimeStr.slice(0, 2)) * 60;
    const endTime = parseInt(endTimeStr.slice(0, 2)) * 60;

    for (let i = 1; i < cells.length; i++) {
      const input = cells[i].querySelector("input");
      if (input && input.value.trim()) {
        const initials = input.value.toUpperCase().split("/").map(s => s.trim());
        initials.forEach(initial => {
          data.push({
            initials: initial,
            position: table.rows[0].cells[i].textContent,
            time: { start: startTime, end: endTime },
            fullBlock: timeBlock
          });
        });
      }
    }
  });

  return data;
}

// Parse team table for each member’s shift and meal details
function getTeamInfo() {
  const info = {};
  const data = JSON.parse(localStorage.getItem("teamInfo") || "[]");

  for (let entry of data) {
    info[entry.initials] = {
      shiftStart: parseTime(entry.shiftStart),
      firstMealStart: parseTime(entry.firstMealStart),
      firstMealEnd: parseTime(entry.firstMealEnd),
      secondMealStart: entry.secondMealStart ? parseTime(entry.secondMealStart) : null,
      secondMealEnd: entry.secondMealEnd ? parseTime(entry.secondMealEnd) : null,
      shiftEnd: parseTime(entry.shiftEnd)
    };
  }

  return info;
}


// Main conflict checking logic
function checkConflicts() {
  const data = getRotationData();
  const teamInfo = getTeamInfo();
  const conflicts = [];
  const activeMap = {};

  for (const entry of data) {
    const { initials, position, time, fullBlock } = entry;
    const info = teamInfo[initials];

    if (!info) {
      conflicts.push(`${initials} scheduled at ${fullBlock} (${position}) has no shift data.`);
      continue;
    }

    if (info.shiftEnd < info.shiftStart) {
      conflicts.push(`${initials} has invalid shift timing: ends at ${formatTime(info.shiftEnd)} before it starts at ${formatTime(info.shiftStart)}.`);
    }

    if (info.firstMealEnd < info.firstMealStart) {
      conflicts.push(`${initials} has first meal ending before it starts: ${formatTime(info.firstMealEnd)} < ${formatTime(info.firstMealStart)}.`);
    }

    if (!isNaN(info.secondMealStart) && !isNaN(info.secondMealEnd) && info.secondMealEnd < info.secondMealStart) {
      conflicts.push(`${initials} has second meal ending before it starts: ${formatTime(info.secondMealEnd)} < ${formatTime(info.secondMealStart)}.`);
    }

    if (time.start < info.shiftStart) {
      conflicts.push(`${initials} scheduled too early (${fullBlock}). Shift starts at ${formatTime(info.shiftStart)}.`);
    }

    if (time.end > info.shiftEnd) {
      conflicts.push(`${initials} scheduled too late (${fullBlock}). Shift ends at ${formatTime(info.shiftEnd)}.`);
    }

    const key = `${initials}-${time.start}`;
    if (!activeMap[key]) activeMap[key] = [];
    activeMap[key].push(position);
  }

  // Double/triple assignment check
  for (const key in activeMap) {
    const [initials, rawTime] = key.split("-");
    const time = formatTime(parseInt(rawTime));
    const positions = activeMap[key];
    if (positions.length > 1) {
      conflicts.push(`${initials} is assigned to multiple positions at ${time}: ${positions.join(", ")}`);
    }
  }

  // Show result
  if (conflicts.length > 0) {
    alert("Conflicts Found:\n\n" + conflicts.join("\n"));
  } else {
    alert("No conflicts found.");
  }
}

// Bind button if present
const checkButton = document.getElementById("checkConflictsBtn");
if (checkButton) {
  checkButton.addEventListener("click", () => {
    console.log("Check Conflicts clicked");
    checkConflicts();
  });
}


