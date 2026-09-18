import { formatDate } from './dateHelpers.js';

/**
 * Normalizes a phone number for WhatsApp wa.me link.
 * Handles 10-digit Indian numbers, leading zeros, +91, spaces, dashes, etc.
 *
 * @param {string} phone
 * @returns {{ isValid: boolean, normalized: string, raw: string, displayPhone: string, error?: string }}
 */
export function normalizeWhatsAppPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return {
      isValid: false,
      normalized: '',
      raw: phone || '',
      displayPhone: '',
      error: 'No phone number provided.',
    };
  }

  let clean = phone.replace(/\D/g, '');

  // 10 digits: standard Indian mobile number without country code
  if (clean.length === 10) {
    clean = `91${clean}`;
  } else if (clean.length === 11 && clean.startsWith('0')) {
    // 11 digits starting with 0: e.g. 07827096289
    clean = `91${clean.slice(1)}`;
  } else if (clean.length === 12 && clean.startsWith('91')) {
    // Already has 91 country code
    clean = clean;
  }

  if (clean.length < 10) {
    return {
      isValid: false,
      normalized: '',
      raw: phone,
      displayPhone: phone,
      error: 'Phone number must contain at least 10 digits.',
    };
  }

  const formattedDisplay = clean.startsWith('91') && clean.length === 12
    ? `+91 ${clean.slice(2)}`
    : `+${clean}`;

  return {
    isValid: true,
    normalized: clean,
    raw: phone,
    displayPhone: formattedDisplay,
  };
}

/**
 * Generates dynamic pre-filled WhatsApp notification message for Sales Agent.
 *
 * @param {Object} params
 * @param {string} [params.salesAgentName]
 * @param {string} [params.activityType] - 'Demo', 'Walk-in', 'Sales Follow-up', 'Lead Assignment'
 * @param {string} [params.organizationName]
 * @param {string} [params.leadNumber]
 * @param {string} [params.scheduledDate]
 * @param {string} [params.scheduledTime]
 * @param {string} [params.contactPerson]
 * @param {string} [params.contactPhone]
 * @param {string} [params.remarks]
 * @returns {string}
 */
export function generateSalesAgentTemplate({
  salesAgentName,
  activityType = 'Demo',
  organizationName,
  leadNumber,
  scheduledDate,
  scheduledTime,
  contactPerson,
  contactPhone,
  remarks,
}) {
  const formattedDate = scheduledDate ? formatDate(scheduledDate) : 'Upcoming';
  const timeStr = scheduledTime || 'Scheduled Time';
  const repName = salesAgentName || 'Sales Partner';
  const orgStr = organizationName || 'Lead';
  const leadNumStr = leadNumber ? ` (#${leadNumber})` : '';

  let msg = '';

  if (activityType === 'Demo' || activityType === 'Product Demo') {
    msg = `Hi ${repName},\n\nNew Product Demo assigned for lead: ${orgStr}${leadNumStr}.\n\n📅 Scheduled: ${formattedDate} at ${timeStr}`;
  } else if (activityType === 'Walk-in' || activityType === 'Walk-in Visit') {
    msg = `Hi ${repName},\n\nNew Walk-in Visit assigned for lead: ${orgStr}${leadNumStr}.\n\n📅 Scheduled: ${formattedDate} at ${timeStr}`;
  } else if (activityType === 'Sales Follow-up' || activityType === 'Follow-up') {
    msg = `Hi ${repName},\n\nNew Sales Follow-up assigned for lead: ${orgStr}${leadNumStr}.\n\n📅 Scheduled: ${formattedDate} at ${timeStr}`;
  } else {
    // General Lead Assignment
    msg = `Hi ${repName},\n\nLead Assignment update for: ${orgStr}${leadNumStr}.`;
    if (scheduledDate) {
      msg += `\n\n📅 Scheduled: ${formattedDate} at ${timeStr}`;
    }
  }

  if (contactPerson && contactPerson !== '—') {
    msg += `\n👤 Client Contact: ${contactPerson}${contactPhone && contactPhone !== '—' ? ` (${contactPhone})` : ''}`;
  }

  if (remarks && remarks.trim()) {
    msg += `\n📝 Remarks/Notes: ${remarks.trim()}`;
  }

  msg += `\n\nPlease follow up and take the necessary action.`;
  return msg;
}

