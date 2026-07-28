import React from 'react';
import { Paper, Typography, Box, Skeleton } from '@mui/material';

export default function KpiCard({ title, value, icon, color, onClick, loading }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s',
        bgcolor: color || 'background.paper',
        '&:hover': onClick ? {
          transform: 'translateY(-2px)',
          boxShadow: 3,
          borderColor: color || 'primary.main',
        } : {},
      }}
      onClick={onClick}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontWeight: 500 }}>
            {title}
          </Typography>
          {loading ? (
            <Skeleton width={80} height={36} />
          ) : (
            <Typography variant="h4" fontWeight={700} sx={{ color: color || 'text.primary' }}>
              {value ?? '—'}
            </Typography>
          )}
        </Box>
        {icon && (
          <Box
            sx={{
              width: 48, height: 48, borderRadius: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: color ? `${color}15` : 'primary.light',
            }}
          >
            {React.cloneElement(icon, { sx: { color: color || 'primary.main', fontSize: 28 } })}
          </Box>
        )}
      </Box>
    </Paper>
  );
}