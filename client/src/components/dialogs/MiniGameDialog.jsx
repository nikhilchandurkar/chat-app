import React, { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";
import toast from "react-hot-toast";
import { server } from "../../constants/config";

const GAMES = [
  { id: "tictactoe", title: "Tic-Tac-Toe", emoji: "❌⭕", desc: "Classic 3x3 2-player duel" },
  { id: "rps", title: "Rock Paper Scissors", emoji: "✊✋✌️", desc: "Secret picks, instant reveal & rounds" },
  { id: "connect4", title: "Connect 4", emoji: "🔴🟡", desc: "Drop discs, get 4 in a row" },
  { id: "trivia", title: "Trivia Battle", emoji: "🧠", desc: "Group quiz — race for points" },
  { id: "wordguess", title: "Word Guess", emoji: "🔤", desc: "Guess the hidden word letter-by-letter" },
];

const MiniGameDialog = ({ open, onClose, chatId, activeTopic = "", onCreated }) => {
  const [selected, setSelected] = useState("tictactoe");
  const [customWord, setCustomWord] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleStart = async () => {
    if (!chatId) return;
    setSubmitting(true);
    try {
      const base = server || (typeof window !== "undefined" ? window.location.origin : "");
      const { data } = await axios.post(
        `${base}/api/v1/message/interactive/game/create`,
        {
          chatId,
          gameType: selected,
          customWord: selected === "wordguess" ? customWord.trim() : "",
          topicName: activeTopic && activeTopic !== "all" ? activeTopic : "",
        },
        { withCredentials: true }
      );
      if (data?.success) {
        onCreated?.(data.message);
        toast.success("Game posted in chat!");
        setCustomWord("");
        onClose();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to start game");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle fontWeight={700}>Start an In-Chat Mini-Game</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} pt={0.5}>
          <Grid container spacing={1}>
            {GAMES.map((g) => {
              const active = selected === g.id;
              return (
                <Grid item xs={12} key={g.id}>
                  <Paper
                    variant="outlined"
                    onClick={() => setSelected(g.id)}
                    sx={{
                      p: 1.25,
                      cursor: "pointer",
                      borderRadius: 2,
                      borderColor: active ? "primary.main" : "divider",
                      bgcolor: active ? "action.selected" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                    }}
                  >
                    <Typography fontSize="1.5rem" lineHeight={1}>
                      {g.emoji}
                    </Typography>
                    <Box minWidth={0}>
                      <Typography variant="subtitle2" fontWeight={700}>
                        {g.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {g.desc}
                      </Typography>
                    </Box>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>

          {selected === "wordguess" && (
            <TextField
              size="small"
              label="Optional Secret Word (4-8 letters)"
              placeholder="Leave blank for random word"
              value={customWord}
              onChange={(e) => setCustomWord(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 8))}
              fullWidth
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleStart} disabled={submitting}>
          {submitting ? "Starting..." : "Send Challenge"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MiniGameDialog;

