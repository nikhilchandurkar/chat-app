import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Box, Typography, IconButton, Chip, useTheme } from "@mui/material";
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Mic as MicIcon,
} from "@mui/icons-material";
import { isAnimationEnabled } from "../../utils/feedback";

function formatSeconds(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

const NUM_BARS = 24;

export default function AudioWavePlayer({ src, fileName = "Voice message", duration: initialDuration }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const speeds = [1, 1.5, 2];

  // Deterministic heights based on fileName/src hash for a natural waveform look
  const barHeights = useMemo(() => {
    const seed = (src || fileName || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 17);
    const heights = [];
    for (let i = 0; i < NUM_BARS; i++) {
      const val = Math.abs(Math.sin(seed * (i + 1) * 0.45));
      heights.push(Math.round(6 + val * 18));
    }
    return heights;
  }, [src, fileName]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }, [isPlaying]);

  const cycleSpeed = useCallback((e) => {
    e.stopPropagation();
    const nextIdx = (speedIdx + 1) % speeds.length;
    setSpeedIdx(nextIdx);
    if (audioRef.current) {
      audioRef.current.playbackRate = speeds[nextIdx];
    }
  }, [speedIdx, speeds]);

  const handleSeek = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    if (audioRef.current && duration > 0) {
      audioRef.current.currentTime = ratio * duration;
      setCurrentTime(audioRef.current.currentTime);
    }
  }, [duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoaded);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoaded);
    };
  }, []);

  const progress = duration > 0 ? currentTime / duration : 0;
  const currentBarIdx = Math.floor(progress * NUM_BARS);

  const activeColor = isDark ? "#4B9B70" : "#236B4A";
  const inactiveColor = isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        p: 1.25,
        mt: 0.5,
        bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(35, 107, 74, 0.08)",
        borderRadius: "16px",
        maxWidth: "320px",
        width: "100%",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(35, 107, 74, 0.15)"}`,
      }}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause Button */}
      <IconButton
        onClick={togglePlay}
        size="small"
        sx={{
          bgcolor: activeColor,
          color: "#FFFFFF",
          width: 38,
          height: 38,
          flexShrink: 0,
          "&:hover": { bgcolor: activeColor, opacity: 0.9 },
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        {isPlaying ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
      </IconButton>

      {/* Waveform and Progress */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Clickable Scrub Waveform */}
        <Box
          onClick={handleSeek}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "2.5px",
            height: "26px",
            cursor: "pointer",
            userSelect: "none",
            py: 0.25,
          }}
          title="Click to seek"
        >
          {barHeights.map((h, i) => {
            const isFilled = i <= currentBarIdx;
            return (
              <Box
                key={i}
                sx={{
                  flex: 1,
                  height: `${h}px`,
                  borderRadius: "2px",
                  bgcolor: isFilled ? activeColor : inactiveColor,
                  transition: isAnimationEnabled() ? "background-color 0.1s ease, height 0.15s ease" : "none",
                }}
              />
            );
          })}
        </Box>

        {/* Time and Info Bar */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 0.35 }}>
          <Typography variant="caption" sx={{ fontSize: "0.68rem", color: "text.secondary", fontWeight: 600 }}>
            {formatSeconds(currentTime)} / {formatSeconds(duration)}
          </Typography>

          {/* Speed Selector Pill */}
          <Chip
            label={`${speeds[speedIdx]}x`}
            size="small"
            onClick={cycleSpeed}
            sx={{
              height: 18,
              fontSize: "0.65rem",
              fontWeight: 700,
              cursor: "pointer",
              bgcolor: isDark ? "rgba(255,255,255,0.12)" : "rgba(35, 107, 74, 0.14)",
              color: activeColor,
              "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.2)" : "rgba(35, 107, 74, 0.25)" },
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}
