import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Box,
  TextField,
  Popover,
  Typography,
  IconButton,
  Button,
  Grid,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
} from '@mui/material';
import {
  CalendarToday,
  ChevronLeft,
  ChevronRight,
  Close,
} from '@mui/icons-material';
import {
  normalizeDateToYYYYMMDD,
  formatYYYYMMDDToMMDDYYYY,
  parseMMDDYYYYToYYYYMMDD,
} from '../utils/dateHelpers';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Get today's YYYY-MM-DD in Asia/Kolkata timezone
 */
function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Modern, reusable calendar date picker with OrangeVC styling.
 * Displays date in MM/DD/YYYY format while supporting standard YYYY-MM-DD
 * value contracts for API compatibility and zero timezone drift.
 */
export default function CalendarDatePicker({
  value,
  onChange,
  label,
  placeholder = 'MM/DD/YYYY',
  required = false,
  disabled = false,
  error = false,
  helperText,
  size = 'small',
  fullWidth = true,
  name,
  id,
  min,
  max,
  allowClear = true,
  inputProps = {},
  InputLabelProps = {},
  sx = {},
  ...props
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  // Normalize incoming value to YYYY-MM-DD string
  const normalizedYMD = useMemo(() => normalizeDateToYYYYMMDD(value), [value]);

  // Display value in MM/DD/YYYY format
  const displayValue = useMemo(() => {
    return normalizedYMD ? formatYYYYMMDDToMMDDYYYY(normalizedYMD) : '';
  }, [normalizedYMD]);

  // Controlled input value for seamless typing and display
  const [inputValue, setInputValue] = useState(displayValue);

  useEffect(() => {
    setInputValue(displayValue);
  }, [displayValue]);

  // Calendar view state (year and month 0-11)
  const [viewYear, setViewYear] = useState(() => {
    if (normalizedYMD) {
      const [y] = normalizedYMD.split('-').map(Number);
      if (y) return y;
    }
    const [todayY] = getTodayIST().split('-').map(Number);
    return todayY || new Date().getFullYear();
  });

  const [viewMonth, setViewMonth] = useState(() => {
    if (normalizedYMD) {
      const [, m] = normalizedYMD.split('-').map(Number);
      if (m) return m - 1;
    }
    const [, todayM] = getTodayIST().split('-').map(Number);
    return (todayM ? todayM - 1 : new Date().getMonth());
  });

  // When opening or when value changes, sync the calendar view to the value or today
  useEffect(() => {
    if (normalizedYMD) {
      const [y, m] = normalizedYMD.split('-').map(Number);
      if (y && m) {
        setViewYear(y);
        setViewMonth(m - 1);
      }
    }
  }, [normalizedYMD]);

  const handleOpen = (e) => {
    if (disabled) return;
    setAnchorEl(e.currentTarget);
    // Sync view to current value if available, else today
    if (normalizedYMD) {
      const [y, m] = normalizedYMD.split('-').map(Number);
      if (y && m) {
        setViewYear(y);
        setViewMonth(m - 1);
      }
    } else {
      const [todayY, todayM] = getTodayIST().split('-').map(Number);
      setViewYear(todayY);
      setViewMonth(todayM - 1);
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const emitChange = (newYMD) => {
    if (!onChange) return;
    const formatted = newYMD ? formatYYYYMMDDToMMDDYYYY(newYMD) : '';
    const syntheticEvent = {
      target: {
        name,
        id,
        value: newYMD,
        formattedValue: formatted,
      },
      currentTarget: {
        name,
        id,
        value: newYMD,
        formattedValue: formatted,
      },
      value: newYMD,
      formattedValue: formatted,
    };
    onChange(syntheticEvent, newYMD);
  };

  const handleSelectDate = (ymd) => {
    emitChange(ymd);
    setInputValue(formatYYYYMMDDToMMDDYYYY(ymd));
    handleClose();
  };

  const handleClear = (e) => {
    e?.stopPropagation();
    emitChange('');
    setInputValue('');
    handleClose();
  };

  const handleSelectToday = () => {
    const today = getTodayIST();
    emitChange(today);
    setInputValue(formatYYYYMMDDToMMDDYYYY(today));
    handleClose();
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Min and Max normalization
  const effectiveMin = useMemo(() => {
    const m = min || inputProps?.min;
    return m ? normalizeDateToYYYYMMDD(m) : null;
  }, [min, inputProps?.min]);

  const effectiveMax = useMemo(() => {
    const m = max || inputProps?.max;
    return m ? normalizeDateToYYYYMMDD(m) : null;
  }, [max, inputProps?.max]);

  const isDateDisabled = (ymd) => {
    if (effectiveMin && ymd < effectiveMin) return true;
    if (effectiveMax && ymd > effectiveMax) return true;
    return false;
  };

  const handleInputChange = (e) => {
    const rawVal = e.target.value;
    setInputValue(rawVal);

    if (!rawVal.trim()) {
      emitChange('');
      return;
    }

    // Attempt normalization
    const ymd = normalizeDateToYYYYMMDD(rawVal);
    if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      const [y, m, d] = ymd.split('-').map(Number);
      if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        if (!isDateDisabled(ymd)) {
          setViewYear(y);
          setViewMonth(m - 1);
          emitChange(ymd);
        }
      }
    }
  };

  const handleBlur = () => {
    // On blur, revert to formatted display value if incomplete or invalid
    if (normalizedYMD) {
      setInputValue(formatYYYYMMDDToMMDDYYYY(normalizedYMD));
    } else {
      setInputValue('');
    }
  };

  // Build calendar matrix (42 slots: 6 rows x 7 days)
  const calendarDays = useMemo(() => {
    const days = [];
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const pad = (n) => String(n).padStart(2, '0');

    // Previous month trailing days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 12 : viewMonth;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const ymd = `${prevY}-${pad(prevM)}-${pad(dayNum)}`;
      days.push({
        dayNum,
        ymd,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const ymd = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
      days.push({
        dayNum: d,
        ymd,
        isCurrentMonth: true,
      });
    }

    // Next month leading days to complete 35 or 42 cells
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nextM = viewMonth === 11 ? 1 : viewMonth + 2;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const ymd = `${nextY}-${pad(nextM)}-${pad(d)}`;
      days.push({
        dayNum: d,
        ymd,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [viewYear, viewMonth]);

  const todayYMD = getTodayIST();

  // Year choices for quick selection (current year - 10 to + 10)
  const yearOptions = useMemo(() => {
    const curr = new Date().getFullYear();
    const list = [];
    for (let y = curr - 10; y <= curr + 10; y++) {
      list.push(y);
    }
    return list;
  }, []);

  return (
    <>
      <TextField
        label={label}
        value={inputValue}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        error={error}
        helperText={helperText}
        size={size}
        fullWidth={fullWidth}
        name={name}
        id={id}
        onClick={handleOpen}
        onChange={handleInputChange}
        onBlur={handleBlur}
        InputLabelProps={{
          shrink: true,
          ...InputLabelProps,
        }}
        inputProps={{
          ...inputProps,
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              {allowClear && inputValue && !disabled && !required && (
                <IconButton
                  size="small"
                  onClick={handleClear}
                  edge="end"
                  title="Clear date"
                  sx={{
                    mr: 0.5,
                    p: 0.5,
                    color: '#94a3b8',
                    '&:hover': { color: '#ef4444' },
                  }}
                >
                  <Close sx={{ fontSize: 16 }} />
                </IconButton>
              )}
              <IconButton
                size="small"
                onClick={handleOpen}
                edge="end"
                disabled={disabled}
                sx={{
                  color: '#ea580c',
                  p: 0.5,
                  '&:hover': { bgcolor: 'rgba(234, 88, 12, 0.08)' },
                }}
              >
                <CalendarToday sx={{ fontSize: 18 }} />
              </IconButton>
            </InputAdornment>
          ),
          sx: {
            borderRadius: 2,
            ...sx['& .MuiOutlinedInput-root'],
          },
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: '#f97316',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#ea580c',
            },
          },
          ...sx,
        }}
        {...props}
      />

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        PaperProps={{
          elevation: 6,
          sx: {
            mt: 1,
            p: 2,
            width: 320,
            borderRadius: 3,
            border: '1px solid #fed7aa',
            boxShadow: '0 12px 30px -4px rgba(234, 88, 12, 0.15), 0 8px 16px -4px rgba(0,0,0,0.06)',
            bgcolor: '#ffffff',
            zIndex: 99999, // Ensure it stays on top of all modals and drawers
          },
        }}
      >
        {/* Header: Month/Year navigation */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1.5,
            pb: 1,
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Select
              size="small"
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
              variant="standard"
              disableUnderline
              sx={{
                fontWeight: 700,
                fontSize: '0.95rem',
                color: '#1e293b',
                cursor: 'pointer',
                '& .MuiSelect-select': { py: 0.25, pr: 2.5 },
              }}
            >
              {MONTH_NAMES.map((name, idx) => (
                <MenuItem key={idx} value={idx} sx={{ fontSize: '0.88rem' }}>
                  {name}
                </MenuItem>
              ))}
            </Select>

            <Select
              size="small"
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              variant="standard"
              disableUnderline
              sx={{
                fontWeight: 700,
                fontSize: '0.95rem',
                color: '#ea580c',
                cursor: 'pointer',
                '& .MuiSelect-select': { py: 0.25, pr: 2.5 },
              }}
            >
              {yearOptions.map((yr) => (
                <MenuItem key={yr} value={yr} sx={{ fontSize: '0.88rem' }}>
                  {yr}
                </MenuItem>
              ))}
            </Select>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            <IconButton
              size="small"
              onClick={handlePrevMonth}
              title="Previous Month"
              sx={{
                p: 0.5,
                color: '#64748b',
                '&:hover': { color: '#ea580c', bgcolor: 'rgba(234, 88, 12, 0.08)' },
              }}
            >
              <ChevronLeft fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleNextMonth}
              title="Next Month"
              sx={{
                p: 0.5,
                color: '#64748b',
                '&:hover': { color: '#ea580c', bgcolor: 'rgba(234, 88, 12, 0.08)' },
              }}
            >
              <ChevronRight fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* Weekdays Row */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            textAlign: 'center',
            mb: 1,
          }}
        >
          {WEEKDAYS.map((day, idx) => (
            <Typography
              key={idx}
              variant="caption"
              sx={{
                fontWeight: 700,
                fontSize: '0.74rem',
                color: idx === 0 || idx === 6 ? '#ea580c' : '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {day}
            </Typography>
          ))}
        </Box>

        {/* Calendar Grid (6 rows x 7 days) */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '4px',
            rowGap: '6px',
            textAlign: 'center',
          }}
        >
          {calendarDays.map((cell, idx) => {
            const isSelected = normalizedYMD === cell.ymd;
            const isToday = todayYMD === cell.ymd;
            const disabledDate = isDateDisabled(cell.ymd);

            return (
              <Box
                key={idx}
                onClick={() => {
                  if (!disabledDate) {
                    handleSelectDate(cell.ymd);
                  }
                }}
                sx={{
                  height: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  cursor: disabledDate ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: isSelected || isToday ? 700 : 500,
                  transition: 'all 0.15s ease-in-out',
                  userSelect: 'none',

                  // Selected date styling
                  ...(isSelected && {
                    bgcolor: '#ea580c !important',
                    color: '#ffffff !important',
                    boxShadow: '0 2px 8px rgba(234, 88, 12, 0.45)',
                  }),

                  // Today (not selected)
                  ...(isToday && !isSelected && {
                    border: '1.5px solid #ea580c',
                    color: '#ea580c',
                    bgcolor: 'rgba(234, 88, 12, 0.06)',
                  }),

                  // Non-selected current month
                  ...(!isSelected && !isToday && cell.isCurrentMonth && {
                    color: '#1e293b',
                    '&:hover': {
                      bgcolor: disabledDate ? 'transparent' : 'rgba(234, 88, 12, 0.12)',
                      color: '#ea580c',
                    },
                  }),

                  // Non-selected outside current month
                  ...(!isSelected && !cell.isCurrentMonth && {
                    color: '#cbd5e1',
                    '&:hover': {
                      bgcolor: disabledDate ? 'transparent' : '#f8fafc',
                      color: '#64748b',
                    },
                  }),

                  // Disabled date styling
                  ...(disabledDate && {
                    color: '#e2e8f0 !important',
                    bgcolor: 'transparent !important',
                    cursor: 'not-allowed',
                    opacity: 0.4,
                  }),
                }}
              >
                {cell.dayNum}
              </Box>
            );
          })}
        </Box>

        {/* Footer actions: Clear & Today */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mt: 2,
            pt: 1.25,
            borderTop: '1px solid #f1f5f9',
          }}
        >
          <Button
            size="small"
            variant="text"
            onClick={handleClear}
            disabled={!normalizedYMD || required}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              color: '#64748b',
              p: 0.5,
              '&:hover': { color: '#ef4444', bgcolor: 'rgba(239, 68, 68, 0.06)' },
            }}
          >
            Clear
          </Button>

          <Button
            size="small"
            variant="contained"
            onClick={handleSelectToday}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              bgcolor: '#ea580c',
              color: '#ffffff',
              borderRadius: 2,
              px: 1.5,
              py: 0.4,
              boxShadow: 'none',
              '&:hover': {
                bgcolor: '#c2410c',
                boxShadow: '0 2px 6px rgba(234, 88, 12, 0.3)',
              },
            }}
          >
            Today
          </Button>
        </Box>
      </Popover>
    </>
  );
}
