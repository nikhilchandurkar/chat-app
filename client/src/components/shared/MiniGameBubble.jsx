import React, { useState } from "react";
import { Box, Button, Chip, Grid, Paper, Stack, Typography } from "@mui/material";
import axios from "axios";
import toast from "react-hot-toast";
import { server } from "../../constants/config";

const RPS_OPTIONS = [
  { id: "rock", emoji: "✊", label: "Rock" },
  { id: "paper", emoji: "✋", label: "Paper" },
  { id: "scissors", emoji: "✌️", label: "Scissors" },
];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const MiniGameBubble = ({ messageId, game, currentUserId, onUpdated }) => {
  const [busy, setBusy] = useState(false);
  if (!game || typeof game !== "object") return null;

  const myId = String(currentUserId || "");
  const players = game.players || {};
  const scores = game.scores || {};
  const status = game.status || "active";
  const gtype = game.gameType;

  const sendMove = async (payload) => {
    if (busy) return;
    setBusy(true);
    try {
      const base = server || (typeof window !== "undefined" ? window.location.origin : "");
      const { data } = await axios.post(
        `${base}/api/v1/message/interactive/game/${messageId}/move`,
        payload,
        { withCredentials: true }
      );
      if (data?.success && Array.isArray(data.attachments)) {
        onUpdated?.(messageId, data.attachments);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Move could not be played");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        mt: 0.5,
        borderRadius: 2,
        minWidth: 220,
        maxWidth: 310,
        bgcolor: "action.hover",
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} mb={0.75}>
        <Typography variant="caption" fontWeight={800} sx={{ textTransform: "uppercase", letterSpacing: 0.4 }}>
          {gtype === "tictactoe" && "Tic-Tac-Toe"}
          {gtype === "rps" && `Rock Paper Scissors · R${game.round || 1}`}
          {gtype === "connect4" && "Connect 4"}
          {gtype === "trivia" && "Trivia Battle"}
          {gtype === "wordguess" && "Word Guess"}
        </Typography>
        <Chip
          size="small"
          color={status === "finished" ? "success" : status === "draw" ? "default" : "primary"}
          label={status === "finished" ? `🏆 ${game.winnerName || "Winner"}` : status === "draw" ? game.winnerName || "Draw" : "Live"}
          sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700 }}
        />
      </Stack>

      {/* Tic-Tac-Toe */}
      {gtype === "tictactoe" && (
        <>
          <Typography variant="caption" color="text.secondary" display="block" mb={0.75}>
            {status === "active" ? `Turn: ${game.turnSymbol}` : "Game Over"}
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 0.6,
              maxWidth: 192,
              mx: "auto",
            }}
          >
            {(game.board || Array(9).fill("")).map((cell, idx) => {
              const inWin = (game.winLine || []).includes(idx);
              return (
                <Button
                  key={idx}
                  variant={inWin ? "contained" : "outlined"}
                  color={inWin ? "success" : cell === "X" ? "primary" : "secondary"}
                  disabled={busy || Boolean(cell) || status !== "active"}
                  onClick={() => sendMove({ index: idx })}
                  sx={{ minWidth: 56, height: 52, fontSize: "1.3rem", fontWeight: 800, p: 0 }}
                >
                  {cell || ""}
                </Button>
              );
            })}
          </Box>
        </>
      )}

      {/* Rock Paper Scissors */}
      {gtype === "rps" && (
        <Stack spacing={1}>
          {status === "active" ? (
            <>
              <Typography variant="caption" color="text.secondary">
                {Object.keys(game.picks || {}).includes(myId)
                  ? "Your pick is locked in! Waiting for opponent..."
                  : `Pick your move (${Object.keys(game.picks || {}).length}/2 locked)`}
              </Typography>
              <Stack direction="row" spacing={0.75} justifyContent="center">
                {RPS_OPTIONS.map((opt) => {
                  const chosen = game.picks?.[myId] === opt.id;
                  return (
                    <Button
                      key={opt.id}
                      size="small"
                      variant={chosen ? "contained" : "outlined"}
                      disabled={busy}
                      onClick={() => sendMove({ choice: opt.id })}
                      sx={{ minWidth: 0, px: 1.1, fontSize: "0.95rem" }}
                    >
                      {opt.emoji}
                    </Button>
                  );
                })}
              </Stack>
            </>
          ) : (
            <Stack spacing={0.75} alignItems="center">
              <Typography variant="body2" fontWeight={700} textAlign="center">
                {game.lastOutcome || game.winnerName}
              </Typography>
              <Button size="small" variant="outlined" onClick={() => sendMove({ action: "next_round" })} disabled={busy}>
                Play Next Round
              </Button>
            </Stack>
          )}
        </Stack>
      )}

      {/* Connect 4 */}
      {gtype === "connect4" && (
        <>
          <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
            {status === "active" ? (game.turnSlot === 1 ? "🔴 Red's Turn (Tap column)" : "🟡 Yellow's Turn (Tap column)") : "Match Finished"}
          </Typography>
          <Box sx={{ bgcolor: "#1E3A8A", p: 0.75, borderRadius: 1.5, display: "inline-block" }}>
            <Stack direction="row" spacing={0.4} mb={0.4}>
              {Array.from({ length: 7 }).map((_, col) => (
                <Button
                  key={col}
                  size="small"
                  disabled={busy || status !== "active"}
                  onClick={() => sendMove({ col })}
                  sx={{
                    minWidth: 26,
                    width: 26,
                    height: 20,
                    p: 0,
                    fontSize: "0.65rem",
                    color: "#FFFFFF",
                    bgcolor: "rgba(255,255,255,0.16)",
                  }}
                >
                  ▼
                </Button>
              ))}
            </Stack>
            <Stack spacing={0.4}>
              {(game.board || []).map((row, rIdx) => (
                <Stack key={rIdx} direction="row" spacing={0.4}>
                  {row.map((cell, cIdx) => (
                    <Box
                      key={cIdx}
                      onClick={() => status === "active" && !busy && sendMove({ col: cIdx })}
                      sx={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        cursor: status === "active" ? "pointer" : "default",
                        bgcolor: cell === 1 ? "#EF4444" : cell === 2 ? "#FACC15" : "#0F172A",
                        border: "1px solid rgba(255,255,255,0.22)",
                      }}
                    />
                  ))}
                </Stack>
              ))}
            </Stack>
          </Box>
        </>
      )}

      {/* Trivia Battle */}
      {gtype === "trivia" && (
        <Stack spacing={0.75}>
          <Typography variant="body2" fontWeight={700}>
            {game.question}
          </Typography>
          {(game.options || []).map((opt, idx) => {
            const myAns = game.answers?.[myId];
            const isCorrect = idx === game.correctIndex;
            const pickedThis = myAns?.optionIndex === idx;
            return (
              <Button
                key={idx}
                size="small"
                fullWidth
                disabled={busy || Boolean(myAns)}
                variant={pickedThis ? "contained" : "outlined"}
                color={myAns ? (isCorrect ? "success" : pickedThis ? "error" : "inherit") : "primary"}
                onClick={() => sendMove({ optionIndex: idx })}
                sx={{ justifyContent: "flex-start", textTransform: "none", fontSize: "0.78rem" }}
              >
                {String.fromCharCode(65 + idx)}. {opt}
              </Button>
            );
          })}
          {Object.keys(game.answers || {}).length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {Object.values(game.answers)
                .map((a) => `${a.name}: ${a.correct ? "✅" : "❌"}`)
                .join(" · ")}
            </Typography>
          )}
        </Stack>
      )}

      {/* Word Guess */}
      {gtype === "wordguess" && (
        <Stack spacing={0.75}>
          <Typography variant="h6" fontWeight={800} letterSpacing={4} textAlign="center">
            {(game.masked || []).join(" ")}
          </Typography>
          <Typography variant="caption" color="text.secondary" textAlign="center">
            Wrong tries: {game.wrongCount || 0} / {game.maxWrong || 6}
          </Typography>
          <Grid container spacing={0.35} justifyContent="center">
            {ALPHABET.map((ch) => {
              const used = (game.guessed || []).includes(ch);
              return (
                <Grid item key={ch}>
                  <Button
                    size="small"
                    variant={used ? "contained" : "outlined"}
                    disabled={busy || used || status !== "active"}
                    onClick={() => sendMove({ letter: ch })}
                    sx={{ minWidth: 26, height: 26, p: 0, fontSize: "0.7rem", fontWeight: 700 }}
                  >
                    {ch}
                  </Button>
                </Grid>
              );
            })}
          </Grid>
        </Stack>
      )}

      {/* Live Scoreboard */}
      {Object.keys(scores).length > 0 && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" mt={0.9}>
          {Object.entries(scores).map(([pid, pts]) => (
            <Chip
              key={pid}
              size="small"
              variant="outlined"
              label={`${players[pid] || "Player"}: ${pts}`}
              sx={{ height: 20, fontSize: "0.68rem" }}
            />
          ))}
        </Stack>
      )}
    </Paper>
  );
};

export default MiniGameBubble;

