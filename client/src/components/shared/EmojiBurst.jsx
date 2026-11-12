import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Box } from "@mui/material";
import { isEffectsEnabled } from "../../utils/feedback";

const PARTICLE_VECTORS = [
  { dx: -44, dy: -66, rot: -22, scale: 1.15, delay: 0 },
  { dx: -20, dy: -82, rot: -10, scale: 1.3, delay: 0.03 },
  { dx: 8, dy: -88, rot: 12, scale: 1.25, delay: 0.02 },
  { dx: 36, dy: -70, rot: 25, scale: 1.1, delay: 0.04 },
  { dx: -56, dy: -36, rot: -32, scale: 0.95, delay: 0.05 },
  { dx: 52, dy: -38, rot: 30, scale: 1.0, delay: 0.05 },
  { dx: 0, dy: -54, rot: 0, scale: 1.45, delay: 0 },
];

/**
 * Lightweight Framer-Motion emoji particle burst rendered above reactions or celebration messages.
 */
const EmojiBurst = ({ bursts = [], align = "center" }) => {
  if (!isEffectsEnabled() || !bursts.length) return null;

  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 50,
      }}
    >
      <AnimatePresence>
        {bursts.map((burst) =>
          PARTICLE_VECTORS.map((vec, idx) => (
            <motion.span
              key={`${burst.id}-${idx}`}
              initial={{
                opacity: 1,
                x: 0,
                y: 0,
                scale: 0.4,
                rotate: 0,
              }}
              animate={{
                opacity: [1, 1, 0],
                x: vec.dx,
                y: vec.dy,
                scale: [0.5, vec.scale, 0.7],
                rotate: vec.rot,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85, delay: vec.delay, ease: "easeOut" }}
              style={{
                position: "absolute",
                top: burst.y ?? "20%",
                left: burst.x ?? (align === "right" ? "75%" : align === "left" ? "25%" : "50%"),
                fontSize: "1.25rem",
                lineHeight: 1,
                userSelect: "none",
                willChange: "transform, opacity",
              }}
            >
              {burst.emoji}
            </motion.span>
          ))
        )}
      </AnimatePresence>
    </Box>
  );
};

export default EmojiBurst;

