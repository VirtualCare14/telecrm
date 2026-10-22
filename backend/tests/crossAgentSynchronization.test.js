require('dotenv').config({ path: 'c:/Users/91969/OneDrive/Desktop/telecrm/backend/.env' });
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Lead = require('../src/models/Lead');
const Demo = require('../src/models/Demo');
const WalkIn = require('../src/models/WalkIn');
const FollowUp = require('../src/models/FollowUp');
const LeadActivity = require('../src/models/LeadActivity');
const bcrypt = require('bcryptjs');

const BASE_URL = 'http://localhost:5000/api';

describe('Cross-Agent Lead, Demo, Walk-in & Activity Synchronization Test Suite', () => {
  let callingToken = null;
  let callingUser = null;
  let salesToken = null;
  let salesUser = null;
  let adminToken = null;
  let adminUser = null;
  let unauthAgentToken = null;
  let unauthAgentUser = null;

  let testLeadId = null;
  let testLeadNumber = null;
  let testDemoId = null;
  let testWalkInId = null;
  let testFollowUpId = null;

  before(async () => {
    // Connect to mongoose for test setup & assertions
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }

    // 1. Authenticate Calling Agent (Jyoti)
    const callingRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'jyoti0411',
        password: 'Jyoti@1402',
      }),
    });
    assert.strictEqual(callingRes.status, 200, 'Calling agent login should succeed');
    const callingData = await callingRes.json();
    callingToken = callingData.token;
    callingUser = callingData.user;

    // 2. Authenticate Sales Agent (Prince)
    const salesRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'Prince0908',
        password: 'Prince@1402',
      }),
    });
    assert.strictEqual(salesRes.status, 200, 'Sales agent login should succeed');
    const salesData = await salesRes.json();
    salesToken = salesData.token;
    salesUser = salesData.user;

    // 3. Authenticate Admin
    const adminRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
        password: process.env.ADMIN_PASSWORD || 'Admin123!',
      }),
    });
    assert.strictEqual(adminRes.status, 200, 'Admin login should succeed');
    const adminData = await adminRes.json();
    adminToken = adminData.token;
    adminUser = adminData.user;

    // 4. Create an unauthorized agent for RBAC testing
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('TestPass123!', salt);
    await User.deleteOne({ username: 'unauth_test_agent' });
    unauthAgentUser = await User.create({
      username: 'unauth_test_agent',
      email: 'unauth_test_agent@example.com',
      passwordHash: hashedPassword,
      fullName: 'Unauthorized Agent',
      phone: '9999988888',
      role: 'AGENT',
      agentRole: 'Calling Agent',
      active: true,
    });

    const unauthRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'unauth_test_agent',
        password: 'TestPass123!',
      }),
    });
    assert.strictEqual(unauthRes.status, 200, 'Unauthorized test agent login should succeed');
    const unauthData = await unauthRes.json();
    unauthAgentToken = unauthData.token;
  });

  after(async () => {
    // Clean up test data
    if (testLeadId) {
      await Lead.findByIdAndDelete(testLeadId);
      await Demo.deleteMany({ lead: testLeadId });
      await WalkIn.deleteMany({ lead: testLeadId });
      await FollowUp.deleteMany({ lead: testLeadId });
      await LeadActivity.deleteMany({ lead: testLeadId });
    }
    if (unauthAgentUser) {
      await User.findByIdAndDelete(unauthAgentUser._id);
    }
  });

  // =========================================================================
  // SCENARIO 1: Calling Agent creates lead and schedules demo for Sales Agent
  // =========================================================================
  it('Scenario 1A: Calling Agent creates lead; records createdBy and updatedBy correctly', async () => {
    const timestamp = Date.now();
    const payload = {
      organizationName: `Apollo Sync Care ${timestamp}`,
      organizationType: 'Hospital',
      industry: 'Healthcare',
      address: 'Sync Test Road, Sector 62, Noida',
      leadSource: 'Cold Calling',
      remarks: 'Initial contact established by calling agent',
      contacts: [
        {
          name: 'Dr. Sync Apollo',
          designation: 'Medical Superintendent',
          phone: '9876543210',
          email: 'apollo.sync@example.com',
        },
      ],
    };

    const res = await fetch(`${BASE_URL}/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${callingToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 201, 'Lead creation must succeed with 201');
    const data = await res.json();
    assert.ok(data.lead, 'Lead object must be returned');
    assert.ok(data.lead._id, 'Lead must have an _id');
    testLeadId = data.lead._id;
    testLeadNumber = data.lead.leadNumber;

    // Verify creator attribution
    const leadInDb = await Lead.findById(testLeadId);
    assert.strictEqual(leadInDb.createdBy.toString(), callingUser.id, 'createdBy must be Calling Agent');
    assert.strictEqual(leadInDb.currentOwner.toString(), callingUser.id, 'currentOwner must be Calling Agent');
    assert.strictEqual(leadInDb.updatedBy.toString(), callingUser.id, 'updatedBy must be Calling Agent');
    assert.ok(leadInDb.updatedByName, 'updatedByName must be set');
  });

  it('Scenario 1B: Calling Agent schedules a demo assigned to Sales Agent; both Sales Agent and Admin can see it', async () => {
    const today = new Date();
    const demoDateStr = today.toISOString().slice(0, 10);

    const res = await fetch(`${BASE_URL}/leads/${testLeadId}/demos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${callingToken}`,
      },
      body: JSON.stringify({
        salesAgent: salesUser.id,
        demoDate: demoDateStr,
        demoTime: '14:30',
        remarks: 'Calling Agent scheduled product demo for Sales Agent Prince',
      }),
    });

    assert.strictEqual(res.status, 201, 'Demo scheduling must succeed with 201');
    const data = await res.json();
    assert.ok(data.demo, 'Demo object must be returned');
    assert.strictEqual(data.demo.salesAgent._id.toString(), salesUser.id, 'Sales Agent must be Prince');
    assert.strictEqual(data.demo.assignedBy._id.toString(), callingUser.id, 'Assigned by must be Calling Agent Jyoti');
    testDemoId = data.demo._id;

    // 1. Verify Sales Agent sees lead in listLeads
    const salesListRes = await fetch(`${BASE_URL}/leads`, {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(salesListRes.status, 200);
    const salesListData = await salesListRes.json();
    const foundInSalesList = (salesListData.leads || []).some((l) => l._id === testLeadId);
    assert.ok(foundInSalesList, 'Sales Agent must see the lead in their lead list because a demo was assigned');

    // 2. Verify Sales Agent can view lead details
    const salesDetailsRes = await fetch(`${BASE_URL}/leads/${testLeadId}`, {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(salesDetailsRes.status, 200, 'Sales Agent must have access to lead details');
    const salesDetailsData = await salesDetailsRes.json();
    assert.strictEqual(salesDetailsData.lead.latestDemo?.salesAgent?.toString(), salesUser.id);
    assert.strictEqual(salesDetailsData.lead.latestDemo?.status, 'Planned');

    // 3. Verify Admin can see lead details and demo attribution
    const adminDetailsRes = await fetch(`${BASE_URL}/leads/${testLeadId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(adminDetailsRes.status, 200, 'Admin must see lead details');
    const adminDetailsData = await adminDetailsRes.json();
    assert.strictEqual(adminDetailsData.lead.createdBy?._id?.toString() || adminDetailsData.lead.createdBy?.toString(), callingUser.id);
    assert.strictEqual(adminDetailsData.lead.latestDemo?.salesAgent?.toString(), salesUser.id);
    assert.strictEqual(adminDetailsData.lead.latestDemo?.assignedBy?.toString(), callingUser.id);

    // 4. Verify Admin Dashboard metric records includes this demo
    const adminMetricRes = await fetch(`${BASE_URL}/dashboard/metric-records?metric=demos&dateFilter=thisMonth`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(adminMetricRes.status, 200);
    const adminMetricData = await adminMetricRes.json();
    const foundInAdminMetric = (adminMetricData.records || []).some((r) => r.leadId === testLeadId);
    assert.ok(foundInAdminMetric, 'Admin metric records must include the scheduled demo');
  });

  // =========================================================================
  // SCENARIO 2: Calling Agent schedules a walk-in for Sales Agent
  // =========================================================================
  it('Scenario 2: Calling Agent schedules a walk-in for Sales Agent; Sales Agent and Admin see correct date and status', async () => {
    const today = new Date();
    const walkInDateStr = today.toISOString().slice(0, 10);

    const res = await fetch(`${BASE_URL}/leads/${testLeadId}/walk-ins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${callingToken}`,
      },
      body: JSON.stringify({
        salesAgent: salesUser.id,
        walkInDate: walkInDateStr,
        walkInTime: '11:00',
        remark: 'Field visit scheduled for hospital premises inspection',
        status: 'Planned',
      }),
    });

    assert.strictEqual(res.status, 201, 'Walk-in scheduling must succeed with 201');
    const data = await res.json();
    assert.ok(data.walkIn, 'Walk-in record must be returned');
    assert.strictEqual(data.walkIn.salesAgent._id.toString(), salesUser.id, 'Sales Agent must be Prince');
    assert.strictEqual(data.walkIn.assignedBy._id.toString(), callingUser.id, 'Assigned by must be Jyoti');
    assert.strictEqual(data.walkIn.status, 'Planned');
    testWalkInId = data.walkIn._id;

    // Verify Sales Agent views the walk-in
    const salesWalkInsRes = await fetch(`${BASE_URL}/leads/${testLeadId}/walk-ins`, {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(salesWalkInsRes.status, 200);
    const salesWalkInsData = await salesWalkInsRes.json();
    const foundWalkIn = (salesWalkInsData.walkIns || []).find((w) => w._id === testWalkInId);
    assert.ok(foundWalkIn, 'Walk-in must be present in sales agent walk-in list');
    assert.strictEqual(foundWalkIn.status, 'Planned');
    assert.strictEqual(foundWalkIn.walkInTime, '11:00');

    // Verify Admin sees walk-in in metric records
    const adminWalkInRes = await fetch(`${BASE_URL}/dashboard/metric-records?metric=walkins&dateFilter=thisMonth`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(adminWalkInRes.status, 200);
    const adminWalkInData = await adminWalkInRes.json();
    const foundAdminWalkIn = (adminWalkInData.records || []).find((r) => r.leadId === testLeadId);
    assert.ok(foundAdminWalkIn, 'Admin must see the walk-in in metric records');
  });

  // =========================================================================
  // SCENARIO 3: Sales Agent updates demo, walk-in, remarks, and lead status
  // =========================================================================
  it('Scenario 3A: Sales Agent reschedules and updates demo; Calling Agent and Admin see latest values', async () => {
    // Sales Agent reschedules demo to today at 09:00 (past time so marking Done is allowed)
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const updateRes = await fetch(`${BASE_URL}/leads/${testLeadId}/demos/${testDemoId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken}`,
      },
      body: JSON.stringify({
        status: 'Done',
        remarks: 'Sales Agent Prince demonstrated the full software suite to Medical Director',
        demoDate: todayStr,
        demoTime: '09:00',
      }),
    });

    assert.strictEqual(updateRes.status, 200, 'Sales agent demo update must succeed');
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.demo.status, 'Done');
    assert.strictEqual(updateData.latestDemo.status, 'Done');
    assert.strictEqual(updateData.latestDemo.updatedBy.toString(), salesUser.id);

    // Calling Agent checks lead details: must see latest status and remarks
    const callingLeadRes = await fetch(`${BASE_URL}/leads/${testLeadId}`, {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    assert.strictEqual(callingLeadRes.status, 200);
    const callingLeadData = await callingLeadRes.json();
    assert.strictEqual(callingLeadData.lead.latestDemo?.status, 'Done');
    assert.ok(callingLeadData.lead.latestDemo?.remarks.includes('demonstrated the full software suite'));

    // Admin checks LeadActivity audit trail
    const activitiesRes = await fetch(`${BASE_URL}/leads/${testLeadId}/activities`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(activitiesRes.status, 200);
    const activitiesData = await activitiesRes.json();
    const demoActivity = (activitiesData.activities || []).find((a) =>
      a.action.includes('Demo') && a.performedBy?._id === salesUser.id
    );
    assert.ok(demoActivity, 'Activity log must record Demo update performed by Sales Agent');
    assert.strictEqual(demoActivity.metadata?.newStatus, 'Done');
    assert.strictEqual(demoActivity.metadata?.previousStatus, 'Planned');
  });

  it('Scenario 3B: Sales Agent marks walk-in as Completed with visit remarks; Calling Agent and Admin see updates', async () => {
    const updateRes = await fetch(`${BASE_URL}/leads/${testLeadId}/walk-ins/${testWalkInId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken}`,
      },
      body: JSON.stringify({
        status: 'Completed',
        remark: 'Hospital visit successfully concluded. Met with Administrator and reviewed infrastructure.',
      }),
    });

    assert.strictEqual(updateRes.status, 200, 'Sales agent walk-in update must succeed');
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.walkIn.status, 'Completed');
    assert.strictEqual(updateData.latestWalkIn.status, 'Completed');

    // Calling agent checks lead details
    const callingLeadRes = await fetch(`${BASE_URL}/leads/${testLeadId}`, {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    assert.strictEqual(callingLeadRes.status, 200);
    const callingLeadData = await callingLeadRes.json();
    assert.strictEqual(callingLeadData.lead.latestWalkIn?.status, 'Completed');
    assert.ok(callingLeadData.lead.latestWalkIn?.remark.includes('Hospital visit successfully concluded'));
  });

  it('Scenario 3C: Sales Agent updates hospital remarks and software details; Calling Agent and Admin see changes', async () => {
    const updateRes = await fetch(`${BASE_URL}/leads/${testLeadId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken}`,
      },
      body: JSON.stringify({
        remarks: 'Client currently uses Legacy HMS v2.1 and is ready for cloud migration.',
        existingSoftwareUsed: 'Yes',
        softwareName: 'Legacy HMS',
      }),
    });

    assert.strictEqual(updateRes.status, 200, 'Sales agent lead update must succeed');
    const updateData = await updateRes.json();
    assert.ok(updateData.lead.remarks.includes('Legacy HMS v2.1'));
    assert.strictEqual(updateData.lead.existingSoftwareUsed, 'Yes');
    assert.strictEqual(updateData.lead.softwareName, 'Legacy HMS');

    // Verify creator Jyoti is preserved and updatedBy is Prince
    const leadInDb = await Lead.findById(testLeadId);
    assert.strictEqual(leadInDb.createdBy.toString(), callingUser.id, 'createdBy must remain Calling Agent Jyoti');
    assert.strictEqual(leadInDb.updatedBy.toString(), salesUser.id, 'updatedBy must now be Sales Agent Prince');

    // Verify LeadActivity recorded the update with previous values
    const activitiesRes = await fetch(`${BASE_URL}/leads/${testLeadId}/activities`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const activitiesData = await activitiesRes.json();
    const editActivity = (activitiesData.activities || []).find((a) =>
      a.action === 'Lead Updated' && a.performedBy?._id === salesUser.id
    );
    assert.ok(editActivity, 'Lead Updated activity must be recorded');
    assert.ok(editActivity.metadata?.previousValues, 'previousValues must be preserved in audit metadata');
  });

  it('Scenario 3D: Sales Agent closes lead as WON; Calling Agent and Admin see the outcome', async () => {
    const res = await fetch(`${BASE_URL}/leads/${testLeadId}/close-won`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken}`,
      },
      body: JSON.stringify({
        closingRemark: 'Contract signed for 3-year enterprise cloud subscription',
        dealValue: 250000,
        product: 'Enterprise TeleCRM Cloud Suite',
      }),
    });

    assert.strictEqual(res.status, 200, 'Sales Agent closeWon must succeed');
    const data = await res.json();
    assert.strictEqual(data.lead.closureStatus, 'WON');
    assert.strictEqual(data.lead.dealValue, 250000);

    // Calling Agent checks details
    const callingRes = await fetch(`${BASE_URL}/leads/${testLeadId}`, {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    const callingData = await callingRes.json();
    assert.strictEqual(callingData.lead.closureStatus, 'WON');
    assert.strictEqual(callingData.lead.closedBy?._id?.toString() || callingData.lead.closedBy?.toString(), salesUser.id);
    assert.ok(callingData.lead.closingRemark.includes('Contract signed'));

    // Admin checks details: creator is Jyoti, closedBy is Prince, updatedBy is Prince
    const adminRes = await fetch(`${BASE_URL}/leads/${testLeadId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminData = await adminRes.json();
    assert.strictEqual(adminData.lead.closureStatus, 'WON');
    assert.strictEqual(adminData.lead.createdBy?._id?.toString() || adminData.lead.createdBy?.toString(), callingUser.id);
  });

  // =========================================================================
  // SCENARIO 5: Lead transfers and ownership rules remain correct
  // =========================================================================
  it('Scenario 5: Lead ownership history is preserved across transfers and updates', async () => {
    const lead = await Lead.findById(testLeadId)
      .populate('ownershipHistory.previousOwner')
      .populate('ownershipHistory.newOwner')
      .populate('ownershipHistory.transferredBy');

    assert.ok(Array.isArray(lead.ownershipHistory), 'ownershipHistory must be an array');
    assert.ok(lead.ownershipHistory.length >= 1, 'Initial ownership must be recorded');
    assert.strictEqual(lead.ownershipHistory[0].isInitial, true, 'First record must be initial assignment');
    assert.strictEqual(lead.createdBy.toString(), callingUser.id, 'Original creator is never modified');
  });

  // =========================================================================
  // SCENARIO 6: No duplicate leads or activities are created
  // =========================================================================
  it('Scenario 6: Rescheduling or status updates modify existing record without duplicate creation', async () => {
    const demoCount = await Demo.countDocuments({ lead: testLeadId });
    assert.strictEqual(demoCount, 1, 'Exactly one Demo record must exist for this lead');

    const walkInCount = await WalkIn.countDocuments({ lead: testLeadId });
    assert.strictEqual(walkInCount, 1, 'Exactly one WalkIn record must exist for this lead');

    const leadCount = await Lead.countDocuments({ leadNumber: testLeadNumber });
    assert.strictEqual(leadCount, 1, 'Exactly one Lead record must exist');
  });

  // =========================================================================
  // SCENARIO 7: Unauthorized agents cannot access restricted records
  // =========================================================================
  it('Scenario 7: Unauthorized agent cannot access restricted lead or activities', async () => {
    // 1. Unauthorized agent attempts to fetch lead details
    const getRes = await fetch(`${BASE_URL}/leads/${testLeadId}`, {
      headers: { Authorization: `Bearer ${unauthAgentToken}` },
    });
    assert.strictEqual(getRes.status, 403, 'Unauthorized agent must receive 403 Forbidden for lead details');

    // 2. Unauthorized agent attempts to update lead
    const updateRes = await fetch(`${BASE_URL}/leads/${testLeadId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${unauthAgentToken}`,
      },
      body: JSON.stringify({ remarks: 'Hacked remarks' }),
    });
    assert.strictEqual(updateRes.status, 403, 'Unauthorized agent must receive 403 Forbidden for update');

    // 3. Unauthorized agent lists leads - test lead must NOT be present
    const listRes = await fetch(`${BASE_URL}/leads`, {
      headers: { Authorization: `Bearer ${unauthAgentToken}` },
    });
    assert.strictEqual(listRes.status, 200);
    const listData = await listRes.json();
    const found = (listData.leads || []).some((l) => l._id === testLeadId);
    assert.strictEqual(found, false, 'Restricted lead must NOT appear in unauthorized agent leads list');

    // 4. Unauthorized agent attempts to view activities
    const actRes = await fetch(`${BASE_URL}/leads/${testLeadId}/activities`, {
      headers: { Authorization: `Bearer ${unauthAgentToken}` },
    });
    assert.strictEqual(actRes.status, 403, 'Unauthorized agent must receive 403 Forbidden for activities');
  });

  // =========================================================================
  // SCENARIO 8: Counts and date-wise lists reflect saved records correctly
  // =========================================================================
  it('Scenario 8: Calling Agent and Sales Agent dashboard counts reflect synchronized records', async () => {
    // Calling Agent dashboard
    const callingDashRes = await fetch(`${BASE_URL}/dashboard/agent?dateFilter=thisMonth`, {
      headers: { Authorization: `Bearer ${callingToken}` },
    });
    assert.strictEqual(callingDashRes.status, 200);
    const callingDashData = await callingDashRes.json();
    assert.ok(typeof (callingDashData.dailyActivity.demos ?? callingDashData.dailyActivity.demosScheduled) === 'number');
    assert.ok(typeof (callingDashData.dailyActivity.walkins ?? callingDashData.dailyActivity.walkinsScheduled) === 'number');

    // Sales Agent dashboard
    const salesDashRes = await fetch(`${BASE_URL}/dashboard/agent?dateFilter=thisMonth`, {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.strictEqual(salesDashRes.status, 200);
    const salesDashData = await salesDashRes.json();
    assert.ok(typeof (salesDashData.dailyActivity.demos ?? salesDashData.dailyActivity.demosScheduled) === 'number');
    assert.ok(typeof (salesDashData.dailyActivity.walkins ?? salesDashData.dailyActivity.walkinsScheduled) === 'number');

    // Admin dashboard
    const adminDashRes = await fetch(`${BASE_URL}/dashboard/admin?dateFilter=thisMonth`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(adminDashRes.status, 200);
    const adminDashData = await adminDashRes.json();
    assert.ok(typeof (adminDashData.dailyActivity?.demos ?? adminDashData.stats?.demos) === 'number');
    assert.ok(typeof (adminDashData.dailyActivity?.walkins ?? adminDashData.stats?.walkIns) === 'number');
  });
});
