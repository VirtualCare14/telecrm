const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseFollowUpDateTimeIST, getStartAndEndOfDayIST } = require('../src/utils/timeZoneHelper');
const {
  formatDate,
  formatDateTime,
  combineDateAndTime,
  splitDateAnd24HTime,
  normalizeDateToYYYYMMDD,
  formatYYYYMMDDToMMDDYYYY,
  parseMMDDYYYYToYYYYMMDD,
} = require('../../frontend/src/utils/dateHelpers');

describe('Follow-up Date, Time & Timezone Audit Suite', () => {
  it('1. Correctly parses YYYY-MM-DD and 24-hour time in Asia/Kolkata (+05:30)', () => {
    // 19 Nov 2026 at 14:45 IST
    const date = parseFollowUpDateTimeIST('2026-11-19', '14:45');
    assert.ok(date instanceof Date, 'Must return a Date object');
    assert.strictEqual(isNaN(date.getTime()), false, 'Date must be valid');

    // In UTC, 14:45 IST = 09:15 UTC
    assert.strictEqual(date.toISOString(), '2026-11-19T09:15:00.000Z');

    // Formatted in Asia/Kolkata
    const istTime = date.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    assert.strictEqual(istTime, '14:45');

    const istDate = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    assert.strictEqual(istDate, '2026-11-19');
  });

  it('2. Correctly parses MM/DD/YYYY display format without date shift', () => {
    // 19 Nov 2026 at 11:30 IST
    const date = parseFollowUpDateTimeIST('11/19/2026', '11:30');
    assert.ok(date instanceof Date, 'Must return a Date object');
    assert.strictEqual(date.toISOString(), '2026-11-19T06:00:00.000Z');

    const istDate = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    assert.strictEqual(istDate, '2026-11-19');
  });

  it('3. Evening times (20:30, 22:00) do NOT spill into the next day on UTC servers', () => {
    const origTZ = process.env.TZ;
    process.env.TZ = 'UTC'; // Simulate Hostinger / cloud UTC server

    try {
      const date = parseFollowUpDateTimeIST('2026-11-19', '20:30');
      // 20:30 IST is 15:00 UTC on the same day
      assert.strictEqual(date.toISOString(), '2026-11-19T15:00:00.000Z');

      const istDate = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      assert.strictEqual(istDate, '2026-11-19', 'Date in Asia/Kolkata must remain 19 Nov');

      const istTime = date.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
      assert.strictEqual(istTime, '20:30', 'Time in Asia/Kolkata must remain 20:30');
    } finally {
      process.env.TZ = origTZ;
    }
  });

  it('4. Re-anchors ISO datetime with updated followUpTime correctly', () => {
    // Existing follow-up at 10:00 IST (04:30 UTC)
    const existingIso = '2026-11-19T04:30:00.000Z';
    // User updates time to 16:15
    const updated = parseFollowUpDateTimeIST(existingIso, '16:15');
    assert.strictEqual(updated.toISOString(), '2026-11-19T10:45:00.000Z');

    const istTime = updated.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    assert.strictEqual(istTime, '16:15');
  });

  it('5. Gracefully handles invalid dates and missing dates', () => {
    assert.strictEqual(parseFollowUpDateTimeIST('', '10:00'), null);
    assert.strictEqual(parseFollowUpDateTimeIST(null, '10:00'), null);
    assert.strictEqual(parseFollowUpDateTimeIST(undefined, '10:00'), null);
    assert.strictEqual(parseFollowUpDateTimeIST('invalid-date', '10:00'), null);
  });

  it('6. Verifies start and end of day boundaries in Asia/Kolkata', () => {
    const { start, end } = getStartAndEndOfDayIST('2026-11-19T12:00:00.000Z');
    // Start of day in IST (00:00:00 IST = 18:30:00 UTC previous day)
    assert.strictEqual(start.toISOString(), '2026-11-18T18:30:00.000Z');
    // End of day in IST (23:59:59.999 IST = 18:29:59.999 UTC current day)
    assert.strictEqual(end.toISOString(), '2026-11-19T18:29:59.999Z');
  });

  it('7. Frontend formatDate outputs strictly MM/DD/YYYY format everywhere', () => {
    assert.strictEqual(formatDate('2026-11-19'), '11/19/2026');
    assert.strictEqual(formatDate('2026-11-20'), '11/20/2026');
    assert.strictEqual(formatDate('2026-12-05'), '12/05/2026');
    assert.strictEqual(formatDate('11/19/2026'), '11/19/2026');
    assert.strictEqual(formatDate('2026-11-19T09:15:00.000Z'), '11/19/2026');
    assert.strictEqual(formatDate(''), '—');
    assert.strictEqual(formatDate(null), '—');
  });

  it('8. Frontend formatDateTime outputs MM/DD/YYYY, HH:mm in 24-hour format', () => {
    assert.strictEqual(formatDateTime('2026-11-19T09:15:00.000Z'), '11/19/2026, 14:45');
    assert.strictEqual(formatDateTime('2026-11-19T15:00:00.000Z'), '11/19/2026, 20:30');
    assert.strictEqual(formatDateTime(''), '—');
  });

  it('9. combineDateAndTime and splitDateAnd24HTime roundtrip without drift', () => {
    const combined = combineDateAndTime('2026-11-19', '14:45');
    assert.strictEqual(combined, '2026-11-19T09:15:00.000Z');

    const split = splitDateAnd24HTime(combined);
    assert.strictEqual(split.date, '2026-11-19');
    assert.strictEqual(split.time, '14:45');

    // Also works with MM/DD/YYYY input
    const combined2 = combineDateAndTime('11/19/2026', '14:45');
    assert.strictEqual(combined2, '2026-11-19T09:15:00.000Z');
  });

  it('10. normalizeDateToYYYYMMDD, formatYYYYMMDDToMMDDYYYY, parseMMDDYYYYToYYYYMMDD work bidirectionally', () => {
    assert.strictEqual(formatYYYYMMDDToMMDDYYYY('2026-11-19'), '11/19/2026');
    assert.strictEqual(parseMMDDYYYYToYYYYMMDD('11/19/2026'), '2026-11-19');
    assert.strictEqual(normalizeDateToYYYYMMDD('11/19/2026'), '2026-11-19');
    assert.strictEqual(normalizeDateToYYYYMMDD('2026-11-19'), '2026-11-19');
  });
});
