import React, { useState } from "react";
import { Menu, MenuItem, ListItemIcon, ListItemText, Tooltip, IconButton, Typography } from "@mui/material";
import { Circle as CircleIcon } from "@mui/icons-material";

const STATUS_OPTIONS = [
  { value: "online", label: "Online", color: "#22c55e" },
  { value: "away", label: "Away", color: "#f59e0b" },
  { value: "busy", label: "Busy", color: "#ef4444" },
  { value: "dnd", label: "Do Not Disturb", color: "#6b7280" },
];

export const getStatusColor = (status) => {
  const found = STATUS_OPTIONS.find((s) => s.value === status);
  return found?.color || "#22c55e";
};

const StatusSelector = ({ currentStatus, onStatusChange }) => {
  const [anchor, setAnchor] = useState(null);

  const handleSelect = (value) => {
    onStatusChange(value);
    setAnchor(null);
  };

  const current = STATUS_OPTIONS.find((s) => s.value === currentStatus) || STATUS_OPTIONS[0];

  return (
    <>
      <Tooltip title="Set your status">
        <IconButton onClick={(e) => setAnchor(e.currentTarget)} size="small" sx={{ p: 0.3 }}>
          <CircleIcon sx={{ fontSize: 14, color: current.color }} />
          <Typography variant="caption" sx={{ ml: 0.4, color: "text.secondary" }}>
            {current.label}
          </Typography>
        </IconButton>
      </Tooltip>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {STATUS_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} onClick={() => handleSelect(opt.value)} selected={opt.value === currentStatus} dense>
            <ListItemIcon>
              <CircleIcon sx={{ fontSize: 14, color: opt.color }} />
            </ListItemIcon>
            <ListItemText>{opt.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default StatusSelector;
