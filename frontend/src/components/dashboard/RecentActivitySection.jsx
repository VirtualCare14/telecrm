import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Stack,
  Divider,
  Skeleton,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  History,
  PhoneInTalk,
  PhoneMissed,
  EventNote,
  DirectionsWalk,
  LaptopMac,
  EmojiEvents,
  Cancel,
  AddCircleOutline,
  CheckCircle,
  Launch,
  ChatBubbleOutline,
} from '@mui/icons-material';
import { formatDateTime } from '../../utils/dateHelpers';

export default function RecentActivitySection({
  activities = [],
  loading = false,
  navigate,
}) {
  const getActivityIcon = (action = '') => {
    const act = action.toLowerCase();
    if (act.includes('call')) {
      return <PhoneInTalk sx={{ fontSize: 18, color: '#0284c7' }} />;
    }
    if (act.includes('walk-in') || act.includes('walk in')) {
      return <DirectionsWalk sx={{ fontSize: 18, color: '#059669' }} />;
    }
    if (act.includes('demo')) {
      return <LaptopMac sx={{ fontSize: 18, color: '#6366f1' }} />;
    }
    if (act.includes('won')) {
      return <EmojiEvents sx={{ fontSize: 18, color: '#10b981' }} />;
    }
    if (act.includes('lost')) {
      return <Cancel sx={{ fontSize: 18, color: '#dc2626' }} />;
    }
    if (act.includes('created')) {
      return <AddCircleOutline sx={{ fontSize: 18, color: '#ea580c' }} />;
    }
    if (act.includes('completed')) {
      return <CheckCircle sx={{ fontSize: 18, color: '#10b981' }} />;
    }
    return <EventNote sx={{ fontSize: 18, color: '#475569' }} />;
  };

  const getActivityBadgeColor = (action = '') => {
    const act = action.toLowerCase();
    if (act.includes('call')) return { bg: '#e0f2fe', color: '#0284c7', border: '#bae6fd' };
    if (act.includes('walk-in') || act.includes('walk in')) return { bg: '#d1fae5', color: '#059669', border: '#a7f3d0' };
    if (act.includes('demo')) return { bg: '#ede9fe', color: '#6366f1', border: '#c7d2fe' };
    if (act.includes('won')) return { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' };
    if (act.includes('lost')) return { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' };
    if (act.includes('created')) return { bg: '#ffedd5', color: '#c2410c', border: '#fed7aa' };
    if (act.includes('completed')) return { bg: '#d1fae5', color: '#059669', border: '#a7f3d0' };
    return { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
  };

  return (
    <Paper
      elevation={0}
      sx={{
        mt: 3,
        borderRadius: 3,
        border: '1px solid #e2e8f0',
        bgcolor: '#ffffff',
        boxShadow: '0 2px 12px rgba(15, 23, 42, 0.04)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(to right, #ffffff, #fafafa)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 2,
              bgcolor: 'rgba(2, 132, 199, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0284c7',
            }}
          >
            <History sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a', lineHeight: 1.2 }}>
              Recent Activity
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Real-time trail of your logged calls, remarks, walk-ins, and updates
            </Typography>
          </Box>
        </Box>
        <Chip
          label={`${activities.length} ${activities.length === 1 ? 'Record' : 'Records'}`}
          size="small"
          sx={{ fontWeight: 600, height: 24, bgcolor: '#f1f5f9', color: '#475569' }}
        />
      </Box>

      {/* Activity Timeline List */}
      <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
        {loading ? (
          <Stack spacing={1.5}>
            {[1, 2, 3, 4].map((n) => (
              <Skeleton key={n} variant="rounded" height={64} sx={{ borderRadius: 2 }} />
            ))}
          </Stack>
        ) : activities.length === 0 ? (
          <Box sx={{ py: 5, textAlign: 'center' }}>
            <History sx={{ fontSize: 44, color: '#cbd5e1', mb: 1 }} />
            <Typography variant="subtitle1" fontWeight={600} sx={{ color: '#475569' }}>
              No Recent Activity
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Activities will appear here as you log calls, record walk-ins, schedule demos, and update leads.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {activities.map((act) => {
              const leadObj = act.lead || {};
              const leadId = leadObj._id;
              const meta = act.metadata || {};
              const badgeColors = getActivityBadgeColor(act.action);
              const remarks =
                meta.remark ||
                meta.remarks ||
                meta.closingRemark ||
                meta.lostReason;

              return (
                <Paper
                  key={act._id}
                  elevation={0}
                  sx={{
                    p: 1.75,
                    borderRadius: 2,
                    border: '1px solid #f1f5f9',
                    bgcolor: '#ffffff',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: '#fafafa',
                      borderColor: '#e2e8f0',
                      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      justifyContent: 'space-between',
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      gap: 1,
                    }}
                  >
                    {/* Left: Icon, Action Badge, Lead Details */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flex: 1 }}>
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          bgcolor: badgeColors.bg,
                          border: `1px solid ${badgeColors.border}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          mt: 0.25,
                        }}
                      >
                        {getActivityIcon(act.action)}
                      </Box>

                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Chip
                            label={act.action}
                            size="small"
                            sx={{
                              fontWeight: 700,
                              fontSize: 11,
                              height: 22,
                              bgcolor: badgeColors.bg,
                              color: badgeColors.color,
                              border: `1px solid ${badgeColors.border}`,
                            }}
                          />

                          {leadObj.leadNumber && (
                            <Box
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.5,
                                cursor: 'pointer',
                                color: '#0f172a',
                                fontWeight: 600,
                                fontSize: 13,
                                '&:hover': { color: 'primary.main' },
                              }}
                              onClick={() => leadId && navigate(`/leads/${leadId}`)}
                            >
                              <Typography fontWeight={600} fontSize={13} sx={{ color: 'inherit' }}>
                                #{leadObj.leadNumber} • {leadObj.organizationName}
                              </Typography>
                              <Launch sx={{ fontSize: 13, color: '#94a3b8' }} />
                            </Box>
                          )}

                          {meta.disposition && (
                            <Chip
                              label={meta.disposition}
                              size="small"
                              variant="outlined"
                              sx={{ height: 20, fontSize: 10, fontWeight: 600, color: '#334155' }}
                            />
                          )}

                          {meta.dealValue && (
                            <Chip
                              label={`₹${Number(meta.dealValue).toLocaleString()}`}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: 10,
                                fontWeight: 700,
                                bgcolor: '#dcfce7',
                                color: '#15803d',
                              }}
                            />
                          )}
                        </Box>

                        {/* Remarks / Discussion notes */}
                        {remarks && (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              mt: 0.75,
                              color: '#475569',
                            }}
                          >
                            <ChatBubbleOutline sx={{ fontSize: 13, color: '#94a3b8' }} />
                            <Typography
                              variant="body2"
                              fontSize={12}
                              sx={{
                                fontStyle: 'italic',
                                color: '#334155',
                              }}
                            >
                              "{remarks}"
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>

                    {/* Right: Date & Time */}
                    <Box sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, flexShrink: 0, pl: { sm: 2 } }}>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>
                        {formatDateTime(act.createdAt)}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}
