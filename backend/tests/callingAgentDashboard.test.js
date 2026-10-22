require('dotenv').config({ path: 'c:/Users/91969/OneDrive/Desktop/telecrm/backend/.env' });
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Calling Agent + Sales Agent Activity Filters & Recent Hospitals Test Suite', () => {
  let callingToken = null;
  let callingUser = null;
  let salesToken = null;
  let salesUser = null;
  let adminToken = null;

  it('authenticates Calling Agent (Jyoti)', async () => {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'jyoti0411',
        password: 'Jyoti@1402',
      }),
    });
    assert.strictEqual(res.status, 200, 'Calling agent login should succeed');
    const data = await res.json();
    assert.ok(data.token, 'Token must be returned');
    assert.strictEqual(data.user.role, 'AGENT');
    assert.strictEqual(data.user.agentRole, 'Calling Agent');
    callingToken = data.token;
    callingUser = data.user;
  });

  it('authenticates Sales Agent (Prince)', async () => {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'Prince0908',
        password: 'Prince@1402',
      }),
    });
    assert.strictEqual(res.status, 200, 'Sales agent login should succeed');
    const data = await res.json();
    assert.ok(data.token, 'Token must be returned');
    assert.strictEqual(data.user.role, 'AGENT');
    assert.strictEqual(data.user.agentRole, 'Sales Agent');
    salesToken = data.token;
    salesUser = data.user;
  });

  it('authenticates Admin user for comparison & RBAC verification', async () => {
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

  // ==========================================
  // SECTION 1: CALLING AGENT TESTS
  // ==========================================

  it('verifies Calling Agent dashboard responds with dailyActivity for This Month', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(data.dailyActivity, 'dailyActivity object must be present');
    assert.ok(typeof data.dailyActivity.calls === 'number', 'calls count must be a number');
    assert.ok(typeof data.dailyActivity.followups === 'number', 'followups count must be a number');
    assert.ok(typeof data.dailyActivity.demos === 'number', 'demos count must be a number');
    assert.ok(typeof data.dailyActivity.walkins === 'number', 'walkins count must be a number');
    assert.ok(typeof data.dailyActivity.overdueFollowups === 'number', 'overdueFollowups must be a number');
    assert.ok(data.summary, 'summary object must be preserved for backward compatibility');
    assert.ok(data.todayActions, 'todayActions must be present');
  });

  it('verifies Calling Agent dashboard date filters: Today, Yesterday, Single Date, Custom Range', async () => {
    // 1. Today
    const todayRes = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=today', {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    assert.strictEqual(todayRes.status, 200);
    const todayData = await todayRes.json();
    assert.ok(todayData.dailyActivity, 'Today dailyActivity must be returned');

    // 2. Yesterday
    const yestRes = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=yesterday', {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    assert.strictEqual(yestRes.status, 200);
    const yestData = await yestRes.json();
    assert.ok(yestData.dailyActivity, 'Yesterday dailyActivity must be returned');

    // 3. Single Date
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const singleRes = await fetch(`http://localhost:5000/api/dashboard/agent?dateFilter=single&singleDate=${todayIST}`, {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    assert.strictEqual(singleRes.status, 200);
    const singleData = await singleRes.json();
    assert.ok(singleData.dailyActivity, 'Single date dailyActivity must be returned');

    // 4. Custom Date Range
    const customRes = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=custom&startDate=2026-10-01&endDate=2026-10-22', {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    assert.strictEqual(customRes.status, 200);
    const customData = await customRes.json();
    assert.ok(customData.dailyActivity, 'Custom range dailyActivity must be returned');
  });

  it('verifies Calling Agent Calls metric card count matches metric-records count exactly', async () => {
    const dashRes = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    const dashData = await dashRes.json();
    const agentCallsCount = dashData.dailyActivity?.calls ?? 0;

    const recordsRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=calls&dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    assert.strictEqual(recordsRes.status, 200);
    const recordsData = await recordsRes.json();

    assert.strictEqual(recordsData.success, true);
    assert.strictEqual(recordsData.metric, 'calls');
    assert.strictEqual(recordsData.totalRecords, agentCallsCount, 'Calling agent calls count in dashboard must match metric-records count');

    if (recordsData.records.length > 0) {
      for (const r of recordsData.records) {
        assert.ok(r.hospitalName, 'Hospital name must be present on call record');
        assert.ok(r.dateFormatted, 'Call date/time must be present');
        assert.ok(r.disposition, 'Disposition must be present on call record');
        assert.ok(r.remarks, 'Remarks must be present on call record');
        assert.ok(r.callerName || r.assignedAgent, 'Caller name must be present');
        assert.ok(r.leadNumber, 'Lead ID/number must be present');
      }
    }
  });

  it('verifies Calling Agent Calls shows every actual call record separately without deduplication', async () => {
    const recordsRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=calls&dateFilter=thisMonth&limit=200', {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    const recordsData = await recordsRes.json();

    const callIds = recordsData.records.map((r) => r.id);
    const uniqueCallIds = new Set(callIds);
    assert.strictEqual(uniqueCallIds.size, callIds.length, 'Every call record must have a unique activity ID');
    assert.strictEqual(recordsData.totalRecords, recordsData.pagination.totalRecords);
  });

  it('verifies Calling Agent Demos metric card count matches metric-records count exactly', async () => {
    const dashRes = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    const dashData = await dashRes.json();
    const demosCount = dashData.dailyActivity?.demos ?? dashData.dailyActivity?.demosScheduled ?? 0;

    const recordsRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=demos&dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    assert.strictEqual(recordsRes.status, 200);
    const recordsData = await recordsRes.json();

    assert.strictEqual(recordsData.totalRecords, demosCount, 'Demos count must match metric-records total');
    if (recordsData.records.length > 0) {
      for (const r of recordsData.records) {
        assert.ok(r.hospitalName, 'Hospital name must be present on demo record');
        assert.ok(r.dateFormatted, 'Demo date must be present');
        assert.ok(r.status, 'Status must be present on demo record');
        assert.ok(r.assignedAgent, 'Assigned agent must be present on demo record');
        assert.ok(r.remarks, 'Remarks must be present on demo record');
      }
    }
  });

  it('verifies Calling Agent Walk-ins metric card count matches metric-records count exactly', async () => {
    const dashRes = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    const dashData = await dashRes.json();
    const walkinsCount = dashData.dailyActivity?.walkins ?? dashData.dailyActivity?.walkinsScheduled ?? 0;

    const recordsRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=walkins&dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    assert.strictEqual(recordsRes.status, 200);
    const recordsData = await recordsRes.json();

    assert.strictEqual(recordsData.totalRecords, walkinsCount, 'Walk-ins count must match metric-records total');
    if (recordsData.records.length > 0) {
      for (const r of recordsData.records) {
        assert.ok(r.hospitalName, 'Hospital name must be present on walk-in record');
        assert.ok(r.dateFormatted, 'Visit date must be present');
        assert.ok(r.status, 'Status must be present on walk-in record');
        assert.ok(r.assignedAgent, 'Assigned agent must be present on walk-in record');
        assert.ok(r.remarks, 'Remarks must be present on walk-in record');
      }
    }
  });

  it('enforces RBAC: Calling Agent cannot access unauthorized agent records even if passing query params', async () => {
    const fakeAgentId = '507f1f77bcf86cd799439011';
    const recordsRes = await fetch(`http://localhost:5000/api/dashboard/metric-records?metric=calls&agentId=${fakeAgentId}`, {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    assert.strictEqual(recordsRes.status, 200);
    const recordsData = await recordsRes.json();
    assert.strictEqual(recordsData.agentLabel, callingUser.fullName || callingUser.username, 'Backend must force target agent to authenticated calling agent');
  });

  it('verifies Recent hospitals first: Calling Agent My Leads sorts by createdAt descending with stable _id fallback', async () => {
    const leadsRes = await fetch('http://localhost:5000/api/leads?limit=30', {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    assert.strictEqual(leadsRes.status, 200);
    const leadsData = await leadsRes.json();
    assert.ok(Array.isArray(leadsData.leads), 'leads array must be returned');
    assert.ok(leadsData.leads.length > 1, 'Multiple leads expected for sort verification');

    for (let i = 0; i < leadsData.leads.length - 1; i++) {
      const current = leadsData.leads[i];
      const next = leadsData.leads[i + 1];

      const currentCreated = new Date(current.createdAt).getTime();
      const nextCreated = new Date(next.createdAt).getTime();

      assert.ok(
        currentCreated >= nextCreated,
        `Lead at index ${i} (${current.organizationName}, ${current.createdAt}) must be newer than or equal to lead at index ${i + 1} (${next.organizationName}, ${next.createdAt})`
      );

      if (currentCreated === nextCreated) {
        assert.ok(
          String(current._id) >= String(next._id),
          `Secondary tie-breaker _id must sort descending: ${current._id} vs ${next._id}`
        );
      }
    }
  });

  // ==========================================
  // SECTION 2: SALES AGENT TESTS (PRINCE)
  // ==========================================

  it('verifies Sales Agent dashboard responds with dailyActivity for This Month', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(data.dailyActivity, 'dailyActivity object must be present for Sales Agent');
    assert.ok(typeof data.dailyActivity.calls === 'number', 'calls count must be a number');
    assert.ok(typeof data.dailyActivity.followups === 'number', 'followups count must be a number');
    assert.ok(typeof data.dailyActivity.demos === 'number', 'demos count must be a number');
    assert.ok(typeof data.dailyActivity.walkins === 'number', 'walkins count must be a number');
    assert.ok(typeof data.dailyActivity.walkinsCompleted === 'number', 'walkinsCompleted count must be a number');
    assert.ok(typeof data.dailyActivity.demosCompleted === 'number', 'demosCompleted count must be a number');
    assert.ok(typeof data.dailyActivity.overdueFollowups === 'number', 'overdueFollowups must be a number');
  });

  it('verifies Sales Agent dashboard date filters: Today, Yesterday, Single Date, Custom Range', async () => {
    // 1. Today
    const todayRes = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=today', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(todayRes.status, 200);
    const todayData = await todayRes.json();
    assert.ok(todayData.dailyActivity, 'Sales Agent Today dailyActivity must be returned');

    // 2. Yesterday
    const yestRes = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=yesterday', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(yestRes.status, 200);
    const yestData = await yestRes.json();
    assert.ok(yestData.dailyActivity, 'Sales Agent Yesterday dailyActivity must be returned');

    // 3. Single Date
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const singleRes = await fetch(`http://localhost:5000/api/dashboard/agent?dateFilter=single&singleDate=${todayIST}`, {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(singleRes.status, 200);
    const singleData = await singleRes.json();
    assert.ok(singleData.dailyActivity, 'Sales Agent Single date dailyActivity must be returned');

    // 4. Custom Date Range
    const customRes = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=custom&startDate=2026-10-01&endDate=2026-10-22', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(customRes.status, 200);
    const customData = await customRes.json();
    assert.ok(customData.dailyActivity, 'Sales Agent Custom range dailyActivity must be returned');
  });

  it('verifies Sales Agent Demos and Demos Completed card counts match metric-records counts exactly', async () => {
    const dashRes = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    const dashData = await dashRes.json();
    const demosCardCount = dashData.dailyActivity?.demos ?? dashData.dailyActivity?.demosScheduled ?? 0;
    const demosCompletedCount = dashData.dailyActivity?.demosCompleted ?? 0;

    // Demos
    const demosRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=demos&dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(demosRes.status, 200);
    const demosData = await demosRes.json();
    assert.strictEqual(demosData.totalRecords, demosCardCount, 'Sales Agent Demos count must match metric-records');

    // Verify required demo fields: hospital, demo date/time, demo status, assigned agent, remarks
    for (const d of demosData.records) {
      assert.ok(d.hospitalName, 'Hospital name must be present on Sales Agent demo');
      assert.ok(d.leadNumber, 'Lead number must be present');
      assert.ok(d.dateFormatted, 'Demo date must be present');
      assert.ok(d.status, 'Demo status must be present');
      assert.ok(d.assignedAgent, 'Assigned agent must be present');
      assert.ok(d.remarks, 'Remarks must be present');
    }

    // Demos Completed
    const demosCompRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=demosCompleted&dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(demosCompRes.status, 200);
    const demosCompData = await demosCompRes.json();
    assert.strictEqual(demosCompData.totalRecords, demosCompletedCount, 'Sales Agent Demos Completed count must match metric-records');
  });

  it('verifies Sales Agent Walk-ins and Walk-ins Completed card counts match metric-records counts exactly', async () => {
    const dashRes = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    const dashData = await dashRes.json();
    const walkinsCardCount = dashData.dailyActivity?.walkins ?? dashData.dailyActivity?.walkinsScheduled ?? 0;
    const walkinsCompletedCount = dashData.dailyActivity?.walkinsCompleted ?? 0;

    // Walk-ins
    const walkinsRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=walkins&dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(walkinsRes.status, 200);
    const walkinsData = await walkinsRes.json();
    assert.strictEqual(walkinsData.totalRecords, walkinsCardCount, 'Sales Agent Walk-ins count must match metric-records');

    // Verify required walk-in fields: hospital, visit date/time, visit status, assigned agent, remarks
    for (const w of walkinsData.records) {
      assert.ok(w.hospitalName, 'Hospital name must be present on Sales Agent walk-in');
      assert.ok(w.leadNumber, 'Lead number must be present');
      assert.ok(w.dateFormatted, 'Visit date must be present');
      assert.ok(w.status, 'Visit status must be present');
      assert.ok(w.assignedAgent, 'Assigned agent must be present');
      assert.ok(w.remarks, 'Remarks must be present');
    }

    // Walk-ins Completed
    const walkinsCompRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=walkinsCompleted&dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(walkinsCompRes.status, 200);
    const walkinsCompData = await walkinsCompRes.json();
    assert.strictEqual(walkinsCompData.totalRecords, walkinsCompletedCount, 'Sales Agent Walk-ins Completed count must match metric-records');
  });

  it('verifies Sales Agent Follow-ups and Overdue Follow-ups card counts match metric-records counts exactly', async () => {
    const dashRes = await fetch('http://localhost:5000/api/dashboard/agent?dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    const dashData = await dashRes.json();
    const fuCardCount = dashData.dailyActivity?.followups ?? 0;
    const overdueCardCount = dashData.dailyActivity?.overdueFollowups ?? 0;

    // Follow-ups
    const fuRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=followups&dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(fuRes.status, 200);
    const fuData = await fuRes.json();
    assert.strictEqual(fuData.totalRecords, fuCardCount, 'Sales Agent Follow-ups count must match metric-records');

    // Verify required follow-up fields: hospital, scheduled follow-up date/time, status, responsible agent, remarks
    for (const f of fuData.records) {
      assert.ok(f.hospitalName, 'Hospital name must be present');
      assert.ok(f.dateFormatted, 'Follow-up date must be present');
      assert.ok(f.status, 'Follow-up status must be present');
      assert.ok(f.assignedAgent, 'Responsible agent must be present');
      assert.ok(f.remarks, 'Remarks must be present');
    }

    // Overdue Follow-ups
    const overdueRes = await fetch('http://localhost:5000/api/dashboard/metric-records?metric=overdueFollowups&dateFilter=thisMonth', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(overdueRes.status, 200);
    const overdueData = await overdueRes.json();
    assert.strictEqual(overdueData.totalRecords, overdueCardCount, 'Sales Agent Overdue Follow-ups count must match metric-records');
  });

  it('enforces RBAC: Sales Agent cannot access other agents records even if passing query params', async () => {
    // Sales Agent tries to pass another agent ID (e.g. Jyoti's ID) to metric-records
    const recordsRes = await fetch(`http://localhost:5000/api/dashboard/metric-records?metric=calls&agentId=${callingUser._id}`, {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(recordsRes.status, 200);
    const recordsData = await recordsRes.json();

    // The backend overrides agentId to the sales agent's own _id
    assert.strictEqual(recordsData.agentLabel, salesUser.fullName || salesUser.username, 'Backend must force target agent to authenticated sales agent');
  });

  it('verifies Recent hospitals first: Sales Agent My Leads sorts by createdAt descending with stable _id fallback', async () => {
    const leadsRes = await fetch('http://localhost:5000/api/leads?limit=30', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(leadsRes.status, 200);
    const leadsData = await leadsRes.json();
    assert.ok(Array.isArray(leadsData.leads), 'leads array must be returned for Sales Agent');

    if (leadsData.leads.length > 1) {
      for (let i = 0; i < leadsData.leads.length - 1; i++) {
        const current = leadsData.leads[i];
        const next = leadsData.leads[i + 1];

        const currentCreated = new Date(current.createdAt).getTime();
        const nextCreated = new Date(next.createdAt).getTime();

        assert.ok(
          currentCreated >= nextCreated,
          `Lead at index ${i} (${current.organizationName}, ${current.createdAt}) must be newer than or equal to lead at index ${i + 1} (${next.organizationName}, ${next.createdAt})`
        );

        if (currentCreated === nextCreated) {
          assert.ok(
            String(current._id) >= String(next._id),
            `Secondary tie-breaker _id must sort descending: ${current._id} vs ${next._id}`
          );
        }
      }
    }
  });

  it('verifies pagination preserves newest-first ordering for Sales Agent', async () => {
    const p1Res = await fetch('http://localhost:5000/api/leads?page=1&limit=3', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    const p1Data = await p1Res.json();

    const p2Res = await fetch('http://localhost:5000/api/leads?page=2&limit=3', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    const p2Data = await p2Res.json();

    if (p1Data.leads.length > 0 && p2Data.leads.length > 0) {
      const lastP1 = p1Data.leads[p1Data.leads.length - 1];
      const firstP2 = p2Data.leads[0];

      const lastP1Time = new Date(lastP1.createdAt).getTime();
      const firstP2Time = new Date(firstP2.createdAt).getTime();

      assert.ok(
        lastP1Time >= firstP2Time,
        `Last item on page 1 (${lastP1.createdAt}) must be newer than or equal to first item on page 2 (${firstP2.createdAt})`
      );
    }
  });
});
