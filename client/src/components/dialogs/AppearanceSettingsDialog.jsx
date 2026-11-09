import React, { useState } from "react";
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
  Slider,
  Divider,
  Stack,
  IconButton,
} from "@mui/material";
import { Close as CloseIcon, Palette, VolumeUp, Animation, Vibration } from "@mui/icons-material";
import { useDispatch, useSelector } from "react-redux";
import { toggleTheme } from "../../redux/reducers/misc";

const AppearanceSettingsDialog = ({ open, onClose }) => {
  const dispatch = useDispatch();
  const { themeMode } = useSelector((state) => state.misc);
  const isDark = themeMode === "dark";

  // Appearance Local Settings (Persisted in localStorage)
  const [wallpaper, setWallpaper] = useState(localStorage.getItem("chat_wallpaper") || "default");
  const [fontSize, setFontSize] = useState(Number(localStorage.getItem("chat_font_size")) || 15);
  const [animationIntensity, setAnimationIntensity] = useState(localStorage.getItem("chat_animations") || "normal");
  const [reducedMotion, setReducedMotion] = useState(localStorage.getItem("chat_reduced_motion") === "true");
  const [messageEffects, setMessageEffects] = useState(localStorage.getItem("chat_message_effects") !== "false");
  const [hapticFeedback, setHapticFeedback] = useState(localStorage.getItem("chat_haptics") !== "false");
  const [soundEffects, setSoundEffects] = useState(localStorage.getItem("chat_sounds") !== "false");

  const handleSave = () => {
    localStorage.setItem("chat_wallpaper", wallpaper);
    localStorage.setItem("chat_font_size", fontSize.toString());
    localStorage.setItem("chat_animations", animationIntensity);
    localStorage.setItem("chat_reduced_motion", reducedMotion.toString());
    localStorage.setItem("chat_message_effects", messageEffects.toString());
    localStorage.setItem("chat_haptics", hapticFeedback.toString());
    localStorage.setItem("chat_sounds", soundEffects.toString());
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
          Appearance & Experience
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: isDark ? "#A6AEA8" : "#737A75" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ borderColor: isDark ? "#343B36" : "#E3E6E1" }}>
        {/* Theme Section */}
        <Box mb={3}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Palette sx={{ fontSize: 20, color: "#236B4A" }} />
            <Typography variant="subtitle2" fontWeight={600}>
              Theme Mode
            </Typography>
          </Box>
          <RadioGroup
            row
            value={themeMode}
            onChange={() => dispatch(toggleTheme())}
          >
            <FormControlLabel value="light" control={<Radio sx={{ color: "#236B4A", "&.Mui-checked": { color: "#236B4A" } }} />} label="Light" />
            <FormControlLabel value="dark" control={<Radio sx={{ color: "#236B4A", "&.Mui-checked": { color: "#236B4A" } }} />} label="Dark" />
          </RadioGroup>
        </Box>

        <Divider sx={{ my: 2, borderColor: isDark ? "#343B36" : "#E3E6E1" }} />

        {/* Font Size */}
        <Box mb={3}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Message Font Size ({fontSize}px)
          </Typography>
          <Slider
            value={fontSize}
            min={12}
            max={20}
            step={1}
            onChange={(_, val) => setFontSize(val)}
            sx={{ color: "#236B4A" }}
          />
        </Box>

        <Divider sx={{ my: 2, borderColor: isDark ? "#343B36" : "#E3E6E1" }} />

        {/* Animation & Motion */}
        <Box mb={3}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Animation sx={{ fontSize: 20, color: "#236B4A" }} />
            <Typography variant="subtitle2" fontWeight={600}>
              Motion & Animations
            </Typography>
          </Box>
          <Stack spacing={1}>
            <FormControlLabel
              control={
                <Switch
                  checked={reducedMotion}
                  onChange={(e) => setReducedMotion(e.target.checked)}
                  sx={{ "& .Mui-checked": { color: "#236B4A" }, "& .Mui-checked + .MuiSwitch-track": { backgroundColor: "#236B4A" } }}
                />
              }
              label={<Typography variant="body2">Reduced Motion (Minimize UI movement)</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={messageEffects}
                  onChange={(e) => setMessageEffects(e.target.checked)}
                  sx={{ "& .Mui-checked": { color: "#236B4A" }, "& .Mui-checked + .MuiSwitch-track": { backgroundColor: "#236B4A" } }}
                />
              }
              label={<Typography variant="body2">Message Reaction & Celebration Effects</Typography>}
            />
          </Stack>
        </Box>

        <Divider sx={{ my: 2, borderColor: isDark ? "#343B36" : "#E3E6E1" }} />

        {/* Audio & Haptic Feedback */}
        <Box>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Vibration sx={{ fontSize: 20, color: "#236B4A" }} />
            <Typography variant="subtitle2" fontWeight={600}>
              Sensory Feedback
            </Typography>
          </Box>
          <Stack spacing={1}>
            <FormControlLabel
              control={
                <Switch
                  checked={hapticFeedback}
                  onChange={(e) => setHapticFeedback(e.target.checked)}
                  sx={{ "& .Mui-checked": { color: "#236B4A" }, "& .Mui-checked + .MuiSwitch-track": { backgroundColor: "#236B4A" } }}
                />
              }
              label={<Typography variant="body2">Haptic Feedback on Action</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={soundEffects}
                  onChange={(e) => setSoundEffects(e.target.checked)}
                  sx={{ "& .Mui-checked": { color: "#236B4A" }, "& .Mui-checked + .MuiSwitch-track": { backgroundColor: "#236B4A" } }}
                />
              }
              label={<Typography variant="body2">In-App Sound Effects (Subtle audio cues)</Typography>}
            />
          </Stack>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, borderColor: isDark ? "#343B36" : "#E3E6E1" }}>
        <Button onClick={onClose} sx={{ color: isDark ? "#A6AEA8" : "#737A75", textTransform: "none" }}>
          Cancel
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
          Save Preferences
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AppearanceSettingsDialog;

