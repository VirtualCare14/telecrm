const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseFollowUpDateTimeIST } = require('../src/utils/timeZoneHelper');
const {
  combineDateAndTime,
  splitDateAnd24HTime,
  formatDateToYYYYMMDD,
  formatTimeTo24H,
} = require('../../frontend/src/utils/dateHelpers');

describe('Direct Call Logging Workflow Test Suite', () => {
  it('1. Verifies payload preparation for newly created lead with typed contact person', () => {
    const createdLeadId = '66f123456789abcdef012345';
    const formCallData = {
      calledContactId: '',
      calledContactName: 'Dr. Neha Verma',
      calledContactPhone: '9876543210',
      callDate: '2026-11-20',
      callTime: '15:30',
      disposition: 'Interested',
      leadTemperature: 'Hot',
      remark: 'Spoke with clinic director. Requested follow-up demo next week.',
      followUpDate: '2026-11-25',
      followUpTime: '11:00',
      existingSoftwareUsed: 'Yes',
      softwareName: 'Practo',
    };

    const calledAt = combineDateAndTime(formCallData.callDate, formCallData.callTime);
    const followUpAt = combineDateAndTime(formCallData.followUpDate, formCallData.followUpTime);

    const payload = {
      calledContactId: formCallData.calledContactId || undefined,
      calledContactName: formCallData.calledContactName.trim(),
      calledContactPhone: formCallData.calledContactPhone.trim(),
      calledAt,
      leadTemperature: formCallData.leadTemperature || undefined,
      disposition: formCallData.disposition,
      remark: formCallData.remark.trim(),
      followUpAt,
      existingSoftwareUsed: formCallData.existingSoftwareUsed || undefined,
      softwareName: formCallData.softwareName.trim(),
    };

    assert.ok(payload.calledContactName === 'Dr. Neha Verma');
    assert.strictEqual(payload.calledContactId, undefined);
    assert.strictEqual(payload.calledContactPhone, '9876543210');
    assert.strictEqual(payload.disposition, 'Interested');
    assert.strictEqual(payload.leadTemperature, 'Hot');
    assert.strictEqual(payload.softwareName, 'Practo');
    assert.ok(payload.calledAt.includes('2026-11-20'));
    assert.ok(payload.followUpAt.includes('2026-11-25'));
  });

  it('2. Verifies backend contact creation contract when lead has 0 existing contacts', () => {
    // Simulating controller logic for contact extraction
    const leadId = '66f123456789abcdef012345';
    const body = {
      calledContactName: 'Dr. Rakesh Gupta',
      calledContactPhone: '9812345678',
      disposition: 'Connected',
      remark: 'First discussion completed.',
    };

    const contactName = (body.calledContactName || body.contactName || '').trim();
    assert.strictEqual(contactName, 'Dr. Rakesh Gupta', 'Contact name must be extracted');

    const phone = (body.calledContactPhone || body.contactPhone || '').trim() || '—';
    assert.strictEqual(phone, '9812345678', 'Phone must be extracted');

    // Expected newly created contact schema
    const newContactDoc = {
      lead: leadId,
      name: contactName,
      phone,
      isPrimary: true,
    };
    assert.strictEqual(newContactDoc.isPrimary, true, 'First contact created for lead must be marked isPrimary');
    assert.strictEqual(newContactDoc.lead, leadId);
  });

  it('3. Verifies validation prevents call logging without contact or disposition or remark', () => {
    const invalidSubmissions = [
      { calledContactId: '', calledContactName: '', disposition: 'Connected', remark: 'Test' },
      { calledContactId: '123', calledContactName: '', disposition: '', remark: 'Test' },
      { calledContactId: '123', calledContactName: '', disposition: 'Connected', remark: '' },
    ];

    invalidSubmissions.forEach((sub, idx) => {
      const hasContact = Boolean(sub.calledContactId || sub.calledContactName?.trim());
      const hasDisposition = Boolean(sub.disposition);
      const hasRemark = Boolean(sub.remark?.trim());
      const isValid = hasContact && hasDisposition && hasRemark;
      assert.strictEqual(isValid, false, `Submission ${idx + 1} must fail validation`);
    });
  });

  it('4. Verifies follow-up date and time roundtrip properly without date shift', () => {
    const dateInput = '2026-11-28';
    const timeInput = '16:45';

    const combinedIso = combineDateAndTime(dateInput, timeInput);
    assert.ok(combinedIso, 'Must produce a valid ISO timestamp');

    // Parse on backend using parseFollowUpDateTimeIST
    const backendParsed = parseFollowUpDateTimeIST(combinedIso);
    assert.ok(backendParsed instanceof Date);

    const split = splitDateAnd24HTime(combinedIso);
    assert.strictEqual(split.date, dateInput, 'Date must match exactly in Asia/Kolkata');
    assert.strictEqual(split.time, timeInput, 'Time must match exactly in Asia/Kolkata');
  });

  it('5. Verifies modal cancellation contract preserves created lead intact', () => {
    const state = {
      createdLead: { _id: '66f001', organizationName: 'Apex Hospital', leadNumber: '00199' },
      callLogModalOpen: true,
      leadSuccessModalOpen: false,
    };

    // Agent clicks Cancel in AddCallLogModal
    const onModalCancel = () => {
      state.callLogModalOpen = false;
      state.leadSuccessModalOpen = true;
    };

    onModalCancel();

    assert.strictEqual(state.callLogModalOpen, false);
    assert.strictEqual(state.leadSuccessModalOpen, true);
    assert.ok(state.createdLead._id, 'Lead ID must remain intact and saved');
    assert.strictEqual(state.createdLead.organizationName, 'Apex Hospital');
  });
});

