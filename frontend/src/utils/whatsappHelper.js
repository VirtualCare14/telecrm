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
 * Validates whether latitude and longitude are valid Earth coordinates.
 */
export function isValidCoordinate(lat, lng) {
  if (lat === null || lat === undefined || lat === '' ||
      lng === null || lng === undefined || lng === '') {
    return false;
  }
  const nLat = Number(lat);
  const nLng = Number(lng);
  return !Number.isNaN(nLat) && !Number.isNaN(nLng) &&
         nLat >= -90 && nLat <= 90 &&
         nLng >= -180 && nLng <= 180;
}

/**
 * Checks whether an address string is reliable (non-empty, >= 3 chars, not placeholder/invalid).
 */
export function isReliableAddress(address) {
  if (!address || typeof address !== 'string') return false;
  const trimmed = address.trim();
  if (trimmed.length < 3) return false;
  const invalidRegex = /^(n\/a|na|none|nil|null|undefined|unknown|not available|not provided|-|—|\.)$/i;
  return !invalidRegex.test(trimmed);
}

/**
 * Resolves Google Maps link for a hospital based on strict priority:
 * 1. Verified hospital coordinates (latitude and longitude).
 * 2. Complete, verified hospital address + hospital name.
 * 3. Unavailable if neither is valid.
 *
 * NOTE: Never uses Sales Agent's current GPS location or visit coordinates.
 *
 * @param {Object} params
 * @param {Object} [params.hospitalCoordinates] - { latitude, longitude, isVerified }
 * @param {string} [params.address] - Hospital address
 * @param {string} [params.organizationName] - Hospital / Organization name
 * @param {Object} [params.lead] - Full lead document if available
 * @returns {{ type: 'coordinates' | 'address' | 'unavailable', url: string, displayText: string, isAvailable: boolean }}
 */
