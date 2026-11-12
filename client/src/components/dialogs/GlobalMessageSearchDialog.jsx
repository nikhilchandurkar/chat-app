import React, { useEffect, useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  AutoFixHigh as FuzzyIcon,
  Close as CloseIcon,
  Forum as ChatIcon,
  Group as GroupIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import moment from "moment";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useLazyGlobalSearchMessagesQuery } from "../../redux/api/api";
import { setActiveChatId, setIsMobile } from "../../redux/reducers/misc";

const GlobalMessageSearchDialog = ({ open, onClose }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [fuzzy, setFuzzy] = useState(true);
  const [selectedChatFilter, setSelectedChatFilter] = useState("");
  const [page, setPage] = useState(1);

  const [runGlobalSearch, { data, isFetching }] = useLazyGlobalSearchMessagesQuery();

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setDebounced(query.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open || debounced.length < 2) return;
    runGlobalSearch({ q: debounced, page, chatId: selectedChatFilter, fuzzy });
  }, [open, debounced, page, selectedChatFilter, fuzzy, runGlobalSearch]);

  const results = data?.messages || [];
  const chatFacets = data?.chats || [];

  const highlightMatch = (text, q) => {
    if (!text) return "(Attachment)";
    const tokens = String(q || "")
      .trim()
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    if (!tokens.length) return text;
    const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const parts = String(text).split(new RegExp(`(${escaped.join("|")})`, "gi"));
    return parts.map((p, i) =>
      tokens.some((tok) => tok.toLowerCase() === p.toLowerCase()) ? (
        <mark
          key={i}
          style={{
            backgroundColor: "#FEF08A",
            color: "#111827",
            padding: "0 2px",
            borderRadius: "2px",
          }}
        >
          {p}
        </mark>
      ) : (
        p
      )
    );
  };

  const handleSelectMessage = (msg) => {
    const targetChatId = msg.chatId || msg.chat;
    if (!targetChatId) return;
    try {
      sessionStorage.setItem(
        "chitchat_jump_msg",
        JSON.stringify({ chatId: String(targetChatId), message: msg })
      );
    } catch {
      // ignore storage errors
    }
    dispatch(setActiveChatId(String(targetChatId)));
    dispatch(setIsMobile(false));
    navigate(`/chat/${targetChatId}`);
    window.dispatchEvent(
      new CustomEvent("chitchat:jump-to-message", {
        detail: { chatId: String(targetChatId), message: msg },
      })
    );
    onClose?.();
  };

  return (
    <Dialog open={Boolean(open)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          py: 1.5,
          px: 2.25,
        }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          Search Messages Across All Chats
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close global message search">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 2.25, pb: 2.25, pt: 0.5 }}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              fullWidth
              autoFocus
              size="small"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value.trim()) setSelectedChatFilter("");
              }}
              placeholder="Search messages, files, or senders (typo-tolerant)..."
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: query ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="Clear query"
                      onClick={() => {
                        setQuery("");
                        setSelectedChatFilter("");
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
            <Chip
              size="small"
              clickable
              icon={<FuzzyIcon sx={{ fontSize: 15 }} />}
              label="Fuzzy"
              color={fuzzy ? "primary" : "default"}
              variant={fuzzy ? "filled" : "outlined"}
              onClick={() => setFuzzy((v) => !v)}
            />
          </Stack>

          {debounced.length >= 2 && chatFacets.length > 0 && (
            <Stack direction="row" spacing={0.6} sx={{ overflowX: "auto", pb: 0.25 }} alignItems="center">
              <Chip
                size="small"
                clickable
                label="All Chats"
                color={!selectedChatFilter ? "primary" : "default"}
                variant={!selectedChatFilter ? "filled" : "outlined"}
                onClick={() => {
                  setPage(1);
                  setSelectedChatFilter("");
                }}
              />
              {chatFacets.slice(0, 10).map((cf) => (
                <Chip
                  key={cf._id}
                  size="small"
                  clickable
                  icon={cf.groupChat ? <GroupIcon sx={{ fontSize: 14 }} /> : <ChatIcon sx={{ fontSize: 14 }} />}
                  label={`${cf.name} (${cf.count})`}
                  color={selectedChatFilter === cf._id ? "primary" : "default"}
                  variant={selectedChatFilter === cf._id ? "filled" : "outlined"}
                  onClick={() => {
                    setPage(1);
                    setSelectedChatFilter(selectedChatFilter === cf._id ? "" : cf._id);
                  }}
                />
              ))}
            </Stack>
          )}

          {debounced.length < 2 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>
              Enter at least 2 characters to search messages across all your DMs and groups.
            </Typography>
          ) : isFetching ? (
            <Box py={3} textAlign="center">
              <CircularProgress size={26} />
            </Box>
          ) : results.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>
              No matching messages found{fuzzy ? "" : " (try enabling Fuzzy search)"}.
            </Typography>
          ) : (
            <List disablePadding sx={{ maxHeight: "55vh", overflowY: "auto" }}>
              {results.map((m) => (
                <ListItemButton
                  key={m._id}
                  onClick={() => handleSelectMessage(m)}
                  sx={{ borderRadius: 1.5, mb: 0.5, alignItems: "flex-start", py: 0.9 }}
                >
                  <Box width="100%" minWidth={0}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} mb={0.25}>
                      <Stack direction="row" spacing={0.75} alignItems="center" minWidth={0}>
                        <Chip
                          size="small"
                          label={m.chatName || "Chat"}
                          color="primary"
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.7rem", maxWidth: 160 }}
                        />
                        <Typography variant="caption" fontWeight={700} noWrap>
                          {m.sender?.name || "User"}
                        </Typography>
                        {typeof m.matchScore === "number" && (
                          <Chip
                            size="small"
                            label={`${m.matchScore}%`}
                            variant="outlined"
                            sx={{ height: 18, fontSize: "0.66rem", "& .MuiChip-label": { px: 0.6 } }}
                          />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {moment(m.createdAt).format("MMM D, h:mm A")}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" noWrap color="text.primary">
                      {highlightMatch(m.content || m.attachments?.[0]?.name || "", debounced)}
                    </Typography>
                  </Box>
                </ListItemButton>
              ))}
            </List>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

export default GlobalMessageSearchDialog;

