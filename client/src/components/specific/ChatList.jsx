import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Archive as ArchiveIcon,
  Bookmark as VaultIcon,
  Close as CloseIcon,
  Folder as FolderIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";
import { useOpenSavedMessagesMutation } from "../../redux/api/api";
import { setActiveChatId, setIsMobile, setIsNewGroup, setIsSearch } from "../../redux/reducers/misc";
import {
  CHAT_FOLDER_EVENT,
  createChatFolder,
  deleteChatFolder,
  getChatFolders,
} from "../../utils/chatEnhancements";
import ChatItem from "../shared/ChatItem";
import StatusSection from "./StatusSection";

const GlobalMessageSearchDialog = lazy(() => import("../dialogs/GlobalMessageSearchDialog"));

const checkMemberOnline = (members, onlineSet) => {
  if (!members || !onlineSet || onlineSet.size === 0) return false;
  for (const member of members) {
    const memberId =
      typeof member === "object" && member !== null
        ? String(member._id || member.id || member.user_id || "")
        : String(member || "");
    if (memberId && onlineSet.has(memberId)) return true;
  }
  return false;
};

const ChatList = ({
  w = "100%",
  chats = [],
  chatId,
  onlineUsers = [],
  newMessagesAlert = [],
  typingChats = [],
  handleDeleteChat,
}) => {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const userId = user?._id || user?.id;
  const [filterMode, setFilterMode] = useState("all");
  const [draftTick, setDraftTick] = useState(0);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [folders, setFolders] = useState(() => getChatFolders(userId));
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [openSavedMessages, { isLoading: isOpeningVault }] = useOpenSavedMessagesMutation();

  const onlineUserSet = useMemo(() => {
    if (!onlineUsers) return new Set();
    if (onlineUsers instanceof Set) return onlineUsers;
    const s = new Set();
    if (Array.isArray(onlineUsers)) {
      for (const u of onlineUsers) {
        if (typeof u === "object" && u !== null) {
          const uid = String(u.user_id || u.id || u._id || "");
          if (uid && u.status !== "offline") s.add(uid);
        } else if (u) {
          s.add(String(u));
        }
      }
    } else if (typeof onlineUsers === "object") {
      for (const [k, v] of Object.entries(onlineUsers)) {
        if (v && v !== "offline") s.add(String(k));
      }
    }
    return s;
  }, [onlineUsers]);

  const newMessagesAlertMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(newMessagesAlert)) {
      for (const alert of newMessagesAlert) {
        if (alert?.chatId) map.set(alert.chatId, alert);
      }
    }
    return map;
  }, [newMessagesAlert]);

  const typingChatsSet = useMemo(() => {
    return new Set(Array.isArray(typingChats) ? typingChats : []);
  }, [typingChats]);

  useEffect(() => {
    setFolders(getChatFolders(userId));
    const syncFolders = () => setFolders(getChatFolders(userId));
    window.addEventListener(CHAT_FOLDER_EVENT, syncFolders);
    return () => window.removeEventListener(CHAT_FOLDER_EVENT, syncFolders);
  }, [userId]);

  const handleOpenSavedVault = async () => {
    try {
      const res = await openSavedMessages().unwrap();
      if (res?.chatId) {
        dispatch(setActiveChatId(res.chatId));
        dispatch(setIsMobile(false));
      }
    } catch {
      toast.error("Could not open Saved Messages");
    }
  };

  useEffect(() => {
    const bump = () => setDraftTick((t) => t + 1);
    window.addEventListener("chitchat:drafts-updated", bump);
    return () => window.removeEventListener("chitchat:drafts-updated", bump);
  }, []);

  const { activeChats, unreadChats, groupChats, directChats, archivedChats } = useMemo(() => {
    const active = [];
    const unread = [];
    const groups = [];
    const direct = [];
    const archived = [];
    for (const c of chats || []) {
      if (c.isArchived) {
        archived.push(c);
      } else {
        active.push(c);
        const liveAlert = Array.isArray(newMessagesAlert)
          ? newMessagesAlert.find((a) => String(a.chatId) === String(c._id))
          : null;
        if (Number(c.unreadCount || 0) > 0 || Number(liveAlert?.count || 0) > 0) {
          unread.push(c);
        }
        if (c.groupChat) {
          groups.push(c);
        } else if (!c.isSavedMessages) {
          direct.push(c);
        }
      }
    }
    return { activeChats: active, unreadChats: unread, groupChats: groups, directChats: direct, archivedChats: archived };
  }, [chats, newMessagesAlert]);

  const activeFolder = folders.find((f) => f.id === filterMode);
  const showArchived = filterMode === "archived";
  const displayedChats = activeFolder
    ? activeChats.filter((c) => (activeFolder.chatIds || []).map(String).includes(String(c._id)))
    : filterMode === "archived"
    ? archivedChats
    : filterMode === "unread"
    ? unreadChats
    : filterMode === "groups"
    ? groupChats
    : filterMode === "direct"
    ? directChats
    : activeChats;

  return (
    <Stack width={w} direction="column" overflow="auto" height="100%">
      <StatusSection />

      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ px: 1.5, pt: 0.75, pb: 0.25, flexShrink: 0 }}>
        <Button
          fullWidth
          size="small"
          variant="outlined"
          startIcon={<SearchIcon fontSize="small" />}
          onClick={() => setGlobalSearchOpen(true)}
          sx={{
            justifyContent: "flex-start",
            borderRadius: 2,
            textTransform: "none",
            color: "text.secondary",
            borderColor: "divider",
            bgcolor: "action.hover",
            py: 0.55,
            minWidth: 0,
          }}
        >
          Search messages...
        </Button>
        <Tooltip title="Saved Messages Vault (personal notes & files across devices)">
          <Button
            size="small"
            variant="outlined"
            color="info"
            startIcon={<VaultIcon fontSize="small" />}
            disabled={isOpeningVault}
            onClick={handleOpenSavedVault}
            sx={{ borderRadius: 2, textTransform: "none", flexShrink: 0, py: 0.55 }}
          >
            Saved
          </Button>
        </Tooltip>
      </Stack>

      {chats.length > 0 && (
        <Stack
          direction="row"
          spacing={0.6}
          alignItems="center"
          sx={{
            px: 1.5,
            py: 0.75,
            borderBottom: "1px solid",
            borderColor: "divider",
            overflowX: "auto",
            flexShrink: 0,
          }}
        >
          <Chip
            size="small"
            clickable
            label={`All (${activeChats.length})`}
            color={filterMode === "all" ? "primary" : "default"}
            variant={filterMode === "all" ? "filled" : "outlined"}
            onClick={() => setFilterMode("all")}
          />
          <Chip
            size="small"
            clickable
            label={`Unread (${unreadChats.length})`}
            color={filterMode === "unread" ? "primary" : "default"}
            variant={filterMode === "unread" ? "filled" : "outlined"}
            onClick={() => setFilterMode("unread")}
          />
          <Chip
            size="small"
            clickable
            label={`Direct (${directChats.length})`}
            color={filterMode === "direct" ? "primary" : "default"}
            variant={filterMode === "direct" ? "filled" : "outlined"}
            onClick={() => setFilterMode("direct")}
          />
          <Chip
            size="small"
            clickable
            label={`Groups (${groupChats.length})`}
            color={filterMode === "groups" ? "primary" : "default"}
            variant={filterMode === "groups" ? "filled" : "outlined"}
            onClick={() => setFilterMode("groups")}
          />
          {archivedChats.length > 0 && (
            <Chip
              size="small"
              icon={<ArchiveIcon sx={{ fontSize: 14 }} />}
              label={`Archived (${archivedChats.length})`}
              clickable
              color={filterMode === "archived" ? "primary" : "default"}
              variant={filterMode === "archived" ? "filled" : "outlined"}
              onClick={() => setFilterMode("archived")}
            />
          )}
          {folders.map((fld) => (
            <Chip
              key={fld.id}
              size="small"
              icon={<FolderIcon sx={{ fontSize: 14 }} />}
              label={fld.name}
              clickable
              color={filterMode === fld.id ? "primary" : "default"}
              variant={filterMode === fld.id ? "filled" : "outlined"}
              onClick={() => setFilterMode(fld.id)}
              onDelete={
                filterMode === fld.id
                  ? () => {
                      setFolders(deleteChatFolder(userId, fld.id));
                      setFilterMode("all");
                    }
                  : undefined
              }
            />
          ))}
          <Chip
            size="small"
            clickable
            icon={<AddIcon sx={{ fontSize: 14 }} />}
            label="Folder"
            variant="outlined"
            onClick={() => setFolderDialogOpen(true)}
          />
        </Stack>
      )}

      {displayedChats.length > 0 ? (
        displayedChats.map((data, index) => {
          const { avatar, _id, name, groupChat, isSavedMessages, members, memberNames, isPinned, isMuted, isArchived, unreadCount, lastMessage } = data;
          const newMessageAlert = newMessagesAlertMap.get(_id);
          const isOnline = checkMemberOnline(members, onlineUserSet);
          const isTyping = typingChatsSet.has(_id);

          return (
            <ChatItem
              index={index}
              draftTick={draftTick}
              newMessageAlert={newMessageAlert}
              unreadCount={unreadCount}
              lastMessage={lastMessage}
              isOnline={isOnline}
              isTyping={isTyping}
              avatar={avatar}
              name={name}
              _id={_id}
              key={_id}
              groupChat={groupChat}
              isSavedMessages={Boolean(isSavedMessages)}
              isPinned={isPinned}
              isMuted={isMuted}
              isArchived={isArchived}
              sameSender={chatId === _id}
              handleDeleteChat={handleDeleteChat}
              memberNames={memberNames}
            />
          );
        })
      ) : (
        <Stack alignItems="center" justifyContent="center" flex={1} color="text.secondary" spacing={1.5} p={2.5}>
          <Typography variant="body1" fontWeight={600}>
            {showArchived ? "No archived conversations" : "No conversations yet"}
          </Typography>
          {!showArchived && (
            <>
              <Typography variant="caption" textAlign="center">
                Find friends or start a group to begin chatting.
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" onClick={() => dispatch(setIsSearch(true))}>
                  Find People
                </Button>
                <Button size="small" variant="outlined" onClick={() => dispatch(setIsNewGroup(true))}>
                  New Group
                </Button>
              </Stack>
            </>
          )}
        </Stack>
      )}

      {globalSearchOpen && (
        <Suspense fallback={null}>
          <GlobalMessageSearchDialog open={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />
        </Suspense>
      )}

      <Dialog open={folderDialogOpen} onClose={() => setFolderDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.25 }}>
          <Typography variant="subtitle1" fontWeight={700}>New Chat Folder</Typography>
          <IconButton size="small" onClick={() => setFolderDialogOpen(false)} aria-label="Close">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const clean = newFolderName.trim();
            if (!clean) return;
            const next = createChatFolder(userId, clean);
            setFolders(next);
            const created = next.find((f) => f.name.toLowerCase() === clean.toLowerCase());
            if (created) setFilterMode(created.id);
            setNewFolderName("");
            setFolderDialogOpen(false);
            toast.success(`Folder "${clean}" created — use any chat's ⋮ menu to add chats`);
          }}
        >
          <DialogContent sx={{ pt: 0.5 }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Folder name (e.g. Work, Family, Study)"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
          </DialogContent>
          <DialogActions sx={{ px: 2.5, pb: 2 }}>
            <Button onClick={() => setFolderDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={!newFolderName.trim()}>
              Create
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Stack>
  );
};

export default ChatList;
