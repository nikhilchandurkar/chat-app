import {
  AttachFile as AttachFileIcon,
  Send as SendIcon,
  Search as SearchIcon,
  EmojiEmotions as EmojiIcon,
  Info as InfoIcon,
} from "@mui/icons-material";
import { IconButton, Skeleton, Stack, Tooltip, Box, ClickAwayListener, Typography } from "@mui/material";
import React, { useCallback, useRef, useState, useEffect, lazy, Suspense } from "react";
import FileMenu from "../components/dialogs/FileMenu";
import TypingIndicator from "../components/specific/TypingIndicator";
import VoiceRecorder from "../components/specific/VoiceRecorder";
import ChatSearch from "../components/specific/ChatSearch";
import PinnedMessages from "../components/specific/PinnedMessages";
import AppLayout from "../components/layout/AppLayout";
import MessageComponent from "../components/shared/MessageComponent";
import UnreadDivider from "../components/shared/UnreadDivider";

import { useDispatch, useSelector } from "react-redux";
import {
  NEW_MESSAGE, START_TYPING, STOP_TYPING,
  MESSAGE_EDITED, MESSAGE_DELETED,
  MESSAGE_READ, MESSAGE_READ_UPDATE
} from "../constants/events";
import { useSocketEvents } from "../hooks/hook";
import { useChatDetailsQuery, useGetMessagesQuery } from "../redux/api/api";
import { setIsFileMenu } from "../redux/reducers/misc";
import ChatDetailsDrawer from "../components/specific/ChatDetailsDrawer";
import { getSocket } from "../socket.jsx";

// Lazy-load emoji picker (heavy component, ~200KB)
const EmojiPicker = lazy(() => import("emoji-picker-react"));

const LAST_SEEN_KEY = "chat_last_seen";

const getLastSeen = (chatId) => {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_SEEN_KEY) || "{}");
    return stored[chatId] ? new Date(stored[chatId]) : null;
  } catch { return null; }
};

const setLastSeen = (chatId) => {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_SEEN_KEY) || "{}");
    stored[chatId] = new Date().toISOString();
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(stored));
  } catch { }
};

