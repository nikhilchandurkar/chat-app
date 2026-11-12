import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
  Slider,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add as AddFrameIcon,
  Close as CloseIcon,
  DeleteOutline as ClearIcon,
  GifBox as GifIcon,
  Image as PhotoIcon,
  Send as SendIcon,
} from "@mui/icons-material";
import toast from "react-hot-toast";
import { createPresetAnimatedGifFile, encodeFramesToGifBlob, GIF_PRESETS } from "../../utils/gifEncoder";

const DRAW_COLORS = ["#FFFFFF", "#22C55E", "#EF4444", "#FACC15", "#38BDF8", "#F472B6"];

const GifStudioDialog = ({ open, onClose, onSendGifFile }) => {
  const [tab, setTab] = useState(0);
  const [busyId, setBusyId] = useState("");
  const [sending, setSending] = useState(false);

  // Custom GIF Studio state
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [brushColor, setBrushColor] = useState(DRAW_COLORS[1]);
  const [caption, setCaption] = useState("");
  const [frames, setFrames] = useState([]); // Array<{ url, imageData }>
  const [delayCs, setDelayCs] = useState(18);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (open && tab === 1 && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#16201A";
      ctx.fillRect(0, 0, 220, 160);
    }
  }, [open, tab]);

  const handleSendPreset = async (preset) => {
    setBusyId(preset.id);
    try {
      const file = await createPresetAnimatedGifFile(preset);
      await onSendGifFile(file);
      onClose();
    } catch {
      toast.error("Failed to generate GIF");
    } finally {
      setBusyId("");
    }
  };

  const getCanvasPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDraw = (e) => {
    if (!canvasRef.current) return;
    drawingRef.current = true;
    const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true });
    const pt = getCanvasPoint(e);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  };

  const moveDraw = (e) => {
    if (!drawingRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true });
    const pt = getCanvasPoint(e);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const endDraw = () => {
    drawingRef.current = false;
  };

  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#16201A";
    ctx.fillRect(0, 0, 220, 160);
  };

  const captureCanvasFrame = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true });
    if (caption.trim()) {
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(caption.trim().slice(0, 24), 110, 144);
    }
    const imgData = ctx.getImageData(0, 0, 220, 160);
    const dataUrl = canvasRef.current.toDataURL("image/png");
    setFrames((prev) => [...prev.slice(-11), { url: dataUrl, imageData: imgData }]);
  };

  const handleImportImagesToFrames = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 8);
    if (!files.length) return;
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = 220;
    tmpCanvas.height = 160;
    const ctx = tmpCanvas.getContext("2d", { willReadFrequently: true });

    const added = [];
    for (const file of files) {
      const url = URL.createObjectURL(file);
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          ctx.fillStyle = "#16201A";
          ctx.fillRect(0, 0, 220, 160);
          const scale = Math.min(220 / img.width, 160 / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (220 - w) / 2, (160 - h) / 2, w, h);
          added.push({
            url: tmpCanvas.toDataURL("image/png"),
            imageData: ctx.getImageData(0, 0, 220, 160),
          });
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
      });
    }
    setFrames((prev) => [...prev, ...added].slice(0, 12));
  };

  const handlePreviewCustomGif = () => {
    if (frames.length < 1) {
      toast.error("Capture or import at least 1 frame first.");
      return;
    }
    const sourceFrames =
      frames.length === 1 ? [frames[0].imageData, frames[0].imageData] : frames.map((f) => f.imageData);
    const blob = encodeFramesToGifBlob(sourceFrames, { width: 220, height: 160, delayCs });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(blob));
  };

  const handleCreateAndSend = async () => {
    if (frames.length < 1) {
      toast.error("Capture at least 1 frame to create a GIF.");
      return;
    }
    setSending(true);
    try {
      const sourceFrames =
        frames.length === 1 ? [frames[0].imageData, frames[0].imageData] : frames.map((f) => f.imageData);
      const blob = encodeFramesToGifBlob(sourceFrames, { width: 220, height: 160, delayCs });
      const gifFile = new File([blob], `custom-${Date.now()}.gif`, { type: "image/gif" });
      await onSendGifFile(gifFile);
      setFrames([]);
      setPreviewUrl("");
      onClose();
    } catch {
      toast.error("Failed to create & send GIF");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.25 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <GifIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>GIFs &amp; Creator</Typography>
        </Stack>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
        <Tab label="Send GIF" />
        <Tab label="Create GIF" />
      </Tabs>

      <DialogContent sx={{ p: 2 }}>
        {tab === 0 ? (
          <Grid container spacing={1.25}>
            {GIF_PRESETS.map((preset) => (
              <Grid item xs={6} key={preset.id}>
                <Paper
                  onClick={() => !busyId && handleSendPreset(preset)}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    cursor: "pointer",
                    textAlign: "center",
                    background: `linear-gradient(135deg, ${preset.bgA}, ${preset.bgB})`,
                    color: "#FFFFFF",
                    transition: "transform 0.15s ease",
                    "&:hover": { transform: "scale(1.03)" },
                  }}
                >
                  {busyId === preset.id ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : (
                    <>
                      <Typography fontSize="2rem" lineHeight={1.1}>{preset.emoji}</Typography>
                      <Typography variant="caption" fontWeight={700} display="block" mt={0.5}>
                        {preset.label}
                      </Typography>
                    </>
                  )}
                </Paper>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Stack spacing={1.5}>
            <Box
              sx={{
                borderRadius: 2,
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                touchAction: "none",
                bgcolor: "#16201A",
                textAlign: "center",
              }}
            >
              <canvas
                ref={canvasRef}
                width={220}
                height={160}
                style={{ width: "100%", maxWidth: 260, height: "auto", cursor: "crosshair", display: "block", margin: "0 auto" }}
                onMouseDown={startDraw}
                onMouseMove={moveDraw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={moveDraw}
                onTouchEnd={endDraw}
              />
            </Box>

            <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={0.5}>
                {DRAW_COLORS.map((c) => (
                  <Box
                    key={c}
                    onClick={() => setBrushColor(c)}
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      bgcolor: c,
                      cursor: "pointer",
                      border: brushColor === c ? "2px solid #236B4A" : "1px solid #999",
                    }}
                  />
                ))}
              </Stack>
              <Button size="small" startIcon={<ClearIcon />} onClick={clearCanvas}>Clear</Button>
            </Stack>

            <TextField
              size="small"
              fullWidth
              placeholder="Optional caption stamp..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />

            <Stack direction="row" spacing={1}>
              <Button fullWidth size="small" variant="outlined" startIcon={<AddFrameIcon />} onClick={captureCanvasFrame}>
                Add Frame ({frames.length})
              </Button>
              <Button fullWidth size="small" component="label" variant="outlined" startIcon={<PhotoIcon />}>
                Photos → GIF
                <input type="file" hidden multiple accept="image/*" onChange={handleImportImagesToFrames} />
              </Button>
            </Stack>

            {frames.length > 0 && (
              <Stack direction="row" spacing={0.75} sx={{ overflowX: "auto", py: 0.5 }}>
                {frames.map((f, idx) => (
                  <Box key={idx} sx={{ position: "relative", flexShrink: 0 }}>
                    <img src={f.url} alt={`frame-${idx}`} style={{ width: 52, height: 38, borderRadius: 6, objectFit: "cover" }} />
                    <Chip
                      label={idx + 1}
                      size="small"
                      sx={{ position: "absolute", top: -6, right: -6, height: 16, fontSize: "0.6rem" }}
                    />
                  </Box>
                ))}
              </Stack>
            )}

            <Box>
              <Typography variant="caption" color="text.secondary">
                Frame Delay: {delayCs * 10}ms
              </Typography>
              <Slider size="small" min={6} max={45} value={delayCs} onChange={(_, v) => setDelayCs(v)} />
            </Box>

            {previewUrl && (
              <Box textAlign="center">
                <img src={previewUrl} alt="GIF Preview" style={{ maxWidth: "100%", borderRadius: 8 }} />
              </Box>
            )}

            <Stack direction="row" spacing={1}>
              <Button fullWidth variant="outlined" onClick={handlePreviewCustomGif} disabled={!frames.length}>
                Preview
              </Button>
              <Button
                fullWidth
                variant="contained"
                startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                onClick={handleCreateAndSend}
                disabled={sending || !frames.length}
              >
                Send GIF
              </Button>
            </Stack>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GifStudioDialog;

