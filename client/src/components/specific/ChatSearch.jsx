import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Box,
  Chip,
  TextField,
  Typography,
  IconButton,
  Paper,
  CircularProgress,
  Divider,
  Stack,
} from "@mui/material";
import { Search as SearchIcon, Close as CloseIcon, AutoAwesome as FuzzyIcon } from "@mui/icons-material";
import { useLazySearchMessagesQuery } from "../../redux/api/api";
import { formatMessageTime } from "../../lib/feature";

const DEBOUNCE_MS = 300;

const HighlightedText = ({ text, query }) => {
  if (!query || !text) return <span>{text}</span>;
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!tokens.length) return <span>{text}</span>;
  const rx = new RegExp(`(${tokens.join("|")})`, "gi");
  const parts = String(text).split(rx);
  return (
    <span>
      {parts.map((part, i) =>
        tokens.some((tok) => new RegExp(`^${tok}$`, "i").test(part)) ? (
          <mark key={i} style={{ background: "#fff176", borderRadius: 2, padding: "0 2px" }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
};

const ChatSearch = ({ chatId, members = [], onScrollToMessage, onClose }) => {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [senderFilter, setSenderFilter] = useState("");
  const [fuzzyEnabled, setFuzzyEnabled] = useState(true);
  const debounceRef = useRef(null);

  const [triggerSearch, { data, isFetching }] = useLazySearchMessagesQuery();

  const runSearch = useCallback(
    (q, p = 1, sId = senderFilter, fz = fuzzyEnabled) => {
      if (!q.trim() && !sId) return;
      triggerSearch({ chatId, q: q.trim(), page: p, senderId: sId, fuzzy: fz });
    },
    [chatId, fuzzyEnabled, senderFilter, triggerSearch]
  );

  const handleInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    setPage(1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q, 1, senderFilter, fuzzyEnabled), DEBOUNCE_MS);
  };

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const messages = data?.messages || [];
  const totalPages = data?.totalPages || 0;
  const cleanMembers = (members || []).filter((m) => m && typeof m === "object" && (m._id || m.id));

  return (
    <Paper
      elevation={4}
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        borderRadius: "0 0 12px 12px",
        overflow: "hidden",
        maxHeight: "76%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Search Input Bar */}
      <Box sx={{ display: "flex", alignItems: "center", p: 1, gap: 1, bgcolor: "background.paper" }}>
        <SearchIcon color="action" />
        <TextField
          autoFocus
          fullWidth
          size="small"
          variant="standard"
          placeholder="Search messages (typos supported with Fuzzy Match)..."
          value={query}
          onChange={handleInput}
          InputProps={{ disableUnderline: true }}
        />
        <Chip
          size="small"
          clickable
          icon={<FuzzyIcon sx={{ fontSize: 13 }} />}
          label="Fuzzy"
          color={fuzzyEnabled ? "primary" : "default"}
          variant={fuzzyEnabled ? "filled" : "outlined"}
          onClick={() => {
            const nxt = !fuzzyEnabled;
            setFuzzyEnabled(nxt);
            runSearch(query, 1, senderFilter, nxt);
          }}
        />
        {isFetching && <CircularProgress size={18} />}
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Member Filter Row (for 2-3+ user chats / groups) */}
      {cleanMembers.length > 0 && (
        <Stack direction="row" spacing={0.5} px={1.25} pb={0.85} overflow="auto" flexShrink={0}>
          <Chip
            size="small"
            clickable
            label="Anyone"
            color={!senderFilter ? "primary" : "default"}
            variant={!senderFilter ? "filled" : "outlined"}
            onClick={() => {
              setSenderFilter("");
              runSearch(query, 1, "", fuzzyEnabled);
            }}
          />
          {cleanMembers.map((m) => {
            const mid = String(m._id || m.id);
            const active = senderFilter === mid;
            return (
              <Chip
                key={mid}
                size="small"
                clickable
                label={m.name || m.username}
                color={active ? "primary" : "default"}
                variant={active ? "filled" : "outlined"}
                onClick={() => {
                  const next = active ? "" : mid;
                  setSenderFilter(next);
                  runSearch(query, 1, next, fuzzyEnabled);
                }}
              />
            );
          })}
        </Stack>
      )}

      <Divider />

      {/* Results */}
      <Box sx={{ overflowY: "auto", flex: 1 }}>
        {(query.trim().length >= 1 || senderFilter) && messages.length === 0 && !isFetching && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
            No similar messages found
          </Typography>
        )}
        {messages.map((msg) => (
          <Box
            key={msg._id}
            onClick={() => onScrollToMessage?.(msg._id, msg)}
            sx={{
              p: 1.5,
              cursor: "pointer",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
              "&:hover": { bgcolor: "rgba(0,0,0,0.04)" },
              transition: "background-color 0.15s",
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.3, gap: 1 }}>
              <Typography variant="caption" fontWeight={700} color="primary.main">
                {msg.sender?.name || "Unknown"}
              </Typography>
              <Stack direction="row" spacing={0.5} alignItems="center">
                {Number(msg.matchScore || 0) > 0 && query.trim() && (
                  <Chip
                    size="small"
                    label={`${msg.matchScore}%`}
                    color={msg.matchScore >= 90 ? "success" : "default"}
                    sx={{ height: 18, fontSize: "0.62rem", fontWeight: 700 }}
                  />
                )}
                <Typography variant="caption" color="text.disabled">
                  {formatMessageTime(msg.createdAt)}
                </Typography>
              </Stack>
            </Box>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              <HighlightedText text={msg.content || msg.attachments?.[0]?.name || "Attachment"} query={query} />
            </Typography>
          </Box>
        ))}

        {/* Pagination */}
        {totalPages > 1 && (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 1, p: 1 }}>
            <IconButton
              size="small"
              disabled={page <= 1}
              onClick={() => {
                const p = page - 1;
                setPage(p);
                runSearch(query, p);
              }}
            >
              ‹
            </IconButton>
            <Typography variant="caption">
              {page} / {totalPages}
            </Typography>
            <IconButton
              size="small"
              disabled={page >= totalPages}
              onClick={() => {
                const p = page + 1;
                setPage(p);
                runSearch(query, p);
              }}
            >
              ›
            </IconButton>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default ChatSearch;
