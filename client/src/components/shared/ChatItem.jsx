import React, { memo } from "react";
import { Box, Stack, Typography } from "@mui/material";
import AvatarCard from "./AvatarCard";
import { useDispatch } from "react-redux";
import { setActiveChatId } from "../../redux/reducers/misc";
import { motion } from "framer-motion";

const ChatItem = ({
  avatar = [],
  name,
  _id,
  groupChat = false,
  sameSender,
  isOnline,
  isTyping,
  newMessageAlert,
  index = 0,
  handleDeleteChat,
  memberNames,
}) => {
  const dispatch = useDispatch();

  const handleClick = (e) => {
    dispatch(setActiveChatId(_id));
  };

  return (
    <Box
      onClick={handleClick}
      onContextMenu={(e) => handleDeleteChat(e, _id, groupChat)}
      sx={{ cursor: "pointer", padding: "0" }}
    >
      <motion.div
        initial={{ opacity: 0, y: "-100%" }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 * index }}
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          backgroundColor: sameSender ? "#2d3748" : "transparent",
          color: sameSender ? "white" : "black",
          position: "relative",
          padding: "1rem",
          borderBottom: "1px solid rgba(0,0,0,0.1)",
          transition: "background-color 0.2s",
        }}
        onMouseOver={(e) => {
          if (!sameSender) e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.04)";
        }}
        onMouseOut={(e) => {
          if (!sameSender) e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <AvatarCard avatar={avatar} name={name} />

        <Stack flexGrow={1}>
          <Typography fontWeight={sameSender ? 600 : 400}>{name}</Typography>
          <Stack direction="row" alignItems="center" gap="0.5rem">
            {isTyping ? (
              <Typography variant="caption" sx={{ color: "#48bb78", fontStyle: "italic", fontWeight: 600 }}>
                Typing...
              </Typography>
            ) : newMessageAlert ? (
              <Typography variant="caption" sx={{ color: "text.secondary", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "150px" }}>
                {newMessageAlert.message?.content || `${newMessageAlert.count} New Message`}
              </Typography>
            ) : (
              <>
                {groupChat && memberNames?.length > 0 && (
                  <Typography variant="caption" sx={{ color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "150px" }}>
                    {memberNames.join(", ")}
                  </Typography>
                )}
                {sameSender && !groupChat && (
                  <Typography variant="caption" sx={{ color: "#a0aec0", fontStyle: "italic" }}>
                    In Chat
                  </Typography>
                )}
                {!sameSender && isOnline && !groupChat && (
                  <Typography variant="caption" sx={{ color: "#48bb78", fontWeight: 500 }}>
                    Online
                  </Typography>
                )}
              </>
            )}
          </Stack>
        </Stack>

        {isOnline && !groupChat && (
          <Box
            sx={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              backgroundColor: "#48bb78",
              position: "absolute",
              top: "50%",
              right: "1rem",
              transform: "translateY(-50%)",
              boxShadow: "0 0 8px rgba(72, 187, 120, 0.6)",
            }}
          />
        )}
      </motion.div>
    </Box>
  );
};

export default memo(ChatItem);
