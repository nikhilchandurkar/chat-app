import React from "react";
import { transformImage } from "../../lib/feature";
import { FileOpen as FileOpenIcon, Mic as MicIcon } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";

const RenderAttachment = (file, url) => {
  switch (file) {
    case "video":
      return (
        <video
          src={url}
          preload="none"
          width="220px"
          controls
          style={{ borderRadius: 8, display: "block" }}
        />
      );

    case "image":
      return (
        <img
          src={transformImage(url, 200)}
          alt="Attachment"
          width="200px"
          height="150px"
          style={{ objectFit: "contain", borderRadius: 6, display: "block" }}
        />
      );

    case "audio":
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 0.5 }}>
          <MicIcon sx={{ color: "secondary.main", fontSize: 20 }} />
          <Box>
            <Typography variant="caption" display="block" fontWeight={600} sx={{ lineHeight: 1 }}>
              Voice Note
            </Typography>
            <audio
              src={url}
              preload="none"
              controls
              style={{ height: 32, marginTop: 2, display: "block" }}
            />
          </Box>
        </Box>
      );

    default:
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <FileOpenIcon fontSize="small" />
          <Typography variant="caption">Open File</Typography>
        </Box>
      );
  }
};

export default RenderAttachment;
