import {
  Box,
  Typography,
  IconButton,
  TextField,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  ClickAwayListener,
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Star as StarIcon,
  PushPin as PinIcon,
  Forward as ForwardIcon,
  Reply as ReplyIcon,
  DoneAll as DoneAllIcon,
  ContentCopy as CopyIcon,
  MoreHoriz as MoreIcon,
} from "@mui/icons-material";
import React, { memo, useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { fileFormat, formatTimeAgo } from "../../lib/feature";
import RenderAttachment from "./RenderAttachment";
import LinkPreview from "./LinkPreview";
import EmojiBurst from "./EmojiBurst";
import { AnimatePresence, motion } from "framer-motion";
import { useSelector } from "react-redux";
import {
  useEditMessageMutation,
  useDeleteMessageMutation,
  useToggleStarMessageMutation,
  usePinMessageMutation,
  useReactMessageMutation,
} from "../../redux/api/api";
import { getChatFontSize, PREFS_EVENT, triggerHaptic } from "../../utils/feedback";
import toast from "react-hot-toast";

const ForwardMessageDialog = lazy(() => import("../dialogs/ForwardMessageDialog"));

const COMMON_REACTIONS = ["👍", "❤️", "😂", "😮", "🎉", "🔥"];

const MessageComponent = ({ message, onEdit, onDelete, onReply, onReact, chatId, isGroupAdmin }) => {
  const { user } = useSelector((state) => state.auth);
  const { themeMode } = useSelector((state) => state.misc);
  const isDark = themeMode === "dark";

  const { _id, sender, content, attachments = [], createdAt, isDeleted, isEdited, replyTo, readBy = [] } = message;
  const senderId = String(sender?._id || sender?.id || "");
  const currentUserId = String(user?._id || user?.id || "");
  const sameSender = Boolean(senderId && currentUserId && senderId === currentUserId);
  const timeAgo = createdAt ? formatTimeAgo(createdAt) : "Just now";

  const [contextMenu, setContextMenu] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editValue, setEditValue] = useState(content || "");
  const [fontSize, setFontSize] = useState(getChatFontSize);

  const [editMessageMutation, { isLoading: isEditing }] = useEditMessageMutation();
  const [deleteMessageMutation, { isLoading: isDeleting }] = useDeleteMessageMutation();
  const [toggleStar] = useToggleStarMessageMutation();
  const [pinMessageMutation] = usePinMessageMutation();
  const [reactMessageMutation] = useReactMessageMutation();

  const [isHovered, setIsHovered] = useState(false);
  const [holdTrayOpen, setHoldTrayOpen] = useState(false);
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [bursts, setBursts] = useState([]);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const burstCounterRef = useRef(0);
  const longPressTimerRef = useRef(null);
  const pointerStateRef = useRef(null);
  const swipeTriggeredRef = useRef(false);
  const lastTapTimeRef = useRef(0);
  const holdOpenedAtRef = useRef(0);

  useEffect(() => {
    const onPrefs = () => setFontSize(getChatFontSize());
    window.addEventListener(PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(PREFS_EVENT, onPrefs);
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const spawnBurst = useCallback((emoji) => {
    const id = ++burstCounterRef.current;
    setBursts((prev) => [...prev.slice(-4), { id, emoji }]);
    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, 950);
  }, []);

  const handleContextMenu = (e) => {
    if (isDeleted) return;
    e.preventDefault();
    setHoldTrayOpen(false);
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
  };
  const handleCloseMenu = () => setContextMenu(null);

  const handleEditStart = () => {
    setEditValue(content || "");
    setEditMode(true);
    setHoldTrayOpen(false);
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
    setHoldTrayOpen(false);
    try {
      const res = await deleteMessageMutation(_id);
      if (res.data?.success) {
        onDelete?.(_id);
        toast.success("Message deleted");
      } else {
        toast.error(res.error?.data?.message || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete message");
    }
  };

  const handleStar = async () => {
    handleCloseMenu();
    setHoldTrayOpen(false);
    try {
      const res = await toggleStar(_id);
      if (res.data?.success) toast.success(res.data.message);
    } catch {
      toast.error("Failed to star message");
    }
  };

  const handlePin = async () => {
    handleCloseMenu();
    setHoldTrayOpen(false);
    if (!chatId) return;
    try {
      const res = await pinMessageMutation({ chatId, messageId: _id });
      if (res.data?.success) toast.success("Message pinned");
      else toast.error(res.error?.data?.message || "Failed to pin");
    } catch {
      toast.error("Failed to pin message");
    }
  };

  const handleCopy = () => {
    handleCloseMenu();
    setHoldTrayOpen(false);
    if (!content) return;
    navigator.clipboard?.writeText(content);
    toast.success("Copied");
  };

  const handleReact = async (emoji) => {
    setHoldTrayOpen(false);
    triggerHaptic(14);
    spawnBurst(emoji);
    try {
      const res = await reactMessageMutation({ messageId: _id, emoji });
      if (res.data?.success && res.data?.reactions) {
        onReact?.(_id, res.data.reactions);
      }
    } catch {
      toast.error("Failed to react");
    }
  };

  const handleForwardClick = () => {
    handleCloseMenu();
    setHoldTrayOpen(false);
    setShowForwardDialog(true);
  };

  const handleReplyClick = () => {
    handleCloseMenu();
    setHoldTrayOpen(false);
    triggerHaptic(12);
    onReply?.(message);
  };

  // Unified touch + mouse gesture handlers: long-press (hold to react), swipe-right to reply, double-tap ❤️
  const handlePointerDown = (e) => {
    if (isDeleted || editMode) return;
    if (e.button !== undefined && e.button !== 0) return;

    swipeTriggeredRef.current = false;
    pointerStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      axis: null,
      pointerType: e.pointerType || "mouse",
    };

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      if (pointerStateRef.current && pointerStateRef.current.axis !== "scroll") {
        holdOpenedAtRef.current = Date.now();
        triggerHaptic(18);
        setHoldTrayOpen(true);
      }
    }, 400);
  };

  const handlePointerMove = (e) => {
    const st = pointerStateRef.current;
    if (!st || isDeleted || editMode) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      st.moved = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    if (!st.axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      st.axis = dx > 10 && dx > Math.abs(dy) * 1.4 ? "swipe" : "scroll";
    }

    if (st.axis === "swipe") {
      const clamped = Math.max(0, Math.min(68, dx));
      setSwipeOffset(clamped);
      if (clamped >= 48 && !swipeTriggeredRef.current) {
        swipeTriggeredRef.current = true;
        triggerHaptic(12);
      }
    }
  };

  const finishPointerGesture = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    const st = pointerStateRef.current;
    if (swipeOffset >= 48 && !isDeleted && !editMode) {
      onReply?.(message);
    } else if (st && !st.moved && st.pointerType === "touch" && !holdTrayOpen && !isDeleted && !editMode) {
      const now = Date.now();
      if (now - lastTapTimeRef.current < 260) {
        lastTapTimeRef.current = 0;
        handleReact("❤️");
      } else {
        lastTapTimeRef.current = now;
      }
    }
    setSwipeOffset(0);
    pointerStateRef.current = null;
  };

  // Group reactions by emoji
  const reactionCounts = (Array.isArray(message.reactions) ? message.reactions : []).reduce((acc, curr) => {
    const em = typeof curr === "string" ? curr : curr?.emoji || curr?.reaction;
    if (em) acc[em] = (acc[em] || 0) + 1;
    return acc;
  }, {});

  const myReactedEmojis = new Set(
    (Array.isArray(message.reactions) ? message.reactions : [])
      .filter((r) => {
        const uid = String(r?.user_id || r?.userId || r?.user || "");
        return uid && uid === currentUserId;
      })
      .map((r) => (typeof r === "string" ? r : r?.emoji || r?.reaction))
      .filter(Boolean)
  );

  const showQuickBar = !isDeleted && !editMode && (holdTrayOpen || isHovered);

  const quickBarContent = (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, y: 6 }}
      transition={{ duration: 0.14 }}
      style={{
        position: "absolute",
        top: -46,
        ...(sameSender ? { right: 0 } : { left: 0 }),
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: "2px",
        padding: "3px 6px",
        borderRadius: "999px",
        backgroundColor: isDark ? "#262D28" : "#FFFFFF",
        border: `1px solid ${isDark ? "#3A443D" : "#DCE3DD"}`,
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.14)",
        maxWidth: "calc(100vw - 24px)",
        overflowX: "auto",
      }}
    >
      {COMMON_REACTIONS.map((emoji) => (
        <IconButton
          key={emoji}
          size="small"
          onClick={() => handleReact(emoji)}
          sx={{
            p: "4px",
            transition: "transform 0.12s ease",
            "&:hover": { transform: "scale(1.25)" },
          }}
        >
          <span style={{ fontSize: "1.05rem", lineHeight: 1 }}>{emoji}</span>
        </IconButton>
      ))}
      <Tooltip title="Reply">
        <IconButton size="small" onClick={handleReplyClick} sx={{ p: "4px", color: "primary.main" }}>
          <ReplyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="More options">
        <IconButton
          size="small"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setHoldTrayOpen(false);
            setContextMenu({ mouseX: rect.left, mouseY: rect.bottom });
          }}
          sx={{ p: "4px", color: "text.secondary" }}
        >
          <MoreIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </motion.div>
  );

  return (
    <>
      <Box
        sx={{
          position: "relative",
          maxWidth: { xs: "84%", sm: "72%", md: "560px" },
          display: "flex",
          alignItems: "center",
          touchAction: "pan-y",
          userSelect: holdTrayOpen ? "none" : "text",
        }}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerGesture}
        onPointerCancel={finishPointerGesture}
        onDoubleClick={() => {
          if (!isDeleted && !editMode) handleReact("❤️");
        }}
      >
        {/* Swipe-to-Reply indicator revealed behind bubble */}
        {swipeOffset > 6 && (
          <Box
            sx={{
              position: "absolute",
              left: -34,
              width: 28,
              height: 28,
              borderRadius: "50%",
              bgcolor: swipeOffset >= 48 ? "#236B4A" : "action.selected",
              color: swipeOffset >= 48 ? "#FFFFFF" : "text.secondary",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: Math.min(1, swipeOffset / 48),
              transform: `scale(${swipeOffset >= 48 ? 1.1 : 0.9})`,
              transition: "background-color 0.15s ease, transform 0.15s ease",
              pointerEvents: "none",
            }}
          >
            <ReplyIcon sx={{ fontSize: 16 }} />
          </Box>
        )}

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          style={{
            position: "relative",
            width: "100%",
            transform: `translateX(${swipeOffset}px)`,
            transition: swipeOffset === 0 ? "transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)" : "none",
          }}
        >
          {/* Animated Emoji Particle Burst */}
          <EmojiBurst bursts={bursts} align={sameSender ? "right" : "left"} />

          {/* Floating Hold / Hover Reaction & Action Tray */}
          <AnimatePresence>
            {showQuickBar &&
              (holdTrayOpen ? (
                <ClickAwayListener
                  onClickAway={() => {
                    if (Date.now() - holdOpenedAtRef.current < 350) return;
                    setHoldTrayOpen(false);
                  }}
                >
                  {quickBarContent}
                </ClickAwayListener>
              ) : (
                quickBarContent
              ))}
          </AnimatePresence>

          <Box
            sx={{
              backgroundColor: sameSender ? (isDark ? "#24382D" : "#E8F3ED") : isDark ? "#202522" : "#FFFFFF",
              color: isDark ? "#F1F3F0" : "#202421",
              borderRadius: sameSender ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              border: sameSender
                ? `1px solid ${isDark ? "#324D3E" : "#D0E4D8"}`
                : `1px solid ${isDark ? "#343B36" : "#E3E6E1"}`,
              px: 1.5,
              py: 1,
              position: "relative",
              boxShadow: holdTrayOpen
                ? "0 0 0 2px #236B4A"
                : isDark
                ? "none"
                : "0 1px 3px rgba(32, 36, 33, 0.05)",
              transition: "box-shadow 0.15s ease",
            }}
          >
            {/* Sender name for group chats */}
            {!sameSender && sender?.name && (
              <Typography
                sx={{ color: isDark ? "#4B9B70" : "#236B4A" }}
                fontWeight="600"
                variant="caption"
                display="block"
                mb={0.25}
              >
                {sender.name}
              </Typography>
            )}

            {/* Tombstone */}
            {isDeleted ? (
              <Typography variant="body2" sx={{ fontStyle: "italic", color: isDark ? "#A6AEA8" : "#737A75" }}>
                🚫 This message was deleted
              </Typography>
            ) : editMode ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 190 }}>
                <TextField
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  size="small"
                  autoFocus
                  fullWidth
                  multiline
                  maxRows={4}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleEditSubmit();
                    }
                    if (e.key === "Escape") setEditMode(false);
                  }}
                  sx={{ "& .MuiInputBase-root": { color: isDark ? "#F1F3F0" : "#202421", fontSize: "0.9rem" } }}
                />
                {isEditing ? (
                  <CircularProgress size={16} />
                ) : (
                  <>
                    <Tooltip title="Save">
                      <IconButton size="small" onClick={handleEditSubmit} sx={{ color: "success.main" }}>
                        <CheckIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Cancel">
                      <IconButton size="small" onClick={() => setEditMode(false)} sx={{ color: "error.main" }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Box>
            ) : (
              <>
                {replyTo && (
                  <Box
                    sx={{
                      bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(35, 107, 74, 0.07)",
                      p: 0.75,
                      mb: 0.75,
                      borderRadius: 1,
                      borderLeft: `3px solid ${isDark ? "#4B9B70" : "#236B4A"}`,
                    }}
                  >
                    <Typography variant="caption" fontWeight="bold" sx={{ color: isDark ? "#4B9B70" : "#236B4A" }}>
                      {replyTo.sender?.name || "Unknown"}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        opacity: 0.9,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {replyTo.content || "Attachment"}
                    </Typography>
                  </Box>
                )}

                {content && (
                  <Typography
                    sx={{
                      fontSize: `${fontSize}px`,
                      wordBreak: "break-word",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.45,
                      color: isDark ? "#F1F3F0" : "#202421",
                    }}
                  >
                    {content}
                  </Typography>
                )}

                {content && <LinkPreview content={content} />}

                {attachments?.length > 0 &&
                  attachments.map((attachment, idx) => {
                    const url = typeof attachment === "string" ? attachment : attachment.url || attachment.path || "";
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
                <Typography variant="caption" sx={{ color: isDark ? "#A6AEA8" : "#737A75", fontSize: "0.62rem" }}>
                  (edited)
                </Typography>
              )}
              <Typography variant="caption" sx={{ color: isDark ? "#A6AEA8" : "#737A75", fontSize: "0.66rem" }}>
                {timeAgo}
              </Typography>
              {sameSender && !isDeleted && (
                <DoneAllIcon
                  sx={{
                    fontSize: "0.95rem",
                    color: readBy.length > 0 ? "#27834A" : isDark ? "#A6AEA8" : "#737A75",
                    ml: 0.2,
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
                        gap: 0.4,
                        backgroundColor: hasReacted
                          ? isDark
                            ? "rgba(75, 155, 112, 0.25)"
                            : "rgba(35, 107, 74, 0.16)"
                          : isDark
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(35, 107, 74, 0.08)",
                        border: hasReacted
                          ? `1.5px solid ${isDark ? "#4B9B70" : "#236B4A"}`
                          : `1px solid ${isDark ? "#343B36" : "#D0E4D8"}`,
                        borderRadius: "999px",
                        padding: "1px 7px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        "&:hover": {
                          backgroundColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(35, 107, 74, 0.2)",
                          transform: "scale(1.06)",
                        },
                      }}
                    >
                      <Typography variant="caption" sx={{ fontSize: "0.85rem" }}>
                        {emoji}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: "0.72rem",
                          fontWeight: hasReacted ? "700" : "500",
                          color: hasReacted ? (isDark ? "#4B9B70" : "#236B4A") : "inherit",
                        }}
                      >
                        {count}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </motion.div>
      </Box>

      {/* Right-click / More context menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        <MenuItem onClick={handleReplyClick} dense>
          <ListItemIcon>
            <ReplyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Reply</ListItemText>
        </MenuItem>

        {content && (
          <MenuItem onClick={handleCopy} dense>
            <ListItemIcon>
              <CopyIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Copy Text</ListItemText>
          </MenuItem>
        )}

        <MenuItem onClick={handleStar} dense>
          <ListItemIcon>
            <StarIcon fontSize="small" sx={{ color: "#f59e0b" }} />
          </ListItemIcon>
          <ListItemText>Star Message</ListItemText>
        </MenuItem>

        <MenuItem onClick={handleForwardClick} dense>
          <ListItemIcon>
            <ForwardIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Forward</ListItemText>
        </MenuItem>

        {isGroupAdmin && chatId && (
          <MenuItem onClick={handlePin} dense>
            <ListItemIcon>
              <PinIcon fontSize="small" color="primary" />
            </ListItemIcon>
            <ListItemText>Pin Message</ListItemText>
          </MenuItem>
        )}

        {sameSender && content && !attachments.length && (
          <MenuItem onClick={handleEditStart} dense>
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>
        )}

        {(sameSender || isGroupAdmin) && (
          <MenuItem onClick={handleDelete} dense disabled={isDeleting}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText sx={{ color: "error.main" }}>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>

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
