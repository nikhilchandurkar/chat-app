import React, { useState, useRef, useCallback, useEffect } from "react";
import { IconButton, Box, Typography, Tooltip, Stack, Chip } from "@mui/material";
import { Close as CloseIcon, Mic as MicIcon, Send as SendIcon, Stop as StopIcon, Whatshot as FlameIcon } from "@mui/icons-material";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useDispatch } from "react-redux";
import { setUploadingLoader } from "../../redux/reducers/misc";
import { useSendAttachmentsMutation } from "../../redux/api/api";
import { triggerHaptic, isAnimationEnabled } from "../../utils/feedback";

const NUM_WAVE_BARS = 14;

const VoiceRecorder = ({ chatId, topicName = "", autoStart = false, onCancel }) => {
  const dispatch = useDispatch();
  const [sendAttachments] = useSendAttachmentsMutation();

  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [viewOnce, setViewOnce] = useState(false);
  const [waveBars, setWaveBars] = useState(() => Array(NUM_WAVE_BARS).fill(4));

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const discardRef = useRef(false);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

  const cleanupTracks = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      clearTimeout(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setWaveBars(Array(NUM_WAVE_BARS).fill(4));
  }, []);

  const startVisualizer = useCallback((stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateBars = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Sample frequency buckets into NUM_WAVE_BARS
        const bars = [];
        const step = Math.floor(dataArray.length / NUM_WAVE_BARS);
        for (let i = 0; i < NUM_WAVE_BARS; i++) {
          const val = dataArray[i * step] || 0;
          // Scale from 0-255 to 4-26 px
          const height = Math.max(4, Math.min(26, Math.round((val / 255) * 26)));
          bars.push(height);
        }
        setWaveBars(bars);
        if (isAnimationEnabled()) {
          animFrameRef.current = requestAnimationFrame(updateBars);
        } else {
          animFrameRef.current = setTimeout(updateBars, 160);
        }
      };

      updateBars();
    } catch {
      // If Web Audio isn't available, bars stay at subtle baseline
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      discardRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.("audio/webm")
          ? "audio/webm"
          : undefined;
      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);
      triggerHaptic(18);

      startVisualizer(stream);

      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      toast.error("Microphone permission denied");
      onCancel?.();
    }
  }, [onCancel, startVisualizer]);

  useEffect(() => {
    if (autoStart) {
      startRecording();
    }
    return () => {
      discardRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      cleanupTracks();
    };
  }, [autoStart, startRecording, cleanupTracks]);

  const cancelRecording = useCallback(() => {
    discardRef.current = true;
    cleanupTracks();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setDuration(0);
    triggerHaptic(12);
    onCancel?.();
  }, [cleanupTracks, onCancel]);

  const stopAndSendRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      onCancel?.();
      return;
    }

    discardRef.current = false;
    cleanupTracks();
    setIsRecording(false);
    triggerHaptic([12, 30, 12]);

    return new Promise((resolve) => {
      mediaRecorderRef.current.onstop = async () => {
        if (discardRef.current) {
          setDuration(0);
          return resolve();
        }
        const mime = mediaRecorderRef.current?.mimeType || "audio/webm";
        const ext = mime.includes("mp4") ? "m4a" : "webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mime });

        if (audioBlob.size < 800) {
          toast.error("Recording too short");
          setDuration(0);
          onCancel?.();
          return resolve();
        }

        const formData = new FormData();
        formData.append("chatId", chatId);
        formData.append("files", audioBlob, `voice-note-${Date.now()}.${ext}`);
        if (viewOnce) formData.append("view_once", "true");
        if (topicName && topicName !== "all") formData.append("topic_name", topicName);

        dispatch(setUploadingLoader(true));
        const toastId = toast.loading("Sending voice note...");
        try {
          const res = await sendAttachments(formData);
          if (res.data) toast.success("Voice note sent!", { id: toastId });
          else toast.error("Failed to send voice note", { id: toastId });
        } catch {
          toast.error("Failed to send voice note", { id: toastId });
        } finally {
          dispatch(setUploadingLoader(false));
          setDuration(0);
          onCancel?.();
        }
        resolve();
      };
      mediaRecorderRef.current.stop();
    });
  }, [chatId, cleanupTracks, dispatch, onCancel, sendAttachments, topicName, viewOnce]);

  const formatDuration = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 6 }}
      transition={{ type: "spring", stiffness: 450, damping: 28 }}
      style={{ width: "100%" }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{
          width: "100%",
          px: 1.5,
          py: 0.75,
          borderRadius: "24px",
          border: "1px solid",
          borderColor: isRecording ? "error.main" : "divider",
          bgcolor: isRecording ? "rgba(225,29,72,0.06)" : "background.paper",
          transition: "all 0.2s ease",
          boxShadow: isRecording ? "0 0 16px rgba(225, 29, 72, 0.12)" : "none",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.25} minWidth={0} sx={{ flex: 1 }}>
          <Box
            sx={{
              position: "relative",
              width: 12,
              height: 12,
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                bgcolor: isRecording ? "#E11D48" : "text.disabled",
                boxShadow: isRecording ? "0 0 8px #E11D48" : "none",
                animation: isRecording ? "beaconRipple 1.4s infinite" : "none",
                "@keyframes beaconRipple": {
                  "0%": { transform: "scale(0.9)", opacity: 1 },
                  "50%": { transform: "scale(1.3)", opacity: 0.6 },
                  "100%": { transform: "scale(0.9)", opacity: 1 },
                },
              }}
            />
          </Box>

          <Typography
            variant="body2"
            fontWeight={700}
            sx={{
              fontVariantNumeric: "tabular-nums",
              color: isRecording ? "#E11D48" : "text.secondary",
              minWidth: 48,
            }}
          >
            {formatDuration(duration)}
          </Typography>

          {/* Real-time live audio waveform visualizer */}
          {isRecording && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "2.5px",
                height: "26px",
                flex: 1,
                maxWidth: 160,
                overflow: "hidden",
                mx: 0.5,
              }}
            >
              {waveBars.map((height, i) => (
                <Box
                  key={i}
                  sx={{
                    width: "3px",
                    height: `${height}px`,
                    borderRadius: "3px",
                    bgcolor: "#E11D48",
                    opacity: 0.85,
                    transition: "height 0.06s ease",
                    transformOrigin: "center",
                  }}
                />
              ))}
            </Box>
          )}
        </Stack>

        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Tooltip title="Disappearing View-Once Voice Note">
            <Chip
              size="small"
              clickable
              icon={<FlameIcon sx={{ fontSize: 14 }} />}
              label="View Once"
              color={viewOnce ? "error" : "default"}
              variant={viewOnce ? "filled" : "outlined"}
              onClick={() => {
                triggerHaptic(8);
                setViewOnce((v) => !v);
              }}
              sx={{ height: 24, fontSize: "0.7rem", fontWeight: 600 }}
            />
          </Tooltip>
          <Tooltip title="Discard recording">
            <IconButton size="small" onClick={cancelRecording} color="inherit" aria-label="Cancel voice recording">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {!isRecording ? (
            <Tooltip title="Start recording">
              <IconButton
                size="small"
                onClick={startRecording}
                sx={{
                  bgcolor: "#E11D48",
                  color: "white",
                  "&:hover": { bgcolor: "#BE123C" },
                  transition: "transform 0.15s ease",
                  "&:active": { transform: "scale(0.92)" },
                }}
                aria-label="Start voice recording"
              >
                <MicIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Stop & send voice note">
              <IconButton
                size="small"
                onClick={stopAndSendRecording}
                sx={{
                  bgcolor: "#236B4A",
                  color: "white",
                  "&:hover": { bgcolor: "#1B573C" },
                  transition: "transform 0.15s ease",
                  "&:active": { transform: "scale(0.92)" },
                }}
                aria-label="Send voice note"
              >
                {duration < 1 ? <StopIcon fontSize="small" /> : <SendIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>
    </motion.div>
  );
};

export default VoiceRecorder;
