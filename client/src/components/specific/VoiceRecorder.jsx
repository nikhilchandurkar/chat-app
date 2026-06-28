import React, { useState, useRef, useCallback } from "react";
import { IconButton, Box, Typography, Tooltip, CircularProgress } from "@mui/material";
import { Mic as MicIcon, Stop as StopIcon } from "@mui/icons-material";
import toast from "react-hot-toast";
import { useDispatch } from "react-redux";
import { setUploadingLoader } from "../../redux/reducers/misc";
import { useSendAttachmentsMutation } from "../../redux/api/api";

const VoiceRecorder = ({ chatId }) => {
  const dispatch = useDispatch();
  const [sendAttachments] = useSendAttachmentsMutation();

  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isPulsing, setIsPulsing] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start(100); // collect data every 100ms
      setIsRecording(true);
      setIsPulsing(true);
      setDuration(0);

      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (err) {
      toast.error("Microphone access denied");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;

    clearInterval(timerRef.current);
    setIsRecording(false);
    setIsPulsing(false);

    return new Promise((resolve) => {
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

        // Stop microphone tracks
        streamRef.current?.getTracks().forEach((t) => t.stop());

        if (audioBlob.size < 1000) {
          toast.error("Recording too short");
          setDuration(0);
          return resolve();
        }

        // Upload via existing attachment pipeline
        const formData = new FormData();
        formData.append("chatId", chatId);
        formData.append("files", audioBlob, `voice-note-${Date.now()}.webm`);

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
        }
        resolve();
      };
      mediaRecorderRef.current.stop();
    });
  }, [chatId, dispatch, sendAttachments]);

  const formatDuration = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      {isRecording && (
        <Typography variant="caption" color="error" sx={{ fontVariantNumeric: "tabular-nums", minWidth: 36 }}>
          {formatDuration(duration)}
        </Typography>
      )}
      <Tooltip title={isRecording ? "Stop & Send" : "Record Voice Note"}>
        <IconButton
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          sx={{
            bgcolor: isRecording ? "error.main" : "secondary.main",
            color: "white",
            width: 36,
            height: 36,
            animation: isPulsing ? "pulse 1.2s infinite" : "none",
            "@keyframes pulse": {
              "0%": { boxShadow: "0 0 0 0 rgba(211,47,47,0.6)" },
              "70%": { boxShadow: "0 0 0 10px rgba(211,47,47,0)" },
              "100%": { boxShadow: "0 0 0 0 rgba(211,47,47,0)" },
            },
            "&:hover": { bgcolor: isRecording ? "error.dark" : "secondary.dark" },
            transition: "background-color 0.2s",
          }}
        >
          {isRecording ? <StopIcon sx={{ fontSize: 18 }} /> : <MicIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default VoiceRecorder;
