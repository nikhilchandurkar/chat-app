import React from "react";
import AppLayout from "../components/layout/AppLayout";
import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";
import AnimatedGradientBackground from "../components/effects/AnimatedGradientBackground";
import TextAnimation from "../components/effects/TextAnimation";

const Home = () => {
  return (
    <Box sx={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden", backgroundColor: "black" }}>
      {/* 🌈 Animated Gradient Background */}
      <AnimatedGradientBackground
        preset="Plasma"
        speed={30}
        noise={{ opacity: 0.3, scale: 1 }}
        radius="0px"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0 }}
      />

      {/* ✨ Foreground Animated Text */}
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
        <TextAnimation
          text={"Select a friend to chat 💬"}
          typingSpeed={50}
          deletingSpeed={30}
          pauseDuration={2000}
          loop={true}
          textColors={["#ffffff", "#ff9f21"]}
          style={{ fontSize: "2rem", fontWeight: "bold", textShadow: "0px 3px 15px rgba(0,0,0,0.5)" }}
        />
      </Box>
    </Box>
  );
};

export default AppLayout()(Home);
