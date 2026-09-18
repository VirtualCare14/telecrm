import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, IconButton, Alert, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Chip, CircularProgress, LinearProgress,
  FormControl, InputLabel, Select, MenuItem, Tooltip,
  Tabs, Tab, Badge, Divider
} from '@mui/material';
import {
  Close, CloudUpload, FileDownload, CheckCircle,
  ErrorOutline, Warning, Refresh, Check, Description,
  Business, ArrowForward, InsertDriveFile
} from '@mui/icons-material';
import { createLead } from '../services/leadsService';
import { getActiveAgents } from '../services/agentService';
import { useAuthStore } from '../store/authStore';
import {
  parseExcelFile,
  downloadExcelTemplate,
  EXCEL_COLUMNS
} from '../utils/excelImportHelper';

export default function ImportLeadsModal({ open, onClose, onSuccess }) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN' || (user?.agentRole && user.agentRole.toLowerCase() === 'admin');

  const [step, setStep] = useState('upload'); // 'upload' | 'preview' | 'importing' | 'completed'
  const [file, setFile] = useState(null);
  const [parsedResult, setParsedResult] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [parsing, setParsing] = useState(false);

  // Tab filter in preview: 'all' | 'valid' | 'invalid'
  const [previewTab, setPreviewTab] = useState('all');

  // Admin assignment
  const [selectedAgent, setSelectedAgent] = useState('');
  const [agents, setAgents] = useState([]);

  // Import execution state
  const [importProgress, setImportProgress] = useState(0);
  const [importCurrentIndex, setImportCurrentIndex] = useState(0);
  const [importSuccessCount, setImportSuccessCount] = useState(0);
  const [importFailCount, setImportFailCount] = useState(0);
  const [importErrors, setImportErrors] = useState([]);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open && isAdmin) {
      getActiveAgents().then(setAgents).catch(() => {});
    }
  }, [open, isAdmin]);

  // Reset state when modal opens/closes
  const handleReset = () => {
    setStep('upload');
    setFile(null);
    setParsedResult(null);
    setParseError(null);
    setParsing(false);
    setPreviewTab('all');
    setSelectedAgent('');
    setImportProgress(0);
    setImportCurrentIndex(0);
    setImportSuccessCount(0);
    setImportFailCount(0);
    setImportErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleFileChange = async (selectedFile) => {
    if (!selectedFile) return;

    // Check extension
    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setParseError('Invalid file type. Please upload a standard Excel file (.xlsx or .xls).');
      return;
    }

    setFile(selectedFile);
    setParseError(null);
    setParsing(true);

    try {
      const result = await parseExcelFile(selectedFile);
      setParsedResult(result);
      setStep('preview');
    } catch (err) {
      setParseError(err.message || 'Failed to read Excel file. Please ensure it has valid columns.');
      setFile(null);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleStartImport = async () => {
    if (!parsedResult || !parsedResult.rows) return;

    const validRows = parsedResult.rows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setStep('importing');
    setImportProgress(0);
    setImportCurrentIndex(0);
    setImportSuccessCount(0);
    setImportFailCount(0);
    setImportErrors([]);

    let success = 0;
    let failed = 0;
    const errorsList = [];

    for (let i = 0; i < validRows.length; i++) {
      const rowItem = validRows[i];
      setImportCurrentIndex(i + 1);
      setImportProgress(Math.round(((i + 1) / validRows.length) * 100));

      try {
        const payload = {
          ...rowItem.payload,
          ...(isAdmin && selectedAgent ? { currentOwner: selectedAgent } : {}),
        };
        await createLead(payload);
        success++;
        setImportSuccessCount(success);
      } catch (err) {
        failed++;
        setImportFailCount(failed);
        const errMsg = err.response?.data?.message || err.message || 'Failed to create lead';
        errorsList.push({
          rowNumber: rowItem.rowNumber,
          orgName: rowItem.display.organizationName,
          error: errMsg,
        });
        setImportErrors([...errorsList]);
      }
    }

    setStep('completed');
    if (onSuccess) {
      onSuccess({ successCount: success, failCount: failed });
    }
  };

  // Filter rows for preview
  const displayedRows = (parsedResult?.rows || []).filter((r) => {
    if (previewTab === 'valid') return r.isValid;
    if (previewTab === 'invalid') return !r.isValid;
    return true;
  });

  return (
    <Dialog
      open={open}
      onClose={step === 'importing' ? undefined : handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          overflow: 'hidden',
          maxHeight: '90vh',
        }
      }}
    >
      {/* Dialog Header */}
      <DialogTitle sx={{ 
        p: 2.5, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        bgcolor: '#ffffff',
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 42,
            height: 42,
            borderRadius: 2,
            bgcolor: 'rgba(16, 124, 65, 0.1)',
            color: '#107c41',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(16, 124, 65, 0.15)'
          }}>
            <InsertDriveFile sx={{ fontSize: 24 }} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }}>
              Import Leads from Excel
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Upload .xlsx or .xls spreadsheets to batch create leads with standard fields
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownload sx={{ color: '#107c41' }} />}
            onClick={downloadExcelTemplate}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              borderColor: '#107c41',
              color: '#107c41',
              fontWeight: 600,
              fontSize: '0.8rem',
              '&:hover': {
                borderColor: '#0b582e',
                bgcolor: 'rgba(16, 124, 65, 0.05)'
              }
            }}
          >
            Download Excel Template
          </Button>

          {step !== 'importing' && (
            <IconButton onClick={handleClose} size="small" sx={{ color: 'text.secondary' }}>
              <Close />
            </IconButton>
          )}
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 3, bgcolor: 'background.default' }}>
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".xlsx, .xls"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileChange(e.target.files[0]);
            }
          }}
        />

        {/* STEP 1: UPLOAD AREA */}
        {step === 'upload' && (
          <Box>
            {parseError && (
              <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setParseError(null)}>
                {parseError}
              </Alert>
            )}

            {/* Drag and drop upload zone */}
            <Paper
              elevation={0}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                p: 5,
                border: '2px dashed',
                borderColor: parsing ? 'primary.main' : '#cbd5e1',
                borderRadius: 3,
                bgcolor: '#ffffff',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'rgba(234, 88, 12, 0.02)',
                  transform: 'scale(1.005)'
                }
              }}
            >
              {parsing ? (
                <Box sx={{ py: 3 }}>
                  <CircularProgress size={44} sx={{ color: 'primary.main', mb: 2 }} />
                  <Typography variant="subtitle1" fontWeight={600}>
                    Reading and validating Excel file...
                  </Typography>
                </Box>
              ) : (
                <Box>
                  <Box sx={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    bgcolor: 'rgba(16, 124, 65, 0.08)',
                    color: '#107c41',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 2,
                    boxShadow: '0 4px 16px rgba(16, 124, 65, 0.12)'
                  }}>
                    <CloudUpload sx={{ fontSize: 36 }} />
                  </Box>
                  <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5, color: 'text.primary' }}>
                    Click or drag & drop your Excel file here
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
                    Supports <strong>.xlsx</strong> and <strong>.xls</strong> formats. 1 row = 1 lead.
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<CloudUpload />}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    sx={{
                      borderRadius: 2,
                      textTransform: 'none',
                      px: 3,
                      boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
                    }}
                  >
                    Select Excel File
                  </Button>
                </Box>
              )}
            </Paper>

            {/* Standard Columns Checklist */}
            <Paper elevation={0} sx={{ p: 2.5, mt: 3, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: '#ffffff' }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, color: 'text.primary' }}>
                Standard Excel Columns Expected:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {EXCEL_COLUMNS.map((col, idx) => (
                  <Chip
                    key={idx}
                    label={col}
                    size="small"
                    color={['Organization Name', 'Contact Person', 'Phone Number', 'Lead Source'].includes(col) ? 'primary' : 'default'}
                    variant={['Organization Name', 'Contact Person', 'Phone Number', 'Lead Source'].includes(col) ? 'filled' : 'outlined'}
                    sx={{ fontWeight: 600, fontSize: '0.75rem', borderRadius: 1.5 }}
                  />
                ))}
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.5 }}>
                * <strong>Organization Name</strong>, <strong>Contact Person</strong>, <strong>Phone Number</strong>, and <strong>Lead Source</strong> (Google, Referral, Other) are required. If Lead Source is <em>Other</em>, <strong>Please Specify Source</strong> is required.
              </Typography>
            </Paper>
          </Box>
        )}

        {/* STEP 2: PREVIEW & VALIDATION TABLE */}
        {step === 'preview' && parsedResult && (
          <Box>
            {/* Summary KPI Pills */}
            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              <Grid item xs={12} sm={4}>
                <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: '#ffffff' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>Total Rows Found</Typography>
                  <Typography variant="h5" fontWeight={700} color="text.primary">{parsedResult.totalRows}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'rgba(16, 185, 129, 0.3)', bgcolor: 'rgba(16, 185, 129, 0.06)' }}>
                  <Typography variant="caption" color="#059669" fontWeight={600}>Valid Rows (Ready to Import)</Typography>
                  <Typography variant="h5" fontWeight={700} color="#059669">{parsedResult.validCount}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: parsedResult.invalidCount > 0 ? 'rgba(239, 68, 68, 0.3)' : 'divider', bgcolor: parsedResult.invalidCount > 0 ? 'rgba(239, 68, 68, 0.06)' : '#ffffff' }}>
                  <Typography variant="caption" color={parsedResult.invalidCount > 0 ? '#dc2626' : 'text.secondary'} fontWeight={600}>
                    Invalid Rows (Errors)
                  </Typography>
                  <Typography variant="h5" fontWeight={700} color={parsedResult.invalidCount > 0 ? '#dc2626' : 'text.secondary'}>
                    {parsedResult.invalidCount}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            {/* Admin Assignment Option */}
            {isAdmin && (
              <Paper elevation={0} sx={{ p: 2, mb: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: '#ffffff', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ minWidth: 160 }}>
                  Assign Imported Leads:
                </Typography>
                <FormControl size="small" sx={{ minWidth: 260 }}>
                  <InputLabel>Assign to Agent</InputLabel>
                  <Select
                    value={selectedAgent}
                    label="Assign to Agent"
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value=""><em>Assign to me (Admin)</em></MenuItem>
                    {agents.map((a) => (
                      <MenuItem key={a._id} value={a._id}>{a.fullName || a.username}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Paper>
            )}

            {/* Table Navigation Tabs */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
              <Tabs
                value={previewTab}
                onChange={(_, val) => setPreviewTab(val)}
                sx={{
                  minHeight: 36,
                  '& .MuiTab-root': {
                    minHeight: 36,
                    py: 0.5,
                    px: 2,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    borderRadius: 1.5,
                    mr: 1
                  }
                }}
              >
                <Tab label={`All Rows (${parsedResult.totalRows})`} value="all" />
                <Tab label={`Valid Only (${parsedResult.validCount})`} value="valid" />
                <Tab label={`Invalid Only (${parsedResult.invalidCount})`} value="invalid" />
              </Tabs>

              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                File: <strong>{file?.name}</strong> • Showing {displayedRows.length} rows
              </Typography>
            </Box>

            {/* Scrollable Preview Table */}
            <TableContainer component={Paper} elevation={0} sx={{ maxHeight: 380, borderRadius: 2.5, border: '1px solid', borderColor: 'divider' }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: 60 }}>Row</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 90 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Organization Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Contact Person</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Phone Number</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Lead Source</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Remarks</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Validation Issues</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No rows match the selected filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayedRows.map((row) => (
                      <TableRow
                        key={row.rowNumber}
                        sx={{
                          bgcolor: row.isValid ? 'inherit' : 'rgba(239, 68, 68, 0.04)',
                          '&:hover': { bgcolor: 'action.hover' }
                        }}
                      >
                        <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>
                          #{row.rowNumber}
                        </TableCell>
                        <TableCell>
                          {row.isValid ? (
                            <Chip
                              icon={<CheckCircle sx={{ fontSize: '14px !important' }} />}
                              label="Valid"
                              size="small"
                              sx={{
                                height: 22,
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                bgcolor: 'rgba(16, 185, 129, 0.12)',
                                color: '#059669',
                                border: '1px solid rgba(16, 185, 129, 0.3)'
                              }}
                            />
                          ) : (
                            <Chip
                              icon={<ErrorOutline sx={{ fontSize: '14px !important' }} />}
                              label="Invalid"
                              size="small"
                              sx={{
                                height: 22,
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                bgcolor: 'rgba(239, 68, 68, 0.12)',
                                color: '#dc2626',
                                border: '1px solid rgba(239, 68, 68, 0.3)'
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          {row.display.organizationName || <span style={{ color: '#ef4444' }}>Missing</span>}
                        </TableCell>
                        <TableCell>
                          {row.display.contactPerson || <span style={{ color: '#ef4444' }}>Missing</span>}
                        </TableCell>
                        <TableCell>
                          {row.display.phone || <span style={{ color: '#ef4444' }}>Missing</span>}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>
                          {row.display.email || '—'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={row.display.finalLeadSource || row.display.leadSource || 'Missing'}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'text.secondary' }}>
                          {row.display.remarks || '—'}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 220 }}>
                          {row.errors.length > 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {row.errors.map((err, i) => (
                                <Typography key={i} variant="caption" sx={{ color: '#dc2626', fontWeight: 600, fontSize: '0.7rem' }}>
                                  • {err}
                                </Typography>
                              ))}
                            </Box>
                          ) : (
                            <Typography variant="caption" sx={{ color: '#059669', fontWeight: 600 }}>
                              Ready
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* STEP 3: IMPORTING PROGRESS */}
        {step === 'importing' && (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <CircularProgress size={54} sx={{ color: 'primary.main', mb: 3 }} />
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              Importing Leads...
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Processing lead {importCurrentIndex} of {parsedResult?.validCount}...
            </Typography>
            <Box sx={{ width: '60%', mx: 'auto', mb: 1 }}>
              <LinearProgress variant="determinate" value={importProgress} sx={{ height: 8, borderRadius: 4 }} />
            </Box>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              {importProgress}% completed
            </Typography>
          </Box>
        )}

        {/* STEP 4: IMPORT COMPLETED RESULTS */}
        {step === 'completed' && (
          <Box sx={{ py: 3 }}>
            <Paper elevation={0} sx={{ p: 4, textAlign: 'center', borderRadius: 3, border: '1px solid', borderColor: 'rgba(16, 185, 129, 0.3)', bgcolor: 'rgba(16, 185, 129, 0.05)', mb: 3 }}>
              <CheckCircle sx={{ fontSize: 56, color: '#059669', mb: 1.5 }} />
              <Typography variant="h5" fontWeight={700} sx={{ color: '#059669', mb: 1 }}>
                Import Completed!
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.primary', mb: 2 }}>
                Successfully created <strong>{importSuccessCount}</strong> lead{importSuccessCount === 1 ? '' : 's'}.
              </Typography>

              {importFailCount > 0 && (
                <Alert severity="warning" sx={{ mt: 2, textAlign: 'left', borderRadius: 2 }}>
                  <strong>{importFailCount}</strong> lead{importFailCount === 1 ? '' : 's'} failed during server creation.
                  {importErrors.map((err, i) => (
                    <Typography key={i} variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                      • Row #{err.rowNumber} ({err.orgName}): {err.error}
                    </Typography>
                  ))}
                </Alert>
              )}
            </Paper>
          </Box>
        )}
      </DialogContent>

      {/* Dialog Footer Actions */}
      <DialogActions sx={{ p: 2.5, bgcolor: '#ffffff', borderTop: '1px solid', borderColor: 'divider', justifyContent: 'space-between' }}>
        {step === 'upload' && (
          <>
            <Button onClick={handleClose} sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => fileInputRef.current?.click()}
              sx={{ borderRadius: 2, textTransform: 'none', px: 3 }}
            >
              Choose File
            </Button>
          </>
        )}

        {step === 'preview' && (
          <>
            <Button
              startIcon={<Refresh />}
              onClick={handleReset}
              sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}
            >
              Change File
            </Button>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button onClick={handleClose} sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}>
                Cancel
              </Button>
              <Button
                variant="contained"
                startIcon={<Check />}
                disabled={!parsedResult || parsedResult.validCount === 0}
                onClick={handleStartImport}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  px: 3.5,
                  boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
                }}
              >
                Import {parsedResult?.validCount || 0} Valid Lead{parsedResult?.validCount === 1 ? '' : 's'}
              </Button>
            </Box>
          </>
        )}

        {step === 'completed' && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: 1.5 }}>
            <Button
              variant="outlined"
              onClick={handleReset}
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              Import Another File
            </Button>
            <Button
              variant="contained"
              onClick={handleClose}
              sx={{ borderRadius: 2, textTransform: 'none', px: 3 }}
            >
              Done / View Leads
            </Button>
          </Box>
        )}
      </DialogActions>
    </Dialog>
  );
}
