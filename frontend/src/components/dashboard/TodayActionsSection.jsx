import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Stack,
  Divider,
  Skeleton,
} from '@mui/material';
import {
  WarningAmber as WarningIcon,
  Schedule,
  LaptopMac,
  DirectionsWalk,
  StarBorder as StarIcon,
  ContentCopy,
  Check as CheckIcon,
  PhoneInTalk,
  Visibility,
  CheckCircleOutline,
  DirectionsRun,
  Bolt,
  ForumOutlined,
  CalendarMonth,
} from '@mui/icons-material';
import { formatDate, formatTime, formatDateTime } from '../../utils/dateHelpers';
import { getNextAction } from '../../utils/nextActionHelper';

export default function TodayActionsSection({
  todayActions = {},
  loading = false,
  onActionClick,
  onCopyPhone,
  copiedId,
  navigate,
  agentRole,
}) {
  const [currentTab, setCurrentTab] = useState('all');

  const overdue = todayActions.overdue || [];
  const todayFollowups = todayActions.todayFollowups || [];
  const todayDemos = todayActions.todayDemos || [];
  const todayWalkIns = todayActions.todayWalkIns || [];
  const otherActions = todayActions.otherActions || [];

  const totalCount =
    overdue.length +
    todayFollowups.length +
    todayDemos.length +
    todayWalkIns.length +
    otherActions.length;

  // Filter list based on selected tab
  let displayedItems = [];
  if (currentTab === 'all') {
    displayedItems = [
      ...overdue.map((l) => ({ ...l, actionCategory: 'overdue' })),
      ...todayFollowups.map((l) => ({ ...l, actionCategory: 'today_followup' })),
      ...todayDemos.map((d) => ({
        ...(d.lead || d),
        demoDetails: d,
        actionCategory: 'today_demo',
      })),
      ...todayWalkIns.map((w) => ({
        ...(w.lead || w),
        walkInDetails: w,
        actionCategory: 'today_walkin',
      })),
      ...otherActions.map((l) => ({ ...l, actionCategory: 'other' })),
    ];
  } else if (currentTab === 'overdue') {
    displayedItems = overdue.map((l) => ({ ...l, actionCategory: 'overdue' }));
  } else if (currentTab === 'today_followups') {
    displayedItems = todayFollowups.map((l) => ({ ...l, actionCategory: 'today_followup' }));
  } else if (currentTab === 'today_demos') {
    displayedItems = todayDemos.map((d) => ({
      ...(d.lead || d),
      demoDetails: d,
      actionCategory: 'today_demo',
    }));
  } else if (currentTab === 'today_walkins') {
    displayedItems = todayWalkIns.map((w) => ({
      ...(w.lead || w),
      walkInDetails: w,
      actionCategory: 'today_walkin',
    }));
  } else if (currentTab === 'other') {
    displayedItems = otherActions.map((l) => ({ ...l, actionCategory: 'other' }));
  }

  const renderBadge = (item) => {
    switch (item.actionCategory) {
      case 'overdue':
        return (
          <Chip
            icon={<WarningIcon sx={{ fontSize: '14px !important' }} />}
            label={`Overdue Follow-up • ${item.nextFollowUpAt ? formatDateTime(item.nextFollowUpAt) : 'Pending'}`}
            size="small"
            sx={{
              fontWeight: 700,
              bgcolor: '#fee2e2',
              color: '#dc2626',
              border: '1px solid #fca5a5',
              fontSize: 11,
              height: 24,
            }}
          />
        );
      case 'today_followup':
        return (
          <Chip
            icon={<Schedule sx={{ fontSize: '14px !important' }} />}
            label={`Follow-up Today • ${item.nextFollowUpAt ? formatTime(item.nextFollowUpAt) : 'Today'}`}
            size="small"
            sx={{
              fontWeight: 600,
              bgcolor: '#e0f2fe',
              color: '#0284c7',
              border: '1px solid #bae6fd',
              fontSize: 11,
              height: 24,
            }}
          />
        );
      case 'today_demo':
        return (
          <Chip
            icon={<LaptopMac sx={{ fontSize: '14px !important' }} />}
            label={`Demo Today • ${item.demoDetails?.demoTime || item.latestDemo?.demoTime || 'Scheduled'}`}
            size="small"
            sx={{
              fontWeight: 600,
              bgcolor: '#ede9fe',
              color: '#6366f1',
              border: '1px solid #c7d2fe',
              fontSize: 11,
              height: 24,
            }}
          />
        );
      case 'today_walkin':
        return (
          <Chip
            icon={<DirectionsWalk sx={{ fontSize: '14px !important' }} />}
            label={`Walk-in Today • ${item.walkInDetails?.walkInTime || item.latestWalkIn?.walkInTime || 'Today'}`}
            size="small"
            sx={{
              fontWeight: 600,
              bgcolor: '#d1fae5',
              color: '#059669',
              border: '1px solid #a7f3d0',
              fontSize: 11,
              height: 24,
            }}
          />
        );
      case 'other':
      default:
        return (
          <Chip
            icon={<Bolt sx={{ fontSize: '14px !important' }} />}
            label={item.latestDisposition ? `${item.latestDisposition} • Action Needed` : 'New Lead • Initial Call'}
            size="small"
            sx={{
              fontWeight: 600,
              bgcolor: '#fef3c7',
              color: '#b45309',
              border: '1px solid #fde68a',
              fontSize: 11,
              height: 24,
            }}
          />
        );
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 3,
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
          flexWrap: 'wrap',
          gap: 1.5,
          background: 'linear-gradient(to right, #ffffff, #fafafa)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 2,
              bgcolor: 'rgba(234, 88, 12, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'primary.main',
            }}
          >
            <DirectionsRun sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a', lineHeight: 1.2 }}>
                Today's Actions
              </Typography>
              <Chip
                label={`${totalCount} ${totalCount === 1 ? 'Action' : 'Actions'}`}
                size="small"
                color={overdue.length > 0 ? 'error' : 'primary'}
                sx={{ fontWeight: 700, height: 22, fontSize: 11 }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              High-priority leads needing calls, follow-ups, demos, or walk-ins today
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Action Filter Tabs */}
      <Box sx={{ borderBottom: '1px solid #f1f5f9', px: 2, bgcolor: '#f8fafc' }}>
        <Tabs
          value={currentTab}
          onChange={(e, val) => setCurrentTab(val)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 44,
            '& .MuiTab-root': {
              minHeight: 44,
              py: 1,
              px: 2,
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'none',
              color: '#64748b',
              '&.Mui-selected': {
                color: 'primary.main',
              },
            },
          }}
        >
          <Tab label={`All Actions (${totalCount})`} value="all" />
          <Tab
            label={`🚨 Overdue (${overdue.length})`}
            value="overdue"
            sx={{ color: overdue.length > 0 ? '#dc2626 !important' : undefined }}
          />
          <Tab label={`⏰ Follow-ups Today (${todayFollowups.length})`} value="today_followups" />
          <Tab label={`💻 Demos Today (${todayDemos.length})`} value="today_demos" />
          <Tab label={`🚶 Walk-ins Today (${todayWalkIns.length})`} value="today_walkins" />
          <Tab label={`⚡ Other Next Actions (${otherActions.length})`} value="other" />
        </Tabs>
      </Box>

      {/* Action Items List */}
      <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
        {loading ? (
          <Stack spacing={1.5}>
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} variant="rounded" height={76} sx={{ borderRadius: 2 }} />
            ))}
          </Stack>
        ) : displayedItems.length === 0 ? (
          <Box sx={{ py: 5, textAlign: 'center' }}>
            <CheckCircleOutline sx={{ fontSize: 44, color: '#10b981', mb: 1 }} />
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#0f172a' }}>
              All Caught Up!
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {currentTab === 'all'
                ? 'You have no overdue follow-ups or pending actions scheduled for today.'
                : `No actions in the "${currentTab}" category.`}
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {displayedItems.map((item, idx) => {
              const leadId = item._id;
              const contactName = item.primaryContact?.name || '—';
              const contactPhone = item.primaryContact?.phone || '—';
              const previousRemark = item.latestRemark || item.demoDetails?.remarks || item.walkInDetails?.remark;
              const nextAction = getNextAction(item);

              return (
                <Paper
                  key={leadId ? `${leadId}-${idx}` : idx}
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: item.actionCategory === 'overdue' ? '#fca5a5' : '#e2e8f0',
                    bgcolor: item.actionCategory === 'overdue' ? 'rgba(254, 242, 242, 0.4)' : '#ffffff',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: 'primary.main',
                      boxShadow: '0 4px 16px rgba(15, 23, 42, 0.06)',
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: { xs: 'column', md: 'row' },
                      justifyContent: 'space-between',
                      alignItems: { xs: 'flex-start', md: 'center' },
                      gap: 1.5,
                    }}
                  >
                    {/* Left: Organization & Contact Info */}
                    <Box sx={{ minWidth: { md: 240 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                          variant="subtitle1"
                          fontWeight={700}
                          sx={{
                            color: '#0f172a',
                            cursor: 'pointer',
                            '&:hover': { color: 'primary.main' },
                          }}
                          onClick={() => leadId && navigate(`/leads/${leadId}`)}
                        >
                          {item.organizationName || 'Unnamed Lead'}
                        </Typography>
                        {item.leadNumber && (
                          <Chip
                            label={`#${item.leadNumber}`}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: 10,
                              fontWeight: 700,
                              bgcolor: 'rgba(234, 88, 12, 0.08)',
                              color: 'primary.main',
                              border: '1px solid rgba(234, 88, 12, 0.2)',
                            }}
                          />
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ color: '#334155', fontWeight: 500 }}>
                          {contactName}
                        </Typography>
                        {item.primaryContact?.designation && (
                          <Typography variant="caption" sx={{ color: '#64748b' }}>
                            ({item.primaryContact.designation})
                          </Typography>
                        )}
                        <Typography variant="caption" sx={{ color: '#cbd5e1' }}>
                          •
                        </Typography>
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body2" fontWeight={600} sx={{ color: '#0284c7' }}>
                            {contactPhone}
                          </Typography>
                          {contactPhone !== '—' && (
                            <Tooltip title={copiedId === leadId ? 'Copied!' : 'Copy Phone'}>
                              <IconButton
                                size="small"
                                onClick={(e) => onCopyPhone(e, contactPhone, leadId)}
                                sx={{ p: 0.25, color: copiedId === leadId ? 'success.main' : '#94a3b8' }}
                              >
                                {copiedId === leadId ? (
                                  <CheckIcon sx={{ fontSize: 13 }} />
                                ) : (
                                  <ContentCopy sx={{ fontSize: 13 }} />
                                )}
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </Box>
                    </Box>

                    {/* Middle: Badge & Previous Discussion Remarks */}
                    <Box sx={{ flex: 1, px: { md: 2 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
                        {renderBadge(item)}
                        {item.latestDisposition && item.actionCategory !== 'other' && (
                          <Chip
                            label={item.latestDisposition}
                            size="small"
                            variant="outlined"
                            sx={{ height: 22, fontSize: 11, borderColor: '#cbd5e1', color: '#475569' }}
                          />
                        )}
                      </Box>
                      {previousRemark ? (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 0.75,
                            p: 1,
                            bgcolor: '#f8fafc',
                            borderRadius: 1.5,
                            border: '1px dashed #cbd5e1',
                          }}
                        >
                          <ForumOutlined sx={{ fontSize: 15, color: '#64748b', mt: 0.2 }} />
                          <Typography
                            variant="caption"
                            sx={{
                              color: '#334155',
                              fontStyle: 'italic',
                              lineHeight: 1.3,
                            }}
                          >
                            <strong>Previous Note:</strong> "{previousRemark}"
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontStyle: 'italic' }}>
                          No previous discussion notes recorded
                        </Typography>
                      )}
                    </Box>

                    {/* Right: Dynamic Action Buttons */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, alignSelf: { xs: 'flex-end', md: 'center' } }}>
                      <Button
                        variant={nextAction.variant || 'contained'}
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onActionClick) {
                            onActionClick(nextAction.action, item);
                          }
                        }}
                        startIcon={<PhoneInTalk sx={{ fontSize: 16 }} />}
                        sx={{
                          borderRadius: 2,
                          textTransform: 'none',
                          fontWeight: 600,
                          fontSize: 12,
                          px: 2,
                          py: 0.75,
                          bgcolor: nextAction.bgcolor || 'primary.main',
                          color: nextAction.color || '#ffffff',
                          borderColor: nextAction.border,
                          '&:hover': {
                            bgcolor: nextAction.hoverBg || 'primary.dark',
                          },
                        }}
                      >
                        {nextAction.label || 'Take Action'}
                      </Button>
                      <Tooltip title="View Lead Details">
                        <IconButton
                          size="small"
                          onClick={() => leadId && navigate(`/leads/${leadId}`)}
                          sx={{
                            p: 0.75,
                            border: '1px solid #e2e8f0',
                            borderRadius: 2,
                            color: '#64748b',
                            '&:hover': { bgcolor: '#f1f5f9', color: 'primary.main' },
                          }}
                        >
                          <Visibility sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
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
