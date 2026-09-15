import React from 'react';
import {
  Table, TableHead, TableRow, TableCell, TableBody,
  Chip, Box, Typography, Skeleton, TableContainer, Avatar
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

// Workload imbalance indicator helper:
// - 0 leads -> Neutral
// - High assigned leads compared with other agents -> High Workload
// - Normal workload -> no warning
const getWorkloadStatus = (agent, allAgents) => {
  const assigned = agent.assignedLeads ?? 0;
  if (assigned === 0) return 'neutral';
  if (!allAgents || allAgents.length <= 1) return 'normal';

  const totalAssigned = allAgents.reduce((sum, a) => sum + (a.assignedLeads ?? 0), 0);
  const avgAssigned = totalAssigned / allAgents.length;

  if (assigned >= 10 && assigned >= 1.5 * avgAssigned) {
    return 'high';
  }

  return 'normal';
};

export default function AgentPerformanceTable({ agents = [], allAgents = agents, loading = false }) {
  const navigate = useNavigate();

  const totalAssigned = allAgents.reduce((sum, a) => sum + (a.assignedLeads ?? 0), 0);

  if (loading) {
    return (
      <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
        <Table sx={{ minWidth: 750 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>Agent Name</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 170 }}>Assigned Leads</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 110 }}>Workload %</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>Won Leads</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>Lost Leads</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>Upcoming Follow-ups</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>Overdue Follow-ups</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>Conversion Rate</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...Array(4)].map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Skeleton variant="circular" width={32} height={32} />
                    <Skeleton width={120} height={20} />
                  </Box>
                </TableCell>
                <TableCell align="center"><Skeleton width={60} sx={{ mx: 'auto' }} /></TableCell>
                <TableCell align="center"><Skeleton width={45} sx={{ mx: 'auto' }} /></TableCell>
                <TableCell align="center"><Skeleton width={40} sx={{ mx: 'auto' }} /></TableCell>
                <TableCell align="center"><Skeleton width={40} sx={{ mx: 'auto' }} /></TableCell>
                <TableCell align="center"><Skeleton width={40} sx={{ mx: 'auto' }} /></TableCell>
                <TableCell align="center"><Skeleton width={40} sx={{ mx: 'auto' }} /></TableCell>
                <TableCell align="center"><Skeleton width={50} sx={{ mx: 'auto' }} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  return (
    <TableContainer
      sx={{
        width: '100%',
        overflowX: 'auto',
        '&::-webkit-scrollbar': {
          height: 8,
        },
        '&::-webkit-scrollbar-track': {
          bgcolor: 'background.paper',
        },
        '&::-webkit-scrollbar-thumb': {
          bgcolor: '#cbd5e1',
          borderRadius: 4,
          '&:hover': {
            bgcolor: '#94a3b8',
          },
        },
      }}
    >
      <Table sx={{ minWidth: 750 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 180 }}>
              Agent Name
            </TableCell>
            <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 170 }}>
              Assigned Leads
            </TableCell>
            <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 110 }}>
              Workload %
            </TableCell>
            <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 100 }}>
              Won Leads
            </TableCell>
            <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 100 }}>
              Lost Leads
            </TableCell>
            <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 150 }}>
              Upcoming Follow-ups
            </TableCell>
            <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 140 }}>
              Overdue Follow-ups
            </TableCell>
            <TableCell align="center" sx={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', minWidth: 120 }}>
              Conversion Rate
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {agents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                <Typography color="text.secondary" variant="body2">
                  No agents found.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            agents.map((agent) => {
              const assigned = agent.assignedLeads ?? 0;
              const workloadPct = totalAssigned > 0 ? (assigned / totalAssigned) * 100 : 0;
              const formattedWorkload = assigned === 0 ? '0%' : `${workloadPct.toFixed(1)}%`;
              const won = agent.wonLeads ?? 0;
              const lost = agent.lostLeads ?? 0;
              const closed = won + lost;
              const calcConvRate = closed > 0 ? ((won / closed) * 100).toFixed(1) + '%' : '0.0%';
              const conversionRateDisplay = agent.conversionRate ?? calcConvRate;
              const convRate = parseFloat(conversionRateDisplay);
              const upcoming = agent.upcomingFollowUps ?? 0;
              const overdue = agent.overdueFollowUps ?? 0;
              const workloadStatus = getWorkloadStatus(agent, allAgents);

              return (
                <TableRow
                  key={agent._id}
                  hover
                  onClick={() => navigate(`/leads?owner=${agent._id}`)}
                  sx={{
                    cursor: 'pointer',
                    '&:hover': {
                      bgcolor: 'rgba(234, 88, 12, 0.04)',
                    },
                  }}
                >
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar
                        sx={{
                          width: 32,
                          height: 32,
                          bgcolor: 'primary.main',
                          fontSize: 14,
                          flexShrink: 0,
                        }}
                      >
                        {agent.fullName?.charAt(0)?.toUpperCase() || agent.username?.charAt(0)?.toUpperCase() || 'A'}
                      </Avatar>
                      <Box>
                        <Typography fontWeight={500} fontSize={13} color="text.primary">
                          {agent.fullName || agent.username}
                        </Typography>
                        {agent.fullName && agent.username && agent.fullName !== agent.username && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            @{agent.username}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                      <Typography
                        fontWeight={workloadStatus === 'high' ? 700 : 600}
                        fontSize={13}
                        sx={{
                          color: workloadStatus === 'high' ? '#f59e0b' : (assigned === 0 ? 'text.secondary' : 'text.primary')
                        }}
                      >
                        {assigned}
                      </Typography>
                      {workloadStatus === 'neutral' && (
                        <Chip
                          label="Neutral"
                          size="small"
                          variant="outlined"
                          sx={{
                            height: 20,
                            fontSize: 11,
                            fontWeight: 500,
                            borderRadius: 1.5,
                            color: 'text.secondary',
                            borderColor: 'rgba(148, 163, 184, 0.25)',
                          }}
                        />
                      )}
                      {workloadStatus === 'high' && (
                        <Chip
                          label="High Workload"
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: 11,
                            fontWeight: 600,
                            borderRadius: 1.5,
                            bgcolor: 'rgba(245, 158, 11, 0.15)',
                            color: '#f59e0b',
                            border: '1px solid rgba(245, 158, 11, 0.35)',
                          }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Typography
                      fontWeight={600}
                      fontSize={13}
                      sx={{
                        color: workloadStatus === 'high' ? '#f59e0b' : (assigned === 0 ? 'text.secondary' : 'text.primary')
                      }}
                    >
                      {formattedWorkload}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={won}
                      size="small"
                      color={won > 0 ? 'success' : 'default'}
                      variant={won > 0 ? 'filled' : 'outlined'}
                      sx={{ minWidth: 32, height: 22, fontSize: 12, fontWeight: 600, borderRadius: 1.5 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={lost}
                      size="small"
                      color={lost > 0 ? 'error' : 'default'}
                      variant={lost > 0 ? 'filled' : 'outlined'}
                      sx={{ minWidth: 32, height: 22, fontSize: 12, fontWeight: 600, borderRadius: 1.5 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={upcoming}
                      size="small"
                      color={upcoming > 0 ? 'primary' : 'default'}
                      variant={upcoming > 0 ? 'filled' : 'outlined'}
                      sx={{ minWidth: 32, height: 22, fontSize: 12, fontWeight: 600, borderRadius: 1.5 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={overdue}
                      size="small"
                      color={overdue > 0 ? 'error' : 'default'}
                      variant={overdue > 0 ? 'filled' : 'outlined'}
                      sx={{ minWidth: 32, height: 22, fontSize: 12, fontWeight: 600, borderRadius: 1.5 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Typography
                      fontWeight={600}
                      fontSize={13}
                      color={convRate > 0 ? 'success.main' : 'text.secondary'}
                    >
                      {conversionRateDisplay}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
