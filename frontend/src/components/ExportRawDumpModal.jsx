import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  RadioGroup,
  Radio,
  Paper,
  CircularProgress,
  Alert,
  Chip,
  Divider,
} from '@mui/material';

import {
  FileDownload,
  TableChart,
  DescriptionOutlined,
  FilterAltOutlined,
  StorageOutlined,
  CheckCircleOutline,
} from '@mui/icons-material';
import { exportRawDump, triggerFileDownload } from '../services/adminService';

export default function ExportRawDumpModal({ open, onClose, currentFilters = {}, filterCount = 0 }) {
  const [format, setFormat] = useState('xlsx');
  const [scope, setScope] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleDownload = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const params = {
        format,
        scope,
      };

      if (scope === 'filtered') {
        // Forward filter parameters
        if (currentFilters.search) params.search = currentFilters.search;
        if (currentFilters.owner) params.owner = currentFilters.owner;
        if (currentFilters.currentOwner) params.currentOwner = currentFilters.currentOwner;
        if (currentFilters.unassigned) params.unassigned = currentFilters.unassigned;
        if (currentFilters.closureStatus) params.closureStatus = currentFilters.closureStatus;
        if (currentFilters.followUpType) params.followUpType = currentFilters.followUpType;
        if (currentFilters.startDate) params.startDate = currentFilters.startDate;
        if (currentFilters.endDate) params.endDate = currentFilters.endDate;
      }

      const res = await exportRawDump(params);

      // Check if server returned an error in JSON format despite blob responseType
      if (res.data?.type === 'application/json') {
        const text = await res.data.text();
        const json = JSON.parse(text);
        throw new Error(json.message || 'Export failed');
      }

      const contentDisposition = res.headers['content-disposition'] || '';
      const fallbackName = format === 'csv' ? 'telecrm_leads_raw_dump.csv' : 'telecrm_raw_dump.xlsx';
      triggerFileDownload(res.data, fallbackName, contentDisposition);

      setSuccess(`Export downloaded successfully in ${format.toUpperCase()} format!`);
    } catch (err) {
      console.error('Export download error:', err);
      let errorMsg = 'Failed to generate export file. Please try again.';
      if (err.response?.status === 403) {
        errorMsg = 'Forbidden: Only Administrators have permission to download raw database dumps.';
      } else if (err.response?.data?.message) {
        errorMsg = err.response.data.message;
      } else if (err.message) {
        errorMsg = err.message;
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setError(null);
    setSuccess(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle
        sx={{
          bgcolor: 'primary.main',
          color: 'white',
          py: 2.2,
          px: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <FileDownload sx={{ fontSize: 28 }} />
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            Export Raw Dump / All Leads
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>
            Complete CRM hospital leads, calls, follow-ups, demos, walk-ins, and transfer history
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 3, pt: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        {/* Section 1: Scope */}
        <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.secondary', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          1. Select Export Scope
        </Typography>

        <RadioGroup value={scope} onChange={(e) => setScope(e.target.value)}>
          <Paper
            elevation={0}
            onClick={() => setScope('all')}
            sx={{
              p: 1.8,
              mb: 1.2,
              borderRadius: 2,
              border: '2px solid',
              borderColor: scope === 'all' ? 'primary.main' : 'divider',
              bgcolor: scope === 'all' ? 'rgba(234, 88, 12, 0.04)' : 'background.paper',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.5,
            }}
          >
            <Radio checked={scope === 'all'} value="all" sx={{ p: 0.5, mt: 0.2 }} />
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StorageOutlined sx={{ fontSize: 18, color: 'primary.main' }} />
                <Typography variant="body1" fontWeight={700}>
                  All Leads (Complete Database Dump)
                </Typography>
                <Chip label="All Records" size="small" color="primary" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }} />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Exports all 400+ hospital leads and their complete calling, demo, walk-in, and transfer histories without omission.
              </Typography>
            </Box>
          </Paper>

          <Paper
            elevation={0}
            onClick={() => setScope('filtered')}
            sx={{
              p: 1.8,
              mb: 2.5,
              borderRadius: 2,
              border: '2px solid',
              borderColor: scope === 'filtered' ? 'primary.main' : 'divider',
              bgcolor: scope === 'filtered' ? 'rgba(234, 88, 12, 0.04)' : 'background.paper',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.5,
            }}
          >
            <Radio checked={scope === 'filtered'} value="filtered" sx={{ p: 0.5, mt: 0.2 }} />
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FilterAltOutlined sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="body1" fontWeight={700}>
                  Filtered Leads (Current Filters Applied)
                </Typography>
                {filterCount > 0 && (
                  <Chip label={`${filterCount} Active Filters`} size="small" color="secondary" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }} />
                )}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Exports only the leads matching currently applied search terms, owner filters, dates, and closure status.
              </Typography>
            </Box>
          </Paper>
        </RadioGroup>

        <Divider sx={{ my: 2 }} />

        {/* Section 2: Format */}
        <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.secondary', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          2. Select File Format
        </Typography>

        <RadioGroup value={format} onChange={(e) => setFormat(e.target.value)}>
          <Paper
            elevation={0}
            onClick={() => setFormat('xlsx')}
            sx={{
              p: 1.8,
              mb: 1.2,
              borderRadius: 2,
              border: '2px solid',
              borderColor: format === 'xlsx' ? '#107c41' : 'divider',
              bgcolor: format === 'xlsx' ? 'rgba(16, 124, 65, 0.05)' : 'background.paper',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.5,
            }}
          >
            <Radio checked={format === 'xlsx'} value="xlsx" sx={{ p: 0.5, mt: 0.2, color: '#107c41', '&.Mui-checked': { color: '#107c41' } }} />
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <TableChart sx={{ fontSize: 18, color: '#107c41' }} />
                <Typography variant="body1" fontWeight={700} sx={{ color: '#0b582e' }}>
                  Excel (.xlsx) - Multi-sheet Workbook
                </Typography>
                <Chip label="Recommended" size="small" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600, bgcolor: '#107c41', color: 'white' }} />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Includes 6 dedicated sheets: <strong>Leads</strong> (master sheet, 1 row per hospital), <strong>Call History</strong>, <strong>Follow-ups</strong>, <strong>Demos</strong>, <strong>Walk-ins</strong>, and <strong>Transfer History</strong>.
              </Typography>
            </Box>
          </Paper>

          <Paper
            elevation={0}
            onClick={() => setFormat('csv')}
            sx={{
              p: 1.8,
              borderRadius: 2,
              border: '2px solid',
              borderColor: format === 'csv' ? '#0284c7' : 'divider',
              bgcolor: format === 'csv' ? 'rgba(2, 132, 199, 0.05)' : 'background.paper',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.5,
            }}
          >
            <Radio checked={format === 'csv'} value="csv" sx={{ p: 0.5, mt: 0.2, color: '#0284c7', '&.Mui-checked': { color: '#0284c7' } }} />
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DescriptionOutlined sx={{ fontSize: 18, color: '#0284c7' }} />
                <Typography variant="body1" fontWeight={700} sx={{ color: '#0369a1' }}>
                  CSV (.csv) - Master Leads File
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Single RFC-4180 UTF-8 CSV spreadsheet containing all hospital info, activity counts, latest status, and transfer summaries.
              </Typography>
            </Box>
          </Paper>
        </RadioGroup>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 1, bgcolor: 'background.default', borderTop: '1px solid', borderColor: 'divider', gap: 1.5 }}>
        <Button
          variant="outlined"
          onClick={handleClose}
          disabled={loading}
          sx={{ borderRadius: 2, textTransform: 'none', px: 2.5 }}
        >
          Close
        </Button>
        <Button
          variant="contained"
          onClick={handleDownload}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <FileDownload />}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            px: 3,
            fontWeight: 700,
            bgcolor: format === 'xlsx' ? '#107c41' : 'primary.main',
            '&:hover': {
              bgcolor: format === 'xlsx' ? '#0b582e' : 'primary.dark',
            },
          }}
        >
          {loading ? 'Generating Export...' : `Download ${format.toUpperCase()}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
