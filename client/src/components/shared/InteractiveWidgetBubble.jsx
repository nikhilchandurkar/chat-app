import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Casino as SpinIcon,
  CheckBox as TodoIcon,
  DeleteOutline as TrashIcon,
  Timer as CountdownIcon,
} from "@mui/icons-material";
import toast from "react-hot-toast";
import { useActionWidgetMutation } from "../../redux/api/api";

const WHEEL_COLORS = [
  "#EF4444",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
];

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeSector(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return ["M", cx, cy, "L", start.x, start.y, "A", r, r, 0, largeArc, 0, end.x, end.y, "Z"].join(" ");
}

const ChecklistWidget = ({ messageId, widget, onUpdated }) => {
  const [newItem, setNewItem] = useState("");
  const [actionWidget, { isLoading }] = useActionWidgetMutation();

  const items = Array.isArray(widget?.items) ? widget.items : [];
  const doneCount = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  const runAction = async (payload) => {
    try {
      const res = await actionWidget({ messageId, ...payload }).unwrap();
      if (res?.attachments) onUpdated?.(messageId, res.attachments);
    } catch (err) {
      toast.error(err?.data?.message || "Failed to update checklist");
    }
  };

  return (
    <Box onTouchStart={(e) => e.stopPropagation()} sx={{ minWidth: { xs: 230, sm: 270 }, py: 0.4 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} mb={0.5}>
        <Stack direction="row" alignItems="center" spacing={0.6} minWidth={0}>
          <TodoIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight={700} noWrap>
            {widget.title || "Shared Checklist"}
          </Typography>
        </Stack>
        <Chip size="small" label={`${doneCount}/${items.length}`} color={doneCount === items.length && items.length > 0 ? "success" : "default"} />
      </Stack>

      <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3, mb: 0.85 }} />

      <Stack spacing={0.25} maxHeight={220} overflow="auto">
        {items.map((item) => (
          <Stack
            key={item.id}
            direction="row"
            alignItems="center"
            spacing={0.4}
            sx={{
              borderRadius: 1,
              px: 0.4,
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Checkbox
              size="small"
              checked={Boolean(item.done)}
              disabled={isLoading}
              onChange={() => runAction({ action: "toggle", itemId: item.id })}
              sx={{ p: 0.4 }}
            />
            <Box
              flex={1}
              minWidth={0}
              onClick={() => runAction({ action: "toggle", itemId: item.id })}
              sx={{ cursor: "pointer" }}
            >
              <Typography
                variant="body2"
                sx={{
                  textDecoration: item.done ? "line-through" : "none",
                  opacity: item.done ? 0.6 : 1,
                  wordBreak: "break-word",
                }}
              >
                {item.text}
              </Typography>
              {item.done && item.doneBy && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: "0.66rem", lineHeight: 1.1 }}>
                  ✓ {item.doneBy}
                </Typography>
              )}
            </Box>
            <IconButton
              size="small"
              aria-label="Remove item"
              disabled={isLoading}
              onClick={() => runAction({ action: "remove", itemId: item.id })}
              sx={{ opacity: 0.55, "&:hover": { opacity: 1 } }}
            >
              <TrashIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Stack>
        ))}
      </Stack>

      <Stack
        component="form"
        direction="row"
        spacing={0.5}
        mt={0.85}
        onSubmit={(e) => {
          e.preventDefault();
          const clean = newItem.trim();
          if (!clean) return;
          setNewItem("");
          runAction({ action: "add", text: clean });
        }}
      >
        <TextField
          size="small"
          fullWidth
          placeholder="Add item..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          sx={{ "& input": { py: 0.55, fontSize: "0.82rem" } }}
        />
        <IconButton size="small" type="submit" color="primary" disabled={!newItem.trim() || isLoading} aria-label="Add checklist item">
          <AddIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
};

