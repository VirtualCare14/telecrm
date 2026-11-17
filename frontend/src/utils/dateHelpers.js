export function formatDateToYYYYMMDD(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function formatTimeTo24H(date = new Date()) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function splitDateAnd24HTime(dateOrIso) {
  if (!dateOrIso) return { date: '', time: '' };
  const d = new Date(dateOrIso);
  if (isNaN(d.getTime())) return { date: '', time: '' };
  return {
    date: d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    time: d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  };
}

export function normalizeDateToYYYYMMDD(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    const s = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const parts = s.split('/');
      const m = parts[0].padStart(2, '0');
      const d = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${y}-${m}-${d}`;
    }
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function formatYYYYMMDDToMMDDYYYY(ymd) {
  if (!ymd) return '';
  const clean = normalizeDateToYYYYMMDD(ymd);
  if (!clean) return '';
  const [y, m, d] = clean.split('-');
  return `${m}/${d}/${y}`;
}

export function parseMMDDYYYYToYYYYMMDD(mmddyyyy) {
  if (!mmddyyyy) return '';
  const s = String(mmddyyyy).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const parts = s.split('/');
    const m = parts[0].padStart(2, '0');
    const d = parts[1].padStart(2, '0');
    const y = parts[2];
    return `${y}-${m}-${d}`;
  }
  return normalizeDateToYYYYMMDD(s);
}

export function combineDateAndTime(dateStr, timeStr) {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) return undefined;
  let cleanDate = dateStr.trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanDate)) {
    const parts = cleanDate.split('/');
    const m = parts[0].padStart(2, '0');
    const d = parts[1].padStart(2, '0');
    const y = parts[2];
    cleanDate = `${y}-${m}-${d}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    const d = new Date(cleanDate);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  let cleanTime = timeStr && typeof timeStr === 'string' ? timeStr.trim() : '00:00';
  const timeParts = cleanTime.split(':');
  const hours = String(timeParts[0] || '00').padStart(2, '0');
  const minutes = String(timeParts[1] || '00').padStart(2, '0');
  const seconds = String(timeParts[2] || '00').padStart(2, '0');

  const istIso = `${cleanDate}T${hours}:${minutes}:${seconds}+05:30`;
  const d = new Date(istIso);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function toLocalDatetimeInput(date = new Date()) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function toISOFromLocalDatetime(dateOrDateTime, timeStr) {
  if (!dateOrDateTime) return undefined;
  if (timeStr !== undefined) {
    return combineDateAndTime(dateOrDateTime, timeStr);
  }
  if (typeof dateOrDateTime === 'string' && dateOrDateTime.includes('T')) {
    const [dPart, tPart] = dateOrDateTime.split('T');
    return combineDateAndTime(dPart, tPart);
  }
  const d = new Date(dateOrDateTime);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function getDateRangeFromFilter(filter, extra = {}) {
  const now = new Date();
  const todayStr = formatDateToYYYYMMDD(now);
  
  switch (filter) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr };
    case 'yesterday': {
      const [y, m, d] = todayStr.split('-').map(Number);
      const prev = new Date(Date.UTC(y, m - 1, d - 1));
      const py = prev.getUTCFullYear();
      const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
      const pd = String(prev.getUTCDate()).padStart(2, '0');
      const yesterdayStr = `${py}-${pm}-${pd}`;
      return { startDate: yesterdayStr, endDate: yesterdayStr };
    }
    case 'thisMonth': {
      const [y, m] = todayStr.split('-').map(Number);
      const monthStartStr = `${y}-${String(m).padStart(2, '0')}-01`;
      return { startDate: monthStartStr, endDate: todayStr };
    }
    case 'custom': {
      return { startDate: extra.customStart || '', endDate: extra.customEnd || '' };
    }
    default:
      return {};
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  const y = parts.find((p) => p.type === 'year')?.value;
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const min = parts.find((p) => p.type === 'minute')?.value;
  return `${m}/${day}/${y}, ${hour}:${min}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    const [y, m, d] = dateStr.trim().split('-');
    return `${m}/${d}/${y}`;
  }
  if (typeof dateStr === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr.trim())) {
    const parts = dateStr.trim().split('/');
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  const y = parts.find((p) => p.type === 'year')?.value;
  return `${m}/${day}/${y}`;
}

export function isOverdue(dateStr, closureStatus = 'OPEN') {
  if (!dateStr) return false;
  if (closureStatus && closureStatus !== 'OPEN') return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d < new Date();
}

export function isUpcoming(dateStr, closureStatus = 'OPEN') {
  if (!dateStr) return false;
  if (closureStatus && closureStatus !== 'OPEN') return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d >= new Date();
}

export function formatTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

export function getDailyRange(dateStr) {
  if (!dateStr) return {};
  return { startDate: dateStr, endDate: dateStr };
}

export function getWeeklyRange(dateStr) {
  if (!dateStr) return {};
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(dateObj.getTime())) return {};
  const day = dateObj.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(y, m - 1, d + diffToMonday));
  const sunday = new Date(Date.UTC(y, m - 1, d + diffToMonday + 6));
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return {
    startDate: fmt(monday),
    endDate: fmt(sunday)
  };
}

export function getMonthlyRange(monthStr) {
  if (!monthStr) return {};
  const [y, m] = monthStr.split('-').map(Number);
  if (!y || !m) return {};
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return {
    startDate: fmt(start),
    endDate: fmt(end)
  };
}

export function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

export function getFollowUpStatus(dateStr, closureStatus = 'OPEN') {
  if (closureStatus && closureStatus !== 'OPEN') {
    return {
      status: 'closed',
      label: closureStatus === 'WON' ? 'Closed Won' : 'Closed Lost',
      color: closureStatus === 'WON' ? '#059669' : '#dc2626',
      bg: closureStatus === 'WON' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
      border: closureStatus === 'WON' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
    };
  }
  if (!dateStr) {
    return {
      status: 'none',
      label: 'Not Set',
      color: '#64748b',
      bg: '#f1f5f9',
      border: '#cbd5e1',
    };
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return {
      status: 'none',
      label: 'Invalid Date',
      color: '#64748b',
      bg: '#f1f5f9',
      border: '#cbd5e1',
    };
  }
  const now = new Date();
  if (d < now) {
    return {
      status: 'overdue',
      label: 'Overdue',
      color: '#dc2626',
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.35)',
    };
  }
  if (isToday(dateStr)) {
    return {
      status: 'today',
      label: 'Today',
      color: '#d97706',
      bg: 'rgba(245, 158, 11, 0.14)',
      border: 'rgba(245, 158, 11, 0.4)',
    };
  }
  return {
    status: 'upcoming',
    label: 'Upcoming',
    color: '#0284c7',
    bg: 'rgba(2, 132, 199, 0.12)',
    border: 'rgba(2, 132, 199, 0.35)',
  };
}
