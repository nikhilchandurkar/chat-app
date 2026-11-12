import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Delete as DeleteIcon, ScheduleSend as ScheduleIcon } from "@mui/icons-material";
import axios from "axios";
import toast from "react-hot-toast";
import { server } from "../../constants/config";
export { parseRemindCommand } from "../../utils/interactive";

function toLocalDateTimeInput(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const ScheduleMessageDialog = ({ open, onClose, chatId, activeTopic = "", initialText = "", onScheduled }) => {
  const [content, setContent] = useState(initialText || "");
  const [dateTimeValue, setDateTimeValue] = useState(() => toLocalDateTimeInput(new Date(Date.now() + 15 * 60000)));
  const [pendingList, setPendingList] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const loadPending = useCallback(async () => {
    if (!chatId || !open) return;
    try {
      const base = server || (typeof window !== "undefined" ? window.location.origin : "");
      const { data } = await axios.get(`${base}/api/v1/message/scheduled/${chatId}`, { withCredentials: true });
      if (data?.success) {
        setPendingList(data.scheduled || []);
      }
    } catch {
      // ignore
    }
  }, [chatId, open]);

  useEffect(() => {
    if (open) {
      if (initialText) setContent(initialText);
      setDateTimeValue(toLocalDateTimeInput(new Date(Date.now() + 15 * 60000)));
      loadPending();
    }
  }, [open, initialText, loadPending]);

  const applyOffset = (minutes) => {
    setDateTimeValue(toLocalDateTimeInput(new Date(Date.now() + minutes * 60000)));
  };

  const handleSchedule = async () => {
    const clean = content.trim();
    if (!clean) {
      toast.error("Enter a message or reminder text");
      return;
    }
    const parsed = new Date(dateTimeValue);
    if (Number.isNaN(parsed.getTime())) {
      toast.error("Choose a valid date & time");
      return;
    }

    setSubmitting(true);
    try {
      const base = server || (typeof window !== "undefined" ? window.location.origin : "");
      const { data } = await axios.post(
        `${base}/api/v1/message/schedule`,
        {
          chatId,
          content: clean,
          scheduledFor: parsed.toISOString(),
          topicName: activeTopic && activeTopic !== "all" ? activeTopic : "",
        },
        { withCredentials: true }
      );
      if (data?.success) {
        toast.success(`Scheduled for ${parsed.toLocaleString()}`);
        setContent("");
        loadPending();
        onScheduled?.(data.scheduled);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to schedule message");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelScheduled = async (msgId) => {
    try {
      const base = server || (typeof window !== "undefined" ? window.location.origin : "");
      await axios.delete(`${base}/api/v1/message/scheduled/${msgId}`, { withCredentials: true });
      setPendingList((prev) => prev.filter((item) => String(item._id) !== String(msgId)));
      toast.success("Scheduled message cancelled");
    } catch {
      toast.error("Failed to cancel scheduled message");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle fontWeight={700}>⏰ Schedule Message / Reminder</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} pt={0.5}>
          <TextField
            label="Message or Reminder"
            placeholder="e.g. Happy Birthday! 🎉 or Check deployment"
            multiline
            minRows={2}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            fullWidth
          />
          <TextField
            label="Deliver At"
            type="datetime-local"
            size="small"
            value={dateTimeValue}
            onChange={(e) => setDateTimeValue(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <Stack direction="row" spacing={0.6} flexWrap="wrap">
            <Chip size="small" clickable label="In 5m" onClick={() => applyOffset(5)} />
            <Chip size="small" clickable label="In 30m" onClick={() => applyOffset(30)} />
            <Chip size="small" clickable label="In 1h" onClick={() => applyOffset(60)} />
            <Chip size="small" clickable label="In 24h" onClick={() => applyOffset(1440)} />
          </Stack>

          <Typography variant="caption" color="text.secondary">
            Tip: You can also type <code>/remind in 10m take a break</code> or <code>/remind at 6pm call</code> directly in chat.
          </Typography>

          {pendingList.length > 0 && (
            <>
              <Divider />
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                UPCOMING SCHEDULED ({pendingList.length})
              </Typography>
              <Stack spacing={0.75} maxHeight={160} overflow="auto">
                {pendingList.map((item) => (
                  <Paper
                    key={item._id}
                    variant="outlined"
                    sx={{ p: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}
                  >
                    <Box minWidth={0}>
                      <Typography variant="body2" noWrap fontWeight={600}>
                        {item.content}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.scheduledFor ? new Date(item.scheduledFor).toLocaleString() : ""}
                      </Typography>
                    </Box>
                    <IconButton size="small" color="error" onClick={() => handleCancelScheduled(item._id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Paper>
                ))}
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" startIcon={<ScheduleIcon />} onClick={handleSchedule} disabled={submitting}>
          {submitting ? "Scheduling..." : "Schedule"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ScheduleMessageDialog;
