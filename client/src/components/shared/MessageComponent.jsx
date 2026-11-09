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

const MessageComponent = ({ message, onEdit, onDelete, onReply, onReact, chatId, isGroupAdmin }) => {
  const { user } = useSelector((state) => state.auth);
  const { themeMode } = useSelector((state) => state.misc);
  const isDark = themeMode === "dark";

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
      const res = await reactMessageMutation({ messageId: _id, emoji });
      if (res.data?.success && res.data?.reactions) {
        onReact?.(_id, res.data.reactions);
      }
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

  // Group reactions by emoji (supporting both .emoji and .reaction shapes)
  const reactionCounts = (Array.isArray(message.reactions) ? message.reactions : []).reduce((acc, curr) => {
    const em = typeof curr === "string" ? curr : (curr?.emoji || curr?.reaction);
    if (em) {
      acc[em] = (acc[em] || 0) + 1;
    }
    return acc;
  }, {});

  const currentUserId = String(user?._id || user?.id || "");
  const myReactedEmojis = new Set(
    (Array.isArray(message.reactions) ? message.reactions : [])
      .filter((r) => {
        const uid = String(r?.user_id || r?.userId || r?.user || "");
        return uid && uid === currentUserId;
      })
      .map((r) => (typeof r === "string" ? r : (r?.emoji || r?.reaction)))
      .filter(Boolean)
  );

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
            backgroundColor: sameSender 
              ? (isDark ? "#24382D" : "#E8F3ED") 
              : (isDark ? "#202522" : "#FFFFFF"),
            color: isDark ? "#F1F3F0" : "#202421",
            borderRadius: sameSender ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
            border: sameSender 
              ? `1px solid ${isDark ? "#324D3E" : "#D0E4D8"}` 
              : `1px solid ${isDark ? "#343B36" : "#E3E6E1"}`,
            padding: "0.55rem 0.9rem",
            position: "relative",
            boxShadow: isDark ? "none" : "0 1px 3px rgba(32, 36, 33, 0.04)",
          }}
        >
          {/* Sender name for group chats */}
          {!sameSender && sender?.name && (
            <Typography sx={{ color: isDark ? "#4B9B70" : "#236B4A" }} fontWeight="600" variant="caption" display="block" mb={0.3}>
              {sender.name}
            </Typography>
          )}

          {/* Tombstone */}
          {isDeleted ? (
            <Typography variant="body2" sx={{ fontStyle: "italic", color: isDark ? "#A6AEA8" : "#737A75" }}>
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
                sx={{ "& .MuiInputBase-root": { color: isDark ? "#F1F3F0" : "#202421", fontSize: "0.9rem" } }}
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
                  bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(35, 107, 74, 0.06)",
                  p: 0.8, mb: 0.8, borderRadius: 1,
                  borderLeft: `3px solid ${isDark ? "#4B9B70" : "#236B4A"}`
                }}>
                  <Typography variant="caption" fontWeight="bold" sx={{ color: isDark ? "#4B9B70" : "#236B4A" }}>
                    {replyTo.sender?.name || "Unknown"}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {replyTo.content || "Attachment"}
                  </Typography>
                </Box>
              )}

              {/* Message content */}
              {content && <Typography variant="body2" sx={{ wordBreak: "break-word", lineHeight: 1.5, color: isDark ? "#F1F3F0" : "#202421" }}>{content}</Typography>}

              {/* Link Preview */}
              {content && <LinkPreview content={content} />}

              {/* Attachments */}
              {attachments?.length > 0 && attachments.map((attachment, idx) => {
                const url = typeof attachment === "string" ? attachment : (attachment.url || attachment.path || "");
                if (!url) return null;
                const file = fileFormat(url);
                const name = typeof attachment === "object" ? attachment.name : "";
                return (
                  <Box key={url + idx} sx={{ mt: 0.5 }}>
                    <RenderAttachment file={file} url={url} name={name} />
                  </Box>
                );
              })}
            </>
          )}

          {/* Timestamp + edited tag + read receipts */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.3, justifyContent: "flex-end" }}>
            {isEdited && !isDeleted && (
              <Typography variant="caption" sx={{ color: isDark ? "#A6AEA8" : "#737A75", fontSize: "0.6rem" }}>
                (edited)
              </Typography>
            )}
            <Typography variant="caption" sx={{ color: isDark ? "#A6AEA8" : "#737A75", fontSize: "0.65rem" }}>
              {timeAgo}
            </Typography>
            {sameSender && !isDeleted && (
              <DoneAllIcon 
                sx={{ 
                  fontSize: "1rem", 
                  color: readBy.length > 0 ? "#27834A" : (isDark ? "#A6AEA8" : "#737A75"),
                  ml: 0.2
                }} 
              />
            )}
          </Box>

          {/* Render grouped reactions below message */}
          {Object.keys(reactionCounts).length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
              {Object.entries(reactionCounts).map(([emoji, count]) => {
                const hasReacted = myReactedEmojis.has(emoji);
                return (
                  <Box
                    key={emoji}
                    onClick={() => handleReact(emoji)}
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.5,
                      backgroundColor: hasReacted
                        ? (isDark ? "rgba(75, 155, 112, 0.25)" : "rgba(35, 107, 74, 0.16)")
                        : (isDark ? "rgba(255,255,255,0.08)" : "rgba(35, 107, 74, 0.08)"),
                      border: hasReacted
                        ? `1.5px solid ${isDark ? "#4B9B70" : "#236B4A"}`
                        : `1px solid ${isDark ? "#343B36" : "#D0E4D8"}`,
                      borderRadius: "6px",
                      padding: "1px 6px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      "&:hover": {
                        backgroundColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(35, 107, 74, 0.2)",
                        transform: "scale(1.05)",
                      }
                    }}
                  >
                    <Typography variant="caption" sx={{ fontSize: "0.85rem" }}>{emoji}</Typography>
                    <Typography variant="caption" sx={{ fontSize: "0.72rem", fontWeight: hasReacted ? "700" : "500", color: hasReacted ? (isDark ? "#4B9B70" : "#236B4A") : "inherit" }}>
                      {count}
                    </Typography>
                  </Box>
                );
              })}
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

