import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AutoFixHigh as EraserIcon,
  Brush as BrushIcon,
  Close as CloseIcon,
  DeleteOutline as ClearIcon,
  Send as SendIcon,
} from "@mui/icons-material";

const COLORS = ["#111827", "#236B4A", "#EF4444", "#3B82F6", "#F59E0B", "#EC4899", "#8B5CF6", "#FFFFFF"];

const WhiteboardDialog = ({ open, onClose, chatId, socket, currentUserId, onSendImage, onRemoteInvite }) => {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const currentPointsRef = useRef([]);
  const [color, setColor] = useState("#236B4A");
  const [size, setSize] = useState(5);
  const [tool, setTool] = useState("pen");
  const [collaborator, setCollaborator] = useState("");
  const [sending, setSending] = useState(false);

  const drawSegment = useCallback((stroke) => {
    const canvas = canvasRef.current;
    if (!canvas || !stroke?.points?.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.tool === "eraser" ? "#FFFFFF" : stroke.color || "#236B4A";
    ctx.lineWidth = Number(stroke.size || 5);
    ctx.beginPath();
    const pts = stroke.points;
    ctx.moveTo(pts[0].x * canvas.width, pts[0].y * canvas.height);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x * canvas.width, pts[i].y * canvas.height);
    }
    if (pts.length === 1) {
      ctx.lineTo(pts[0].x * canvas.width + 0.5, pts[0].y * canvas.height + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }, []);

  const clearCanvasLocal = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      clearCanvasLocal();
      socket?.emit?.("whiteboard.sync", { chatId, action: "open" });
    }, 60);
    return () => clearTimeout(timer);
  }, [open, chatId, socket, clearCanvasLocal]);

  useEffect(() => {
    if (!socket) return undefined;
    const handler = (data) => {
      if (!data || String(data.chatId) !== String(chatId)) return;
      const isMe = String(data.senderId || "") === String(currentUserId || "");
      if (data.action === "open" && !isMe) {
        onRemoteInvite?.(data.senderName || "Someone");
      }
      if (!open) return;
      if (data.action === "stroke" && !isMe && data.stroke) {
        setCollaborator(data.senderName || "Friend");
        drawSegment(data.stroke);
      } else if (data.action === "clear" && !isMe) {
        clearCanvasLocal();
      }
    };
    socket.on("whiteboard.sync", handler);
    return () => socket.off("whiteboard.sync", handler);
  }, [socket, chatId, currentUserId, open, drawSegment, clearCanvasLocal, onRemoteInvite]);

  const getNormPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    const pt = getNormPoint(e);
    currentPointsRef.current = [pt];
    drawSegment({ points: [pt], color, size, tool });
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
    const pt = getNormPoint(e);
    const pts = currentPointsRef.current;
    const last = pts[pts.length - 1];
    pts.push(pt);
    drawSegment({ points: last ? [last, pt] : [pt], color, size, tool });
    if (pts.length >= 6) {
      socket?.emit?.("whiteboard.sync", {
        chatId,
        action: "stroke",
        stroke: { points: pts.slice(-6), color, size, tool },
      });
    }
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const pts = currentPointsRef.current;
    if (pts.length > 0) {
      socket?.emit?.("whiteboard.sync", {
        chatId,
        action: "stroke",
        stroke: { points: pts.slice(-8), color, size, tool },
      });
    }
    currentPointsRef.current = [];
  };

  const handleClearAll = () => {
    clearCanvasLocal();
    socket?.emit?.("whiteboard.sync", { chatId, action: "clear" });
  };

  const handleSendSketch = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !onSendImage || sending) return;
    setSending(true);
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) {
        const file = new File([blob], `doodle_${Date.now()}.png`, { type: "image/png" });
        await onSendImage(file);
        onClose();
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h6" fontWeight={700}>
            🎨 Live Whiteboard
          </Typography>
          {collaborator && <Chip size="small" color="success" label={`${collaborator} drawing live`} />}
        </Stack>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 0.5 }}>
        <Stack spacing={1.25}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              {COLORS.map((c) => (
                <Box
                  key={c}
                  onClick={() => {
                    setColor(c);
                    setTool("pen");
                  }}
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    bgcolor: c,
                    cursor: "pointer",
                    border: tool === "pen" && color === c ? "2.5px solid #236B4A" : "1px solid #CBD5E1",
                    transform: tool === "pen" && color === c ? "scale(1.12)" : "none",
                  }}
                />
              ))}
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Tooltip title="Brush">
                <IconButton
                  size="small"
                  color={tool === "pen" ? "primary" : "default"}
                  onClick={() => setTool("pen")}
                >
                  <BrushIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Eraser">
                <IconButton
                  size="small"
                  color={tool === "eraser" ? "primary" : "default"}
                  onClick={() => setTool("eraser")}
                >
                  <EraserIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Clear canvas for everyone">
                <IconButton size="small" color="error" onClick={handleClearAll}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="caption" color="text.secondary" minWidth={42}>
              Size: {size}
            </Typography>
            <Slider
              size="small"
              min={2}
              max={20}
              value={size}
              onChange={(_, v) => setSize(Number(v))}
              sx={{ maxWidth: 180 }}
            />
          </Stack>

          <Box
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "#FFFFFF",
              touchAction: "none",
            }}
          >
            <canvas
              ref={canvasRef}
              width={640}
              height={400}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair", touchAction: "none" }}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" startIcon={<SendIcon />} onClick={handleSendSketch} disabled={sending}>
          {sending ? "Sending..." : "Send Sketch to Chat"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WhiteboardDialog;

