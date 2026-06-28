import { Stack, Typography } from "@mui/material";
import React from "react";
import ChatItem from "../shared/ChatItem";

const ChatList = ({
  w = "100%",
  chats = [],
  chatId,
  onlineUsers = [],
  newMessagesAlert = [],
  typingChats = [],
  handleDeleteChat,
}) => {
  return (
    <Stack width={w} direction={"column"} overflow={"auto"} height={"100%"}>
      {chats?.length > 0 ? (
        chats.map((data, index) => {
          const { avatar, _id,name, groupChat, members, memberNames } = data;
          const newMessageAlert = newMessagesAlert.find(
            ({ chatId }) => chatId === _id
          );

          const isOnline = members?.some((member) =>
            onlineUsers.includes(member)
          );
          const isTyping = typingChats.includes(_id);

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
        <Stack alignItems="center" justifyContent="center" height="100%" color="text.secondary" spacing={1} p={2}>
          <Typography variant="body1" fontWeight={500}>No chats yet</Typography>
          <Typography variant="caption" textAlign="center">Search for friends to start chatting!</Typography>
        </Stack>
      )}
    </Stack>
  );
};

export default ChatList;
