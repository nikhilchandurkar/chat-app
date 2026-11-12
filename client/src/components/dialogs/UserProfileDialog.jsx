import React, { useEffect, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Block as BlockIcon,
  Chat as MessageIcon,
  CheckCircle as FriendsIcon,
  Close as CloseIcon,
  Flag as ReportIcon,
  Groups as GroupIcon,
  HourglassEmpty as PendingIcon,
  PersonAdd as AddFriendIcon,
  Security as ShieldIcon,
} from "@mui/icons-material";
import moment from "moment";
import toast from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { transformImage } from "../../lib/feature";
import {
  useAcceptFriendRequestMutation,
  useBlockUserMutation,
  useCreateDirectChatMutation,
  useGetUserProfileQuery,
  useReportUserMutation,
  useSendFriendRequestMutation,
  useUnblockUserMutation,
} from "../../redux/api/api";
import { setActiveChatId, setIsMobile, setIsMobileProfile, setIsNotification, setIsSearch } from "../../redux/reducers/misc";
import { isScreenshotBlockEnabled } from "../../utils/feedback";
import { retainProtectedSurface } from "../../utils/screenPrivacy";

const STATUS_META = {
  online: { label: "Online", color: "#22c55e" },
  away: { label: "Away", color: "#f59e0b" },
  busy: { label: "Busy", color: "#ef4444" },
  dnd: { label: "Do Not Disturb", color: "#6b7280" },
  offline: { label: "Offline", color: "#9ca3af" },
};

