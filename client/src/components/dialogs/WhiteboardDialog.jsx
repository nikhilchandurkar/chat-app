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
  Redo as RedoIcon,
  Send as SendIcon,
  Undo as UndoIcon,
} from "@mui/icons-material";

const COLORS = [
  "#111827", // Black
  "#236B4A", // Emerald Brand
  "#EF4444", // Red
  "#3B82F6", // Blue
  "#F59E0B", // Amber
  "#EC4899", // Pink
  "#8B5CF6", // Purple
  "#FFFFFF", // White
];

const MAX_HISTORY = 16;

/**
 * High-performance, 100% on-device whiteboard canvas.
 * Does NOT transmit raw mousemove/pointer events over WebSockets, preventing
 * socket saturation, connection buffer overflows, and high latency.
 * Exports finalized PNG doodle to chat on Send.
 */
const WhiteboardDialog = ({ open, onClose, chatId, onSendImage }) => {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  const [color, setColor] = useState("#236B4A");
  const [size, setSize] = useState(5);
  const [tool, setTool] = useState("pen"); // 'pen' | 'highlighter' | 'eraser'
  const [sending, setSending] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const saveHistorySnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      undoStackRef.current.push(data);
      if (undoStackRef.current.length > MAX_HISTORY) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      setCanUndo(true);
      setCanRedo(false);
    } catch {
      // ignore
    }
  }, []);

  const clearCanvasLocal = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    saveHistorySnapshot();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [saveHistorySnapshot]);

  // Initialize white canvas on open
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      undoStackRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
      redoStackRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
    }, 60);
    return () => clearTimeout(timer);
  }, [open]);

  const handleUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas || undoStackRef.current.length <= 1) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const current = undoStackRef.current.pop();
    redoStackRef.current.push(current);
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    if (prev) {
      ctx.putImageData(prev, 0, 0);
    }
    setCanUndo(undoStackRef.current.length > 1);
    setCanRedo(true);
  };

  const handleRedo = () => {
    const canvas = canvasRef.current;
    if (!canvas || redoStackRef.current.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const next = redoStackRef.current.pop();
    undoStackRef.current.push(next);
    ctx.putImageData(next, 0, 0);
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  };

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    const pt = getCanvasCoords(e);
    lastPointRef.current = pt;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "eraser") {
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = Number(size) * 2;
    } else if (tool === "highlighter") {
      ctx.strokeStyle = color + "55"; // 33% alpha
      ctx.lineWidth = Number(size) * 2.5;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = Number(size);
    }

    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pt.x + 0.1, pt.y + 0.1);
    ctx.stroke();
    ctx.restore();
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current || !lastPointRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const current = getCanvasCoords(e);
    const last = lastPointRef.current;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "eraser") {
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = Number(size) * 2;
    } else if (tool === "highlighter") {
      ctx.strokeStyle = color + "44";
      ctx.lineWidth = Number(size) * 2.5;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = Number(size);
    }

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    ctx.restore();

    lastPointRef.current = current;
  };

  const handlePointerUp = (e) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    saveHistorySnapshot();
  };

  const handleSendSketch = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !onSendImage || sending) return;
    setSending(true);
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
      if (blob) {
        const file = new File([blob], `sketch_${Date.now()}.png`, { type: "image/png" });
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
            🎨 Doodle & Sketch Board
          </Typography>
          <Chip size="small" variant="outlined" label="On-Device 60fps" sx={{ fontSize: "0.72rem", height: 22 }} />
        </Stack>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 0.5 }}>
        <Stack spacing={1.25}>
          {/* Tools & Colors Header */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
            <Stack direction="row" spacing={0.6} alignItems="center">
              {COLORS.map((c) => (
                <Box
                  key={c}
                  onClick={() => {
                    setColor(c);
                    if (tool === "eraser") setTool("pen");
                  }}
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    bgcolor: c,
                    cursor: "pointer",
                    border: (tool === "pen" || tool === "highlighter") && color === c ? "2.5px solid #236B4A" : "1px solid #CBD5E1",
                    transform: (tool === "pen" || tool === "highlighter") && color === c ? "scale(1.15)" : "none",
                    transition: "transform 0.15s ease",
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
              <Tooltip title="Undo">
                <span>
                  <IconButton size="small" disabled={!canUndo} onClick={handleUndo}>
                    <UndoIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Redo">
                <span>
                  <IconButton size="small" disabled={!canRedo} onClick={handleRedo}>
                    <RedoIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Clear canvas">
                <IconButton size="small" color="error" onClick={clearCanvasLocal}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          {/* Stroke size slider */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="caption" color="text.secondary" minWidth={45}>
              Size: {size}px
            </Typography>
            <Slider
              size="small"
              min={2}
              max={24}
              value={size}
              onChange={(_, v) => setSize(Number(v))}
              sx={{ maxWidth: 160 }}
            />
          </Stack>

          {/* Canvas Viewport */}
          <Box
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "#FFFFFF",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            <canvas
              ref={canvasRef}
              width={640}
              height={380}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                cursor: tool === "eraser" ? "cell" : "crosshair",
                touchAction: "none",
              }}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" startIcon={<SendIcon />} onClick={handleSendSketch} disabled={sending}>
          {sending ? "Sending..." : "Send Drawing to Chat"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WhiteboardDialog;
