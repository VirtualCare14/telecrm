/**
 * Determines the recommended Next Action for a lead based on real CRM data:
 * - New Lead → Call Now
 * - Interested → Schedule Follow-up
 * - Call Back Later → Call at Scheduled Time
 * - Upcoming Follow-up → Follow-up Scheduled
 * - Overdue Follow-up → Follow-up Now
 * - Demo Planned → Attend Demo
 * - Demo Completed → Follow-up for Closure
 * - Negotiation → Follow-up / Close Deal
 * - Won → Closed Won
 * - Lost → Closed Lost
 */
export function getNextAction(lead) {
  if (!lead) {
    return {
      key: 'call_now',
      label: 'Call Now',
      action: 'record_call',
      variant: 'contained',
      color: '#ffffff',
      bgcolor: 'primary.main',
      hoverBg: 'primary.dark',
    };
  }

  const isWon = lead.closureStatus === 'WON' || lead.status === 'WON';
  const isLost = lead.closureStatus === 'LOST' || lead.status === 'LOST';
  const isOpen = !isWon && !isLost;

  // 1. Won
  if (isWon) {
    return {
      key: 'closed_won',
      label: 'Closed Won',
      action: 'view',
      variant: 'contained',
      color: '#059669',
      bgcolor: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.3)',
      hoverBg: 'rgba(16, 185, 129, 0.22)',
      isClosed: true,
    };
  }

  // 2. Lost
  if (isLost) {
    return {
      key: 'closed_lost',
      label: 'Closed Lost',
      action: 'view',
      variant: 'contained',
      color: '#dc2626',
      bgcolor: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.3)',
      hoverBg: 'rgba(239, 68, 68, 0.22)',
      isClosed: true,
    };
  }

  // Date checks for follow-up
  const hasFollowUp = !!lead.nextFollowUpAt;
  const now = new Date();
  const followUpDate = hasFollowUp ? new Date(lead.nextFollowUpAt) : null;
  const isOverdueDate = hasFollowUp && followUpDate < now;
  const isUpcomingDate = hasFollowUp && followUpDate >= now;

  // 3. Overdue Follow-up (Priority: immediate attention needed)
  if (isOpen && hasFollowUp && isOverdueDate) {
    return {
      key: 'followup_now',
      label: 'Follow-up Now',
      action: 'record_call',
      variant: 'contained',
      color: '#ffffff',
      bgcolor: '#ef4444',
      hoverBg: '#dc2626',
    };
  }

  // 4. Demo Planned (Sales workflow: attend/conduct demo)
  if (isOpen && lead.latestDemo?.status === 'Planned') {
    return {
      key: 'attend_demo',
      label: 'Attend Demo',
      action: 'demo',
      variant: 'contained',
      color: '#ffffff',
      bgcolor: '#4f46e5',
      hoverBg: '#4338ca',
    };
  }

  // 5. Negotiation / Proposal Discussion (High intent: close deal or follow-up)
  if (isOpen && (lead.latestDisposition === 'Negotiation' || lead.latestDisposition === 'Proposal Discussion')) {
    return {
      key: 'close_deal',
      label: 'Follow-up / Close Deal',
      action: 'outcome',
      variant: 'contained',
      color: '#ffffff',
      bgcolor: '#d97706',
      hoverBg: '#b45309',
    };
  }

  // 6. Demo Completed (Next step: follow-up for closure)
  if (isOpen && lead.latestDemo?.status === 'Done') {
    return {
      key: 'followup_closure',
      label: 'Follow-up for Closure',
      action: 'outcome',
      variant: 'contained',
      color: '#ffffff',
      bgcolor: '#7c3aed',
      hoverBg: '#6d28d9',
    };
  }

  // 7. Call Back Later
  if (isOpen && lead.latestDisposition === 'Call Back Later') {
    return {
      key: 'call_scheduled_time',
      label: 'Call at Scheduled Time',
      action: 'record_call',
      variant: 'contained',
      color: '#ffffff',
      bgcolor: '#0284c7',
      hoverBg: '#0369a1',
    };
  }

  // 8. Upcoming Follow-up
  if (isOpen && hasFollowUp && isUpcomingDate) {
    return {
      key: 'followup_scheduled',
      label: 'Follow-up Scheduled',
      action: 'record_call',
      variant: 'outlined',
      color: '#0284c7',
      bgcolor: 'rgba(2, 132, 199, 0.08)',
      border: 'rgba(2, 132, 199, 0.35)',
      hoverBg: 'rgba(2, 132, 199, 0.16)',
    };
  }

  // 9. Interested (without follow-up set)
  if (isOpen && lead.latestDisposition === 'Interested') {
    return {
      key: 'schedule_followup',
      label: 'Schedule Follow-up',
      action: 'schedule_followup',
      variant: 'contained',
      color: '#ffffff',
      bgcolor: '#059669',
      hoverBg: '#047857',
    };
  }

  // 10. New Lead (no disposition recorded or uncontacted)
  if (isOpen && (!lead.latestDisposition || lead.latestDisposition === 'New Lead' || !lead.lastCalledAt)) {
    return {
      key: 'call_now',
      label: 'Call Now',
      action: 'record_call',
      variant: 'contained',
      color: '#ffffff',
      bgcolor: 'primary.main',
      hoverBg: 'primary.dark',
    };
  }

  // Fallback for other dispositions (e.g. Connected, Busy, No Answer)
  return {
    key: 'record_call',
    label: hasFollowUp ? 'Follow-up Scheduled' : 'Call Now',
    action: 'record_call',
    variant: hasFollowUp ? 'outlined' : 'contained',
    color: hasFollowUp ? '#0284c7' : '#ffffff',
    bgcolor: hasFollowUp ? 'rgba(2, 132, 199, 0.08)' : 'primary.main',
    border: hasFollowUp ? 'rgba(2, 132, 199, 0.35)' : undefined,
    hoverBg: hasFollowUp ? 'rgba(2, 132, 199, 0.16)' : 'primary.dark',
  };
}
