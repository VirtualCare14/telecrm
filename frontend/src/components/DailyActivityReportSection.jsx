import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, Button, Chip,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Pagination, Tooltip, Stack, Alert, CircularProgress,
  MenuItem, Select, FormControl, InputLabel, InputAdornment, Card, CardContent
} from '@mui/material';
import {
  FileDownload, PictureAsPdf, Refresh, PhoneInTalk,
  Business, CheckCircle, Schedule, Warning, LaptopMac,
  DirectionsWalk, EmojiEvents, Cancel, Search, CalendarMonth,
  Today, AssignmentTurnedIn, EventNote, HourglassEmpty
} from '@mui/icons-material';
import { getDailyActivityReport, downloadDailyActivityExport } from '../services/dashboardService';
import { generateDailyActivityPdf } from '../utils/dailyReportPdf';

// Calculate Yesterday in Asia/Kolkata timezone
function getYesterdayIST() {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [y, m, d] = todayStr.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  const py = prev.getUTCFullYear();
  const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(prev.getUTCDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export default function DailyActivityReportSection() {
  const [selectedDate, setSelectedDate] = useState(() => getYesterdayIST());
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportLoading, setExportLoading] = useState({ xlsx: false, csv: false, pdf: false });

  // Table filtering and pagination states
  const [search, setSearch] = useState('');
  const [dispositionFilter, setDispositionFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchReport = useCallback(async (dateToFetch) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDailyActivityReport({ date: dateToFetch });
      setReportData(data);
      setPage(1);
    } catch (err) {
      console.error('Failed to fetch daily activity report:', err);
      setError(err.response?.data?.message || 'Unable to load daily activity report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(selectedDate);
  }, [selectedDate, fetchReport]);

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
  };

  const handleDownloadExcel = async () => {
    setExportLoading((prev) => ({ ...prev, xlsx: true }));
    try {
      const res = await downloadDailyActivityExport({ date: selectedDate }, 'xlsx');
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `daily_activity_report_${selectedDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export Excel report:', err);
    } finally {
      setExportLoading((prev) => ({ ...prev, xlsx: false }));
    }
  };

  const handleDownloadCsv = async () => {
    setExportLoading((prev) => ({ ...prev, csv: true }));
    try {
      const res = await downloadDailyActivityExport({ date: selectedDate }, 'csv');
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `daily_activity_report_${selectedDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV report:', err);
    } finally {
      setExportLoading((prev) => ({ ...prev, csv: false }));
    }
  };

  const handleDownloadPdf = () => {
    if (!reportData) return;
    setExportLoading((prev) => ({ ...prev, pdf: true }));
    try {
      generateDailyActivityPdf(reportData);
    } catch (err) {
      console.error('Failed to generate PDF report:', err);
    } finally {
      setExportLoading((prev) => ({ ...prev, pdf: false }));
    }
  };

  // Filter hospital-wise rows based on search and disposition
  const filteredRows = useMemo(() => {
    if (!reportData?.hospitalActivity) return [];
    return reportData.hospitalActivity.filter((row) => {
      if (dispositionFilter !== 'ALL' && (row.disposition || '').toLowerCase() !== dispositionFilter.toLowerCase()) {
        return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const matchesHospital = (row.hospitalName || '').toLowerCase().includes(q);
        const matchesPhone = (row.hospitalPhone || '').toLowerCase().includes(q);
        const matchesCaller = (row.callerName || '').toLowerCase().includes(q);
        const matchesRemarks = (row.remarks || '').toLowerCase().includes(q);
        const matchesDisposition = (row.disposition || '').toLowerCase().includes(q);
        if (!matchesHospital && !matchesPhone && !matchesCaller && !matchesRemarks && !matchesDisposition) {
          return false;
        }
      }
      return true;
    });
  }, [reportData, search, dispositionFilter]);

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  // Available unique dispositions for filter dropdown
  const availableDispositions = useMemo(() => {
    if (!reportData?.hospitalActivity) return [];
    const set = new Set(reportData.hospitalActivity.map((r) => r.disposition).filter(Boolean));
    return Array.from(set).sort();
  }, [reportData]);

  const summary = reportData?.summary || {};

  return (
    <Box>
      {/* 1. Header Toolbar with Date Controls and Action Buttons */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Grid container spacing={2} alignItems="center" justifyContent="space-between">
          {/* Left: Date Selection & Shortcuts */}
          <Grid item xs={12} lg={6}>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
              <TextField
                id="daily-report-date-picker"
                type="date"
                size="small"
                label="Report Date (IST)"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 175 }}
              />

              <Button
                variant={selectedDate === getYesterdayIST() ? 'contained' : 'outlined'}
                size="small"
                startIcon={<CalendarMonth />}
                onClick={() => handleDateChange(getYesterdayIST())}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  bgcolor: selectedDate === getYesterdayIST() ? 'primary.main' : 'transparent',
                }}
              >
                Yesterday (Default)
              </Button>

              <Button
                variant={selectedDate === getTodayIST() ? 'contained' : 'outlined'}
                size="small"
                startIcon={<Today />}
                onClick={() => handleDateChange(getTodayIST())}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  bgcolor: selectedDate === getTodayIST() ? 'primary.main' : 'transparent',
                }}
              >
                Today
              </Button>

              <Tooltip title="Reload report data">
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => fetchReport(selectedDate)}
                  disabled={loading}
                  sx={{ minWidth: 38, px: 1, borderRadius: 2 }}
                >
                  <Refresh fontSize="small" />
                </Button>
              </Tooltip>

              <Chip
                label="8:00 AM Ready"
                size="small"
                color="success"
                variant="outlined"
                sx={{ fontWeight: 600, fontSize: 11, height: 24 }}
              />
            </Stack>
          </Grid>

          {/* Right: Export Download Options */}
          <Grid item xs={12} lg={6} sx={{ textAlign: { xs: 'left', lg: 'right' } }}>
            <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', lg: 'flex-end' }} flexWrap="wrap" sx={{ gap: 1 }}>
              <Button
                id="download-daily-excel-btn"
                variant="contained"
                size="small"
                startIcon={exportLoading.xlsx ? <CircularProgress size={16} color="inherit" /> : <FileDownload />}
                onClick={handleDownloadExcel}
                disabled={loading || !reportData || exportLoading.xlsx}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  bgcolor: '#059669',
                  '&:hover': { bgcolor: '#047857' },
                }}
              >
                Download Excel (.xlsx)
              </Button>

              <Button
                id="download-daily-pdf-btn"
                variant="contained"
                size="small"
                startIcon={exportLoading.pdf ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdf />}
                onClick={handleDownloadPdf}
                disabled={loading || !reportData || exportLoading.pdf}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  bgcolor: '#dc2626',
                  '&:hover': { bgcolor: '#b91c1c' },
                }}
              >
                Download PDF
              </Button>

              <Button
                id="download-daily-csv-btn"
                variant="outlined"
                size="small"
                startIcon={exportLoading.csv ? <CircularProgress size={16} color="inherit" /> : <FileDownload />}
                onClick={handleDownloadCsv}
                disabled={loading || !reportData || exportLoading.csv}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                }}
              >
                Download CSV
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && reportData && (
        <>
          {/* 2. Daily Summary KPI Scorecard Grid */}
          <Box sx={{ mb: 3.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                <AssignmentTurnedIn fontSize="small" sx={{ color: 'primary.main' }} />
                Daily Activity Summary ({selectedDate})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Asia/Kolkata Calendar Day • Actual CRM Records
              </Typography>
            </Box>

            <Grid container spacing={1.5}>
              {/* Calls Group */}
              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#f0f9ff' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#0369a1" display="block">
                      TOTAL CALLS
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#0c4a6e" sx={{ mt: 0.5 }}>
                      {summary.totalCalls || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Logged outreach calls
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#f0fdf4' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#047857" display="block">
                      UNIQUE HOSPITALS
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#065f46" sx={{ mt: 0.5 }}>
                      {summary.uniqueHospitalsCalled || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Distinct hospitals contacted
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Follow-ups Group */}
              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#475569" display="block">
                      FOLLOW-UPS DONE
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#1e293b" sx={{ mt: 0.5 }}>
                      {summary.followUpsCompleted || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Follow-ups completed on date
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#fffbeb' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#b45309" display="block">
                      FOLLOW-UPS PENDING
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#92400e" sx={{ mt: 0.5 }}>
                      {summary.followUpsPending || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Scheduled for date, pending
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#fef2f2' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#b91c1c" display="block">
                      FOLLOW-UPS OVERDUE
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#991b1b" sx={{ mt: 0.5 }}>
                      {summary.followUpsOverdue || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Overdue as of date end
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Demos Group */}
              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#faf5ff' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#6b21a8" display="block">
                      DEMOS SCHEDULED
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#581c87" sx={{ mt: 0.5 }}>
                      {summary.demosScheduled || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Fixed demo appointments
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#ecfdf5' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#047857" display="block">
                      DEMOS COMPLETED
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#065f46" sx={{ mt: 0.5 }}>
                      {summary.demosCompleted || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Done with doctors/decision makers
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#fef2f2' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#dc2626" display="block">
                      DEMOS NOT DONE
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#b91c1c" sx={{ mt: 0.5 }}>
                      {summary.demosNotDone || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Cancelled or missed demos
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Walk-ins Group */}
              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#f0fdfa' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#0f766e" display="block">
                      WALK-INS SCHEDULED
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#115e59" sx={{ mt: 0.5 }}>
                      {summary.walkInsScheduled || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Planned in-person meetings
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#ecfdf5' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#047857" display="block">
                      WALK-INS COMPLETED
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#065f46" sx={{ mt: 0.5 }}>
                      {summary.walkInsCompleted || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      On-site visits conducted
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#fef2f2' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#dc2626" display="block">
                      WALK-INS NOT DONE
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#b91c1c" sx={{ mt: 0.5 }}>
                      {summary.walkInsNotCompleted || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Unfulfilled in-person visits
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Won / Lost */}
              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#f0fdf4' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#15803d" display="block">
                      LEADS WON
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#166534" sx={{ mt: 0.5 }}>
                      {summary.leadsWon || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Closed won on actual date
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={4} md={2.4}>
                <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#fef2f2' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="caption" fontWeight={600} color="#b91c1c" display="block">
                      LEADS LOST
                    </Typography>
                    <Typography variant="h5" fontWeight={800} color="#991b1b" sx={{ mt: 0.5 }}>
                      {summary.leadsLost || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      Closed lost on actual date
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>

          {/* 3. Hospital-Wise Detailed Activity Table */}
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              overflow: 'hidden',
              bgcolor: 'background.paper',
            }}
          >
            {/* Table Filters Toolbar */}
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc' }}>
              <Grid container spacing={2} alignItems="center" justifyContent="space-between">
                <Grid item xs={12} sm={6} md={4}>
                  <TextField
                    id="search-hospital-activity-input"
                    fullWidth
                    size="small"
                    placeholder="Search hospital, phone, caller, or remark..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search fontSize="small" color="action" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ bgcolor: '#ffffff', borderRadius: 2 }}
                  />
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small" sx={{ bgcolor: '#ffffff', borderRadius: 2 }}>
                    <InputLabel id="disposition-filter-select-label">Disposition</InputLabel>
                    <Select
                      labelId="disposition-filter-select-label"
                      id="disposition-filter-select"
                      value={dispositionFilter}
                      label="Disposition"
                      onChange={(e) => {
                        setDispositionFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <MenuItem value="ALL">All Dispositions</MenuItem>
                      {availableDispositions.map((disp) => (
                        <MenuItem key={disp} value={disp}>
                          {disp}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={5} sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                  <Typography variant="body2" color="text.secondary">
                    Showing <strong>{filteredRows.length}</strong> individual call records
                    {filteredRows.length !== (reportData?.hospitalActivity?.length || 0) && (
                      <span> (filtered from {reportData?.hospitalActivity?.length})</span>
                    )}
                  </Typography>
                </Grid>
              </Grid>
            </Box>

            {/* Table Data */}
            <TableContainer>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Hospital Name</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Contact Number</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Call Time (IST)</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Caller / Agent</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Disposition</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12, minWidth: 260 }}>Call Remarks / Notes</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Lead Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Next Follow-up</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Demo / Walk-in</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Assigned Agent</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                        No call activity records found matching the selected date and filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedRows.map((row, idx) => (
                      <TableRow key={row.id || idx} hover sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>
                          {(page - 1) * pageSize + idx + 1}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: 13, color: 'text.primary' }}>
                          {row.hospitalName}
                          {row.leadNumber && row.leadNumber !== 'N/A' && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Lead #{row.leadNumber}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>
                          {row.hospitalPhone}
                          {row.contactPerson && row.contactPerson !== 'N/A' && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {row.contactPerson}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {row.callDateTime}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>
                          {row.callerName}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={row.disposition}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: 11,
                              fontWeight: 600,
                              bgcolor:
                                row.disposition === 'Interested' || row.disposition === 'Connected'
                                  ? 'rgba(16, 185, 129, 0.12)'
                                  : row.disposition === 'Not Interested'
                                  ? 'rgba(239, 68, 68, 0.12)'
                                  : 'rgba(2, 132, 199, 0.12)',
                              color:
                                row.disposition === 'Interested' || row.disposition === 'Connected'
                                  ? '#047857'
                                  : row.disposition === 'Not Interested'
                                  ? '#b91c1c'
                                  : '#0369a1',
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, lineHeight: 1.4, color: 'text.primary' }}>
                          {row.remarks}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={row.currentLeadStatus}
                            size="small"
                            color={row.currentLeadStatus === 'WON' ? 'success' : row.currentLeadStatus === 'LOST' ? 'error' : 'default'}
                            variant={row.currentLeadStatus === 'OPEN' ? 'outlined' : 'filled'}
                            sx={{ height: 22, fontSize: 11, fontWeight: 600 }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {row.nextFollowUpDate}
                          {row.followUpStatus !== 'N/A' && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Status: {row.followUpStatus}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {row.demoStatus !== 'N/A' ? (
                            <Typography variant="caption" display="block" color="#581c87" fontWeight={600}>
                              Demo: {row.demoStatus}
                            </Typography>
                          ) : null}
                          {row.walkInStatus !== 'N/A' ? (
                            <Typography variant="caption" display="block" color="#0f766e" fontWeight={600}>
                              Walk-in: {row.walkInStatus}
                            </Typography>
                          ) : null}
                          {row.demoStatus === 'N/A' && row.walkInStatus === 'N/A' ? '—' : null}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>
                          {row.currentAssignedAgent}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={(_, value) => setPage(value)}
                  color="primary"
                  shape="rounded"
                  size="small"
                />
              </Box>
            )}
          </Paper>
        </>
      )}
    </Box>
  );
}
