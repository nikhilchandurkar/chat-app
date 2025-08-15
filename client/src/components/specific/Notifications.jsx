import { Avatar, Button, Dialog, DialogTitle, ListItem, Skeleton, Stack, Typography } from "@mui/material";
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

  const closeHandler = () => dispatch(setIsNotification(true));

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
    <Dialog open={isNotification} onClose={closeHandler}>
      <Stack p={{ xs: "1rem", sm: "2rem" }} maxWidth={"25rem"}>
        <DialogTitle alignSelf={"center"}>Notifications</DialogTitle>

        {isLoading ? (
          <Skeleton variant="rectangular" width="100%" height={100} />
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
    <ListItem divider>
      <Stack
        direction={"row"}
        alignItems={"center"}
        spacing={"1rem"}
        width={"100%"}
      >
        <Avatar
          src={avatar}
          alt={`${name}'s avatar`}
          sx={{ width: 48, height: 48 }}
        />

        <Typography
          variant="body1"
          sx={{
            flexGrow: 2,
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            width: "100%",
          }}
        >
          {`${name}`}
        </Typography>

        <Stack
          direction={{
            xs: "column",
            sm: "row",
          }}
          spacing={1}
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