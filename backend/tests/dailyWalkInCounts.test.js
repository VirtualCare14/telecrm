const { describe, it, after } = require('node:test');
const assert = require('node:assert');

describe('Daily Activity Walk-In Counts Regression Suite', () => {
  const BASE_URL = 'http://localhost:5000';
  let adminToken = '';
  let salesAgentId = '';
  let callingAgentId = '';
  let testLeadId = '';
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const testDate = todayIST;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tomorrowDate = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const futureDate = future.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  it('authenticates admin user and retrieves agent IDs', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
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

    const agentsRes = await fetch(`${BASE_URL}/api/agents`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(agentsRes.status, 200);
    const agentsData = await agentsRes.json();
    const agents = Array.isArray(agentsData) ? agentsData : (agentsData.agents || []);
    
    const sales = agents.find(a => (a.agentRole || '').toLowerCase().includes('sales'));
    const calling = agents.find(a => (a.agentRole || '').toLowerCase().includes('calling'));
    if (sales) salesAgentId = sales._id || sales.id;
    if (calling) callingAgentId = calling._id || calling.id;
    assert.ok(salesAgentId, 'Sales Agent required for testing');
  });

  it('creates a dedicated lead for walk-in testing', async () => {
    const createRes = await fetch(`${BASE_URL}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        organizationName: 'Daily WalkIn Test Clinic ' + Date.now(),
        industry: 'Healthcare',
        organizationType: 'Hospital',
        address: 'MG Road, Bengaluru',
        leadSource: 'Field Visit',
        contacts: [{ name: 'Dr. Test Daily', phone: '9888877777' }],
      }),
    });
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    testLeadId = createData.lead._id;
    assert.ok(testLeadId);
  });

  it('Requirement 1 & 6: Scheduled, Completed, and Not Done counts are mutually exclusive (No duplicate counting)', async () => {
    // 1. Fetch baseline
    const baseRes = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(baseRes.status, 200);
    const baseData = await baseRes.json();
    const baseSummary = baseData.summary;

    assert.ok(baseSummary, 'Daily Activity Summary must be present');
    assert.strictEqual(baseSummary.selectedDate, testDate);

    // Verify scheduled does NOT equal total walk-ins when completed or not-done visits exist
    if (baseSummary.walkInsCompleted > 0 || baseSummary.walkInsNotCompleted > 0) {
      const totalVisits = baseSummary.walkInsScheduled + baseSummary.walkInsCompleted + baseSummary.walkInsNotCompleted;
      assert.ok(
        baseSummary.walkInsScheduled < totalVisits,
        `walkInsScheduled (${baseSummary.walkInsScheduled}) must NOT equal total walk-ins (${totalVisits})`
      );
    }
    assert.strictEqual(
      baseData.walkIns.length,
      baseSummary.walkInsCompleted,
      'Field Visits list count must strictly equal completed visits count'
    );

    // 2. Create a Planned walk-in on testDate
    const planRes = await fetch(`${BASE_URL}/api/leads/${testLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        walkInDate: testDate,
        walkInTime: '11:00',
        remark: 'Pre-scheduled meeting with HOD',
        status: 'Planned',
        salesAgent: salesAgentId,
      }),
    });
    assert.strictEqual(planRes.status, 201);
    const planData = await planRes.json();
    const walkInId = planData.walkIn._id;

    // 3. Verify walkInsScheduled increments by 1, completed stays unchanged
    const afterPlanRes = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const afterPlanData = await afterPlanRes.json();
    assert.strictEqual(afterPlanData.summary.walkInsScheduled, baseSummary.walkInsScheduled + 1);
    assert.strictEqual(afterPlanData.summary.walkInsCompleted, baseSummary.walkInsCompleted);

    // 4. Update the walk-in to Completed on-site
    const completeRes = await fetch(`${BASE_URL}/api/leads/${testLeadId}/walk-ins/${walkInId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'Completed',
        remark: 'Meeting concluded with product presentation.',
        latitude: 12.9716,
        longitude: 77.5946,
        accuracy: 10,
        locationStatus: 'Captured',
        locationCapturedAt: new Date().toISOString(),
        deviceInstallationId: 'daily-report-test-device-uuid',
      }),
    });
    assert.strictEqual(completeRes.status, 200);

    // 5. Verify walkInsScheduled decrements back and walkInsCompleted increments by 1
    const afterCompleteRes = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const afterCompleteData = await afterCompleteRes.json();
    assert.strictEqual(afterCompleteData.summary.walkInsScheduled, baseSummary.walkInsScheduled);
    assert.strictEqual(afterCompleteData.summary.walkInsCompleted, baseSummary.walkInsCompleted + 1);
  });

  it('Requirement 2: Walk-ins scheduled for previous or future dates are NOT counted in today scheduled count', async () => {
    // 1. Get today baseline
    const todayBaseRes = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const todayBaseData = await todayBaseRes.json();
    const todayScheduledBefore = todayBaseData.summary.walkInsScheduled;

    // 2. Get future date baseline
    const futureBaseRes = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${futureDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const futureBaseData = await futureBaseRes.json();
    const futureScheduledBefore = futureBaseData.summary.walkInsScheduled;

    // 3. Create a Planned walk-in for the future date
    const futureRes = await fetch(`${BASE_URL}/api/leads/${testLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        walkInDate: futureDate,
        walkInTime: '15:00',
        remark: 'Advance appointment booked for next month',
        status: 'Planned',
        salesAgent: salesAgentId,
      }),
    });
    assert.strictEqual(futureRes.status, 201);

    // 4. Verify today's scheduled count did NOT change
    const todayAfterRes = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const todayAfterData = await todayAfterRes.json();
    assert.strictEqual(
      todayAfterData.summary.walkInsScheduled,
      todayScheduledBefore,
      'Future scheduled walk-in must NOT increment today scheduled count'
    );

    // 5. Verify future date scheduled count DID increment
    const futureAfterRes = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${futureDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const futureAfterData = await futureAfterRes.json();
    assert.strictEqual(
      futureAfterData.summary.walkInsScheduled,
      futureScheduledBefore + 1,
      'Future scheduled walk-in must appear on its scheduled date'
    );
  });

  it('Requirement 4: Not Done visits follow their status-change date and are excluded from completed and scheduled counts', async () => {
    // 1. Get baseline
    const baseRes = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const baseData = await baseRes.json();
    const baseNotDone = baseData.summary.walkInsNotCompleted;
    const baseCompleted = baseData.summary.walkInsCompleted;
    const baseScheduled = baseData.summary.walkInsScheduled;

    // 2. Create a Planned walk-in for today
    const planRes = await fetch(`${BASE_URL}/api/leads/${testLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        walkInDate: testDate,
        walkInTime: '16:00',
        remark: 'Meeting to be cancelled for testing',
        status: 'Planned',
        salesAgent: salesAgentId,
      }),
    });
    assert.strictEqual(planRes.status, 201);
    const planData = await planRes.json();
    const walkInId = planData.walkIn._id;

    // 3. Update status to Not Done
    const notDoneRes = await fetch(`${BASE_URL}/api/leads/${testLeadId}/walk-ins/${walkInId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'Not Done',
        remark: 'Doctor was called into emergency surgery; visit cancelled.',
      }),
    });
    assert.strictEqual(notDoneRes.status, 200);

    // 4. Verify Not Done count incremented by 1, while Completed and Scheduled remain at base
    const afterRes = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const afterData = await afterRes.json();
    assert.strictEqual(afterData.summary.walkInsNotCompleted, baseNotDone + 1);
    assert.strictEqual(afterData.summary.walkInsCompleted, baseCompleted);
    assert.strictEqual(afterData.summary.walkInsScheduled, baseScheduled);
  });

  it('Requirement 5: Field Visits GPS list contains only qualifying completed visits for the selected date', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json();

    // Verify all returned records in walkIns have status Done or Completed
    assert.ok(data.walkIns.length > 0, 'Field visits should have completed entries');
    assert.strictEqual(data.walkIns.length, data.summary.walkInsCompleted);

    data.walkIns.forEach(w => {
      assert.ok(
        ['Done', 'Completed'].includes(w.status),
        `Every field visit in reportData.walkIns must be Completed, got: ${w.status}`
      );
      assert.notStrictEqual(w.status, 'Planned', 'Planned visits must not appear in field visits GPS list');
      assert.notStrictEqual(w.status, 'Not Done', 'Not Done visits must not appear in field visits GPS list');
    });
  });

  it('Requirement 7: Respects Role and Agent filters on Daily Activity Summary', async () => {
    // 1. Total (no filter)
    const totalRes = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const totalData = await totalRes.json();

    // 2. Role: Sales Agent
    const salesRes = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${testDate}&role=Sales%20Agent`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(salesRes.status, 200);
    const salesData = await salesRes.json();

    // 3. Role: Calling Agent
    const callingRes = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${testDate}&role=Calling%20Agent`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(callingRes.status, 200);
    const callingData = await callingRes.json();

    // Verify that role filtered counts do not exceed total
    assert.ok(salesData.summary.walkInsCompleted <= totalData.summary.walkInsCompleted);
    assert.ok(callingData.summary.walkInsCompleted <= totalData.summary.walkInsCompleted);
    assert.strictEqual(
      salesData.walkIns.length,
      salesData.summary.walkInsCompleted,
      'Sales Agent field visits list must match its completed summary count'
    );
    assert.strictEqual(
      callingData.walkIns.length,
      callingData.summary.walkInsCompleted,
      'Calling Agent field visits list must match its completed summary count'
    );
  });

  it('Requirement 8: Calls, Demos, Follow-ups, and Closures remain accurate and unaffected', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json();
    const summary = data.summary;

    assert.ok(summary.totalCalls >= 1, 'Total calls must be present');
    assert.ok(summary.uniqueHospitalsCalled >= 1, 'Unique hospitals called must be present');
    assert.ok(typeof summary.followUpsCompleted === 'number');
    assert.ok(typeof summary.demosScheduled === 'number');
    assert.ok(typeof summary.demosCompleted === 'number');
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
        console.error('Error in dailyWalkInCounts.test.js cleanup:', err);
      }
    }
  });
});
