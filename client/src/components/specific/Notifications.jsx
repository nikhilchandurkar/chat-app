import { Avatar, Dialog, DialogTitle, Button, ListItem, Skeleton, Stack, Typography } from "@mui/material";
import { memo } from "react";
import toast from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { useErrors } from "../../hooks/hook";
import { useAcceptFriendRequestMutation, useGetNotificationsQuery } from "../../redux/api/api";
import { setIsNotification } from "../../redux/reducers/misc";

const Notifications = () => {
  const { isNotification } = useSelector((state) => state.misc);
  const dispatch = useDispatch();

  const { isLoading, data, error, isError } = useGetNotificationsQuery();
  const [acceptRequest] = useAcceptFriendRequestMutation();
  // const {acceptRequest} = useAcceptFriendRequestMutation()

  const closeHandler = () => dispatch(setIsNotification(false));

  const friendRequestHandler = async ({ _id, accept }) => {
    dispatch(setIsNotification(false));

    const res = await acceptRequest({ requestId: _id, accept });

    if (res.data?.success) {
      toast.success(res.data?.message || "Request accepted successfully!");
    } else {
      toast.error(res.data?.message || "Failed to process the request.");
    }

  };

  useErrors([{ error, isError }]);

  return (
    <Dialog open={isNotification} onClose={closeHandler} fullWidth maxWidth="sm">
      <Stack p={{ xs: "1rem", sm: "2rem" }}>
        <DialogTitle textAlign={"center"}>Notifications</DialogTitle>

        {isLoading ? (
          <Skeleton variant="rectangular" width="100%" height={100} sx={{ borderRadius: "1rem" }} />
        ) : (
          <>
            {data?.allRequests?.length > 0 ? (
              data?.allRequests?.map(({ sender, _id }) => (
                <NotificationItem
                  sender={sender}
                  _id={_id}
                  name={sender.name}
                  handler={friendRequestHandler}
                  key={_id}
                />
              ))
            ) : (
              <Typography textAlign={"center"} variant="body2" color="textSecondary">
                0 notifications
              </Typography>
            )}
          </>
        )}
      </Stack>
    </Dialog>
  );
};

const NotificationItem = memo(({ sender, _id, handler }) => {
  const { name, avatar } = sender;
  return (
    <ListItem divider disableGutters sx={{ px: 0.5 }}>
      <Stack
        direction={"row"}
        alignItems={"center"}
        spacing={1.25}
        width={"100%"}
        minWidth={0}
      >
        <Avatar
          src={avatar}
          alt={`${name}'s avatar`}
          sx={{ width: 42, height: 42, flexShrink: 0, bgcolor: "#236B4A" }}
        />

        <Typography
          variant="body2"
          fontWeight={600}
          noWrap
          sx={{
            flex: 1,
            minWidth: 0,
          }}
        >
          {`${name}`}
        </Typography>

        <Stack
          direction="row"
          spacing={0.75}
          flexShrink={0}
        >
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => handler({ _id, accept: true })}
          >

            Accept
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="small"
            onClick={() => handler({ accept:false, _id })}
          >
            Reject
          </Button>
        </Stack>
      </Stack>
    </ListItem>
  );
});

export default Notifications;