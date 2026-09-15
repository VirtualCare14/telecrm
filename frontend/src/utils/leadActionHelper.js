import { isToday, isOverdue } from './dateHelpers.js';

/**
 * Returns contextual action menu items for a lead based on its current state.
 * Prevents contradictory actions (e.g. Won/Lost leads do not show active actions;
 * planned demos show reschedule/done/not done instead of schedule demo).
 *
 * @param {Object} lead
 * @returns {Array<{ key: string, label: string, category: string, color?: string, highlight?: boolean }>}
 */
export function getLeadActionMenuItems(lead) {
  if (!lead) return [];

  const isWon = lead.closureStatus === 'WON';
  const isLost = lead.closureStatus === 'LOST';

  // 1. Closed lead: only View Lead (no contradictory active actions)
  if (isWon || isLost) {
    return [
      {
        key: 'view_lead',
        label: 'View Lead',
        category: 'view',
      },
    ];
  }

  const items = [];

  // 2. Call & Follow-up actions
  const hasFollowUp = !!lead.nextFollowUpAt;
  const followUpDueOrOverdue =
    hasFollowUp && (isToday(lead.nextFollowUpAt) || isOverdue(lead.nextFollowUpAt, lead.closureStatus));

  if (followUpDueOrOverdue) {
    items.push({
      key: 'followup_now',
      label: 'Follow-up Now',
      category: 'call',
      highlight: true,
      color: '#ea580c',
    });
    items.push({
      key: 'reschedule_followup',
      label: 'Reschedule Follow-up',
      category: 'followup',
      color: '#d97706',
    });
  } else if (hasFollowUp) {
    items.push({
      key: 'call_now',
      label: 'Call Now',
      category: 'call',
      color: '#0284c7',
    });
    items.push({
      key: 'reschedule_followup',
      label: 'Reschedule Follow-up',
      category: 'followup',
      color: '#d97706',
    });
  } else {
    items.push({
      key: 'call_now',
      label: 'Call Now',
      category: 'call',
      color: '#0284c7',
    });
    items.push({
      key: 'schedule_followup',
      label: 'Schedule Follow-up',
      category: 'followup',
      color: '#0284c7',
    });
  }

  // 3. Walk-in action
  items.push({
    key: 'record_walkin',
    label: 'Record Walk-in',
    category: 'walkin',
    color: '#059669',
  });

  // 4. Demo actions
  const demoStatus = lead.latestDemo?.status;
  if (demoStatus === 'Planned') {
    items.push({
      key: 'mark_demo_done',
      label: 'Mark Demo Done',
      category: 'demo',
      color: '#059669',
    });
    items.push({
      key: 'mark_demo_not_done',
      label: 'Mark Demo Not Done',
      category: 'demo',
      color: '#dc2626',
    });
    items.push({
      key: 'reschedule_demo',
      label: 'Reschedule Demo',
      category: 'demo',
      color: '#6366f1',
    });
  } else {
    items.push({
      key: 'schedule_demo',
      label: 'Schedule Demo',
      category: 'demo',
      color: '#6366f1',
    });
  }

  // 5. Outcome actions
  items.push({
    key: 'close_won',
    label: 'Close as Won',
    category: 'outcome',
    color: '#059669',
  });
  items.push({
    key: 'close_lost',
    label: 'Close as Lost',
    category: 'outcome',
    color: '#dc2626',
  });

  // 6. View Lead (always at the bottom)
  items.push({
    key: 'view_lead',
    label: 'View Lead',
    category: 'view',
    color: '#64748b',
  });

  return items;
}
