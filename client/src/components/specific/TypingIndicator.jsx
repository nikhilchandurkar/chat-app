import React from "react";
import { Box } from "@mui/material";

const TypingIndicator = () => {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "0.5rem 1rem",
        borderRadius: "1.5rem",
        backgroundColor: "rgba(230, 230, 230, 0.8)",
        width: "fit-content",
        margin: "0.5rem 0",
      }}
    >
      <Box sx={dotStyle} style={{ animationDelay: "0ms" }} />
      <Box sx={dotStyle} style={{ animationDelay: "150ms" }} />
      <Box sx={dotStyle} style={{ animationDelay: "300ms" }} />
      <style>
        {`
          @keyframes typing-bounce {
            0%, 100% {
              transform: translateY(0);
              opacity: 0.5;
            }
            50% {
              transform: translateY(-4px);
              opacity: 1;
            }
          }
        `}
      </style>
    </Box>
  );
};

const dotStyle = {
  width: "6px",
  height: "6px",
  backgroundColor: "#888",
  borderRadius: "50%",
  animation: "typing-bounce 1s infinite ease-in-out",
};

export default TypingIndicator;
