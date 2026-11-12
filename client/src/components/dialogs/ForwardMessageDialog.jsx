import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Checkbox,
  Avatar,
  CircularProgress,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { useMyChatsQuery, useForwardMessageMutation } from "../../redux/api/api";
import toast from "react-hot-toast";

const ForwardMessageDialog = ({ open, onClose, messageId, messageIds }) => {
  const [selectedChats, setSelectedChats] = useState([]);
  const { isLoading, data, isError } = useMyChatsQuery("");
  const [forwardMessage, { isLoading: isForwarding }] = useForwardMessageMutation();
  const idsToForward = Array.isArray(messageIds) && messageIds.length > 0 ? messageIds : messageId ? [messageId] : [];

  const handleToggle = (chatId) => {
    setSelectedChats((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId]
    );
  };

  const handleForward = async () => {
    if (selectedChats.length === 0) return toast.error("Please select at least one chat");
    if (idsToForward.length === 0) return toast.error("No messages selected to forward");

    const toastId = toast.loading(
      idsToForward.length > 1 ? `Forwarding ${idsToForward.length} messages...` : "Forwarding message..."
    );
    try {
      const res = await forwardMessage({
        messageId: idsToForward.length === 1 ? idsToForward[0] : undefined,
        messageIds: idsToForward,
        targetChatIds: selectedChats,
      }).unwrap();
      toast.success(
        res.message || (idsToForward.length > 1 ? `Forwarded ${idsToForward.length} messages` : "Message forwarded"),
        { id: toastId }
      );
      onClose();
      setSelectedChats([]);
    } catch (error) {
      toast.error(error.data?.message || "Failed to forward", { id: toastId });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        Forward {idsToForward.length > 1 ? `${idsToForward.length} Messages ` : "Message "}To...
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {isLoading ? (
          <CircularProgress sx={{ margin: "2rem auto", display: "block" }} />
        ) : isError ? (
          <Typography color="error" p={2} textAlign="center">Failed to load chats</Typography>
        ) : data?.chats?.length === 0 ? (
          <Typography p={2} textAlign="center">No active chats found.</Typography>
        ) : (
          <List sx={{ pt: 0, maxHeight: "400px", overflowY: "auto" }}>
            {data?.chats?.map((chat) => (
              <ListItem 
                key={chat._id} 
                button 
                onClick={() => handleToggle(chat._id)}
                sx={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}
              >
                <Checkbox
                  edge="start"
                  checked={selectedChats.includes(chat._id)}
                  tabIndex={-1}
                  disableRipple
                />
                <ListItemAvatar>
                  <Avatar src={chat.avatar[0]} alt={chat.name} />
                </ListItemAvatar>
                <ListItemText primary={chat.name} secondary={chat.groupChat ? "Group" : "Direct Message"} />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={isForwarding}>
          Cancel
        </Button>
        <Button 
          onClick={handleForward} 
          variant="contained" 
          color="primary" 
          disabled={selectedChats.length === 0 || isForwarding}
        >
          Send
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ForwardMessageDialog;
