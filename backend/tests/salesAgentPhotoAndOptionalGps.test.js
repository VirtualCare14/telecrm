const { describe, it, after, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Sales Agent Mandatory Live Photo & Optional Location Test Suite', () => {
  let adminToken = '';
  let salesToken = '';
  let callingToken = '';
  let salesUser = null;
  let callingUser = null;
  const createdLeadIds = [];
  const createdWalkInIds = [];

  // Helper to create a valid JPEG image buffer (> 500 bytes) with standard JPEG magic bytes (FF D8 FF)
  function generateValidJpegDataUrl() {
    const header = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00
    ]);
    const body = Buffer.alloc(800, 0x55); // > 500 bytes
    const footer = Buffer.from([0xFF, 0xD9]);
    const fullBuffer = Buffer.concat([header, body, footer]);
    return `data:image/jpeg;base64,${fullBuffer.toString('base64')}`;
  }

  // Base hospital coordinates (Indiranagar, Bengaluru)
  const hospitalLat = 12.971598;
  const hospitalLng = 77.594562;

  // Far location (~350m away from hospital)
  const farLat = 12.974748;
  const farLng = 77.594562;

  before(async () => {
    // 1. Authenticate Admin
    const adminRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
        password: process.env.ADMIN_PASSWORD || 'Admin123!',
      }),
    });
    assert.strictEqual(adminRes.status, 200, 'Admin login must succeed');
    const adminData = await adminRes.json();
    adminToken = adminData.token;

    // 2. Discover agents
    const agentsRes = await fetch('http://localhost:5000/api/agents', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(agentsRes.status, 200);
    const agents = await agentsRes.json();
    const agentList = Array.isArray(agents) ? agents : (agents.agents || []);

    salesUser = agentList.find(a => (a.agentRole || '').toLowerCase().includes('sales'));
    callingUser = agentList.find(a => (a.agentRole || '').toLowerCase().includes('calling'));

    assert.ok(salesUser, 'Sales Agent must exist in the database');
    assert.ok(callingUser, 'Calling Agent must exist in the database');

    // 3. Login as Sales Agent
    const salesRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: salesUser.username,
        password: 'Prince@1402',
      }),
    });
    assert.strictEqual(salesRes.status, 200, 'Sales agent login must succeed');
    const salesData = await salesRes.json();
    salesToken = salesData.token;

    // 4. Login as Calling Agent
    const callingRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: callingUser.username,
        password: 'Jyoti@1402',
      }),
    });
    assert.strictEqual(callingRes.status, 200, 'Calling agent login must succeed');
    const callingData = await callingRes.json();
    callingToken = callingData.token;
  });

  after(async () => {
    // Clean up created test leads to preserve database integrity
    for (const leadId of createdLeadIds) {
      try {
        await fetch(`http://localhost:5000/api/leads/${leadId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      } catch {
        // ignore cleanup error
      }
    }
  });

  // TEST 1: Sales Agent lead creation WITHOUT photo -> Rejected 400
  it('rejects Sales Agent lead creation when mandatory live photo is missing (HTTP 400)', async () => {
    const res = await fetch('http://localhost:5000/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken}`,
      },
      body: JSON.stringify({
        organizationName: 'Test Hospital No Photo ' + Date.now(),
        industry: 'Healthcare',
        organizationType: 'Hospital',
        leadSource: 'Field Visit',
        contacts: [{ name: 'Test Contact', phone: '9876500001' }],
        createdLocation: {
          status: 'Permission Denied',
        },
      }),
    });

    assert.strictEqual(res.status, 400, 'Should return HTTP 400 when photo is missing for Sales Agent');
    const err = await res.json();
    assert.match(err.message, /live camera photo/i);
  });

  // TEST 2: Sales Agent lead creation with empty/corrupt photo (< 500 bytes) -> Rejected 400
  it('rejects Sales Agent lead creation when photo payload is dummy/too small (< 500B) (HTTP 400)', async () => {
    const res = await fetch('http://localhost:5000/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken}`,
      },
      body: JSON.stringify({
        organizationName: 'Test Hospital Corrupt Photo ' + Date.now(),
        industry: 'Healthcare',
        organizationType: 'Hospital',
        leadSource: 'Field Visit',
        contacts: [{ name: 'Test Contact', phone: '9876500002' }],
        visitPhoto: 'data:image/jpeg;base64,dGVzdA==', // 4 bytes!
      }),
    });

    assert.strictEqual(res.status, 400, 'Should reject corrupt/tiny photo');
    const err = await res.json();
    assert.match(err.message, /photo.*invalid|clear camera photo/i);
  });

  // TEST 3: Sales Agent lead creation with valid photo and NO GPS (Permission Denied) -> Succeeds 201
  it('allows Sales Agent lead creation with valid live photo when GPS permission is denied (HTTP 201)', async () => {
    const photoDataUrl = generateValidJpegDataUrl();
    const res = await fetch('http://localhost:5000/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken}`,
      },
      body: JSON.stringify({
        organizationName: 'Test Hospital Valid Photo No GPS ' + Date.now(),
        industry: 'Healthcare',
        organizationType: 'Hospital',
        address: '123 Main Road, Bengaluru',
        leadSource: 'Field Visit',
        contacts: [{ name: 'Dr. Alok', phone: '9876500003' }],
        visitPhoto: {
          data: photoDataUrl,
          capturedAt: new Date().toISOString(),
        },
        createdLocation: {
          status: 'Permission Denied',
          latitude: null,
          longitude: null,
        },
      }),
    });

    assert.strictEqual(res.status, 201, 'Should create lead even with Permission Denied for location');
    const data = await res.json();
    assert.ok(data.lead?._id);
    createdLeadIds.push(data.lead._id);

    // Verify photo was securely stored on backend
    assert.ok(data.lead.visitPhoto?.url, 'visitPhoto.url must be populated');
    assert.strictEqual(data.lead.visitPhoto.contentType, 'image/jpeg');
    assert.ok(data.lead.visitPhoto.sizeBytes > 500);

    // Verify location is saved as Permission Denied without error
    assert.strictEqual(data.lead.createdLocation?.status, 'Permission Denied');
  });

  // TEST 4: Sales Agent lead creation with valid photo and GPS > 150m away -> Succeeds 201 (Optional location)
  it('allows Sales Agent lead creation with valid live photo even when GPS is > 150m from hospital (HTTP 201)', async () => {
    const photoDataUrl = generateValidJpegDataUrl();
    const res = await fetch('http://localhost:5000/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken}`,
      },
      body: JSON.stringify({
        organizationName: 'Test Hospital Far GPS ' + Date.now(),
        industry: 'Healthcare',
        organizationType: 'Hospital',
        address: '456 Outer Road, Bengaluru',
        leadSource: 'Field Visit',
        contacts: [{ name: 'Dr. Bhavna', phone: '9876500004' }],
        hospitalCoordinates: {
          latitude: hospitalLat,
          longitude: hospitalLng,
          isVerified: true,
        },
        visitPhoto: photoDataUrl,
        createdLocation: {
          status: 'Captured',
          latitude: farLat, // ~350m away
          longitude: farLng,
          accuracy: 20,
          capturedAt: new Date().toISOString(),
        },
      }),
    });

    assert.strictEqual(res.status, 201, 'Should create lead when distance > 150m because location is optional');
    const data = await res.json();
    assert.ok(data.lead?._id);
    createdLeadIds.push(data.lead._id);

    // Geofence status should record distance and mark Failed, but not block submission!
    assert.strictEqual(data.lead.createdLocation?.geofenceStatus, 'Failed');
    assert.ok(data.lead.createdLocation?.distanceMetres > 150);
  });

  // TEST 5: Calling Agent workflow unchanged -> lead creation WITHOUT photo succeeds (HTTP 201)
  it('allows Calling Agent lead creation WITHOUT photo (HTTP 201)', async () => {
    const res = await fetch('http://localhost:5000/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${callingToken}`,
      },
      body: JSON.stringify({
        organizationName: 'Calling Agent Lead No Photo ' + Date.now(),
        industry: 'Healthcare',
        organizationType: 'Clinic',
        leadSource: 'Inbound Call',
        contacts: [{ name: 'Caller Contact', phone: '9876500005' }],
      }),
    });

    assert.strictEqual(res.status, 201, 'Calling Agent must be able to create lead without photo');
    const data = await res.json();
    assert.ok(data.lead?._id);
    createdLeadIds.push(data.lead._id);
  });

  // TEST 6: Admin workflow unchanged -> lead creation WITHOUT photo succeeds (HTTP 201)
  it('allows Admin lead creation WITHOUT photo (HTTP 201)', async () => {
    const res = await fetch('http://localhost:5000/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        organizationName: 'Admin Lead No Photo ' + Date.now(),
        industry: 'Healthcare',
        organizationType: 'Diagnostic Center',
        leadSource: 'Direct Traffic',
        contacts: [{ name: 'Admin Contact', phone: '9876500006' }],
      }),
    });

    assert.strictEqual(res.status, 201, 'Admin must be able to create lead without photo');
    const data = await res.json();
    assert.ok(data.lead?._id);
    createdLeadIds.push(data.lead._id);
  });

  // TEST 7: Walk-in creation by Sales Agent with NO GPS / Permission Denied -> Succeeds 201
  it('allows Sales Agent walk-in creation when location permission is denied (HTTP 201)', async () => {
    const targetLeadId = createdLeadIds[0];
    assert.ok(targetLeadId, 'Target lead required');

    const res = await fetch(`http://localhost:5000/api/leads/${targetLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken}`,
      },
      body: JSON.stringify({
        walkInDate: new Date().toISOString(),
        walkInTime: '11:00 AM',
        remark: 'Visited doctor at hospital, GPS permission denied by user',
        locationStatus: 'Permission Denied',
        latitude: null,
        longitude: null,
      }),
    });

    assert.strictEqual(res.status, 201, 'Walk-in creation should succeed without GPS');
    const data = await res.json();
    assert.ok(data.walkIn?._id);
    createdWalkInIds.push(data.walkIn._id);
    assert.strictEqual(data.walkIn.locationStatus, 'Permission Denied');
  });

  // TEST 8: Walk-in completion by Sales Agent with GPS > 150m away -> Succeeds 200
  it('allows Sales Agent walk-in completion when location distance exceeds 150m (HTTP 200)', async () => {
    const targetLeadId = createdLeadIds[1]; // Lead created with verified hospitalCoordinates
    assert.ok(targetLeadId, 'Target lead with hospital coordinates required');

    // Create walk-in on lead with hospital coordinates
    const createRes = await fetch(`http://localhost:5000/api/leads/${targetLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken}`,
      },
      body: JSON.stringify({
        walkInDate: new Date().toISOString(),
        walkInTime: '02:00 PM',
        remark: 'Initial walk-in planned',
      }),
    });
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    const walkInId = createData.walkIn._id;

    const res = await fetch(`http://localhost:5000/api/leads/${targetLeadId}/walk-ins/${walkInId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken}`,
      },
      body: JSON.stringify({
        status: 'Completed',
        remark: 'Visit completed successfully. Location was outside 150m radius but allowed.',
        latitude: farLat, // ~350m away
        longitude: farLng,
        accuracy: 25,
        locationStatus: 'Captured',
      }),
    });

    assert.strictEqual(res.status, 200, 'Walk-in completion should succeed when distance > 150m');
    const data = await res.json();
    assert.strictEqual(data.walkIn?.status, 'Completed');
    assert.strictEqual(data.walkIn?.geofenceStatus, 'Failed');
    assert.ok(data.walkIn?.distanceMetres > 150);
  });
});
