import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Box, TextField, Typography, IconButton, Paper, CircularProgress, Divider
} from "@mui/material";
import { Search as SearchIcon, Close as CloseIcon } from "@mui/icons-material";
import { useLazySearchMessagesQuery } from "../../redux/api/api";
import moment from "moment";

const DEBOUNCE_MS = 350;

const HighlightedText = ({ text, query }) => {
  if (!query || !text) return <span>{text}</span>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} style={{ background: "#fff176", borderRadius: 2, padding: "0 1px" }}>{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </span>
  );
};

const ChatSearch = ({ chatId, onScrollToMessage, onClose }) => {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const debounceRef = useRef(null);

  const [triggerSearch, { data, isFetching }] = useLazySearchMessagesQuery();

  const runSearch = useCallback((q, p = 1) => {
    if (!q.trim() || q.trim().length < 2) return;
    triggerSearch({ chatId, q: q.trim(), page: p });
  }, [chatId, triggerSearch]);

  const handleInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    setPage(1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q, 1), DEBOUNCE_MS);
  };

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const messages = data?.messages || [];
  const totalPages = data?.totalPages || 0;

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
        maxHeight: "70%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Search Input Bar */}
      <Box sx={{ display: "flex", alignItems: "center", p: 1, gap: 1, bgcolor: "white" }}>
        <SearchIcon color="action" />
        <TextField
          autoFocus
          fullWidth
          size="small"
          variant="standard"
          placeholder="Search messages..."
          value={query}
          onChange={handleInput}
          InputProps={{ disableUnderline: true }}
        />
        {isFetching && <CircularProgress size={18} />}
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>

      <Divider />

      {/* Results */}
      <Box sx={{ overflowY: "auto", flex: 1 }}>
        {query.trim().length >= 2 && messages.length === 0 && !isFetching && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
            No messages found for "{query}"
          </Typography>
        )}
        {messages.map((msg) => (
          <Box
            key={msg._id}
            onClick={() => onScrollToMessage?.(msg._id)}
            sx={{
              p: 1.5,
              cursor: "pointer",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
              "&:hover": { bgcolor: "rgba(0,0,0,0.04)" },
              transition: "background-color 0.15s",
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.3 }}>
              <Typography variant="caption" fontWeight={600} color="primary.main">
                {msg.sender?.name || "Unknown"}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                {moment(msg.createdAt).format("MMM D, h:mm a")}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
            }}>
              <HighlightedText text={msg.content} query={query} />
            </Typography>
          </Box>
        ))}

        {/* Pagination */}
        {totalPages > 1 && (
          <Box sx={{ display: "flex", justifyContent: "center", gap: 1, p: 1 }}>
            <IconButton size="small" disabled={page <= 1} onClick={() => { setPage(p => p - 1); runSearch(query, page - 1); }}>
              ‹
            </IconButton>
            <Typography variant="caption" sx={{ lineHeight: "30px" }}>
              {page} / {totalPages}
            </Typography>
            <IconButton size="small" disabled={page >= totalPages} onClick={() => { setPage(p => p + 1); runSearch(query, page + 1); }}>
              ›
            </IconButton>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default ChatSearch;
