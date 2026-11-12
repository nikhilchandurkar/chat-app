import React from "react";
import { Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { Groups as GroupIcon } from "@mui/icons-material";
import moment from "moment";
import toast from "react-hot-toast";
import { useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { useAcceptInviteLinkMutation, useInspectInviteLinkQuery } from "../redux/api/api";
import { setActiveChatId, setIsMobile } from "../redux/reducers/misc";

const InviteAccept = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { data, isLoading, isError, error } = useInspectInviteLinkQuery(token, { skip: !token });
  const [acceptInvite, { isLoading: isJoining }] = useAcceptInviteLinkMutation();

  const invite = data?.invitation;

  const handleJoin = async () => {
    try {
      const res = await acceptInvite(token).unwrap();
      toast.success(res?.message || "Joined conversation!");
      if (res?.chatId) {
        dispatch(setActiveChatId(res.chatId));
        dispatch(setIsMobile(false));
      }
      navigate("/");
    } catch (err) {
      toast.error(err?.data?.message || "Failed to join via invitation link");
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        bgcolor: "background.default",
      }}
    >
      <Paper sx={{ p: 3.5, borderRadius: 3, maxWidth: 400, width: "100%", textAlign: "center" }} elevation={2}>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            bgcolor: "primary.main",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            mb: 2,
          }}
        >
          <GroupIcon fontSize="large" />
        </Box>

        {isLoading ? (
          <Box py={3}><CircularProgress /></Box>
        ) : isError || !invite ? (
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={700}>Invalid or Expired Link</Typography>
            <Typography variant="body2" color="text.secondary">
              {error?.data?.message || "This group invitation link is invalid, revoked, or expired."}
            </Typography>
            <Button variant="contained" onClick={() => navigate("/")} sx={{ borderRadius: 2 }}>
              Go Home
            </Button>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <Typography variant="h5" fontWeight={700}>{invite.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              Invited by <strong>{invite.inviter}</strong> · {invite.memberCount} members
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Expires {moment(invite.expiresAt).fromNow()}
            </Typography>
            <Stack direction="row" spacing={1.25} pt={1}>
              <Button fullWidth variant="outlined" onClick={() => navigate("/")} sx={{ borderRadius: 2 }}>
                Cancel
              </Button>
              <Button fullWidth variant="contained" onClick={handleJoin} disabled={isJoining} sx={{ borderRadius: 2 }}>
                {isJoining ? "Joining..." : "Join Group"}
              </Button>
            </Stack>
          </Stack>
        )}
      </Paper>
    </Box>
  );
};

export default InviteAccept;

