import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion } from "framer-motion";

/**
 * Props:
 * text: string | string[]
 * typingSpeed: number
 * deletingSpeed: number
 * pauseDuration: number
 * loop: boolean
 * showCursor: boolean
 * startOnVisible: boolean
 * textColors: string[]
 * style: React.CSSProperties
 */
const TextAnimation = ({
  text,
  typingSpeed = 50,
  deletingSpeed = 30,
  pauseDuration = 2000,
  loop = true,
  showCursor = true,
  startOnVisible = true,
  textColors = ["#ffffff"],
  style = {},
}) => {
  const textArray = useMemo(() => (Array.isArray(text) ? text : [text || ""]), [text]);
  const [displayedText, setDisplayedText] = useState("");
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(!startOnVisible);

  const containerRef = useRef(null);

  // Start on visible
  useEffect(() => {
    if (!startOnVisible || !containerRef.current) return;
    const el = containerRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setIsVisible(true);
        });
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [startOnVisible]);

  // Typing effect
  useEffect(() => {
    if (!isVisible) return;
    let timeout;
    const currentText = textArray[currentTextIndex] || "";
    const run = () => {
      if (isDeleting) {
        if (displayedText.length === 0) {
          setIsDeleting(false);
          setCurrentTextIndex((i) => (i + 1) % textArray.length);
          timeout = setTimeout(() => {}, pauseDuration);
        } else {
          timeout = setTimeout(() => {
            setDisplayedText((prev) => prev.slice(0, -1));
          }, deletingSpeed);
        }
      } else {
        if (currentCharIndex < currentText.length) {
          timeout = setTimeout(() => {
            setDisplayedText((prev) => prev + currentText[currentCharIndex]);
            setCurrentCharIndex((i) => i + 1);
          }, typingSpeed);
        } else {
          if (loop || currentTextIndex < textArray.length - 1) {
            timeout = setTimeout(() => setIsDeleting(true), pauseDuration);
          }
        }
      }
    };

    if (currentCharIndex === 0 && !isDeleting && displayedText === "") {
      timeout = setTimeout(run, 500);
    } else {
      run();
    }

    return () => timeout && clearTimeout(timeout);
  }, [
    displayedText,
    currentCharIndex,
    isDeleting,
    isVisible,
    textArray,
    currentTextIndex,
    typingSpeed,
    deletingSpeed,
    pauseDuration,
    loop,
  ]);

  const getCurrentTextColor = useCallback(() => {
    if (!textColors || textColors.length === 0) return "#ffffff";
    return textColors[currentTextIndex % textColors.length];
  }, [textColors, currentTextIndex]);

  return (
    <span ref={containerRef} style={{ ...style, whiteSpace: "pre-wrap" }}>
      <span style={{ color: getCurrentTextColor() }}>{displayedText}</span>
      {showCursor && (
        <motion.span
          style={{ marginLeft: 2, display: "inline-block", color: getCurrentTextColor() }}
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
        >
          |
        </motion.span>
      )}
    </span>
  );
};

export default TextAnimation;