/**
 * Creates a valid wa.me URL with phone number and pre-filled encoded text.
 *
 * @param {string} phone
 * @param {string} message
 * @returns {{ success: boolean, url: string, error?: string }}
 */
export function createWhatsAppUrl(phone, message) {
  const norm = normalizeWhatsAppPhone(phone);
  if (!norm.isValid) {
    return {
      success: false,
      url: '',
      error: norm.error || 'Invalid Sales Agent phone number for WhatsApp.',
    };
  }

  const encodedText = encodeURIComponent((message || '').trim());
  const url = `https://wa.me/${norm.normalized}?text=${encodedText}`;
  return {
    success: true,
    url,
    displayPhone: norm.displayPhone,
  };
}

/**
 * Resolves the assigned or most relevant Sales Agent and their phone number for a lead.
 *
 * @param {Object} lead
 * @param {Array} [allAgents] - List of active agents
 * @param {string} [activityType] - 'Demo', 'Walk-in', 'Sales Follow-up', etc.
 * @returns {{ salesAgentId: string, salesAgentName: string, salesAgentPhone: string, salesAgentRole: string }}
 */
export function resolveSalesAgentForLead(lead, allAgents = [], activityType = 'Demo') {
  if (!lead) {
    return { salesAgentId: '', salesAgentName: '', salesAgentPhone: '', salesAgentRole: '' };
  }

  let foundAgent = null;

  // 1. Check activity-specific salesAgent on the lead if available
  if (activityType === 'Demo' && lead.latestDemo?.salesAgent) {
    foundAgent = lead.latestDemo.salesAgent;
  } else if (activityType === 'Walk-in' && lead.latestWalkIn?.salesAgent) {
    foundAgent = lead.latestWalkIn.salesAgent;
  } else if (activityType === 'Sales Follow-up' && lead.latestFollowUp?.salesAgent) {
    foundAgent = lead.latestFollowUp.salesAgent;
  }

  // 2. Check general salesAgent or assignedTo on lead
  if (!foundAgent) {
    foundAgent = lead.salesAgent || lead.assignedTo;
  }

  // 3. If currentOwner is a Sales Agent, check that
  if (!foundAgent && lead.currentOwner) {
    const ownerRole = (lead.currentOwner.agentRole || lead.currentOwner.role || '').toLowerCase();
    if (ownerRole.includes('sales')) {
      foundAgent = lead.currentOwner;
    }
  }

  let salesAgentId = '';
  let salesAgentName = '';
  let salesAgentPhone = '';
  let salesAgentRole = 'Sales Agent';

  if (foundAgent) {
    if (typeof foundAgent === 'object') {
      salesAgentId = foundAgent._id?.toString() || '';
      salesAgentName = foundAgent.fullName || foundAgent.username || '';
      salesAgentPhone = foundAgent.phone || '';
      salesAgentRole = foundAgent.agentRole || foundAgent.role || 'Sales Agent';
    } else if (typeof foundAgent === 'string') {
      salesAgentId = foundAgent;
    }
  }

  // 4. Look up in allAgents to get complete object if phone is missing or only ID is present
  if (allAgents && allAgents.length > 0) {
    let matchedFromList = null;
    if (salesAgentId) {
      matchedFromList = allAgents.find(a => a._id?.toString() === salesAgentId.toString());
    }
    if (!matchedFromList) {
      // Find first Sales Agent
      matchedFromList = allAgents.find(a => (a.agentRole || '').toLowerCase().includes('sales'));
    }

    if (matchedFromList) {
      salesAgentId = matchedFromList._id?.toString() || salesAgentId;
      salesAgentName = matchedFromList.fullName || matchedFromList.username || salesAgentName;
      salesAgentPhone = matchedFromList.phone || salesAgentPhone || '';
      salesAgentRole = matchedFromList.agentRole || matchedFromList.role || salesAgentRole;
    }
  }

  return {
    salesAgentId,
    salesAgentName,
    salesAgentPhone,
    salesAgentRole,
  };
}
