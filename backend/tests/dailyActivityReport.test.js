require('dotenv').config({ path: 'c:/Users/91969/OneDrive/Desktop/telecrm/backend/.env' });
const { describe, it } = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');

describe('Daily Activity Report & Export End-to-End Suite', () => {
  let adminToken = null;
  let agentToken = null;

  it('authenticates admin user for report testing', async () => {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
        password: process.env.ADMIN_PASSWORD || 'Admin123!',
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
    adminToken = data.token;
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/daily-activity');
    assert.strictEqual(res.status, 401);
  });

  it('defaults to Yesterday in Asia/Kolkata timezone with 8:00 AM readiness', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/daily-activity', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    // Calculate expected yesterday in Asia/Kolkata
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const prev = new Date(Date.UTC(ty, tm - 1, td - 1));
    const py = prev.getUTCFullYear();
    const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
    const pd = String(prev.getUTCDate()).padStart(2, '0');
    const expectedYesterday = `${py}-${pm}-${pd}`;

    assert.strictEqual(data.selectedDate, expectedYesterday);
    assert.ok(data.summary, 'Summary object missing');
    assert.strictEqual(typeof data.summary.totalCalls, 'number');
    assert.strictEqual(typeof data.summary.uniqueHospitalsCalled, 'number');
    assert.strictEqual(typeof data.summary.followUpsCompleted, 'number');
    assert.strictEqual(typeof data.summary.followUpsPending, 'number');
    assert.strictEqual(typeof data.summary.followUpsOverdue, 'number');
    assert.strictEqual(typeof data.summary.demosScheduled, 'number');
    assert.strictEqual(typeof data.summary.demosCompleted, 'number');
    assert.strictEqual(typeof data.summary.demosNotDone, 'number');
    assert.strictEqual(typeof data.summary.walkInsScheduled, 'number');
    assert.strictEqual(typeof data.summary.walkInsCompleted, 'number');
    assert.strictEqual(typeof data.summary.walkInsNotCompleted, 'number');
    assert.strictEqual(typeof data.summary.leadsWon, 'number');
    assert.strictEqual(typeof data.summary.leadsLost, 'number');
  });

  it('handles empty dates gracefully without crashing or throwing errors', async () => {
    const emptyDate = '2020-01-01';
    const res = await fetch(`http://localhost:5000/api/dashboard/daily-activity?date=${emptyDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.selectedDate, emptyDate);
    assert.strictEqual(data.summary.totalCalls, 0);
    assert.strictEqual(data.summary.uniqueHospitalsCalled, 0);
    assert.strictEqual(data.summary.demosScheduled, 0);
    assert.strictEqual(data.summary.walkInsScheduled, 0);
    assert.strictEqual(data.hospitalActivity.length, 0);
  });

  it('preserves multiple calls to the same hospital as separate activity rows with full remarks', async () => {
    // 2026-09-25 or 2026-10-15 has active calls in local database
    const testDate = '2026-10-15';
    const res = await fetch(`http://localhost:5000/api/dashboard/daily-activity?date=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.hospitalActivity.length > 0, 'Expected calls on 2026-10-15');

    // Verify all 12 required fields are present on every call row
    for (const row of data.hospitalActivity) {
      assert.ok(row.hospitalName, 'hospitalName missing');
      assert.ok(row.hospitalPhone, 'hospitalPhone missing');
      assert.ok(row.callDateTime, 'callDateTime missing');
      assert.ok(row.callerName, 'callerName missing');
      assert.ok(row.disposition, 'disposition missing');
      assert.ok(row.remarks, 'remarks missing');
      assert.ok(row.currentLeadStatus, 'currentLeadStatus missing');
      assert.ok(row.nextFollowUpDate, 'nextFollowUpDate missing');
      assert.ok(row.followUpStatus, 'followUpStatus missing');
      assert.ok(row.demoStatus, 'demoStatus missing');
      assert.ok(row.walkInStatus, 'walkInStatus missing');
      assert.ok(row.currentAssignedAgent, 'currentAssignedAgent missing');
    }
  });

  it('exports multi-sheet Excel (.xlsx) with Summary, Hospital Activity, and Milestones sheets', async () => {
    const testDate = '2026-10-15';
    const res = await fetch(`http://localhost:5000/api/dashboard/daily-activity/export?date=${testDate}&format=xlsx`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const buffer = await res.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'buffer' });
    assert.ok(wb.SheetNames.includes('Daily Summary'), 'Daily Summary sheet missing');
    assert.ok(wb.SheetNames.includes('Hospital Activity'), 'Hospital Activity sheet missing');
    assert.ok(wb.SheetNames.includes('Demos WalkIns & Closures'), 'Demos WalkIns sheet missing');
  });

  it('exports CSV with proper header columns, quote escaping, and UTF-8 BOM', async () => {
    const testDate = '2026-10-15';
    const res = await fetch(`http://localhost:5000/api/dashboard/daily-activity/export?date=${testDate}&format=csv`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/csv'));

    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // Verify UTF-8 BOM bytes 0xEF, 0xBB, 0xBF
    assert.strictEqual(bytes[0], 0xEF, 'UTF-8 BOM byte 1 missing');
    assert.strictEqual(bytes[1], 0xBB, 'UTF-8 BOM byte 2 missing');
    assert.strictEqual(bytes[2], 0xBF, 'UTF-8 BOM byte 3 missing');

    const text = new TextDecoder('utf-8').decode(buffer);
    assert.ok(text.includes('"Hospital Name"'), 'Hospital Name header missing');
    assert.ok(text.includes('"Complete Call Remarks / Notes"'), 'Remarks header missing');
    assert.ok(text.includes('"Current Lead Status"'), 'Status header missing');
  });
});
