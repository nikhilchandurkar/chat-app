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

import { orange } from "@mui/material/colors";
import { useDispatch } from "react-redux";
import {
  NEW_MESSAGE, START_TYPING, STOP_TYPING,
  MESSAGE_EDITED, MESSAGE_DELETED,
  MESSAGE_READ, MESSAGE_READ_UPDATE
} from "../constants/events";
import { useSocketEvents } from "../hooks/hook";
import { useChatDetailsQuery, useGetMessagesQuery } from "../redux/api/api";
import { setIsFileMenu } from "../redux/reducers/misc";
import ChatDetailsDrawer from "../components/specific/ChatDetailsDrawer";
import { getSocket } from "../socket";
import { useInfiniteScrollTop } from "6pp";

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

  const containerRef = useRef(null);
  const bottomRef = useRef(null);
  const messageRefs = useRef({});
  const typingTimeout = useRef(null);

  const [message, setMessage] = useState("");
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

  const { data: oldMessages, setData: setOldMessages } = useInfiniteScrollTop(
    containerRef,
    oldMessageChunk.data?.totalPages,
    page,
    setPage,
    oldMessageChunk.data?.messages
  );

  const members = chatDetails?.data?.chat?.members;

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
    setMessages((prev) => [...prev, data.message]);
  }, []);

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

  const messageReactedHandler = useCallback((data) => {
    if (data.chatId !== chatId) return;
    const patch = (msg) => {
      if (msg._id === data.messageId) {
        return { ...msg, reactions: data.reactions };
      }
      return msg;
    };
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, [chatId]);

  const messageReadUpdateHandler = useCallback((data) => {
    if (data.chatId !== chatId) return;
    const patch = (msg) => {
      if (data.messageIds.includes(msg._id)) {
        return { ...msg, readBy: [...(msg.readBy || []), data.readBy] };
      }
      return msg;
    };
    setMessages((prev) => prev.map(patch));
    setOldMessages((prev) => prev.map(patch));
  }, [chatId]);

  useSocketEvents(socket, {
    [NEW_MESSAGE]: newMessagesHandler,
    [START_TYPING]: startTypingListener,
    [STOP_TYPING]: stopTypingListener,
    [MESSAGE_EDITED]: messageEditedHandler,
    [MESSAGE_DELETED]: messageDeletedHandler,
    "MESSAGE_REACTED": messageReactedHandler,
    [MESSAGE_READ_UPDATE]: messageReadUpdateHandler,
  });

  const allMessages = [...(oldMessages || []), ...(messages || [])];
  
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
  const isRestricted = chat?.restrictedMessages;
  const isCreator = chat?.creator?.toString() === user?._id?.toString();
  const isAdmin = chat?.admins?.includes(user?._id?.toString()) || isCreator;
  const canSendMessages = !isRestricted || isAdmin;

  return chatDetails.isLoading ? <Skeleton /> : (
    <>
      {/* Pinned messages banner */}
      <PinnedMessages chatId={chatId} onScrollToMessage={handleScrollToMessage} />

      <Box sx={{ position: "relative", height: "90%", display: "flex", flexDirection: "column" }}>
        {/* Search overlay */}
        {showSearch && (
          <ChatSearch chatId={chatId} onScrollToMessage={handleScrollToMessage} onClose={() => setShowSearch(false)} />
        )}

        {/* Floating Top-Right Buttons */}
        <Stack direction="row" spacing={1} sx={{ position: "absolute", top: 8, right: 16, zIndex: 10 }}>
          <Tooltip title="Search messages">
            <IconButton 
              onClick={() => setShowSearch((s) => !s)} 
              sx={{ bgcolor: showSearch ? "primary.main" : "rgba(255,255,255,0.8)", color: showSearch ? "white" : "inherit", "&:hover": { bgcolor: "rgba(255,255,255,1)", color: "primary.main" } }}
            >
              <SearchIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Group Info & Media">
            <IconButton 
              onClick={() => setShowInfo(true)} 
              sx={{ bgcolor: "rgba(255,255,255,0.8)", "&:hover": { bgcolor: "rgba(255,255,255,1)" } }}
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
          bgcolor="rgba(247,247,247,1)"
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
          <Box sx={{ position: "absolute", bottom: "70px", left: "16px", zIndex: 200 }}>
            <Suspense fallback={null}>
              <EmojiPicker onEmojiClick={onEmojiClick} height={380} width={320} previewConfig={{ showPreview: false }} />
            </Suspense>
          </Box>
        </ClickAwayListener>
      )}

      {/* Input bar */}
      {canSendMessages ? (
        <Box sx={{ height: "10%", display: "flex", flexDirection: "column", justifyContent: "flex-end", position: "relative" }}>
          {replyingTo && (
            <Box sx={{ px: 2, py: 1, bgcolor: "rgba(0,0,0,0.05)", borderTop: "1px solid rgba(0,0,0,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box sx={{ overflow: "hidden" }}>
                <Typography variant="caption" color="primary" fontWeight="bold">Replying to {replyingTo.sender?.name}</Typography>
                <Typography variant="body2" sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{replyingTo.content}</Typography>
              </Box>
              <IconButton size="small" onClick={() => setReplyingTo(null)}>
                <AttachFileIcon sx={{ transform: "rotate(45deg)" }} />
              </IconButton>
            </Box>
          )}
          <form
            onSubmit={submitHandler}
            style={{ display: "flex", alignItems: "center", height: "100%" }}
          >
          <Stack direction="row" height="100%" padding="1rem" alignItems="center" position="relative" flex={1} gap={0.5}>
          {/* Emoji button */}
          <Tooltip title="Emoji">
            <IconButton onClick={() => setShowEmoji((s) => !s)} sx={{ color: showEmoji ? "primary.main" : "text.secondary" }}>
              <EmojiIcon />
            </IconButton>
          </Tooltip>

          {/* Attach file */}
          <IconButton onClick={handleFileOpen} sx={{ color: "secondary.main", rotate: "-30deg" }}>
            <AttachFileIcon />
          </IconButton>

          {/* Text input */}
          <input
            value={message}
            onChange={messageOnChange}
            placeholder="Type a message..."
            style={{
              flex: 1,
              height: "100%",
              border: "1px solid rgba(0,0,0,0.15)",
              outline: "none",
              padding: "0 1.5rem",
              borderRadius: "2rem",
              backgroundColor: "rgba(255,255,255,1)",
              boxShadow: "inset 0 1px 4px rgba(0,0,0,0.02)",
              fontSize: "0.95rem",
              color: "#333",
              minWidth: "0" // Prevents input from overflowing flex container
            }}
          />

          {/* Voice recorder */}
          <VoiceRecorder chatId={chatId} />



          {/* Send */}
          <IconButton
            type="submit"
            sx={{
              rotate: "-30deg",
              bgcolor: orange[500],
              color: "white",
              padding: "0.5rem",
              "&:hover": { bgcolor: "error.dark" },
            }}
          >
            <SendIcon />
          </IconButton>
        </Stack>
      </form>
      </Box>
      ) : (
        <Box sx={{ height: "10%", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(0,0,0,0.05)" }}>
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
    </>
  );
};

export default Chat;
