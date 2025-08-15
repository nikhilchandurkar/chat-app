import React from 'react';
import { Grid, Skeleton, Stack } from '@mui/material';

export const LayoutLoader = () => {
  return (
    <Grid container height="calc(100vh - 4rem)" spacing={1}>
      
      {/* Sidebar Skeleton */}
      <Grid item xs={12} sm={4} md={3} lg={3} sx={{ display: { xs: "none", sm: "block" } }}>
        <Skeleton
          animation="wave"
          variant="rectangular"
          height="100vh"
          aria-label="Loading sidebar"
        />
      </Grid>
      
      {/* Main Content Skeleton */}
      <Grid item xs={12} sm={8} md={5} lg={6} height="100%">
        <Stack spacing={1}>
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton
              key={index}
              animation="wave"
              variant="rounded"
              height="5rem"
              aria-label={`Loading item ${index + 1}`}
            />
          ))}
        </Stack>
      </Grid>
      
      {/* Profile Section Skeleton */}
      <Grid item xs={12} md={4} lg={3} sx={{ display: { xs: "none", md: "block" } }}>
        <Skeleton
          variant="rectangular"
          animation="pulse"
          height="100vh"
          aria-label="Loading profile section"
        />
      </Grid>
      
    </Grid>
  );
};
