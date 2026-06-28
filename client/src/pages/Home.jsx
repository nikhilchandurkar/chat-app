import React from "react";
import AppLayout from "../components/layout/AppLayout";
import { Box, Typography } from "@mui/material";


const Home = () => {
  return (
    <Box sx={{ 
      position: "relative", 
      width: "100%", 
      height: "100%", 
      overflow: "hidden", 
      backgroundColor: "background.default",
      backgroundImage: "radial-gradient(circle at center, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0) 100%)",
      borderLeft: "1px solid rgba(0,0,0,0.05)"
    }}>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          zIndex: 2,
          textAlign: "center",
          px: 2,
        }}
      >
        <Typography variant="h5" color="text.secondary" fontWeight={500}>
          Select a friend to chat 💬
        </Typography>
      </Box>
    </Box>
  );
};

export default Home;
