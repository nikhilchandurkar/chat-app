import {
  Avatar,
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
  Paper,
  Divider,
  Stack,
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
  Favorite as HeartIcon,
  MoreHoriz as MoreIcon,
  Person as PersonIcon,
} from "@mui/icons-material";
import React, { memo, useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { fileFormat, formatTimeAgo, transformImage } from "../../lib/feature";
import RenderAttachment from "./RenderAttachment";
import LinkPreview from "./LinkPreview";
import EmojiBurst from "./EmojiBurst";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
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

const COMMON_REACTIONS = ["👍", "❤️", "😂", "😮", "🔥", "🎉", "👏"];
const SWIPE_THRESHOLD = 46;
const HOLD_DELAY_MS = 340;
const DOUBLE_TAP_WINDOW_MS = 340;

const MessageComponent = ({ message, onEdit, onDelete, onReply, onReact, onViewProfile, chatId, isGroupAdmin }) => {
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

  const [isDesktopHover, setIsDesktopHover] = useState(false);
  const [holdSpotlightOpen, setHoldSpotlightOpen] = useState(false);
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [bursts, setBursts] = useState([]);

  // 60fps Framer Motion values (zero React re-renders during drag/hold)
  const dragX = useMotionValue(0);
  const bubbleScale = useMotionValue(1);
  const replyIconScale = useTransform(dragX, [8, SWIPE_THRESHOLD, 80], [0.25, 1.15, 1.25]);
  const replyIconOpacity = useTransform(dragX, [8, SWIPE_THRESHOLD], [0, 1]);
  const heartIconScale = useTransform(dragX, [-80, -SWIPE_THRESHOLD, -8], [1.25, 1.15, 0.25]);
  const heartIconOpacity = useTransform(dragX, [-SWIPE_THRESHOLD, -8], [1, 0]);

  const wrapperRef = useRef(null);
  const burstCounterRef = useRef(0);
  const longPressTimerRef = useRef(null);
  const touchStateRef = useRef(null);
  const hapticFiredRef = useRef(false);
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const lastBurstTapAtRef = useRef(0);

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
    setBursts((prev) => [...prev.slice(-3), { id, emoji }]);
    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, 1050);
  }, []);

  const handleCloseMenu = () => setContextMenu(null);

  const handleEditStart = () => {
    setEditValue(content || "");
    setEditMode(true);
    setHoldSpotlightOpen(false);
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
    setHoldSpotlightOpen(false);
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
    setHoldSpotlightOpen(false);
    try {
      const res = await toggleStar(_id);
      if (res.data?.success) toast.success(res.data.message);
    } catch {
      toast.error("Failed to star message");
    }
  };

  const handlePin = async () => {
    handleCloseMenu();
    setHoldSpotlightOpen(false);
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
    setHoldSpotlightOpen(false);
    if (!content) return;
    navigator.clipboard?.writeText(content);
    toast.success("Copied to clipboard");
  };

  const handleReact = useCallback(
    async (emoji) => {
      setHoldSpotlightOpen(false);
      triggerHaptic([12, 24, 12]);
      spawnBurst(emoji);
      try {
        const res = await reactMessageMutation({ messageId: _id, emoji });
        if (res.data?.success && res.data?.reactions) {
          onReact?.(_id, res.data.reactions);
        }
      } catch {
        toast.error("Failed to react");
      }
    },
    [_id, onReact, reactMessageMutation, spawnBurst]
  );

  const handleForwardClick = () => {
    handleCloseMenu();
    setHoldSpotlightOpen(false);
    setShowForwardDialog(true);
  };

  const handleReplyClick = useCallback(() => {
    handleCloseMenu();
    setHoldSpotlightOpen(false);
    triggerHaptic(14);
    onReply?.(message);
  }, [message, onReply]);

  // Attach native non-passive touch listeners so Chrome Android WebView never cancels mid-swipe
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || isDeleted || editMode) return undefined;

    const clearHold = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      animate(bubbleScale, 1, { duration: 0.14 });
    };

    const onTouchStart = (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      hapticFiredRef.current = false;
      touchStateRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        axis: null,
        moved: false,
        holdTriggered: false,
      };
      animate(bubbleScale, 0.97, { duration: 0.25 });

      clearHold();
      animate(bubbleScale, 0.96, { duration: 0.25 });
      longPressTimerRef.current = setTimeout(() => {
        if (touchStateRef.current && touchStateRef.current.axis !== "scroll" && !touchStateRef.current.moved) {
          touchStateRef.current.holdTriggered = true;
          animate(bubbleScale, 1.03, { type: "spring", stiffness: 450, damping: 20 });
          triggerHaptic(22);
          setHoldSpotlightOpen(true);
        }
      }, HOLD_DELAY_MS);
    };

    const onTouchMove = (e) => {
      const st = touchStateRef.current;
      const t = e.touches?.[0];
      if (!st || !t) return;

      const dx = t.clientX - st.startX;
      const dy = t.clientY - st.startY;

      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        st.moved = true;
        clearHold();
      }

      if (!st.axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        st.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "swipe" : "scroll";
      }

      if (st.axis === "swipe") {
        if (e.cancelable) e.preventDefault();
        const dampened = Math.max(-84, Math.min(84, dx * 0.68));
        dragX.set(dampened);

        if (Math.abs(dampened) >= SWIPE_THRESHOLD && !hapticFiredRef.current) {
          hapticFiredRef.current = true;
          triggerHaptic(14);
        }
      }
    };

    const onTouchEnd = (e) => {
      clearHold();
      const st = touchStateRef.current;
      touchStateRef.current = null;
      const currentDrag = dragX.get();
      animate(dragX, 0, { type: "spring", stiffness: 520, damping: 28 });

      if (!st) return;

      if (st.axis === "swipe") {
        if (currentDrag >= SWIPE_THRESHOLD) {
          onReply?.(message);
        } else if (currentDrag <= -SWIPE_THRESHOLD) {
          handleReact("❤️");
        }
        return;
      }

      if (!st.moved && !st.holdTriggered) {
        const t = e.changedTouches?.[0];
        const cx = t?.clientX || st.startX;
        const cy = t?.clientY || st.startY;
        const now = Date.now();
        const prev = lastTapRef.current;
        if (
          now - prev.time < DOUBLE_TAP_WINDOW_MS &&
          Math.hypot(cx - prev.x, cy - prev.y) < 48
        ) {
          lastTapRef.current = { time: 0, x: 0, y: 0 };
          lastBurstTapAtRef.current = now;
          handleReact("❤️");
        } else {
          lastTapRef.current = { time: now, x: cx, y: cy };
        }
      }
    };

    const onTouchCancel = () => {
      clearHold();
      touchStateRef.current = null;
      animate(dragX, 0, { type: "spring", stiffness: 520, damping: 28 });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [bubbleScale, dragX, editMode, handleReact, isDeleted, message, onReply]);

  const handleContextMenu = (e) => {
    if (isDeleted) return;
    e.preventDefault();
    setHoldSpotlightOpen(true);
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

  // Hold-to-React Spotlight Portal (Telegram / WhatsApp style — never clips on edges)
  const holdSpotlightPortal =
    holdSpotlightOpen &&
    typeof document !== "undefined" &&
    createPortal(
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={() => setHoldSpotlightOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            backgroundColor: "rgba(12, 16, 14, 0.56)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12 }}
            transition={{ type: "spring", stiffness: 460, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {/* Spring Reaction Pill */}
            <Paper
              elevation={8}
              sx={{
                display: "flex",
                justifyContent: "space-around",
                alignItems: "center",
                px: 1.5,
                py: 1,
                borderRadius: "999px",
                bgcolor: isDark ? "#232A25" : "#FFFFFF",
                border: `1px solid ${isDark ? "#38443C" : "#E1E7E2"}`,
              }}
            >
              {COMMON_REACTIONS.map((emoji, idx) => (
                <motion.button
                  key={emoji}
                  type="button"
                  initial={{ opacity: 0, scale: 0.4, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: idx * 0.025, type: "spring", stiffness: 520, damping: 22 }}
                  whileTap={{ scale: 1.35 }}
                  onClick={() => handleReact(emoji)}
                  style={{
                    border: "none",
                    background: myReactedEmojis.has(emoji) ? "rgba(35, 107, 74, 0.18)" : "transparent",
                    borderRadius: "50%",
                    width: 40,
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.45rem",
                    cursor: "pointer",
                  }}
                >
                  {emoji}
                </motion.button>
              ))}
            </Paper>

            {/* Held Message Preview */}
            <Paper
              elevation={4}
              sx={{
                p: 1.5,
                borderRadius: 2.5,
                bgcolor: sameSender ? (isDark ? "#24382D" : "#E8F3ED") : isDark ? "#202522" : "#FFFFFF",
                color: isDark ? "#F1F3F0" : "#202421",
                maxHeight: 110,
                overflow: "hidden",
              }}
            >
              {sender?.name && (
                <Typography variant="caption" fontWeight={700} color="primary" display="block" mb={0.25}>
                  {sameSender ? "You" : sender.name}
                </Typography>
              )}
              <Typography variant="body2" sx={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {content || "📎 Attachment"}
              </Typography>
            </Paper>

            {/* Quick Actions Menu Card */}
            <Paper
              elevation={8}
              sx={{
                borderRadius: 2.5,
                overflow: "hidden",
                bgcolor: isDark ? "#232A25" : "#FFFFFF",
              }}
            >
              <MenuItem onClick={handleReplyClick} sx={{ py: 1.25 }}>
                <ListItemIcon><ReplyIcon fontSize="small" color="primary" /></ListItemIcon>
                <ListItemText>Reply</ListItemText>
              </MenuItem>
              {content && (
                <MenuItem onClick={handleCopy} sx={{ py: 1.25 }}>
                  <ListItemIcon><CopyIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Copy Text</ListItemText>
                </MenuItem>
              )}
              <MenuItem onClick={handleStar} sx={{ py: 1.25 }}>
                <ListItemIcon><StarIcon fontSize="small" sx={{ color: "#f59e0b" }} /></ListItemIcon>
                <ListItemText>Star Message</ListItemText>
              </MenuItem>
              <MenuItem onClick={handleForwardClick} sx={{ py: 1.25 }}>
                <ListItemIcon><ForwardIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Forward</ListItemText>
              </MenuItem>
              {!sameSender && senderId && onViewProfile && (
                <MenuItem
                  onClick={() => {
                    setHoldSpotlightOpen(false);
                    onViewProfile(sender);
                  }}
                  sx={{ py: 1.25 }}
                >
                  <ListItemIcon><PersonIcon fontSize="small" color="primary" /></ListItemIcon>
                  <ListItemText>View Profile</ListItemText>
                </MenuItem>
              )}
              {isGroupAdmin && chatId && (
                <MenuItem onClick={handlePin} sx={{ py: 1.25 }}>
                  <ListItemIcon><PinIcon fontSize="small" color="primary" /></ListItemIcon>
                  <ListItemText>Pin Message</ListItemText>
                </MenuItem>
              )}
              {sameSender && content && !attachments.length && (
                <MenuItem onClick={handleEditStart} sx={{ py: 1.25 }}>
                  <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Edit</ListItemText>
                </MenuItem>
              )}
              {(sameSender || isGroupAdmin) && (
                <>
                  <Divider />
                  <MenuItem onClick={handleDelete} disabled={isDeleting} sx={{ py: 1.25 }}>
                    <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
                    <ListItemText sx={{ color: "error.main" }}>Delete</ListItemText>
                  </MenuItem>
                </>
              )}
            </Paper>
          </motion.div>
        </motion.div>
      </AnimatePresence>,
      document.body
    );

  return (
    <>
      <EmojiBurst bursts={bursts} />
      {holdSpotlightPortal}

      <Box
        ref={wrapperRef}
        sx={{
          position: "relative",
          maxWidth: { xs: "84%", sm: "72%", md: "560px" },
          display: "flex",
          alignItems: "center",
          touchAction: "pan-y",
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
        onContextMenu={handleContextMenu}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setIsDesktopHover(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setIsDesktopHover(false);
        }}
        onDoubleClick={() => {
          if (Date.now() - lastBurstTapAtRef.current < 450) return;
          if (!isDeleted && !editMode) handleReact("❤️");
        }}
      >
        {/* Left Swipe Indicator -> Reply */}
        <motion.div
          style={{
            position: "absolute",
            left: 4,
            scale: replyIconScale,
            opacity: replyIconOpacity,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              bgcolor: "#236B4A",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: 2,
            }}
          >
            <ReplyIcon sx={{ fontSize: 18 }} />
          </Box>
        </motion.div>

        {/* Right Swipe Indicator -> Quick Heart React */}
        <motion.div
          style={{
            position: "absolute",
            right: 4,
            scale: heartIconScale,
            opacity: heartIconOpacity,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              bgcolor: "#E11D48",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: 2,
            }}
          >
            <HeartIcon sx={{ fontSize: 17 }} />
          </Box>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          style={{
            position: "relative",
            width: "100%",
            x: dragX,
            scale: bubbleScale,
            zIndex: 1,
            willChange: "transform",
          }}
        >
          {/* Desktop Mouse Hover Bar (never gets stuck on touch) */}
          <AnimatePresence>
            {isDesktopHover && !isDeleted && !editMode && !holdSpotlightOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.88, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.88, y: 4 }}
                transition={{ duration: 0.12 }}
                style={{
                  position: "absolute",
                  top: -42,
                  ...(sameSender ? { right: 0 } : { left: 0 }),
                  zIndex: 30,
                  display: "flex",
                  alignItems: "center",
                  gap: "2px",
                  padding: "3px 6px",
                  borderRadius: "999px",
                  backgroundColor: isDark ? "#262D28" : "#FFFFFF",
                  border: `1px solid ${isDark ? "#3A443D" : "#DCE3DD"}`,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.14)",
                }}
              >
                {COMMON_REACTIONS.slice(0, 6).map((emoji) => (
                  <IconButton key={emoji} size="small" onClick={() => handleReact(emoji)} sx={{ p: "3px" }}>
                    <span style={{ fontSize: "0.98rem" }}>{emoji}</span>
                  </IconButton>
                ))}
                <Tooltip title="Reply">
                  <IconButton size="small" onClick={handleReplyClick} sx={{ p: "4px", color: "primary.main" }}>
                    <ReplyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Actions">
                  <IconButton size="small" onClick={() => setHoldSpotlightOpen(true)} sx={{ p: "4px", color: "text.secondary" }}>
                    <MoreIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </motion.div>
            )}
          </AnimatePresence>

          <Box
            sx={{
              backgroundColor: sameSender ? (isDark ? "#24382D" : "#E8F3ED") : isDark ? "#202522" : "#FFFFFF",
              color: isDark ? "#F1F3F0" : "#202421",
              borderRadius: sameSender ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              border: sameSender
                ? `1px solid ${isDark ? "#324D3E" : "#D0E4D8"}`
                : `1px solid ${isDark ? "#343B36" : "#E3E6E1"}`,
              px: 1.5,
              py: 1,
              position: "relative",
              boxShadow: isDark ? "none" : "0 1px 3px rgba(32, 36, 33, 0.05)",
            }}
          >
            {!sameSender && (sender?.name || sender?.username) && (
              <Stack
                direction="row"
                alignItems="center"
                spacing={0.7}
                mb={0.45}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (senderId && onViewProfile) {
                    triggerHaptic(8);
                    onViewProfile(sender);
                  }
                }}
                sx={{
                  cursor: senderId && onViewProfile ? "pointer" : "default",
                  width: "fit-content",
                  maxWidth: "100%",
                  borderRadius: "999px",
                  pr: 0.75,
                  py: 0.15,
                  "&:hover .sender-name-label": senderId && onViewProfile ? { textDecoration: "underline" } : undefined,
                }}
              >
                <Avatar
                  src={transformImage(typeof sender?.avatar === "string" ? sender.avatar : sender?.avatar?.url)}
                  alt={sender.name || sender.username}
                  imgProps={{ draggable: false }}
                  sx={{
                    width: 20,
                    height: 20,
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    bgcolor: "#236B4A",
                    color: "#FFFFFF",
                  }}
                >
                  {(sender.name || sender.username || "U")[0].toUpperCase()}
                </Avatar>
                <Typography
                  className="sender-name-label"
                  sx={{ color: isDark ? "#4B9B70" : "#236B4A" }}
                  fontWeight={700}
                  variant="caption"
                  noWrap
                >
                  {sender.name || sender.username}
                </Typography>
              </Stack>
            )}

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
                    <Typography
                      variant="caption"
                      fontWeight="bold"
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        if ((replyTo.sender?._id || replyTo.sender?.id) && onViewProfile) {
                          e.stopPropagation();
                          onViewProfile(replyTo.sender);
                        }
                      }}
                      sx={{
                        color: isDark ? "#4B9B70" : "#236B4A",
                        cursor: (replyTo.sender?._id || replyTo.sender?.id) && onViewProfile ? "pointer" : "default",
                      }}
                    >
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

      <Menu
        open={contextMenu !== null}
        onClose={handleCloseMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        <MenuItem onClick={handleReplyClick} dense>
          <ListItemIcon><ReplyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Reply</ListItemText>
        </MenuItem>
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