export function resolveHospitalMapsLink(params = {}) {
  const lead = params.lead || (params._id || params.organizationName !== undefined ? params : null);

  const coords = params.hospitalCoordinates !== undefined
    ? params.hospitalCoordinates
    : (lead?.hospitalCoordinates || null);

  const address = params.address !== undefined
    ? params.address
    : (lead?.address || '');

  const organizationName = params.organizationName !== undefined
    ? params.organizationName
    : (lead?.organizationName || '');

  // Priority 1: Verified hospital latitude and longitude
  if (coords && typeof coords === 'object') {
    const lat = coords.latitude;
    const lng = coords.longitude;
    const isVerified = coords.isVerified !== false;

    if (isValidCoordinate(lat, lng) && isVerified) {
      const nLat = Number(lat);
      const nLng = Number(lng);
      const query = `${nLat},${nLng}`;
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
      return {
        type: 'coordinates',
        url,
        displayText: url,
        isAvailable: true,
      };
    }
  }

  // Priority 2: Complete, verified/reliable address
  if (isReliableAddress(address)) {
    const cleanOrg = (organizationName && typeof organizationName === 'string') ? organizationName.trim() : '';
    const cleanAddr = address.trim();
    let queryText = '';

    if (cleanOrg) {
      if (cleanAddr.toLowerCase().startsWith(cleanOrg.toLowerCase())) {
        queryText = cleanAddr;
      } else {
        queryText = `${cleanOrg}, ${cleanAddr}`;
      }
    } else {
      queryText = cleanAddr;
    }

    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryText)}`;
    return {
      type: 'address',
      url,
      displayText: url,
      isAvailable: true,
    };
  }

  // Priority 3: Neither coordinates nor reliable address available
  return {
    type: 'unavailable',
    url: '',
    displayText: 'Location unavailable',
    isAvailable: false,
  };
}

/**
 * Generates the standardized WhatsApp message for demo scheduling / rescheduling.
 *
 * @param {Object} params
 * @returns {string}
 */
export function generateDemoWhatsAppMessage({
  hospitalName,
  organizationName,
  address,
  demoDate,
  demoTime,
  salesAgentName,
  contactPerson,
  contactPhone,
  remarks,
  googleMapsUrl,
  hospitalCoordinates,
  lead,
  isRescheduled = false,
}) {
  const org = hospitalName || organizationName || lead?.organizationName || 'Hospital';
  const addr = address !== undefined ? address : (lead?.address || '');
  const cleanAddr = isReliableAddress(addr) ? addr.trim() : 'Not provided';
  const dateStr = demoDate ? formatDate(demoDate) : 'Upcoming';
  const timeStr = demoTime ? String(demoTime).trim() : 'Scheduled Time';
  const agentStr = salesAgentName || lead?.latestDemo?.salesAgentName || 'Sales Agent';

  // Contact resolution
  let contactStr = 'Not available';
  const hasPerson = contactPerson && contactPerson !== '—' && String(contactPerson).trim();
  const hasPhone = contactPhone && contactPhone !== '—' && String(contactPhone).trim();
  if (hasPerson && hasPhone) {
    contactStr = `${String(contactPerson).trim()} / ${String(contactPhone).trim()}`;
  } else if (hasPerson) {
    contactStr = String(contactPerson).trim();
  } else if (hasPhone) {
    contactStr = String(contactPhone).trim();
  }

  // Google Maps link resolution
  let mapsLink = googleMapsUrl;
  if (!mapsLink) {
    const locRes = resolveHospitalMapsLink({
      hospitalCoordinates: hospitalCoordinates || lead?.hospitalCoordinates,
      address: addr,
      organizationName: org,
      lead,
    });
    mapsLink = locRes.isAvailable ? locRes.url : 'Location unavailable';
  }

  const header = isRescheduled ? '📅 *Demo Rescheduled*' : '📅 *New Demo Scheduled*';

  let msg = `${header}\n\n🏥 Hospital: ${org}\n📍 Address: ${cleanAddr}\n📅 Date: ${dateStr}\n⏰ Time: ${timeStr}\n👤 Sales Agent: ${agentStr}\n📞 Contact: ${contactStr}`;

  if (remarks && String(remarks).trim()) {
    msg += `\n📝 Remarks/Notes: ${String(remarks).trim()}`;
  }

  msg += `\n\n🗺️ *Hospital Location:*\n${mapsLink}\n\nPlease visit the hospital at the scheduled time.`;

  return msg;
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
 * @param {string} [params.address]
 * @param {Object} [params.hospitalCoordinates]
 * @param {string} [params.googleMapsUrl]
 * @param {Object} [params.lead]
 * @param {boolean} [params.isRescheduled]
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
  address,
  hospitalCoordinates,
  googleMapsUrl,
  lead,
  isRescheduled = false,
}) {
  const isDemo = activityType === 'Demo' ||
                 activityType === 'Product Demo' ||
                 activityType === 'Demo Details' ||
                 activityType === 'Demo Rescheduled' ||
                 activityType === 'Rescheduled Demo';

  if (isDemo) {
    return generateDemoWhatsAppMessage({
      hospitalName: organizationName,
      organizationName,
      address,
      demoDate: scheduledDate,
      demoTime: scheduledTime,
      salesAgentName,
      contactPerson,
      contactPhone,
      remarks,
      googleMapsUrl,
      hospitalCoordinates,
      lead,
      isRescheduled: isRescheduled || activityType === 'Demo Rescheduled' || activityType === 'Rescheduled Demo',
    });
  }

  // Preserve existing logic for other activity types
  const formattedDate = scheduledDate ? formatDate(scheduledDate) : 'Upcoming';
  const timeStr = scheduledTime || 'Scheduled Time';
  const repName = salesAgentName || 'Sales Partner';
  const orgStr = organizationName || 'Lead';
  const leadNumStr = leadNumber ? ` (#${leadNumber})` : '';

  let msg = '';

  if (activityType === 'Walk-in' || activityType === 'Walk-in Visit') {
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
