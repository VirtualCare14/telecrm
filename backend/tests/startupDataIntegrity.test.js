const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const mongoose = require('mongoose');

describe('Application Startup Data Integrity & Dummy Data Prevention Suite', () => {
  const BASE_URL = 'http://localhost:5000';
  let adminToken = '';

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('authenticates admin to query CRM endpoints', async () => {
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
  });

  it('proves that normal application startup generates zero dummy leads, walk-ins, or activities', async () => {
    require('dotenv').config({ path: path.join(__dirname, '../.env') });
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
    const Lead = require('../src/models/Lead');
    const WalkIn = require('../src/models/WalkIn');
    const Demo = require('../src/models/Demo');
    const LeadActivity = require('../src/models/LeadActivity');

    const leadCount1 = await Lead.countDocuments({});
    const walkInCount1 = await WalkIn.countDocuments({});
    const demoCount1 = await Demo.countDocuments({});
    const activityCount1 = await LeadActivity.countDocuments({});

    // Ping health & standard dashboard endpoints
    const healthRes = await fetch(`${BASE_URL}/api/dashboard/reports?startDate=2026-10-21&endDate=2026-10-21`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(healthRes.status, 200);

    const leadCount2 = await Lead.countDocuments({});
    const walkInCount2 = await WalkIn.countDocuments({});
    const demoCount2 = await Demo.countDocuments({});
    const activityCount2 = await LeadActivity.countDocuments({});

    assert.strictEqual(leadCount1, leadCount2, 'Lead count must not increase on server queries');
    assert.strictEqual(walkInCount1, walkInCount2, 'WalkIn count must not increase on server queries');
    assert.strictEqual(demoCount1, demoCount2, 'Demo count must not increase on server queries');
    assert.strictEqual(activityCount1, activityCount2, 'Activity count must not increase on server queries');
  });

  it('verifies that nonexistent lead queries return 404 and NEVER synthesize mock fallback data', async () => {
    const fakeId = '507f1f77bcf86cd799439011';
    const res = await fetch(`${BASE_URL}/api/leads/${fakeId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.ok(data.message || data.error);
    assert.strictEqual(data.lead, undefined, 'Must not return synthetic fallback lead object');
  });

  it('verifies that empty date ranges return 0 counts rather than fabricating dummy report metrics', async () => {
    const emptyDate = '2020-01-01';
    const res = await fetch(`${BASE_URL}/api/dashboard/daily-activity?date=${emptyDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.summary.totalCalls, 0);
    assert.strictEqual(data.summary.walkInsCompleted, 0);
    assert.strictEqual(data.summary.walkInsScheduled, 0);
    assert.strictEqual(data.walkIns.length, 0);
  });
});
