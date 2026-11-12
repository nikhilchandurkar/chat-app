import { Box, Chip, Divider, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { setActiveChatId, setIsDeleteMenu } from "../../redux/reducers/misc";
import {
  Archive as ArchiveIcon,
  CleaningServices as ClearIcon,
  Delete as DeleteIcon,
  ExitToApp as ExitToAppIcon,
  Folder as FolderIcon,
  MarkChatUnread as UnreadIcon,
  NotificationsActive as UnmuteIcon,
  NotificationsOff as MuteIcon,
  PushPin as PinIcon,
  Snooze as SnoozeIcon,
  Unarchive as UnarchiveIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAsyncMutation } from "../../hooks/hook";
import {
  useClearChatMutation,
  useDeleteChatMutation,
  useLeaveGroupMutation,
  useMarkChatUnreadMutation,
  useToggleArchiveChatMutation,
  useToggleMuteChatMutation,
  useTogglePinChatMutation,
} from "../../redux/api/api";
import { CHAT_FOLDER_EVENT, getChatFolders, toggleChatInFolder } from "../../utils/chatEnhancements";

const DeleteChatMenu = ({ dispatch, deleteMenuAnchor }) => {
  const navigate = useNavigate();

  const { isDeleteMenu, selectedDeleteChat } = useSelector((state) => state.misc);
  const { user } = useSelector((state) => state.auth);
  const userId = user?._id || user?.id;

  const [deleteChat, _, deleteChatData] = useAsyncMutation(useDeleteChatMutation);
  const [clearChat] = useClearChatMutation();
  const [leaveGroup, __, leaveGroupData] = useAsyncMutation(useLeaveGroupMutation);
  const [togglePinChat] = useTogglePinChatMutation();
  const [toggleMuteChat] = useToggleMuteChatMutation();
  const [markChatUnread] = useMarkChatUnreadMutation();
  const [toggleArchiveChat] = useToggleArchiveChatMutation();
  const [folders, setFolders] = useState(() => getChatFolders(userId));

  useEffect(() => {
    setFolders(getChatFolders(userId));
    const sync = () => setFolders(getChatFolders(userId));
    window.addEventListener(CHAT_FOLDER_EVENT, sync);
    return () => window.removeEventListener(CHAT_FOLDER_EVENT, sync);
  }, [userId, isDeleteMenu]);

  const isGroup = selectedDeleteChat.groupChat;
  const { chatId, isPinned, isMuted, isArchived } = selectedDeleteChat;

  const closeHandler = () => {
    dispatch(setIsDeleteMenu(false));
    deleteMenuAnchor.current = null;
  };

  const leaveGroupHandler = () => {
    closeHandler();
    leaveGroup("Leaving Group...", chatId);
  };

  const deleteChatHandler = () => {
    closeHandler();
    deleteChat("Deleting Chat...", chatId);
  };

  const handleTogglePin = async () => {
    closeHandler();
    try {
      const res = await togglePinChat(chatId).unwrap();
      toast.success(res.isPinned ? "Conversation pinned" : "Conversation unpinned");
    } catch {
      toast.error("Failed to update pin");
    }
  };

  const handleToggleMute = async (durationHours = undefined, muteFlag = undefined) => {
    closeHandler();
    try {
      const res = await toggleMuteChat({
        chatId,
        ...(durationHours !== undefined ? { durationHours, mute: true } : {}),
        ...(muteFlag !== undefined ? { mute: muteFlag } : {}),
      }).unwrap();
      if (!res.isMuted) toast.success("Notifications unmuted");
      else if (durationHours) toast.success(`Snoozed for ${durationHours}h`);
      else toast.success("Notifications muted");
    } catch {
      toast.error("Failed to update mute");
    }
  };

  const handleMarkUnread = async () => {
    closeHandler();
    try {
      await markChatUnread(chatId).unwrap();
      window.dispatchEvent(new CustomEvent("chitchat:mark-unread", { detail: { chatId } }));
      if (typeof window !== "undefined") {
        dispatch(setActiveChatId(null));
      }
      toast.success("Marked as unread");
    } catch {
      toast.error("Failed to mark as unread");
    }
  };

  const handleToggleArchive = async () => {
    closeHandler();
    try {
      const res = await toggleArchiveChat(chatId).unwrap();
      toast.success(res.isArchived ? "Conversation archived" : "Conversation unarchived");
    } catch {
      toast.error("Failed to update archive");
    }
  };

  const handleClearChat = async () => {
    closeHandler();
    try {
      await clearChat(chatId).unwrap();
      if (typeof window !== "undefined") {
        localStorage.removeItem(`chitchat_draft_${chatId}`);
        window.dispatchEvent(new CustomEvent("chitchat:chat-cleared", { detail: { chatId } }));
      }
      toast.success("Messages cleared for you");
    } catch {
      toast.error("Failed to clear chat");
    }
  };

  useEffect(() => {
    if (deleteChatData || leaveGroupData) {
      dispatch(setActiveChatId(null));
      navigate("/");
    }
  }, [deleteChatData, leaveGroupData, dispatch, navigate]);

  return (
    <Menu
      open={isDeleteMenu}
      onClose={closeHandler}
      anchorEl={deleteMenuAnchor.current}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
    >
      <MenuItem onClick={handleTogglePin} dense>
        <ListItemIcon><PinIcon fontSize="small" color={isPinned ? "primary" : "inherit"} /></ListItemIcon>
        <ListItemText>{isPinned ? "Unpin Chat" : "Pin to Top"}</ListItemText>
      </MenuItem>
      <MenuItem onClick={handleMarkUnread} dense>
        <ListItemIcon><UnreadIcon fontSize="small" color="primary" /></ListItemIcon>
        <ListItemText>Mark as Unread</ListItemText>
      </MenuItem>
      {isMuted ? (
        <MenuItem onClick={() => handleToggleMute(undefined, false)} dense>
          <ListItemIcon><UnmuteIcon fontSize="small" color="primary" /></ListItemIcon>
          <ListItemText>Unmute Notifications</ListItemText>
        </MenuItem>
      ) : (
        <>
          <MenuItem onClick={() => handleToggleMute(0, true)} dense>
            <ListItemIcon><MuteIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Mute Always</ListItemText>
          </MenuItem>
          <Box sx={{ px: 2, py: 0.5 }}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <SnoozeIcon sx={{ fontSize: 15, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary" mr={0.25}>Snooze:</Typography>
              {[1, 8, 24].map((h) => (
                <Chip
                  key={h}
                  size="small"
                  clickable
                  label={`${h}h`}
                  variant="outlined"
                  onClick={() => handleToggleMute(h, true)}
                  sx={{ height: 22, fontSize: "0.72rem" }}
                />
              ))}
            </Stack>
          </Box>
        </>
      )}
      {folders.length > 0 && (
        <Box sx={{ px: 2, py: 0.6 }}>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
            <FolderIcon sx={{ fontSize: 15, color: "text.secondary" }} />
            <Typography variant="caption" color="text.secondary">Folders:</Typography>
            {folders.map((f) => {
              const inFolder = (f.chatIds || []).map(String).includes(String(chatId));
              return (
                <Chip
                  key={f.id}
                  size="small"
                  clickable
                  label={inFolder ? `✓ ${f.name}` : f.name}
                  color={inFolder ? "primary" : "default"}
                  variant={inFolder ? "filled" : "outlined"}
                  onClick={() => setFolders(toggleChatInFolder(userId, f.id, chatId))}
                  sx={{ height: 22, fontSize: "0.72rem" }}
                />
              );
            })}
          </Stack>
        </Box>
      )}
      <MenuItem onClick={handleToggleArchive} dense>
        <ListItemIcon>
          {isArchived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
        </ListItemIcon>
        <ListItemText>{isArchived ? "Unarchive Chat" : "Archive Chat"}</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem onClick={handleClearChat} dense>
        <ListItemIcon><ClearIcon fontSize="small" color="warning" /></ListItemIcon>
        <ListItemText>Clear Chat (For Me)</ListItemText>
      </MenuItem>
      <MenuItem onClick={isGroup ? leaveGroupHandler : deleteChatHandler} dense sx={{ color: "error.main" }}>
        <ListItemIcon>
          {isGroup ? <ExitToAppIcon fontSize="small" color="error" /> : <DeleteIcon fontSize="small" color="error" />}
        </ListItemIcon>
        <ListItemText>{isGroup ? "Leave Group" : "Delete Chat (For Me)"}</ListItemText>
      </MenuItem>
    </Menu>
  );
};

export default DeleteChatMenu;
