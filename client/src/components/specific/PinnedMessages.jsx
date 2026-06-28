import React, { memo, useState } from "react";
import {
  Box, Typography, Paper, Divider, Tooltip, IconButton, Collapse
} from "@mui/material";
import { PushPin as PinIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon } from "@mui/icons-material";
import { useGetPinnedMessagesQuery } from "../../redux/api/api";
import moment from "moment";

const PinnedMessages = ({ chatId, onScrollToMessage }) => {
  const [expanded, setExpanded] = useState(false);
  const { data } = useGetPinnedMessagesQuery(chatId, { skip: !chatId });
  const pinned = data?.pinnedMessages || [];

  if (!pinned.length) return null;

  const latest = pinned[pinned.length - 1];

  return (
    <Box sx={{ px: 1, pt: 0.5 }}>
      <Paper
        variant="outlined"
        sx={{
          borderLeft: "3px solid",
          borderLeftColor: "primary.main",
          borderRadius: "0 8px 8px 0",
          bgcolor: "rgba(102,126,234,0.06)",
          overflow: "hidden",
        }}
      >
        {/* Collapsed: show latest pin */}
        <Box
          sx={{ display: "flex", alignItems: "center", px: 1.5, py: 0.8, cursor: "pointer" }}
          onClick={() => pinned.length > 1 ? setExpanded((e) => !e) : onScrollToMessage?.(latest._id)}
        >
          <PinIcon sx={{ fontSize: 14, color: "primary.main", mr: 1, flexShrink: 0 }} />
          <Box sx={{ flex: 1, overflow: "hidden" }}>
            <Typography variant="caption" fontWeight={700} color="primary.main" display="block">
              📌 Pinned Message {pinned.length > 1 ? `(${pinned.length})` : ""}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {latest.isDeleted ? "🚫 This message was deleted" : latest.content || "📎 Attachment"}
            </Typography>
          </Box>
          {pinned.length > 1 && (
            <IconButton size="small" sx={{ ml: 0.5 }}>
              {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          )}
        </Box>

        {/* Expanded: show all pins */}
        <Collapse in={expanded}>
          <Divider />
          {pinned.map((msg, i) => (
            <Box
              key={msg._id}
              sx={{
                px: 1.5, py: 0.8,
                cursor: "pointer",
                "&:hover": { bgcolor: "rgba(102,126,234,0.1)" },
                borderTop: i > 0 ? "1px solid rgba(0,0,0,0.06)" : "none",
              }}
              onClick={() => { onScrollToMessage?.(msg._id); setExpanded(false); }}
            >
              <Typography variant="caption" fontWeight={600} color="primary.main" display="block">
                {msg.sender?.name || "Unknown"}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
              }}>
                {msg.isDeleted ? "🚫 This message was deleted" : msg.content || "📎 Attachment"}
              </Typography>
              <Typography variant="caption" color="text.disabled" display="block" mt={0.2}>
                {moment(msg.createdAt).fromNow()}
              </Typography>
            </Box>
          ))}
        </Collapse>
      </Paper>
    </Box>
  );
};

export default memo(PinnedMessages);