const Chat = ({ chatId, user }) => {
  const dispatch = useDispatch();
  const socket = getSocket();
  const { themeMode } = useSelector((state) => state.misc);
  const isDark = themeMode === "dark";

  const containerRef = useRef(null);
  const bottomRef = useRef(null);
  const messageRefs = useRef({});
  const typingTimeout = useRef(null);

  const [message, setMessage] = useState("");
  const [oldMessages, setOldMessages] = useState([]);
  const [messages, setMessages] = useState([]);
  const [page, setPage] = useState(1);
  const [fileMenuAnchor, setFileMenuAnchor] = useState(null);
  const [userTyping, setUserTyping] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [unreadIndex, setUnreadIndex] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);

  const chatDetails = useChatDetailsQuery({ chatId, populate: true }, { skip: !chatId });
  const oldMessageChunk = useGetMessagesQuery({ chatId, page }, { skip: !chatId });

  const members = chatDetails?.data?.chat?.members;

  // Reset all local message and draft states whenever chatId changes
  useEffect(() => {
    setOldMessages([]);
    setMessages([]);
    setPage(1);
    setMessage("");
    setUserTyping(false);
    setReplyingTo(null);
  }, [chatId]);

  // Keep oldMessages cleanly synced with the active chat's data only
  useEffect(() => {
    if (!oldMessageChunk.data?.messages) return;
    const incoming = oldMessageChunk.data.messages;
    if (page === 1) {
      setOldMessages(incoming);
    } else {
      setOldMessages((prev) => {
        const existingIds = new Set(prev.map((m) => String(m._id || m.id)));
        const uniqueOlder = incoming.filter((m) => !existingIds.has(String(m._id || m.id)));
        return [...uniqueOlder, ...prev];
      });
    }
  }, [chatId, page, oldMessageChunk.data?.messages]);

  // Infinite scroll upwards listener without accumulating cross-chat messages
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let debounceTimer = null;
    const handleScroll = () => {
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

  // Calculate unread divider index when old messages first load
  useEffect(() => {
    if (!oldMessages?.length) return;
    const lastSeen = getLastSeen(chatId);
    if (!lastSeen) {
      setUnreadIndex(null);
      return;
    }
    const firstUnread = oldMessages.findIndex(
      (m) => m.createdAt && new Date(m.createdAt) > lastSeen
    );
    setUnreadIndex(firstUnread >= 0 ? firstUnread : null);
  }, [chatId, oldMessages?.length]);

  // Update last seen when leaving or on mount
  useEffect(() => {
    return () => { if (chatId) setLastSeen(chatId); };
  }, [chatId]);

  const submitHandler = (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    socket.emit(NEW_MESSAGE, { chatId, members, message, replyTo: replyingTo });
    setMessage("");
    setShowEmoji(false);
    setReplyingTo(null);
  };

  const onEmojiClick = useCallback((emojiData) => {
    setMessage((prev) => prev + emojiData.emoji);
  }, []);

  const messageOnChange = (e) => {
    setMessage(e.target.value);
    socket.emit(START_TYPING, { members, chatId });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit(STOP_TYPING, { members, chatId });
    }, 2000);
  };

  const handleFileOpen = (e) => {
    dispatch(setIsFileMenu(true));
    setFileMenuAnchor(e.currentTarget);
  };

  const newMessagesHandler = useCallback((data) => {
    if (!data) return;
    const targetChatId = data.chatId || data.conversation_id;
    if (targetChatId && String(targetChatId) !== String(chatId)) return;
    const msg = data.message || data;
    if (msg && msg._id) {
      setMessages((prev) => {
        if (prev.some((m) => String(m._id) === String(msg._id))) return prev;
        return [...prev, msg];
      });
    }
  }, [chatId]);

  const messageEditedHandler = useCallback((data) => {
    const patch = (m) => m._id === data.messageId ? { ...m, content: data.content, isEdited: true } : m;
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, [setOldMessages]);

  const messageDeletedHandler = useCallback((data) => {
    const patch = (m) => m._id === data.messageId ? { ...m, isDeleted: true, content: "" } : m;
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, [setOldMessages]);

  const handleLocalEdit = useCallback((messageId, newContent) => {
    const patch = (m) => m._id === messageId ? { ...m, content: newContent, isEdited: true } : m;
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, [setOldMessages]);

  const handleLocalDelete = useCallback((messageId) => {
    const patch = (m) => m._id === messageId ? { ...m, isDeleted: true, content: "" } : m;
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, [setOldMessages]);

  const handleScrollToMessage = useCallback((messageId) => {
    setShowSearch(false);
    const el = messageRefs.current[messageId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const startTypingListener = useCallback((data) => {
    if (data.chatId !== chatId) return;
    setUserTyping(true);
  }, [chatId]);

  const stopTypingListener = useCallback((data) => {
    if (data.chatId !== chatId) return;
    setUserTyping(false);
  }, [chatId]);

  const handleLocalReact = useCallback((messageId, reactions) => {
    const patch = (msg) => {
      if (String(msg._id) === String(messageId)) {
        return { ...msg, reactions };
      }
      return msg;
    };
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, [setOldMessages]);

  const messageReactedHandler = useCallback((data) => {
    if (!data) return;
    const targetChatId = data.chatId || data.conversation_id;
    if (targetChatId && String(targetChatId) !== String(chatId)) return;
    const targetMsgId = data.messageId || data.message_id;
    const reactions = data.reactions || [];
    const patch = (msg) => {
      if (String(msg._id) === String(targetMsgId)) {
        return { ...msg, reactions };
      }
      return msg;
    };
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, [chatId, setOldMessages]);

  const messageReadUpdateHandler = useCallback((data) => {
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
  }, [chatId, setOldMessages]);

  useSocketEvents(socket, {
    [NEW_MESSAGE]: newMessagesHandler,
    [START_TYPING]: startTypingListener,
    [STOP_TYPING]: stopTypingListener,
    [MESSAGE_EDITED]: messageEditedHandler,
    [MESSAGE_DELETED]: messageDeletedHandler,
    "MESSAGE_REACTED": messageReactedHandler,
    "message.reaction": messageReactedHandler,
    [MESSAGE_READ_UPDATE]: messageReadUpdateHandler,
  });

  const oldIds = new Set(oldMessages.map((m) => String(m._id || m.id)));
  const uniqueRealtime = messages.filter((m) => !oldIds.has(String(m._id || m.id)));
  const allMessages = [...oldMessages, ...uniqueRealtime];
  
  // Mark messages as read when they appear
  useEffect(() => {
    if (!allMessages.length || !user) return;
    const unreadMessageIds = allMessages
      .filter((m) => m.sender?._id !== user._id && !(m.readBy || []).includes(user._id))
      .map((m) => m._id);

    if (unreadMessageIds.length > 0) {
      socket.emit(MESSAGE_READ, { chatId, members, messageIds: unreadMessageIds });
      // Optimistically update locally
      const patch = (msg) => {
        if (unreadMessageIds.includes(msg._id)) {
          return { ...msg, readBy: [...(msg.readBy || []), user._id] };
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
  const isRestricted = isGroupChat && Boolean(chat?.restrictedMessages);
  const isCreator =
    chat?.creator?.toString() === user?._id?.toString() ||
    chat?.creator?.toString() === user?.id?.toString();
  const isAdmin =
    isCreator ||
    chat?.admins?.includes(user?._id?.toString()) ||
    chat?.admins?.includes(user?.id?.toString());
  const canSendMessages = !isRestricted || isAdmin;

  return chatDetails.isLoading ? (
    <Skeleton variant="rectangular" height="100%" width="100%" />
  ) : (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Pinned messages banner */}
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
        {/* Search overlay */}
        {showSearch && (
          <ChatSearch chatId={chatId} onScrollToMessage={handleScrollToMessage} onClose={() => setShowSearch(false)} />
        )}

        {/* Floating Top-Right Buttons */}
        <Stack direction="row" spacing={1} sx={{ position: "absolute", top: 8, right: 16, zIndex: 10 }}>
          <Tooltip title="Search messages">
            <IconButton 
              onClick={() => setShowSearch((s) => !s)} 
              sx={{ bgcolor: showSearch ? "primary.main" : "rgba(255,255,255,0.85)", color: showSearch ? "white" : "inherit", boxShadow: 1, "&:hover": { bgcolor: "rgba(255,255,255,1)", color: "primary.main" } }}
            >
              <SearchIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Group Info & Media">
            <IconButton 
              onClick={() => setShowInfo(true)} 
              sx={{ bgcolor: "rgba(255,255,255,0.85)", boxShadow: 1, "&:hover": { bgcolor: "rgba(255,255,255,1)" } }}
            >
              <InfoIcon color="primary" />
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Message list */}
        <Stack
          ref={containerRef}
          boxSizing="border-box"
          padding="1rem"
          spacing="0.75rem"
          bgcolor={isDark ? "#171A18" : "#F7F8F6"}
          flex={1}
          sx={{ overflowX: "hidden", overflowY: "auto" }}
        >
          {allMessages.map((value, idx) => (
            <React.Fragment key={value._id}>
              {/* Unread divider */}
              {unreadIndex !== null && idx === unreadIndex && (
                <UnreadDivider count={unreadCount} />
              )}
              <div 
                ref={(el) => { if (el) messageRefs.current[value._id] = el; }}
                style={{ display: "flex", justifyContent: value.sender?._id === user?._id ? "flex-end" : "flex-start" }}
              >
                <MessageComponent
                  message={value}
                  user={user}
                  chatId={chatId}
                  isGroupAdmin={chatDetails?.data?.chat?.creator?.toString() === user?._id?.toString()}
                  onEdit={handleLocalEdit}
                  onDelete={handleLocalDelete}
                  onReply={() => setReplyingTo(value)}
                  onReact={handleLocalReact}
                />
              </div>
            </React.Fragment>
          ))}

          {userTyping && <TypingIndicator />}
          <div ref={bottomRef} />
        </Stack>
      </Box>

      {/* Emoji Picker Popup */}
      {showEmoji && canSendMessages && (
        <ClickAwayListener onClickAway={() => setShowEmoji(false)}>
          <Box sx={{ position: "absolute", bottom: "75px", left: "16px", zIndex: 200 }}>
            <Suspense fallback={null}>
              <EmojiPicker onEmojiClick={onEmojiClick} height={380} width={320} previewConfig={{ showPreview: false }} />
            </Suspense>
          </Box>
        </ClickAwayListener>
      )}

      {/* Input bar - Always pinned at bottom */}
      {canSendMessages ? (
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
            <Box sx={{ px: 2, py: 1, bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", borderBottom: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box sx={{ overflow: "hidden" }}>
                <Typography variant="caption" color="primary" fontWeight="bold">Replying to {replyingTo.sender?.name || "User"}</Typography>
                <Typography variant="body2" sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{replyingTo.content}</Typography>
              </Box>
              <IconButton size="small" onClick={() => setReplyingTo(null)}>
                <AttachFileIcon sx={{ transform: "rotate(45deg)" }} />
              </IconButton>
            </Box>
          )}
          <form
            onSubmit={submitHandler}
            style={{ display: "flex", alignItems: "center", width: "100%" }}
          >
            <Stack direction="row" width="100%" px={2} py={1.5} alignItems="center" position="relative" flex={1} gap={1}>
              {/* Emoji button */}
              <Tooltip title="Emoji">
                <IconButton onClick={() => setShowEmoji((s) => !s)} sx={{ color: showEmoji ? "primary.main" : "text.secondary" }}>
                  <EmojiIcon />
                </IconButton>
              </Tooltip>

              {/* Attach file */}
              <Tooltip title="Attach File">
                <IconButton onClick={handleFileOpen} sx={{ color: "secondary.main", rotate: "-30deg" }}>
                  <AttachFileIcon />
                </IconButton>
              </Tooltip>

              {/* Text input */}
              <input
                value={message}
                onChange={messageOnChange}
                placeholder="Type a message..."
                style={{
                  flex: 1,
                  height: "44px",
                  border: isDark ? "1px solid #343B36" : "1px solid #E3E6E1",
                  outline: "none",
                  padding: "0 1rem",
                  borderRadius: "8px",
                  backgroundColor: isDark ? "#202522" : "#FFFFFF",
                  fontSize: "0.95rem",
                  color: isDark ? "#F1F3F0" : "#202421",
                  minWidth: "0",
                }}
              />

              {/* Voice recorder */}
              <VoiceRecorder chatId={chatId} />

              {/* Send */}
              <IconButton
                type="submit"
                aria-label="Send message"
                sx={{
                  bgcolor: "#236B4A",
                  color: "#FFFFFF",
                  borderRadius: "8px",
                  width: "44px",
                  height: "44px",
                  flexShrink: 0,
                  "&:hover": { bgcolor: "#1B573C" },
                }}
              >
                <SendIcon sx={{ fontSize: "1.2rem" }} />
              </IconButton>
            </Stack>
          </form>
        </Box>
      ) : (
        <Box sx={{ flexShrink: 0, py: 2, px: 3, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "action.hover", borderTop: "1px solid", borderColor: "divider" }}>
          <Typography variant="body2" color="text.secondary">
            Only admins can send messages in this group.
          </Typography>
        </Box>
      )}

      <FileMenu anchorEl={fileMenuAnchor} chatId={chatId} />

      {/* Drawer for Info and Media Gallery */}
      <ChatDetailsDrawer 
        open={showInfo} 
        onClose={() => setShowInfo(false)} 
        chatId={chatId} 
        isGroupChat={chatDetails?.data?.chat?.groupChat} 
      />
    </Box>
  );
};

export default Chat;
