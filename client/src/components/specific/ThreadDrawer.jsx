import React, { useCallback, useEffect, useState } from "react";
import {
  Avatar,
  Box,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Close as CloseIcon, Send as SendIcon } from "@mui/icons-material";
import axios from "axios";
import toast from "react-hot-toast";
import { server } from "../../constants/config";
import { NEW_MESSAGE } from "../../constants/events";
import { formatTimeAgo, transformImage } from "../../lib/feature";

const ThreadDrawer = ({ open, rootMessage, chatId, members, socket, onClose, onReplyAdded }) => {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");

  const rootId = rootMessage?._id || rootMessage?.id || "";

  const loadThread = useCallback(async () => {
    if (!open || !rootId) return;
    setLoading(true);
    try {
      const base = server || (typeof window !== "undefined" ? window.location.origin : "");
      const { data } = await axios.get(`${base}/api/v1/message/thread/${rootId}`, { withCredentials: true });
      if (data?.success) {
        setReplies(data.replies || []);
      }
    } catch {
      toast.error("Failed to load thread replies");
    } finally {
      setLoading(false);
    }
  }, [open, rootId]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  useEffect(() => {
    if (!socket || !open || !rootId) return undefined;
    const handler = (data) => {
      const msg = data?.message || data;
      const incomingRoot = String(msg?.threadRootId || data?.threadRootId || "");
      if (incomingRoot && incomingRoot === String(rootId)) {
        setReplies((prev) => {
          if (prev.some((r) => String(r._id) === String(msg._id))) return prev;
          return [...prev, msg];
        });
      }
    };
    socket.on(NEW_MESSAGE, handler);
    socket.on("message.created", handler);
    return () => {
      socket.off(NEW_MESSAGE, handler);
      socket.off("message.created", handler);
    };
  }, [socket, open, rootId]);

  const handleSendReply = (e) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || !rootId || !chatId) return;
    socket?.emit?.(NEW_MESSAGE, {
      chatId,
      members,
      message: clean,
      threadRootId: rootId,
      topicName: rootMessage?.topicName || "",
    });
    setText("");
    onReplyAdded?.(rootId);
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: "min(92vw, 390px)" } }}>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" px={2} py={1.5} borderBottom="1px solid" borderColor="divider">
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              💬 Thread Replies
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        {rootMessage && (
          <Paper variant="outlined" sx={{ m: 1.5, p: 1.25, borderRadius: 2, bgcolor: "action.hover" }}>
            <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
              <Avatar src={transformImage(rootMessage.sender?.avatar)} sx={{ width: 22, height: 22 }} />
              <Typography variant="caption" fontWeight={700}>
                {rootMessage.sender?.name || "User"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {rootMessage.createdAt ? formatTimeAgo(rootMessage.createdAt) : ""}
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              {rootMessage.content || "Attachment"}
            </Typography>
          </Paper>
        )}

        <Divider />

        <Box sx={{ flex: 1, overflowY: "auto", p: 1.5 }}>
          {loading ? (
            <Box textAlign="center" py={4}>
              <CircularProgress size={24} />
            </Box>
          ) : replies.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
              No replies in this thread yet. Start the side discussion below!
            </Typography>
          ) : (
            <Stack spacing={1.25}>
              {replies.map((r) => (
                <Paper key={r._id} variant="outlined" sx={{ p: 1.15, borderRadius: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center" mb={0.4}>
                    <Avatar src={transformImage(r.sender?.avatar)} sx={{ width: 20, height: 20 }} />
                    <Typography variant="caption" fontWeight={700}>
                      {r.sender?.name || "User"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.createdAt ? formatTimeAgo(r.createdAt) : ""}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    {r.content}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>

        <form onSubmit={handleSendReply}>
          <Stack direction="row" spacing={1} p={1.25} borderTop="1px solid" borderColor="divider" alignItems="center">
            <TextField
              size="small"
              fullWidth
              placeholder="Reply inside thread..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <IconButton type="submit" color="primary" disabled={!text.trim()}>
              <SendIcon />
            </IconButton>
          </Stack>
        </form>
      </Box>
    </Drawer>
  );
};

export default ThreadDrawer;

