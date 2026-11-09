import React, { useState } from "react";
import {
  FileOpen as FileOpenIcon,
  Mic as MicIcon,
  Download as DownloadIcon,
  Close as CloseIcon,
  PictureAsPdf as PdfIcon,
  BrokenImage as BrokenImageIcon,
} from "@mui/icons-material";
import {
  Box,
  Typography,
  Dialog,
  DialogContent,
  IconButton,
  Tooltip,
} from "@mui/material";
import { transformImage } from "../../lib/feature";

const RenderAttachment = (propsOrFile, maybeUrl, maybeName) => {
  // Support both component usage (<RenderAttachment file=... />) and function call (RenderAttachment(file, url))
  let file, url, name;
  if (typeof propsOrFile === "object" && propsOrFile !== null) {
    file = propsOrFile.file;
    url = propsOrFile.url;
    name = propsOrFile.name;
  } else {
    file = propsOrFile;
    url = maybeUrl;
    name = maybeName;
  }

  const [previewOpen, setPreviewOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  const fileName = name || (url ? url.split("/").pop()?.split("?")[0] : "attachment");
  const displayUrl = transformImage(url, 400);

  switch (file) {
    case "video":
      return (
        <Box sx={{ mt: 0.5, maxWidth: "280px" }}>
          <video
            src={url}
            preload="metadata"
            width="100%"
            controls
            style={{ borderRadius: 8, display: "block", maxHeight: 220 }}
          />
        </Box>
      );

    case "image":
      return (
        <Box sx={{ mt: 0.5 }}>
          {!imgError ? (
            <img
              src={displayUrl}
              alt={fileName}
              onClick={() => setPreviewOpen(true)}
              onError={() => setImgError(true)}
              loading="lazy"
              style={{
                maxWidth: "280px",
                maxHeight: "220px",
                width: "auto",
                height: "auto",
                objectFit: "cover",
                borderRadius: 8,
                display: "block",
                cursor: "pointer",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = "scale(1.02)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            />
          ) : (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 1,
                borderRadius: 2,
                border: "1px dashed rgba(0,0,0,0.2)",
                bgcolor: "background.paper",
                maxWidth: 240,
              }}
            >
              <BrokenImageIcon color="error" fontSize="small" />
              <Typography variant="caption" color="text.secondary">
                Image preview unavailable
              </Typography>
            </Box>
          )}

          {/* Full Screen Image Preview Lightbox */}
          <Dialog
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            maxWidth="md"
            PaperProps={{
              sx: {
                bgcolor: "rgba(10, 15, 12, 0.95)",
                backdropFilter: "blur(8px)",
                borderRadius: 3,
                boxShadow: 24,
                overflow: "hidden",
                m: 2,
              },
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 1.5, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <Typography variant="body2" sx={{ color: "#F1F3F0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                {fileName}
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Tooltip title="Download">
                  <IconButton
                    component="a"
                    href={url}
                    download={fileName}
                    target="_blank"
                    size="small"
                    sx={{ color: "#F1F3F0" }}
                  >
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Close">
                  <IconButton size="small" onClick={() => setPreviewOpen(false)} sx={{ color: "#F1F3F0" }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            <DialogContent sx={{ p: 2, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <img
                src={url}
                alt={fileName}
                style={{
                  maxWidth: "100%",
                  maxHeight: "75vh",
                  objectFit: "contain",
                  borderRadius: 8,
                }}
              />
            </DialogContent>
          </Dialog>
        </Box>
      );

    case "audio":
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 0.8, mt: 0.5, bgcolor: "rgba(0,0,0,0.03)", borderRadius: 2, maxWidth: "280px" }}>
          <MicIcon sx={{ color: "primary.main", fontSize: 22 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" display="block" fontWeight={600} sx={{ lineHeight: 1.2, mb: 0.5 }} noWrap>
              {fileName || "Audio Message"}
            </Typography>
            <audio
              src={url}
              preload="metadata"
              controls
              style={{ height: 32, width: "100%", display: "block" }}
            />
          </Box>
        </Box>
      );

    case "pdf":
      return (
        <Box
          component="a"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download={fileName}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            p: 1,
            mt: 0.5,
            borderRadius: 2,
            bgcolor: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            color: "inherit",
            textDecoration: "none",
            maxWidth: "280px",
            transition: "background-color 0.2s",
            "&:hover": { bgcolor: "rgba(239, 68, 68, 0.15)" },
          }}
        >
          <PdfIcon sx={{ color: "#dc2626", fontSize: 26 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" fontWeight={600} display="block" noWrap>
              {fileName}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem" }}>
              Click to view PDF
            </Typography>
          </Box>
          <DownloadIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </Box>
      );

    default:
      return (
        <Box
          component="a"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download={fileName}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            p: 1,
            mt: 0.5,
            borderRadius: 2,
            bgcolor: "rgba(35, 107, 74, 0.08)",
            border: "1px solid rgba(35, 107, 74, 0.2)",
            color: "inherit",
            textDecoration: "none",
            maxWidth: "280px",
            transition: "background-color 0.2s",
            "&:hover": { bgcolor: "rgba(35, 107, 74, 0.15)" },
          }}
        >
          <FileOpenIcon sx={{ color: "primary.main", fontSize: 24 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" fontWeight={600} display="block" noWrap>
              {fileName}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem" }}>
              Click to download
            </Typography>
          </Box>
          <DownloadIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </Box>
      );
  }
};

export default RenderAttachment;
