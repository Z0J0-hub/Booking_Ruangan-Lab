import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMissedCheckIn, isCheckInTooEarly, isValidSchedule } from '../booking-policy.mjs';

function nextWeekdayAt(hour, minute = 0, dayOffset = 1) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(hour - 7, minute, 0, 0);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

test('accepts a future weekday schedule within library opening hours', () => {
  const start = nextWeekdayAt(9);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  assert.equal(isValidSchedule(start, end), true);
});

test('rejects weekend and outside-hours schedules', () => {
  const monday = nextWeekdayAt(9);
  const saturday = new Date(monday);
  saturday.setUTCDate(saturday.getUTCDate() + ((6 - saturday.getUTCDay() + 7) % 7 || 7));
  assert.equal(isValidSchedule(saturday, new Date(saturday.getTime() + 60 * 60 * 1000)), false);

  const early = nextWeekdayAt(7, 30);
  assert.equal(isValidSchedule(early, new Date(early.getTime() + 60 * 60 * 1000)), false);
});

test('check-in is allowed through the 15-minute grace period and then expires', () => {
  const start = nextWeekdayAt(9);
  assert.equal(isCheckInTooEarly(start, new Date(start.getTime() - 15 * 60 * 1000)), false);
  assert.equal(hasMissedCheckIn(start, null, new Date(start.getTime() + 14 * 60 * 1000)), false);
  assert.equal(hasMissedCheckIn(start, null, new Date(start.getTime() + 15 * 60 * 1000)), true);
  assert.equal(hasMissedCheckIn(start, new Date(start.getTime() + 10 * 60 * 1000), new Date(start.getTime() + 20 * 60 * 1000)), false);
});
