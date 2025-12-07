import React, { useEffect, useRef } from "react";

// Function to dynamically load jQuery and Ripples.js
const loadRippleScript = (callback) => {
  if (!window.$) {
    const jqueryScript = document.createElement("script");
    jqueryScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js";
    jqueryScript.async = true;
    jqueryScript.onload = () => {
      const ripplesScript = document.createElement("script");
      ripplesScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jquery.ripples/0.5.3/jquery.ripples.min.js";
      ripplesScript.async = true;
      ripplesScript.onload = callback;
      document.body.appendChild(ripplesScript);
    };
    document.body.appendChild(jqueryScript);
  } else if (!window.$.fn.ripples) {
    const ripplesScript = document.createElement("script");
    ripplesScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jquery.ripples/0.5.3/jquery.ripples.min.js";
    ripplesScript.async = true;
    ripplesScript.onload = callback;
    document.body.appendChild(ripplesScript);
  } else {
    callback();
  }
};

export default function WebGLWaterRipples({
  image,
  intensity = 3,
  rippleCount = 2,
  rippleInterval = 4000,
  rippleSize = 30,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    loadRippleScript(() => {
      if (window.$ && typeof window.$.fn.ripples === "function") {
        console.log("✅ Ripples.js loaded");

        // Destroy any previous instance
        window.$(containerRef.current).ripples("destroy");

        // Map intensity to perturbance value
        const mappedIntensity = 0.01 + (intensity / 100) * 0.05;

        // Initialize ripples effect
        window.$(containerRef.current).ripples({
          resolution: 512,
          perturbance: mappedIntensity,
          interactive: true,
        });

        // Add ripples periodically
        const intervalId = setInterval(() => {
          const $el = window.$(containerRef.current);
          for (let i = 0; i < rippleCount; i++) {
            const x = Math.random() * $el.outerWidth();
            const y = Math.random() * $el.outerHeight();
            $el.ripples("drop", x, y, rippleSize, 0.02 + Math.random() * 0.02);
          }
        }, rippleInterval);

        // Cleanup
        return () => {
          clearInterval(intervalId);
          window.$(containerRef.current).ripples("destroy");
        };
      } else {
        console.error("❌ Ripples.js failed to load");
      }
    });
  }, [intensity, rippleCount, rippleInterval, rippleSize]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100vh",
        backgroundImage: `url(${image})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
