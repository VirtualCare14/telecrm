export function getDateRangeFromFilter(filter) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (filter) {
    case 'today':
      return { startDate: start.toISOString().split('T')[0], endDate: start.toISOString().split('T')[0] };
    case 'yesterday': {
      const yesterday = new Date(start);
      yesterday.setDate(yesterday.getDate() - 1);
      return { startDate: yesterday.toISOString().split('T')[0], endDate: yesterday.toISOString().split('T')[0] };
    }
    case 'last7': {
      const last7 = new Date(start);
      last7.setDate(last7.getDate() - 6);
      return { startDate: last7.toISOString().split('T')[0], endDate: start.toISOString().split('T')[0] };
    }
    case 'last30': {
      const last30 = new Date(start);
      last30.setDate(last30.getDate() - 29);
      return { startDate: last30.toISOString().split('T')[0], endDate: start.toISOString().split('T')[0] };
    }
    case 'thisMonth': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: monthStart.toISOString().split('T')[0], endDate: start.toISOString().split('T')[0] };
    }
    default:
      return {};
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

export function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export function isUpcoming(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) > new Date();
}