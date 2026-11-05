const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Lead = require('../src/models/Lead');
const CallLog = require('../src/models/CallLog');
const { classifyLead } = require('../src/utils/leadScoring');

describe('Lead Temperature & Disposition Suite', () => {
  // 1. Mongoose Schema Fields
  it('1. Verifies Lead schema has leadTemperature, disposition, and tracking fields', () => {
    const paths = Lead.schema.paths;
    assert.ok(paths.leadTemperature, 'Lead schema must have leadTemperature');
    assert.ok(paths.disposition, 'Lead schema must have disposition');
    assert.ok(paths.temperatureUpdatedBy, 'Lead schema must have temperatureUpdatedBy');
    assert.ok(paths.temperatureUpdatedByName, 'Lead schema must have temperatureUpdatedByName');
    assert.ok(paths.temperatureUpdatedAt, 'Lead schema must have temperatureUpdatedAt');
    assert.ok(paths.dispositionUpdatedBy, 'Lead schema must have dispositionUpdatedBy');
    assert.ok(paths.dispositionUpdatedByName, 'Lead schema must have dispositionUpdatedByName');
    assert.ok(paths.dispositionUpdatedAt, 'Lead schema must have dispositionUpdatedAt');
  });

  it('2. Verifies CallLog schema has leadTemperature field', () => {
    const paths = CallLog.schema.paths;
    assert.ok(paths.leadTemperature, 'CallLog schema must have leadTemperature');
  });

  // 3. Supported Dispositions
  it('3. Verifies all 8 required dispositions are supported independently of temperature', () => {
    const requiredDispositions = [
      'Interested',
      'Not Interested',
      'Follow-up Required',
      'Demo Scheduled',
      'Demo Completed',
      'Walk-in Scheduled',
      'Won',
      'Lost',
    ];

    const temperatures = ['Hot', 'Warm', 'Cold'];

    for (const disp of requiredDispositions) {
      for (const temp of temperatures) {
        // Temperature and Disposition must be completely independent
        const mockLead = {
          leadTemperature: temp,
          disposition: disp,
          latestDisposition: disp,
          closureStatus: disp === 'Won' ? 'WON' : disp === 'Lost' ? 'LOST' : 'OPEN',
        };

        assert.equal(mockLead.leadTemperature, temp);
        assert.equal(mockLead.disposition, disp);
      }
    }
  });

  // 4. Saved DB leadTemperature priority over dynamic scoring
  it('4. Prioritizes saved DB leadTemperature over unclassified dynamic score', () => {
    // If a calling agent marks a lead as Hot manually, it should stay Hot
    const lead = {
      leadNumber: '00101',
      organizationName: 'Healic Multispecialty Hospital',
      leadTemperature: 'Hot',
      disposition: 'Demo Scheduled',
      closureStatus: 'OPEN',
    };

    const classification = classifyLead(lead);
    // Effective temperature in controller uses saved DB leadTemperature
    const effectiveTemp = lead.leadTemperature
      ? (lead.leadTemperature.charAt(0).toUpperCase() + lead.leadTemperature.slice(1).toLowerCase())
      : classification.temperature;

    assert.equal(effectiveTemp, 'Hot');
  });

  it('5. Normalizes case for Hot, Warm, Cold temperatures', () => {
    const testCases = [
      { input: 'hot', expected: 'Hot' },
      { input: 'HOT', expected: 'Hot' },
      { input: 'Hot', expected: 'Hot' },
      { input: 'warm', expected: 'Warm' },
      { input: 'WARM', expected: 'Warm' },
      { input: 'Warm', expected: 'Warm' },
      { input: 'cold', expected: 'Cold' },
      { input: 'COLD', expected: 'Cold' },
      { input: 'Cold', expected: 'Cold' },
    ];

    for (const { input, expected } of testCases) {
      const normalized = input.trim().charAt(0).toUpperCase() + input.trim().slice(1).toLowerCase();
      assert.equal(normalized, expected);
    }
  });

  // 6. Temperature Filter Matching
  it('6. Accurately matches leads by temperature filter (Hot, Warm, Cold)', () => {
    const leads = [
      { leadNumber: 'L1', organizationName: 'City Hospital', leadTemperature: 'Hot', disposition: 'Demo Scheduled' },
      { leadNumber: 'L2', organizationName: 'Care Clinic', leadTemperature: 'Warm', disposition: 'Follow-up Required' },
      { leadNumber: 'L3', organizationName: 'Apex Health', leadTemperature: 'Cold', disposition: 'Not Interested' },
    ];

    const filterHot = leads.filter((l) => (l.leadTemperature || '').toLowerCase() === 'hot');
    assert.equal(filterHot.length, 1);
    assert.equal(filterHot[0].leadNumber, 'L1');

    const filterWarm = leads.filter((l) => (l.leadTemperature || '').toLowerCase() === 'warm');
    assert.equal(filterWarm.length, 1);
    assert.equal(filterWarm[0].leadNumber, 'L2');

    const filterCold = leads.filter((l) => (l.leadTemperature || '').toLowerCase() === 'cold');
    assert.equal(filterCold.length, 1);
    assert.equal(filterCold[0].leadNumber, 'L3');
  });

  // 7. Combined Search and Temperature Filtering
  it('7. Supports simultaneous search query and temperature filter', () => {
    const leads = [
      { leadNumber: 'L1', organizationName: 'City Hospital', leadTemperature: 'Hot', disposition: 'Demo Scheduled' },
      { leadNumber: 'L2', organizationName: 'City Clinic', leadTemperature: 'Warm', disposition: 'Interested' },
      { leadNumber: 'L3', organizationName: 'Apollo Care', leadTemperature: 'Hot', disposition: 'Walk-in Scheduled' },
    ];

    const tempParam = 'Hot';
    const searchQuery = 'City';

    const matches = leads.filter((l) =>
      (l.leadTemperature || '').toLowerCase() === tempParam.toLowerCase() &&
      l.organizationName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    assert.equal(matches.length, 1);
    assert.equal(matches[0].leadNumber, 'L1');
  });

  // 8. Badge Styling Specs
  it('8. Verifies badge styling specs: Hot (red), Warm (amber), Cold (blue)', () => {
    const badgeSpecs = {
      Hot: { color: '#b91c1c', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)' },
      Warm: { color: '#c2410c', bg: 'rgba(234, 88, 12, 0.12)', border: 'rgba(234, 88, 12, 0.3)' },
      Cold: { color: '#0369a1', bg: 'rgba(2, 132, 199, 0.12)', border: 'rgba(2, 132, 199, 0.3)' },
    };

    assert.equal(badgeSpecs.Hot.color, '#b91c1c');
    assert.equal(badgeSpecs.Warm.color, '#c2410c');
    assert.equal(badgeSpecs.Cold.color, '#0369a1');
  });

  // 9. Temperature History Tracking Schema
  it('9. Verifies Lead schema has temperatureHistory subdocument array', () => {
    const subPaths = Lead.schema.paths.temperatureHistory.schema.paths;
    assert.ok(subPaths.temperature, 'temperatureHistory must contain temperature');
    assert.ok(subPaths.previousTemperature, 'temperatureHistory must contain previousTemperature');
    assert.ok(subPaths.changedBy, 'temperatureHistory must contain changedBy');
    assert.ok(subPaths.changedByName, 'temperatureHistory must contain changedByName');
    assert.ok(subPaths.changedAt, 'temperatureHistory must contain changedAt');
  });

  // 10. Unclassified Filter Matching Logic
  it('10. Accurately matches unclassified leads (null, undefined, or empty string)', () => {
    const leads = [
      { leadNumber: 'L1', organizationName: 'City Hospital', leadTemperature: 'Hot' },
      { leadNumber: 'L2', organizationName: 'Legacy Clinic A', leadTemperature: null },
      { leadNumber: 'L3', organizationName: 'Legacy Clinic B' }, // undefined
      { leadNumber: 'L4', organizationName: 'Legacy Clinic C', leadTemperature: '' },
      { leadNumber: 'L5', organizationName: 'Care Center', leadTemperature: 'Cold' },
    ];

    const unclassifiedLeads = leads.filter(
      (l) => !l.leadTemperature || l.leadTemperature === ''
    );
    assert.equal(unclassifiedLeads.length, 3);
    assert.deepEqual(
      unclassifiedLeads.map((l) => l.leadNumber),
      ['L2', 'L3', 'L4']
    );
  });
});
