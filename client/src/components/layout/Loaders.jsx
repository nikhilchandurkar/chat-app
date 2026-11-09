import React from "react";
import { Grid, Skeleton, Stack, Box } from "@mui/material";

export const LayoutLoader = () => {
  return (
    <Box sx={{ height: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
      {/* Top Navigation Skeleton */}
      <Box
        sx={{
          height: "4rem",
          px: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Box display="flex" alignItems="center" gap={1.5}>
          <Skeleton variant="rounded" width={32} height={32} animation="wave" />
          <Skeleton variant="text" width={100} height={28} animation="wave" />
        </Box>
        <Box display="flex" gap={1}>
          <Skeleton variant="circular" width={32} height={32} animation="wave" />
          <Skeleton variant="circular" width={32} height={32} animation="wave" />
          <Skeleton variant="circular" width={32} height={32} animation="wave" />
        </Box>
      </Box>

      {/* Main Grid Skeleton */}
      <Grid container sx={{ flex: 1, overflow: "hidden" }}>
        {/* Sidebar Skeleton (Conversation List) */}
        <Grid
          item
          xs={12}
          sm={4}
          md={3}
          lg={3}
          sx={{
            display: { xs: "none", sm: "block" },
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            p: 2,
          }}
        >
          <Skeleton variant="rounded" height={40} sx={{ mb: 2 }} animation="wave" />
          <Stack spacing={2}>
            {Array.from({ length: 7 }).map((_, idx) => (
              <Box key={idx} display="flex" alignItems="center" gap={1.5}>
                <Skeleton variant="circular" width={44} height={44} animation="wave" />
                <Box flex={1}>
                  <Skeleton variant="text" width="60%" height={20} animation="wave" />
                  <Skeleton variant="text" width="90%" height={16} animation="wave" />
                </Box>
              </Box>
            ))}
          </Stack>
        </Grid>

        {/* Chat Area Skeleton */}
        <Grid
          item
          xs={12}
          sm={8}
          md={6}
          lg={6}
          sx={{
            p: 3,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            bgcolor: "background.default",
          }}
        >
          <Stack spacing={2} sx={{ flex: 1, justifyContent: "flex-end", mb: 2 }}>
            <Box display="flex" justifyContent="flex-start">
              <Skeleton variant="rounded" width="55%" height={48} sx={{ borderRadius: 2 }} animation="wave" />
            </Box>
            <Box display="flex" justifyContent="flex-end">
              <Skeleton variant="rounded" width="45%" height={40} sx={{ borderRadius: 2 }} animation="wave" />
            </Box>
            <Box display="flex" justifyContent="flex-start">
              <Skeleton variant="rounded" width="60%" height={56} sx={{ borderRadius: 2 }} animation="wave" />
            </Box>
            <Box display="flex" justifyContent="flex-end">
              <Skeleton variant="rounded" width="50%" height={44} sx={{ borderRadius: 2 }} animation="wave" />
            </Box>
          </Stack>

          {/* Composer Skeleton */}
          <Box display="flex" gap={1} alignItems="center">
            <Skeleton variant="rounded" height={42} sx={{ flex: 1, borderRadius: 1 }} animation="wave" />
            <Skeleton variant="rounded" width={42} height={42} sx={{ borderRadius: 1 }} animation="wave" />
          </Box>
        </Grid>

        {/* Profile Info Skeleton */}
        <Grid
          item
          md={3}
          lg={3}
          sx={{
            display: { xs: "none", md: "block" },
            borderLeft: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            p: 3,
            textAlign: "center",
          }}
        >
          <Box display="flex" flexDirection="column" alignItems="center" mt={2}>
            <Skeleton variant="circular" width={80} height={80} sx={{ mb: 2 }} animation="wave" />
            <Skeleton variant="text" width={120} height={24} animation="wave" />
            <Skeleton variant="text" width={160} height={18} sx={{ mb: 3 }} animation="wave" />
            <Skeleton variant="rounded" width="100%" height={80} sx={{ borderRadius: 2 }} animation="wave" />
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};
