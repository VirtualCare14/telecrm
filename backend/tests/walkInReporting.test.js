const { describe, it, after } = require('node:test');
const assert = require('node:assert');

describe('Total Walk-ins Reporting & Aggregation Regression Test Suite', () => {
  let adminToken = '';
  let salesAgentId = '';
  let callingAgentId = '';
  let testLeadId = '';
  const testDate = '2026-10-21';
  const futureDate = '2026-11-15';

  it('authenticates admin user for reporting validation', async () => {
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
        password: process.env.ADMIN_PASSWORD || 'Admin123!',
      }),
    });
    assert.strictEqual(loginRes.status, 200);
    const data = await loginRes.json();
    adminToken = data.token;
    assert.ok(adminToken);

    // Identify Sales and Calling agents
    const agentsRes = await fetch('http://localhost:5000/api/agents', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(agentsRes.status, 200);
    const agentsData = await agentsRes.json();
    const agents = Array.isArray(agentsData) ? agentsData : (agentsData.agents || []);
    
    const sales = agents.find(a => (a.agentRole || '').toLowerCase().includes('sales'));
    const calling = agents.find(a => (a.agentRole || '').toLowerCase().includes('calling'));
    if (sales) salesAgentId = sales._id || sales.id;
    if (calling) callingAgentId = calling._id || calling.id;
    assert.ok(salesAgentId, 'Sales Agent required for reporting test');
  });

  it('creates a dedicated lead for walk-in testing', async () => {
    const createRes = await fetch('http://localhost:5000/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        organizationName: 'Reporting Test Hospital ' + Date.now(),
        industry: 'Healthcare',
        organizationType: 'Hospital',
        address: 'Test Medical Road',
        leadSource: 'Field Visit',
        contacts: [{ name: 'Test Contact', phone: '9999988888' }],
      }),
    });
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    testLeadId = createData.lead._id;
    assert.ok(testLeadId);
  });

  it('verifies scheduled / planned walk-ins do NOT increment Total Walk-ins count', async () => {
    // 1. Get baseline count for today
    const baseRes = await fetch(`http://localhost:5000/api/dashboard/reports?startDate=${testDate}&endDate=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(baseRes.status, 200);
    const baseData = await baseRes.json();
    const initialCompleted = baseData.summary.walkInsCount || 0;
    const initialScheduled = baseData.summary.walkInsScheduled || 0;

    // 2. Create a Planned walk-in scheduled for today
    const plannedRes = await fetch(`http://localhost:5000/api/leads/${testLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        walkInDate: testDate,
        walkInTime: '14:00',
        status: 'Planned',
        remark: 'Initial visit planned for cardiology wing.',
        salesAgent: salesAgentId,
      }),
    });
    assert.strictEqual(plannedRes.status, 201);
    const plannedData = await plannedRes.json();
    const walkInId = plannedData.walkIn._id;

    // 3. Re-query reports
    const afterRes = await fetch(`http://localhost:5000/api/dashboard/reports?startDate=${testDate}&endDate=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(afterRes.status, 200);
    const afterData = await afterRes.json();

    // Total Walk-ins (conducted) MUST NOT increase!
    assert.strictEqual(
      afterData.summary.walkInsCount,
      initialCompleted,
      'Planned walk-in must NOT increment Total Walk-ins (conducted) count'
    );
    // Planned count must increase by 1
    assert.strictEqual(
      afterData.summary.walkInsScheduled,
      initialScheduled + 1,
      'Planned walk-in must increment walkInsScheduled count'
    );

    // 4. Mark walk-in as Completed
    const completeRes = await fetch(`http://localhost:5000/api/leads/${testLeadId}/walk-ins/${walkInId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'Completed',
        remark: 'Successfully concluded on-site hospital meeting.',
      }),
    });
    assert.strictEqual(completeRes.status, 200);

    // 5. Re-query reports after completion
    const completeReportRes = await fetch(`http://localhost:5000/api/dashboard/reports?startDate=${testDate}&endDate=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(completeReportRes.status, 200);
    const completeReportData = await completeReportRes.json();

    // Total Walk-ins MUST now increase by exactly 1
    assert.strictEqual(
      completeReportData.summary.walkInsCount,
      initialCompleted + 1,
      'Completed walk-in visit must increment Total Walk-ins count by exactly 1'
    );

    // 6. Test duplicate prevention: Updating the walk-in remarks again does NOT increment count again
    const updateRes = await fetch(`http://localhost:5000/api/leads/${testLeadId}/walk-ins/${walkInId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'Completed',
        remark: 'Additional follow-up notes appended after CMO discussion.',
      }),
    });
    assert.strictEqual(updateRes.status, 200);

    const dupReportRes = await fetch(`http://localhost:5000/api/dashboard/reports?startDate=${testDate}&endDate=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dupReportData = await dupReportRes.json();
    assert.strictEqual(
      dupReportData.summary.walkInsCount,
      initialCompleted + 1,
      'Updating a completed walk-in must NOT duplicate or increment the count again'
    );
  });

  it('verifies cancelled / Not Done walk-ins are NOT counted as completed visits', async () => {
    // 1. Get baseline
    const baseRes = await fetch(`http://localhost:5000/api/dashboard/reports?startDate=${testDate}&endDate=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const baseData = await baseRes.json();
    const countBefore = baseData.summary.walkInsCount;

    // 2. Create a Not Done walk-in
    const notDoneRes = await fetch(`http://localhost:5000/api/leads/${testLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        walkInDate: testDate,
        walkInTime: '16:00',
        status: 'Not Done',
        remark: 'Doctor unavailable, visit cancelled.',
        salesAgent: salesAgentId,
      }),
    });
    assert.strictEqual(notDoneRes.status, 201);

    // 3. Re-query reports
    const afterRes = await fetch(`http://localhost:5000/api/dashboard/reports?startDate=${testDate}&endDate=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const afterData = await afterRes.json();

    assert.strictEqual(
      afterData.summary.walkInsCount,
      countBefore,
      'Not Done / Cancelled walk-in must NOT be counted in Total Walk-ins'
    );
  });

  it('verifies walk-ins on different dates are NOT counted in today daily report', async () => {
    // 1. Get today baseline
    const todayBaseRes = await fetch(`http://localhost:5000/api/dashboard/reports?startDate=${testDate}&endDate=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const todayBaseData = await todayBaseRes.json();
    const todayCountBefore = todayBaseData.summary.walkInsCount;

    // 2. Create a completed walk-in on a future date
    const futureRes = await fetch(`http://localhost:5000/api/leads/${testLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        walkInDate: futureDate,
        walkInTime: '10:00',
        status: 'Completed',
        remark: 'Advance recorded on-site visit for next month.',
        salesAgent: salesAgentId,
      }),
    });
    assert.strictEqual(futureRes.status, 201);

    // 3. Verify today report did NOT change
    const todayAfterRes = await fetch(`http://localhost:5000/api/dashboard/reports?startDate=${testDate}&endDate=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const todayAfterData = await todayAfterRes.json();
    assert.strictEqual(
      todayAfterData.summary.walkInsCount,
      todayCountBefore,
      'Walk-in on a different date must NOT be counted in today daily report'
    );

    // 4. Verify future date report includes this walk-in
    const futureReportRes = await fetch(`http://localhost:5000/api/dashboard/reports?startDate=${futureDate}&endDate=${futureDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const futureReportData = await futureReportRes.json();
    assert.ok(
      futureReportData.summary.walkInsCount >= 1,
      'Future date report must count the walk-in on its actual visit date'
    );
  });

  it('verifies agent and role filtering on Total Walk-ins count', async () => {
    // 1. Query with role=Sales Agent
    const salesRes = await fetch(`http://localhost:5000/api/dashboard/reports?startDate=${testDate}&endDate=${testDate}&role=Sales%20Agent`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(salesRes.status, 200);
    const salesData = await salesRes.json();
    assert.ok(salesData.summary.walkInsCount !== undefined);
    
    // Sum of agentPerformance for Sales Agents must equal summary.walkInsCount
    const salesSum = (salesData.agentPerformance || []).reduce((acc, a) => acc + (a.walkIns || 0), 0);
    assert.strictEqual(
      salesData.summary.walkInsCount,
      salesSum,
      'Summary walkInsCount must match sum of Sales Agent performance walk-ins'
    );

    // 2. Query with specific agentId
    if (salesAgentId) {
      const agentRes = await fetch(`http://localhost:5000/api/dashboard/reports?startDate=${testDate}&endDate=${testDate}&agentId=${salesAgentId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(agentRes.status, 200);
      const agentData = await agentRes.json();
      assert.strictEqual(
        agentData.summary.walkInsCount,
        agentData.agentPerformance[0]?.walkIns || 0,
        'Summary walkInsCount for single agent must match that agent walkIns count'
      );
    }
  });

  it('verifies total walk-ins consistency across summary, date-wise report, and agent breakdown', async () => {
    const res = await fetch(`http://localhost:5000/api/dashboard/reports?startDate=${testDate}&endDate=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    const summaryCount = data.summary.walkInsCount;
    
    // Date-wise sum
    const dateWiseSum = (data.dateWiseReport || []).reduce((acc, d) => acc + (d.walkIns || 0), 0);
    assert.strictEqual(
      summaryCount,
      dateWiseSum,
      'summary.walkInsCount must equal sum of dateWiseReport walk-ins'
    );

    // Agent performance + unassigned sum
    const agentSum = (data.agentPerformance || []).reduce((acc, a) => acc + (a.walkIns || 0), 0) +
      (data.unassignedActivities?.walkIns || 0);
    assert.strictEqual(
      summaryCount,
      agentSum,
      'summary.walkInsCount must equal sum of agentPerformance walk-ins plus unassigned'
    );
  });

  after(async () => {
    if (testLeadId) {
      try {
        const path = require('path');
        require('dotenv').config({ path: path.join(__dirname, '../.env') });
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 0) {
          await mongoose.connect(process.env.MONGO_URI);
        }
        const Lead = require('../src/models/Lead');
        const WalkIn = require('../src/models/WalkIn');
        const LeadActivity = require('../src/models/LeadActivity');
        await Lead.deleteOne({ _id: testLeadId });
        await WalkIn.deleteMany({ lead: testLeadId });
        await LeadActivity.deleteMany({ lead: testLeadId });
        await mongoose.disconnect();
      } catch (err) {
        console.error('Error in walkInReporting.test.js cleanup:', err);
      }
    }
  });
});
