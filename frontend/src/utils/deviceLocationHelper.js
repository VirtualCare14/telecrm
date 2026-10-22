/**
 * Device Installation ID & Geolocation Helper for TeleCRM Field Visits
 * 
 * Provides:
 * 1. Persistent client-side browser device installation identifier.
 * 2. One-shot browser Geolocation API capture with explicit user permission and status mapping.
 * 
 * Constraints:
 * - No continuous or background tracking.
 * - No hardware serials or IMEI claimed.
 * - Graceful fallback when permissions are denied or storage is blocked.
 */

const STORAGE_KEY = 'telecrm_device_installation_id';

/**
 * Generate a random UUID v4 using crypto.randomUUID or Math.random fallback.
 */
function generateUUID() {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    try {
      return window.crypto.randomUUID();
    } catch (e) {
      // Fallback below
    }
  }
  // Standard RFC 4180 compliant pseudo-UUID fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Retrieves or initializes a persistent device installation ID for this browser.
 * 
 * @returns {{ deviceInstallationId: string, isPersistent: boolean }}
 */
export function getDeviceInstallationId() {
  const createResult = (id, isPersistent) => ({
    deviceInstallationId: id,
    isPersistent,
    toString() { return this.deviceInstallationId; },
    substring(...args) { return this.deviceInstallationId.substring(...args); },
    slice(...args) { return this.deviceInstallationId.slice(...args); },
  });

  if (typeof window === 'undefined') {
    return createResult('server-env', false);
  }

  try {
    let storedId = window.localStorage.getItem(STORAGE_KEY);
    if (storedId && typeof storedId === 'string' && storedId.trim().length > 0) {
      return createResult(storedId.trim(), true);
    }

    const newId = generateUUID();
    window.localStorage.setItem(STORAGE_KEY, newId);
    return createResult(newId, true);
  } catch (err) {
    // If localStorage is blocked (e.g. strict private browsing mode)
    console.warn('LocalStorage unavailable for device installation ID:', err);
    return createResult(generateUUID(), false);
  }
}

/**
 * Detects the browser's operating platform / device category safely.
 * Uses navigator.userAgentData when supported, with a robust navigator.userAgent fallback.
 * Uses honest, non-fabricated platform names like 'Android Phone', 'iPhone/iPad', 'Windows PC', 'Mac', etc.
 * 
 * @returns {string}
 */
export function getDeviceName() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Unknown Device';
  }

  try {
    // 1. Try modern User-Agent Client Hints (navigator.userAgentData) if supported
    if (navigator.userAgentData && typeof navigator.userAgentData === 'object') {
      const platform = (navigator.userAgentData.platform || '').trim();
      const isMobile = Boolean(navigator.userAgentData.mobile);

      if (/android/i.test(platform)) {
        return isMobile ? 'Android Phone' : 'Android Tablet';
      }
      if (/windows/i.test(platform)) {
        return 'Windows PC';
      }
      if (/mac/i.test(platform) || /macos/i.test(platform)) {
        return isMobile ? 'iPhone/iPad' : 'Mac';
      }
      if (/ios/i.test(platform)) {
        return isMobile ? 'iPhone' : 'iPad';
      }
      if (/linux/i.test(platform)) {
        return isMobile ? 'Android Device' : 'Linux PC';
      }
      if (/chrome\s*os/i.test(platform) || /cros/i.test(platform)) {
        return 'ChromeOS Device';
      }
      if (platform) {
        return `${platform} ${isMobile ? 'Mobile' : 'Device'}`;
      }
    }

    // 2. Safe navigator.userAgent fallback
    const ua = navigator.userAgent || '';

    if (/iPhone/i.test(ua)) {
      return 'iPhone';
    }
    if (/iPad/i.test(ua)) {
      return 'iPad';
    }
    if (/Android/i.test(ua)) {
      return /Mobile/i.test(ua) ? 'Android Phone' : 'Android Tablet';
    }
    if (/Windows NT/i.test(ua)) {
      return 'Windows PC';
    }
    if (/Macintosh|Mac OS X/i.test(ua)) {
      if (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) {
        return 'iPad';
      }
      return 'Mac';
    }
    if (/Linux/i.test(ua)) {
      return 'Linux PC';
    }
    if (/CrOS/i.test(ua)) {
      return 'ChromeOS Device';
    }

    return 'Unknown Device';
  } catch (err) {
    return 'Unknown Device';
  }
}

/**
 * Requests location permission and captures the agent's current GPS coordinates once.
 * 
 * @param {Object} [options]
 * @param {number} [options.timeout=10000] - Max time to wait for GPS in ms
 * @param {boolean} [options.enableHighAccuracy=true] - Request high accuracy GPS
 * @returns {Promise<{
 *   status: 'Captured' | 'Permission Denied' | 'Unavailable' | 'Timed Out',
 *   latitude: number | null,
 *   longitude: number | null,
 *   accuracy: number | null,
 *   capturedAt: string | null,
 *   error: string | null,
 *   googleMapsUrl: string | null
 * }>}
 */
export function captureCurrentLocation({ timeout = 10000, enableHighAccuracy = true } = {}) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !navigator || !navigator.geolocation) {
      return resolve({
        status: 'Unavailable',
        latitude: null,
        longitude: null,
        accuracy: null,
        capturedAt: null,
        error: 'Geolocation is not supported by your browser.',
        googleMapsUrl: null,
      });
    }

    const geoOptions = {
      enableHighAccuracy,
      timeout,
      maximumAge: 0, // Force fresh acquisition, do not use stale cache
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const capturedAt = new Date(position.timestamp || Date.now()).toISOString();
        const roundedLat = Number(latitude.toFixed(6));
        const roundedLng = Number(longitude.toFixed(6));
        const roundedAcc = Math.round(accuracy || 0);

        resolve({
          status: 'Captured',
          latitude: roundedLat,
          longitude: roundedLng,
          accuracy: roundedAcc,
          capturedAt,
          error: null,
          googleMapsUrl: `https://www.google.com/maps?q=${roundedLat},${roundedLng}`,
        });
      },
      (geoError) => {
        let status = 'Unavailable';
        let userMessage = 'Unable to acquire location.';

        switch (geoError.code) {
          case 1: // PERMISSION_DENIED
            status = 'Permission Denied';
            userMessage = 'Location permission was denied in your browser settings. You can still submit the visit record.';
            break;
          case 2: // POSITION_UNAVAILABLE
            status = 'Unavailable';
            userMessage = 'GPS signal or network position is currently unavailable.';
            break;
          case 3: // TIMEOUT
            status = 'Timed Out';
            userMessage = 'Location acquisition timed out. You may retry or submit without coordinates.';
            break;
          default:
            status = 'Unavailable';
            userMessage = geoError.message || 'Unable to determine location.';
            break;
        }

        resolve({
          status,
          latitude: null,
          longitude: null,
          accuracy: null,
          capturedAt: null,
          error: userMessage,
          googleMapsUrl: null,
        });
      },
      geoOptions
    );
  });
}
