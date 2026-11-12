import { Button, Stack, Typography } from "@mui/material";
import React from "react";
import { useDispatch } from "react-redux";
import { setIsNewGroup, setIsSearch } from "../../redux/reducers/misc";
import ChatItem from "../shared/ChatItem";

const checkIsOnline = (members, onlineUsers) => {
  if (!members || !onlineUsers) return false;
  return members.some((member) => {
    const memberId =
      typeof member === "object" && member !== null
        ? String(member._id || member.id || member.user_id || "")
        : String(member || "");
    if (!memberId) return false;

    if (Array.isArray(onlineUsers)) {
      return onlineUsers.some((u) => {
        if (typeof u === "object" && u !== null) {
          return String(u.user_id || u.id || u._id || "") === memberId;
        }
        return String(u) === memberId;
      });
    }
    if (onlineUsers instanceof Set) {
      return onlineUsers.has(memberId);
    }
    if (typeof onlineUsers === "object") {
      if (onlineUsers.user_id || onlineUsers.id) {
        const uId = String(onlineUsers.user_id || onlineUsers.id);
        return uId === memberId && onlineUsers.status !== "offline";
      }
      return Boolean(onlineUsers[memberId]);
    }
    return false;
  });
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

  return (
    <Stack width={w} direction={"column"} overflow={"auto"} height={"100%"}>
      {chats?.length > 0 ? (
        chats.map((data, index) => {
          const { avatar, _id, name, groupChat, members, memberNames } = data;
          const newMessageAlert = Array.isArray(newMessagesAlert)
            ? newMessagesAlert.find(({ chatId: alertChatId }) => alertChatId === _id)
            : undefined;

          const isOnline = checkIsOnline(members, onlineUsers);
          const isTyping = Array.isArray(typingChats) ? typingChats.includes(_id) : false;

          return (
            <ChatItem
              index={index}
              newMessageAlert={newMessageAlert}
              isOnline={isOnline}
              isTyping={isTyping}
              avatar={avatar}
              name={name}
              _id={_id}
              key={_id}
              groupChat={groupChat}
              sameSender={chatId === _id}
              handleDeleteChat={handleDeleteChat}
              memberNames={memberNames}
            />
          );
        })
      ) : (
        <Stack alignItems="center" justifyContent="center" height="100%" color="text.secondary" spacing={1.5} p={2.5}>
          <Typography variant="body1" fontWeight={600}>No conversations yet</Typography>
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
        </Stack>
      )}
    </Stack>
  );
};

export default ChatList;
