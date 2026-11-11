import { Avatar, AvatarGroup, Box, Stack } from "@mui/material";
import React from "react";
import { transformImage } from "../../lib/feature";

// Todo Transform
const AvatarCard = ({ avatar = [], max = 4, name = "" }) => {
  const list = Array.isArray(avatar) && avatar.length > 0 ? avatar : [""];
  return (
    <Stack direction={"row"} spacing={0.5}>
      <AvatarGroup
        max={max}
        sx={{
          position: "relative",
        }}
      >
        <Box width={list.length > 1 ? "5rem" : "3.2rem"} height={"3rem"} position="relative">
          {list.slice(0, max).map((i, index) => (
            <Avatar
              key={i || index}
              src={transformImage(i)}
              alt={`${name || "Chat"} Avatar ${index}`}
              sx={{
                width: "3rem",
                height: "3rem",
                bgcolor: "#236B4A",
                color: "#FFFFFF",
                fontWeight: 700,
                position: "absolute",
                left: list.length > 1 ? `${index * 0.9}rem` : 0,
              }}
            >
              {name ? name[0].toUpperCase() : "U"}
            </Avatar>
          ))}
        </Box>
      </AvatarGroup>
    </Stack>
  );
};

export default AvatarCard;
