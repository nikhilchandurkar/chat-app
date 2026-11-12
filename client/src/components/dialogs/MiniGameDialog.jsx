import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";
import toast from "react-hot-toast";
import { server } from "../../constants/config";

const GAMES = [
  { id: "trivia", title: "Quiz Battle (Dynamic)", emoji: "🧠", desc: "5 live rounds · Categories & Custom Quiz" },
  { id: "tictactoe", title: "Tic-Tac-Toe", emoji: "❌⭕", desc: "Classic 3x3 2-player duel" },
  { id: "connect4", title: "Connect 4", emoji: "🔴🟡", desc: "Drop discs, get 4 in a row" },
  { id: "rps", title: "Rock Paper Scissors", emoji: "✊✋✌️", desc: "Secret picks, instant reveal & rounds" },
  { id: "wordguess", title: "Word Guess", emoji: "🔤", desc: "Guess the hidden word letter-by-letter" },
  { id: "diceduel", title: "Dice Duel", emoji: "🎲", desc: "Roll head-to-head, highest wins" },
  { id: "coinflip", title: "Coin Flip Streak", emoji: "🪙", desc: "Call Heads or Tails for points" },
  { id: "highlow", title: "High-Low (1–100)", emoji: "🔢", desc: "Crack the secret number with hints" },
  { id: "memory", title: "Memory Match", emoji: "🃏", desc: "Flip 12 cards and find emoji pairs" },
  { id: "dotsboxes", title: "Dots & Boxes", emoji: "⬜", desc: "Draw lines, claim boxes, keep your turn" },
  { id: "reversi", title: "Mini Reversi (6x6)", emoji: "⚫⚪", desc: "Flip opponent discs on the board" },
  { id: "mines", title: "Minesweeper 4x4", emoji: "💣", desc: "Avoid 3 hidden mines, rack safe tiles" },
  { id: "blackjack", title: "21 Blackjack Duel", emoji: "🂡", desc: "Hit or Stand closest to 21" },
  { id: "evenodd", title: "Even / Odd Bet", emoji: "🎯", desc: "Predict Even or Odd on a 1–20 roll" },
  { id: "oddone", title: "Emoji Odd-One-Out", emoji: "👀", desc: "First to spot the sneaky emoji wins" },
  { id: "mathsprint", title: "Math Sprint", emoji: "⚡", desc: "Speed solve dynamic arithmetic" },
];

const QUIZ_CATEGORIES = [
  { id: "", label: "Dynamic Mix (Any Topic)" },
  { id: "18", label: "Computers & Tech" },
  { id: "17", label: "Science & Nature" },
  { id: "11", label: "Movies & Cinema" },
  { id: "12", label: "Music" },
  { id: "15", label: "Video Games" },
  { id: "21", label: "Sports" },
  { id: "22", label: "Geography" },
  { id: "23", label: "History" },
];

