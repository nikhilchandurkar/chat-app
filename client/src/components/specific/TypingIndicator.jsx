import React from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { motion } from "framer-motion";

const TypingIndicator = ({ username = "" }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.88, y: 8 }}
      transition={{ type: "spring", stiffness: 480, damping: 28 }}
      style={{ width: "fit-content", margin: "0.25rem 0" }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          px: 1.75,
          py: 0.9,
          borderRadius: "18px 18px 18px 4px",
          bgcolor: isDark ? "#202522" : "#FFFFFF",
          border: `1px solid ${isDark ? "#343B36" : "#E3E6E1"}`,
          boxShadow: isDark ? "none" : "0 2px 6px rgba(0,0,0,0.04)",
          width: "fit-content",
        }}
      >
        {username && (
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              color: isDark ? "#4B9B70" : "#236B4A",
              fontSize: "0.74rem",
              mr: 0.25,
            }}
          >
            {username}
          </Typography>
        )}
        <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Box
            component={motion.div}
            animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: 0 }}
            sx={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              bgcolor: isDark ? "#4B9B70" : "#236B4A",
            }}
          />
          <Box
            component={motion.div}
            animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: 0.18 }}
            sx={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              bgcolor: isDark ? "#4B9B70" : "#236B4A",
            }}
          />
          <Box
            component={motion.div}
            animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: 0.36 }}
            sx={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              bgcolor: isDark ? "#4B9B70" : "#236B4A",
            }}
          />
        </Box>
      </Box>
    </motion.div>
  );
};

export default React.memo(TypingIndicator);