const RouletteWidget = ({ messageId, widget, onUpdated }) => {
  const [newOption, setNewOption] = useState("");
  const [actionWidget, { isLoading }] = useActionWidgetMutation();
  const options = Array.isArray(widget?.options) ? widget.options : [];
  const targetDeg = Number(widget?.targetDeg || 0);
  const sliceDeg = options.length > 0 ? 360 / options.length : 360;

  const runAction = async (payload) => {
    try {
      const res = await actionWidget({ messageId, ...payload }).unwrap();
      if (res?.attachments) onUpdated?.(messageId, res.attachments);
    } catch (err) {
      toast.error(err?.data?.message || "Wheel action failed");
    }
  };

  return (
    <Box onTouchStart={(e) => e.stopPropagation()} sx={{ minWidth: { xs: 230, sm: 270 }, py: 0.4 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.75}>
        <Stack direction="row" alignItems="center" spacing={0.6}>
          <SpinIcon fontSize="small" color="secondary" />
          <Typography variant="subtitle2" fontWeight={700}>
            {widget.title || "Spin the Wheel"}
          </Typography>
        </Stack>
        <Chip size="small" label={`${widget.spinCount || 0} spins`} variant="outlined" />
      </Stack>

      <Box sx={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", my: 0.5 }}>
        {/* Top pointer */}
        <Box
          sx={{
            position: "absolute",
            top: -3,
            zIndex: 3,
            width: 0,
            height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "14px solid #DC2626",
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
          }}
        />
        <Box
          sx={{
            width: 176,
            height: 176,
            transition: "transform 3.2s cubic-bezier(0.15, 0.85, 0.25, 1)",
            transform: `rotate(${targetDeg}deg)`,
          }}
        >
          <svg viewBox="0 0 200 200" width="176" height="176">
            {options.map((opt, idx) => {
              const startA = idx * sliceDeg;
              const endA = startA + sliceDeg;
              const midA = startA + sliceDeg / 2;
              const labelPos = polarToCartesian(100, 100, 62, midA);
              const color = WHEEL_COLORS[idx % WHEEL_COLORS.length];
              return (
                <g key={`${opt}-${idx}`}>
                  <path d={describeSector(100, 100, 94, startA, endA)} fill={color} stroke="#FFFFFF" strokeWidth="1.5" />
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    fill="#FFFFFF"
                    fontSize={options.length > 8 ? "9" : "10.5"}
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${midA - 90}, ${labelPos.x}, ${labelPos.y})`}
                  >
                    {String(opt).slice(0, 11)}
                  </text>
                </g>
              );
            })}
            <circle cx="100" cy="100" r="14" fill="#FFFFFF" stroke="#0F172A" strokeWidth="2.5" />
          </svg>
        </Box>
      </Box>

      {widget.winnerText && (
        <Box
          sx={{
            my: 0.75,
            p: 0.75,
            borderRadius: 1.5,
            bgcolor: "rgba(35, 107, 74, 0.14)",
            textAlign: "center",
          }}
        >
          <Typography variant="body2" fontWeight={700} color="primary">
            🏆 Winner: {widget.winnerText}
          </Typography>
          {widget.spunBy && (
            <Typography variant="caption" color="text.secondary">
              Spun by {widget.spunBy}
            </Typography>
          )}
        </Box>
      )}

      <Button
        fullWidth
        size="small"
        variant="contained"
        color="secondary"
        startIcon={<SpinIcon />}
        disabled={isLoading || options.length < 2}
        onClick={() => runAction({ action: "spin" })}
        sx={{ mt: 0.5, borderRadius: 2 }}
      >
        Spin Wheel
      </Button>

      <Stack
        component="form"
        direction="row"
        spacing={0.5}
        mt={0.75}
        onSubmit={(e) => {
          e.preventDefault();
          const clean = newOption.trim();
          if (!clean) return;
          setNewOption("");
          runAction({ action: "add_option", text: clean });
        }}
      >
        <TextField
          size="small"
          fullWidth
          placeholder="Add option..."
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          sx={{ "& input": { py: 0.5, fontSize: "0.8rem" } }}
        />
        <IconButton size="small" type="submit" color="primary" disabled={!newOption.trim() || isLoading} aria-label="Add option">
          <AddIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
};

const CountdownWidget = ({ widget }) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const targetMs = Date.parse(widget?.targetIso || "");

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const diffSec = Number.isFinite(targetMs) ? Math.max(0, Math.floor((targetMs - nowMs) / 1000)) : 0;
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  const finished = Number.isFinite(targetMs) && diffSec <= 0;

  return (
    <Box onTouchStart={(e) => e.stopPropagation()} sx={{ minWidth: { xs: 220, sm: 255 }, py: 0.4 }}>
      <Stack direction="row" alignItems="center" spacing={0.6} mb={0.5}>
        <CountdownIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" fontWeight={700}>
          {widget.emoji || "⏳"} {widget.title || "Countdown"}
        </Typography>
      </Stack>
      <Box
        sx={{
          p: 1,
          borderRadius: 2,
          bgcolor: finished ? "rgba(34, 197, 94, 0.16)" : "rgba(35, 107, 74, 0.1)",
          textAlign: "center",
        }}
      >
        {finished ? (
          <Typography variant="h6" fontWeight={800} color="success.main">
            🎉 Time&apos;s Up!
          </Typography>
        ) : (
          <Typography variant="h6" fontWeight={800} sx={{ fontFamily: "monospace", letterSpacing: 0.5 }}>
            {days > 0 ? `${days}d ` : ""}
            {String(hours).padStart(2, "0")}h {String(mins).padStart(2, "0")}m {String(secs).padStart(2, "0")}s
          </Typography>
        )}
        {Number.isFinite(targetMs) && (
          <Typography variant="caption" color="text.secondary" display="block">
            {new Date(targetMs).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

const InteractiveWidgetBubble = ({ messageId, widget, onUpdated }) => {
  if (!widget || typeof widget !== "object") return null;
  if (widget.widgetType === "checklist") {
    return <ChecklistWidget messageId={messageId} widget={widget} onUpdated={onUpdated} />;
  }
  if (widget.widgetType === "roulette") {
    return <RouletteWidget messageId={messageId} widget={widget} onUpdated={onUpdated} />;
  }
  if (widget.widgetType === "countdown") {
    return <CountdownWidget widget={widget} />;
  }
  return null;
};

export default InteractiveWidgetBubble;

