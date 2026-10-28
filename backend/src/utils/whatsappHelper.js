/**
 * WhatsApp Notification and Google Maps Location Resolution Helper (Backend)
 */

function formatDate(dateInput) {
  if (!dateInput) return 'Upcoming';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }); // e.g. 28 Oct 2026
}

/**
 * Validates whether latitude and longitude are valid Earth coordinates.
 */
function isValidCoordinate(lat, lng) {
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
 * Checks whether an address string is non-empty and reliable.
 * Rejects placeholder or invalid address strings.
 */
function isReliableAddress(address) {
  if (!address || typeof address !== 'string') return false;
  const trimmed = address.trim();
  if (trimmed.length < 3) return false;
  const invalidRegex = /^(n\/a|na|none|nil|null|undefined|unknown|not available|not provided|-|—|\.)$/i;
  return !invalidRegex.test(trimmed);
}

/**
 * Resolves Google Maps link for a hospital based on strict priority:
 * 1. Verified hospital coordinates (latitude and longitude).
 * 2. Complete, reliable hospital address + hospital name.
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
function resolveHospitalMapsLocation(params = {}) {
  const lead = params.lead || (params._id || params.organizationName !== undefined ? params : null);
  
  // Extract hospital coordinates (strictly hospitalCoordinates, never visit/created GPS)
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
    const isVerified = coords.isVerified !== false; // Must not be explicitly unverified

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
function generateDemoWhatsAppMessage({
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
    const locRes = resolveHospitalMapsLocation({
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
 * Standard sales agent template generator for all activity types.
 */
function generateSalesAgentTemplate({
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

  // Preserve existing logic for Walk-in, Sales Follow-up, Lead Assignment
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

module.exports = {
  formatDate,
  isValidCoordinate,
  isReliableAddress,
  resolveHospitalMapsLocation,
  generateDemoWhatsAppMessage,
  generateSalesAgentTemplate,
};
