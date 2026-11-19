import React from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { motion } from "framer-motion";
import { useAdaptiveAnimation } from "../../utils/feedback";

const TypingIndicator = ({ username = "" }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { isAnimationEnabled } = useAdaptiveAnimation();

  return (
    <motion.div
      initial={isAnimationEnabled ? { opacity: 0, scale: 0.88, y: 8 } : { opacity: 0 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={isAnimationEnabled ? { opacity: 0, scale: 0.88, y: 8 } : { opacity: 0 }}
      transition={isAnimationEnabled ? { type: "spring", stiffness: 480, damping: 28 } : { duration: 0.05 }}
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
          {[0, 0.18, 0.36].map((delay, idx) => (
            <Box
              key={idx}
              component={isAnimationEnabled ? motion.div : "div"}
              {...(isAnimationEnabled
                ? {
                    animate: { y: [0, -5, 0], opacity: [0.5, 1, 0.5] },
                    transition: { duration: 0.9, repeat: Infinity, ease: "easeInOut", delay },
                  }
                : {})}
              sx={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                bgcolor: isDark ? "#4B9B70" : "#236B4A",
                opacity: isAnimationEnabled ? 0.7 : 0.85,
              }}
            />
          ))}
        </Box>
      </Box>
    </motion.div>
  );
};

export default React.memo(TypingIndicator);
