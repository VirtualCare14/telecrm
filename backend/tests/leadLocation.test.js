const { describe, it, after } = require('node:test');
const assert = require('node:assert');

describe('Sales Agent Create Lead Location & Device ID Suite', () => {
  let adminToken = '';
  let adminUserId = '';
  let agentToken = '';
  let agentUserId = '';
  let createdLeadWithGpsId = '';
  let createdLeadDeniedId = '';
  const createdLeadIds = [];
  const testDeviceId = 'device-test-uuid-' + Date.now();

  it('authenticates admin to obtain JWT token and identify agent', async () => {
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

    // Identify an agent
    const agentsRes = await fetch('http://localhost:5000/api/agents', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(agentsRes.status, 200);
    const agentsData = await agentsRes.json();
    const agents = Array.isArray(agentsData) ? agentsData : (agentsData.agents || []);
    const agent = agents.find(a => a.agentRole === 'Sales Agent' || a.role === 'AGENT') || agents[0];
    agentUserId = agent ? (agent._id || agent.id) : adminUserId;
    assert.ok(agentUserId);
  });

  it('successfully creates a lead with GPS coordinates and persistent device ID', async () => {
    const captureTime = new Date().toISOString();
    const payload = {
      organizationName: 'City Multi-Speciality Hospital ' + Date.now(),
      industry: 'Healthcare',
      organizationType: 'Hospital',
      address: '100 Ring Road, Sector 4, Indiranagar, Bengaluru, Karnataka 560038',
      leadSource: 'Field Visit',
      remarks: 'Lead created directly on-site outside hospital reception by sales agent.',
      contacts: [{
        name: 'Dr. Ramesh Kumar',
        designation: 'Medical Superintendent',
        phone: '9876543210',
        email: 'dr.ramesh@cityhospital.example.com',
      }],
      createdLocation: {
        latitude: 12.971598,
        longitude: 77.594562,
        accuracy: 12.4,
        capturedAt: captureTime,
        status: 'Captured',
      },
      createdDeviceInstallationId: testDeviceId,
      createdDeviceName: 'Windows PC',
    };

    const res = await fetch('http://localhost:5000/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 201, 'Should create lead with HTTP 201');
    const data = await res.json();
    assert.ok(data.lead, 'Response should contain created lead');
    createdLeadWithGpsId = data.lead._id;
    createdLeadIds.push(createdLeadWithGpsId);

    // Verify createdLocation, device ID, and device Name
    assert.ok(data.lead.createdLocation, 'Should have createdLocation subdocument');
    assert.strictEqual(data.lead.createdLocation.status, 'Captured');
    assert.strictEqual(Math.round(data.lead.createdLocation.latitude * 1000) / 1000, 12.972);
    assert.strictEqual(Math.round(data.lead.createdLocation.longitude * 1000) / 1000, 77.595);
    assert.strictEqual(data.lead.createdLocation.accuracy, 12.4);
    assert.strictEqual(data.lead.createdDeviceInstallationId, testDeviceId);
    assert.strictEqual(data.lead.createdDeviceName, 'Windows PC');

    // Verify creator attribution is derived from authenticated session
    assert.strictEqual(data.lead.createdBy._id || data.lead.createdBy, adminUserId);

    // Verify hospital registered address is preserved separately and not overwritten
    assert.strictEqual(data.lead.address, '100 Ring Road, Sector 4, Indiranagar, Bengaluru, Karnataka 560038');
  });

  it('successfully creates a lead with Permission Denied location status gracefully', async () => {
    const payload = {
      organizationName: 'Metro Diagnostic Center ' + Date.now(),
      industry: 'Healthcare',
      organizationType: 'Diagnostic Lab',
      address: '45 MG Road, Connaught Place, New Delhi 110001',
      leadSource: 'Field Visit',
      remarks: 'Agent recorded lead on mobile where location permission was denied.',
      contacts: [{
        name: 'Vikram Joshi',
        designation: 'Lab Administrator',
        phone: '9811223344',
      }],
      createdLocation: {
        latitude: null,
        longitude: null,
        accuracy: null,
        capturedAt: null,
        status: 'Permission Denied',
      },
      createdDeviceInstallationId: testDeviceId,
    };

    const res = await fetch('http://localhost:5000/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    createdLeadDeniedId = data.lead._id;
    assert.ok(createdLeadDeniedId);
    createdLeadIds.push(createdLeadDeniedId);
    assert.strictEqual(data.lead.createdLocation.status, 'Permission Denied');
    assert.strictEqual(data.lead.createdLocation.latitude, null);
    assert.strictEqual(data.lead.createdLocation.longitude, null);
    assert.strictEqual(data.lead.createdDeviceInstallationId, testDeviceId);
  });

  it('creates lead when device installation ID is missing or browser storage is disabled', async () => {
    const payload = {
      organizationName: 'Sunrise Clinic ' + Date.now(),
      industry: 'Healthcare',
      organizationType: 'Clinic',
      address: 'Shop 12, Main Bazaar, Jaipur, Rajasthan 302001',
      leadSource: 'Direct Walk-in',
      contacts: [{
        name: 'Dr. Sunita Sharma',
        phone: '9922334455',
      }],
      createdLocation: {
        status: 'Unavailable',
      },
      // No createdDeviceInstallationId provided
    };

    const res = await fetch('http://localhost:5000/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    if (data.lead?._id) createdLeadIds.push(data.lead._id);
    assert.strictEqual(data.lead.createdLocation.status, 'Unavailable');
    assert.strictEqual(data.lead.createdDeviceInstallationId, null);
  });

  it('rejects invalid GPS coordinates with HTTP 400', async () => {
    const payload = {
      organizationName: 'Invalid Location Hospital ' + Date.now(),
      leadSource: 'Field Visit',
      contacts: [{
        name: 'Dr. Test',
        phone: '9000000000',
      }],
      createdLocation: {
        latitude: 95.12345, // Invalid: exceeds 90 degrees
        longitude: 77.5945,
        status: 'Captured',
      },
      createdDeviceInstallationId: testDeviceId,
    };

    const res = await fetch('http://localhost:5000/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 400, 'Should reject latitude > 90 with HTTP 400');
    const data = await res.json();
    assert.ok(data.errors || data.message);
  });

  it('enforces server-side creator attribution ignoring client-spoofed createdBy', async () => {
    const spoofedUserId = '507f1f77bcf86cd799439011'; // Fake MongoDB ObjectID
    const payload = {
      organizationName: 'Attribution Test Hospital ' + Date.now(),
      leadSource: 'Field Visit',
      contacts: [{
        name: 'Dr. Genuine',
        phone: '9111222333',
      }],
      createdBy: spoofedUserId, // Spoofed user ID in request body
      createdLocation: {
        latitude: 19.07609,
        longitude: 72.877426,
        status: 'Captured',
      },
      createdDeviceInstallationId: testDeviceId,
    };

    const res = await fetch('http://localhost:5000/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    if (data.lead?._id) createdLeadIds.push(data.lead._id);
    // Must match authenticated adminUserId, NOT spoofedUserId
    const actualCreator = (data.lead.createdBy?._id || data.lead.createdBy).toString();
    assert.strictEqual(actualCreator, adminUserId.toString());
    assert.notStrictEqual(actualCreator, spoofedUserId);
  });

  it('fetches lead by ID and verifies createdLocation and createdDeviceInstallationId persistence', async () => {
    const res = await fetch(`http://localhost:5000/api/leads/${createdLeadWithGpsId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.lead);

    const lead = data.lead;
    assert.ok(lead.createdLocation);
    assert.strictEqual(lead.createdLocation.status, 'Captured');
    assert.strictEqual(Math.round(lead.createdLocation.latitude * 1000) / 1000, 12.972);
    assert.strictEqual(Math.round(lead.createdLocation.longitude * 1000) / 1000, 77.595);
    assert.strictEqual(lead.createdLocation.accuracy, 12.4);
    assert.strictEqual(lead.createdDeviceInstallationId, testDeviceId);
    assert.strictEqual(lead.createdDeviceName, 'Windows PC');
    assert.ok(lead.createdLocation.capturedAt);
  });

  it('ensures subsequent walk-in creation does NOT overwrite lead creation location', async () => {
    // Perform a walk-in at a different location
    const walkInPayload = {
      walkInDate: '2026-10-21',
      walkInTime: '16:00',
      remark: 'Follow-up on-site product presentation in different wing.',
      status: 'Completed',
      salesAgent: agentUserId,
      latitude: 28.613939, // Different coordinates (New Delhi)
      longitude: 77.209021,
      accuracy: 8.5,
      locationStatus: 'Captured',
      deviceInstallationId: 'walk-in-device-id-999',
    };

    const walkInRes = await fetch(`http://localhost:5000/api/leads/${createdLeadWithGpsId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(walkInPayload),
    });

    assert.strictEqual(walkInRes.status, 201);
    const walkInData = await walkInRes.json();
    assert.ok(walkInData.walkIn);
    assert.strictEqual(Math.round(walkInData.walkIn.latitude * 1000) / 1000, 28.614);

    // Now re-fetch the lead and verify that createdLocation is STILL Bengaluru (12.972, 77.595)
    const leadRes = await fetch(`http://localhost:5000/api/leads/${createdLeadWithGpsId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(leadRes.status, 200);
    const refreshedLead = (await leadRes.json()).lead;

    // Initial lead creation location must remain completely intact!
    assert.strictEqual(Math.round(refreshedLead.createdLocation.latitude * 1000) / 1000, 12.972);
    assert.strictEqual(Math.round(refreshedLead.createdLocation.longitude * 1000) / 1000, 77.595);
    assert.strictEqual(refreshedLead.createdDeviceInstallationId, testDeviceId);

    // Latest walk-in metadata must have its own visit-specific location
    assert.ok(refreshedLead.latestWalkIn);
    assert.strictEqual(Math.round(refreshedLead.latestWalkIn.latitude * 1000) / 1000, 28.614);
    assert.strictEqual(Math.round(refreshedLead.latestWalkIn.longitude * 1000) / 1000, 77.209);
    assert.strictEqual(refreshedLead.latestWalkIn.deviceInstallationId, 'walk-in-device-id-999');
  });

  it('historical leads gracefully return default values without breaking', async () => {
    // List existing leads
    const res = await fetch('http://localhost:5000/api/leads?limit=10', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const leads = data.leads || data;

    leads.forEach((l) => {
      // If no createdLocation was saved on historical lead, it should either be undefined or have default status
      if (!l.createdLocation || !l.createdLocation.status) {
        assert.ok(true, 'Historical lead without createdLocation handled safely');
      } else {
        assert.ok(['Captured', 'Permission Denied', 'Unavailable', 'Timed Out', 'Not Requested'].includes(l.createdLocation.status));
      }
    });
  });

  after(async () => {
    if (createdLeadIds.length > 0) {
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
        await Lead.deleteMany({ _id: { $in: createdLeadIds } });
        await WalkIn.deleteMany({ lead: { $in: createdLeadIds } });
        await LeadActivity.deleteMany({ lead: { $in: createdLeadIds } });
        await mongoose.disconnect();
      } catch (err) {
        console.error('Error in leadLocation.test.js cleanup:', err);
      }
    }
  });
});
