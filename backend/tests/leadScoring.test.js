const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  classifyLead,
  hasGenuineWalkInEvidence,
  hasGenuineDemoEvidence,
  evaluateRemarkSentiment,
  SCORING_CONFIG,
} = require('../src/utils/leadScoring');

describe('Automatic Lead Classification & Scoring Suite', () => {
  const fixedNow = new Date('2026-10-20T12:00:00.000Z');

  // 1. Won Deal Preservation
  it('preserves existing WON terminal state and never assigns Hot/Warm/Cold', () => {
    const lead = {
      leadNumber: '00167',
      organizationName: 'Saraswati Hospital',
      closureStatus: 'WON',
      dealValue: 50000,
      closingRemark: 'Contract signed and payment received.',
      latestDisposition: 'Decision Maker Unavailable',
    };

    const res = classifyLead(lead, fixedNow);
    assert.strictEqual(res.classification, 'Won');
    assert.strictEqual(res.temperature, null);
    assert.strictEqual(res.score, null);
    assert.strictEqual(res.isTerminal, true);
    assert.strictEqual(res.badge.label, 'Won');
    assert.strictEqual(res.badge.color, '#059669');
    assert.ok(res.reasons.some((r) => r.includes('Terminal Deal State: Closed Won')));
    assert.ok(res.reasons.some((r) => r.includes('50,000')));
  });

  // 2. Lost Deal Preservation
  it('preserves existing LOST terminal state with red styling and never assigns Hot/Warm/Cold', () => {
    const lead = {
      leadNumber: '00153',
      organizationName: 'Garima Health Care',
      closureStatus: 'LOST',
      lostReason: 'Budget Constraints',
      closingRemark: 'Client chose not to proceed due to pricing constraints.',
      latestDisposition: 'No Answer',
      latestDemo: {
        demoId: 'demo-123',
        status: 'Done',
      },
    };

    const res = classifyLead(lead, fixedNow);
    assert.strictEqual(res.classification, 'Lost');
    assert.strictEqual(res.temperature, null);
    assert.strictEqual(res.score, null);
    assert.strictEqual(res.isTerminal, true);
    assert.strictEqual(res.badge.label, 'Lost');
    assert.strictEqual(res.badge.color, '#dc2626');
    assert.ok(res.reasons.some((r) => r.includes('Closed Lost')));
    assert.ok(res.reasons.some((r) => r.includes('Budget Constraints')));
  });

  // 3. Hot Lead: Completed Demo + Negotiation + Follow-up
  it('classifies lead with completed demo, active negotiation, and pending follow-up as Hot (>= 80 pts)', () => {
    const lead = {
      leadNumber: 'HOT-01',
      organizationName: 'City Multi-Specialty Hospital',
      closureStatus: 'OPEN',
      latestDisposition: 'Negotiation',
      latestRemark: 'Doctor attended demo, agreed on features, final pricing negotiation call set.',
      latestDemo: {
        demoId: '6aa936a68e44b88dd5c62219',
        demoDate: new Date('2026-10-18T10:00:00.000Z'),
        status: 'Done',
        remarks: 'Doctor attended demo. Positive feedback provided.',
      },
      nextFollowUpAt: new Date('2026-10-22T10:00:00.000Z'), // in future
      lastCalledAt: new Date('2026-10-19T10:00:00.000Z'), // 1 day ago
    };

    const res = classifyLead(lead, fixedNow);
    assert.strictEqual(res.classification, 'Hot');
    assert.strictEqual(res.temperature, 'Hot');
    assert.strictEqual(res.isTerminal, false);
    assert.ok(res.score >= 80, `Expected score >= 80, got ${res.score}`);
    assert.ok(res.score <= 100, `Expected score <= 100, got ${res.score}`);
    assert.strictEqual(res.badge.color, '#b91c1c');
    assert.ok(res.reasons.some((r) => r.includes('Product demo completed')));
    assert.ok(res.reasons.some((r) => r.includes('Commercial negotiations')));
  });

  // 4. Warm Lead: Interested + Meaningful Follow-up
  it('classifies lead with Interested disposition and pending follow-up as Warm (40-79 pts)', () => {
    const lead = {
      leadNumber: '00183',
      organizationName: 'Dr. SB Shrivastava',
      closureStatus: 'OPEN',
      latestDisposition: 'Interested',
      latestRemark: 'Met with Mr. Jayant (Manager). Interested in clinic automation.',
      nextFollowUpAt: new Date('2026-10-23T10:00:00.000Z'), // in future
      lastCalledAt: new Date('2026-10-18T10:00:00.000Z'), // 2 days ago
    };

    const res = classifyLead(lead, fixedNow);
    assert.strictEqual(res.classification, 'Warm');
    assert.strictEqual(res.temperature, 'Warm');
    assert.ok(res.score >= 40 && res.score < 80, `Expected 40 <= score < 80, got ${res.score}`);
    assert.strictEqual(res.badge.color, '#c2410c');
    assert.ok(res.reasons.some((r) => r.includes('Explicit interest confirmed')));
    assert.ok(res.reasons.some((r) => r.includes('Meaningful follow-up scheduled in future')));
  });

  // 5. Warm Lead: Follow-up Required + Pending Follow-up
  it('classifies lead with Follow-up Required and pending follow-up as Warm', () => {
    const lead = {
      leadNumber: '00185',
      organizationName: 'Maa Sharde Chikitsa Kendra',
      closureStatus: 'OPEN',
      latestDisposition: 'Follow-up Required',
      latestRemark: 'Doctor was in consultation. Receptionist asked to call tomorrow at 4 PM.',
      nextFollowUpAt: new Date('2026-10-21T10:30:00.000Z'), // in future
      lastCalledAt: new Date('2026-10-19T10:00:00.000Z'), // 1 day ago
    };

    const res = classifyLead(lead, fixedNow);
    assert.strictEqual(res.classification, 'Warm');
    assert.strictEqual(res.temperature, 'Warm');
    assert.ok(res.score >= 40, `Expected score >= 40, got ${res.score}`);
    assert.ok(res.reasons.some((r) => r.includes('Follow-up required')));
  });

  // 6. Cold Lead: Not Interested
  it('classifies lead with Not Interested disposition as Cold (< 40 pts)', () => {
    const lead = {
      leadNumber: '00175',
      organizationName: 'Haryana Clinic',
      closureStatus: 'OPEN',
      latestDisposition: 'Not Interested',
      latestRemark: 'Not Interested already using competitor software Eka.care.',
      nextFollowUpAt: null,
      lastCalledAt: new Date('2026-10-15T10:00:00.000Z'),
    };

    const res = classifyLead(lead, fixedNow);
    assert.strictEqual(res.classification, 'Cold');
    assert.strictEqual(res.temperature, 'Cold');
    assert.ok(res.score < 40, `Expected score < 40, got ${res.score}`);
    assert.strictEqual(res.badge.color, '#0369a1');
    assert.ok(res.reasons.some((r) => r.includes('Prospect stated not interested')));
  });

  // 7. Cold Lead: Unreachable / No Answer / Switched Off
  it('classifies lead with repeated unreachable status and no pipeline milestone as Cold', () => {
    const lead = {
      leadNumber: '00155',
      organizationName: 'Apex Dental Care',
      closureStatus: 'OPEN',
      latestDisposition: 'No Answer',
      latestRemark: 'Ringing but no response on 3 attempts.',
      nextFollowUpAt: null,
      lastCalledAt: new Date('2026-10-16T10:00:00.000Z'),
    };

    const res = classifyLead(lead, fixedNow);
    assert.strictEqual(res.classification, 'Cold');
    assert.strictEqual(res.temperature, 'Cold');
    assert.ok(res.score < 40, `Expected score < 40, got ${res.score}`);
  });

  // 8. Default Planned Walk-in Subschema Trap
  it('never awards planned walk-in points from Mongoose default subschema status alone', () => {
    // 349 leads in DB have only { status: 'Planned' } with no date or agent
    const leadWithDefault = {
      leadNumber: '00151',
      organizationName: 'Yadav Hospital',
      closureStatus: 'OPEN',
      latestDisposition: 'No Answer',
      latestWalkIn: {
        status: 'Planned', // default value from schema
      },
    };

    assert.strictEqual(hasGenuineWalkInEvidence(leadWithDefault.latestWalkIn), false);
    const res = classifyLead(leadWithDefault, fixedNow);
    assert.ok(!res.reasons.some((r) => r.includes('walk-in')));
    assert.ok(res.score < 20);

    // Now test with genuine walk-in date
    const leadWithRealWalkIn = {
      ...leadWithDefault,
      latestWalkIn: {
        status: 'Planned',
        walkInDate: new Date('2026-10-25T00:00:00.000Z'),
        salesAgent: '6aa927698e44b88dd5c60a81',
      },
    };

    assert.strictEqual(hasGenuineWalkInEvidence(leadWithRealWalkIn.latestWalkIn), true);
    const resReal = classifyLead(leadWithRealWalkIn, fixedNow);
    assert.ok(resReal.reasons.some((r) => r.includes('In-person walk-in scheduled')));
  });

  // 9. Negation-Aware Remark Parsing
  it('correctly handles negation so "not interested" never triggers positive interest points', () => {
    const neg1 = evaluateRemarkSentiment('Doctor is not interested in demo');
    assert.strictEqual(neg1.type, 'negative');

    const neg2 = evaluateRemarkSentiment('not intersted already using other app');
    assert.strictEqual(neg2.type, 'negative');

    const neg3 = evaluateRemarkSentiment('Client refused, do not call again');
    assert.strictEqual(neg3.type, 'negative');

    const pos1 = evaluateRemarkSentiment('Doctor is interested in purchasing the full OPD package');
    assert.strictEqual(pos1.type, 'positive');

    const pos2 = evaluateRemarkSentiment('Positive response during product walkthrough');
    assert.strictEqual(pos2.type, 'positive');
  });

  // 10. Milestone Evidence Over Temporary Reachability Failures
  it('ensures completed demos and milestones outweigh temporary reachability failures', () => {
    const lead = {
      leadNumber: '00170',
      organizationName: 'Ahmed Hospital and Ortho Care',
      closureStatus: 'OPEN',
      latestDemo: {
        demoId: '6aa936a68e44b88dd5c62219',
        demoDate: new Date('2026-10-18T10:00:00.000Z'),
        status: 'Done',
        remarks: 'Doctor attended demo. Positive feedback provided.',
      },
      latestDisposition: 'Switched Off', // temporary reachability failure
      latestRemark: 'phone currently switched off',
      lastCalledAt: new Date('2026-10-19T10:00:00.000Z'),
    };

    const res = classifyLead(lead, fixedNow);
    // Even though phone was switched off (-15 pts), completed demo (+40 pts) and positive feedback (+8 pts)
    // keep lead Warm (40 pts) rather than burying it into Cold (0 pts)
    assert.strictEqual(res.classification, 'Warm');
    assert.strictEqual(res.temperature, 'Warm');
    assert.ok(res.reasons.some((r) => r.includes('Product demo completed')));
    assert.ok(res.reasons.some((r) => r.includes('Phone switched off')));
  });

  // 11. 0-100 Score Clamping & Rule-Based Labeling
  it('clamps scores to [0, 100] and describes scores as rule-based conversion indicators', () => {
    const ultraHotLead = {
      leadNumber: 'ULTRA-HOT',
      closureStatus: 'OPEN',
      latestDisposition: 'Negotiation',
      latestDemo: { demoId: '1', status: 'Done' },
      latestWalkIn: { walkInDate: new Date(), status: 'Done' },
      nextFollowUpAt: new Date('2026-10-25T00:00:00.000Z'),
      lastCalledAt: new Date('2026-10-19T00:00:00.000Z'),
      latestRemark: 'Doctor attended demo positive response confirmed ready to buy',
    };

    const resHot = classifyLead(ultraHotLead, fixedNow);
    assert.strictEqual(resHot.score, 100);
    assert.ok(resHot.scoreLabel.includes('Rule-based Lead Score: 100/100'));
    assert.ok(resHot.indicator.includes('High estimated conversion indicator'));

    const ultraNegativeLead = {
      leadNumber: 'ULTRA-COLD',
      closureStatus: 'OPEN',
      latestDisposition: 'Not Interested',
      latestRemark: 'Not interested refused do not call again',
      nextFollowUpAt: new Date('2025-01-01T00:00:00.000Z'), // severely overdue
    };

    const resCold = classifyLead(ultraNegativeLead, fixedNow);
    assert.strictEqual(resCold.score, 0);
    assert.ok(resCold.scoreLabel.includes('Rule-based Lead Score: 0/100'));
  });
});
