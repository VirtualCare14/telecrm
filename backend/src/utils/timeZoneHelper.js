/**
 * Shared Timezone & Date Helper for Asia/Kolkata (+05:30)
 * Ensures zero timezone drift on any server environment (UTC, Localhost, Hostinger).
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function parseFollowUpDateTimeIST(dateStr, timeStr) {
  if (!dateStr) return null;
  let cleanDate = typeof dateStr === 'string' ? dateStr.trim() : '';
  if (!cleanDate && !(dateStr instanceof Date)) return null;

  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return null;
    if (!timeStr) return dateStr;
    cleanDate = dateStr.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }

  // Handle MM/DD/YYYY -> YYYY-MM-DD
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanDate)) {
    const parts = cleanDate.split('/');
    const m = parts[0].padStart(2, '0');
    const d = parts[1].padStart(2, '0');
    const y = parts[2];
    cleanDate = `${y}-${m}-${d}`;
  }

  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    let hours = 10;
    let minutes = 0;
    if (timeStr && typeof timeStr === 'string' && timeStr.trim()) {
      const parts = timeStr.trim().split(':');
      const th = Number(parts[0]);
      const tm = Number(parts[1] || '0');
      if (!isNaN(th) && th >= 0 && th < 24) hours = th;
      if (!isNaN(tm) && tm >= 0 && tm < 60) minutes = tm;
    }
    const pad = (n) => String(n).padStart(2, '0');
    const istIso = `${cleanDate}T${pad(hours)}:${pad(minutes)}:00+05:30`;
    const d = new Date(istIso);
    return isNaN(d.getTime()) ? null : d;
  }

  // Handle ISO string or string with 'T'
  if (cleanDate.includes('T')) {
    const d = new Date(cleanDate);
    if (isNaN(d.getTime())) return null;
    if (timeStr && typeof timeStr === 'string' && timeStr.trim()) {
      const ymdIST = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const parts = timeStr.trim().split(':');
      const th = Number(parts[0]);
      const tm = Number(parts[1] || '0');
      const pad = (n) => String(n).padStart(2, '0');
      const istIso = `${ymdIST}T${pad(isNaN(th) ? 10 : th)}:${pad(isNaN(tm) ? 0 : tm)}:00+05:30`;
      const res = new Date(istIso);
      return isNaN(res.getTime()) ? d : res;
    }
    return d;
  }

  const d = new Date(cleanDate);
  return isNaN(d.getTime()) ? null : d;
}

function getStartAndEndOfDayIST(date = new Date()) {
  const d = new Date(date);
  const todayStr = isNaN(d.getTime())
    ? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    : d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const start = new Date(Date.UTC(ty, tm - 1, td, 0, 0, 0, 0) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999) - IST_OFFSET_MS);
  return { start, end };
}

module.exports = {
  IST_OFFSET_MS,
  parseFollowUpDateTimeIST,
  getStartAndEndOfDayIST,
};

