import {
  ArrowBack as BackIcon,
  AttachFile as AttachFileIcon,
  AutoAwesome as SparkleIcon,
  Close as CloseIcon,
  EmojiEmotions as EmojiIcon,
  Info as InfoIcon,
  KeyboardArrowDown as ScrollDownIcon,
  Search as SearchIcon,
  Send as SendIcon,
} from "@mui/icons-material";
import {
  Avatar,
  Box,
  ClickAwayListener,
  Fab,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useCallback, useMemo, useRef, useState, useEffect, lazy, Suspense } from "react";
import toast from "react-hot-toast";
import FileMenu from "../components/dialogs/FileMenu";
import TypingIndicator from "../components/specific/TypingIndicator";
import VoiceRecorder from "../components/specific/VoiceRecorder";
import ChatSearch from "../components/specific/ChatSearch";
import PinnedMessages from "../components/specific/PinnedMessages";
import MessageComponent from "../components/shared/MessageComponent";
import UnreadDivider from "../components/shared/UnreadDivider";
import { transformImage } from "../lib/feature";
import EmojiBurst from "../components/shared/EmojiBurst";

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
import { useChatDetailsQuery, useGetMessagesQuery } from "../redux/api/api";
import { setIsFileMenu, setIsMobile, toggleTheme } from "../redux/reducers/misc";
import ChatDetailsDrawer from "../components/specific/ChatDetailsDrawer";
import { getSocket } from "../socket.jsx";
import {
  extractBurstEmoji,
  getShakeAction,
  isEnterToSendEnabled,
  isShakeEnabled,
  PREFS_EVENT,
  setEnterToSendPreference,
  triggerHaptic,
} from "../utils/feedback";

// Lazy-load emoji picker (heavy component, ~200KB)
const EmojiPicker = lazy(() => import("emoji-picker-react"));
const UserProfileDialog = lazy(() => import("../components/dialogs/UserProfileDialog"));

