import {
  ArrowBack as BackIcon,
  AttachFile as AttachFileIcon,
  AutoAwesome as SparkleIcon,
  Bookmark as VaultIcon,
  Close as CloseIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  EmojiEmotions as EmojiIcon,
  Forward as ForwardIcon,
  GifBox as GifIcon,
  Headphones as HeadphonesIcon,
  Info as InfoIcon,
  KeyboardArrowDown as ScrollDownIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  RadioButtonChecked as WalkieIcon,
  Search as SearchIcon,
  Send as SendIcon,
  Star as StarIcon,
  Summarize as RecapIcon,
} from "@mui/icons-material";
import {
  Avatar,
  Box,
  Button,
  Chip,
  ClickAwayListener,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fab,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import axios from "axios";
import React, { useCallback, useMemo, useRef, useState, useEffect, lazy, Suspense } from "react";
import toast from "react-hot-toast";
import { server } from "../constants/config";
import FileMenu from "../components/dialogs/FileMenu";
import TypingIndicator from "../components/specific/TypingIndicator";
import VoiceRecorder from "../components/specific/VoiceRecorder";
import ChatSearch from "../components/specific/ChatSearch";
import PinnedMessages from "../components/specific/PinnedMessages";
import WatchPartyBar from "../components/specific/WatchPartyBar";
import ThreadDrawer from "../components/specific/ThreadDrawer";
import MessageComponent from "../components/shared/MessageComponent";
import UnreadDivider from "../components/shared/UnreadDivider";
import { transformImage } from "../lib/feature";
import EmojiBurst from "../components/shared/EmojiBurst";
import { parseRemindCommand } from "../utils/interactive";

import { useDispatch, useSelector } from "react-redux";
import {
  NEW_MESSAGE,
  START_TYPING,
  STOP_TYPING,
  MESSAGE_EDITED,
  MESSAGE_DELETED,
  MESSAGE_READ,
  MESSAGE_READ_UPDATE,
} from "../constants/events";
import { useSocketEvents } from "../hooks/hook";
import {
  useBulkDeleteMessagesMutation,
  useBulkStarMessagesMutation,
  useChatDetailsQuery,
  useGetMessagesQuery,
  useGetUserE2eeKeyQuery,
  usePublishE2eeKeyMutation,
  useSendAttachmentsMutation,
} from "../redux/api/api";
import { buildUnreadRecap, getSmartReplySuggestions } from "../utils/chatEnhancements";
import { setIsFileMenu, setIsMobile, setUploadingLoader, toggleTheme } from "../redux/reducers/misc";
import ChatDetailsDrawer from "../components/specific/ChatDetailsDrawer";
import { getSocket } from "../socket.jsx";
import {
  encryptE2eeMessage,
  ensureLocalIdentityKeyPair,
  isChatE2eeEnabled,
  setChatE2eeEnabled,
} from "../utils/e2ee";
import {
  extractCelebrationTrigger,
  getShakeAction,
  isEnterToSendEnabled,
  isShakeEnabled,
  playCelebrationSound,
  playWalkieChirp,
  PREFS_EVENT,
  setEnterToSendPreference,
  triggerHaptic,
} from "../utils/feedback";

// Lazy-load emoji picker & heavy composer dialogs
const EmojiPicker = lazy(() => import("emoji-picker-react"));
const UserProfileDialog = lazy(() => import("../components/dialogs/UserProfileDialog"));
const GifStudioDialog = lazy(() => import("../components/dialogs/GifStudioDialog"));
const CreatePollDialog = lazy(() => import("../components/dialogs/CreatePollDialog"));
const MiniGameDialog = lazy(() => import("../components/dialogs/MiniGameDialog"));
const WhiteboardDialog = lazy(() => import("../components/dialogs/WhiteboardDialog"));
const ScheduleMessageDialog = lazy(() => import("../components/dialogs/ScheduleMessageDialog"));
const CreateWidgetDialog = lazy(() => import("../components/dialogs/CreateWidgetDialog"));
const ForwardMessageDialog = lazy(() => import("../components/dialogs/ForwardMessageDialog"));

const QUICK_EMOJIS = ["❤️", "🔥", "😂", "👍", "🙏", "🎉", "😍", "🥳", "🚀", "👏"];
const LAST_SEEN_KEY = "chat_last_seen";
// Walkie-Talkie Push-to-Talk stays implemented & wired, hidden from UI until toggled to true.
const ENABLE_WALKIE_TALKIE = false;

const getLastSeen = (chatId) => {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_SEEN_KEY) || "{}");
    return stored[chatId] ? new Date(stored[chatId]) : null;
  } catch {
    return null;
  }
};

const setLastSeen = (chatId) => {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_SEEN_KEY) || "{}");
    stored[chatId] = new Date().toISOString();
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(stored));
  } catch {
    // ignore
  }
};

