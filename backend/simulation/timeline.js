'use strict';

/**
 * The 12-week semester is compressed into a real-time simulation run. Every
 * action the runner produces for a student is tagged with a simulated-week
 * index; after the run, backdate.js rewrites the createdAt/updatedAt of the
 * records to a wall-clock timestamp inside the corresponding week.
 *
 * This module is purely a pair of helpers — no I/O. The runner stores per-
 * student week boundaries (real-time) and the simulated-week start date, and
 * the backdater uses these helpers to remap.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function semesterWeekStart(semesterStartDate, weekIndex) {
  const ts = new Date(semesterStartDate).getTime();
  return new Date(ts + weekIndex * WEEK_MS);
}

/**
 * Map a wall-clock timestamp captured during a student's week-W block into
 * a backdated timestamp somewhere inside simulated week W. `block` is the
 * {realStartMs, realEndMs, simulatedWeek} for that student/week.
 */
function remapInsideWeek(realTsMs, block, semesterStartDate) {
  const span = Math.max(1, block.realEndMs - block.realStartMs);
  const frac = Math.min(1, Math.max(0, (realTsMs - block.realStartMs) / span));
  const weekStart = semesterWeekStart(semesterStartDate, block.simulatedWeek).getTime();
  const jitterSec = Math.floor(Math.random() * 600); // ±10 min of sub-second jitter
  return new Date(weekStart + Math.floor(frac * WEEK_MS) + jitterSec * 1000);
}

function defaultSemesterStart(now = new Date()) {
  // Default: a 12-week window ending roughly "now". Backdate week 12 to the
  // day before the run so the dashboard shows fresh-looking activity.
  const endMs = now.getTime() - DAY_MS;
  const startMs = endMs - 12 * WEEK_MS;
  return new Date(startMs);
}

module.exports = {
  DAY_MS,
  WEEK_MS,
  semesterWeekStart,
  remapInsideWeek,
  defaultSemesterStart,
};
