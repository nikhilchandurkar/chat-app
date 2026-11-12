import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Brush as BrushIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Crop as CropIcon,
  RestartAlt as ResetIcon,
  RotateLeft as RotateLeftIcon,
  RotateRight as RotateRightIcon,
  Send as SendIcon,
  TextFields as TextIcon,
  Undo as UndoIcon,
  VolumeOff as MuteIcon,
  Whatshot as FlameIcon,
} from "@mui/icons-material";
import toast from "react-hot-toast";

const BRUSH_COLORS = ["#EF4444", "#22C55E", "#F59E0B", "#3B82F6", "#FFFFFF", "#111827"];

const ASPECT_OPTIONS = [
  { id: "free", label: "Free", ratio: null },
  { id: "square", label: "1:1", ratio: 1 },
  { id: "4_3", label: "4:3", ratio: 4 / 3 },
  { id: "16_9", label: "16:9", ratio: 16 / 9 },
];

const formatSec = (s) => {
  const sec = Math.max(0, Math.round(Number(s) || 0));
  const m = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${m}:${rem < 10 ? "0" : ""}${rem}`;
};

const loadImageEl = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

const canvasToBlob = (canvas, mime = "image/jpeg", quality = 0.92) =>
  new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), mime, quality));

const MediaEditorDialog = ({
  open,
  files = [],
  mediaKind = "image",
  initialViewOnce = false,
  onClose,
  onConfirmSend,
}) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [editedImages, setEditedImages] = useState({}); // idx -> Blob/File once committed
  const [previewUrls, setPreviewUrls] = useState([]);
  const [caption, setCaption] = useState("");
  const [viewOnce, setViewOnce] = useState(initialViewOnce);

  // Image editor state for activeIdx
  const [tool, setTool] = useState("draw"); // 'draw' | 'crop' | 'text'
  const [brushColor, setBrushColor] = useState("#EF4444");
  const [brushSize, setBrushSize] = useState(5);
  const [strokes, setStrokes] = useState([]);
  const [textOverlay, setTextOverlay] = useState({ text: "", color: "#FFFFFF", xRatio: 0.5, yRatio: 0.5 });
  const [cropAspect, setCropAspect] = useState(null);
  const [cropRect, setCropRect] = useState(null); // normalized 0..1 {x, y, w, h}
  const [workingDataUrl, setWorkingDataUrl] = useState("");
  const [workingDims, setWorkingDims] = useState({ w: 0, h: 0 });
  const [gifEdited, setGifEdited] = useState(false);

  // Video editor state
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimRange, setTrimRange] = useState([0, 0]);
  const [videoMuted, setVideoMuted] = useState(false);
  const [videoRotate, setVideoRotate] = useState(0);
  const [processingVideo, setProcessingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const editedImagesRef = useRef({});
  editedImagesRef.current = editedImages;
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef(null);
  const cropDragStartRef = useRef(null);
  const activeUrl = previewUrls[activeIdx] || "";
  const activeFile = files[activeIdx];
  const isAnimatedGif = mediaKind === "image" && activeFile?.type === "image/gif" && !gifEdited;

  useEffect(() => {
    if (!open || !files.length) return;
    setViewOnce(initialViewOnce);
    setActiveIdx(0);
    setEditedImages({});
    setCaption("");
    setVideoMuted(false);
    setVideoRotate(0);
    setProcessingVideo(false);
    setVideoProgress(0);
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [open, files, initialViewOnce]);

  // Reset per-image canvas state when switching item
  useEffect(() => {
    if (!open || mediaKind !== "image" || !previewUrls[activeIdx]) return;
    const cachedBlob = editedImagesRef.current[activeIdx];
    const srcUrl = cachedBlob ? URL.createObjectURL(cachedBlob) : previewUrls[activeIdx];
    setWorkingDataUrl(srcUrl);
    setStrokes([]);
    setCropRect(null);
    setTextOverlay({ text: "", color: "#FFFFFF", xRatio: 0.5, yRatio: 0.5 });
    setGifEdited(false);
    setTool("draw");
    return () => {
      if (cachedBlob) URL.revokeObjectURL(srcUrl);
    };
  }, [open, activeIdx, previewUrls, mediaKind]);

  const redrawImageCanvas = useCallback(async () => {
    if (!workingDataUrl || !canvasRef.current) return;
    try {
      const img = await loadImageEl(workingDataUrl);
      const canvas = canvasRef.current;
      const maxDim = 960;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      setWorkingDims({ w: img.width, h: img.height });
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      for (const st of strokes) {
        if (!st.points?.length) continue;
        ctx.strokeStyle = st.color;
        ctx.lineWidth = st.size;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        st.points.forEach(([nx, ny], idx) => {
          const px = nx * w;
          const py = ny * h;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }

      if (textOverlay.text.trim()) {
        const fontPx = Math.max(18, Math.round(w * 0.052));
        ctx.font = `700 ${fontPx}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const tx = textOverlay.xRatio * w;
        const ty = textOverlay.yRatio * h;
        ctx.lineWidth = Math.max(3, Math.round(fontPx * 0.14));
        ctx.strokeStyle = "rgba(0,0,0,0.72)";
        ctx.strokeText(textOverlay.text, tx, ty);
        ctx.fillStyle = textOverlay.color;
        ctx.fillText(textOverlay.text, tx, ty);
      }

      if (tool === "crop" && cropRect && cropRect.w > 0.02 && cropRect.h > 0.02) {
        const rx = cropRect.x * w;
        const ry = cropRect.y * h;
        const rw = cropRect.w * w;
        const rh = cropRect.h * h;
        ctx.fillStyle = "rgba(0,0,0,0.48)";
        ctx.fillRect(0, 0, w, ry);
        ctx.fillRect(0, ry + rh, w, h - (ry + rh));
        ctx.fillRect(0, ry, rx, rh);
        ctx.fillRect(rx + rw, ry, w - (rx + rw), rh);
        ctx.strokeStyle = "#22C55E";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(rx, ry, rw, rh);
      }
    } catch {
      // ignore image load errors
    }
  }, [workingDataUrl, strokes, textOverlay, tool, cropRect]);

  useEffect(() => {
    if (open && mediaKind === "image") {
      redrawImageCanvas();
    }
  }, [open, mediaKind, redrawImageCanvas]);

  const bakeCurrentImageFile = useCallback(async () => {
    if (!activeFile) return null;
    if (isAnimatedGif && strokes.length === 0 && !textOverlay.text.trim()) {
      return editedImages[activeIdx] || activeFile;
    }
    const baseImg = await loadImageEl(workingDataUrl);
    const out = document.createElement("canvas");
    out.width = baseImg.width;
    out.height = baseImg.height;
    const ctx = out.getContext("2d");
    ctx.drawImage(baseImg, 0, 0, out.width, out.height);

    const displayW = canvasRef.current?.width || out.width;
    const ratio = out.width / displayW;

    for (const st of strokes) {
      if (!st.points?.length) continue;
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.size * ratio;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      st.points.forEach(([nx, ny], idx) => {
        const px = nx * out.width;
        const py = ny * out.height;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    if (textOverlay.text.trim()) {
      const fontPx = Math.max(22, Math.round(out.width * 0.052));
      ctx.font = `700 ${fontPx}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tx = textOverlay.xRatio * out.width;
      const ty = textOverlay.yRatio * out.height;
      ctx.lineWidth = Math.max(3, Math.round(fontPx * 0.14));
      ctx.strokeStyle = "rgba(0,0,0,0.72)";
      ctx.strokeText(textOverlay.text, tx, ty);
      ctx.fillStyle = textOverlay.color;
      ctx.fillText(textOverlay.text, tx, ty);
    }

    const usePng = activeFile.type === "image/png";
    const mime = usePng ? "image/png" : "image/jpeg";
    const blob = await canvasToBlob(out, mime, 0.92);
    const baseName = activeFile.name.replace(/\.[^.]+$/, "");
    const ext = usePng ? "png" : "jpg";
    return new File([blob], `${baseName}_edited.${ext}`, { type: mime });
  }, [activeFile, activeIdx, editedImages, isAnimatedGif, strokes, textOverlay, workingDataUrl]);

  const handleRotateImage = async (deg) => {
    if (!workingDataUrl) return;
    setGifEdited(true);
    const img = await loadImageEl(workingDataUrl);
    const c = document.createElement("canvas");
    const rad = (deg * Math.PI) / 180;
    const swap = Math.abs(deg) === 90;
    c.width = swap ? img.height : img.width;
    c.height = swap ? img.width : img.height;
    const ctx = c.getContext("2d");
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    setWorkingDataUrl(c.toDataURL("image/png"));
    setCropRect(null);
    setStrokes([]);
  };

  const handleApplyCrop = async () => {
    if (!cropRect || cropRect.w < 0.03 || cropRect.h < 0.03 || !workingDataUrl) return;
    setGifEdited(true);
    const img = await loadImageEl(workingDataUrl);
    const sx = Math.max(0, Math.round(cropRect.x * img.width));
    const sy = Math.max(0, Math.round(cropRect.y * img.height));
    const sw = Math.max(16, Math.round(cropRect.w * img.width));
    const sh = Math.max(16, Math.round(cropRect.h * img.height));
    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    setWorkingDataUrl(c.toDataURL("image/png"));
    setCropRect(null);
    setStrokes([]);
    setTool("draw");
    toast.success("Crop applied");
  };

  const getNormCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return [0.5, 0.5];
    const rect = canvas.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return [nx, ny];
  };

  const handleCanvasPointerDown = (e) => {
    if (mediaKind !== "image" || !canvasRef.current) return;
    const [nx, ny] = getNormCoords(e);
    if (tool === "text") {
      setTextOverlay((prev) => ({ ...prev, xRatio: nx, yRatio: ny }));
      return;
    }
    if (tool === "crop") {
      cropDragStartRef.current = [nx, ny];
      setCropRect({ x: nx, y: ny, w: 0, h: 0 });
      return;
    }
    if (tool === "draw") {
      setGifEdited(true);
      isDrawingRef.current = true;
      const stroke = { color: brushColor, size: brushSize, points: [[nx, ny]] };
      currentStrokeRef.current = stroke;
      setStrokes((prev) => [...prev, stroke]);
    }
  };

  const handleCanvasPointerMove = (e) => {
    if (tool === "crop" && cropDragStartRef.current && canvasRef.current) {
      const [nx, ny] = getNormCoords(e);
      const [sx, sy] = cropDragStartRef.current;
      let w = Math.abs(nx - sx);
      let h = Math.abs(ny - sy);
      if (cropAspect) {
        const aspectRatioCanvas = (canvasRef.current.height / canvasRef.current.width) * cropAspect;
        h = w / aspectRatioCanvas;
      }
      const x = nx < sx ? Math.max(0, sx - w) : sx;
      const y = ny < sy ? Math.max(0, sy - h) : sy;
      setCropRect({
        x,
        y,
        w: Math.min(1 - x, w),
        h: Math.min(1 - y, h),
      });
      return;
    }
    if (tool === "draw" && isDrawingRef.current && currentStrokeRef.current) {
      const [nx, ny] = getNormCoords(e);
      currentStrokeRef.current.points.push([nx, ny]);
      setStrokes((prev) => {
        const copy = prev.slice(0, -1);
        return [...copy, { ...currentStrokeRef.current, points: [...currentStrokeRef.current.points] }];
      });
    }
  };

  const handleCanvasPointerUp = () => {
    isDrawingRef.current = false;
    currentStrokeRef.current = null;
    cropDragStartRef.current = null;
  };

  const switchImageTab = async (nextIdx) => {
    if (nextIdx === activeIdx) return;
    if (mediaKind === "image") {
      try {
        const baked = await bakeCurrentImageFile();
        if (baked) setEditedImages((prev) => ({ ...prev, [activeIdx]: baked }));
      } catch {
        // ignore
      }
    }
    setActiveIdx(nextIdx);
  };

  const processTrimmedVideo = async (srcFile) => {
    const isTrimmed = videoDuration > 0 && (trimRange[0] > 0.25 || trimRange[1] < videoDuration - 0.25);
    if (!isTrimmed && !videoMuted && videoRotate === 0) {
      return srcFile;
    }
    if (typeof MediaRecorder === "undefined") {
      toast.error("Browser video re-encoding unavailable; sending original video.");
      return srcFile;
    }

    setProcessingVideo(true);
    setVideoProgress(0);
    return new Promise((resolve) => {
      const tempVideo = document.createElement("video");
      tempVideo.src = URL.createObjectURL(srcFile);
      tempVideo.muted = videoMuted;
      tempVideo.playsInline = true;

      tempVideo.onloadedmetadata = async () => {
        const startT = trimRange[0] || 0;
        const endT = trimRange[1] || tempVideo.duration || 10;
        const span = Math.max(0.5, endT - startT);
        const swap = videoRotate === 90 || videoRotate === 270;
        const w = swap ? tempVideo.videoHeight : tempVideo.videoWidth;
        const h = swap ? tempVideo.videoWidth : tempVideo.videoHeight;
        const scale = Math.min(1, 960 / Math.max(w || 640, h || 480));
        const cw = Math.max(2, Math.round((w || 640) * scale));
        const ch = Math.max(2, Math.round((h || 480) * scale));

        const c = document.createElement("canvas");
        c.width = cw;
        c.height = ch;
        const ctx = c.getContext("2d");

        const stream = c.captureStream(24);
        if (!videoMuted && tempVideo.captureStream) {
          try {
            const audioTracks = tempVideo.captureStream().getAudioTracks();
            audioTracks.forEach((tr) => stream.addTrack(tr));
          } catch {
            // proceed video-only if audio track capture restricted
          }
        }

        const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
          ? "video/webm;codecs=vp8,opus"
          : "video/webm";
        const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_500_000 });
        const chunks = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data?.size) chunks.push(ev.data);
        };
        recorder.onstop = () => {
          URL.revokeObjectURL(tempVideo.src);
          setProcessingVideo(false);
          const blob = new Blob(chunks, { type: "video/webm" });
          const baseName = srcFile.name.replace(/\.[^.]+$/, "");
          resolve(new File([blob], `${baseName}_edited.webm`, { type: "video/webm" }));
        };

        tempVideo.currentTime = startT;
        tempVideo.onseeked = () => {
          tempVideo.onseeked = null;
          recorder.start(250);
          tempVideo.play().catch(() => {});

          const drawFrame = () => {
            const elapsed = tempVideo.currentTime - startT;
            setVideoProgress(Math.min(100, Math.round((elapsed / span) * 100)));
            ctx.save();
            ctx.translate(cw / 2, ch / 2);
            ctx.rotate((videoRotate * Math.PI) / 180);
            const dw = swap ? ch : cw;
            const dh = swap ? cw : ch;
            ctx.drawImage(tempVideo, -dw / 2, -dh / 2, dw, dh);
            ctx.restore();

            if (tempVideo.currentTime >= endT || tempVideo.ended) {
              tempVideo.pause();
              if (recorder.state !== "inactive") recorder.stop();
              return;
            }
            requestAnimationFrame(drawFrame);
          };
          requestAnimationFrame(drawFrame);
        };
      };

      tempVideo.onerror = () => {
        URL.revokeObjectURL(tempVideo.src);
        setProcessingVideo(false);
        resolve(srcFile);
      };
    });
  };

  const handleSendAll = async () => {
    try {
      if (mediaKind === "image") {
        const currentBaked = await bakeCurrentImageFile();
        const finalFiles = files.map((orig, idx) =>
          idx === activeIdx ? currentBaked || orig : editedImages[idx] || orig
        );
        await onConfirmSend(finalFiles, caption.trim(), viewOnce);
      } else {
        const processed = await processTrimmedVideo(activeFile);
        await onConfirmSend([processed, ...files.slice(1)], caption.trim(), viewOnce);
      }
      onClose?.();
    } catch {
      toast.error("Failed to prepare media");
    }
  };

  return (
    <Dialog open={Boolean(open)} onClose={processingVideo ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.25 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {mediaKind === "video" ? "Edit Video Before Sending" : "Edit Photo Before Sending"}
        </Typography>
        <IconButton size="small" onClick={onClose} disabled={processingVideo} aria-label="Close media editor">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 2, pb: 1.5, pt: 0.5 }}>
        <Stack spacing={1.25}>
          {files.length > 1 && mediaKind === "image" && (
            <Stack direction="row" spacing={0.75} sx={{ overflowX: "auto", py: 0.25 }}>
              {files.map((f, idx) => (
                <Chip
                  key={`${f.name}-${idx}`}
                  size="small"
                  clickable
                  label={`#${idx + 1} ${f.name.slice(0, 12)}`}
                  color={idx === activeIdx ? "primary" : "default"}
                  variant={idx === activeIdx ? "filled" : "outlined"}
                  onClick={() => switchImageTab(idx)}
                />
              ))}
            </Stack>
          )}

          {mediaKind === "image" ? (
            <>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
                <Tooltip title="Rotate Left">
                  <IconButton size="small" onClick={() => handleRotateImage(-90)}>
                    <RotateLeftIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Rotate Right">
                  <IconButton size="small" onClick={() => handleRotateImage(90)}>
                    <RotateRightIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Chip
                  size="small"
                  clickable
                  icon={<CropIcon sx={{ fontSize: 15 }} />}
                  label="Crop"
                  color={tool === "crop" ? "primary" : "default"}
                  variant={tool === "crop" ? "filled" : "outlined"}
                  onClick={() => setTool("crop")}
                />
                <Chip
                  size="small"
                  clickable
                  icon={<BrushIcon sx={{ fontSize: 15 }} />}
                  label="Draw"
                  color={tool === "draw" ? "primary" : "default"}
                  variant={tool === "draw" ? "filled" : "outlined"}
                  onClick={() => setTool("draw")}
                />
                <Chip
                  size="small"
                  clickable
                  icon={<TextIcon sx={{ fontSize: 15 }} />}
                  label="Text"
                  color={tool === "text" ? "primary" : "default"}
                  variant={tool === "text" ? "filled" : "outlined"}
                  onClick={() => setTool("text")}
                />
                <Tooltip title="Undo Stroke">
                  <span>
                    <IconButton
                      size="small"
                      disabled={strokes.length === 0}
                      onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                    >
                      <UndoIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Reset Edits">
                  <IconButton
                    size="small"
                    onClick={() => {
                      setWorkingDataUrl(activeUrl);
                      setStrokes([]);
                      setCropRect(null);
                      setTextOverlay({ text: "", color: "#FFFFFF", xRatio: 0.5, yRatio: 0.5 });
                      setGifEdited(false);
                    }}
                  >
                    <ResetIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {workingDims.w > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                    {workingDims.w}×{workingDims.h}
                  </Typography>
                )}
              </Stack>

              {tool === "draw" && (
                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                  {BRUSH_COLORS.map((col) => (
                    <Box
                      key={col}
                      onClick={() => setBrushColor(col)}
                      sx={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        bgcolor: col,
                        cursor: "pointer",
                        border: brushColor === col ? "2.5px solid #236B4A" : "1px solid #CBD5E1",
                      }}
                    />
                  ))}
                  <Slider
                    size="small"
                    value={brushSize}
                    min={2}
                    max={14}
                    onChange={(_, v) => setBrushSize(v)}
                    sx={{ width: 90, ml: 1 }}
                  />
                </Stack>
              )}

              {tool === "crop" && (
                <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" useFlexGap>
                  {ASPECT_OPTIONS.map((opt) => (
                    <Chip
                      key={opt.id}
                      size="small"
                      clickable
                      label={opt.label}
                      color={cropAspect === opt.ratio ? "primary" : "default"}
                      variant={cropAspect === opt.ratio ? "filled" : "outlined"}
                      onClick={() => setCropAspect(opt.ratio)}
                    />
                  ))}
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<CheckIcon />}
                    disabled={!cropRect || cropRect.w < 0.03}
                    onClick={handleApplyCrop}
                  >
                    Apply Crop
                  </Button>
                </Stack>
              )}

              {tool === "text" && (
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Type overlay text & tap image to place..."
                    value={textOverlay.text}
                    onChange={(e) => setTextOverlay((prev) => ({ ...prev, text: e.target.value }))}
                  />
                  {BRUSH_COLORS.slice(0, 4).map((col) => (
                    <Box
                      key={col}
                      onClick={() => setTextOverlay((prev) => ({ ...prev, color: col }))}
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        bgcolor: col,
                        flexShrink: 0,
                        cursor: "pointer",
                        border: textOverlay.color === col ? "2.5px solid #236B4A" : "1px solid #CBD5E1",
                      }}
                    />
                  ))}
                </Stack>
              )}

              <Box
                sx={{
                  bgcolor: "#0F172A",
                  borderRadius: 2,
                  p: 0.75,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  maxHeight: "46vh",
                  overflow: "hidden",
                }}
              >
                <canvas
                  ref={canvasRef}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "43vh",
                    objectFit: "contain",
                    touchAction: "none",
                    cursor: tool === "crop" ? "crosshair" : tool === "text" ? "pointer" : "default",
                  }}
                />
              </Box>
              {isAnimatedGif && (
                <Typography variant="caption" color="text.secondary">
                  Animated GIF preserved unless you crop, rotate, or draw on it.
                </Typography>
              )}
            </>
          ) : (
            <Stack spacing={1.25}>
              <Box
                sx={{
                  bgcolor: "#000",
                  borderRadius: 2,
                  overflow: "hidden",
                  display: "flex",
                  justifyContent: "center",
                  maxHeight: "42vh",
                }}
              >
                <video
                  ref={videoRef}
                  src={activeUrl}
                  controls
                  muted={videoMuted}
                  onLoadedMetadata={(e) => {
                    const dur = e.currentTarget.duration || 0;
                    setVideoDuration(dur);
                    setTrimRange([0, dur]);
                  }}
                  onTimeUpdate={(e) => {
                    if (trimRange[1] > 0 && e.currentTarget.currentTime >= trimRange[1]) {
                      e.currentTarget.currentTime = trimRange[0];
                    }
                  }}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "40vh",
                    transform: `rotate(${videoRotate}deg)`,
                    transition: "transform 0.2s ease",
                  }}
                />
              </Box>

              {videoDuration > 0 && (
                <Box px={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" fontWeight={600}>
                      Trim: {formatSec(trimRange[0])} – {formatSec(trimRange[1])}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Length: {formatSec(trimRange[1] - trimRange[0])}
                    </Typography>
                  </Stack>
                  <Slider
                    size="small"
                    value={trimRange}
                    min={0}
                    max={videoDuration}
                    step={0.5}
                    onChange={(_, val) => setTrimRange(val)}
                  />
                </Box>
              )}

              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RotateRightIcon />}
                  onClick={() => setVideoRotate((r) => (r + 90) % 360)}
                >
                  Rotate ({videoRotate}°)
                </Button>
                <FormControlLabel
                  control={<Switch size="small" checked={videoMuted} onChange={(e) => setVideoMuted(e.target.checked)} />}
                  label={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <MuteIcon fontSize="small" />
                      <Typography variant="body2">Mute Audio</Typography>
                    </Stack>
                  }
                />
              </Stack>
              {processingVideo && (
                <Box>
                  <Typography variant="caption" color="primary" fontWeight={600}>
                    Rendering edited video... {videoProgress}%
                  </Typography>
                  <LinearProgress variant="determinate" value={videoProgress} />
                </Box>
              )}
            </Stack>
          )}

          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              fullWidth
              size="small"
              placeholder="Add a caption (optional)..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <Chip
              size="small"
              clickable
              icon={<FlameIcon sx={{ fontSize: 15 }} />}
              label="View Once"
              color={viewOnce ? "error" : "default"}
              variant={viewOnce ? "filled" : "outlined"}
              onClick={() => setViewOnce((v) => !v)}
            />
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2.25, pb: 1.75 }}>
        <Button onClick={onClose} disabled={processingVideo}>
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={<SendIcon />}
          disabled={processingVideo}
          onClick={handleSendAll}
        >
          Send{files.length > 1 ? ` (${files.length})` : ""}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MediaEditorDialog;
