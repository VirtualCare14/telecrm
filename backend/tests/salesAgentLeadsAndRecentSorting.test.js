const { describe, it, after } = require('node:test');
const assert = require('node:assert');

describe('Sales Agent Leads & Recent Sorting Regression Suite', () => {
  const BASE_URL = 'http://localhost:5000';
  let adminToken = '';
  let salesAgentToken = '';
  let callingAgentToken = '';
  let salesAgentId = '';
  let callingAgentId = '';
  let createdLeadId = '';
  let createdLeadNumber = '';
  const testOrgName = 'City Care Hospital Recent ' + Date.now();

  function generateValidJpegDataUrl() {
    const header = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00
    ]);
    const body = Buffer.alloc(800, 0x55); // > 500 bytes
    const footer = Buffer.from([0xFF, 0xD9]);
    const fullBuffer = Buffer.concat([header, body, footer]);
    return `data:image/jpeg;base64,${fullBuffer.toString('base64')}`;
  }

  it('authenticates Admin, Sales Agent, and Calling Agent', async () => {
    // 1. Admin Login
    const adminRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
        password: process.env.ADMIN_PASSWORD || 'Admin123!',
      }),
    });
    assert.strictEqual(adminRes.status, 200, 'Admin login failed');
    const adminData = await adminRes.json();
    adminToken = adminData.token;
    assert.ok(adminToken);

    // 2. Discover Agents
    const agentsRes = await fetch(`${BASE_URL}/api/agents`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(agentsRes.status, 200);
    const agentsData = await agentsRes.json();
    const agents = Array.isArray(agentsData) ? agentsData : (agentsData.agents || []);

    const salesUser = agents.find(a => (a.agentRole || '').toLowerCase().includes('sales'));
    const callingUser = agents.find(a => (a.agentRole || '').toLowerCase().includes('calling'));
    assert.ok(salesUser, 'Sales Agent must exist');
    assert.ok(callingUser, 'Calling Agent must exist');
    salesAgentId = salesUser._id || salesUser.id;
    callingAgentId = callingUser._id || callingUser.id;

    // 3. Sales Agent Login
    const salesRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: salesUser.username || 'Prince0908',
        password: 'Prince@1402',
      }),
    });
    assert.strictEqual(salesRes.status, 200, 'Sales agent login failed');
    const salesData = await salesRes.json();
    salesAgentToken = salesData.token;
    assert.ok(salesAgentToken);

    // 4. Calling Agent Login
    const callingRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: callingUser.username || 'jyoti0411',
        password: 'Jyoti@1402',
      }),
    });
    assert.strictEqual(callingRes.status, 200, 'Calling agent login failed');
    const callingData = await callingRes.json();
    callingAgentToken = callingData.token;
    assert.ok(callingAgentToken);
  });

  it('allows Sales Agent to create a lead and preserves creator ID and role attribution', async () => {
    const res = await fetch(`${BASE_URL}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesAgentToken}`,
      },
      body: JSON.stringify({
        organizationName: testOrgName,
        industry: 'Healthcare',
        organizationType: 'Hospital',
        address: '100 Ring Road, Bengaluru',
        leadSource: 'Field Visit',
        remarks: 'Direct on-site visit by Sales Agent',
        contacts: [{
          name: 'Medical Director Rao',
          phone: '9845098450',
          email: 'director@citycare.example.com',
          designation: 'Medical Director'
        }],
        visitPhoto: generateValidJpegDataUrl(),
        createdLocation: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 15,
          status: 'Captured',
        },
        deviceInstallationId: 'sales-device-uuid-test',
      }),
    });

    assert.strictEqual(res.status, 201, 'Sales Agent lead creation failed');
    const data = await res.json();
    assert.ok(data.lead, 'Lead object missing in response');
    createdLeadId = data.lead._id;
    createdLeadNumber = data.lead.leadNumber;
    assert.ok(createdLeadId);

    // Verify creator attribution
    const creatorId = (data.lead.createdBy?._id || data.lead.createdBy || '').toString();
    const ownerId = (data.lead.currentOwner?._id || data.lead.currentOwner || '').toString();
    assert.strictEqual(creatorId, salesAgentId.toString(), 'Creator must be authenticated Sales Agent');
    assert.strictEqual(ownerId, salesAgentId.toString(), 'Owner on creation should be the creator');
  });

  it('verifies the new lead appears at the top of Admin -> Leads (newest first)', async () => {
    const res = await fetch(`${BASE_URL}/api/leads?page=1&limit=20`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.leads));
    assert.ok(data.leads.length > 0);

    // The most recently created hospital must be at the very top (index 0)
    const topLead = data.leads[0];
    assert.strictEqual(
      topLead._id.toString(),
      createdLeadId.toString(),
      `Expected newest lead ${testOrgName} (${createdLeadId}) at index 0, but found ${topLead.organizationName} (${topLead._id})`
    );

    // Verify that the lead appears EXACTLY ONCE in the list (no duplicates)
    const occurrences = data.leads.filter(l => l._id.toString() === createdLeadId.toString());
    assert.strictEqual(occurrences.length, 1, 'Lead must not appear duplicated in list');
  });

  it('verifies the new lead appears in the Sales Agent own lead list', async () => {
    const res = await fetch(`${BASE_URL}/api/leads?page=1&limit=20`, {
      headers: { Authorization: `Bearer ${salesAgentToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.leads));

    const found = data.leads.find(l => l._id.toString() === createdLeadId.toString());
    assert.ok(found, 'Sales Agent must see their created lead in their lead list');
    assert.strictEqual(data.leads[0]._id.toString(), createdLeadId.toString(), 'Must be first in Sales Agent list');
  });

  it('verifies Calling Agent does NOT see the Sales Agent lead (role isolation preserved)', async () => {
    const res = await fetch(`${BASE_URL}/api/leads?page=1&limit=50`, {
      headers: { Authorization: `Bearer ${callingAgentToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.leads));

    const found = data.leads.find(l => l._id.toString() === createdLeadId.toString());
    assert.strictEqual(found, undefined, 'Calling Agent must not see unassigned Sales Agent lead');
  });

  it('verifies Admin owner filter by Sales Agent returns the created lead', async () => {
    const res = await fetch(`${BASE_URL}/api/leads?owner=${salesAgentId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.leads));

    const found = data.leads.find(l => l._id.toString() === createdLeadId.toString());
    assert.ok(found, 'Admin filtering by Sales Agent must include lead');
  });

  it('verifies strict newest-first sorting across multiple leads by canonical createdAt and stable _id', async () => {
    const res = await fetch(`${BASE_URL}/api/leads?page=1&limit=25`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const leads = data.leads || [];
    assert.ok(leads.length >= 2, 'Need at least 2 leads to verify sorting');

    for (let i = 0; i < leads.length - 1; i++) {
      const current = leads[i];
      const next = leads[i + 1];

      const currentTime = new Date(current.createdAt).getTime();
      const nextTime = new Date(next.createdAt).getTime();

      assert.ok(
        currentTime >= nextTime,
        `Sort violation at index ${i}: current "${current.organizationName}" (${current.createdAt}) is older than next "${next.organizationName}" (${next.createdAt})`
      );

      // If timestamps are identical, verify secondary tiebreaker _id descending
      if (currentTime === nextTime) {
        assert.ok(
          current._id.toString() >= next._id.toString(),
          `Secondary sort violation at index ${i}: tie breaker _id should be descending`
        );
      }
    }
  });

  it('verifies temperature filtering preserves newest-first createdAt sorting', async () => {
    const res = await fetch(`${BASE_URL}/api/leads?temperature=Cold&limit=20`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const leads = data.leads || [];

    for (let i = 0; i < leads.length - 1; i++) {
      const current = leads[i];
      const next = leads[i + 1];
      const currentTime = new Date(current.createdAt).getTime();
      const nextTime = new Date(next.createdAt).getTime();

      assert.ok(
        currentTime >= nextTime,
        `Temperature filter sort violation at index ${i}: ${current.createdAt} vs ${next.createdAt}`
      );
    }
  });

  after(async () => {
    // Clean up created test lead to keep local database clean
    if (createdLeadId && adminToken) {
      await fetch(`${BASE_URL}/api/leads/${createdLeadId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    }
  });
});
