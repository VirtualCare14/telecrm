const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  resolveHospitalMapsLocation,
  generateDemoWhatsAppMessage,
  generateSalesAgentTemplate,
  isValidCoordinate,
  isReliableAddress,
} = require('../src/utils/whatsappHelper');

describe('TeleCRM: Exact Google Maps Location in Demo Scheduling WhatsApp Message Suite', () => {

  // =========================================================================
  // SCENARIO 1: Demo scheduled with verified hospital coordinates (Priority 1)
  // =========================================================================
  it('Scenario 1: Demo scheduled with verified hospital coordinates generates direct coordinate Maps link', () => {
    const hospitalData = {
      organizationName: 'Medanta - The Medicity',
      address: 'CH Bakhtawar Singh Road, Sector 38, Gurugram, Haryana 122001',
      hospitalCoordinates: {
        latitude: 28.4595,
        longitude: 77.0266,
        isVerified: true,
        source: 'Admin Registry',
      },
    };

    const loc = resolveHospitalMapsLocation(hospitalData);
    assert.strictEqual(loc.type, 'coordinates');
    assert.strictEqual(loc.isAvailable, true);
    assert.strictEqual(
      loc.url,
      'https://www.google.com/maps/search/?api=1&query=28.4595%2C77.0266',
      'Must produce exact coordinate-based Google Maps search link'
    );

    const message = generateDemoWhatsAppMessage({
      hospitalName: hospitalData.organizationName,
      address: hospitalData.address,
      demoDate: '2026-10-30',
      demoTime: '11:00 AM',
      salesAgentName: 'Prince Sharma',
      contactPerson: 'Dr. Naresh Trehan',
      contactPhone: '+91 9876543210',
      remarks: 'Product walkthrough for ICU management module',
      googleMapsUrl: loc.url,
      isRescheduled: false,
    });

    // Check required formatting from Specification Section 3
    assert.ok(message.includes('📅 *New Demo Scheduled*'), 'Must contain header');
    assert.ok(message.includes('🏥 Hospital: Medanta - The Medicity'), 'Must contain hospital name');
    assert.ok(message.includes('📍 Address: CH Bakhtawar Singh Road, Sector 38, Gurugram, Haryana 122001'), 'Must contain hospital address');
    assert.ok(message.includes('📅 Date: 30 Oct 2026'), 'Must contain formatted demo date');
    assert.ok(message.includes('⏰ Time: 11:00 AM'), 'Must contain demo time');
    assert.ok(message.includes('👤 Sales Agent: Prince Sharma'), 'Must contain assigned sales agent');
    assert.ok(message.includes('📞 Contact: Dr. Naresh Trehan / +91 9876543210'), 'Must contain contact person & number');
    assert.ok(message.includes('📝 Remarks/Notes: Product walkthrough for ICU management module'), 'Must contain remarks');
    assert.ok(message.includes('🗺️ *Hospital Location:*'), 'Must contain location header');
    assert.ok(message.includes('https://www.google.com/maps/search/?api=1&query=28.4595%2C77.0266'), 'Must contain coordinate Maps link');
    assert.ok(message.includes('Please visit the hospital at the scheduled time.'), 'Must contain concluding prompt');
  });

  // =========================================================================
  // SCENARIO 2: Demo scheduled with complete hospital address but no coordinates (Priority 2)
  // =========================================================================
  it('Scenario 2: Demo scheduled with complete hospital address but no coordinates generates address-based Maps link', () => {
    const hospitalData = {
      organizationName: 'Fortis Memorial Research Institute',
      address: 'Sector 44, Opposite HUDA City Centre, Gurugram, Haryana 122002',
      hospitalCoordinates: null, // No coordinates
    };

    const loc = resolveHospitalMapsLocation(hospitalData);
    assert.strictEqual(loc.type, 'address');
    assert.strictEqual(loc.isAvailable, true);

    const expectedQuery = encodeURIComponent('Fortis Memorial Research Institute, Sector 44, Opposite HUDA City Centre, Gurugram, Haryana 122002');
    assert.strictEqual(
      loc.url,
      `https://www.google.com/maps/search/?api=1&query=${expectedQuery}`,
      'Must URL-encode hospital name and address properly'
    );

    const message = generateDemoWhatsAppMessage({
      hospitalName: hospitalData.organizationName,
      address: hospitalData.address,
      demoDate: '2026-11-02',
      demoTime: '14:30',
      salesAgentName: 'Vikram Singh',
      contactPerson: 'Dr. Ananya Roy',
      contactPhone: '9811223344',
      googleMapsUrl: loc.url,
      isRescheduled: false,
    });

    assert.ok(message.includes('🏥 Hospital: Fortis Memorial Research Institute'));
    assert.ok(message.includes('📍 Address: Sector 44, Opposite HUDA City Centre, Gurugram, Haryana 122002'));
    assert.ok(message.includes('🗺️ *Hospital Location:*'));
    assert.ok(message.includes(loc.url), 'Message must contain address-based Maps link');
    assert.ok(!loc.url.includes('undefined') && !loc.url.includes('null'), 'Link must not have undefined/null values');
  });

  // =========================================================================
  // SCENARIO 3: Demo scheduled without a reliable location (Priority 3)
  // =========================================================================
  it('Scenario 3: Demo scheduled without reliable coordinates or address clearly indicates Location unavailable', () => {
    // 3A: Empty address and no coordinates
    const unavail1 = resolveHospitalMapsLocation({
      organizationName: 'Apex Clinic',
      address: '',
      hospitalCoordinates: null,
    });
    assert.strictEqual(unavail1.type, 'unavailable');
    assert.strictEqual(unavail1.isAvailable, false);
    assert.strictEqual(unavail1.displayText, 'Location unavailable');
    assert.strictEqual(unavail1.url, '');

    // 3B: Placeholder address ('N/A', '-', 'Unknown')
    const unavail2 = resolveHospitalMapsLocation({
      organizationName: 'Apex Clinic',
      address: 'N/A',
      hospitalCoordinates: { latitude: null, longitude: null },
    });
    assert.strictEqual(unavail2.type, 'unavailable');

    // 3C: Explicitly unverified coordinates with invalid address
    const unavail3 = resolveHospitalMapsLocation({
      organizationName: 'Apex Clinic',
      address: '-',
      hospitalCoordinates: { latitude: 28.5, longitude: 77.2, isVerified: false },
    });
    assert.strictEqual(unavail3.type, 'unavailable', 'Unverified coordinates must not be used');

    // Check generated WhatsApp message formatting for unavailable location
    const message = generateDemoWhatsAppMessage({
      hospitalName: 'Apex Clinic',
      address: '',
      demoDate: '2026-10-31',
      demoTime: '16:00',
      salesAgentName: 'Rahul Verma',
      contactPerson: '—',
      contactPhone: '—',
      googleMapsUrl: unavail1.url,
    });

    assert.ok(message.includes('🏥 Hospital: Apex Clinic'));
    assert.ok(message.includes('📍 Address: Not provided'), 'Address should be indicated as Not provided');
    assert.ok(message.includes('📞 Contact: Not available'), 'Contact should indicate Not available');
    assert.ok(message.includes('🗺️ *Hospital Location:*\nLocation unavailable'), 'Location must clearly say Location unavailable');
    assert.ok(!message.includes('http'), 'Must not invent a Maps link');
  });

  // =========================================================================
  // SCENARIO 4: Demo rescheduled to a new date/time
  // =========================================================================
  it('Scenario 4: Demo rescheduled to a new date/time uses latest saved values and indicates Demo Rescheduled', () => {
    const hospitalData = {
      organizationName: 'Max Super Speciality Hospital',
      address: '1, 2, Press Enclave Marg, Saket Institutional Area, New Delhi 110017',
      hospitalCoordinates: {
        latitude: 28.5284,
        longitude: 77.2117,
        isVerified: true,
      },
    };

    const loc = resolveHospitalMapsLocation(hospitalData);

    const rescheduledMsg = generateDemoWhatsAppMessage({
      hospitalName: hospitalData.organizationName,
      address: hospitalData.address,
      demoDate: '2026-11-05', // Rescheduled date
      demoTime: '16:30',     // Rescheduled time
      salesAgentName: 'Prince Sharma',
      contactPerson: 'Dr. Rajiv Gupta',
      contactPhone: '+91 9988776655',
      remarks: 'Rescheduled upon client request due to emergency surgery',
      googleMapsUrl: loc.url,
      isRescheduled: true,
    });

    assert.ok(rescheduledMsg.includes('📅 *Demo Rescheduled*'), 'Header must indicate Demo Rescheduled');
    assert.ok(rescheduledMsg.includes('📅 Date: 05 Nov 2026'), 'Must display latest rescheduled date');
    assert.ok(rescheduledMsg.includes('⏰ Time: 16:30'), 'Must display latest rescheduled time');
    assert.ok(rescheduledMsg.includes('📝 Remarks/Notes: Rescheduled upon client request due to emergency surgery'));
    assert.ok(rescheduledMsg.includes('🗺️ *Hospital Location:*\nhttps://www.google.com/maps/search/?api=1&query=28.5284%2C77.2117'), 'Must retain hospital location link');
  });

  // =========================================================================
  // SCENARIO 5: WhatsApp message contains the correct hospital's Maps link
  // =========================================================================
  it('Scenario 5: Ensures different hospitals generate their own distinct Maps links without crosstalk', () => {
    const hospA = {
      organizationName: 'Hospital Alpha',
      address: 'Connaught Place, New Delhi',
      hospitalCoordinates: { latitude: 28.6315, longitude: 77.2167, isVerified: true },
    };

    const hospB = {
      organizationName: 'Hospital Beta',
      address: 'Bandra West, Mumbai, Maharashtra 400050',
      hospitalCoordinates: { latitude: 19.0596, longitude: 72.8295, isVerified: true },
    };

    const locA = resolveHospitalMapsLocation(hospA);
    const locB = resolveHospitalMapsLocation(hospB);

    assert.strictEqual(locA.url, 'https://www.google.com/maps/search/?api=1&query=28.6315%2C77.2167');
    assert.strictEqual(locB.url, 'https://www.google.com/maps/search/?api=1&query=19.0596%2C72.8295');
    assert.notStrictEqual(locA.url, locB.url, 'Different hospitals must have distinct location links');

    const msgA = generateDemoWhatsAppMessage({
      hospitalName: hospA.organizationName,
      address: hospA.address,
      demoDate: '2026-10-29',
      demoTime: '10:00',
      salesAgentName: 'Agent A',
      googleMapsUrl: locA.url,
    });

    const msgB = generateDemoWhatsAppMessage({
      hospitalName: hospB.organizationName,
      address: hospB.address,
      demoDate: '2026-10-29',
      demoTime: '10:00',
      salesAgentName: 'Agent B',
      googleMapsUrl: locB.url,
    });

    assert.ok(msgA.includes(locA.url) && !msgA.includes(locB.url));
    assert.ok(msgB.includes(locB.url) && !msgB.includes(locA.url));
  });

  // =========================================================================
  // SCENARIO 6: Link opens correct location in Google Maps (Format & Security)
  // =========================================================================
  it('Scenario 6: Format conforms to Google Maps search API, properly URL-encoded, and free of sensitive IDs', () => {
    const leadWithPrivateIds = {
      _id: '64a92c019d381023a41b8999',
      currentOwner: '64a92c019d381023a41b8111',
      organizationName: 'St. Stephen\'s & Maternity Hospital',
      address: 'Tis Hazari, Near Kashmere Gate, Delhi - 110054',
      hospitalCoordinates: {
        latitude: 28.6669,
        longitude: 77.2144,
        isVerified: true,
        verifiedBy: '64a92c019d381023a41b8222',
      },
    };

    const loc = resolveHospitalMapsLocation(leadWithPrivateIds);

    // 1. Valid API format
    assert.ok(loc.url.startsWith('https://www.google.com/maps/search/?api=1&query='));

    // 2. Query URL-encoded properly
    const urlObj = new URL(loc.url);
    assert.strictEqual(urlObj.searchParams.get('api'), '1');
    assert.strictEqual(urlObj.searchParams.get('query'), '28.6669,77.2144');

    // 3. No sensitive DB IDs or credentials leaked in URL
    assert.ok(!loc.url.includes('64a92c019d381023a41b8999'), 'Link must not expose Lead ID');
    assert.ok(!loc.url.includes('64a92c019d381023a41b8111'), 'Link must not expose Owner ID');
    assert.ok(!loc.url.includes('64a92c019d381023a41b8222'), 'Link must not expose Verifier ID');

    // 4. Test address with special characters (&, apostrophes, commas)
    const addressOnlyLead = {
      organizationName: 'St. Stephen\'s & Maternity Hospital',
      address: 'Tis Hazari, Near Kashmere Gate #12, Delhi - 110054',
      hospitalCoordinates: null,
    };
    const addrLoc = resolveHospitalMapsLocation(addressOnlyLead);
    assert.ok(addrLoc.url.startsWith('https://www.google.com/maps/search/?api=1&query='));
    const addrUrlObj = new URL(addrLoc.url);
    assert.strictEqual(
      addrUrlObj.searchParams.get('query'),
      'St. Stephen\'s & Maternity Hospital, Tis Hazari, Near Kashmere Gate #12, Delhi - 110054'
    );
  });

  // =========================================================================
  // SCENARIO 7: Strict isolation from Sales Agent visit/GPS location
  // =========================================================================
  it('Scenario 7: Never uses Sales Agent visit GPS or createdLocation as hospital location', () => {
    const leadWithAgentGps = {
      organizationName: 'City Clinic',
      address: '', // No address
      // Agent GPS captured on check-in or visit
      createdLocation: {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracy: 15,
        status: 'Captured',
      },
      latestWalkIn: {
        latitude: 13.0827,
        longitude: 80.2707,
      },
      hospitalCoordinates: null, // No hospital coords
    };

    const loc = resolveHospitalMapsLocation(leadWithAgentGps);
    assert.strictEqual(
      loc.isAvailable,
      false,
      'Must NOT fall back to agent GPS or visit location'
    );
    assert.strictEqual(loc.displayText, 'Location unavailable');
  });

  // =========================================================================
  // SCENARIO 8: generateSalesAgentTemplate handles Demo and other activity types
  // =========================================================================
  it('Scenario 8: generateSalesAgentTemplate routes Demo to new format while preserving Walk-in and Follow-up', () => {
    // 1. Demo
    const demoMsg = generateSalesAgentTemplate({
      salesAgentName: 'Prince',
      activityType: 'Demo',
      organizationName: 'Life Care Hospital',
      address: 'Civil Lines, Jaipur, Rajasthan 302006',
      hospitalCoordinates: { latitude: 26.9088, longitude: 75.7873, isVerified: true },
      scheduledDate: '2026-10-30',
      scheduledTime: '11:00 AM',
      contactPerson: 'Dr. Sharma',
      contactPhone: '9829012345',
    });
    assert.ok(demoMsg.includes('📅 *New Demo Scheduled*'));
    assert.ok(demoMsg.includes('🏥 Hospital: Life Care Hospital'));
    assert.ok(demoMsg.includes('🗺️ *Hospital Location:*\nhttps://www.google.com/maps/search/?api=1&query=26.9088%2C75.7873'));

    // 2. Walk-in (Preserved)
    const walkInMsg = generateSalesAgentTemplate({
      salesAgentName: 'Prince',
      activityType: 'Walk-in',
      organizationName: 'Life Care Hospital',
      scheduledDate: '2026-10-30',
      scheduledTime: '11:00 AM',
    });
    assert.ok(walkInMsg.includes('New Walk-in Visit assigned for lead: Life Care Hospital'));

    // 3. Follow-up (Preserved)
    const followUpMsg = generateSalesAgentTemplate({
      salesAgentName: 'Prince',
      activityType: 'Sales Follow-up',
      organizationName: 'Life Care Hospital',
      scheduledDate: '2026-10-30',
      scheduledTime: '11:00 AM',
    });
    assert.ok(followUpMsg.includes('New Sales Follow-up assigned for lead: Life Care Hospital'));
  });
});
