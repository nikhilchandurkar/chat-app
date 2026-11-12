import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Close as CloseIcon,
  ExpandLess as CollapseIcon,
  ExpandMore as ExpandIcon,
  Headphones as HeadphonesIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Sync as SyncIcon,
} from "@mui/icons-material";
import toast from "react-hot-toast";
import { extractYouTubeId } from "../../utils/interactive";

const PRESETS = [
  { id: "jfKfPfyJRdk", label: "🎧 Lofi Beats" },
  { id: "4xDzrJKXOOY", label: "🌆 Synthwave Chill" },
  { id: "ambient_pad", label: "🌧️ Ambient Focus Synth" },
];

/**
 * Synchronized Listen Together / Watch Party controller inside any DM or Group.
 */
const WatchPartyBar = ({ open, onClose, chatId, socket, currentUserId, isDark }) => {
  const iframeRef = useRef(null);
  const ambientCtxRef = useRef(null);
  const ambientTimerRef = useRef(null);

  const [session, setSession] = useState(null);
  const [joined, setJoined] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [urlInput, setUrlInput] = useState("");
  const [floatingEmoji, setFloatingEmoji] = useState("");

  const stopAmbientSynth = () => {
    if (ambientTimerRef.current) {
      clearInterval(ambientTimerRef.current);
      ambientTimerRef.current = null;
    }
    if (ambientCtxRef.current && ambientCtxRef.current.state !== "closed") {
      ambientCtxRef.current.close().catch(() => {});
      ambientCtxRef.current = null;
    }
  };

  const startAmbientSynth = () => {
    stopAmbientSynth();
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      ambientCtxRef.current = ctx;
      const chords = [
        [261.63, 329.63, 392.0],
        [220.0, 261.63, 329.63],
        [174.61, 220.0, 261.63],
        [196.0, 246.94, 293.66],
      ];
      let step = 0;
      const playChord = () => {
        if (!ambientCtxRef.current) return;
        const freqs = chords[step % chords.length];
        step++;
        const now = ctx.currentTime;
        freqs.forEach((f) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(f, now);
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.025, now + 0.6);
          gain.gain.exponentialRampToValueAtTime(0.0005, now + 3.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 3.3);
        });
      };
      playChord();
      ambientTimerRef.current = setInterval(playChord, 3200);
    } catch {
      // ignore
    }
  };

  const sendYtCommand = (func, args = []) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func, args }),
        "https://www.youtube.com"
      );
    } catch {
      // ignore cross-origin restrictions
    }
  };

  useEffect(() => {
    if (!open) {
      stopAmbientSynth();
    }
    return () => stopAmbientSynth();
  }, [open]);

  useEffect(() => {
    if (!socket) return undefined;
    const handler = (data) => {
      if (!data || String(data.chatId) !== String(chatId)) return;
      if (data.action === "stop") {
        setSession(null);
        setJoined(false);
        stopAmbientSynth();
        return;
      }
      if (data.action === "reaction" && data.emoji) {
        setFloatingEmoji(data.emoji);
        setTimeout(() => setFloatingEmoji(""), 1400);
        return;
      }

      if (data.videoId) {
        setSession((prev) => ({
          videoId: data.videoId,
          title: data.title || prev?.title || "Watch Party",
          isPlaying: data.action === "pause" ? false : data.isPlaying !== false,
          hostName: data.senderName || prev?.hostName || "Friend",
          hostId: data.senderId || prev?.hostId,
          updatedAt: Date.now(),
        }));
      }

      const isSelf = String(data.senderId || "") === String(currentUserId || "");
      if (!isSelf && data.action === "start") {
        toast(`🎵 ${data.senderName || "Friend"} started Listen/Watch Together — tap Join!`);
      }

      if (joined && !isSelf) {
        if (data.videoId === "ambient_pad") {
          if (data.action === "pause") stopAmbientSynth();
          else startAmbientSynth();
        } else {
          if (data.action === "pause") sendYtCommand("pauseVideo");
          else if (data.action === "play") sendYtCommand("playVideo");
        }
      }
    };
    socket.on("watch.sync", handler);
    return () => socket.off("watch.sync", handler);
  }, [socket, chatId, currentUserId, joined]);

  const startSession = (videoId, title = "Watch Together") => {
    if (!videoId) {
      toast.error("Paste a valid YouTube link or choose a preset");
      return;
    }
    setSession({ videoId, title, isPlaying: true, hostName: "You", updatedAt: Date.now() });
    setJoined(true);
    setExpanded(true);
    if (videoId === "ambient_pad") startAmbientSynth();
    else stopAmbientSynth();

    socket?.emit?.("watch.sync", {
      chatId,
      action: "start",
      videoId,
      title,
      isPlaying: true,
    });
  };

  const togglePlayPause = () => {
    if (!session) return;
    const nextPlay = !session.isPlaying;
    setSession((s) => ({ ...s, isPlaying: nextPlay }));
    if (session.videoId === "ambient_pad") {
      if (nextPlay) startAmbientSynth();
      else stopAmbientSynth();
    } else {
      sendYtCommand(nextPlay ? "playVideo" : "pauseVideo");
    }
    socket?.emit?.("watch.sync", {
      chatId,
      action: nextPlay ? "play" : "pause",
      videoId: session.videoId,
      title: session.title,
      isPlaying: nextPlay,
    });
  };

  const handleJoinRemote = () => {
    if (!session) return;
    setJoined(true);
    setExpanded(true);
    if (session.videoId === "ambient_pad" && session.isPlaying) {
      startAmbientSynth();
    }
    socket?.emit?.("watch.sync", { chatId, action: "reaction", emoji: "👋" });
  };

  const handleStopAll = () => {
    stopAmbientSynth();
    setSession(null);
    setJoined(false);
    socket?.emit?.("watch.sync", { chatId, action: "stop" });
    onClose?.();
  };

  if (!open && !session) return null;

  return (
    <Paper
      square
      elevation={0}
      sx={{
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: isDark ? "#1B2420" : "#EEF6F1",
        px: { xs: 1.25, sm: 2 },
        py: 1,
        zIndex: 10,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center" minWidth={0}>
          <HeadphonesIcon color="primary" fontSize="small" />
          <Typography variant="subtitle2" fontWeight={700} noWrap>
            {session ? `${session.title} (${session.hostName})` : "Listen / Watch Together"}
          </Typography>
          {floatingEmoji && (
            <Chip size="small" label={floatingEmoji} color="primary" sx={{ height: 20 }} />
          )}
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {session && !joined && (
            <Button size="small" variant="contained" onClick={handleJoinRemote} sx={{ borderRadius: 2 }}>
              Join Together
            </Button>
          )}
          {session && joined && (
            <>
              <Tooltip title={session.isPlaying ? "Pause for everyone" : "Play for everyone"}>
                <IconButton size="small" color="primary" onClick={togglePlayPause}>
                  {session.isPlaying ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Button
                size="small"
                variant="outlined"
                onClick={() => socket?.emit?.("watch.sync", { chatId, action: "reaction", emoji: "🔥" })}
                sx={{ minWidth: 0, px: 0.75 }}
              >
                🔥
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => socket?.emit?.("watch.sync", { chatId, action: "reaction", emoji: "❤️" })}
                sx={{ minWidth: 0, px: 0.75 }}
              >
                ❤️
              </Button>
            </>
          )}
          <IconButton size="small" onClick={() => setExpanded((e) => !e)}>
            {expanded ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
          </IconButton>
          <IconButton size="small" onClick={handleStopAll}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      <Collapse in={expanded}>
        <Stack spacing={1} mt={1}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={0.75}>
            <TextField
              size="small"
              fullWidth
              placeholder="Paste YouTube URL or Video ID to watch/listen together..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <Button
              size="small"
              variant="contained"
              startIcon={<SyncIcon />}
              onClick={() => {
                const vid = extractYouTubeId(urlInput);
                startSession(vid, "YouTube Watch Party");
                setUrlInput("");
              }}
              sx={{ flexShrink: 0 }}
            >
              Connect &amp; Play
            </Button>
          </Stack>

          <Stack direction="row" spacing={0.75} flexWrap="wrap">
            {PRESETS.map((p) => (
              <Chip
                key={p.id}
                size="small"
                clickable
                color={session?.videoId === p.id ? "primary" : "default"}
                variant={session?.videoId === p.id ? "filled" : "outlined"}
                label={p.label}
                onClick={() => startSession(p.id, p.label)}
              />
            ))}
          </Stack>

          {session && joined && session.videoId !== "ambient_pad" && (
            <Box
              sx={{
                position: "relative",
                width: "100%",
                maxWidth: 480,
                aspectRatio: "16 / 9",
                borderRadius: 2,
                overflow: "hidden",
                bgcolor: "#000",
                mx: "auto",
              }}
            >
              <iframe
                ref={iframeRef}
                title="Watch Party Player"
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${encodeURIComponent(session.videoId)}?enablejsapi=1&autoplay=1&rel=0`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                style={{ border: 0 }}
              />
            </Box>
          )}

          {session && joined && session.videoId === "ambient_pad" && (
            <Typography variant="caption" color="primary" fontWeight={600}>
              {session.isPlaying ? "🎵 Playing synchronized Ambient Lo-Fi synth chords..." : "⏸️ Paused"}
            </Typography>
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
};

export default WatchPartyBar;
