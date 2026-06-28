import React, { useState, memo } from "react";
import {
  Drawer, Box, Typography, IconButton, Divider,
  List, ListItem, ListItemText, Avatar, Chip, Tooltip
} from "@mui/material";
import { Star as StarIcon, Close as CloseIcon } from "@mui/icons-material";
import { useGetStarredMessagesQuery } from "../../redux/api/api";
import moment from "moment";

const StarredMessages = ({ open, onClose }) => {
  const { data, isLoading } = useGetStarredMessagesQuery(undefined, { skip: !open });
  const messages = data?.messages || [];

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 360 } } }}
    >
      <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <StarIcon sx={{ color: "#f59e0b" }} />
          <Typography variant="h6" fontWeight={700}>Starred Messages</Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </Box>
      <Divider />

      {isLoading ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography color="text.secondary">Loading...</Typography>
        </Box>
      ) : messages.length === 0 ? (
        <Box sx={{ p: 4, textAlign: "center" }}>
          <StarIcon sx={{ fontSize: 48, color: "rgba(0,0,0,0.15)", mb: 1 }} />
          <Typography color="text.secondary" variant="body2">
            No starred messages yet.<br />
            Right-click any message to star it.
          </Typography>
        </Box>
      ) : (
        <List disablePadding>
          {messages.map((msg) => (
            <Box key={msg._id}>
              <ListItem
                alignItems="flex-start"
                sx={{ px: 2, py: 1.5, "&:hover": { bgcolor: "rgba(0,0,0,0.03)" } }}
              >
                <Avatar
                  src={msg.sender?.avatar?.url}
                  sx={{ width: 36, height: 36, mr: 1.5, mt: 0.5, flexShrink: 0 }}
                >
                  {msg.sender?.name?.[0]}
                </Avatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.3 }}>
                      <Typography variant="caption" fontWeight={700} color="primary.main">
                        {msg.sender?.name || "Unknown"}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {moment(msg.createdAt).format("MMM D, h:mm a")}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    msg.isDeleted ? (
                      <Typography variant="body2" sx={{ fontStyle: "italic", color: "text.disabled" }}>
                        🚫 This message was deleted
                      </Typography>
                    ) : msg.content ? (
                      <Typography variant="body2" color="text.primary" sx={{
                        display: "-webkit-box", WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical", overflow: "hidden"
                      }}>
                        {msg.content}
                      </Typography>
                    ) : (
                      <Chip label="Attachment" size="small" variant="outlined" />
                    )
                  }
                />
              </ListItem>
              <Divider component="li" />
            </Box>
          ))}
        </List>
      )}
    </Drawer>
  );
};

export default memo(StarredMessages);
