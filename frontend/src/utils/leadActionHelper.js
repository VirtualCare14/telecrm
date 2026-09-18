import { isToday, isOverdue } from './dateHelpers.js';

/**
 * Returns contextual action menu items for a lead based on its current state.
 *
 * @param {Object} lead
 * @param {Object|boolean} [user] - Current logged-in user or explicit boolean flag
 * @param {boolean} [explicitIsAdmin] - Optional explicit admin override
 * @returns {Array<{ key: string, label: string, category: string, color?: string, highlight?: boolean }>}
 */
export function getLeadActionMenuItems(lead, user, explicitIsAdmin) {
  if (!lead) return [];

  const isAdmin = typeof explicitIsAdmin === 'boolean'
    ? explicitIsAdmin
    : Boolean(
        user === true ||
        user?.role?.toUpperCase() === 'ADMIN' ||
        (user?.agentRole && user.agentRole.toLowerCase() === 'admin') ||
        user?.username?.toLowerCase() === 'admin'
      );

  const isWon = lead.closureStatus === 'WON';
  const isLost = lead.closureStatus === 'LOST';

  // 1. Closed leads: allow Transfer, View Lead, and Delete Lead (Admin only)
  if (isWon || isLost) {
    const items = [
      {
        key: 'transfer_lead',
        label: 'Transfer Lead',
        category: 'transfer',
        color: '#8b5cf6',
      },
      {
        key: 'view_lead',
        label: 'View Lead',
        category: 'view',
        color: '#64748b',
      },
    ];
    if (isAdmin) {
      items.push({
        key: 'delete_lead',
        label: 'Delete Lead',
        category: 'delete',
        color: '#dc2626',
      });
    }
    return items;
  }

  // 2. Open leads: Unified 9-action menu + Delete Lead (Admin only)
  const items = [
    {
      key: 'log_call',
      label: 'Log Call',
      category: 'call',
      color: '#0284c7',
    },
    {
      key: 'schedule_followup',
      label: 'Schedule Follow-up',
      category: 'followup',
      color: '#0284c7',
    },
    {
      key: 'schedule_walkin',
      label: 'Schedule Walk-in',
      category: 'walkin',
      color: '#059669',
    },
    {
      key: 'schedule_demo',
      label: 'Schedule Demo',
      category: 'demo',
      color: '#4f46e5',
    },
    {
      key: 'sales_followup',
      label: 'Sales Follow-up',
      category: 'sales_followup',
      color: '#d97706',
    },
    {
      key: 'assign_sales_agent',
      label: 'Assign to Sales Agent',
      category: 'assignment',
      color: '#ea580c',
    },
    {
      key: 'transfer_lead',
      label: 'Transfer Lead',
      category: 'transfer',
      color: '#8b5cf6',
    },
    {
      key: 'close_won',
      label: 'Close as Won',
      category: 'outcome',
      color: '#059669',
    },
    {
      key: 'close_lost',
      label: 'Close as Lost',
      category: 'outcome',
      color: '#dc2626',
    },
    {
      key: 'whatsapp_sales_agent',
      label: 'WhatsApp Sales Agent',
      category: 'whatsapp',
      color: '#25D366',
    },
    {
      key: 'whatsapp_demo',
      label: 'WhatsApp Demo to Sales Agent',
      category: 'whatsapp',
      color: '#25D366',
    },
    {
      key: 'whatsapp_walkin',
      label: 'WhatsApp Walk-in to Sales Agent',
      category: 'whatsapp',
      color: '#25D366',
    },
    {
      key: 'whatsapp_followup',
      label: 'WhatsApp Follow-up to Sales Agent',
      category: 'whatsapp',
      color: '#25D366',
    },
  ];

  if (isAdmin) {
    items.push({
      key: 'delete_lead',
      label: 'Delete Lead',
      category: 'delete',
      color: '#dc2626',
    });
  }

  return items;
}
