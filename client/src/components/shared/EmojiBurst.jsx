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

const CONFETTI_COLORS = ["#236B4A", "#F59E0B", "#EF4444", "#3B82F6", "#EC4899", "#8B5CF6", "#10B981"];

const CONFETTI_PIECES = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 3.7 + (i % 3) * 2) % 96 + 2}%`,
  drift: ((i % 5) - 2) * 32,
  rot: (i % 2 === 0 ? 1 : -1) * (180 + (i % 4) * 90),
  delay: (i % 7) * 0.06,
  duration: 1.5 + (i % 4) * 0.25,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  isCircle: i % 3 === 0,
}));

const HEART_STREAMS = ["❤️", "💖", "💕", "💜", "🧡", "💗", "✨", "❤️", "💖", "💕", "💓", "✨"];

/**
 * Full-viewport Framer Motion celebration overlay supporting emoji bursts, confetti showers, fireworks, and floating hearts.
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
        {bursts.map((burst) => {
          const mode = burst.mode || "burst";

          if (mode === "confetti") {
            return (
              <div key={burst.id} style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
                {CONFETTI_PIECES.map((piece, idx) => (
                  <motion.div
                    key={`${burst.id}-c-${idx}`}
                    initial={{ y: -24, x: 0, opacity: 1, rotate: 0, scale: 0.9 }}
                    animate={{
                      y: "105vh",
                      x: piece.drift,
                      opacity: [1, 1, 0],
                      rotate: piece.rot,
                      scale: [0.9, 1.15, 0.85],
                    }}
                    transition={{ duration: piece.duration, delay: piece.delay, ease: "easeIn" }}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: piece.left,
                      width: piece.isCircle ? 10 : 9,
                      height: piece.isCircle ? 10 : 16,
                      borderRadius: piece.isCircle ? "50%" : "2px",
                      backgroundColor: piece.color,
                    }}
                  />
                ))}
                <motion.span
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.4, 1.1] }}
                  transition={{ duration: 1.2 }}
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "42%",
                    transform: "translate(-50%, -50%)",
                    fontSize: "4.4rem",
                    filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.22))",
                  }}
                >
                  {burst.emoji || "🎉"}
                </motion.span>
              </div>
            );
          }

          if (mode === "hearts") {
            return (
              <div key={burst.id} style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
                {HEART_STREAMS.map((em, idx) => (
                  <motion.span
                    key={`${burst.id}-h-${idx}`}
                    initial={{ y: "92vh", x: 0, opacity: 0, scale: 0.5 }}
                    animate={{
                      y: "-10vh",
                      x: (idx % 2 === 0 ? 1 : -1) * (18 + (idx % 4) * 14),
                      opacity: [0, 1, 1, 0],
                      scale: [0.6, 1.35, 1],
                    }}
                    transition={{ duration: 1.7, delay: idx * 0.06, ease: "easeOut" }}
                    style={{
                      position: "absolute",
                      left: `${8 + ((idx * 7.8) % 84)}%`,
                      fontSize: idx % 2 === 0 ? "2.1rem" : "1.6rem",
                    }}
                  >
                    {em}
                  </motion.span>
                ))}
              </div>
            );
          }

          const fireworkEmojis = mode === "fireworks" ? ["✨", "🎆", "🌟", "💥", "🎇", "⭐"] : [burst.emoji];

          return (
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
              <motion.div
                initial={{ opacity: 0, scale: 0.2 }}
                animate={{ opacity: [0, 0.5, 0], scale: [0.3, mode === "fireworks" ? 2.6 : 1.9, 2.8] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{
                  position: "absolute",
                  width: 130,
                  height: 130,
                  marginLeft: -65,
                  marginTop: -65,
                  borderRadius: "50%",
                  background:
                    mode === "fireworks"
                      ? "radial-gradient(circle, rgba(245,158,11,0.45) 0%, rgba(236,72,153,0) 70%)"
                      : "radial-gradient(circle, rgba(35,107,74,0.35) 0%, rgba(35,107,74,0) 70%)",
                }}
              />

              <motion.span
                initial={{ opacity: 0, scale: 0.25, y: 12 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  scale: [0.3, 1.6, 1.25, 0.85],
                  y: [12, -16, -24, -44],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
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

              {PARTICLE_VECTORS.map((vec, idx) => (
                <motion.span
                  key={`${burst.id}-p-${idx}`}
                  initial={{ opacity: 0, x: 0, y: 0, scale: 0.25, rotate: 0 }}
                  animate={{
                    opacity: [0, 1, 1, 0],
                    x: mode === "fireworks" ? vec.dx * 1.4 : vec.dx,
                    y: mode === "fireworks" ? vec.dy * 1.4 : vec.dy,
                    scale: [0.35, vec.scale, 0.75],
                    rotate: vec.rot,
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.0, delay: vec.delay, ease: [0.16, 1, 0.3, 1] }}
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
                  {fireworkEmojis[idx % fireworkEmojis.length]}
                </motion.span>
              ))}
            </div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body
  );
};

export default EmojiBurst;
