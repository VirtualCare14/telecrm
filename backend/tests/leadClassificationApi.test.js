require('dotenv').config({ path: 'c:/Users/91969/OneDrive/Desktop/telecrm/backend/.env' });
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('API Dynamic Classification End-to-End Suite', () => {
  let adminToken = null;

  it('authenticates admin to obtain JWT token', async () => {
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

  it('GET /api/leads returns dynamically classified leads with valid temperature & scores', async () => {
    const res = await fetch('http://localhost:5000/api/leads?page=1&limit=20', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.leads));
    assert.ok(data.leads.length > 0);

    for (const lead of data.leads) {
      assert.ok(lead.classification, `Lead ${lead.leadNumber} missing classification`);
      if (lead.closureStatus === 'WON') {
        assert.strictEqual(lead.classification.classification, 'Won');
        assert.strictEqual(lead.temperature, null);
        assert.strictEqual(lead.leadScore, null);
      } else if (lead.closureStatus === 'LOST') {
        assert.strictEqual(lead.classification.classification, 'Lost');
        assert.strictEqual(lead.temperature, null);
        assert.strictEqual(lead.leadScore, null);
      } else {
        assert.ok(['Hot', 'Warm', 'Cold'].includes(lead.classification.temperature));
        assert.strictEqual(lead.temperature, lead.classification.temperature);
        assert.strictEqual(typeof lead.leadScore, 'number');
        assert.ok(lead.leadScore >= 0 && lead.leadScore <= 100);
        assert.ok(Array.isArray(lead.classification.reasons));
      }
    }
  });

  it('GET /api/leads?temperature=Warm accurately filters only Warm leads', async () => {
    const res = await fetch('http://localhost:5000/api/leads?temperature=Warm&limit=10', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.leads));
    for (const lead of data.leads) {
      assert.strictEqual(lead.classification.temperature, 'Warm');
      assert.strictEqual(lead.temperature, 'Warm');
    }
  });

  it('GET /api/leads/:id returns dynamic classification with full scorecard payload', async () => {
    // Find an open lead
    const listRes = await fetch('http://localhost:5000/api/leads?page=1&limit=5', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listData = await listRes.json();
    const target = listData.leads[0];

    const getRes = await fetch(`http://localhost:5000/api/leads/${target._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.ok(getData.lead.classification);
    assert.strictEqual(getData.lead.classification.classification, target.classification.classification);
    assert.ok(Array.isArray(getData.lead.classification.reasons));
  });
});