const QUICK_EMOJIS = ["❤️", "🔥", "😂", "👍", "🙏", "🎉", "😍", "🥳", "🚀", "👏"];
const LAST_SEEN_KEY = "chat_last_seen";

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
  }) => {
    const [message, setMessage] = useState("");
    const [showEmoji, setShowEmoji] = useState(false);
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
      setMessage("");
      setShowEmoji(false);
      lastTypingEmit.current = 0;
      if (inputRef.current) {
        inputRef.current.style.height = "40px";
      }
    }, [chatId]);

    useEffect(() => {
      if (replyingTo) {
        inputRef.current?.focus();
      }
    }, [replyingTo]);

    useEffect(() => {
      resizeTextarea();
    }, [message, resizeTextarea]);

    const doSend = useCallback(() => {
      if (!message.trim()) return;
      const clean = message.trim();
      const burstEm = extractBurstEmoji(clean);
      if (burstEm) {
        onCelebrateSend?.(burstEm);
      }
      triggerHaptic(10);
      socket.emit(NEW_MESSAGE, { chatId, members, message: clean, replyTo: replyingTo });
      setMessage("");
      setShowEmoji(false);
      onClearReply();
      lastTypingEmit.current = 0;
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      socket.emit(STOP_TYPING, { members, chatId });
    }, [chatId, members, message, onCelebrateSend, onClearReply, replyingTo, socket]);

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
      setMessage(e.target.value);
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
              <VoiceRecorder chatId={chatId} autoStart onCancel={onCancelVoice} />
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

                  <Tooltip title="Attach files or record voice note">
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

                <Tooltip title={enterToSend ? "Send message (Enter)" : "Tap to send message"}>
                  <IconButton
                    type="submit"
                    disabled={!hasText}
                    aria-label="Send message"
                    sx={{
                      bgcolor: hasText ? "#236B4A" : isDark ? "#2C332E" : "#E5EAE6",
                      color: hasText ? "#FFFFFF" : "text.disabled",
                      borderRadius: "50%",
                      width: "40px",
                      height: "40px",
                      flexShrink: 0,
                      transition: "all 0.16s ease",
                      "&:hover": { bgcolor: hasText ? "#1B573C" : undefined, transform: hasText ? "scale(1.04)" : "none" },
                    }}
                  >
                    <SendIcon sx={{ fontSize: "1.15rem", ml: "2px" }} />
                  </IconButton>
                </Tooltip>
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

  const chatDetails = useChatDetailsQuery({ chatId, populate: true }, { skip: !chatId });
  const oldMessageChunk = useGetMessagesQuery({ chatId, page }, { skip: !chatId });

  const members = chatDetails?.data?.chat?.members;

  const spawnChatBurst = useCallback((emoji = "🎉") => {
    const id = ++burstCounterRef.current;
    setChatBursts((prev) => [...prev.slice(-4), { id, emoji, x: "50%", y: "65%" }]);
    setTimeout(() => {
      setChatBursts((prev) => prev.filter((b) => b.id !== id));
    }, 950);
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
      spawnChatBurst("🎉");
      spawnChatBurst("✨");
      toast("Emoji Wave!", { icon: "✨" });
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
    nearBottomRef.current = true;
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
        const burstEm = extractBurstEmoji(msg.content);
        if (burstEm) spawnChatBurst(burstEm);
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
    const patch = (m) => (m._id === data.messageId ? { ...m, content: data.content, isEdited: true } : m);
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, []);

  const messageDeletedHandler = useCallback((data) => {
    const patch = (m) => (m._id === data.messageId ? { ...m, isDeleted: true, content: "" } : m);
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, []);

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

  const handleScrollToMessage = useCallback((messageId) => {
    setShowSearch(false);
    const el = messageRefs.current[messageId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
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
      const patch = (msg) => {
        if (msgIds.includes(String(msg._id))) {
          return { ...msg, readBy: [...(msg.readBy || []), data.readBy] };
        }
        return msg;
      };
      setMessages((prev) => prev.map(patch));
      setOldMessages((prev) => prev.map(patch));
    },
    [chatId]
  );

  useSocketEvents(socket, {
    [NEW_MESSAGE]: newMessagesHandler,
    [START_TYPING]: startTypingListener,
    [STOP_TYPING]: stopTypingListener,
    [MESSAGE_EDITED]: messageEditedHandler,
    [MESSAGE_DELETED]: messageDeletedHandler,
    MESSAGE_REACTED: messageReactedHandler,
    "message.reaction": messageReactedHandler,
    [MESSAGE_READ_UPDATE]: messageReadUpdateHandler,
  });

  const allMessages = useMemo(() => {
    const oldIds = new Set(oldMessages.map((m) => String(m._id || m.id)));
    const uniqueRealtime = messages.filter((m) => !oldIds.has(String(m._id || m.id)));
    return [...oldMessages, ...uniqueRealtime];
  }, [oldMessages, messages]);

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

  const chat = chatDetails?.data?.chat;
  const isGroupChat = Boolean(chat?.groupChat);
  const myIdStr = String(user?._id || user?.id || "");
  const otherMember = !isGroupChat && Array.isArray(members)
    ? members.find((m) => String(m?._id || m?.id || m) !== myIdStr)
    : null;
  const chatDisplayName =
    (isGroupChat ? chat?.name : otherMember?.name || otherMember?.username || chat?.name) || "Conversation";
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
              src={chatAvatarSrc}
              alt={chatDisplayName}
              sx={{ width: 34, height: 34, bgcolor: "#236B4A", fontSize: "0.95rem", flexShrink: 0 }}
            >
              {chatDisplayName[0]?.toUpperCase() || "C"}
            </Avatar>
            <Box minWidth={0}>
              <Typography variant="subtitle2" fontWeight={700} noWrap>
                {chatDisplayName}
              </Typography>
              <Typography variant="caption" color={userTyping ? "primary" : "text.secondary"} noWrap display="block">
                {userTyping ? "Typing..." : "Hold or swipe messages · Tap for info"}
              </Typography>
            </Box>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={0.25} flexShrink={0}>
          <Tooltip title="Emoji Burst Wave">
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
          <ChatSearch chatId={chatId} onScrollToMessage={handleScrollToMessage} onClose={() => setShowSearch(false)} />
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
          }}
          spacing="0.65rem"
          bgcolor={isDark ? "#171A18" : "#F7F8F6"}
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
                    isGroupAdmin={isAdmin}
                    onEdit={handleLocalEdit}
                    onDelete={handleLocalDelete}
                    onReply={handleSetReply}
                    onReact={handleLocalReact}
                    onViewProfile={setViewingUser}
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
        onStartVoiceNote={() => setVoiceActive(true)}
        enterToSend={enterToSend}
        onToggleEnterToSend={() => setEnterToSendPreference(!enterToSend)}
      />

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
