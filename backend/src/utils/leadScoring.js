/**
 * Centralized, deterministic lead classification and scoring engine.
 *
 * Requirements & Safeguards:
 * 1. Pure function without database mutation or side effects.
 * 2. Terminal states (WON, LOST) are strictly preserved and never assigned Hot/Warm/Cold.
 * 3. Default subschema values (e.g. latestWalkIn.status === 'Planned') are ignored unless
 *    corroborated by actual activity evidence (walkInDate, salesAgent, recordedAt, remark).
 * 4. Scores are capped between 0 and 100 and labeled as rule-based lead scores.
 * 5. Strict negation parsing ensures "not interested" never triggers positive interest.
 * 6. Completed demos and valid milestones outweigh temporary reachability failures.
 */

const SCORING_CONFIG = {
  weights: {
    // Pipeline Milestones (Verified genuine activities only)
    demoDone: 40,
    walkInDone: 35,
    demoPlanned: 25,
    walkInPlanned: 20,
    maxStageScore: 45,

    // Call Dispositions
    dispNegotiation: 30,
    dispProposal: 25,
    dispDemoRequested: 20,
    dispAppointmentBooked: 20,
    dispInterested: 15,
    dispFollowUpRequired: 15,
    dispCallBackLater: 12,
    dispConnected: 6,
    dispReferred: 6,
    dispDecisionMakerUnavailable: 0,
    dispBusy: -5,
    dispNoAnswer: -10,
    dispNotReachable: -10,
    dispSwitchedOff: -15,
    dispWrongNumber: -25,
    dispNotInterested: -35,
    uncontactedBaseline: 10,

    // Follow-up Timeliness
    futureFollowUp: 20,
    recentFollowUp: 10,
    overduePenalty: -12,

    // Activity Recency
    recentActivity: 7,
    dormantPenalty: -10,

    // Remark Modifiers
    positiveRemark: 8,
    negativeRemark: -15,
  },
  thresholds: {
    hot: 80,
    warm: 40,
  },
  rules: {
    enableMilestoneWarmFloor: true,
    milestoneWarmFloorScore: 40,
  },
};

/**
 * Checks whether walk-in data contains genuine activity evidence beyond default Mongoose values.
 * In TeleCRM schema, latestWalkIn defaults status to 'Planned' even when empty.
 */
function hasGenuineWalkInEvidence(walkIn) {
  if (!walkIn || typeof walkIn !== 'object') return false;
  const hasDate = Boolean(walkIn.walkInDate);
  const hasAgent = Boolean(walkIn.salesAgent || walkIn.salesAgentName);
  const hasRecordedAt = Boolean(walkIn.recordedAt);
  const hasRemark = Boolean(walkIn.remark && walkIn.remark.trim().length > 0);
  const hasNonDefaultStatus = walkIn.status && walkIn.status !== 'Planned';
  return hasDate || hasAgent || hasRecordedAt || hasRemark || hasNonDefaultStatus;
}

/**
 * Checks whether demo data contains genuine activity evidence.
 */
function hasGenuineDemoEvidence(demo) {
  if (!demo || typeof demo !== 'object') return false;
  const hasId = Boolean(demo.demoId);
  const hasDate = Boolean(demo.demoDate);
  const hasAgent = Boolean(demo.salesAgent || demo.salesAgentName);
  const hasScheduledAt = Boolean(demo.scheduledAt);
  const hasNonDefaultStatus = demo.status && demo.status !== 'Planned';
  return hasId || hasDate || hasAgent || hasScheduledAt || hasNonDefaultStatus;
}

/**
 * Evaluates remark text for intent using strict negation-aware pattern matching.
 */
