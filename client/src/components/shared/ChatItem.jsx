import React, { memo } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import AvatarCard from "./AvatarCard";
import { useDispatch } from "react-redux";
import { setActiveChatId, setIsMobile } from "../../redux/reducers/misc";
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
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  const handleClick = () => {
    dispatch(setActiveChatId(_id));
    dispatch(setIsMobile(false));
  };

  return (
    <Box
      onClick={handleClick}
      onContextMenu={(e) => handleDeleteChat?.(e, _id, groupChat)}
      sx={{
        cursor: "pointer",
        display: "flex",
        gap: 1.5,
        alignItems: "center",
        bgcolor: sameSender ? "primary.main" : "transparent",
        color: sameSender ? "#ffffff" : "text.primary",
        position: "relative",
        px: 2,
        py: 1.5,
        borderBottom: `1px solid ${theme.palette.divider}`,
        transition: "background-color 0.16s ease",
        WebkitTapHighlightColor: "transparent",
        "@media (hover: hover)": {
          "&:hover": {
            bgcolor: sameSender
              ? "primary.dark"
              : isDarkMode
              ? "rgba(255,255,255,0.06)"
              : "rgba(35, 107, 74, 0.06)",
          },
        },
        "&:active": {
          bgcolor: sameSender
            ? "primary.dark"
            : isDarkMode
            ? "rgba(255,255,255,0.1)"
            : "rgba(35, 107, 74, 0.1)",
        },
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(0.25, 0.03 * index), duration: 0.22 }}
        style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", minWidth: 0 }}
      >
        <AvatarCard avatar={avatar} name={name} />

        <Stack flex={1} minWidth={0}>
          <Typography fontWeight={sameSender ? 600 : 500} noWrap>
            {name}
          </Typography>
          <Stack direction="row" alignItems="center" gap="0.5rem" minWidth={0}>
            {isTyping ? (
              <Typography variant="caption" sx={{ color: sameSender ? "#d1fae5" : "#48bb78", fontStyle: "italic", fontWeight: 600 }}>
                Typing...
              </Typography>
            ) : newMessageAlert ? (
              <Typography
                variant="caption"
                noWrap
                sx={{ color: sameSender ? "rgba(255,255,255,0.85)" : "text.secondary", fontStyle: "italic" }}
              >
                {newMessageAlert.message?.content || `${newMessageAlert.count} New Message`}
              </Typography>
            ) : (
              <>
                {groupChat && memberNames?.length > 0 && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{ color: sameSender ? "rgba(255,255,255,0.8)" : "text.secondary" }}
                  >
                    {memberNames.join(", ")}
                  </Typography>
                )}
                {sameSender && !groupChat && (
                  <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.85)", fontStyle: "italic" }}>
                    Active Chat
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
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              flexShrink: 0,
              backgroundColor: sameSender ? "#A7F3D0" : "#48bb78",
              boxShadow: "0 0 8px rgba(72, 187, 120, 0.6)",
            }}
          />
        )}
      </motion.div>
    </Box>
  );
};

export default memo(ChatItem);
