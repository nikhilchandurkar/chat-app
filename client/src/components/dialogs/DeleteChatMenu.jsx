import { Divider, ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { setActiveChatId, setIsDeleteMenu } from "../../redux/reducers/misc";
import {
  Archive as ArchiveIcon,
  CleaningServices as ClearIcon,
  Delete as DeleteIcon,
  ExitToApp as ExitToAppIcon,
  NotificationsActive as UnmuteIcon,
  NotificationsOff as MuteIcon,
  PushPin as PinIcon,
  Unarchive as UnarchiveIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAsyncMutation } from "../../hooks/hook";
import {
  useClearChatMutation,
  useDeleteChatMutation,
  useLeaveGroupMutation,
  useToggleArchiveChatMutation,
  useToggleMuteChatMutation,
  useTogglePinChatMutation,
} from "../../redux/api/api";

const DeleteChatMenu = ({ dispatch, deleteMenuAnchor }) => {
  const navigate = useNavigate();

  const { isDeleteMenu, selectedDeleteChat } = useSelector((state) => state.misc);

  const [deleteChat, _, deleteChatData] = useAsyncMutation(useDeleteChatMutation);
  const [clearChat] = useClearChatMutation();
  const [leaveGroup, __, leaveGroupData] = useAsyncMutation(useLeaveGroupMutation);
  const [togglePinChat] = useTogglePinChatMutation();
  const [toggleMuteChat] = useToggleMuteChatMutation();
  const [toggleArchiveChat] = useToggleArchiveChatMutation();

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

  const handleToggleMute = async () => {
    closeHandler();
    try {
      const res = await toggleMuteChat(chatId).unwrap();
      toast.success(res.isMuted ? "Conversation muted" : "Conversation unmuted");
    } catch {
      toast.error("Failed to update mute");
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
      <MenuItem onClick={handleToggleMute} dense>
        <ListItemIcon>
          {isMuted ? <UnmuteIcon fontSize="small" /> : <MuteIcon fontSize="small" />}
        </ListItemIcon>
        <ListItemText>{isMuted ? "Unmute" : "Mute Notifications"}</ListItemText>
      </MenuItem>
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
