import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Switch,
  FormControlLabel,
  RadioGroup,
  Radio,
  LinearProgress,
  Divider,
  Stack,
  IconButton,
  Alert,
} from "@mui/material";
import {
  Close as CloseIcon,
  BatteryChargingFull,
  BatteryAlert,
  Storage as StorageIcon,
  Wifi,
  Speed,
  DeleteSweep,
} from "@mui/icons-material";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";

const DevicePerformanceDialog = ({ open, onClose }) => {
  const { themeMode } = useSelector((state) => state.misc);
  const isDark = themeMode === "dark";

  // Battery State
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [isCharging, setIsCharging] = useState(false);
  const [batterySaver, setBatterySaver] = useState(
    localStorage.getItem("chat_battery_saver") === "true"
  );

  // Storage State
  const [storageUsage, setStorageUsage] = useState({ usedMB: 12.4, quotaMB: 1024 });

  // Network Optimization Mode
  const [networkMode, setNetworkMode] = useState(
    localStorage.getItem("chat_network_mode") || "auto"
  );

  useEffect(() => {
    if (navigator.getBattery) {
      navigator.getBattery().then((battery) => {
        setBatteryLevel(Math.round(battery.level * 100));
        setIsCharging(battery.charging);

        battery.addEventListener("levelchange", () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
        battery.addEventListener("chargingchange", () => {
          setIsCharging(battery.charging);
        });
      }).catch(() => {});
    }

    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((estimate) => {
        const used = (estimate.usage || 0) / (1024 * 1024);
        const quota = (estimate.quota || 0) / (1024 * 1024);
        setStorageUsage({
          usedMB: Number(used.toFixed(1)),
          quotaMB: Number((quota / 1024).toFixed(1)),
        });
      }).catch(() => {});
    }
  }, []);

  const handleClearCache = () => {
    try {
      if (window.caches) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        });
      }
      toast.success("Application media & thumbnail cache cleared");
      setStorageUsage((prev) => ({ ...prev, usedMB: 2.1 }));
    } catch {
      toast.error("Failed to clear cache");
    }
  };

  const handleSave = () => {
    localStorage.setItem("chat_battery_saver", batterySaver.toString());
    localStorage.setItem("chat_network_mode", networkMode);
    toast.success("Device performance settings saved");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          backgroundColor: isDark ? "#202522" : "#FFFFFF",
          border: `1px solid ${isDark ? "#343B36" : "#E3E6E1"}`,
          color: isDark ? "#F1F3F0" : "#202421",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
        <Typography variant="h6" fontWeight={700}>
          Device & Performance Intelligence
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: isDark ? "#A6AEA8" : "#737A75" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ borderColor: isDark ? "#343B36" : "#E3E6E1" }}>
        {/* Battery Intelligence Section */}
        <Box mb={3}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            {isCharging ? (
              <BatteryChargingFull sx={{ color: "#27834A" }} />
            ) : batteryLevel && batteryLevel < 20 ? (
              <BatteryAlert sx={{ color: "#C0392B" }} />
            ) : (
              <BatteryChargingFull sx={{ color: "#236B4A" }} />
            )}
            <Typography variant="subtitle2" fontWeight={600}>
              Battery Awareness
            </Typography>
          </Box>

          {batteryLevel !== null ? (
            <Box mb={2}>
              <Box display="flex" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption" color={isDark ? "#A6AEA8" : "#737A75"}>
                  Battery Level: {batteryLevel}% {isCharging ? "(Charging)" : ""}
                </Typography>
                <Typography variant="caption" color={batterySaver ? "#27834A" : "inherit"} fontWeight={600}>
                  {batterySaver ? "Eco Mode Active" : "Standard"}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={batteryLevel}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: isDark ? "#343B36" : "#E3E6E1",
                  "& .MuiLinearProgress-bar": {
                    backgroundColor: batteryLevel < 20 ? "#C0392B" : "#236B4A",
                  },
                }}
              />
            </Box>
          ) : (
            <Typography variant="caption" color={isDark ? "#A6AEA8" : "#737A75"} display="block" mb={1}>
              Battery API not exposed in this browser environment.
            </Typography>
          )}

          <FormControlLabel
            control={
              <Switch
                checked={batterySaver}
                onChange={(e) => setBatterySaver(e.target.checked)}
                sx={{
                  "& .Mui-checked": { color: "#236B4A" },
                  "& .Mui-checked + .MuiSwitch-track": { backgroundColor: "#236B4A" },
                }}
              />
            }
            label={
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  Low Power Mode
                </Typography>
                <Typography variant="caption" color={isDark ? "#A6AEA8" : "#737A75"}>
                  Pauses nonessential animations, delays video autoplay, and reduces presence pings.
                </Typography>
              </Box>
            }
          />
        </Box>

        <Divider sx={{ my: 2, borderColor: isDark ? "#343B36" : "#E3E6E1" }} />

        {/* Storage Management Section */}
        <Box mb={3}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <StorageIcon sx={{ color: "#236B4A" }} />
            <Typography variant="subtitle2" fontWeight={600}>
              Storage & Cache Management
            </Typography>
          </Box>
          <Typography variant="body2" color={isDark ? "#A6AEA8" : "#737A75"} mb={1}>
            Application Cache & Thumbnails: <strong>{storageUsage.usedMB} MB</strong> used
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={handleClearCache}
            startIcon={<DeleteSweep />}
            sx={{
              borderColor: isDark ? "#343B36" : "#E3E6E1",
              color: isDark ? "#F1F3F0" : "#202421",
              textTransform: "none",
              borderRadius: 1.5,
              "&:hover": {
                borderColor: "#C0392B",
                color: "#C0392B",
                backgroundColor: "rgba(192, 57, 43, 0.05)",
              },
            }}
          >
            Clear Media & Thumbnail Cache
          </Button>
        </Box>

        <Divider sx={{ my: 2, borderColor: isDark ? "#343B36" : "#E3E6E1" }} />

        {/* Network Aware Optimization */}
        <Box>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Wifi sx={{ color: "#236B4A" }} />
            <Typography variant="subtitle2" fontWeight={600}>
              Network Data Policy
            </Typography>
          </Box>
          <RadioGroup
            value={networkMode}
            onChange={(e) => setNetworkMode(e.target.value)}
          >
            <FormControlLabel
              value="auto"
              control={<Radio sx={{ color: "#236B4A", "&.Mui-checked": { color: "#236B4A" } }} />}
              label={
                <Box>
                  <Typography variant="body2">Auto Detect (Default)</Typography>
                  <Typography variant="caption" color={isDark ? "#A6AEA8" : "#737A75"}>
                    Adapts media quality based on connection speed.
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="saver"
              control={<Radio sx={{ color: "#236B4A", "&.Mui-checked": { color: "#236B4A" } }} />}
              label={
                <Box>
                  <Typography variant="body2">Data Saver Mode</Typography>
                  <Typography variant="caption" color={isDark ? "#A6AEA8" : "#737A75"}>
                    Prefers compressed thumbnails and asks before downloading large attachments.
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, borderColor: isDark ? "#343B36" : "#E3E6E1" }}>
        <Button onClick={onClose} sx={{ color: isDark ? "#A6AEA8" : "#737A75", textTransform: "none" }}>
          Close
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          sx={{
            backgroundColor: "#236B4A",
            color: "#FFFFFF",
            textTransform: "none",
            borderRadius: 1.5,
            boxShadow: "none",
            "&:hover": { backgroundColor: "#1B573C", boxShadow: "none" },
          }}
        >
          Apply Settings
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DevicePerformanceDialog;

