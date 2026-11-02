export const CHECK_IN_GRACE_MINUTES = 15;
const JAKARTA_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export function isValidSchedule(start, end, now = new Date()) {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  const localStart = new Date(start.getTime() + JAKARTA_UTC_OFFSET_MS);
  const localEnd = new Date(end.getTime() + JAKARTA_UTC_OFFSET_MS);
  const weekday = localStart.getUTCDay();
  const startMinutes = localStart.getUTCHours() * 60 + localStart.getUTCMinutes();
  const endMinutes = localEnd.getUTCHours() * 60 + localEnd.getUTCMinutes();

  return start > now
    && weekday >= 1 && weekday <= 5
    && startMinutes >= 8 * 60 && endMinutes <= 18 * 60
    && startMinutes % 30 === 0 && endMinutes % 30 === 0
    && start.getUTCSeconds() === 0 && start.getUTCMilliseconds() === 0
    && end.getUTCSeconds() === 0 && end.getUTCMilliseconds() === 0
    && end > start
    && (end - start) % (30 * MINUTE_MS) === 0;
}

export function isCheckInTooEarly(start, now = new Date()) {
  return now < new Date(start.getTime() - CHECK_IN_GRACE_MINUTES * MINUTE_MS);
}

export function hasMissedCheckIn(start, checkedInAt, now = new Date()) {
  return !checkedInAt && now >= new Date(start.getTime() + CHECK_IN_GRACE_MINUTES * MINUTE_MS);
}
