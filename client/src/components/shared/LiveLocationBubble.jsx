import React, { useEffect, useState } from "react";
import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { LocationOn as PinIcon, OpenInNew as OpenIcon, StopCircle as StopIcon } from "@mui/icons-material";
import axios from "axios";
import toast from "react-hot-toast";
import { server } from "../../constants/config";

const LiveLocationBubble = ({ messageId, location, sameSender, onUpdated }) => {
  const [stopping, setStopping] = useState(false);
  const [remainingText, setRemainingText] = useState("");

  const expiresMs = location?.expiresAt ? new Date(location.expiresAt).getTime() : 0;
  const isExpired = expiresMs > 0 && Date.now() > expiresMs;
  const isActive = Boolean(location?.active) && !isExpired;

  useEffect(() => {
    if (!expiresMs) return undefined;
    const updateRem = () => {
      const diff = expiresMs - Date.now();
      if (diff <= 0) {
        setRemainingText("Ended");
        return;
      }
      const mins = Math.ceil(diff / 60000);
      setRemainingText(`${mins}m left`);
    };
    updateRem();
    const t = setInterval(updateRem, 15000);
    return () => clearInterval(t);
  }, [expiresMs]);

  // If current user is sharing actively, push periodic GPS updates while chat stays open
  useEffect(() => {
    if (!sameSender || !isActive || typeof navigator === "undefined" || !navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          const base = server || (typeof window !== "undefined" ? window.location.origin : "");
          const { data } = await axios.post(
            `${base}/api/v1/message/interactive/location/${messageId}/update`,
            { lat: pos.coords.latitude, lng: pos.coords.longitude },
            { withCredentials: true }
          );
          if (data?.success && Array.isArray(data.attachments)) {
            onUpdated?.(messageId, data.attachments);
          }
        } catch {
          // ignore transient update failure
        }
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 12000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [sameSender, isActive, messageId, onUpdated]);

  const handleStop = async () => {
    setStopping(true);
    try {
      const base = server || (typeof window !== "undefined" ? window.location.origin : "");
      const { data } = await axios.post(
        `${base}/api/v1/message/interactive/location/${messageId}/update`,
        { stop: true },
        { withCredentials: true }
      );
      if (data?.success && Array.isArray(data.attachments)) {
        onUpdated?.(messageId, data.attachments);
        toast("Live location stopped");
      }
    } catch {
      toast.error("Failed to stop live location");
    } finally {
      setStopping(false);
    }
  };

  if (!location) return null;

  const lat = Number(location.lat || 0).toFixed(5);
  const lng = Number(location.lng || 0).toFixed(5);
  const mapsUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, minWidth: 215, maxWidth: 280 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.6}>
        <Stack direction="row" spacing={0.6} alignItems="center">
          <PinIcon color={isActive ? "error" : "disabled"} fontSize="small" />
          <Typography variant="caption" fontWeight={800}>
            Live Location
          </Typography>
        </Stack>
        <Chip
          size="small"
          color={isActive ? "success" : "default"}
          label={isActive ? remainingText || "Live" : "Ended"}
          sx={{ height: 20, fontSize: "0.66rem", fontWeight: 700 }}
        />
      </Stack>

      <Box
        sx={{
          p: 1,
          borderRadius: 1.5,
          bgcolor: "action.hover",
          mb: 0.75,
        }}
      >
        <Typography variant="body2" fontWeight={700}>
          📍 {lat}, {lng}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Updated {location.updatedAt ? new Date(location.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "just now"}
        </Typography>
      </Box>

      <Stack direction="row" spacing={0.75}>
        <Button
          size="small"
          variant="contained"
          component="a"
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          endIcon={<OpenIcon fontSize="small" />}
          fullWidth
        >
          Open Map
        </Button>
        {sameSender && isActive && (
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<StopIcon fontSize="small" />}
            disabled={stopping}
            onClick={handleStop}
          >
            Stop
          </Button>
        )}
      </Stack>
    </Paper>
  );
};

export default LiveLocationBubble;