function evaluateRemarkSentiment(rawRemark) {
  if (!rawRemark || typeof rawRemark !== 'string') return null;
  const text = rawRemark.toLowerCase().trim();
  if (!text) return null;

  // 1. Negated readiness check (e.g. "not ready for demo", "not ready to meet")
  if (/\b(not|never|no|hardly)\s+(ready|prepared)\b/.test(text)) {
    return { type: 'negative', phrase: 'not ready' };
  }

  // 2. Negated competitor remarks (e.g. "not using a competitor", "without competitor")
  // In healthcare sales, not using a competitor software is an opportunity, NOT an objection.
  const isNegatedCompetitor = /\b(not\s+using|no|never\s+used|without)\s+(a\s+)?competitor\b/.test(text);

  // 3. Explicit negative phrases (must take precedence to prevent false matches)
  const negativePhrases = [
    'not interested',
    'no interest',
    'not intersted', // common typo in live records
    'dont call',
    "don't call",
    'do not call',
    'not required',
    'not needed',
    'refused',
    'already using',
    'already use',
    'already software existing',
    'too costly',
    'too expensive',
    'budget constraint',
    'pricing constraint',
    'price high',
    'no budget',
    'disconnected the call',
    'call disconnected',
  ];

  if (!isNegatedCompetitor && text.includes('competitor')) {
    negativePhrases.push('competitor');
  }

  for (const phrase of negativePhrases) {
    if (text.includes(phrase)) {
      return { type: 'negative', phrase };
    }
  }

  // 4. Explicit positive phrases with negation protection
  const positivePhrases = [
    'positive response',
    'positive feedback',
    'agreed for demo',
    'confirmed the demo',
    'ready for demo',
    'ready to meet',
    'ready to visit',
    'ready to buy',
    'convert in lead',
    'wants pricing',
    'wants quote',
    'share quotation',
    'great interest',
    'good chance to convert',
  ];

  for (const phrase of positivePhrases) {
    if (text.includes(phrase)) {
      // Ensure the positive phrase itself is not preceded by negation
      const regex = new RegExp(`\\b(not|never|no|hardly)\\s+(?:\\w+\\s+){0,2}${phrase.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`);
      if (!regex.test(text)) {
        return { type: 'positive', phrase };
      }
    }
  }

  // 5. Negation-aware check for 'interested' / 'intersted'
  if (/\b(interested|intersted)\b/.test(text)) {
    // Look for negation within 3 preceding words
    const negated = /\b(not|never|no|hardly|barely|least|un)\s+(?:\w+\s+){0,2}(interested|intersted)\b/.test(text);
    if (negated) {
      return { type: 'negative', phrase: 'negated interest' };
    }
    return { type: 'positive', phrase: 'expressed interest' };
  }

  return null;
}

/**
 * Deterministically classifies a lead and returns lead score, temperature, and explainable reasons.
 *
 * @param {Object} lead - Lead document or POJO
 * @param {Date} [now=new Date()] - Reference timestamp for testing/reproducibility
 * @returns {Object} Lead classification result
 */
