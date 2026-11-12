import React, { useState } from "react";
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import toast from "react-hot-toast";
import { useCreateWidgetMutation } from "../../redux/api/api";

const ROULETTE_PRESETS = [
  { label: "Lunch", title: "What's for Lunch?", options: "Pizza, Tacos, Sushi, Burgers, Biryani" },
  { label: "Who Goes First", title: "Who Goes First?", options: "Player 1, Player 2, Flip Again, Everyone" },
  { label: "Yes / No", title: "Quick Decision", options: "Yes Definitely, Probably Yes, Wait, No Way" },
];

const CreateWidgetDialog = ({ open, onClose, chatId, activeTopic = "", initialTab = 0 }) => {
  const [tab, setTab] = useState(initialTab);
  const [createWidget, { isLoading }] = useCreateWidgetMutation();

  // Checklist
  const [todoTitle, setTodoTitle] = useState("Shared Checklist");
  const [todoItemsText, setTodoItemsText] = useState("Pack charger\nConfirm timing\nBring snacks");

  // Spin Wheel
  const [wheelTitle, setWheelTitle] = useState("Spin the Wheel");
  const [wheelOptionsText, setWheelOptionsText] = useState("Pizza, Tacos, Sushi, Burgers");

  // Countdown
  const [cdTitle, setCdTitle] = useState("Trip Launch");
  const [cdEmoji, setCdEmoji] = useState("🚀");
  const [cdDate, setCdDate] = useState(() => {
    const dt = new Date(Date.now() + 3600 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!chatId) return;
    const topicName = activeTopic && activeTopic !== "all" ? activeTopic : "";

    let payload;
    if (tab === 0) {
      const items = todoItemsText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!items.length) return toast.error("Enter at least 1 checklist item");
      payload = { chatId, widgetType: "checklist", title: todoTitle.trim() || "Shared Checklist", items, topicName };
    } else if (tab === 1) {
      const options = wheelOptionsText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (options.length < 2) return toast.error("Enter at least 2 options separated by commas");
      payload = { chatId, widgetType: "roulette", title: wheelTitle.trim() || "Spin the Wheel", options, topicName };
    } else {
      const parsed = new Date(cdDate);
      if (Number.isNaN(parsed.getTime())) return toast.error("Pick a valid target date & time");
      payload = {
        chatId,
        widgetType: "countdown",
        title: cdTitle.trim() || "Countdown",
        emoji: cdEmoji.trim() || "⏳",
        targetIso: parsed.toISOString(),
        topicName,
      };
    }

    try {
      await createWidget(payload).unwrap();
      toast.success(tab === 0 ? "Checklist posted!" : tab === 1 ? "Spin wheel posted!" : "Countdown posted!");
      onClose?.();
    } catch (err) {
      toast.error(err?.data?.message || "Failed to create card");
    }
  };

  return (
    <Dialog open={Boolean(open)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle fontWeight={700} sx={{ pb: 0.5 }}>
        Interactive Chat Cards
      </DialogTitle>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ px: 2 }}>
        <Tab label="☑️ Checklist" />
        <Tab label="🎡 Spin Wheel" />
        <Tab label="⏳ Countdown" />
      </Tabs>

      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 1.5 }}>
          {tab === 0 && (
            <Stack spacing={1.25}>
              <TextField
                size="small"
                fullWidth
                label="Checklist Title"
                value={todoTitle}
                onChange={(e) => setTodoTitle(e.target.value)}
              />
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={3}
                label="Items (one per line or comma-separated)"
                value={todoItemsText}
                onChange={(e) => setTodoItemsText(e.target.value)}
              />
              <Typography variant="caption" color="text.secondary">
                Tip: Anyone in this chat can tick items off or add more live! Shortcut: <code>/todo Title | a, b, c</code>
              </Typography>
            </Stack>
          )}

          {tab === 1 && (
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
                {ROULETTE_PRESETS.map((p) => (
                  <Chip
                    key={p.label}
                    size="small"
                    clickable
                    label={p.label}
                    variant="outlined"
                    onClick={() => {
                      setWheelTitle(p.title);
                      setWheelOptionsText(p.options);
                    }}
                  />
                ))}
              </Stack>
              <TextField
                size="small"
                fullWidth
                label="Wheel Title"
                value={wheelTitle}
                onChange={(e) => setWheelTitle(e.target.value)}
              />
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                label="Options (comma-separated)"
                value={wheelOptionsText}
                onChange={(e) => setWheelOptionsText(e.target.value)}
              />
              <Typography variant="caption" color="text.secondary">
                Shortcut: <code>/spin Lunch | Pizza, Tacos, Sushi</code>
              </Typography>
            </Stack>
          )}

          {tab === 2 && (
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  label="Icon"
                  value={cdEmoji}
                  onChange={(e) => setCdEmoji(e.target.value)}
                  sx={{ width: 84 }}
                />
                <TextField
                  size="small"
                  fullWidth
                  label="Event Title"
                  value={cdTitle}
                  onChange={(e) => setCdTitle(e.target.value)}
                />
              </Stack>
              <TextField
                size="small"
                fullWidth
                type="datetime-local"
                label="Target Date & Time"
                InputLabelProps={{ shrink: true }}
                value={cdDate}
                onChange={(e) => setCdDate(e.target.value)}
              />
              <Stack direction="row" spacing={0.6}>
                {[
                  { label: "+15m", mins: 15 },
                  { label: "+1h", mins: 60 },
                  { label: "+24h", mins: 1440 },
                ].map((q) => (
                  <Chip
                    key={q.label}
                    size="small"
                    clickable
                    variant="outlined"
                    label={q.label}
                    onClick={() => {
                      const dt = new Date(Date.now() + q.mins * 60000);
                      const pad = (n) => String(n).padStart(2, "0");
                      setCdDate(
                        `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
                      );
                    }}
                  />
                ))}
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            {isLoading ? "Posting..." : "Send Card"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default CreateWidgetDialog;

