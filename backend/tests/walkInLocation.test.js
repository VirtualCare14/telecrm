const { describe, it, after } = require('node:test');
const assert = require('node:assert');

describe('Sales Agent Visit Location & Device ID Suite', () => {
  let adminToken = '';
  let agentToken = '';
  let adminUserId = '';
  let agentUserId = '';
  let testLeadId = '';

  it('authenticates admin and creates a dedicated test lead', async () => {
    // 1. Authenticate Admin
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
        password: process.env.ADMIN_PASSWORD || 'Admin123!',
      }),
    });
    assert.strictEqual(loginRes.status, 200);
    const loginData = await loginRes.json();
    adminToken = loginData.token;
    adminUserId = loginData.user?.id || loginData.user?._id;
    assert.ok(adminToken);

    // 2. Create a dedicated ephemeral lead for visit testing (never touch real leads)
    const createRes = await fetch('http://localhost:5000/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        organizationName: 'WalkIn Location Test Clinic ' + Date.now(),
        industry: 'Healthcare',
        organizationType: 'Hospital',
        address: 'MG Road, Bengaluru',
        leadSource: 'Field Visit',
        contacts: [{ name: 'Dr. Test WalkIn', phone: '9888877777' }],
      }),
    });
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    testLeadId = createData.lead._id;
    assert.ok(testLeadId);
  });

  it('authenticates or identifies a sales agent', async () => {
    const agentsRes = await fetch('http://localhost:5000/api/agents', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(agentsRes.status, 200);
    const agentsData = await agentsRes.json();
    const agents = Array.isArray(agentsData) ? agentsData : (agentsData.agents || []);
    assert.ok(Array.isArray(agents));
    const agent = agents.find(a => a.agentRole === 'Sales Agent' || a.role === 'AGENT') || agents[0];
    agentUserId = agent ? (agent._id || agent.id) : adminUserId;
    assert.ok(agentUserId);
  });

  it('successfully creates a walk-in visit with GPS coordinates and persistent device ID', async () => {
    const payload = {
      walkInDate: '2026-10-21',
      walkInTime: '14:30',
      remark: 'On-site visit at cardiology department with Dr. Mehta.',
      status: 'Completed',
      salesAgent: agentUserId,
      latitude: 12.971598,
      longitude: 77.594562,
      accuracy: 15,
      locationCapturedAt: new Date().toISOString(),
      locationStatus: 'Captured',
      deviceInstallationId: 'telecrm-test-device-uuid-12345678',
    };

    const res = await fetch(`http://localhost:5000/api/leads/${testLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.walkIn);
    const w = data.walkIn;

    // Verify stored walk-in record in DB
    assert.strictEqual(w.locationStatus, 'Captured');
    assert.strictEqual(Number(w.latitude.toFixed(4)), 12.9716);
    assert.strictEqual(Number(w.longitude.toFixed(4)), 77.5946);
    assert.strictEqual(w.accuracy, 15);
    assert.strictEqual(w.deviceInstallationId, 'telecrm-test-device-uuid-12345678');
    assert.ok(w.locationCapturedAt);
    assert.ok(w.createdAt);

    // Verify latestWalkIn on lead
    assert.ok(data.latestWalkIn);
    assert.strictEqual(data.latestWalkIn.locationStatus, 'Captured');
    assert.strictEqual(data.latestWalkIn.deviceInstallationId, 'telecrm-test-device-uuid-12345678');
  });

  it('creates a walk-in visit with Permission Denied location status gracefully without crashing', async () => {
    const payload = {
      walkInDate: '2026-10-21',
      walkInTime: '15:00',
      remark: 'Agent device had location access blocked by browser permission policy.',
      status: 'Planned',
      salesAgent: agentUserId,
      latitude: null,
      longitude: null,
      accuracy: null,
      locationStatus: 'Permission Denied',
      deviceInstallationId: 'telecrm-test-device-uuid-87654321',
    };

    const res = await fetch(`http://localhost:5000/api/leads/${testLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.walkIn.locationStatus, 'Permission Denied');
    assert.strictEqual(data.walkIn.latitude, null);
    assert.strictEqual(data.walkIn.longitude, null);
    assert.strictEqual(data.walkIn.deviceInstallationId, 'telecrm-test-device-uuid-87654321');
  });

  it('creates a walk-in visit when device installation ID is missing or unavailable', async () => {
    const payload = {
      walkInDate: '2026-10-21',
      walkInTime: '15:30',
      remark: 'Browser in private mode without persistent storage available.',
      status: 'Planned',
      salesAgent: agentUserId,
      locationStatus: 'Unavailable',
    };

    const res = await fetch(`http://localhost:5000/api/leads/${testLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.walkIn.locationStatus, 'Unavailable');
    assert.strictEqual(data.walkIn.deviceInstallationId, null);
  });

  it('rejects invalid GPS coordinates with HTTP 400', async () => {
    const invalidLatPayload = {
      walkInDate: '2026-10-21',
      walkInTime: '16:00',
      remark: 'Invalid coordinates test',
      latitude: 195.5, // Exceeds valid range [-90, 90]
      longitude: 77.0,
      locationStatus: 'Captured',
    };

    const res = await fetch(`http://localhost:5000/api/leads/${testLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(invalidLatPayload),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.message || data.errors);
  });

  it('updates walk-in status and records verified location on completion', async () => {
    // 1. Create a planned walk-in
    const initRes = await fetch(`http://localhost:5000/api/leads/${testLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        walkInDate: '2026-10-21',
        walkInTime: '10:00',
        remark: 'Pre-scheduled appointment',
        status: 'Planned',
        salesAgent: agentUserId,
      }),
    });
    assert.strictEqual(initRes.status, 201);
    const initData = await initRes.json();
    const walkInId = initData.walkIn._id;

    // 2. Complete the visit on-site with GPS capture
    const updateRes = await fetch(`http://localhost:5000/api/leads/${testLeadId}/walk-ins/${walkInId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'Completed',
        remark: 'Meeting concluded successfully. Presented telemedicine demo.',
        latitude: 28.613939,
        longitude: 77.209021,
        accuracy: 8,
        locationCapturedAt: new Date().toISOString(),
        locationStatus: 'Captured',
        deviceInstallationId: 'telecrm-test-device-completion-uuid',
      }),
    });

    assert.strictEqual(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.walkIn.status, 'Completed');
    assert.strictEqual(updateData.walkIn.locationStatus, 'Captured');
    assert.strictEqual(Number(updateData.walkIn.latitude.toFixed(4)), 28.6139);
    assert.strictEqual(updateData.walkIn.accuracy, 8);
    assert.strictEqual(updateData.walkIn.deviceInstallationId, 'telecrm-test-device-completion-uuid');
  });

  it('verifies listWalkIns returns location metadata and preserves historical records', async () => {
    const res = await fetch(`http://localhost:5000/api/leads/${testLeadId}/walk-ins`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.walkIns));
    assert.ok(data.walkIns.length > 0);

    const verifiedVisit = data.walkIns.find(w => w.locationStatus === 'Captured');
    assert.ok(verifiedVisit, 'Should find at least one verified visit with GPS coordinates');
    assert.strictEqual(typeof verifiedVisit.latitude, 'number');
    assert.strictEqual(typeof verifiedVisit.longitude, 'number');
    assert.ok(verifiedVisit.deviceInstallationId);
  });

  it('verifies Admin Daily Activity Report includes GPS coordinates, status, device ID, and mapUrl', async () => {
    const res = await fetch('http://localhost:5000/api/dashboard/daily-activity?date=2026-10-21', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.walkIns);
    assert.ok(Array.isArray(data.walkIns));

    const visit = data.walkIns.find(w => w.locationStatus === 'Captured');
    if (visit) {
      assert.strictEqual(visit.locationStatus, 'Captured');
      assert.strictEqual(typeof visit.latitude, 'number');
      assert.strictEqual(typeof visit.longitude, 'number');
      assert.ok(visit.mapUrl.includes('google.com/maps'));
      assert.ok(visit.deviceInstallationId);
      assert.ok(visit.hospitalAddress); // Confirms hospital registered address is separate
    }
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
        console.error('Error in walkInLocation.test.js cleanup:', err);
      }
    }
  });
});
