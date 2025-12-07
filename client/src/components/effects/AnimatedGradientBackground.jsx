import { motion } from "framer-motion";
import { useMemo } from "react";

export default function AnimatedGradientBackground({
  preset = "Lava",
  radius = "0px",
  speed = 20,
  style = {},
}) {
  const templates = useMemo(
    () => ({
      Lava: {
        colors: ["#FF9F21", "#FF0303", "#8B0000", "#FF6B00"],
        blend: "screen",
        opacity: 0.9
      },
      Prism: {
        colors: ["#1a1a2e", "#66B3FF", "#0066cc", "#FFFFFF"],
        blend: "overlay",
        opacity: 0.85
      },
      Plasma: {
        colors: ["#B566FF", "#7B2CBF", "#5A189A", "#240046"],
        blend: "lighten",
        opacity: 0.95
      },
      Pulse: {
        colors: ["#66FF85", "#00CC66", "#004d00", "#33FF66"],
        blend: "screen",
        opacity: 0.9
      },
      Mist: {
        colors: ["#0a0a0a", "#FF66B8", "#CC0099", "#1a0a14"],
        blend: "overlay",
        opacity: 0.88
      },
    }),
    []
  );

  const config = templates[preset] || templates.Lava;
  const { colors, blend, opacity } = config;

  // Create multiple gradients for depth
  const gradient1 = `radial-gradient(circle at 20% 50%, ${colors[0]}, transparent 50%)`;
  const gradient2 = `radial-gradient(circle at 80% 50%, ${colors[1]}, transparent 50%)`;
  const gradient3 = `radial-gradient(circle at 50% 80%, ${colors[2]}, transparent 50%)`;
  const gradient4 = `linear-gradient(135deg, ${colors[3] || colors[0]} 0%, transparent 100%)`;

  return (
    <div
      style={{
        position: "relative",
        borderRadius: radius,
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Base gradient layer */}
      <motion.div
        animate={{
          backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
        }}
        transition={{
          duration: 15 / (speed / 20),
          ease: "easeInOut",
          repeat: Infinity,
        }}
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(45deg, ${colors[0]}, ${colors[1]}, ${colors[2]})`,
          backgroundSize: "400% 400%",
          opacity: 0.7,
        }}
      />

      {/* Moving radial gradient 1 */}
      <motion.div
        animate={{
          x: ["0%", "100%", "0%"],
          y: ["0%", "100%", "0%"],
        }}
        transition={{
          duration: 20 / (speed / 20),
          ease: "easeInOut",
          repeat: Infinity,
        }}
        style={{
          position: "absolute",
          inset: "-50%",
          background: gradient1,
          backgroundSize: "200% 200%",
          mixBlendMode: blend,
          opacity: opacity,
        }}
      />

      {/* Moving radial gradient 2 */}
      <motion.div
        animate={{
          x: ["100%", "0%", "100%"],
          y: ["100%", "0%", "100%"],
        }}
        transition={{
          duration: 18 / (speed / 20),
          ease: "easeInOut",
          repeat: Infinity,
          delay: 0.5,
        }}
        style={{
          position: "absolute",
          inset: "-50%",
          background: gradient2,
          backgroundSize: "200% 200%",
          mixBlendMode: blend,
          opacity: opacity * 0.8,
        }}
      />

      {/* Moving radial gradient 3 */}
      <motion.div
        animate={{
          x: ["50%", "-50%", "50%"],
          y: ["-50%", "50%", "-50%"],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 22 / (speed / 20),
          ease: "easeInOut",
          repeat: Infinity,
          delay: 1,
        }}
        style={{
          position: "absolute",
          inset: "-50%",
          background: gradient3,
          backgroundSize: "200% 200%",
          mixBlendMode: blend,
          opacity: opacity * 0.6,
        }}
      />

      {/* Rotating overlay gradient */}
      <motion.div
        animate={{
          rotate: [0, 360],
        }}
        transition={{
          duration: 30 / (speed / 20),
          ease: "linear",
          repeat: Infinity,
        }}
        style={{
          position: "absolute",
          inset: "-100%",
          background: gradient4,
          mixBlendMode: "soft-light",
          opacity: 0.4,
        }}
      />

      {/* Grain texture overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")`,
          mixBlendMode: "overlay",
          opacity: 0.3,
        }}
      />
    </div>
  );
}

// Demo component
function Demo() {
  const presets = ["Lava", "Prism", "Plasma", "Pulse", "Mist"];
  
  return (
    <div className="min-h-screen bg-black p-8">
      <h1 className="text-4xl font-bold text-white text-center mb-8">
        Enhanced Animated Gradients
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {presets.map((preset) => (
          <div key={preset} className="relative">
            <AnimatedGradientBackground
              preset={preset}
              radius="16px"
              speed={20}
              style={{
                width: "100%",
                height: "300px",
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white text-2xl font-bold drop-shadow-lg">
                {preset}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-12 max-w-4xl mx-auto">
        <AnimatedGradientBackground
          preset="Lava"
          radius="24px"
          speed={15}
          style={{
            width: "100%",
            height: "400px",
          }}
        />
        <div className="mt-4 text-center text-gray-400">
          <p className="text-sm">Full-width example with slower animation</p>
        </div>
      </div>
    </div>
  );
}