function classifyLead(lead, now = new Date()) {
  if (!lead) {
    return {
      classification: 'Unknown',
      temperature: null,
      score: null,
      isTerminal: false,
      badge: { label: 'Unknown', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' },
      reasons: ['Lead data missing or empty'],
    };
  }

  const { weights, thresholds } = SCORING_CONFIG;

  // -------------------------------------------------------------
  // 1. Terminal Status Preservation (Highest Priority)
  // -------------------------------------------------------------
  if (lead.closureStatus === 'WON' || lead.status === 'WON') {
    return {
      classification: 'Won',
      temperature: null,
      score: null,
      scoreLabel: 'Closed Won (100% Deal Outcome)',
      indicator: 'Deal successfully closed and won',
      isTerminal: true,
      badge: {
        label: 'Won',
        color: '#059669',
        bg: 'rgba(16, 185, 129, 0.15)',
        border: 'rgba(16, 185, 129, 0.3)',
      },
      reasons: [
        'Terminal Deal State: Closed Won (preserved status, not rated by temperature)',
        lead.dealValue ? `Closed deal value: ₹${Number(lead.dealValue).toLocaleString()}` : null,
        lead.closingRemark ? `Closing note: "${lead.closingRemark}"` : null,
      ].filter(Boolean),
    };
  }

  if (lead.closureStatus === 'LOST' || lead.status === 'LOST') {
    return {
      classification: 'Lost',
      temperature: null,
      score: null,
      scoreLabel: 'Closed Lost (Terminal State)',
      indicator: 'Deal closed and marked lost',
      isTerminal: true,
      badge: {
        label: 'Lost',
        color: '#dc2626',
        bg: 'rgba(239, 68, 68, 0.15)',
        border: 'rgba(239, 68, 68, 0.3)',
      },
      reasons: [
        'Terminal Deal State: Closed Lost (Red UI preserved, not rated by temperature)',
        lead.lostReason ? `Lost reason: ${lead.lostReason}` : null,
        lead.closingRemark ? `Closing note: "${lead.closingRemark}"` : null,
      ].filter(Boolean),
    };
  }

  // -------------------------------------------------------------
  // 2. Dynamic Scoring for OPEN Leads
  // -------------------------------------------------------------
  let score = 0;
  const reasons = [];

  // A. Pipeline Milestones (genuine activity evidence required)
  let stageScore = 0;
  const hasDemo = hasGenuineDemoEvidence(lead.latestDemo);
  const hasWalkIn = hasGenuineWalkInEvidence(lead.latestWalkIn);

  if (hasDemo && lead.latestDemo.status === 'Done') {
    stageScore += weights.demoDone;
    reasons.push(`+${weights.demoDone} pts: Product demo completed with doctor/decision-maker`);
  } else if (hasWalkIn && ['Done', 'Completed'].includes(lead.latestWalkIn.status)) {
    stageScore += weights.walkInDone;
    reasons.push(`+${weights.walkInDone} pts: In-person walk-in meeting conducted on site`);
  } else if (hasDemo && lead.latestDemo.status === 'Planned') {
    stageScore += weights.demoPlanned;
    reasons.push(`+${weights.demoPlanned} pts: Product demo officially scheduled`);
  } else if (hasWalkIn && lead.latestWalkIn.status === 'Planned') {
    stageScore += weights.walkInPlanned;
    reasons.push(`+${weights.walkInPlanned} pts: In-person walk-in scheduled on calendar`);
  }
  stageScore = Math.min(weights.maxStageScore, stageScore);
  score += stageScore;

  // B. Call Dispositions
  const disp = lead.latestDisposition;
  if (disp === 'Negotiation') {
    score += weights.dispNegotiation;
    reasons.push(`+${weights.dispNegotiation} pts: Commercial negotiations underway`);
  } else if (disp === 'Proposal Discussion') {
    score += weights.dispProposal;
    reasons.push(`+${weights.dispProposal} pts: Formal proposal shared and under review`);
  } else if (disp === 'Demo Requested') {
    score += weights.dispDemoRequested;
    reasons.push(`+${weights.dispDemoRequested} pts: Prospect requested product demo`);
  } else if (disp === 'Appointment Booked') {
    score += weights.dispAppointmentBooked;
    reasons.push(`+${weights.dispAppointmentBooked} pts: In-person or virtual appointment booked`);
  } else if (disp === 'Interested') {
    score += weights.dispInterested;
    reasons.push(`+${weights.dispInterested} pts: Explicit interest confirmed by prospect during call`);
  } else if (disp === 'Follow-up Required') {
    score += weights.dispFollowUpRequired;
    reasons.push(`+${weights.dispFollowUpRequired} pts: Follow-up required with prospect`);
  } else if (disp === 'Call Back Later') {
    score += weights.dispCallBackLater;
    reasons.push(`+${weights.dispCallBackLater} pts: Call back requested by prospect`);
  } else if (disp === 'Connected' || disp === 'Referred to Another Person') {
    score += weights.dispConnected;
    reasons.push(`+${weights.dispConnected} pts: Connected call with organization/referral (${disp})`);
  } else if (disp === 'Decision Maker Unavailable') {
    score += weights.dispDecisionMakerUnavailable;
    reasons.push('0 pts: Gatekeeper reached; decision maker unavailable');
  } else if (disp === 'Busy') {
    score += weights.dispBusy;
    reasons.push(`${weights.dispBusy} pts: Line busy on call attempt`);
  } else if (disp === 'No Answer' || disp === 'Not Reachable') {
    score += weights.dispNoAnswer;
    reasons.push(`${weights.dispNoAnswer} pts: Unanswered call attempt (${disp})`);
  } else if (disp === 'Switched Off') {
    score += weights.dispSwitchedOff;
    reasons.push(`${weights.dispSwitchedOff} pts: Phone switched off on latest call attempt`);
  } else if (disp === 'Wrong Number') {
    score += weights.dispWrongNumber;
    reasons.push(`${weights.dispWrongNumber} pts: Incorrect phone number recorded`);
  } else if (disp === 'Not Interested') {
    score += weights.dispNotInterested;
    reasons.push(`${weights.dispNotInterested} pts: Prospect stated not interested`);
  } else if (!disp) {
    score += weights.uncontactedBaseline;
    reasons.push(`+${weights.uncontactedBaseline} pts: New untouched lead; awaiting discovery outreach`);
  }

  // C. Follow-up Timeliness
  if (lead.nextFollowUpAt) {
    const fDate = new Date(lead.nextFollowUpAt);
    if (!isNaN(fDate.getTime())) {
      const diffHours = (fDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (diffHours > 0) {
        score += weights.futureFollowUp;
        reasons.push(`+${weights.futureFollowUp} pts: Meaningful follow-up scheduled in future`);
      } else if (diffHours >= -48) {
        score += weights.recentFollowUp;
        reasons.push(`+${weights.recentFollowUp} pts: Follow-up due today / within 48 hours`);
      } else if (diffHours < -336) { // > 14 days overdue
        score += weights.overduePenalty;
        reasons.push(`${weights.overduePenalty} pts: Scheduled follow-up overdue by >14 days`);
      }
    }
  }

  // D. Activity Recency
  if (lead.lastCalledAt) {
    const lastCalled = new Date(lead.lastCalledAt);
    if (!isNaN(lastCalled.getTime())) {
      const diffDays = (now.getTime() - lastCalled.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 7 && diffDays >= 0) {
        score += weights.recentActivity;
        reasons.push(`+${weights.recentActivity} pts: Active outreach within last 7 days`);
      } else if (diffDays > 45 && !lead.nextFollowUpAt) {
        score += weights.dormantPenalty;
        reasons.push(`${weights.dormantPenalty} pts: Dormant outreach (>45 days without follow-up)`);
      }
    }
  }

  // E. Remark Corroboration (Negation-aware across call log, demo, and walk-in records)
  const callSentiment = evaluateRemarkSentiment(lead.latestRemark);
  const demoSentiment = hasDemo ? evaluateRemarkSentiment(lead.latestDemo?.remarks) : null;
  const walkInSentiment = hasWalkIn ? evaluateRemarkSentiment(lead.latestWalkIn?.remark) : null;

  const sentiments = [callSentiment, demoSentiment, walkInSentiment].filter(Boolean);
  const negativeSentiment = sentiments.find((s) => s.type === 'negative');
  const positiveSentiment = sentiments.find((s) => s.type === 'positive');

  if (negativeSentiment) {
    score += weights.negativeRemark;
    reasons.push(`${weights.negativeRemark} pts: Reluctance / drop-off noted in remark ("${negativeSentiment.phrase}")`);
  } else if (positiveSentiment) {
    score += weights.positiveRemark;
    reasons.push(`+${weights.positiveRemark} pts: Positive intent corroborated by remark ("${positiveSentiment.phrase}")`);
  }

  // -------------------------------------------------------------
  // 3. Final Bounding, Milestone Protection & Temperature
  // -------------------------------------------------------------
  let finalScore = Math.max(0, Math.min(100, Math.round(score)));

  // Milestone Protection Floor (Requirements 2 & 6):
  // Explicit configurable business rule. Completed demo or on-site walk-in represents
  // verified executive engagement. Unless the lead has explicit rejection ("Not Interested"
  // or negative remark), temporary reachability failures do not bury the lead in Cold.
  const hasCompletedMilestone =
    (hasDemo && lead.latestDemo.status === 'Done') ||
    (hasWalkIn && ['Done', 'Completed'].includes(lead.latestWalkIn.status));
  const hasExplicitRejection = disp === 'Not Interested' || Boolean(negativeSentiment);

  const warmFloor = SCORING_CONFIG.rules?.enableMilestoneWarmFloor
    ? (SCORING_CONFIG.rules.milestoneWarmFloorScore || thresholds.warm)
    : null;

  if (hasCompletedMilestone && !hasExplicitRejection && warmFloor !== null && finalScore < warmFloor) {
    finalScore = warmFloor;
    reasons.push(`Milestone Priority: Completed demo/walk-in maintains Warm status floor (${warmFloor} pts) despite temporary phone reachability issue`);
  }

  let temperature;
  let indicator;
  let badge;

  if (finalScore >= thresholds.hot) {
    temperature = 'Hot';
    indicator = 'High estimated conversion indicator (>= 80 pts)';
    badge = {
      label: 'Hot',
      color: '#b91c1c',
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.3)',
    };
  } else if (finalScore >= thresholds.warm) {
    temperature = 'Warm';
    indicator = 'Moderate engagement or meaningful follow-up pending (40-79 pts)';
    badge = {
      label: 'Warm',
      color: '#c2410c',
      bg: 'rgba(234, 88, 12, 0.12)',
      border: 'rgba(234, 88, 12, 0.3)',
    };
  } else {
    temperature = 'Cold';
    indicator = 'Low conversion signals or weak engagement (< 40 pts)';
    badge = {
      label: 'Cold',
      color: '#0369a1',
      bg: 'rgba(2, 132, 199, 0.12)',
      border: 'rgba(2, 132, 199, 0.3)',
    };
  }

  return {
    classification: temperature,
    temperature,
    score: finalScore,
    scoreLabel: `Rule-based Lead Score: ${finalScore}/100`,
    indicator,
    isTerminal: false,
    badge,
    reasons,
  };
}

module.exports = {
  SCORING_CONFIG,
  hasGenuineWalkInEvidence,
  hasGenuineDemoEvidence,
  evaluateRemarkSentiment,
  classifyLead,
};