const ChatComposer = React.memo(
  ({
    chatId,
    members,
    socket,
    isDark,
    dispatch,
    replyingTo,
    onClearReply,
    setFileMenuAnchor,
    voiceActive,
    onCancelVoice,
    enterToSend,
    onCelebrateSend,
    onOpenGifStudio,
    isGroupChat,
    activeTopic = "all",
    e2eeEnabled,
    peerPublicKey,
    slowModeSeconds = 0,
    slowCooldownLeft = 0,
    onStartSlowCooldown,
    isAdmin = false,
    smartReplies = [],
    onWalkieStart,
    onWalkieStop,
    walkieRecording = false,
  }) => {
    const [message, setMessage] = useState("");
    const [showEmoji, setShowEmoji] = useState(false);
    const [mentionQuery, setMentionQuery] = useState(null);
    const typingTimeout = useRef(null);
    const lastTypingEmit = useRef(0);
    const inputRef = useRef(null);

    const resizeTextarea = useCallback(() => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(116, Math.max(40, el.scrollHeight))}px`;
    }, []);

    useEffect(() => {
      let restored = "";
      try {
        restored = localStorage.getItem(`chitchat_draft_${chatId}`) || "";
      } catch {
        restored = "";
      }
      setMessage(restored);
      setShowEmoji(false);
      lastTypingEmit.current = 0;
      if (inputRef.current) {
        inputRef.current.style.height = "40px";
      }
    }, [chatId]);

    useEffect(() => {
      if (!chatId) return;
      try {
        const key = `chitchat_draft_${chatId}`;
        if (message.trim()) localStorage.setItem(key, message);
        else localStorage.removeItem(key);
        window.dispatchEvent(new Event("chitchat:drafts-updated"));
      } catch {
        // ignore storage quota errors
      }
    }, [chatId, message]);

    useEffect(() => {
      if (replyingTo) {
        inputRef.current?.focus();
      }
    }, [replyingTo]);

    useEffect(() => {
      resizeTextarea();
    }, [message, resizeTextarea]);

    const doSend = useCallback(async (overrideText = null) => {
      const candidate = typeof overrideText === "string" ? overrideText : message;
      if (!candidate.trim()) return;
      if (slowCooldownLeft > 0 && !isAdmin) {
        toast.error(`Slow mode active — wait ${slowCooldownLeft}s`);
        return;
      }
      const clean = candidate.trim();

      // Quick slash shortcuts: /todo Title | item1, item2   and   /spin Title | opt1, opt2
      const todoMatch = /^\/todo\s+(.+)$/i.exec(clean);
      const spinMatch = /^\/spin\s+(.+)$/i.exec(clean);
      if (todoMatch || spinMatch) {
        const rawBody = (todoMatch || spinMatch)[1];
        const parts = rawBody.split("|");
        const title = (parts.length > 1 ? parts[0] : todoMatch ? "Shared Checklist" : "Spin the Wheel").trim();
        const items = (parts.length > 1 ? parts.slice(1).join("|") : parts[0])
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        try {
          const base = server || (typeof window !== "undefined" ? window.location.origin : "");
          await axios.post(
            `${base}/api/v1/message/interactive/widget/create`,
            {
              chatId,
              widgetType: todoMatch ? "checklist" : "roulette",
              title,
              ...(todoMatch ? { items } : { options: items }),
              topicName: activeTopic && activeTopic !== "all" ? activeTopic : "",
            },
            { withCredentials: true }
          );
          setMessage("");
          setShowEmoji(false);
          onClearReply();
          return;
        } catch (err) {
          toast.error(err?.response?.data?.message || "Failed to create interactive card");
          return;
        }
      }

      const remindCmd = parseRemindCommand(clean);
      if (remindCmd) {
        try {
          const base = server || (typeof window !== "undefined" ? window.location.origin : "");
          await axios.post(
            `${base}/api/v1/message/schedule`,
            {
              chatId,
              content: remindCmd.content,
              scheduledFor: remindCmd.scheduledFor.toISOString(),
              topicName: activeTopic && activeTopic !== "all" ? activeTopic : "",
            },
            { withCredentials: true }
          );
          toast.success(`⏰ Reminder set for ${remindCmd.scheduledFor.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
          setMessage("");
          setShowEmoji(false);
          onClearReply();
          return;
        } catch {
          toast.error("Failed to schedule reminder");
          return;
        }
      }

      const celeb = extractCelebrationTrigger(clean);
      if (celeb) {
        onCelebrateSend?.(celeb.emoji, celeb.mode);
      }
      triggerHaptic(10);

      let payloadText = clean;
      if (e2eeEnabled && peerPublicKey) {
        try {
          const pair = await ensureLocalIdentityKeyPair();
          payloadText = await encryptE2eeMessage(clean, pair, peerPublicKey);
        } catch {
          toast.error("E2EE encryption failed; check your Encryption Keys");
          return;
        }
      }

      socket.emit(NEW_MESSAGE, {
        chatId,
        members,
        message: payloadText,
        replyTo: replyingTo,
        topicName: activeTopic && activeTopic !== "all" ? activeTopic : "",
      });
      if (slowModeSeconds > 0 && !isAdmin) {
        onStartSlowCooldown?.(slowModeSeconds);
      }
      setMessage("");
      setShowEmoji(false);
      setMentionQuery(null);
      onClearReply();
      lastTypingEmit.current = 0;
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      socket.emit(STOP_TYPING, { members, chatId });
    }, [activeTopic, chatId, e2eeEnabled, isAdmin, members, message, onCelebrateSend, onClearReply, onStartSlowCooldown, peerPublicKey, replyingTo, slowCooldownLeft, slowModeSeconds, socket]);

    const submitHandler = (e) => {
      e.preventDefault();
      doSend();
    };

    const insertEmoji = useCallback((emojiChar) => {
      triggerHaptic(8);
      setMessage((prev) => prev + emojiChar);
      inputRef.current?.focus();
    }, []);

    const onEmojiClick = useCallback(
      (emojiData) => {
        insertEmoji(emojiData.emoji);
      },
      [insertEmoji]
    );

    const messageOnChange = (e) => {
      const val = e.target.value;
      setMessage(val);
      if (isGroupChat) {
        const match = /(?:^|\s)@([a-zA-Z0-9_.-]{0,24})$/.exec(val);
        setMentionQuery(match ? match[1] : null);
      } else {
        setMentionQuery(null);
      }
      const now = Date.now();
      if (now - lastTypingEmit.current > 2000) {
        socket.emit(START_TYPING, { members, chatId });
        lastTypingEmit.current = now;
      }
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        socket.emit(STOP_TYPING, { members, chatId });
        lastTypingEmit.current = 0;
      }, 2000);
    };

    const mentionSuggestions = useMemo(() => {
      if (!isGroupChat || mentionQuery === null) return [];
      const q = mentionQuery.toLowerCase();
      const hits = (members || [])
        .filter((m) => m && typeof m === "object")
        .filter(
          (m) =>
            !q ||
            String(m.username || "").toLowerCase().includes(q) ||
            String(m.name || "").toLowerCase().includes(q)
        )
        .slice(0, 5);
      if (!q || "all".startsWith(q) || "everyone".startsWith(q)) {
        return [
          { _id: "__all__", name: "Everyone in group", username: "all", isAll: true },
          ...hits,
        ];
      }
      return hits;
    }, [isGroupChat, members, mentionQuery]);

    const handlePickMention = (member) => {
      const handle = member.isAll ? "all" : member.username || member.name?.replace(/\s+/g, "_") || "user";
      setMessage((prev) => prev.replace(/@([a-zA-Z0-9_.-]{0,24})$/, `@${handle} `));
      setMentionQuery(null);
      inputRef.current?.focus();
    };

    const handleKeyDown = (e) => {
      if (e.key === "Enter") {
        if (enterToSend && !e.shiftKey) {
          e.preventDefault();
          doSend();
        } else if (!enterToSend && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          doSend();
        }
      }
    };

    const handleFileOpen = (e) => {
      setShowEmoji(false);
      dispatch(setIsFileMenu(true));
      setFileMenuAnchor(e.currentTarget);
    };

    const hasText = Boolean(message.trim());

    return (
      <>
        {showEmoji && (
          <ClickAwayListener onClickAway={() => setShowEmoji(false)}>
            <Paper
              elevation={6}
              sx={{
                position: "absolute",
                bottom: { xs: "66px", sm: "74px" },
                left: { xs: "8px", sm: "16px" },
                width: "min(336px, calc(100vw - 16px))",
                borderRadius: 2.5,
                overflow: "hidden",
                zIndex: 200,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: isDark ? "#202522" : "#FFFFFF",
              }}
            >
              {/* Quick-shift emoji strip for instant 1-tap picking */}
              <Stack
                direction="row"
                spacing={0.25}
                sx={{
                  px: 1,
                  py: 0.6,
                  overflowX: "auto",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                {QUICK_EMOJIS.map((em) => (
                  <IconButton key={em} size="small" onClick={() => insertEmoji(em)} sx={{ p: 0.5, fontSize: "1.15rem" }}>
                    <span>{em}</span>
                  </IconButton>
                ))}
              </Stack>
              <Suspense
                fallback={
                  <Box py={6} textAlign="center">
                    <Typography variant="caption" color="text.secondary">
                      Loading emojis...
                    </Typography>
                  </Box>
                }
              >
                <EmojiPicker
                  onEmojiClick={onEmojiClick}
                  height={310}
                  width="100%"
                  theme={isDark ? "dark" : "light"}
                  previewConfig={{ showPreview: false }}
                />
              </Suspense>
            </Paper>
          </ClickAwayListener>
        )}

        <Box
          sx={{
            flexShrink: 0,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            borderTop: "1px solid",
            borderColor: isDark ? "#343B36" : "#E3E6E1",
            bgcolor: isDark ? "#1E2320" : "#FFFFFF",
            zIndex: 5,
          }}
        >
          {mentionSuggestions.length > 0 && (
            <Paper
              elevation={4}
              sx={{
                mx: { xs: 1, sm: 2 },
                mb: 0.5,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                overflow: "hidden",
              }}
            >
              {mentionSuggestions.map((m) => (
                <Box
                  key={m._id || m.id}
                  onClick={() => handlePickMention(m)}
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    cursor: "pointer",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Avatar
                    src={m.isAll ? undefined : transformImage(m.avatar)}
                    sx={{
                      width: 24,
                      height: 24,
                      fontSize: "0.75rem",
                      bgcolor: m.isAll ? "warning.main" : undefined,
                    }}
                  >
                    {m.isAll ? "@" : (m.name || m.username || "U")[0]}
                  </Avatar>
                  <Typography variant="body2" fontWeight={600}>{m.name || m.username}</Typography>
                  {m.username && (
                    <Typography variant="caption" color={m.isAll ? "warning.main" : "text.secondary"}>
                      @{m.username}
                    </Typography>
                  )}
                </Box>
              ))}
            </Paper>
          )}

          {slowModeSeconds > 0 && !isAdmin && (
            <Box
              sx={{
                px: 1.5,
                py: 0.35,
                bgcolor: slowCooldownLeft > 0 ? "rgba(245, 158, 11, 0.14)" : "action.hover",
                borderBottom: "1px solid",
                borderColor: "divider",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography variant="caption" color={slowCooldownLeft > 0 ? "warning.main" : "text.secondary"} fontWeight={600}>
                {slowCooldownLeft > 0
                  ? `⏱ Slow mode: wait ${slowCooldownLeft}s before next message`
                  : `⏱ Slow mode active (${slowModeSeconds}s cooldown between messages)`}
              </Typography>
            </Box>
          )}

          {!hasText && !replyingTo && smartReplies.length > 0 && (
            <Stack
              direction="row"
              spacing={0.6}
              sx={{
                px: { xs: 1, sm: 1.75 },
                pt: 0.6,
                pb: 0.2,
                overflowX: "auto",
              }}
            >
              {smartReplies.map((sr) => (
                <Chip
                  key={sr}
                  size="small"
                  clickable
                  label={sr}
                  variant="outlined"
                  onClick={() => doSend(sr)}
                  sx={{ fontSize: "0.75rem", height: 24, borderRadius: 3 }}
                />
              ))}
            </Stack>
          )}

          {replyingTo && (
            <Box
              sx={{
                px: 1.5,
                py: 0.75,
                bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(35, 107, 74, 0.05)",
                borderBottom: "1px solid",
                borderColor: "divider",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Box sx={{ overflow: "hidden", minWidth: 0 }}>
                <Typography variant="caption" color="primary" fontWeight="bold">
                  Replying to {replyingTo.sender?.name || "User"}
                </Typography>
                <Typography variant="body2" noWrap>
                  {replyingTo.content || "Attachment"}
                </Typography>
              </Box>
              <IconButton size="small" onClick={onClearReply} aria-label="Cancel reply">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          )}

          {voiceActive ? (
            <Box sx={{ px: { xs: 1, sm: 2 }, py: 1 }}>
              <VoiceRecorder
                chatId={chatId}
                topicName={activeTopic && activeTopic !== "all" ? activeTopic : ""}
                autoStart
                onCancel={onCancelVoice}
              />
            </Box>
          ) : (
            <form onSubmit={submitHandler} style={{ display: "flex", alignItems: "flex-end", width: "100%" }}>
              <Stack
                direction="row"
                width="100%"
                px={{ xs: 0.75, sm: 1.5 }}
                py={1}
                alignItems="flex-end"
                position="relative"
                flex={1}
                gap={{ xs: 0.5, sm: 0.75 }}
              >
                {/* Compact Emoji + File Picker Pill on left — gives maximum width to text input */}
                <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 0.25,
                    px: 0.5,
                    py: 0.35,
                    borderRadius: "22px",
                    border: isDark ? "1px solid #343B36" : "1px solid #DCE1DC",
                    bgcolor: isDark ? "#252B27" : "#F7F8F6",
                    "&:focus-within": {
                      borderColor: "#236B4A",
                    },
                  }}
                >
                  <Tooltip title="Emojis">
                    <IconButton
                      size="small"
                      onClick={() => setShowEmoji((s) => !s)}
                      sx={{
                        width: 34,
                        height: 34,
                        mb: "2px",
                        color: showEmoji ? "primary.main" : "text.secondary",
                        flexShrink: 0,
                      }}
                    >
                      <EmojiIcon sx={{ fontSize: 21 }} />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="GIFs & Create GIF">
                    <IconButton
                      size="small"
                      onClick={onOpenGifStudio}
                      aria-label="Open GIF Studio"
                      sx={{
                        width: 32,
                        height: 34,
                        mb: "2px",
                        color: "primary.main",
                        flexShrink: 0,
                      }}
                    >
                      <GifIcon sx={{ fontSize: 21 }} />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Attach files, Poll or Voice Note">
                    <IconButton
                      size="small"
                      onClick={handleFileOpen}
                      sx={{
                        width: 34,
                        height: 34,
                        mb: "2px",
                        color: "secondary.main",
                        transform: "rotate(-30deg)",
                        flexShrink: 0,
                      }}
                    >
                      <AttachFileIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>

                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={message}
                    onChange={messageOnChange}
                    onKeyDown={handleKeyDown}
                    enterKeyHint={enterToSend ? "send" : "enter"}
                    placeholder={enterToSend ? "Message... (Enter sends)" : "Message... (Tap send ➤)"}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      width: "100%",
                      minHeight: "38px",
                      maxHeight: "116px",
                      border: "none",
                      outline: "none",
                      resize: "none",
                      padding: "8px 8px 8px 4px",
                      backgroundColor: "transparent",
                      fontSize: "0.95rem",
                      lineHeight: "1.4",
                      fontFamily: "inherit",
                      color: isDark ? "#F1F3F0" : "#202421",
                    }}
                  />
                </Box>

                {ENABLE_WALKIE_TALKIE && !hasText ? (
                  <Tooltip title="Hold for Walkie-Talkie Push-to-Talk">
                    <IconButton
                      type="button"
                      aria-label="Walkie-Talkie Hold to Talk"
                      onPointerDown={onWalkieStart}
                      onPointerUp={onWalkieStop}
                      onPointerLeave={walkieRecording ? onWalkieStop : undefined}
                      onPointerCancel={onWalkieStop}
                      sx={{
                        bgcolor: walkieRecording ? "error.main" : isDark ? "#2C332E" : "#E5EAE6",
                        color: walkieRecording ? "#FFFFFF" : "primary.main",
                        borderRadius: "50%",
                        width: "40px",
                        height: "40px",
                        flexShrink: 0,
                        touchAction: "none",
                        userSelect: "none",
                        transition: "all 0.16s ease",
                        transform: walkieRecording ? "scale(1.1)" : "none",
                      }}
                    >
                      <WalkieIcon sx={{ fontSize: "1.2rem" }} />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Tooltip
                    title={
                      slowCooldownLeft > 0 && !isAdmin
                        ? `Wait ${slowCooldownLeft}s (slow mode)`
                        : enterToSend
                        ? "Send message (Enter)"
                        : "Tap to send message"
                    }
                  >
                    <IconButton
                      type="submit"
                      disabled={!hasText || (slowCooldownLeft > 0 && !isAdmin)}
                      aria-label="Send message"
                      sx={{
                        bgcolor: hasText && !(slowCooldownLeft > 0 && !isAdmin) ? "#236B4A" : isDark ? "#2C332E" : "#E5EAE6",
                        color: hasText && !(slowCooldownLeft > 0 && !isAdmin) ? "#FFFFFF" : "text.disabled",
                        borderRadius: "50%",
                        width: "40px",
                        height: "40px",
                        flexShrink: 0,
                        transition: "all 0.16s ease",
                        "&:hover": { bgcolor: hasText ? "#1B573C" : undefined, transform: hasText ? "scale(1.04)" : "none" },
                      }}
                    >
                      {slowCooldownLeft > 0 && !isAdmin ? (
                        <Typography variant="caption" fontWeight={700}>{slowCooldownLeft}</Typography>
                      ) : (
                        <SendIcon sx={{ fontSize: "1.15rem", ml: "2px" }} />
                      )}
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </form>
          )}
        </Box>
      </>
    );
  }
);

const Chat = ({ chatId, user }) => {
  const dispatch = useDispatch();
  const socket = getSocket();
  const { themeMode } = useSelector((state) => state.misc);
  const isDark = themeMode === "dark";

  const containerRef = useRef(null);
  const bottomRef = useRef(null);
  const messageRefs = useRef({});
  const nearBottomRef = useRef(true);
  const edgeSwipeStartRef = useRef(null);
  const burstCounterRef = useRef(0);

  const [oldMessages, setOldMessages] = useState([]);
  const [messages, setMessages] = useState([]);
  const [page, setPage] = useState(1);
  const [fileMenuAnchor, setFileMenuAnchor] = useState(null);
  const [userTyping, setUserTyping] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [unreadIndex, setUnreadIndex] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [enterToSend, setEnterToSend] = useState(isEnterToSendEnabled);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [chatBursts, setChatBursts] = useState([]);
  const [viewingUser, setViewingUser] = useState(null);
  const [showGifStudio, setShowGifStudio] = useState(false);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [slowCooldownLeft, setSlowCooldownLeft] = useState(0);

  useEffect(() => {
    setSlowCooldownLeft(0);
    setSelectedMsgIds([]);
    setShowRecap(false);
  }, [chatId]);

  useEffect(() => {
    if (slowCooldownLeft <= 0) return undefined;
    const t = setInterval(() => {
      setSlowCooldownLeft((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [slowCooldownLeft]);
  const [showGameDialog, setShowGameDialog] = useState(false);
  const [showWatchParty, setShowWatchParty] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [whiteboardInviteName, setWhiteboardInviteName] = useState("");
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showWidgetDialog, setShowWidgetDialog] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState([]);
  const [bulkForwardOpen, setBulkForwardOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkStarMessages, { isLoading: isBulkStarring }] = useBulkStarMessagesMutation();
  const [bulkDeleteMessages, { isLoading: isBulkDeleting }] = useBulkDeleteMessagesMutation();
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [locationDuration, setLocationDuration] = useState(15);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [activeTopic, setActiveTopic] = useState("all");
  const [showTopicDialog, setShowTopicDialog] = useState(false);
  const [newTopicText, setNewTopicText] = useState("");
  const [activeThreadMsg, setActiveThreadMsg] = useState(null);
  const [walkieRecording, setWalkieRecording] = useState(false);
  const [walkiePeerName, setWalkiePeerName] = useState("");
  const [incomingWalkieClip, setIncomingWalkieClip] = useState(null);
  const walkieRecorderRef = useRef(null);
  const walkieStreamRef = useRef(null);
  const walkieChunksRef = useRef([]);
  const [e2eeEnabled, setE2eeEnabled] = useState(() => isChatE2eeEnabled(chatId));

  const chatDetails = useChatDetailsQuery({ chatId, populate: true }, { skip: !chatId });
  const oldMessageChunk = useGetMessagesQuery({ chatId, page }, { skip: !chatId });
  const [sendAttachments] = useSendAttachmentsMutation();
  const [publishE2eeKey] = usePublishE2eeKeyMutation();

  const members = chatDetails?.data?.chat?.members;
  const chat = chatDetails?.data?.chat;
  const isGroupChat = Boolean(chat?.groupChat);
  const myIdStr = String(user?._id || user?.id || "");
  const otherMember = !isGroupChat && Array.isArray(members)
    ? members.find((m) => String(m?._id || m?.id || m) !== myIdStr)
    : null;
  const otherMemberId = otherMember ? String(otherMember?._id || otherMember?.id || otherMember) : "";
  const { data: peerE2eeData } = useGetUserE2eeKeyQuery(otherMemberId, {
    skip: isGroupChat || !otherMemberId,
  });
  const peerPublicKey = peerE2eeData?.publicKey || null;

  useEffect(() => {
    setE2eeEnabled(isChatE2eeEnabled(chatId));
  }, [chatId]);

  const handleToggleE2ee = async () => {
    if (isGroupChat) return;
    if (e2eeEnabled) {
      setChatE2eeEnabled(chatId, false);
      setE2eeEnabled(false);
      toast("Client-side E2EE disabled for this chat");
      return;
    }
    try {
      const pair = await ensureLocalIdentityKeyPair();
      await publishE2eeKey({ publicKey: pair.publicJwk, fingerprint: pair.fingerprint }).unwrap();
      if (!peerPublicKey) {
        toast("Your E2EE key is ready! Waiting for your contact to publish theirs too.");
      } else {
        toast.success("Client-side E2EE enabled for this chat 🔒");
      }
      setChatE2eeEnabled(chatId, true);
      setE2eeEnabled(true);
    } catch {
      toast.error("Failed to initialize E2EE keys");
    }
  };

  const handleSendGifFile = async (gifFile) => {
    if (!gifFile || !chatId) return;
    dispatch(setUploadingLoader(true));
    const toastId = toast.loading("Sending media...");
    try {
      const fd = new FormData();
      fd.append("chatId", chatId);
      if (activeTopic && activeTopic !== "all") fd.append("topic_name", activeTopic);
      fd.append("files", gifFile);
      const res = await sendAttachments(fd);
      if (res.data?.success) {
        toast.success("Sent!", { id: toastId });
      } else {
        toast.error(res.error?.data?.message || "Failed to send media", { id: toastId });
      }
    } catch {
      toast.error("Failed to send media", { id: toastId });
    } finally {
      dispatch(setUploadingLoader(false));
    }
  };

  const spawnChatBurst = useCallback((emoji = "🎉", mode = "burst") => {
    const id = ++burstCounterRef.current;
    playCelebrationSound(mode);
    setChatBursts((prev) => [...prev.slice(-4), { id, emoji, mode, x: "50%", y: "65%" }]);
    setTimeout(() => {
      setChatBursts((prev) => prev.filter((b) => b.id !== id));
    }, mode === "confetti" || mode === "hearts" ? 1850 : 1050);
  }, []);

  const triggerShakeAction = useCallback(() => {
    const action = getShakeAction();
    triggerHaptic([15, 25, 15]);
    if (action === "scroll_bottom") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      toast("Jumped to latest messages", { icon: "⬇️" });
    } else if (action === "theme") {
      dispatch(toggleTheme());
    } else {
      spawnChatBurst("🎉", "confetti");
      toast("Party Wave!", { icon: "✨" });
    }
  }, [dispatch, spawnChatBurst]);

  useEffect(() => {
    const onPrefs = () => setEnterToSend(isEnterToSendEnabled());
    window.addEventListener(PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(PREFS_EVENT, onPrefs);
  }, []);

  // Native Web/Android WebView Shake detection via DeviceMotion
  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) return undefined;
    let lastX = null;
    let lastY = null;
    let lastZ = null;
    let lastShakeAt = 0;

    const handleMotion = (event) => {
      if (!isShakeEnabled()) return;
      const acc = event.accelerationIncludingGravity || event.acceleration;
      if (!acc) return;
      const { x = 0, y = 0, z = 0 } = acc;
      if (lastX !== null) {
        const delta = Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ);
        const now = Date.now();
        if (delta > 26 && now - lastShakeAt > 1800) {
          lastShakeAt = now;
          triggerShakeAction();
        }
      }
      lastX = x;
      lastY = y;
      lastZ = z;
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [triggerShakeAction]);

  useEffect(() => {
    setOldMessages([]);
    setMessages([]);
    setPage(1);
    setUserTyping(false);
    setReplyingTo(null);
    setVoiceActive(false);
    setShowScrollBottom(false);
    setShowInfo(false);
    setShowSearch(false);
    setViewingUser(null);
    setActiveTopic("all");
    setActiveThreadMsg(null);
    setWhiteboardInviteName("");
    setShowWatchParty(false);
    setIncomingWalkieClip(null);
    setWalkiePeerName("");
    nearBottomRef.current = true;
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return undefined;
    const flushScheduled = async () => {
      try {
        const base = server || (typeof window !== "undefined" ? window.location.origin : "");
        await axios.get(`${base}/api/v1/message/scheduled/${chatId}`, { withCredentials: true });
      } catch {
        // ignore transient network failure
      }
    };
    const timer = setInterval(flushScheduled, 20000);
    return () => clearInterval(timer);
  }, [chatId]);

  useEffect(() => {
    if (!oldMessageChunk.data?.messages) return;
    const incoming = oldMessageChunk.data.messages;
    if (page === 1) {
      setOldMessages(incoming);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }));
    } else {
      setOldMessages((prev) => {
        const existingIds = new Set(prev.map((m) => String(m._id || m.id)));
        const uniqueOlder = incoming.filter((m) => !existingIds.has(String(m._id || m.id)));
        return [...uniqueOlder, ...prev];
      });
    }
  }, [chatId, page, oldMessageChunk.data?.messages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let debounceTimer = null;
    const handleScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      nearBottomRef.current = distanceFromBottom < 140;
      setShowScrollBottom(distanceFromBottom > 180);

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (container.scrollTop === 0) {
          const totalPages = oldMessageChunk.data?.totalPages || 1;
          if (page < totalPages) {
            const prevHeight = container.scrollHeight;
            setPage((prev) => prev + 1);
            requestAnimationFrame(() => {
              if (container) {
                container.scrollTop = container.scrollHeight - prevHeight;
              }
            });
          }
        }
      }, 150);
    };

    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [page, oldMessageChunk.data?.totalPages]);

  useEffect(() => {
    if (!oldMessages?.length) return;
    const lastSeen = getLastSeen(chatId);
    if (!lastSeen) {
      setUnreadIndex(null);
      return;
    }
    const firstUnread = oldMessages.findIndex((m) => m.createdAt && new Date(m.createdAt) > lastSeen);
    setUnreadIndex(firstUnread >= 0 ? firstUnread : null);
  }, [chatId, oldMessages?.length]);

  useEffect(() => {
    return () => {
      if (chatId) setLastSeen(chatId);
    };
  }, [chatId]);

  const newMessagesHandler = useCallback(
    (data) => {
      if (!data) return;
      const targetChatId = data.chatId || data.conversation_id;
      if (targetChatId && String(targetChatId) !== String(chatId)) return;
      const msg = data.message || data;
      if (msg && msg._id) {
        if (msg.threadRootId) {
          const incReply = (m) =>
            String(m._id) === String(msg.threadRootId) ? { ...m, replyCount: Number(m.replyCount || 0) + 1 } : m;
          setMessages((prev) => prev.map(incReply));
          setOldMessages((prev) => prev.map(incReply));
          return;
        }
        const celeb = extractCelebrationTrigger(msg.content);
        if (celeb) spawnChatBurst(celeb.emoji, celeb.mode);
        setMessages((prev) => {
          if (prev.some((m) => String(m._id) === String(msg._id))) return prev;
          return [...prev, msg];
        });
        if (nearBottomRef.current) {
          requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
        }
      }
    },
    [chatId, spawnChatBurst]
  );

  const messageEditedHandler = useCallback((data) => {
    const targetChatId = data?.chatId || data?.conversation_id;
    if (targetChatId && String(targetChatId) !== String(chatId)) return;
    const targetId = String(data?.messageId || data?.message_id || "");
    if (!targetId) return;
    const patch = (m) => (String(m._id) === targetId ? { ...m, content: data.content, isEdited: true } : m);
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, [chatId]);

  const messageDeletedHandler = useCallback((data) => {
    const targetChatId = data?.chatId || data?.conversation_id;
    if (targetChatId && String(targetChatId) !== String(chatId)) return;
    const targetId = String(data?.messageId || data?.message_id || "");
    if (!targetId) return;
    const patch = (m) => (String(m._id) === targetId ? { ...m, isDeleted: true, content: "" } : m);
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, [chatId]);

  const messageDeletedForMeHandler = useCallback((data) => {
    const targetChatId = data?.chatId || data?.conversation_id;
    if (targetChatId && String(targetChatId) !== String(chatId)) return;
    const targetId = String(data?.messageId || data?.message_id || "");
    if (!targetId) return;
    setMessages((prev) => prev.filter((m) => String(m._id) !== targetId));
    setOldMessages((prev) => prev.filter((m) => String(m._id) !== targetId));
  }, [chatId]);

  const syncActiveConversation = useCallback(async () => {
    if (!chatId) return;
    chatDetails.refetch();
    try {
      const base = server || (typeof window !== "undefined" ? window.location.origin : "");
      const { data } = await axios.get(`${base}/api/v1/chat/message/${chatId}?page=1`, {
        withCredentials: true,
      });
      const latest = Array.isArray(data?.messages) ? data.messages : null;
      if (!latest) return;

      if (page === 1) {
        setOldMessages(latest);
        const latestIds = new Set(latest.map((m) => String(m._id || m.id)));
        setMessages((prev) => prev.filter((m) => !latestIds.has(String(m._id || m.id))));
      } else {
        const latestMap = new Map(latest.map((m) => [String(m._id || m.id), m]));
        setOldMessages((prev) => {
          const oldIds = new Set(prev.map((m) => String(m._id || m.id)));
          const updatedOld = prev.map((m) => latestMap.get(String(m._id || m.id)) || m);
          setMessages((curMsgs) => {
            const msgIds = new Set(curMsgs.map((m) => String(m._id || m.id)));
            const merged = curMsgs.map((m) => latestMap.get(String(m._id || m.id)) || m);
            const additions = latest
              .filter((m) => {
                const id = String(m._id || m.id);
                return !oldIds.has(id) && !msgIds.has(id);
              })
              .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
            return additions.length ? [...merged, ...additions] : merged;
          });
          return updatedOld;
        });
      }
    } catch {
      oldMessageChunk.refetch();
    }
  }, [chatId, chatDetails, oldMessageChunk, page]);

  useEffect(() => {
    const onSync = () => syncActiveConversation();
    window.addEventListener("chitchat:sync-active-chat", onSync);
    window.addEventListener("online", onSync);
    return () => {
      window.removeEventListener("chitchat:sync-active-chat", onSync);
      window.removeEventListener("online", onSync);
    };
  }, [syncActiveConversation]);

  const handleLocalEdit = useCallback((messageId, newContent) => {
    const patch = (m) => (m._id === messageId ? { ...m, content: newContent, isEdited: true } : m);
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, []);

  const handleLocalDelete = useCallback((messageId) => {
    const patch = (m) => (m._id === messageId ? { ...m, isDeleted: true, content: "" } : m);
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, []);

  const handleScrollToMessage = useCallback((messageId, fullMsg = null) => {
    setShowSearch(false);
    const el = messageRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (fullMsg && fullMsg._id) {
      setOldMessages((prev) => {
        if (prev.some((m) => String(m._id) === String(fullMsg._id))) return prev;
        return [fullMsg, ...prev];
      });
      requestAnimationFrame(() => {
        messageRefs.current[messageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, []);

  const startTypingListener = useCallback(
    (data) => {
      if (data.chatId !== chatId) return;
      setUserTyping(true);
    },
    [chatId]
  );

  const stopTypingListener = useCallback(
    (data) => {
      if (data.chatId !== chatId) return;
      setUserTyping(false);
    },
    [chatId]
  );

  const handleLocalReact = useCallback((messageId, reactions) => {
    const patch = (msg) => (String(msg._id) === String(messageId) ? { ...msg, reactions } : msg);
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, []);

  const messageReactedHandler = useCallback(
    (data) => {
      if (!data) return;
      const targetChatId = data.chatId || data.conversation_id;
      if (targetChatId && String(targetChatId) !== String(chatId)) return;
      const targetMsgId = data.messageId || data.message_id;
      const reactions = data.reactions || [];
      const patch = (msg) => (String(msg._id) === String(targetMsgId) ? { ...msg, reactions } : msg);
      setMessages((prev) => prev.map(patch));
      setOldMessages((prev) => prev.map(patch));
    },
    [chatId]
  );

  const messageReadUpdateHandler = useCallback(
    (data) => {
      if (!data || data.chatId !== chatId) return;
      const msgIds = Array.isArray(data.messageIds) ? data.messageIds.map(String) : [];
      const expiresMap = data.expiresMap && typeof data.expiresMap === "object" ? data.expiresMap : {};
      const patch = (msg) => {
        const sid = String(msg._id);
        const newExpiry = expiresMap[sid];
        if (msgIds.includes(sid) || newExpiry) {
          return {
            ...msg,
            ...(msgIds.includes(sid) ? { readBy: [...(msg.readBy || []), data.readBy] } : {}),
            ...(newExpiry ? { expiresAt: newExpiry } : {}),
          };
        }
        return msg;
      };
      setMessages((prev) => prev.map(patch));
      setOldMessages((prev) => prev.map(patch));
    },
    [chatId]
  );

  const handleLocalPollUpdate = useCallback((messageId, attachments) => {
    const patch = (msg) => (String(msg._id) === String(messageId) ? { ...msg, attachments } : msg);
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, []);

  const pollUpdatedHandler = useCallback(
    (data) => {
      if (!data) return;
      const targetChatId = data.chatId || data.conversation_id;
      if (targetChatId && String(targetChatId) !== String(chatId)) return;
      const targetMsgId = data.messageId || data.message_id;
      if (!targetMsgId) return;
      const patch = (msg) => {
        if (String(msg._id) !== String(targetMsgId)) return msg;
        return {
          ...msg,
          ...(Array.isArray(data.attachments) ? { attachments: data.attachments } : {}),
          ...(Array.isArray(data.viewedBy) ? { viewedBy: data.viewedBy } : {}),
        };
      };
      setMessages((prev) => prev.map(patch));
      setOldMessages((prev) => prev.map(patch));
    },
    [chatId]
  );

  const handleViewOnceConsumed = useCallback((messageId, viewedBy) => {
    const patch = (msg) => (String(msg._id) === String(messageId) ? { ...msg, viewedBy } : msg);
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, []);

  const walkieSignalHandler = useCallback(
    (data) => {
      if (!ENABLE_WALKIE_TALKIE) return;
      if (!data || String(data.chatId) !== String(chatId)) return;
      if (String(data.senderId || "") === myIdStr) return;
      if (data.state === "talking") {
        setWalkiePeerName(data.senderName || "Friend");
      } else if (data.state === "idle") {
        setWalkiePeerName("");
      } else if (data.state === "clip" && data.audioDataUrl) {
        setWalkiePeerName("");
        playWalkieChirp(true);
        setIncomingWalkieClip({ senderName: data.senderName || "Friend", audioDataUrl: data.audioDataUrl });
        try {
          const audio = new Audio(data.audioDataUrl);
          audio.play().catch(() => {});
        } catch {
          // fallback banner button lets user tap to play
        }
      }
    },
    [chatId, myIdStr]
  );

  const watchSyncOpenHandler = useCallback(
    (data) => {
      if (!data || String(data.chatId) !== String(chatId)) return;
      if (data.action === "start" && String(data.senderId || "") !== myIdStr) {
        setShowWatchParty(true);
      }
    },
    [chatId, myIdStr]
  );

  const [wallpaper, setWallpaper] = useState(() => {
    try {
      return localStorage.getItem(`chitchat_wallpaper_${chatId}`) || "default";
    } catch {
      return "default";
    }
  });

  useEffect(() => {
    try {
      setWallpaper(localStorage.getItem(`chitchat_wallpaper_${chatId}`) || "default");
    } catch {
      setWallpaper("default");
    }
    const onWp = (ev) => {
      if (!ev?.detail?.chatId || String(ev.detail.chatId) === String(chatId)) {
        setWallpaper(ev?.detail?.wallpaper || "default");
      }
    };
    const onCleared = (ev) => {
      if (!ev?.detail?.chatId || String(ev.detail.chatId) === String(chatId)) {
        setOldMessages([]);
        setMessages([]);
      }
    };
    window.addEventListener("chitchat:wallpaper-changed", onWp);
    window.addEventListener("chitchat:chat-cleared", onCleared);
    return () => {
      window.removeEventListener("chitchat:wallpaper-changed", onWp);
      window.removeEventListener("chitchat:chat-cleared", onCleared);
    };
  }, [chatId]);

  const chatClearedSocketHandler = useCallback(
    (data) => {
      if (!data || String(data.chatId) !== String(chatId)) return;
      setOldMessages([]);
      setMessages([]);
    },
    [chatId]
  );

  const topicsUpdatedHandler = useCallback(
    (data) => {
      if (!data || String(data.chatId) !== String(chatId)) return;
      chatDetails.refetch();
    },
    [chatId, chatDetails]
  );

  const socketErrorHandler = useCallback(
    (data) => {
      if (!data) return;
      if (data.code === "slow_mode" && (!data.chatId || String(data.chatId) === String(chatId))) {
        setSlowCooldownLeft(Math.max(1, Number(data.retryAfter || 1)));
      }
      if (data.message) {
        toast.error(data.message);
      }
    },
    [chatId]
  );

  useEffect(() => {
    const checkPendingJump = () => {
      try {
        const raw = sessionStorage.getItem("chitchat_jump_msg");
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && String(parsed.chatId) === String(chatId) && parsed.message?._id) {
          sessionStorage.removeItem("chitchat_jump_msg");
          handleScrollToMessage(parsed.message._id, parsed.message);
        }
      } catch {
        // ignore storage errors
      }
    };
    checkPendingJump();
    const onJump = (ev) => {
      const d = ev?.detail;
      if (d && String(d.chatId) === String(chatId) && d.message?._id) {
        try {
          sessionStorage.removeItem("chitchat_jump_msg");
        } catch {
          // ignore
        }
        handleScrollToMessage(d.message._id, d.message);
      }
    };
    window.addEventListener("chitchat:jump-to-message", onJump);
    return () => window.removeEventListener("chitchat:jump-to-message", onJump);
  }, [chatId, handleScrollToMessage]);

  useSocketEvents(socket, {
    [NEW_MESSAGE]: newMessagesHandler,
    "message.created": newMessagesHandler,
    [START_TYPING]: startTypingListener,
    [STOP_TYPING]: stopTypingListener,
    [MESSAGE_EDITED]: messageEditedHandler,
    "message.updated": messageEditedHandler,
    [MESSAGE_DELETED]: messageDeletedHandler,
    "message.deleted": messageDeletedHandler,
    "message.deleted_for_me": messageDeletedForMeHandler,
    MESSAGE_REACTED: messageReactedHandler,
    "message.reaction": messageReactedHandler,
    MESSAGE_POLL_UPDATED: pollUpdatedHandler,
    "message.poll_updated": pollUpdatedHandler,
    MESSAGE_INTERACTIVE_UPDATED: pollUpdatedHandler,
    "message.interactive_updated": pollUpdatedHandler,
    "chat.topics_updated": topicsUpdatedHandler,
    "chat.moderation_updated": topicsUpdatedHandler,
    "group.member_added": topicsUpdatedHandler,
    "group.join_requested": topicsUpdatedHandler,
    "chat.cleared": chatClearedSocketHandler,
    "watch.sync": watchSyncOpenHandler,
    "walkie.signal": walkieSignalHandler,
    [MESSAGE_READ_UPDATE]: messageReadUpdateHandler,
    "message.read": messageReadUpdateHandler,
    "error": socketErrorHandler,
    "connect": syncActiveConversation,
  });

  const handleWalkieStart = useCallback(async () => {
    if (!ENABLE_WALKIE_TALKIE || walkieRecording || !chatId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      walkieStreamRef.current = stream;
      const mimeType =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.("audio/webm")
          ? "audio/webm"
          : undefined;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 16000 })
        : new MediaRecorder(stream);
      walkieChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) walkieChunksRef.current.push(ev.data);
      };
      walkieRecorderRef.current = recorder;
      recorder.start(100);
      setWalkieRecording(true);
      playWalkieChirp(true);
      triggerHaptic(20);
      socket.emit("walkie.signal", { chatId, state: "talking" });
    } catch {
      toast.error("Microphone permission required for Walkie-Talkie");
    }
  }, [chatId, socket, walkieRecording]);

  const handleWalkieStop = useCallback(() => {
    if (!ENABLE_WALKIE_TALKIE) return;
    const recorder = walkieRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setWalkieRecording(false);
      return;
    }
    setWalkieRecording(false);
    playWalkieChirp(false);
    socket.emit("walkie.signal", { chatId, state: "idle" });

    recorder.onstop = () => {
      if (walkieStreamRef.current) {
        walkieStreamRef.current.getTracks().forEach((t) => t.stop());
        walkieStreamRef.current = null;
      }
      const blob = new Blob(walkieChunksRef.current, { type: recorder.mimeType || "audio/webm" });
      if (blob.size < 600) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string" && reader.result.length < 180000) {
          socket.emit("walkie.signal", { chatId, state: "clip", audioDataUrl: reader.result });
          toast("📻 Walkie clip sent!", { duration: 1500 });
        } else {
          toast.error("Keep walkie bursts short (under 5 seconds)");
        }
      };
      reader.readAsDataURL(blob);
    };
    recorder.stop();
  }, [chatId, socket]);

  const handleAddTopicSubmit = async (e) => {
    e.preventDefault();
    const clean = newTopicText.trim().replace(/^#/, "");
    if (!clean || !chatId) return;
    try {
      const base = server || (typeof window !== "undefined" ? window.location.origin : "");
      const { data } = await axios.post(
        `${base}/api/v1/chat/${chatId}/topics`,
        { topic: clean, action: "add" },
        { withCredentials: true }
      );
      if (data?.success) {
        setNewTopicText("");
        setShowTopicDialog(false);
        setActiveTopic(clean);
        chatDetails.refetch();
        toast.success(`Topic #${clean} created!`);
      }
    } catch {
      toast.error("Failed to add topic");
    }
  };

  const handleShareLocationSubmit = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Geolocation not supported on this device");
      return;
    }
    setSharingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const base = server || (typeof window !== "undefined" ? window.location.origin : "");
          await axios.post(
            `${base}/api/v1/message/interactive/location/share`,
            {
              chatId,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              durationMinutes: locationDuration,
              topicName: activeTopic && activeTopic !== "all" ? activeTopic : "",
            },
            { withCredentials: true }
          );
          setShowLocationDialog(false);
          toast.success(`Live location shared for ${locationDuration}m!`);
        } catch {
          toast.error("Failed to share live location");
        } finally {
          setSharingLocation(false);
        }
      },
      () => {
        setSharingLocation(false);
        toast.error("Location permission denied");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasTimedExpiry = useMemo(
    () => oldMessages.some((m) => Boolean(m?.expiresAt)) || messages.some((m) => Boolean(m?.expiresAt)),
    [oldMessages, messages]
  );
  useEffect(() => {
    if (!hasTimedExpiry) return undefined;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasTimedExpiry]);

  const allMessages = useMemo(() => {
    const oldIds = new Set(oldMessages.map((m) => String(m._id || m.id)));
    const uniqueRealtime = messages.filter((m) => !oldIds.has(String(m._id || m.id)));
    const combined = [...oldMessages, ...uniqueRealtime].filter(
      (m) => !m?.expiresAt || new Date(m.expiresAt).getTime() > nowMs
    );
    if (!activeTopic || activeTopic === "all") return combined;
    return combined.filter((m) => String(m.topicName || "").toLowerCase() === activeTopic.toLowerCase());
  }, [activeTopic, oldMessages, messages, nowMs]);

  const handleSetReply = useCallback((msg) => setReplyingTo(msg), []);
  const handleClearReply = useCallback(() => setReplyingTo(null), []);

  useEffect(() => {
    if (!allMessages.length || !user) return;
    const myId = String(user._id || user.id || "");
    const unreadMessageIds = allMessages
      .filter((m) => String(m.sender?._id || m.sender?.id || "") !== myId && !(m.readBy || []).includes(myId))
      .map((m) => m._id);

    if (unreadMessageIds.length > 0) {
      socket.emit(MESSAGE_READ, { chatId, members, messageIds: unreadMessageIds });
      const patch = (msg) => {
        if (unreadMessageIds.includes(msg._id)) {
          return { ...msg, readBy: [...(msg.readBy || []), myId] };
        }
        return msg;
      };
      setMessages((prev) => prev.map(patch));
      setOldMessages((prev) => prev.map(patch));
    }
  }, [allMessages, user, chatId, members, socket]);

  const unreadCount = unreadIndex !== null ? allMessages.length - unreadIndex : 0;
  const isSavedMessagesChat = Boolean(chat?.isSavedMessages);

  const smartReplies = useMemo(() => {
    if (isSavedMessagesChat || !allMessages.length) return [];
    const lastMsg = allMessages[allMessages.length - 1];
    return getSmartReplySuggestions(lastMsg, myIdStr);
  }, [allMessages, isSavedMessagesChat, myIdStr]);

  const unreadRecap = useMemo(() => {
    if (!showRecap || !allMessages.length) return null;
    return buildUnreadRecap(allMessages, unreadCount, myIdStr, user?.username);
  }, [allMessages, myIdStr, showRecap, unreadCount, user?.username]);

  const toggleSelectMessage = useCallback((msg) => {
    const mid = String(msg?._id || msg?.id || "");
    if (!mid) return;
    setSelectedMsgIds((prev) => (prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid]));
  }, []);

  const handleBulkCopy = () => {
    const selectedSet = new Set(selectedMsgIds.map(String));
    const lines = allMessages
      .filter((m) => selectedSet.has(String(m._id)))
      .map((m) => `${m.sender?.name || "User"}: ${m.content || "[Attachment]"}`);
    if (lines.length) {
      navigator.clipboard?.writeText(lines.join("\n"));
      toast.success(`Copied ${lines.length} message(s)`);
    }
    setSelectedMsgIds([]);
  };

  const handleBulkStar = async () => {
    try {
      const res = await bulkStarMessages(selectedMsgIds).unwrap();
      toast.success(`Starred ${res?.starredCount || selectedMsgIds.length} message(s)`);
      setSelectedMsgIds([]);
    } catch {
      toast.error("Failed to star selected messages");
    }
  };

  const handleBulkDelete = async (mode) => {
    try {
      const res = await bulkDeleteMessages({ messageIds: selectedMsgIds, mode }).unwrap();
      const deletedSet = new Set((res?.deletedIds || []).map(String));
      if (mode === "everyone") {
        const patch = (m) => (deletedSet.has(String(m._id)) ? { ...m, isDeleted: true, content: "" } : m);
        setMessages((prev) => prev.map(patch));
        setOldMessages((prev) => prev.map(patch));
      } else {
        setMessages((prev) => prev.filter((m) => !deletedSet.has(String(m._id))));
        setOldMessages((prev) => prev.filter((m) => !deletedSet.has(String(m._id))));
      }
      toast.success(`Deleted ${deletedSet.size} message(s)`);
      setBulkDeleteOpen(false);
      setSelectedMsgIds([]);
    } catch {
      toast.error("Failed to delete selected messages");
    }
  };

  const chatDisplayName =
    (isSavedMessagesChat ? "Saved Messages" : isGroupChat ? chat?.name : otherMember?.name || otherMember?.username || chat?.name) || "Conversation";
  const rawChatAvatar = isGroupChat
    ? chat?.avatar?.url || chat?.avatar
    : otherMember?.avatar?.url || otherMember?.avatar;
  const chatAvatarSrc = transformImage(typeof rawChatAvatar === "string" ? rawChatAvatar : rawChatAvatar?.url);
  const isRestricted = isGroupChat && Boolean(chat?.restrictedMessages);
  const isCreator =
    chat?.creator?.toString() === user?._id?.toString() || chat?.creator?.toString() === user?.id?.toString();
  const isAdmin =
    isCreator ||
    chat?.admins?.includes(user?._id?.toString()) ||
    chat?.admins?.includes(user?.id?.toString());
  const canSendMessages = !isRestricted || isAdmin;

  return chatDetails.isLoading ? (
    <Skeleton variant="rectangular" height="100%" width="100%" />
  ) : (
    <Box
      onTouchStart={(e) => {
        const touch = e.touches?.[0];
        if (touch && touch.clientX < 28) {
          edgeSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
        } else {
          edgeSwipeStartRef.current = null;
        }
      }}
      onTouchEnd={(e) => {
        const st = edgeSwipeStartRef.current;
        edgeSwipeStartRef.current = null;
        if (!st) return;
        const touch = e.changedTouches?.[0];
        if (!touch) return;
        const dx = touch.clientX - st.x;
        const dy = Math.abs(touch.clientY - st.y);
        if (dx > 64 && dx > dy * 1.4) {
          dispatch(setIsMobile(true));
        }
      }}
      sx={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <EmojiBurst bursts={chatBursts} />

      {/* Crisp Sticky Conversation Header Bar (no overlapping floating icons) */}
      <Box
        sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          px: { xs: 1, sm: 2 },
          py: 0.75,
          minHeight: 52,
          borderBottom: "1px solid",
          borderColor: isDark ? "#343B36" : "#E3E6E1",
          bgcolor: isDark ? "#1E2320" : "#FFFFFF",
          zIndex: 12,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} minWidth={0} flex={1}>
          <IconButton
            size="small"
            onClick={() => dispatch(setIsMobile(true))}
            aria-label="Open conversations"
            sx={{ display: { xs: "inline-flex", sm: "none" }, flexShrink: 0 }}
          >
            <BackIcon fontSize="small" />
          </IconButton>

          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            minWidth={0}
            flex={1}
            onClick={() => setShowInfo(true)}
            sx={{ cursor: "pointer" }}
          >
            <Avatar
              src={isSavedMessagesChat ? undefined : chatAvatarSrc}
              alt={chatDisplayName}
              sx={{
                width: 34,
                height: 34,
                bgcolor: isSavedMessagesChat ? "#0EA5E9" : "#236B4A",
                fontSize: "0.95rem",
                flexShrink: 0,
              }}
            >
              {isSavedMessagesChat ? <VaultIcon fontSize="small" /> : chatDisplayName[0]?.toUpperCase() || "C"}
            </Avatar>
            <Box minWidth={0}>
              <Typography variant="subtitle2" fontWeight={700} noWrap>
                {chatDisplayName}
              </Typography>
              <Typography variant="caption" color={userTyping ? "primary" : "text.secondary"} noWrap display="block">
                {userTyping
                  ? "Typing..."
                  : isSavedMessagesChat
                  ? "Personal Vault · Synced across PC & Mobile"
                  : chat?.ephemeral_ttl === -1
                  ? "🔥 Vanishes right after seen · Tap for info"
                  : chat?.ephemeral_ttl === -120
                  ? "⏱ Vanishes 2m after seen · Tap for info"
                  : chat?.ephemeral_ttl
                  ? `⏱ Disappearing (${chat.ephemeral_ttl >= 3600 ? `${Math.round(chat.ephemeral_ttl / 3600)}h` : `${chat.ephemeral_ttl}s`}) · Tap for info`
                  : e2eeEnabled && peerPublicKey
                  ? "🔒 End-to-End Encrypted · Tap for info"
                  : "Hold or swipe messages · Tap for info"}
              </Typography>
            </Box>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={0.25} flexShrink={0}>
          {allMessages.length > 0 && (
            <Tooltip title="Catch Me Up (Unread Recap)">
              <IconButton
                size="small"
                onClick={() => setShowRecap((r) => !r)}
                sx={{ color: showRecap ? "primary.main" : unreadCount >= 3 ? "warning.main" : "text.secondary" }}
              >
                <RecapIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {!isGroupChat && !isSavedMessagesChat && (
            <Tooltip title={e2eeEnabled ? "Client E2EE On (Tap to toggle)" : "Enable Client E2EE"}>
              <IconButton
                size="small"
                onClick={handleToggleE2ee}
                sx={{ color: e2eeEnabled ? "success.main" : "text.secondary" }}
              >
                {e2eeEnabled ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Listen / Watch Together">
            <IconButton
              size="small"
              onClick={() => setShowWatchParty((w) => !w)}
              sx={{ color: showWatchParty ? "primary.main" : "text.secondary" }}
            >
              <HeadphonesIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Party Burst Wave">
            <IconButton size="small" onClick={() => triggerShakeAction()} sx={{ color: "primary.main" }}>
              <SparkleIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Search messages">
            <IconButton
              size="small"
              onClick={() => setShowSearch((s) => !s)}
              sx={{ color: showSearch ? "primary.main" : "text.secondary" }}
            >
              <SearchIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Chat Info & Media">
            <IconButton size="small" onClick={() => setShowInfo(true)} sx={{ color: "text.secondary" }}>
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      <PinnedMessages chatId={chatId} onScrollToMessage={handleScrollToMessage} />

      {selectedMsgIds.length > 0 && (
        <Paper
          square
          elevation={1}
          sx={{
            px: 1.5,
            py: 0.65,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            bgcolor: isDark ? "#1E3A2F" : "#DCFCE7",
            borderBottom: "1px solid",
            borderColor: "divider",
            gap: 1,
          }}
        >
          <Typography variant="subtitle2" fontWeight={700}>
            {selectedMsgIds.length} selected
          </Typography>
          <Stack direction="row" spacing={0.25} alignItems="center">
            <Tooltip title="Copy text">
              <IconButton size="small" onClick={handleBulkCopy}>
                <CopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Star selected">
              <span>
                <IconButton size="small" disabled={isBulkStarring} onClick={handleBulkStar}>
                  <StarIcon fontSize="small" sx={{ color: "#f59e0b" }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Forward selected">
              <IconButton size="small" onClick={() => setBulkForwardOpen(true)}>
                <ForwardIcon fontSize="small" color="primary" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete selected">
              <span>
                <IconButton size="small" color="error" disabled={isBulkDeleting} onClick={() => setBulkDeleteOpen(true)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <IconButton size="small" onClick={() => setSelectedMsgIds([])} aria-label="Exit selection">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Paper>
      )}

      {showRecap && unreadRecap && (
        <Paper
          square
          elevation={0}
          sx={{
            px: 2,
            py: 1,
            bgcolor: isDark ? "#1F2622" : "#F0FDF4",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
            <Typography variant="caption" fontWeight={700} color="primary">
              ✨ Catch Me Up · Last {unreadRecap.scannedCount} messages
            </Typography>
            <IconButton size="small" onClick={() => setShowRecap(false)}>
              <CloseIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Stack>
          <Stack spacing={0.4}>
            {unreadRecap.topSenders.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                Active: {unreadRecap.topSenders.map((s) => `${s.name} (${s.count})`).join(" · ")}
              </Typography>
            )}
            {unreadRecap.mentions.length > 0 && (
              <Typography variant="caption" fontWeight={600} color="warning.main">
                Mentions: {unreadRecap.mentions.map((m) => `${m.senderName}: "${m.text}"`).join(" | ")}
              </Typography>
            )}
            {unreadRecap.questions.length > 0 && (
              <Typography variant="caption" color="text.primary">
                Questions: {unreadRecap.questions.map((q) => `${q.senderName}: "${q.text}"`).join(" | ")}
              </Typography>
            )}
            {unreadRecap.highlights.length > 0 && (
              <Typography variant="caption" color="text.primary">
                Cards: {unreadRecap.highlights.join(" · ")}
              </Typography>
            )}
            {unreadRecap.links.length > 0 && (
              <Typography variant="caption" color="text.secondary" noWrap>
                Links: {unreadRecap.links.map((l) => l.url).join(" · ")}
              </Typography>
            )}
          </Stack>
        </Paper>
      )}

      {/* Group Topics / Channels Bar */}
      {isGroupChat && (
        <Stack
          direction="row"
          spacing={0.6}
          alignItems="center"
          sx={{
            px: { xs: 1, sm: 2 },
            py: 0.65,
            overflowX: "auto",
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: isDark ? "#1B201D" : "#F9FAF8",
            flexShrink: 0,
          }}
        >
          <Chip
            size="small"
            clickable
            label="# All"
            color={activeTopic === "all" ? "primary" : "default"}
            variant={activeTopic === "all" ? "filled" : "outlined"}
            onClick={() => setActiveTopic("all")}
          />
          {(chat?.topics || []).map((t) => (
            <Chip
              key={t}
              size="small"
              clickable
              label={`#${t}`}
              color={activeTopic === t ? "primary" : "default"}
              variant={activeTopic === t ? "filled" : "outlined"}
              onClick={() => setActiveTopic(t)}
            />
          ))}
          <Chip
            size="small"
            clickable
            variant="outlined"
            label="+ Topic"
            onClick={() => setShowTopicDialog(true)}
          />
        </Stack>
      )}

      {/* Synchronized Listen / Watch Together Bar */}
      <WatchPartyBar
        open={showWatchParty}
        onClose={() => setShowWatchParty(false)}
        chatId={chatId}
        socket={socket}
        currentUserId={myIdStr}
        isDark={isDark}
      />

      {/* Live Whiteboard Invite Banner */}
      {whiteboardInviteName && !showWhiteboard && (
        <Paper
          square
          elevation={0}
          sx={{
            px: 2,
            py: 0.75,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            bgcolor: isDark ? "#262135" : "#F3E8FF",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="caption" fontWeight={700}>
            🎨 {whiteboardInviteName} opened a Live Whiteboard
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                setWhiteboardInviteName("");
                setShowWhiteboard(true);
              }}
            >
              Join Canvas
            </Button>
            <Button size="small" onClick={() => setWhiteboardInviteName("")}>
              Dismiss
            </Button>
          </Stack>
        </Paper>
      )}

      {/* Walkie-Talkie Live / Incoming Banner */}
      {ENABLE_WALKIE_TALKIE && (walkiePeerName || incomingWalkieClip) && (
        <Paper
          square
          elevation={0}
          sx={{
            px: 2,
            py: 0.65,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            bgcolor: isDark ? "#232F28" : "#DCFCE7",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="caption" fontWeight={700}>
            {walkiePeerName
              ? `📻 ${walkiePeerName} is talking (Walkie-Talkie)...`
              : `📻 Walkie burst from ${incomingWalkieClip?.senderName}`}
          </Typography>
          <Stack direction="row" spacing={0.5}>
            {incomingWalkieClip && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => new Audio(incomingWalkieClip.audioDataUrl).play().catch(() => {})}
              >
                Replay
              </Button>
            )}
            <Button size="small" onClick={() => { setWalkiePeerName(""); setIncomingWalkieClip(null); }}>
              Hide
            </Button>
          </Stack>
        </Paper>
      )}

      <Box
        sx={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {showSearch && (
          <ChatSearch
            chatId={chatId}
            members={members}
            onScrollToMessage={handleScrollToMessage}
            onClose={() => setShowSearch(false)}
          />
        )}

        {/* Message list */}
        <Stack
          ref={containerRef}
          boxSizing="border-box"
          sx={{
            px: { xs: 1.25, sm: 2 },
            pt: 1.5,
            pb: 2,
            overflowX: "hidden",
            overflowY: "auto",
            background:
              wallpaper === "mint"
                ? isDark
                  ? "linear-gradient(180deg, #13211B 0%, #171A18 100%)"
                  : "linear-gradient(180deg, #EBF7F1 0%, #F7FBF8 100%)"
                : wallpaper === "sand"
                ? isDark
                  ? "linear-gradient(180deg, #221E17 0%, #191815 100%)"
                  : "linear-gradient(180deg, #FDF6E9 0%, #FAF7F0 100%)"
                : wallpaper === "ocean"
                ? isDark
                  ? "linear-gradient(180deg, #111D26 0%, #15191E 100%)"
                  : "linear-gradient(180deg, #E8F4FA 0%, #F5FAFD 100%)"
                : wallpaper === "midnight"
                ? "radial-gradient(circle at top right, #1E293B 0%, #0F172A 100%)"
                : undefined,
          }}
          spacing="0.65rem"
          bgcolor={wallpaper === "default" ? (isDark ? "#171A18" : "#F7F8F6") : undefined}
          flex={1}
        >
          {allMessages.map((value, idx) => {
            const myId = String(user?._id || user?.id || "");
            const senderId = String(value.sender?._id || value.sender?.id || "");
            const isMine = Boolean(myId && senderId === myId);
            return (
              <React.Fragment key={value._id}>
                {unreadIndex !== null && idx === unreadIndex && <UnreadDivider count={unreadCount} />}
                <div
                  ref={(el) => {
                    if (el) messageRefs.current[value._id] = el;
                  }}
                  style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start" }}
                >
                  <MessageComponent
                    message={value}
                    chatId={chatId}
                    chatMembers={members}
                    isGroupAdmin={isAdmin}
                    onEdit={handleLocalEdit}
                    onDelete={handleLocalDelete}
                    onReply={handleSetReply}
                    onReact={handleLocalReact}
                    onPollUpdate={handleLocalPollUpdate}
                    onInteractiveUpdate={handleLocalPollUpdate}
                    onViewOnceConsumed={handleViewOnceConsumed}
                    onOpenThread={(msg) => setActiveThreadMsg(msg)}
                    onViewProfile={setViewingUser}
                    selectionMode={selectedMsgIds.length > 0}
                    isSelected={selectedMsgIds.includes(String(value._id))}
                    onToggleSelect={toggleSelectMessage}
                    onStartMultiSelect={toggleSelectMessage}
                  />
                </div>
              </React.Fragment>
            );
          })}

          {userTyping && <TypingIndicator />}
          <div ref={bottomRef} />
        </Stack>

        {/* Floating Scroll to Latest button */}
        {showScrollBottom && (
          <Fab
            size="small"
            color="primary"
            aria-label="Scroll to latest message"
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
            sx={{ position: "absolute", bottom: 14, right: 16, zIndex: 15 }}
          >
            <ScrollDownIcon />
          </Fab>
        )}
      </Box>

      {/* Spacious, Responsive Composer */}
      {canSendMessages ? (
        <ChatComposer
          chatId={chatId}
          members={members}
          socket={socket}
          isDark={isDark}
          dispatch={dispatch}
          replyingTo={replyingTo}
          onClearReply={handleClearReply}
          setFileMenuAnchor={setFileMenuAnchor}
          voiceActive={voiceActive}
          onCancelVoice={() => setVoiceActive(false)}
          enterToSend={enterToSend}
          onCelebrateSend={spawnChatBurst}
          onOpenGifStudio={() => setShowGifStudio(true)}
          isGroupChat={isGroupChat}
          activeTopic={activeTopic}
          e2eeEnabled={e2eeEnabled}
          peerPublicKey={peerPublicKey}
          slowModeSeconds={isGroupChat ? Number(chat?.slowModeSeconds || 0) : 0}
          slowCooldownLeft={slowCooldownLeft}
          onStartSlowCooldown={(sec) => setSlowCooldownLeft(sec)}
          isAdmin={isAdmin}
          smartReplies={smartReplies}
          onWalkieStart={handleWalkieStart}
          onWalkieStop={handleWalkieStop}
          walkieRecording={walkieRecording}
        />
      ) : (
        <Box
          sx={{
            flexShrink: 0,
            py: 2,
            px: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "action.hover",
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Only admins can send messages in this group.
          </Typography>
        </Box>
      )}

      <FileMenu
        anchorEl={fileMenuAnchor}
        chatId={chatId}
        activeTopic={activeTopic}
        onStartVoiceNote={() => setVoiceActive(true)}
        onOpenGifStudio={() => setShowGifStudio(true)}
        onOpenCreatePoll={() => setShowPollDialog(true)}
        onOpenMiniGame={() => setShowGameDialog(true)}
        onOpenWatchParty={() => setShowWatchParty(true)}
        onOpenWhiteboard={() => setShowWhiteboard(true)}
        onShareLiveLocation={() => setShowLocationDialog(true)}
        onOpenSchedule={() => setShowScheduleDialog(true)}
        onOpenWidgetDialog={() => setShowWidgetDialog(true)}
        enterToSend={enterToSend}
        onToggleEnterToSend={() => setEnterToSendPreference(!enterToSend)}
      />

      {showGameDialog && (
        <Suspense fallback={null}>
          <MiniGameDialog
            open={showGameDialog}
            onClose={() => setShowGameDialog(false)}
            chatId={chatId}
            activeTopic={activeTopic}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <WhiteboardDialog
          open={showWhiteboard}
          onClose={() => setShowWhiteboard(false)}
          chatId={chatId}
          socket={socket}
          currentUserId={myIdStr}
          onSendImage={handleSendGifFile}
          onRemoteInvite={(name) => setWhiteboardInviteName(name)}
        />
      </Suspense>

      {showScheduleDialog && (
        <Suspense fallback={null}>
          <ScheduleMessageDialog
            open={showScheduleDialog}
            onClose={() => setShowScheduleDialog(false)}
            chatId={chatId}
            activeTopic={activeTopic}
          />
        </Suspense>
      )}

      {showWidgetDialog && (
        <Suspense fallback={null}>
          <CreateWidgetDialog
            open={showWidgetDialog}
            onClose={() => setShowWidgetDialog(false)}
            chatId={chatId}
            activeTopic={activeTopic}
          />
        </Suspense>
      )}

      {bulkForwardOpen && (
        <Suspense fallback={null}>
          <ForwardMessageDialog
            open={bulkForwardOpen}
            onClose={() => {
              setBulkForwardOpen(false);
              setSelectedMsgIds([]);
            }}
            messageIds={selectedMsgIds}
          />
        </Suspense>
      )}

      <Dialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Delete {selectedMsgIds.length} Selected Message(s)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Remove selected messages only from your view, or for everyone where you are sender or group admin.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexDirection: "column", alignItems: "stretch", gap: 1, p: 2 }}>
          <Button variant="outlined" color="warning" disabled={isBulkDeleting} onClick={() => handleBulkDelete("me")}>
            Delete for Me
          </Button>
          <Button variant="contained" color="error" disabled={isBulkDeleting} onClick={() => handleBulkDelete("everyone")}>
            Delete for Everyone (Authorized)
          </Button>
          <Button color="inherit" onClick={() => setBulkDeleteOpen(false)}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      <ThreadDrawer
        open={Boolean(activeThreadMsg)}
        rootMessage={activeThreadMsg}
        chatId={chatId}
        members={members}
        socket={socket}
        onClose={() => setActiveThreadMsg(null)}
      />

      {/* Share Live Location Dialog (15m / 1h) */}
      <Dialog open={showLocationDialog} onClose={() => setShowLocationDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle fontWeight={700}>📍 Share Live Location</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={1.5}>
            Share a real-time updating location pin with ETA countdown.
          </Typography>
          <Stack direction="row" spacing={1}>
            {[15, 60].map((mins) => (
              <Chip
                key={mins}
                clickable
                label={mins === 60 ? "1 Hour" : "15 Minutes"}
                color={locationDuration === mins ? "primary" : "default"}
                variant={locationDuration === mins ? "filled" : "outlined"}
                onClick={() => setLocationDuration(mins)}
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowLocationDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleShareLocationSubmit} disabled={sharingLocation}>
            {sharingLocation ? "Locating..." : "Share Pin"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Group Topic Dialog */}
      <Dialog open={showTopicDialog} onClose={() => setShowTopicDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle fontWeight={700}>Create Group Topic</DialogTitle>
        <form onSubmit={handleAddTopicSubmit}>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Topic name"
              placeholder="e.g. announcements, gaming, homework"
              value={newTopicText}
              onChange={(e) => setNewTopicText(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowTopicDialog(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={!newTopicText.trim()}>
              Create
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {showGifStudio && (
        <Suspense fallback={null}>
          <GifStudioDialog
            open={showGifStudio}
            onClose={() => setShowGifStudio(false)}
            onSendGifFile={handleSendGifFile}
          />
        </Suspense>
      )}

      {showPollDialog && (
        <Suspense fallback={null}>
          <CreatePollDialog
            open={showPollDialog}
            onClose={() => setShowPollDialog(false)}
            chatId={chatId}
          />
        </Suspense>
      )}

      <ChatDetailsDrawer
        open={showInfo}
        onClose={() => setShowInfo(false)}
        chatId={chatId}
        isGroupChat={chatDetails?.data?.chat?.groupChat}
        onViewMemberProfile={setViewingUser}
      />

      {viewingUser && (
        <Suspense fallback={null}>
          <UserProfileDialog
            open={Boolean(viewingUser)}
            onClose={() => setViewingUser(null)}
            userId={viewingUser?._id || viewingUser?.id}
            initialUser={viewingUser}
          />
        </Suspense>
      )}
    </Box>
  );
};

export default Chat;
