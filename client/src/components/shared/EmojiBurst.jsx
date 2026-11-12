import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { isEffectsEnabled } from "../../utils/feedback";

const PARTICLE_VECTORS = [
  { dx: -120, dy: -155, rot: -32, scale: 1.25, delay: 0 },
  { dx: -68, dy: -190, rot: -18, scale: 1.4, delay: 0.02 },
  { dx: 0, dy: -205, rot: 4, scale: 1.45, delay: 0.01 },
  { dx: 72, dy: -185, rot: 20, scale: 1.35, delay: 0.03 },
  { dx: 126, dy: -148, rot: 34, scale: 1.2, delay: 0.02 },
  { dx: -155, dy: -55, rot: -40, scale: 1.1, delay: 0.04 },
  { dx: 158, dy: -52, rot: 38, scale: 1.15, delay: 0.04 },
  { dx: -138, dy: 64, rot: -26, scale: 1.05, delay: 0.05 },
  { dx: 142, dy: 68, rot: 28, scale: 1.05, delay: 0.05 },
  { dx: -65, dy: 125, rot: -15, scale: 1.15, delay: 0.04 },
  { dx: 68, dy: 122, rot: 16, scale: 1.15, delay: 0.04 },
  { dx: 0, dy: 145, rot: 0, scale: 1.1, delay: 0.05 },
  { dx: -44, dy: -95, rot: -12, scale: 1.5, delay: 0.01 },
  { dx: 48, dy: -92, rot: 14, scale: 1.5, delay: 0.01 },
];

/**
 * Full-viewport center-screen Framer Motion emoji burst portal for reactions, double-taps, and shake effects.
 */
const EmojiBurst = ({ bursts = [] }) => {
  if (!isEffectsEnabled() || !bursts.length || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <AnimatePresence>
        {bursts.map((burst) => (
          <div
            key={burst.id}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 0,
              height: 0,
            }}
          >
            {/* Central Hero Pop with Soft Radial Halo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: [0, 0.45, 0], scale: [0.3, 1.9, 2.5] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.75, ease: "easeOut" }}
              style={{
                position: "absolute",
                width: 120,
                height: 120,
                marginLeft: -60,
                marginTop: -60,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(35,107,74,0.35) 0%, rgba(35,107,74,0) 70%)",
              }}
            />

            <motion.span
              initial={{ opacity: 0, scale: 0.25, y: 12 }}
              animate={{
                opacity: [0, 1, 1, 0],
                scale: [0.3, 1.55, 1.25, 0.85],
                y: [12, -16, -24, -44],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transform: "translate(-50%, -50%)",
                marginLeft: "-2.1rem",
                marginTop: "-2.1rem",
                fontSize: "4.2rem",
                lineHeight: 1,
                userSelect: "none",
                filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.22))",
              }}
            >
              {burst.emoji}
            </motion.span>

            {/* Radial Particle Spray Centered on Viewport */}
            {PARTICLE_VECTORS.map((vec, idx) => (
              <motion.span
                key={`${burst.id}-p-${idx}`}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.25, rotate: 0 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  x: vec.dx,
                  y: vec.dy,
                  scale: [0.35, vec.scale, 0.75],
                  rotate: vec.rot,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.95, delay: vec.delay, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  marginLeft: "-0.85rem",
                  marginTop: "-0.85rem",
                  fontSize: "1.7rem",
                  lineHeight: 1,
                  userSelect: "none",
                  willChange: "transform, opacity",
                }}
              >
                {burst.emoji}
              </motion.span>
            ))}
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
};

export default EmojiBurst;
