import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#ea580c',      // Modern corporate Orange
      light: '#fb923c',
      dark: '#c2410c',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#0f172a',      // Dark charcoal
      light: '#334155',
      dark: '#020617',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f8fafc',   // Warm-white / light slate
      paper: '#ffffff',     // Pure white for cards and surfaces
      card: '#ffffff',
    },
    text: {
      primary: '#0f172a',   // Dark charcoal for supreme readability
      secondary: '#64748b', // Slate gray
    },
    divider: '#e2e8f0',     // Subtle border
    error: {
      main: '#ef4444',
    },
    warning: {
      main: '#f59e0b',
    },
    success: {
      main: '#10b981',
    },
    info: {
      main: '#0ea5e9',
      light: '#38bdf8',
    },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h4: {
      fontWeight: 700,
      fontSize: '1.75rem',
      color: '#0f172a',
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.35rem',
      color: '#0f172a',
    },
    h6: {
      fontWeight: 600,
      fontSize: '1.1rem',
      color: '#0f172a',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#ffffff',
          borderColor: '#e2e8f0',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          fontWeight: 600,
        },
        containedPrimary: {
          color: '#ffffff',
          backgroundColor: '#ea580c',
          boxShadow: '0 4px 14px rgba(234, 88, 12, 0.25)',
          '&:hover': {
            backgroundColor: '#c2410c',
            boxShadow: '0 6px 20px rgba(234, 88, 12, 0.35)',
          },
        },
        outlinedPrimary: {
          borderColor: '#ea580c',
          color: '#ea580c',
          '&:hover': {
            borderColor: '#c2410c',
            backgroundColor: 'rgba(234, 88, 12, 0.06)',
          },
        },
        textPrimary: {
          color: '#ea580c',
          '&:hover': {
            backgroundColor: 'rgba(234, 88, 12, 0.06)',
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          boxShadow: '2px 0 12px rgba(15, 23, 42, 0.03)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #e2e8f0',
          color: '#1e293b',
        },
        head: {
          fontWeight: 600,
          color: '#475569',
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          color: '#64748b',
          '&.Mui-selected': {
            fontWeight: 600,
            color: '#ea580c',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: '#ea580c',
          height: 3,
          borderRadius: 2,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#cbd5e1',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#ea580c',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#ea580c',
          },
        },
      },
    },
  },
});

export default theme;