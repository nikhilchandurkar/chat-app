import React, { useState } from "react";
import { Box, Button, Chip, Grid, Paper, Stack, TextField, Typography } from "@mui/material";
import axios from "axios";
import toast from "react-hot-toast";
import { server } from "../../constants/config";

const RPS_OPTIONS = [
  { id: "rock", emoji: "✊" },
  { id: "paper", emoji: "✋" },
  { id: "scissors", emoji: "✌️" },
];

const GAME_TITLES = {
  tictactoe: "Tic-Tac-Toe",
  rps: "Rock Paper Scissors",
  connect4: "Connect 4",
  trivia: "Quiz Battle",
  wordguess: "Word Guess",
  diceduel: "Dice Duel",
  coinflip: "Coin Flip Streak",
  highlow: "High-Low (1–100)",
  memory: "Memory Match",
  dotsboxes: "Dots & Boxes",
  reversi: "Mini Reversi",
  mines: "Minesweeper 4x4",
  blackjack: "21 Blackjack",
  evenodd: "Even / Odd Bet",
  oddone: "Odd-One-Out",
  mathsprint: "Math Sprint",
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const MiniGameBubble = ({ messageId, game, currentUserId, onUpdated }) => {
  const [busy, setBusy] = useState(false);
  const [numberInput, setNumberInput] = useState("");
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
        minWidth: 225,
        maxWidth: 325,
        bgcolor: "action.hover",
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} mb={0.75}>
        <Typography variant="caption" fontWeight={800} sx={{ textTransform: "uppercase", letterSpacing: 0.4 }}>
          {GAME_TITLES[gtype] || "Mini-Game"}
          {(gtype === "rps" || gtype === "diceduel" || gtype === "evenodd") && ` · R${game.round || 1}`}
        </Typography>
        <Chip
          size="small"
          color={status === "finished" ? "success" : status === "draw" ? "default" : "primary"}
          label={status === "finished" ? `🏆 ${game.winnerName || "Winner"}` : status === "draw" ? game.winnerName || "Draw" : "Live"}
          sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700 }}
        />
      </Stack>

      {/* 1. Tic-Tac-Toe */}
      {gtype === "tictactoe" && (
        <>
          <Typography variant="caption" color="text.secondary" display="block" mb={0.75}>
            {status === "active" ? `Turn: ${game.turnSymbol}` : "Game Over"}
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0.6, maxWidth: 192, mx: "auto" }}>
            {(game.board || Array(9).fill("")).map((cell, idx) => {
              const inWin = (game.winLine || []).includes(idx);
              return (
                <Button
                  key={idx}
                  variant={inWin ? "contained" : "outlined"}
                  color={inWin ? "success" : cell === "X" ? "primary" : "secondary"}
                  disabled={busy || Boolean(cell) || status !== "active"}
                  onClick={() => sendMove({ index: idx })}
                  sx={{ minWidth: 56, height: 50, fontSize: "1.25rem", fontWeight: 800, p: 0 }}
                >
                  {cell || ""}
                </Button>
              );
            })}
          </Box>
        </>
      )}

      {/* 2. Rock Paper Scissors */}
      {gtype === "rps" && (
        <Stack spacing={1}>
          {status === "active" ? (
            <>
              <Typography variant="caption" color="text.secondary">
                {Object.keys(game.picks || {}).includes(myId)
                  ? "Pick locked in! Waiting for opponent..."
                  : `Pick your move (${Object.keys(game.picks || {}).length}/2 locked)`}
              </Typography>
              <Stack direction="row" spacing={0.75} justifyContent="center">
                {RPS_OPTIONS.map((opt) => (
                  <Button
                    key={opt.id}
                    size="small"
                    variant={game.picks?.[myId] === opt.id ? "contained" : "outlined"}
                    disabled={busy}
                    onClick={() => sendMove({ choice: opt.id })}
                    sx={{ minWidth: 0, px: 1.1, fontSize: "1rem" }}
                  >
                    {opt.emoji}
                  </Button>
                ))}
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

      {/* 3. Connect 4 */}
      {gtype === "connect4" && (
        <>
          <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
            {status === "active" ? (game.turnSlot === 1 ? "🔴 Red's Turn" : "🟡 Yellow's Turn") : "Match Finished"}
          </Typography>
          <Box sx={{ bgcolor: "#1E3A8A", p: 0.75, borderRadius: 1.5, display: "inline-block" }}>
            <Stack direction="row" spacing={0.4} mb={0.4}>
              {Array.from({ length: 7 }).map((_, col) => (
                <Button
                  key={col}
                  size="small"
                  disabled={busy || status !== "active"}
                  onClick={() => sendMove({ col })}
                  sx={{ minWidth: 26, width: 26, height: 20, p: 0, fontSize: "0.65rem", color: "#fff", bgcolor: "rgba(255,255,255,0.16)" }}
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

      {/* 4. Dynamic Multi-Round Quiz Battle */}
      {gtype === "trivia" && (
        <Stack spacing={0.75}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Chip size="small" label={game.category || "Quiz"} sx={{ height: 18, fontSize: "0.64rem" }} />
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              Q{(game.currentIndex || 0) + 1} / {(game.questions || []).length || 1}
            </Typography>
          </Stack>
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
                disabled={busy || Boolean(myAns) || status !== "active"}
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
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {Object.values(game.answers)
                  .map((a) => `${a.name}: ${a.correct ? "✅" : "❌"}`)
                  .join(" · ")}
              </Typography>
              {status === "active" && (
                <Button size="small" variant="contained" onClick={() => sendMove({ action: "next_question" })} disabled={busy}>
                  {(game.currentIndex || 0) + 1 < (game.questions || []).length ? "Next Q →" : "Finish Quiz"}
                </Button>
              )}
            </Stack>
          )}
        </Stack>
      )}

      {/* 5. Word Guess */}
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
                    sx={{ minWidth: 25, height: 25, p: 0, fontSize: "0.68rem", fontWeight: 700 }}
                  >
                    {ch}
                  </Button>
                </Grid>
              );
            })}
          </Grid>
        </Stack>
      )}

      {/* 6. Dice Duel */}
      {gtype === "diceduel" && (
        <Stack spacing={0.75} alignItems="center">
          {status === "active" ? (
            <Button
              size="small"
              variant="contained"
              disabled={busy || Boolean(game.rolls?.[myId])}
              onClick={() => sendMove({})}
            >
              {game.rolls?.[myId] ? `You rolled 🎲 ${game.rolls[myId]} (Waiting...)` : "🎲 Roll Dice"}
            </Button>
          ) : (
            <>
              <Typography variant="body2" fontWeight={700}>{game.lastOutcome}</Typography>
              <Button size="small" variant="outlined" onClick={() => sendMove({ action: "next_round" })} disabled={busy}>
                Roll Next Round
              </Button>
            </>
          )}
        </Stack>
      )}

      {/* 7. Coin Flip Streak */}
      {gtype === "coinflip" && (
        <Stack spacing={0.75} alignItems="center">
          {game.lastResult && (
            <Typography variant="caption" fontWeight={700} textAlign="center">{game.lastResult}</Typography>
          )}
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" disabled={busy} onClick={() => sendMove({ choice: "heads" })}>
              🪙 Heads
            </Button>
            <Button size="small" variant="outlined" disabled={busy} onClick={() => sendMove({ choice: "tails" })}>
              🪙 Tails
            </Button>
          </Stack>
        </Stack>
      )}

      {/* 8. High-Low & 16. Math Sprint */}
      {(gtype === "highlow" || gtype === "mathsprint") && (
        <Stack spacing={0.75}>
          <Typography variant="body2" fontWeight={700}>
            {gtype === "mathsprint" ? `Solve: ${game.expression}` : game.hint || "Guess 1–100"}
          </Typography>
          {gtype === "mathsprint" && game.lastGuess && (
            <Typography variant="caption" color="text.secondary">{game.lastGuess}</Typography>
          )}
          {status === "active" && (
            <Stack direction="row" spacing={0.75}>
              <TextField
                size="small"
                type="number"
                placeholder={gtype === "highlow" ? `${game.min || 1}-${game.max || 100}` : "Answer"}
                value={numberInput}
                onChange={(e) => setNumberInput(e.target.value)}
              />
              <Button
                size="small"
                variant="contained"
                disabled={busy || !numberInput.trim()}
                onClick={() => {
                  const n = Number(numberInput);
                  setNumberInput("");
                  sendMove(gtype === "highlow" ? { guess: n } : { answer: n });
                }}
              >
                Go
              </Button>
            </Stack>
          )}
        </Stack>
      )}

      {/* 9. Memory Match */}
      {gtype === "memory" && (
        <Stack spacing={0.6}>
          {game.lastTurn && <Typography variant="caption" color="text.secondary">{game.lastTurn}</Typography>}
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.5, maxWidth: 210, mx: "auto" }}>
            {(game.cards || []).map((em, idx) => {
              const isOpen = (game.matched || []).includes(idx) || (game.flipped || []).includes(idx);
              return (
                <Button
                  key={idx}
                  variant={isOpen ? "contained" : "outlined"}
                  color={(game.matched || []).includes(idx) ? "success" : "primary"}
                  disabled={busy || status !== "active" || isOpen}
                  onClick={() => sendMove({ index: idx })}
                  sx={{ minWidth: 44, height: 42, fontSize: "1.1rem", p: 0 }}
                >
                  {isOpen ? em : "❓"}
                </Button>
              );
            })}
          </Box>
        </Stack>
      )}

      {/* 10. Dots & Boxes (3x3) */}
      {gtype === "dotsboxes" && (
        <Stack spacing={0.4} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            {status === "active"
              ? `Turn: ${players[game.turnPlayerId] || (game.turnPlayerId === myId ? "You" : "Opponent")}`
              : "All boxes claimed!"}
          </Typography>
          {[0, 1, 2, 3].map((r) => (
            <React.Fragment key={`r-${r}`}>
              <Stack direction="row" alignItems="center" spacing={0.25}>
                {[0, 1, 2].map((c) => {
                  const taken = Boolean(game.hEdges?.[r]?.[c]);
                  return (
                    <React.Fragment key={`h-${r}-${c}`}>
                      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "text.primary" }} />
                      <Box
                        onClick={() => status === "active" && !taken && !busy && sendMove({ orientation: "h", row: r, col: c })}
                        sx={{
                          width: 34,
                          height: 8,
                          borderRadius: 1,
                          cursor: taken ? "default" : "pointer",
                          bgcolor: taken ? "#236B4A" : "rgba(128,128,128,0.22)",
                        }}
                      />
                    </React.Fragment>
                  );
                })}
                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "text.primary" }} />
              </Stack>
              {r < 3 && (
                <Stack direction="row" alignItems="center" spacing={0.25}>
                  {[0, 1, 2, 3].map((c) => {
                    const taken = Boolean(game.vEdges?.[r]?.[c]);
                    return (
                      <React.Fragment key={`v-${r}-${c}`}>
                        <Box
                          onClick={() => status === "active" && !taken && !busy && sendMove({ orientation: "v", row: r, col: c })}
                          sx={{
                            width: 8,
                            height: 28,
                            borderRadius: 1,
                            cursor: taken ? "default" : "pointer",
                            bgcolor: taken ? "#236B4A" : "rgba(128,128,128,0.22)",
                          }}
                        />
                        {c < 3 && (
                          <Box sx={{ width: 32, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.75rem" }}>
                            {game.boxes?.[r]?.[c] || ""}
                          </Box>
                        )}
                      </React.Fragment>
                    );
                  })}
                </Stack>
              )}
            </React.Fragment>
          ))}
        </Stack>
      )}

      {/* 11. Mini Reversi (6x6) */}
      {gtype === "reversi" && (
        <Stack spacing={0.5} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            {status === "active" ? (game.turnSlot === 1 ? "⚫ Black's Turn" : "⚪ White's Turn") : "Game Finished"}
          </Typography>
          <Box sx={{ bgcolor: "#166534", p: 0.6, borderRadius: 1.5 }}>
            {(game.board || []).map((row, r) => (
              <Stack key={r} direction="row" spacing={0.35} mb={r < 5 ? 0.35 : 0}>
                {row.map((cell, c) => (
                  <Box
                    key={c}
                    onClick={() => status === "active" && !cell && !busy && sendMove({ row: r, col: c })}
                    sx={{
                      width: 26,
                      height: 26,
                      borderRadius: "4px",
                      bgcolor: "rgba(255,255,255,0.14)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: cell ? "default" : "pointer",
                    }}
                  >
                    {cell !== 0 && (
                      <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: cell === 1 ? "#111827" : "#F8FAFC" }} />
                    )}
                  </Box>
                ))}
              </Stack>
            ))}
          </Box>
        </Stack>
      )}

      {/* 12. Minesweeper 4x4 */}
      {gtype === "mines" && (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.5, maxWidth: 185, mx: "auto" }}>
          {Array.from({ length: 16 }).map((_, idx) => {
            const isRev = (game.revealed || []).includes(idx);
            const isMine = status !== "active" && (game.mines || []).includes(idx);
            return (
              <Button
                key={idx}
                variant={isRev || isMine ? "contained" : "outlined"}
                color={isMine ? "error" : isRev ? "success" : "primary"}
                disabled={busy || isRev || status !== "active"}
                onClick={() => sendMove({ index: idx })}
                sx={{ minWidth: 40, height: 38, p: 0, fontSize: "0.95rem" }}
              >
                {isMine ? "💣" : isRev ? "💎" : "?"}
              </Button>
            );
          })}
        </Box>
      )}

      {/* 13. Blackjack Duel */}
      {gtype === "blackjack" && (
        <Stack spacing={0.75}>
          {Object.entries(game.hands || {}).map(([pid, hand]) => {
            const sum = (hand || []).reduce((a, b) => a + b, 0);
            return (
              <Typography key={pid} variant="caption" fontWeight={700}>
                {players[pid] || "Player"}: [{(hand || []).join(", ")}] = {sum}{sum > 21 ? " BUST!" : ""}
              </Typography>
            );
          })}
          {status === "active" && (
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="contained" disabled={busy || (game.stood || []).includes(myId)} onClick={() => sendMove({ action: "hit" })}>
                Hit
              </Button>
              <Button size="small" variant="outlined" disabled={busy || (game.stood || []).includes(myId)} onClick={() => sendMove({ action: "stand" })}>
                Stand
              </Button>
            </Stack>
          )}
        </Stack>
      )}

      {/* 14. Even / Odd */}
      {gtype === "evenodd" && (
        <Stack spacing={0.75} alignItems="center">
          {status === "active" ? (
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" disabled={busy} onClick={() => sendMove({ choice: "even" })}>
                Pick Even
              </Button>
              <Button size="small" variant="outlined" disabled={busy} onClick={() => sendMove({ choice: "odd" })}>
                Pick Odd
              </Button>
            </Stack>
          ) : (
            <>
              <Typography variant="body2" fontWeight={700}>{game.lastOutcome}</Typography>
              <Button size="small" variant="outlined" onClick={() => sendMove({ action: "next_round" })} disabled={busy}>
                Play Again
              </Button>
            </>
          )}
        </Stack>
      )}

      {/* 15. Emoji Odd-One-Out */}
      {gtype === "oddone" && (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.45, maxWidth: 190, mx: "auto" }}>
          {(game.grid || []).map((em, idx) => (
            <Button
              key={idx}
              size="small"
              variant={status !== "active" && idx === game.oddIndex ? "contained" : "outlined"}
              color={status !== "active" && idx === game.oddIndex ? "success" : "primary"}
              disabled={busy || status !== "active"}
              onClick={() => sendMove({ index: idx })}
              sx={{ minWidth: 40, height: 38, p: 0, fontSize: "1.15rem" }}
            >
              {em}
            </Button>
          ))}
        </Box>
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
