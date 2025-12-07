import React, { useMemo } from "react";
import { motion } from "framer-motion";

/**
 * CINEMATIC REACTIVE BACKGROUND
 * Combines animated gradients, moving glow orbs, pulse waves, and a subtle grain texture.
 */
export default function CinematicBackground({
  preset = "Lava",
  speed = 20,
  intensity = 0.6,
  style = {},
  radius = "0px",
}) {
  const templates = useMemo(
    () => ({
      Lava: {
        colors: ["#FF9F21", "#FF0303", "#8B0000", "#FF6B00"],
        blend: "screen",
      },
      Mist: {
        colors: ["#0a0a0a", "#FF66B8", "#CC0099", "#1a0a14"],
        blend: "overlay",
      },
      Plasma: {
        colors: ["#B566FF", "#7B2CBF", "#5A189A", "#240046"],
        blend: "lighten",
      },
      Prism: {
        colors: ["#1a1a2e", "#66B3FF", "#0066cc", "#FFFFFF"],
        blend: "overlay",
      },
      Pulse: {
        colors: ["#66FF85", "#00CC66", "#004d00", "#33FF66"],
        blend: "screen",
      },
    }),
    []
  );

  const { colors, blend } = templates[preset] || templates.Lava;

  const gradient1 = `radial-gradient(circle at 20% 50%, ${colors[0]}, transparent 60%)`;
  const gradient2 = `radial-gradient(circle at 80% 50%, ${colors[1]}, transparent 60%)`;
  const gradient3 = `radial-gradient(circle at 50% 80%, ${colors[2]}, transparent 70%)`;
  const gradient4 = `linear-gradient(135deg, ${colors[3]}, transparent)`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        borderRadius: radius,
        ...style,
      }}
    >
      {/* Layer 1: Base Smooth Gradient Flow */}
      <motion.div
        animate={{
          backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
        }}
        transition={{
          duration: 18 / (speed / 20),
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(45deg, ${colors[0]}, ${colors[1]}, ${colors[2]})`,
          backgroundSize: "400% 400%",
          opacity: 0.5 * intensity,
        }}
      />

      {/* Layer 2: Dynamic Moving Radial Lights */}
      {[gradient1, gradient2, gradient3].map((g, i) => (
        <motion.div
          key={i}
          animate={{
            x: ["0%", "100%", "0%"],
            y: ["0%", "100%", "0%"],
          }}
          transition={{
            duration: (20 + i * 4) / (speed / 20),
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 1.5,
          }}
          style={{
            position: "absolute",
            inset: "-50%",
            background: g,
            mixBlendMode: blend,
            opacity: 0.7 * intensity - i * 0.15,
          }}
        />
      ))}

      {/* Layer 3: Rotating Overlay Glow */}
      <motion.div
        animate={{ rotate: [0, 360] }}
        transition={{
          duration: 40 / (speed / 20),
          repeat: Infinity,
          ease: "linear",
        }}
        style={{
          position: "absolute",
          inset: "-100%",
          background: gradient4,
          mixBlendMode: "soft-light",
          opacity: 0.3 * intensity,
        }}
      />

      {/* Layer 4: Floating Glow Orbs */}
      {Array.from({ length: 10 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{
            x: `${Math.random() * 100}%`,
            y: `${Math.random() * 100}%`,
            scale: 0,
            opacity: 0,
          }}
          animate={{
            x: [
              `${Math.random() * 100}%`,
              `${Math.random() * 100}%`,
              `${Math.random() * 100}%`,
            ],
            y: [
              `${Math.random() * 100}%`,
              `${Math.random() * 100}%`,
              `${Math.random() * 100}%`,
            ],
            scale: [0, 1, 0],
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration: 25 + Math.random() * 15,
            repeat: Infinity,
            delay: i * 2,
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors[i % colors.length]}, transparent 70%)`,
            filter: "blur(60px)",
            mixBlendMode: "screen",
          }}
        />
      ))}

      {/* Layer 5: Expanding Pulse Rings */}
      {Array.from({ length: 3 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{
            scale: [0.8, 1.3, 0.8],
            opacity: [0, 0.5, 0],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            delay: i * 1.5,
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            inset: 0,
            margin: "auto",
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.2)",
            width: "80%",
            height: "80%",
          }}
        />
      ))}

      {/* Layer 6: Subtle Grain Texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E\")",
          mixBlendMode: "overlay",
          opacity: 0.2,
        }}
      />
    </div>
  );
}
