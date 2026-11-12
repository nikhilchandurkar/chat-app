import {
  Add as AddIcon,
  Check as CheckIcon,
  HourglassEmpty as PendingIcon,
  Remove as RemoveIcon,
} from "@mui/icons-material";
import { Avatar, Box, Button, Chip, IconButton, ListItem, Stack, Typography } from "@mui/material";
import React, { memo } from "react";

import { transformImage } from "../../lib/feature";

const UserItem = ({
  user,
  handler,
  handlerIsLoading,
  isAdded = false,
  styling = {},
  onSelectUser,
  relationship,
  onAcceptFriend,
}) => {
  const { name, username, _id, avatar } = user;
  const displayName = name || username || "User";
  const avatarSrc = transformImage(typeof avatar === "string" ? avatar : avatar?.url);

  const renderAction = () => {
    if (relationship === "friends") {
      return (
        <Chip
          size="small"
          color="success"
          variant="outlined"
          icon={<CheckIcon fontSize="small" />}
          label="Friends"
          sx={{ flexShrink: 0, fontWeight: 600 }}
        />
      );
    }
    if (relationship === "sent") {
      return (
        <Chip
          size="small"
          variant="outlined"
          icon={<PendingIcon fontSize="small" />}
          label="Requested"
          sx={{ flexShrink: 0 }}
        />
      );
    }
    if (relationship === "received" && onAcceptFriend) {
      return (
        <Button
          size="small"
          variant="contained"
          onClick={() => onAcceptFriend(user)}
          disabled={handlerIsLoading}
          sx={{ flexShrink: 0, borderRadius: 2, textTransform: "none", px: 1.5 }}
        >
          Accept
        </Button>
      );
    }

    return (
      <IconButton
        size="small"
        aria-label={isAdded ? `Remove ${displayName}` : `Add ${displayName}`}
        sx={{
          flexShrink: 0,
          bgcolor: isAdded ? "error.main" : "primary.main",
          color: "white",
          "&:hover": {
            bgcolor: isAdded ? "error.dark" : "primary.dark",
          },
        }}
        onClick={() => handler(_id)}
        disabled={handlerIsLoading}
      >
        {isAdded ? <RemoveIcon fontSize="small" /> : <AddIcon fontSize="small" />}
      </IconButton>
    );
  };

  return (
    <ListItem disableGutters sx={{ px: 0.5, py: 0.75 }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.25}
        width="100%"
        minWidth={0}
        {...styling}
      >
        <Box
          onClick={() => onSelectUser?.(user)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            flex: 1,
            minWidth: 0,
            cursor: onSelectUser ? "pointer" : "default",
            borderRadius: 1.5,
            "&:hover": onSelectUser ? { opacity: 0.85 } : undefined,
          }}
        >
          <Avatar
            src={avatarSrc}
            alt={displayName}
            sx={{ bgcolor: "#236B4A", color: "#fff", width: 38, height: 38, flexShrink: 0 }}
          >
            {displayName[0].toUpperCase()}
          </Avatar>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              fontWeight={600}
              noWrap
            >
              {displayName}
            </Typography>
            {username && (
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                @{username}
              </Typography>
            )}
          </Box>
        </Box>

        {renderAction()}
      </Stack>
    </ListItem>
  );
};

export default memo(UserItem);