const MiniGameDialog = ({ open, onClose, chatId, activeTopic = "", onCreated }) => {
  const [selected, setSelected] = useState("trivia");
  const [customWord, setCustomWord] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("any");
  const [useCustomQuiz, setUseCustomQuiz] = useState(false);
  const [customQuestion, setCustomQuestion] = useState("");
  const [customOpts, setCustomOpts] = useState(["", "", "", ""]);
  const [customAns, setCustomAns] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const handleStart = async () => {
    if (!chatId) return;
    if (selected === "trivia" && useCustomQuiz) {
      const validOpts = customOpts.map((o) => o.trim()).filter(Boolean);
      if (!customQuestion.trim() || validOpts.length < 2) {
        toast.error("Enter a question and at least 2 options");
        return;
      }
    }

    setSubmitting(true);
    try {
      const base = server || (typeof window !== "undefined" ? window.location.origin : "");
      const catLabel = QUIZ_CATEGORIES.find((c) => c.id === category)?.label || "Dynamic Mix";
      const { data } = await axios.post(
        `${base}/api/v1/message/interactive/game/create`,
        {
          chatId,
          gameType: selected,
          customWord: selected === "wordguess" ? customWord.trim() : "",
          category,
          categoryName: useCustomQuiz ? "Custom Quiz" : catLabel,
          difficulty,
          customQuiz:
            selected === "trivia" && useCustomQuiz
              ? {
                  question: customQuestion.trim(),
                  options: customOpts.map((o) => o.trim()).filter(Boolean),
                  correctIndex: customAns,
                }
              : null,
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle fontWeight={700}>🎮 Choose an In-Chat Mini-Game ({GAMES.length})</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} pt={0.5}>
          <Box sx={{ maxHeight: 310, overflowY: "auto", pr: 0.5 }}>
            <Grid container spacing={1}>
              {GAMES.map((g) => {
                const active = selected === g.id;
                return (
                  <Grid item xs={12} sm={6} key={g.id}>
                    <Paper
                      variant="outlined"
                      onClick={() => setSelected(g.id)}
                      sx={{
                        p: 1.1,
                        cursor: "pointer",
                        borderRadius: 2,
                        borderColor: active ? "primary.main" : "divider",
                        bgcolor: active ? "action.selected" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                      }}
                    >
                      <Typography fontSize="1.35rem" lineHeight={1}>
                        {g.emoji}
                      </Typography>
                      <Box minWidth={0}>
                        <Typography variant="subtitle2" fontWeight={700} noWrap>
                          {g.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {g.desc}
                        </Typography>
                      </Box>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          </Box>

          {selected === "trivia" && (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Stack spacing={1.25}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle2" fontWeight={700}>
                    🧠 Dynamic Quiz Settings
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="caption">Custom Question</Typography>
                    <Switch size="small" checked={useCustomQuiz} onChange={(e) => setUseCustomQuiz(e.target.checked)} />
                  </Stack>
                </Stack>

                {!useCustomQuiz ? (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <TextField
                      select
                      size="small"
                      label="Category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      fullWidth
                    >
                      {QUIZ_CATEGORIES.map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Stack direction="row" spacing={0.5} alignItems="center" flexShrink={0}>
                      {["any", "easy", "medium", "hard"].map((lvl) => (
                        <Chip
                          key={lvl}
                          size="small"
                          clickable
                          label={lvl.toUpperCase()}
                          color={difficulty === lvl ? "primary" : "default"}
                          variant={difficulty === lvl ? "filled" : "outlined"}
                          onClick={() => setDifficulty(lvl)}
                        />
                      ))}
                    </Stack>
                  </Stack>
                ) : (
                  <Stack spacing={1}>
                    <TextField
                      size="small"
                      label="Your Quiz Question"
                      value={customQuestion}
                      onChange={(e) => setCustomQuestion(e.target.value)}
                      fullWidth
                    />
                    <Grid container spacing={0.75}>
                      {customOpts.map((val, i) => (
                        <Grid item xs={6} key={i}>
                          <TextField
                            size="small"
                            fullWidth
                            label={`Option ${String.fromCharCode(65 + i)}${customAns === i ? " (Correct ✓)" : ""}`}
                            value={val}
                            onChange={(e) =>
                              setCustomOpts((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
                            }
                            onFocus={() => setCustomAns(i)}
                          />
                        </Grid>
                      ))}
                    </Grid>
                    <Typography variant="caption" color="text.secondary">
                      Tip: Focus/tap an option box or click below to mark the correct answer:
                      {" "}
                      {[0, 1, 2, 3].map((i) => (
                        <Chip
                          key={i}
                          size="small"
                          clickable
                          label={String.fromCharCode(65 + i)}
                          color={customAns === i ? "success" : "default"}
                          onClick={() => setCustomAns(i)}
                          sx={{ ml: 0.5, height: 18, fontSize: "0.65rem" }}
                        />
                      ))}
                    </Typography>
                  </Stack>
                )}
              </Stack>
            </Paper>
          )}

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
          {submitting ? "Launching..." : "Send Game"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MiniGameDialog;
