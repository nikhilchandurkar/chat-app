import React, { memo } from "react";
import { Box, Typography, Divider } from "@mui/material";
import { ArrowDownward as ArrowDownwardIcon } from "@mui/icons-material";

/**
 * Elegant unread message divider.
 * Rendered between the last-read and first-unread message.
 */
const UnreadDivider = ({ count }) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1,
      my: 1,
      px: 1,
    }}
  >
    <Divider sx={{ flex: 1, borderColor: "rgba(102,126,234,0.4)" }} />
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        bgcolor: "rgba(102,126,234,0.12)",
        border: "1px solid rgba(102,126,234,0.35)",
        borderRadius: "999px",
        px: 1.5,
        py: 0.3,
        whiteSpace: "nowrap",
      }}
    >
      <ArrowDownwardIcon sx={{ fontSize: 12, color: "primary.main" }} />
      <Typography variant="caption" fontWeight={600} color="primary.main" sx={{ fontSize: "0.7rem" }}>
        {count === 1 ? "1 Unread Message" : `${count} Unread Messages`}
      </Typography>
    </Box>
    <Divider sx={{ flex: 1, borderColor: "rgba(102,126,234,0.4)" }} />
  </Box>
);

export default memo(UnreadDivider);
