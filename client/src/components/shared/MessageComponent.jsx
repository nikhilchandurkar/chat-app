import {
  Box, Typography, IconButton, TextField, Tooltip,
  Menu, MenuItem, ListItemIcon, ListItemText, CircularProgress
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  PushPin as PinIcon,
  AddReaction as AddReactionIcon,
  Forward as ForwardIcon,
  Reply as ReplyIcon,
  DoneAll as DoneAllIcon,
} from "@mui/icons-material";
import React, { memo, useState, lazy, Suspense } from "react";
import { lightBlue } from "../../constants/color";
import moment from "moment";
import { fileFormat } from "../../lib/feature";
import RenderAttachment from "./RenderAttachment";
import LinkPreview from "./LinkPreview";
import { motion } from "framer-motion";
import { useSelector } from "react-redux";
import { useEditMessageMutation, useDeleteMessageMutation, useToggleStarMessageMutation, usePinMessageMutation, useReactMessageMutation } from "../../redux/api/api";
import toast from "react-hot-toast";

const ForwardMessageDialog = lazy(() => import("../dialogs/ForwardMessageDialog"));

const COMMON_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const MessageComponent = ({ message, onEdit, onDelete, onReply, chatId, isGroupAdmin }) => {
  const { user } = useSelector((state) => state.auth);

  const { _id, sender, content, attachments = [], createdAt, isDeleted, isEdited, replyTo, readBy = [] } = message;
  const sameSender = sender?._id === user?._id;
  const timeAgo = createdAt ? moment(createdAt).fromNow() : "Just now";

  const [contextMenu, setContextMenu] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editValue, setEditValue] = useState(content || "");

  const [editMessageMutation, { isLoading: isEditing }] = useEditMessageMutation();
  const [deleteMessageMutation, { isLoading: isDeleting }] = useDeleteMessageMutation();
  const [toggleStar] = useToggleStarMessageMutation();
  const [pinMessageMutation] = usePinMessageMutation();
  const [reactMessageMutation] = useReactMessageMutation();

  const [isHovered, setIsHovered] = useState(false);
  const [showForwardDialog, setShowForwardDialog] = useState(false);

  // Right-click context menu
  const handleContextMenu = (e) => {
    if (isDeleted) return;
    e.preventDefault();
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
  };
  const handleCloseMenu = () => setContextMenu(null);

  const handleEditStart = () => {
    setEditValue(content || "");
    setEditMode(true);
    handleCloseMenu();
  };

  const handleEditSubmit = async () => {
    if (!editValue.trim() || editValue.trim() === content) {
      setEditMode(false);
      return;
    }
    try {
      const res = await editMessageMutation({ messageId: _id, content: editValue.trim() });
      if (res.data?.success) {
        onEdit?.(_id, editValue.trim());
        toast.success("Message edited");
      } else {
        toast.error(res.error?.data?.message || "Failed to edit");
      }
    } catch {
      toast.error("Failed to edit message");
    }
    setEditMode(false);
  };

  const handleDelete = async () => {
    handleCloseMenu();
    try {
      const res = await deleteMessageMutation(_id);
      if (res.data?.success) { onDelete?.(_id); toast.success("Message deleted"); }
      else toast.error(res.error?.data?.message || "Failed to delete");
    } catch { toast.error("Failed to delete message"); }
  };

  const handleStar = async () => {
    handleCloseMenu();
    try {
      const res = await toggleStar(_id);
      if (res.data?.success) toast.success(res.data.message);
    } catch { toast.error("Failed to star message"); }
  };

  const handlePin = async () => {
    handleCloseMenu();
    if (!chatId) return;
    try {
      const res = await pinMessageMutation({ chatId, messageId: _id });
      if (res.data?.success) toast.success("Message pinned");
      else toast.error(res.error?.data?.message || "Failed to pin");
    } catch { toast.error("Failed to pin message"); }
  };

  const handleReact = async (emoji) => {
    try {
      await reactMessageMutation({ messageId: _id, emoji });
    } catch (error) {
      toast.error("Failed to react");
    }
  };

  const handleForwardClick = () => {
    handleCloseMenu();
    setShowForwardDialog(true);
  };

  const handleReplyClick = () => {
    handleCloseMenu();
    onReply?.(message);
  };

  // Group reactions by emoji
  const reactionCounts = message.reactions?.reduce((acc, curr) => {
    acc[curr.emoji] = (acc[curr.emoji] || 0) + 1;
    return acc;
  }, {}) || {};

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: sameSender ? "100%" : "-100%" }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          alignSelf: sameSender ? "flex-end" : "flex-start",
          maxWidth: "70%",
          position: "relative",
          display: "flex",
          flexDirection: sameSender ? "row-reverse" : "row",
          alignItems: "center",
          gap: "8px",
        }}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Box
          sx={{
            background: sameSender ? "linear-gradient(135deg, #007AFF 0%, #0056b3 100%)" : "white",
            color: sameSender ? "white" : "black",
            borderRadius: sameSender ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
            padding: "0.6rem 1rem",
            position: "relative",
            boxShadow: sameSender ? "0 4px 10px rgba(0, 122, 255, 0.2)" : "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          {/* Sender name for group chats */}
          {!sameSender && sender?.name && (
            <Typography color={lightBlue} fontWeight="600" variant="caption" sx={{ display: "block", mb: 0.3 }}>
              {sender.name}
            </Typography>
          )}

          {/* Tombstone */}
          {isDeleted ? (
            <Typography variant="body2" sx={{ fontStyle: "italic", color: sameSender ? "rgba(255,255,255,0.5)" : "text.disabled" }}>
              🚫 This message was deleted
            </Typography>
          ) : editMode ? (
            /* Inline edit mode */
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 200 }}>
              <TextField
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                size="small"
                autoFocus
                fullWidth
                multiline
                maxRows={4}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); } if (e.key === "Escape") setEditMode(false); }}
                sx={{ "& .MuiInputBase-root": { color: sameSender ? "white" : "black", fontSize: "0.9rem" } }}
              />
              {isEditing ? <CircularProgress size={16} /> : (
                <>
                  <Tooltip title="Save"><IconButton size="small" onClick={handleEditSubmit} sx={{ color: "success.main" }}><CheckIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Cancel"><IconButton size="small" onClick={() => setEditMode(false)} sx={{ color: "error.main" }}><CloseIcon fontSize="small" /></IconButton></Tooltip>
                </>
              )}
            </Box>
          ) : (
            <>
              {/* Quoted Message Block */}
              {replyTo && (
                <Box sx={{
                  bgcolor: sameSender ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.05)",
                  p: 1, mb: 1, borderRadius: 1,
                  borderLeft: sameSender ? "4px solid rgba(255,255,255,0.5)" : "4px solid primary.main"
                }}>
                  <Typography variant="caption" fontWeight="bold" sx={{ color: sameSender ? "white" : "primary.main" }}>
                    {replyTo.sender?.name || "Unknown"}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {replyTo.content || "Attachment"}
                  </Typography>
                </Box>
              )}

              {/* Message content */}
              {content && <Typography variant="body2" sx={{ wordBreak: "break-word", lineHeight: 1.5 }}>{content}</Typography>}

              {/* Link Preview */}
              {content && <LinkPreview content={content} />}

              {/* Attachments */}
              {attachments?.length > 0 && attachments.map((attachment) => {
                const url = attachment.url;
                const file = fileFormat(url);
                return (
                  <Box key={url} sx={{ mt: 0.5 }}>
                    <a href={url} target="_blank" rel="noopener noreferrer" download={`attachment_${url}`} style={{ color: "inherit" }}>
                      {RenderAttachment(file, url)}
                    </a>
                  </Box>
                );
              })}
            </>
          )}

          {/* Timestamp + edited tag + read receipts */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.3, justifyContent: "flex-end" }}>
            {isEdited && !isDeleted && (
              <Typography variant="caption" sx={{ color: sameSender ? "rgba(255,255,255,0.5)" : "text.disabled", fontSize: "0.6rem" }}>
                (edited)
              </Typography>
            )}
            <Typography variant="caption" sx={{ color: sameSender ? "rgba(255,255,255,0.55)" : "text.secondary", fontSize: "0.65rem" }}>
              {timeAgo}
            </Typography>
            {sameSender && !isDeleted && (
              <DoneAllIcon 
                sx={{ 
                  fontSize: "1rem", 
                  color: readBy.length > 0 ? "#4ade80" : "rgba(255,255,255,0.6)", // Green for read, faint white for delivered
                  ml: 0.2
                }} 
              />
            )}
          </Box>

          {/* Render grouped reactions below message */}
          {Object.keys(reactionCounts).length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
              {Object.entries(reactionCounts).map(([emoji, count]) => (
                <Box
                  key={emoji}
                  onClick={() => handleReact(emoji)}
                  sx={{
                    display: "inline-flex", alignItems: "center", gap: 0.5,
                    backgroundColor: sameSender ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.05)",
                    borderRadius: "12px", padding: "2px 6px", cursor: "pointer",
                    "&:hover": { backgroundColor: sameSender ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.1)" }
                  }}
                >
                  <Typography variant="caption" sx={{ fontSize: "0.8rem" }}>{emoji}</Typography>
                  <Typography variant="caption" sx={{ fontSize: "0.7rem", fontWeight: "bold" }}>{count}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* Hover reaction bar */}
        {isHovered && !isDeleted && (
          <Box sx={{ display: "flex", backgroundColor: "background.paper", borderRadius: "20px", boxShadow: 1, p: 0.5, alignItems: "center" }}>
            <Tooltip title="Reply">
              <IconButton size="small" onClick={handleReplyClick} sx={{ padding: "4px", mr: 1, color: "text.secondary" }}>
                <ReplyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {COMMON_REACTIONS.map((emoji) => (
              <IconButton key={emoji} size="small" onClick={() => handleReact(emoji)} sx={{ padding: "4px" }}>
                <span style={{ fontSize: "1rem" }}>{emoji}</span>
              </IconButton>
            ))}
          </Box>
        )}
      </motion.div>

      {/* Right-click context menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        {/* Star — available on all messages */}
        <MenuItem onClick={handleStar} dense>
          <ListItemIcon><StarIcon fontSize="small" sx={{ color: "#f59e0b" }} /></ListItemIcon>
          <ListItemText>Star Message</ListItemText>
        </MenuItem>

        {/* Forward — available on all messages */}
        <MenuItem onClick={handleForwardClick} dense>
          <ListItemIcon><ForwardIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Forward</ListItemText>
        </MenuItem>

        {/* Reply — available on all messages */}
        <MenuItem onClick={handleReplyClick} dense>
          <ListItemIcon><ReplyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Reply</ListItemText>
        </MenuItem>

        {/* Pin — available to group admin */}
        {isGroupAdmin && chatId && (
          <MenuItem onClick={handlePin} dense>
            <ListItemIcon><PinIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText>Pin Message</ListItemText>
          </MenuItem>
        )}

        {/* Edit — only own text messages */}
        {sameSender && content && !attachments.length && (
          <MenuItem onClick={handleEditStart} dense>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>
        )}

        {/* Delete — own messages or group admin */}
        {(sameSender || isGroupAdmin) && (
          <MenuItem onClick={handleDelete} dense disabled={isDeleting}>
            <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText sx={{ color: "error.main" }}>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Forward Dialog */}
      {showForwardDialog && (
        <Suspense fallback={null}>
          <ForwardMessageDialog
            open={showForwardDialog}
            onClose={() => setShowForwardDialog(false)}
            messageId={_id}
          />
        </Suspense>
      )}
    </>
  );
};

export default memo(MessageComponent);

