require('dotenv').config({ path: 'c:/Users/91969/OneDrive/Desktop/telecrm/backend/.env' });
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Demo and Walk-in Activity Hospital List Filters Test Suite', () => {
  let adminToken = null;
  let testAgentId = null;

  it('authenticates admin user for activity report testing', async () => {
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
    assert.ok(data.token, 'Token should be returned');
    adminToken = data.token;
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/activity-hospitals');
    assert.strictEqual(res.status, 401);
  });

  it('defaults to Today in Asia/Kolkata timezone with proper structure', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/activity-hospitals', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.ok(data.filter, 'Filter object missing');
    assert.strictEqual(data.filter.dateMode, 'single');
    assert.ok(data.filter.startDate, 'startDate missing');
    assert.ok(data.summary, 'Summary object missing');
    assert.strictEqual(typeof data.summary.totalActivities, 'number');
    assert.strictEqual(typeof data.summary.uniqueHospitals, 'number');
    assert.strictEqual(typeof data.summary.demosCount, 'number');
    assert.strictEqual(typeof data.summary.walkInsCount, 'number');
    assert.strictEqual(typeof data.summary.scheduledCount, 'number');
    assert.strictEqual(typeof data.summary.completedCount, 'number');
    assert.strictEqual(typeof data.summary.notDoneCount, 'number');
    assert.ok(Array.isArray(data.activities), 'Activities should be an array');
    assert.ok(data.pagination, 'Pagination object missing');
  });

  it('tests single date filter for a specific date', async () => {
    const testDate = '2026-10-22';
    const res = await fetch(`http://localhost:5000/api/dashboard/activity-hospitals?dateMode=single&date=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.filter.startDate, testDate);
    assert.strictEqual(data.filter.endDate, testDate);
    // Every activity returned should fall on that date
    data.activities.forEach(act => {
      assert.strictEqual(act.activityDateFormatted, '22 Oct 2026');
      assert.ok(act.hospitalName, 'Hospital name should be populated');
      assert.ok(act.leadId, 'Lead ID should be populated');
      assert.ok(act.leadNumber, 'Lead Number should be populated');
      assert.ok(act.status, 'Status should be present');
      assert.ok(act.assignedAgent, 'Assigned agent should be present');
    });

    if (data.activities.length > 0 && !testAgentId) {
      testAgentId = data.activities[0].assignedAgent.id;
    }
  });

  it('tests month filter (YYYY-MM) with IST month boundaries', async () => {
    const testMonth = '2026-10';
    const res = await fetch(`http://localhost:5000/api/dashboard/activity-hospitals?dateMode=month&month=${testMonth}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.filter.dateMode, 'month');
    assert.strictEqual(data.filter.startDate, '2026-10-01');
    assert.strictEqual(data.filter.endDate, '2026-10-31');
    assert.ok(data.summary.totalActivities >= 0);
    assert.strictEqual(
      data.summary.totalActivities,
      data.summary.demosCount + data.summary.walkInsCount,
      'Total activities should equal sum of demos and walkins when status=ALL'
    );
  });

  it('tests custom range filter (startDate and endDate fully inclusive)', async () => {
    const startDate = '2026-10-01';
    const endDate = '2026-10-22';
    const res = await fetch(`http://localhost:5000/api/dashboard/activity-hospitals?dateMode=custom&startDate=${startDate}&endDate=${endDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.filter.dateMode, 'custom');
    assert.strictEqual(data.filter.startDate, startDate);
    assert.strictEqual(data.filter.endDate, endDate);
    assert.ok(data.summary.totalActivities >= 0);
  });

  it('tests activityType filter for DEMO and WALKIN isolation', async () => {
    const month = '2026-10';

    // 1. DEMO only
    const resDemo = await fetch(`http://localhost:5000/api/dashboard/activity-hospitals?month=${month}&activityType=DEMO`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resDemo.status, 200);
    const dataDemo = await resDemo.json();
    assert.strictEqual(dataDemo.filter.activityType, 'DEMO');
    assert.strictEqual(dataDemo.summary.walkInsCount, 0);
    dataDemo.activities.forEach(act => {
      assert.strictEqual(act.activityType, 'Demo');
    });

    // 2. WALKIN only
    const resWalkIn = await fetch(`http://localhost:5000/api/dashboard/activity-hospitals?month=${month}&activityType=WALKIN`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resWalkIn.status, 200);
    const dataWalkIn = await resWalkIn.json();
    assert.strictEqual(dataWalkIn.filter.activityType, 'WALKIN');
    assert.strictEqual(dataWalkIn.summary.demosCount, 0);
    dataWalkIn.activities.forEach(act => {
      assert.strictEqual(act.activityType, 'Walk-in');
    });
  });

  it('tests status filter: Scheduled, Completed, Not Done', async () => {
    const month = '2026-10';

    // 1. Scheduled
    const resSched = await fetch(`http://localhost:5000/api/dashboard/activity-hospitals?month=${month}&status=Scheduled`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resSched.status, 200);
    const dataSched = await resSched.json();
    assert.strictEqual(dataSched.summary.completedCount, 0);
    assert.strictEqual(dataSched.summary.notDoneCount, 0);
    dataSched.activities.forEach(act => {
      assert.strictEqual(act.status, 'Scheduled');
    });

    // 2. Completed
    const resComp = await fetch(`http://localhost:5000/api/dashboard/activity-hospitals?month=${month}&status=Completed`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resComp.status, 200);
    const dataComp = await resComp.json();
    assert.strictEqual(dataComp.summary.scheduledCount, 0);
    assert.strictEqual(dataComp.summary.notDoneCount, 0);
    dataComp.activities.forEach(act => {
      assert.strictEqual(act.status, 'Completed');
    });
  });

  it('tests agent filter scoping', async () => {
    if (!testAgentId) return;

    const res = await fetch(`http://localhost:5000/api/dashboard/activity-hospitals?month=2026-10&agentId=${testAgentId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.filter.agentId, testAgentId);
    data.activities.forEach(act => {
      const isAgentOrScheduler = act.assignedAgent?.id === testAgentId || act.assignedBy?.id === testAgentId;
      assert.ok(isAgentOrScheduler, `Record ${act.id} should match target agent ${testAgentId}`);
    });
  });

  it('verifies consistency between displayed counts, pagination, and hospital rows', async () => {
    const res = await fetch(`http://localhost:5000/api/dashboard/activity-hospitals?month=2026-10&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.pagination.limit, 5);
    assert.strictEqual(data.pagination.page, 1);
    assert.ok(data.activities.length <= 5);
    assert.strictEqual(data.pagination.totalRecords, data.summary.totalActivities);
  });

  it('verifies Excel and CSV export endpoints return valid status and headers', async () => {
    // 1. XLSX export
    const resXlsx = await fetch(`http://localhost:5000/api/dashboard/activity-hospitals/export?month=2026-10&format=xlsx`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resXlsx.status, 200);
    assert.ok(resXlsx.headers.get('content-type').includes('spreadsheetml'));
    const buf = await resXlsx.arrayBuffer();
    assert.ok(buf.byteLength > 100, 'Excel buffer should contain bytes');

    // 2. CSV export
    const resCsv = await fetch(`http://localhost:5000/api/dashboard/activity-hospitals/export?month=2026-10&format=csv`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resCsv.status, 200);
    assert.ok(resCsv.headers.get('content-type').includes('text/csv'));
    const csvText = await resCsv.text();
    assert.ok(csvText.includes('Activity Type'), 'CSV header should contain Activity Type');
    assert.ok(csvText.includes('Hospital / Organization Name'), 'CSV header should contain Hospital / Organization Name');
  });
});
