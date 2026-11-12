import React from "react";
import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import {
  ChatBubbleOutline as ChatIcon,
  DarkMode as ThemeIcon,
  GroupAdd as GroupIcon,
  PersonSearch as SearchIcon,
  AutoAwesome as SparkleIcon,
} from "@mui/icons-material";
import { motion } from "framer-motion";
import { useDispatch, useSelector } from "react-redux";
import { setIsMobile, setIsNewGroup, setIsSearch, toggleTheme } from "../redux/reducers/misc";

const Home = () => {
  const dispatch = useDispatch();
  const { themeMode } = useSelector((state) => state.misc);
  const { user } = useSelector((state) => state.auth);
  const isDark = themeMode === "dark";

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "auto",
        bgcolor: "background.default",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 2, sm: 3 },
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        style={{ width: "100%", maxWidth: 440 }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 4 },
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: isDark ? "#202522" : "#FFFFFF",
            textAlign: "center",
          }}
        >
          <motion.div
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <Box
              sx={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                bgcolor: "#236B4A",
                color: "#FFFFFF",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 2,
              }}
            >
              <ChatIcon fontSize="large" />
            </Box>
          </motion.div>

          <Typography variant="h5" fontWeight={700} gutterBottom>
            Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Pick a conversation or jump straight into creating a group or finding friends.
          </Typography>

          <Stack spacing={1.25}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<ChatIcon />}
              onClick={() => dispatch(setIsMobile(true))}
              sx={{
                display: { xs: "flex", sm: "none" },
                borderRadius: 2,
                py: 1.1,
                bgcolor: "#236B4A",
                "&:hover": { bgcolor: "#1B573C" },
              }}
            >
              Open Conversations
            </Button>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
              <Button
                variant="outlined"
                fullWidth
                startIcon={<SearchIcon />}
                onClick={() => dispatch(setIsSearch(true))}
                sx={{ borderRadius: 2 }}
              >
                Find People
              </Button>
              <Button
                variant="outlined"
                fullWidth
                startIcon={<GroupIcon />}
                onClick={() => dispatch(setIsNewGroup(true))}
                sx={{ borderRadius: 2 }}
              >
                New Group
              </Button>
            </Stack>

            <Button
              variant="text"
              size="small"
              startIcon={<ThemeIcon fontSize="small" />}
              onClick={() => dispatch(toggleTheme())}
              sx={{ borderRadius: 2 }}
            >
              Switch to {isDark ? "Light" : "Dark"} Mode
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" mt={2.5} useFlexGap>
            <Chip icon={<SparkleIcon fontSize="small" />} label="Hold or swipe right to ❤️" size="small" variant="outlined" />
            <Chip label="Swipe left to reply" size="small" variant="outlined" />
          </Stack>
        </Paper>
      </motion.div>
    </Box>
  );
};

export default Home;
