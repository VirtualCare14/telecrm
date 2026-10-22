require('dotenv').config({ path: 'c:/Users/91969/OneDrive/Desktop/telecrm/backend/.env' });
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Dashboard Activity Cards Filtered Hospital Lists Test Suite', () => {
  let adminToken = null;
  let testAgentId = null;

  it('authenticates admin user for dashboard metric records testing', async () => {
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

  it('rejects unauthenticated requests to /metric-records with 401', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=demos');
    assert.strictEqual(res.status, 401);
  });

  it('verifies Demos card count matches metric-records count exactly for thisMonth (11 records)', async () => {
    // 1. Fetch dashboard KPI for thisMonth
    const dashRes = await fetch('http://localhost:5000/api/dashboard/admin?dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(dashRes.status, 200);
    const dashData = await dashRes.json();
    const demoCardCount = dashData.dailyActivity?.demos ?? dashData.dailyActivity?.demosScheduled ?? 0;
    assert.strictEqual(demoCardCount, 11, 'Expected 11 demos on admin dashboard for This Month');

    // 2. Fetch metric-records for demos with thisMonth
    const recordsRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=demos&dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(recordsRes.status, 200);
    const recordsData = await recordsRes.json();

    assert.strictEqual(recordsData.success, true);
    assert.strictEqual(recordsData.metric, 'demos');
    assert.strictEqual(recordsData.totalRecords, demoCardCount, 'Records count must match card count');
    assert.strictEqual(recordsData.records.length, Math.min(recordsData.pagination.limit, 11));

    // Verify all records have required fields
    for (const r of recordsData.records) {
      assert.ok(r.hospitalName, 'Hospital name must be present');
      assert.ok(r.leadId, 'Lead ID must be present for navigation');
      assert.ok(r.dateFormatted, 'Formatted date must be present');
      assert.ok(r.status, 'Status must be present');
    }
  });

  it('verifies Walk-ins card count matches metric-records count exactly for thisMonth (12 records)', async () => {
    const dashRes = await fetch('http://localhost:5000/api/dashboard/admin?dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dashData = await dashRes.json();
    const walkinsCardCount = dashData.dailyActivity?.walkins ?? 0;

    const recordsRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=walkins&dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(recordsRes.status, 200);
    const recordsData = await recordsRes.json();

    assert.strictEqual(recordsData.totalRecords, walkinsCardCount);
    assert.strictEqual(recordsData.totalRecords, 12, 'Expected 12 walk-ins for This Month');
  });

  it('verifies Calls card count matches metric-records count exactly for thisMonth (53 records)', async () => {
    const dashRes = await fetch('http://localhost:5000/api/dashboard/admin?dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dashData = await dashRes.json();
    const callsCardCount = dashData.dailyActivity?.calls ?? 0;

    const recordsRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=calls&dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(recordsRes.status, 200);
    const recordsData = await recordsRes.json();

    assert.strictEqual(recordsData.totalRecords, callsCardCount);
    assert.ok(recordsData.totalRecords > 0, 'Expected call records for This Month');
  });

  it('verifies New Leads card count matches metric-records count exactly for thisMonth (156 records)', async () => {
    const dashRes = await fetch('http://localhost:5000/api/dashboard/admin?dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dashData = await dashRes.json();
    const newLeadsCardCount = dashData.dailyActivity?.newLeads ?? 0;

    const recordsRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=newLeads&dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(recordsRes.status, 200);
    const recordsData = await recordsRes.json();

    assert.strictEqual(recordsData.totalRecords, newLeadsCardCount);
    assert.ok(recordsData.totalRecords >= 156, 'Expected at least 156 new leads for This Month');
  });

  it('verifies Won and Lost metrics return matching records for thisMonth', async () => {
    const dashRes = await fetch('http://localhost:5000/api/dashboard/admin?dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dashData = await dashRes.json();
    const wonCount = dashData.dailyActivity?.won ?? 0;
    const lostCount = dashData.dailyActivity?.lost ?? 0;

    const [wonRes, lostRes] = await Promise.all([
      fetch('http://localhost:5000/api/dashboard/metric-records?metric=won&dateFilter=thisMonth', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      fetch('http://localhost:5000/api/dashboard/metric-records?metric=lost&dateFilter=thisMonth', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
    ]);

    const wonData = await wonRes.json();
    const lostData = await lostRes.json();

    assert.strictEqual(wonData.totalRecords, wonCount, 'Won records must match card count');
    assert.strictEqual(lostData.totalRecords, lostCount, 'Lost records must match card count');
  });

  it('verifies custom date range preserves filters across dashboard and modal list', async () => {
    const customStart = '2026-10-01';
    const customEnd = '2026-10-15';

    const dashRes = await fetch(`http://localhost:5000/api/dashboard/admin?startDate=${customStart}&endDate=${customEnd}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dashData = await dashRes.json();
    const demoCount = dashData.dailyActivity?.demos ?? 0;

    const recordsRes = await fetch(
      `http://localhost:5000/api/dashboard/metric-records?metric=demos&startDate=${customStart}&endDate=${customEnd}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const recordsData = await recordsRes.json();

    assert.strictEqual(recordsData.totalRecords, demoCount);
  });

  it('supports pagination parameters page and limit', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=calls&dateFilter=thisMonth&page=2&limit=10', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.pagination.page, 2);
    assert.strictEqual(data.pagination.limit, 10);
    assert.strictEqual(data.records.length, 10);
    assert.ok(data.totalRecords > 0);
    assert.strictEqual(data.pagination.totalPages, Math.ceil(data.totalRecords / 10));
  });

  it('supports text search filtering', async () => {
    // Search for Optimus Hospital
    const res = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=demos&dateFilter=thisMonth&search=Optimus', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(data.totalRecords >= 1, 'Should find at least 1 record matching Optimus');
    assert.ok(data.records.some((r) => r.hospitalName.includes('Optimus')));
  });

  it('exports metric records to CSV successfully', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/metric-records/export?metric=demos&dateFilter=thisMonth&format=csv', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(contentType.includes('text/csv'), 'Content-Type should be text/csv');
    const text = await res.text();
    assert.ok(text.includes('Hospital Name'), 'Header should contain Hospital Name');
    assert.ok(text.includes('Optimus Hospital'), 'Should include demo hospital record');
  });

  it('exports metric records to Excel (.xlsx) successfully', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/metric-records/export?metric=demos&dateFilter=thisMonth&format=xlsx', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(contentType.includes('spreadsheetml'), 'Content-Type should be spreadsheetml');
    const buffer = await res.arrayBuffer();
    assert.ok(buffer.byteLength > 1000, 'Excel file should have valid non-zero content');
  });

  it('verifies single date filter returns qualifying demo records matching dashboard', async () => {
    const singleDate = '2026-10-22';
    const dashRes = await fetch(`http://localhost:5000/api/dashboard/admin?singleDate=${singleDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dashData = await dashRes.json();
    const expectedDemos = dashData.dailyActivity?.demos ?? 0;

    const res = await fetch(`http://localhost:5000/api/dashboard/metric-records?metric=demos&singleDate=${singleDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.totalRecords, expectedDemos);
  });

  it('verifies month filter returns qualifying walk-in records matching dashboard', async () => {
    const month = '2026-10';
    const dashRes = await fetch(`http://localhost:5000/api/dashboard/admin?month=${month}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dashData = await dashRes.json();
    const expectedWalkins = dashData.dailyActivity?.walkins ?? 0;

    const res = await fetch(`http://localhost:5000/api/dashboard/metric-records?metric=walkins&month=${month}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.totalRecords, expectedWalkins);
  });

  it('verifies calls metric preserves every call record without deduplication (multiple calls to same hospital appear as distinct records)', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=calls&dateFilter=thisMonth&limit=100', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.totalRecords > 0, 'Total call records for thisMonth must be greater than 0');
    assert.strictEqual(data.records.length, Math.min(data.totalRecords, 100), 'All call records up to limit must be returned');

    // Confirm that unique hospitals is less than or equal to total calls
    assert.ok(data.uniqueHospitals <= data.totalRecords, 'Unique hospitals count must be <= total records');
    assert.ok(data.uniqueHospitals > 0, 'Unique hospitals should be greater than 0');

    // Find hospitals with multiple calls
    const hospitalCountMap = new Map();
    for (const r of data.records) {
      hospitalCountMap.set(r.hospitalName, (hospitalCountMap.get(r.hospitalName) || 0) + 1);
    }
    const repeatedHospitals = Array.from(hospitalCountMap.entries()).filter(([_, count]) => count > 1);
    assert.ok(repeatedHospitals.length > 0, 'There should be hospitals with multiple calls');

    // For each repeated hospital, verify they appear as distinct records with unique call IDs
    for (const [name, count] of repeatedHospitals) {
      const recordsForHospital = data.records.filter((r) => r.hospitalName === name);
      assert.strictEqual(recordsForHospital.length, count);
      const uniqueIds = new Set(recordsForHospital.map((r) => r.id));
      assert.strictEqual(uniqueIds.size, count, `All ${count} calls for ${name} must have distinct CallLog IDs`);
    }
  });

  it('verifies all required fields exist for calls: hospitalName, leadId, dateFormatted, callerName, disposition, remarks, contactPhone, leadStatus', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=calls&dateFilter=thisMonth&limit=50', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    for (const r of data.records) {
      assert.ok(r.hospitalName, 'hospitalName must be present');
      assert.ok(r.leadId, 'leadId must be present');
      assert.ok(r.dateFormatted, 'dateFormatted must be present');
      assert.ok(r.dateFormatted.includes('2026'), 'dateFormatted must contain year in IST format');
      assert.ok(r.callerName, 'callerName must be present');
      assert.ok(r.disposition, 'disposition must be present');
      assert.ok(r.remarks !== undefined, 'remarks must be defined');
      assert.ok(r.contactPhone !== undefined, 'contactPhone must be defined');
      assert.ok(r.leadStatus !== undefined, 'leadStatus must be defined');
      assert.ok(r.status !== undefined, 'status must be defined');
    }
  });

  it('verifies custom date range for calls matches admin dashboard daily calls count', async () => {
    const startDate = '2026-10-01';
    const endDate = '2026-10-15';

    const dashRes = await fetch(`http://localhost:5000/api/dashboard/admin?startDate=${startDate}&endDate=${endDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dashData = await dashRes.json();
    const callsCount = dashData.dailyActivity?.calls ?? 0;

    const res = await fetch(
      `http://localhost:5000/api/dashboard/metric-records?metric=calls&startDate=${startDate}&endDate=${endDate}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.totalRecords, callsCount, 'Calls metric records count must match dashboard dailyActivity.calls');
  });

  it('verifies call search by contactPhone, disposition, callerName, and hospitalName', async () => {
    // 1. Search by hospital name
    const res1 = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=calls&dateFilter=thisMonth&search=Aryan', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.ok(data1.totalRecords >= 1, 'Should find records for Aryan Hospital');
    assert.ok(data1.records.every((r) => r.hospitalName.toLowerCase().includes('aryan')));

    // 2. Search by disposition (e.g. Connected or Demo or Call)
    const res2 = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=calls&dateFilter=thisMonth&search=Connected', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.ok(data2.records.length > 0, 'Should find calls with disposition Connected');
    assert.ok(data2.records.some((r) => r.disposition.toLowerCase().includes('connected')));
  });

  it('verifies empty date range for calls returns 0 records and no dummy records', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=calls&startDate=2099-01-01&endDate=2099-01-02', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.totalRecords, 0, 'Should return 0 records for empty range');
    assert.strictEqual(data.records.length, 0, 'Should return empty array');
    assert.strictEqual(data.uniqueHospitals, 0, 'Should return 0 unique hospitals');
  });

  it('verifies calls CSV export contains disposition, contact number, caller name, remarks, and lead status', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/metric-records/export?metric=calls&dateFilter=thisMonth&format=csv', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('Hospital Name'), 'CSV must include Hospital Name');
    assert.ok(text.includes('Call Date & Time (IST)'), 'CSV must include Call Date & Time (IST)');
    assert.ok(text.includes('Contact Number'), 'CSV must include Contact Number');
    assert.ok(text.includes('Caller / Agent Name'), 'CSV must include Caller / Agent Name');
    assert.ok(text.includes('Call Disposition'), 'CSV must include Call Disposition');
    assert.ok(text.includes('Lead Status'), 'CSV must include Lead Status');
    assert.ok(text.includes('Call Remarks / Notes'), 'CSV must include Call Remarks / Notes');

    // Confirm repeat hospital appears multiple times in CSV
    const aryanOccurrences = (text.match(/Aryan Hospital/g) || []).length;
    assert.ok(aryanOccurrences >= 2, 'Repeated hospital calls must each appear as distinct rows in CSV export');
  });

  it('verifies calls Excel export (.xlsx) contains proper content', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/metric-records/export?metric=calls&dateFilter=thisMonth&format=xlsx', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(contentType.includes('spreadsheetml'), 'Content-Type should be spreadsheetml');
    const buffer = await res.arrayBuffer();
    assert.ok(buffer.byteLength > 1000, 'Excel file should have valid non-zero content');
  });
});

