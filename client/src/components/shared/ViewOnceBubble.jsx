import React, { useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Visibility as EyeIcon, VisibilityOff as EyeOffIcon, Whatshot as FlameIcon } from "@mui/icons-material";
import axios from "axios";
import toast from "react-hot-toast";
import { server } from "../../constants/config";

const ViewOnceBubble = ({ messageId, attachments = [], viewedBy = [], currentUserId, sameSender, onConsumed }) => {
  const [opening, setOpening] = useState(false);
  const [unlockedMedia, setUnlockedMedia] = useState(null);

  const uid = String(currentUserId || "");
  const alreadyViewed =
    !sameSender &&
    (viewedBy.map(String).includes(uid) || attachments.some((a) => Boolean(a?.expiredForViewer) || !a?.url));

  const senderOpenedByOthers = sameSender && viewedBy.length > 0;

  const handleOpen = async () => {
    if (alreadyViewed || opening) return;
    setOpening(true);
    try {
      const base = server || (typeof window !== "undefined" ? window.location.origin : "");
      const { data } = await axios.post(`${base}/api/v1/message/${messageId}/view-once`, {}, { withCredentials: true });
      if (data?.success && Array.isArray(data.attachments)) {
        setUnlockedMedia(data.attachments);
        if (!sameSender) {
          onConsumed?.(messageId, data.viewedBy || [uid]);
        }
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Media already expired");
      onConsumed?.(messageId, [uid]);
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      <Paper
        variant="outlined"
        onClick={!alreadyViewed ? handleOpen : undefined}
        sx={{
          px: 1.5,
          py: 1,
          borderRadius: 2,
          cursor: alreadyViewed ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 1,
          bgcolor: alreadyViewed ? "action.disabledBackground" : "action.hover",
          minWidth: 190,
        }}
      >
        {opening ? (
          <CircularProgress size={18} />
        ) : alreadyViewed || senderOpenedByOthers ? (
          <EyeOffIcon fontSize="small" color="disabled" />
        ) : (
          <FlameIcon fontSize="small" color="error" />
        )}
        <Box>
          <Typography variant="body2" fontWeight={700}>
            {alreadyViewed
              ? "Opened · Disappeared"
              : sameSender
              ? senderOpenedByOthers
                ? "View-Once · Opened"
                : "View-Once Media Sent"
              : "Tap to View Once"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {alreadyViewed ? "Cannot be reopened" : "Disappears after closing · Forwarding blocked"}
          </Typography>
        </Box>
      </Paper>

      <Dialog
        open={Boolean(unlockedMedia)}
        onClose={() => setUnlockedMedia(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <EyeIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1" fontWeight={700}>
            View-Once Media
          </Typography>
        </DialogTitle>
        <DialogContent onContextMenu={(e) => e.preventDefault()}>
          <Stack spacing={1.5} alignItems="center">
            {(unlockedMedia || []).map((att, idx) => {
              const rawUrl = att?.url || "";
              const fullUrl = rawUrl.startsWith("http")
                ? rawUrl
                : `${server || (typeof window !== "undefined" ? window.location.origin : "")}${rawUrl}`;
              const ftype = att?.type || "";
              if (ftype === "image") {
                return (
                  <img
                    key={idx}
                    src={fullUrl}
                    alt="View once"
                    draggable={false}
                    style={{ maxWidth: "100%", maxHeight: "65vh", borderRadius: 10, userSelect: "none" }}
                  />
                );
              }
              if (ftype === "video") {
                return (
                  <video
                    key={idx}
                    src={fullUrl}
                    controls
                    autoPlay
                    controlsList="nodownload"
                    style={{ width: "100%", maxHeight: "65vh", borderRadius: 10 }}
                  />
                );
              }
              return (
                <audio
                  key={idx}
                  src={fullUrl}
                  controls
                  autoPlay
                  controlsList="nodownload"
                  style={{ width: "100%" }}
                />
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setUnlockedMedia(null)}>
            Close &amp; Disappear
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ViewOnceBubble;