const UserProfileDialog = ({ open, onClose, userId, initialUser = null }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: me } = useSelector((state) => state.auth);

  const normalizedId = String(userId || initialUser?._id || initialUser?.id || "");
  const myId = String(me?._id || me?.id || "");
  const { data, isFetching, isError } = useGetUserProfileQuery(normalizedId, {
    skip: !open || !normalizedId,
  });

  const [createDirectChat, { isLoading: isCreatingChat }] = useCreateDirectChatMutation();
  const [sendFriendRequest, { isLoading: isSendingFriend }] = useSendFriendRequestMutation();
  const [acceptFriendRequest, { isLoading: isAcceptingFriend }] = useAcceptFriendRequestMutation();
  const [blockUser, { isLoading: isBlocking }] = useBlockUserMutation();
  const [unblockUser, { isLoading: isUnblocking }] = useUnblockUserMutation();
  const [reportUser, { isLoading: isReporting }] = useReportUserMutation();

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");

  useEffect(() => {
    if (!open) {
      setReportOpen(false);
      setReportReason("");
      return undefined;
    }
    return retainProtectedSurface();
  }, [open]);

  const profileUser = data?.user || initialUser || {};
  const isSelf = Boolean(profileUser.isSelf || (myId && normalizedId && myId === normalizedId));
  const displayName = profileUser.name || profileUser.username || "User";
  const rawAvatar = typeof profileUser.avatar === "string" ? profileUser.avatar : profileUser.avatar?.url;
  const avatarSrc = transformImage(rawAvatar);
  const statusInfo = STATUS_META[profileUser.status];

  const openChatById = (chatId) => {
    if (!chatId) return;
    dispatch(setActiveChatId(chatId));
    dispatch(setIsMobile(false));
    dispatch(setIsSearch(false));
    dispatch(setIsNotification(false));
    onClose?.();
    if (location.pathname !== "/") {
      navigate("/");
    }
  };

  const handleMessageClick = async () => {
    if (!normalizedId || isSelf) return;
    if (profileUser.directChatId) {
      openChatById(profileUser.directChatId);
      return;
    }
    try {
      const res = await createDirectChat(normalizedId).unwrap();
      if (res?.chatId) {
        openChatById(res.chatId);
      } else {
        toast.error(res?.message || "Could not open direct message");
      }
    } catch (err) {
      toast.error(err?.data?.message || "Unable to start chat with this user");
    }
  };

  const handleFriendAction = async () => {
    if (!normalizedId || isSelf) return;
    try {
      if (profileUser.relationship === "received" && profileUser.pendingRequestId) {
        const res = await acceptFriendRequest({ requestId: profileUser.pendingRequestId, accept: true }).unwrap();
        toast.success(res?.message || "Friend request accepted");
        return;
      }
      const res = await sendFriendRequest({ userId: normalizedId }).unwrap();
      toast.success(res?.message || "Friend request sent");
    } catch (err) {
      toast.error(err?.data?.message || "Action failed");
    }
  };

  const handleToggleBlock = async () => {
    if (!normalizedId || isSelf) return;
    try {
      if (profileUser.isBlocked) {
        const res = await unblockUser(normalizedId).unwrap();
        toast.success(res?.message || "User unblocked");
      } else {
        const res = await blockUser(normalizedId).unwrap();
        toast.success(res?.message || "User blocked");
      }
    } catch (err) {
      toast.error(err?.data?.message || "Unable to update block status");
    }
  };

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    if (!reportReason.trim()) {
      toast.error("Please provide a reason for the report");
      return;
    }
    try {
      const res = await reportUser({ userId: normalizedId, reason: reportReason.trim() }).unwrap();
      toast.success(res?.message || "Report submitted");
      setReportOpen(false);
      setReportReason("");
    } catch (err) {
      toast.error(err?.data?.message || "Failed to submit report");
    }
  };

  return (
    <Dialog
      open={Boolean(open)}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{
        sx: {
          borderRadius: 3,
          mx: { xs: 1.5, sm: 3 },
          overflow: "hidden",
        },
      }}
    >
      <DialogTitle
        sx={{
          bgcolor: "primary.main",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          py: 1.4,
          px: 2,
        }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          User Profile
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: "#FFFFFF" }} aria-label="Close profile">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent
        onContextMenu={(e) => isScreenshotBlockEnabled() && e.preventDefault()}
        sx={{ p: 2.5, userSelect: "none" }}
      >
        {isFetching && !initialUser ? (
          <Box py={5} display="flex" justifyContent="center">
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Stack spacing={2} alignItems="center">
            <Box position="relative">
              <Avatar
                src={avatarSrc}
                alt={displayName}
                imgProps={{ draggable: false }}
                sx={{
                  width: 96,
                  height: 96,
                  bgcolor: "#236B4A",
                  color: "#FFFFFF",
                  fontSize: "2.2rem",
                  fontWeight: 700,
                  border: "3px solid",
                  borderColor: "primary.main",
                }}
              >
                {displayName[0]?.toUpperCase() || "U"}
              </Avatar>
              {statusInfo && (
                <Box
                  title={statusInfo.label}
                  sx={{
                    position: "absolute",
                    bottom: 4,
                    right: 4,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    bgcolor: statusInfo.color,
                    border: "2.5px solid #FFFFFF",
                  }}
                />
              )}
            </Box>

            <Box textAlign="center" width="100%">
              <Typography variant="h6" fontWeight={700} noWrap>
                {displayName}
              </Typography>
              {profileUser.username && (
                <Typography variant="body2" color="text.secondary">
                  @{profileUser.username}
                </Typography>
              )}

              <Stack direction="row" spacing={0.75} justifyContent="center" flexWrap="wrap" mt={1} useFlexGap>
                {statusInfo && (
                  <Chip
                    size="small"
                    label={
                      profileUser.status === "offline" && profileUser.lastSeen
                        ? `Last seen ${moment(profileUser.lastSeen).fromNow()}`
                        : statusInfo.label
                    }
                    variant="outlined"
                  />
                )}
                <Chip
                  size="small"
                  icon={<ShieldIcon sx={{ fontSize: 14 }} />}
                  label="Protected"
                  color="success"
                  variant="outlined"
                />
              </Stack>
            </Box>

            <Paper
              variant="outlined"
              sx={{
                width: "100%",
                p: 1.5,
                borderRadius: 2,
                bgcolor: "action.hover",
              }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" gutterBottom>
                ABOUT
              </Typography>
              <Typography variant="body2" color={profileUser.bio ? "text.primary" : "text.secondary"}>
                {profileUser.bio || (isError ? "Profile details unavailable." : "No bio added yet.")}
              </Typography>
              {profileUser.createdAt && (
                <Typography variant="caption" color="text.secondary" display="block" mt={0.75}>
                  Joined {moment(profileUser.createdAt).format("MMM YYYY")}
                </Typography>
              )}
            </Paper>

            {Array.isArray(profileUser.sharedGroups) && profileUser.sharedGroups.length > 0 && (
              <Box width="100%">
                <Stack direction="row" alignItems="center" spacing={0.5} mb={0.75}>
                  <GroupIcon fontSize="small" color="primary" />
                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                    SHARED GROUPS ({profileUser.sharedGroups.length})
                  </Typography>
                </Stack>
                <Stack direction="row" flexWrap="wrap" gap={0.75}>
                  {profileUser.sharedGroups.map((grp) => (
                    <Chip
                      key={grp._id}
                      label={grp.name}
                      size="small"
                      clickable
                      onClick={() => openChatById(grp._id)}
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </Box>
            )}

            <Divider flexItem />

            {isSelf ? (
              <Button
                fullWidth
                variant="contained"
                onClick={() => {
                  onClose?.();
                  dispatch(setIsMobileProfile(true));
                }}
                sx={{ borderRadius: 2 }}
              >
                Open My Profile Settings
              </Button>
            ) : (
              <Stack width="100%" spacing={1}>
                <Stack direction="row" spacing={1}>
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<MessageIcon />}
                    onClick={handleMessageClick}
                    disabled={isCreatingChat || profileUser.isBlocked || profileUser.hasBlockedMe}
                    sx={{ borderRadius: 2 }}
                  >
                    Message
                  </Button>

                  {profileUser.relationship === "friends" ? (
                    <Button
                      fullWidth
                      variant="outlined"
                      color="success"
                      startIcon={<FriendsIcon />}
                      disabled
                      sx={{ borderRadius: 2 }}
                    >
                      Friends
                    </Button>
                  ) : profileUser.relationship === "sent" ? (
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<PendingIcon />}
                      disabled
                      sx={{ borderRadius: 2 }}
                    >
                      Requested
                    </Button>
                  ) : (
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<AddFriendIcon />}
                      onClick={handleFriendAction}
                      disabled={isSendingFriend || isAcceptingFriend || profileUser.isBlocked}
                      sx={{ borderRadius: 2 }}
                    >
                      {profileUser.relationship === "received" ? "Accept" : "Add Friend"}
                    </Button>
                  )}
                </Stack>

                <Stack direction="row" spacing={1}>
                  <Button
                    fullWidth
                    size="small"
                    color={profileUser.isBlocked ? "primary" : "error"}
                    variant="text"
                    startIcon={<BlockIcon fontSize="small" />}
                    onClick={handleToggleBlock}
                    disabled={isBlocking || isUnblocking}
                  >
                    {profileUser.isBlocked ? "Unblock User" : "Block User"}
                  </Button>
                  <Button
                    fullWidth
                    size="small"
                    color="warning"
                    variant="text"
                    startIcon={<ReportIcon fontSize="small" />}
                    onClick={() => setReportOpen((v) => !v)}
                  >
                    Report
                  </Button>
                </Stack>

                <Collapse in={reportOpen}>
                  <Box component="form" onSubmit={handleReportSubmit} sx={{ pt: 1 }}>
                    <TextField
                      fullWidth
                      size="small"
                      multiline
                      minRows={2}
                      placeholder="Describe the issue (spam, harassment, abuse)..."
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                    />
                    <Stack direction="row" spacing={1} justifyContent="flex-end" mt={1}>
                      <Button size="small" onClick={() => setReportOpen(false)}>
                        Cancel
                      </Button>
                      <Button size="small" type="submit" variant="contained" color="warning" disabled={isReporting}>
                        Submit Report
                      </Button>
                    </Stack>
                  </Box>
                </Collapse>
              </Stack>
            )}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserProfileDialog;
