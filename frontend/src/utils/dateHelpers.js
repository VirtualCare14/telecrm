export function formatDateToYYYYMMDD(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

export function toISOFromLocalDatetime(localStr) {
  if (!localStr) return undefined;
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function getDateRangeFromFilter(filter) {
  const now = new Date();
  const todayStr = formatDateToYYYYMMDD(now);
  
  switch (filter) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr };
    case 'yesterday': {
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yesterdayStr = formatDateToYYYYMMDD(yesterday);
      return { startDate: yesterdayStr, endDate: yesterdayStr };
    }
    case 'last7': {
      const last7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return { startDate: formatDateToYYYYMMDD(last7), endDate: todayStr };
    }
    case 'last30': {
      const last30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      return { startDate: formatDateToYYYYMMDD(last30), endDate: todayStr };
    }
    case 'thisMonth': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: formatDateToYYYYMMDD(monthStart), endDate: todayStr };
    }
    default:
      return {};
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: true
  });
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
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
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
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