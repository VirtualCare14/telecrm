const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const {
  calculateHaversineDistance,
  validateSalesAgentGeofence,
  MAX_PERMITTED_ACCURACY_METRES,
  MAX_PERMITTED_DISTANCE_METRES,
} = require('../src/utils/geoUtils');

describe('Role-Based GPS Geofencing Unit & API Test Suite', () => {
  // Base test hospital in Bengaluru
  const hospitalLat = 12.971598;
  const hospitalLng = 77.594562;

  // Points relative to hospital:
  // ~80m away (dLat ≈ +0.00072)
  const agentLat80m = 12.972318;
  const agentLng80m = 77.594562;

  // ~350m away (dLat ≈ +0.00315)
  const agentLat350m = 12.974748;
  const agentLng350m = 77.594562;

  let adminToken = '';
  let salesToken = '';
  let callingToken = '';
  let salesUserId = '';
  let callingUserId = '';
  let leadWithVerifiedCoordsId = '';
  let leadWithoutCoordsId = '';
  const createdLeadIds = [];

  function generateValidJpegDataUrl() {
    const header = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00
    ]);
    const body = Buffer.alloc(800, 0x55);
    const footer = Buffer.from([0xFF, 0xD9]);
    return `data:image/jpeg;base64,${Buffer.concat([header, body, footer]).toString('base64')}`;
  }

  /* ------------------------------------------------------------------
   * SECTION 1: UNIT TESTS FOR HAVERSINE FORMULA & THRESHOLDS
   * ------------------------------------------------------------------ */
  describe('Haversine Distance & Geofence Validator Unit Logic', () => {
    it('calculates 0 metres between identical coordinates', () => {
      const d = calculateHaversineDistance(hospitalLat, hospitalLng, hospitalLat, hospitalLng);
      assert.strictEqual(d, 0);
    });

    it('accurately calculates straight-line distance within ~80m', () => {
      const d = calculateHaversineDistance(agentLat80m, agentLng80m, hospitalLat, hospitalLng);
      assert.ok(d >= 75 && d <= 85, `Expected ~80m, got ${d}m`);
    });

    it('accurately calculates straight-line distance around ~350m', () => {
      const d = calculateHaversineDistance(agentLat350m, agentLng350m, hospitalLat, hospitalLng);
      assert.ok(d >= 340 && d <= 360, `Expected ~350m, got ${d}m`);
    });

    it('returns null for missing, null, or out-of-range coordinates', () => {
      assert.strictEqual(calculateHaversineDistance(null, 77.5, 12.9, 77.5), null);
      assert.strictEqual(calculateHaversineDistance(12.9, null, 12.9, 77.5), null);
      assert.strictEqual(calculateHaversineDistance(95, 77.5, 12.9, 77.5), null); // Invalid Lat > 90
      assert.strictEqual(calculateHaversineDistance(12.9, 200, 12.9, 77.5), null); // Invalid Lng > 180
    });

    it('validates: Accuracy 25m, Distance 80m -> ALLOWED (Pass)', () => {
      const res = validateSalesAgentGeofence({
        agentLat: agentLat80m,
        agentLng: agentLng80m,
        accuracy: 25,
        hospitalLat,
        hospitalLng,
      });
      assert.strictEqual(res.allowed, true);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.distance <= 150);
    });

    it('validates exact boundaries: Accuracy exactly 90m and Distance within 150m -> ALLOWED', () => {
      const res = validateSalesAgentGeofence({
        agentLat: agentLat80m,
        agentLng: agentLng80m,
        accuracy: 90,
        hospitalLat,
        hospitalLng,
      });
      assert.strictEqual(res.allowed, true);
    });

    it('validates boundary breach: Accuracy 90.1m or 120m, Distance 80m -> BLOCKED (Bad Request)', () => {
      const res = validateSalesAgentGeofence({
        agentLat: agentLat80m,
        agentLng: agentLng80m,
        accuracy: 120,
        hospitalLat,
        hospitalLng,
      });
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.reason, /exceeds the permitted threshold of 90 metres/i);
    });

    it('validates radius breach: Accuracy 20m, Distance 350m -> BLOCKED (Forbidden outside radius)', () => {
      const res = validateSalesAgentGeofence({
        agentLat: agentLat350m,
        agentLng: agentLng350m,
        accuracy: 20,
        hospitalLat,
        hospitalLng,
      });
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.statusCode, 403);
      assert.match(res.reason, /must be within 150 metres/i);
    });

    it('validates missing hospital coordinates -> BLOCKED with explicit message', () => {
      const res = validateSalesAgentGeofence({
        agentLat: agentLat80m,
        agentLng: agentLng80m,
        accuracy: 25,
        hospitalLat: null,
        hospitalLng: null,
      });
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.reason, /Hospital coordinates are missing or unverified/i);
    });
  });

  /* ------------------------------------------------------------------
   * SECTION 2: AUTHENTICATION & ROLE IDENTIFICATION SETUP
   * ------------------------------------------------------------------ */
  describe('Authentication & Role Discovery', () => {
    it('authenticates Admin user', async () => {
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
    });

    it('authenticates or identifies Sales Agent and Calling Agent', async () => {
      const agentsRes = await fetch('http://localhost:5000/api/agents', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const agentsData = await agentsRes.json();
      const agents = Array.isArray(agentsData) ? agentsData : (agentsData.agents || []);

      const foundSales = agents.find(a => (a.agentRole || '').toLowerCase().includes('sales'));
      const foundCalling = agents.find(a => (a.agentRole || '').toLowerCase().includes('calling'));

      if (foundSales) {
        salesUserId = foundSales._id || foundSales.id;
        const sRes = await fetch('http://localhost:5000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usernameOrEmail: foundSales.username,
            password: 'Prince@1402',
          }),
        });
        if (sRes.status === 200) {
          const sData = await sRes.json();
          salesToken = sData.token;
        }
      }

      if (foundCalling) {
        callingUserId = foundCalling._id || foundCalling.id;
        const cRes = await fetch('http://localhost:5000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usernameOrEmail: foundCalling.username,
            password: 'Jyoti@1402',
          }),
        });
        if (cRes.status === 200) {
          const cData = await cRes.json();
          callingToken = cData.token;
        }
      }

      assert.ok(adminToken, 'Admin token required');
      assert.ok(salesToken, 'Sales Agent token required for geofencing tests');
      assert.ok(callingToken, 'Calling Agent token required for remote tests');
    });

    it('creates test leads: one with verified hospital coordinates and one without', async () => {
      // Lead 1: With verified coordinates
      const res1 = await fetch('http://localhost:5000/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          organizationName: 'Fortis Memorial Hospital ' + Date.now(),
          industry: 'Healthcare',
          organizationType: 'Hospital',
          address: 'Bannerghatta Road, Opposite IIMB, Bengaluru, Karnataka 560076',
          leadSource: 'Field Visit',
          remarks: 'Lead with verified hospital coordinates.',
          contacts: [{ name: 'Dr. Ashok', phone: '9888877771' }],
          hospitalCoordinates: {
            latitude: hospitalLat,
            longitude: hospitalLng,
            isVerified: true,
          },
        }),
      });
      assert.strictEqual(res1.status, 201);
      const data1 = await res1.json();
      leadWithVerifiedCoordsId = data1.lead._id;
      assert.ok(leadWithVerifiedCoordsId);
      assert.strictEqual(data1.lead.hospitalCoordinates.isVerified, true);
      assert.strictEqual(Number(data1.lead.hospitalCoordinates.latitude.toFixed(4)), 12.9716);

      // Lead 2: Without hospital coordinates (remote unverified)
      const res2 = await fetch('http://localhost:5000/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          organizationName: 'Apollo Remote Clinic ' + Date.now(),
          industry: 'Healthcare',
          organizationType: 'Clinic',
          address: 'Rural Hub, District Center',
          leadSource: 'Inbound Call',
          remarks: 'Lead without hospital coordinates.',
          contacts: [{ name: 'Suresh Patel', phone: '9888877772' }],
        }),
      });
      assert.strictEqual(res2.status, 201);
      const data2 = await res2.json();
      leadWithoutCoordsId = data2.lead._id;
      assert.ok(leadWithoutCoordsId);
      assert.strictEqual(data2.lead.hospitalCoordinates?.latitude || null, null);
    });
  });

  /* ------------------------------------------------------------------
   * SECTION 3: SALES AGENT ON-SITE LEAD CREATION RESTRICTIONS
   * ------------------------------------------------------------------ */
  describe('Sales Agent On-Site Lead Creation Restrictions', () => {
    // If sales agent token was acquired, run with sales token; otherwise skip if only admin configured
    const getSalesAuth = () => salesToken ? `Bearer ${salesToken}` : `Bearer ${adminToken}`;

    it('allows lead creation when Sales Agent is within 150m with accuracy <= 90m and valid photo', async () => {
      if (!salesToken) return; // Skip if sales agent login wasn't available
      const res = await fetch('http://localhost:5000/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${salesToken}`,
        },
        body: JSON.stringify({
          organizationName: 'Columbia Asia Hospital ' + Date.now(),
          industry: 'Healthcare',
          organizationType: 'Hospital',
          address: 'Brigade Gateway, Yeshwanthpur, Bengaluru 560055',
          leadSource: 'Field Visit',
          remarks: 'Agent outside hospital entrance.',
          contacts: [{ name: 'Dr. Ramesh', phone: '9988776655' }],
          visitPhoto: generateValidJpegDataUrl(),
          hospitalCoordinates: {
            latitude: hospitalLat,
            longitude: hospitalLng,
            isVerified: true,
          },
          createdLocation: {
            latitude: agentLat80m,
            longitude: agentLng80m,
            accuracy: 25,
            status: 'Captured',
            capturedAt: new Date().toISOString(),
          },
          createdDeviceInstallationId: 'device-test-sales-1',
        }),
      });

      assert.strictEqual(res.status, 201, 'Should create lead when within 150m');
      const data = await res.json();
      createdLeadIds.push(data.lead._id);
      assert.strictEqual(data.lead.createdLocation.geofenceStatus, 'Passed');
      assert.ok(data.lead.createdLocation.distanceMetres <= 150);
    });

    it('allows Sales Agent lead creation when distance exceeds 150m (350m away) and marks Failed', async () => {
      if (!salesToken) return;
      const res = await fetch('http://localhost:5000/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${salesToken}`,
        },
        body: JSON.stringify({
          organizationName: 'Far Away Clinic ' + Date.now(),
          industry: 'Healthcare',
          organizationType: 'Clinic',
          address: 'Far road',
          leadSource: 'Field Visit',
          contacts: [{ name: 'Test Contact', phone: '9988776611' }],
          visitPhoto: generateValidJpegDataUrl(),
          hospitalCoordinates: {
            latitude: hospitalLat,
            longitude: hospitalLng,
            isVerified: true,
          },
          createdLocation: {
            latitude: agentLat350m,
            longitude: agentLng350m,
            accuracy: 20,
            status: 'Captured',
            capturedAt: new Date().toISOString(),
          },
        }),
      });

      assert.strictEqual(res.status, 201, 'Should create lead when distance > 150m because GPS is optional');
      const data = await res.json();
      assert.ok(data.lead?._id);
      createdLeadIds.push(data.lead._id);
      assert.strictEqual(data.lead.createdLocation.geofenceStatus, 'Failed');
      assert.ok(data.lead.createdLocation.distanceMetres > 150);
    });

    it('allows Sales Agent lead creation when GPS accuracy > 90m (120m accuracy) and marks Failed', async () => {
      if (!salesToken) return;
      const res = await fetch('http://localhost:5000/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${salesToken}`,
        },
        body: JSON.stringify({
          organizationName: 'Inaccurate GPS Hospital ' + Date.now(),
          industry: 'Healthcare',
          organizationType: 'Hospital',
          address: 'Central Avenue',
          leadSource: 'Field Visit',
          contacts: [{ name: 'Test Contact', phone: '9988776622' }],
          visitPhoto: generateValidJpegDataUrl(),
          hospitalCoordinates: {
            latitude: hospitalLat,
            longitude: hospitalLng,
            isVerified: true,
          },
          createdLocation: {
            latitude: agentLat80m,
            longitude: agentLng80m,
            accuracy: 120, // Exceeds 90m
            status: 'Captured',
            capturedAt: new Date().toISOString(),
          },
        }),
      });

      assert.strictEqual(res.status, 201, 'Should allow lead creation when accuracy > 90m because GPS is optional');
      const data = await res.json();
      assert.ok(data.lead?._id);
      createdLeadIds.push(data.lead._id);
      assert.strictEqual(data.lead.createdLocation.geofenceStatus, 'Failed');
    });

    it('allows Sales Agent lead creation when GPS permission is denied or unavailable', async () => {
      if (!salesToken) return;
      const res = await fetch('http://localhost:5000/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${salesToken}`,
        },
        body: JSON.stringify({
          organizationName: 'Permission Denied Clinic ' + Date.now(),
          industry: 'Healthcare',
          organizationType: 'Clinic',
          address: 'Main street',
          leadSource: 'Field Visit',
          contacts: [{ name: 'Test Contact', phone: '9988776633' }],
          visitPhoto: generateValidJpegDataUrl(),
          hospitalCoordinates: {
            latitude: hospitalLat,
            longitude: hospitalLng,
            isVerified: true,
          },
          createdLocation: {
            status: 'Permission Denied',
            latitude: null,
            longitude: null,
          },
        }),
      });

      assert.strictEqual(res.status, 201, 'Should allow lead creation when GPS permission is denied');
      const data = await res.json();
      assert.ok(data.lead?._id);
      createdLeadIds.push(data.lead._id);
      assert.strictEqual(data.lead.createdLocation.status, 'Permission Denied');
      assert.strictEqual(data.lead.createdLocation.geofenceStatus, 'Not Verified');
    });

    it('allows Sales Agent lead creation when hospital coordinates are missing or unverified', async () => {
      if (!salesToken) return;
      const res = await fetch('http://localhost:5000/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${salesToken}`,
        },
        body: JSON.stringify({
          organizationName: 'Unknown Coordinates Hospital ' + Date.now(),
          industry: 'Healthcare',
          organizationType: 'Hospital',
          address: 'Rural town',
          leadSource: 'Field Visit',
          contacts: [{ name: 'Test Contact', phone: '9988776644' }],
          visitPhoto: generateValidJpegDataUrl(),
          createdLocation: {
            latitude: agentLat80m,
            longitude: agentLng80m,
            accuracy: 25,
            status: 'Captured',
          },
        }),
      });

      assert.strictEqual(res.status, 201, 'Should allow lead creation when hospital coordinates are missing');
      const data = await res.json();
      assert.ok(data.lead?._id);
      createdLeadIds.push(data.lead._id);
      assert.strictEqual(data.lead.createdLocation.geofenceStatus, 'Not Verified');
    });

    it('prevents Sales Agent from tampering with client-supplied distance or status', async () => {
      if (!salesToken) return;
      const res = await fetch('http://localhost:5000/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${salesToken}`,
        },
        body: JSON.stringify({
          organizationName: 'Tamper Attempt Hospital ' + Date.now(),
          industry: 'Healthcare',
          organizationType: 'Hospital',
          address: 'East ring road',
          leadSource: 'Field Visit',
          contacts: [{ name: 'Test Contact', phone: '9988776655' }],
          visitPhoto: generateValidJpegDataUrl(),
          hospitalCoordinates: {
            latitude: hospitalLat,
            longitude: hospitalLng,
            isVerified: true,
          },
          createdLocation: {
            latitude: agentLat350m,
            longitude: agentLng350m,
            accuracy: 20,
            status: 'Captured',
            distanceMetres: 10, // Spoofed!
            geofenceStatus: 'Passed', // Spoofed!
          },
        }),
      });

      assert.strictEqual(res.status, 201, 'Should succeed but overwrite spoofed values');
      const data = await res.json();
      assert.ok(data.lead?._id);
      createdLeadIds.push(data.lead._id);
      assert.strictEqual(data.lead.createdLocation.geofenceStatus, 'Failed', 'Server must ignore spoofed Passed status');
      assert.ok(data.lead.createdLocation.distanceMetres > 150, 'Server must compute real distance > 150m');
    });
  });

  /* ------------------------------------------------------------------
   * SECTION 4: SALES AGENT ON-SITE WALK-IN VISIT RESTRICTIONS
   * ------------------------------------------------------------------ */
  describe('Sales Agent Walk-In & Physical Visit Restrictions', () => {
    let createdWalkInId = '';

    it('allows recording a walk-in when Sales Agent is within 150m with accuracy <= 90m', async () => {
      if (!salesToken) return;
      const res = await fetch(`http://localhost:5000/api/leads/${leadWithVerifiedCoordsId}/walk-ins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${salesToken}`,
        },
        body: JSON.stringify({
          walkInDate: '2026-10-21',
          walkInTime: '11:00',
          remark: 'Physical on-site hospital visit with Chief Medical Officer.',
          status: 'Planned',
          latitude: agentLat80m,
          longitude: agentLng80m,
          accuracy: 22,
          locationStatus: 'Captured',
          deviceInstallationId: 'device-walkin-test-1',
        }),
      });

      assert.strictEqual(res.status, 201, 'Should record walk-in within 150m');
      const data = await res.json();
      assert.ok(data.walkIn);
      createdWalkInId = data.walkIn._id;
      assert.strictEqual(data.walkIn.geofenceStatus, 'Passed');
      assert.ok(data.walkIn.distanceMetres <= 150);
      assert.strictEqual(Number(data.walkIn.hospitalLatitude.toFixed(4)), 12.9716);
    });

    it('allows recording a walk-in when Sales Agent is outside 150m and records geofenceStatus Failed', async () => {
      if (!salesToken) return;
      const res = await fetch(`http://localhost:5000/api/leads/${leadWithVerifiedCoordsId}/walk-ins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${salesToken}`,
        },
        body: JSON.stringify({
          walkInDate: '2026-10-21',
          walkInTime: '11:30',
          remark: 'Visit outside permitted radius.',
          latitude: agentLat350m,
          longitude: agentLng350m,
          accuracy: 20,
          locationStatus: 'Captured',
        }),
      });

      assert.strictEqual(res.status, 201, 'Should allow walk-in creation outside 150m');
      const data = await res.json();
      assert.ok(data.walkIn);
      assert.strictEqual(data.walkIn.geofenceStatus, 'Failed');
      assert.ok(data.walkIn.distanceMetres > 150);
    });

    it('allows recording a walk-in when hospital coordinates are missing on the lead and marks Not Verified', async () => {
      if (!salesToken) return;
      const res = await fetch(`http://localhost:5000/api/leads/${leadWithoutCoordsId}/walk-ins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${salesToken}`,
        },
        body: JSON.stringify({
          walkInDate: '2026-10-21',
          walkInTime: '12:00',
          remark: 'Visit attempted on lead without hospital coordinates.',
          latitude: agentLat80m,
          longitude: agentLng80m,
          accuracy: 25,
          locationStatus: 'Captured',
        }),
      });

      assert.strictEqual(res.status, 201, 'Should allow walk-in without hospital coordinates');
      const data = await res.json();
      assert.ok(data.walkIn);
      assert.strictEqual(data.walkIn.geofenceStatus, 'Not Verified');
    });

    it('enforces geofence calculation when completing an existing walk-in on-site without blocking', async () => {
      if (!salesToken || !createdWalkInId) return;

      // Completion within 150m -> Allowed, geofenceStatus: Passed
      const completeRes = await fetch(`http://localhost:5000/api/leads/${leadWithVerifiedCoordsId}/walk-ins/${createdWalkInId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${salesToken}`,
        },
        body: JSON.stringify({
          status: 'Completed',
          remark: 'Successfully concluded on-site demo in cardiology meeting room.',
          latitude: agentLat80m,
          longitude: agentLng80m,
          accuracy: 30,
          locationStatus: 'Captured',
        }),
      });

      assert.strictEqual(completeRes.status, 200, 'Should allow completing walk-in on-site');
      const completeData = await completeRes.json();
      assert.strictEqual(completeData.walkIn.status, 'Completed');
      assert.strictEqual(completeData.walkIn.geofenceStatus, 'Passed');

      // Attempting completion from outside 150m -> Allowed without blocking, geofenceStatus: Failed
      const outsideRes = await fetch(`http://localhost:5000/api/leads/${leadWithVerifiedCoordsId}/walk-ins/${createdWalkInId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${salesToken}`,
        },
        body: JSON.stringify({
          status: 'Completed',
          remark: 'Visit completed outside 150m radius.',
          latitude: agentLat350m,
          longitude: agentLng350m,
          accuracy: 20,
          locationStatus: 'Captured',
        }),
      });

      assert.strictEqual(outsideRes.status, 200, 'Should allow completion from outside radius with Failed status');
      const outsideData = await outsideRes.json();
      assert.strictEqual(outsideData.walkIn.geofenceStatus, 'Failed');
      assert.ok(outsideData.walkIn.distanceMetres > 150);
    });
  });

  /* ------------------------------------------------------------------
   * SECTION 5: CALLING AGENT REMOTE ACCESS (EXEMPTION)
   * ------------------------------------------------------------------ */
  describe('Calling Agent Remote Access Exemption', () => {
    it('allows Calling Agent to create leads remotely WITHOUT any GPS coordinates', async () => {
      if (!callingToken) return;
      const res = await fetch('http://localhost:5000/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${callingToken}`,
        },
        body: JSON.stringify({
          organizationName: 'Global Call Inbound Hospital ' + Date.now(),
          industry: 'Healthcare',
          organizationType: 'Hospital',
          address: 'Telephonic Contact, No on-site GPS',
          leadSource: 'Cold Calling',
          remarks: 'Created remotely by calling agent from desk.',
          contacts: [{ name: 'Ananya Sharma', phone: '9877700001' }],
          // No createdLocation or GPS passed
        }),
      });

      assert.strictEqual(res.status, 201, 'Calling Agent must be allowed to create leads remotely');
      const data = await res.json();
      assert.strictEqual(data.lead.createdLocation.geofenceStatus, 'Exempt');
    });

    it('allows Calling Agent to edit leads remotely without GPS check', async () => {
      if (!callingToken) return;
      const res = await fetch(`http://localhost:5000/api/leads/${leadWithoutCoordsId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${callingToken}`,
        },
        body: JSON.stringify({
          remarks: 'Updated remarks from telephonic follow-up discussion.',
          existingSoftwareUsed: 'No',
        }),
      });

      // Calling agent should be able to update lead (200 OK or 403 only if not owner, but remote GPS check does not block)
      assert.ok(res.status === 200 || res.status === 403);
      if (res.status === 200) {
        const data = await res.json();
        assert.ok(data.lead);
      }
    });

    it('allows Calling Agent to schedule walk-ins remotely without geofence restriction', async () => {
      if (!callingToken) return;
      const res = await fetch(`http://localhost:5000/api/leads/${leadWithoutCoordsId}/walk-ins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${callingToken}`,
        },
        body: JSON.stringify({
          walkInDate: '2026-10-22',
          walkInTime: '15:00',
          remark: 'Scheduled remotely by calling agent during phone consultation.',
          status: 'Planned',
          // No GPS required for Calling Agent
        }),
      });

      assert.strictEqual(res.status, 201, 'Calling agent scheduling walk-in remotely should succeed');
      const data = await res.json();
      assert.strictEqual(data.walkIn.geofenceStatus, 'Exempt');
    });
  });

  /* ------------------------------------------------------------------
   * SECTION 6: ADMIN EXEMPTION & AUDIT METADATA VERIFICATION
   * ------------------------------------------------------------------ */
  describe('Admin Access & Audit Verification', () => {
    it('allows Admin to create leads and walk-ins remotely with Exempt status', async () => {
      const res = await fetch('http://localhost:5000/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          organizationName: 'Admin Created Hospital ' + Date.now(),
          industry: 'Healthcare',
          organizationType: 'Hospital',
          address: 'Administrative entry',
          leadSource: 'Referral',
          contacts: [{ name: 'Direct Contact', phone: '9877700099' }],
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.lead.createdLocation.geofenceStatus, 'Exempt');
    });

    it('allows Admin to update verified hospital coordinates on an existing lead', async () => {
      const res = await fetch(`http://localhost:5000/api/leads/${leadWithoutCoordsId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          hospitalCoordinates: {
            latitude: 19.07609,
            longitude: 72.877426,
            isVerified: true,
            source: 'Admin Verified via Map',
          },
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.lead.hospitalCoordinates.isVerified, true);
      assert.strictEqual(Number(data.lead.hospitalCoordinates.latitude.toFixed(4)), 19.0761);
    });

    it('rejects unauthenticated requests with HTTP 401 Unauthorized', async () => {
      const res = await fetch('http://localhost:5000/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: 'Unauthenticated Hospital',
          leadSource: 'Field Visit',
          contacts: [{ name: 'Test', phone: '123' }],
        }),
      });

      assert.strictEqual(res.status, 401, 'Unauthenticated request must be blocked');
    });

    it('Daily Activity Report returns distance, geofenceStatus, and hospitalCoordinates without crash', async () => {
      const res = await fetch('http://localhost:5000/api/dashboard/daily-activity?date=2026-10-21', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.walkIns));
      if (data.walkIns.length > 0) {
        const w = data.walkIns[0];
        assert.ok('geofenceStatus' in w, 'Should include geofenceStatus in walk-ins report');
        assert.ok('distanceMetres' in w, 'Should include distanceMetres in walk-ins report');
      }
    });
  });

  after(async () => {
    const toDelete = [leadWithVerifiedCoordsId, leadWithoutCoordsId, ...createdLeadIds].filter(Boolean);
    if (toDelete.length > 0) {
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
        await Lead.deleteMany({ _id: { $in: toDelete } });
        await WalkIn.deleteMany({ lead: { $in: toDelete } });
        await LeadActivity.deleteMany({ lead: { $in: toDelete } });
        await mongoose.disconnect();
      } catch (err) {
        console.error('Error in geofencing.test.js cleanup:', err);
      }
    }
  });
});
