import React from 'react';
import {
  Table, TableHead, TableRow, TableCell, TableBody,
  Chip, Box, Typography, Skeleton, TableContainer, Paper
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { formatDateTime } from '../utils/dateHelpers';

export default function LeadTable({ leads, loading }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Table>
          <TableHead>
            <TableRow>
              {['Lead #', 'Organization', 'Primary Contact', 'Phone', 'Source', 'Latest Disposition', 'Follow-up', 'Owner', 'Status'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 600 }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(9)].map((_, j) => (
                  <TableCell key={j}><Skeleton /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  return (
    <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Lead #</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Organization</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Primary Contact</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Phone</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Source</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Latest Disposition</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Follow-up</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Owner</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {leads.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                <Typography color="text.secondary">No leads found</Typography>
              </TableCell>
            </TableRow>
          ) : leads.map((l) => {
            const isOverdue = l.nextFollowUpAt && l.closureStatus === 'OPEN' && new Date(l.nextFollowUpAt) < new Date();
            const isClosed = l.closureStatus !== 'OPEN';
            return (
              <TableRow
                key={l._id}
                hover
                sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' } }}
                onClick={() => navigate(`/leads/${l._id}`)}
              >
                <TableCell>
                  <Typography fontWeight={600} fontSize={13}>
                    {l.leadNumber}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography fontWeight={500} fontSize={13}>
                    {l.organizationName}
                  </Typography>
                </TableCell>
                <TableCell sx={{ fontSize: 13 }}>{l.primaryContact?.name || '—'}</TableCell>
                <TableCell sx={{ fontSize: 13 }}>{l.primaryContact?.phone || '—'}</TableCell>
                <TableCell>
                  <Chip label={l.leadSource} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: 13 }}>{l.latestDisposition || '—'}</Typography>
                </TableCell>
                <TableCell>
                  {l.nextFollowUpAt ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography sx={{ fontSize: 12 }} color={isOverdue ? 'error' : 'text.secondary'}>
                        {formatDateTime(l.nextFollowUpAt)}
                      </Typography>
                      {isOverdue && <Chip label="Overdue" size="small" color="error" sx={{ height: 20, fontSize: 10 }} />}
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: 12 }} color="text.secondary">—</Typography>
                  )}
                </TableCell>
                <TableCell sx={{ fontSize: 13 }}>{l.currentOwner?.fullName || l.currentOwner?.username || '—'}</TableCell>
                <TableCell>
                  {isClosed ? (
                    <Chip
                      label={l.closureStatus}
                      size="small"
                      color={l.closureStatus === 'WON' ? 'success' : 'error'}
                      sx={{ height: 22, fontSize: 11, fontWeight: 600 }}
                    />
                  ) : (
                    <Chip label="Open" size="small" variant="outlined" sx={{ height: 22, fontSize: 11 }} />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}