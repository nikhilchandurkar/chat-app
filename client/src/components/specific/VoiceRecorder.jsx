import React, { useState, useRef, useCallback, useEffect } from "react";
import { IconButton, Box, Typography, Tooltip, Stack } from "@mui/material";
import { Close as CloseIcon, Mic as MicIcon, Send as SendIcon, Stop as StopIcon } from "@mui/icons-material";
import toast from "react-hot-toast";
import { useDispatch } from "react-redux";
import { setUploadingLoader } from "../../redux/reducers/misc";
import { useSendAttachmentsMutation } from "../../redux/api/api";
import { triggerHaptic } from "../../utils/feedback";

const VoiceRecorder = ({ chatId, autoStart = false, onCancel }) => {
  const dispatch = useDispatch();
  const [sendAttachments] = useSendAttachmentsMutation();

  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const discardRef = useRef(false);

  const cleanupTracks = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
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

      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      toast.error("Microphone permission denied");
      onCancel?.();
    }
  }, [onCancel]);

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
  }, [chatId, cleanupTracks, dispatch, onCancel, sendAttachments]);

  const formatDuration = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
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
        bgcolor: isRecording ? "rgba(211,47,47,0.06)" : "background.paper",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} minWidth={0}>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            bgcolor: isRecording ? "error.main" : "text.disabled",
            animation: isRecording ? "voicePulse 1.1s infinite" : "none",
            "@keyframes voicePulse": {
              "0%, 100%": { opacity: 1, transform: "scale(1)" },
              "50%": { opacity: 0.4, transform: "scale(1.3)" },
            },
          }}
        />
        <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>
          {isRecording ? `Recording ${formatDuration(duration)}` : "Voice Note Ready"}
        </Typography>
      </Stack>

      <Stack direction="row" alignItems="center" spacing={0.5}>
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
              sx={{ bgcolor: "error.main", color: "white", "&:hover": { bgcolor: "error.dark" } }}
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
              sx={{ bgcolor: "#236B4A", color: "white", "&:hover": { bgcolor: "#1B573C" } }}
              aria-label="Send voice note"
            >
              {duration < 1 ? <StopIcon fontSize="small" /> : <SendIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Stack>
  );
};

export default VoiceRecorder;
