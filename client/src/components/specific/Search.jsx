import {
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import React, { lazy, Suspense, useEffect, useState } from "react";
import { useInputValidation } from "6pp";
import { Close as CloseIcon, Search as SearchIcon } from "@mui/icons-material";
import UserItem from "../shared/UserItem";
import { useDispatch, useSelector } from "react-redux";
import { setIsSearch } from "../../redux/reducers/misc";
import {
  useAcceptFriendRequestMutation,
  useLazySearchUserQuery,
  useSendFriendRequestMutation,
} from "../../redux/api/api";
import toast from "react-hot-toast";

const UserProfileDialog = lazy(() => import("../dialogs/UserProfileDialog"));

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

const Search = () => {
  const { isSearch } = useSelector((state) => state.misc);
  const dispatch = useDispatch();

  const [searchUser, { isFetching }] = useLazySearchUserQuery();
  const search = useInputValidation("");

  const debouncedSearch = useDebounce(search.value.trim(), 350);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loadingIds, setLoadingIds] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  const searchCloseHandler = () => dispatch(setIsSearch(false));

  const [sendFriendRequest] = useSendFriendRequestMutation();
  const [acceptFriendRequest] = useAcceptFriendRequestMutation();

  useEffect(() => {
    if (!isSearch) return;
    if (!debouncedSearch) {
      setUsers([]);
      setError("");
      return;
    }
    searchUser(debouncedSearch, false)
      .then(({ data }) => {
        setUsers(data?.users || []);
        setError("");
      })
      .catch(() => setError("Failed to fetch users. Please try again."));
  }, [debouncedSearch, isSearch, searchUser]);

  const addFriendHandler = async (id) => {
    const target = users.find((u) => (u._id || u.id) === id);
    if (target?.relationship === "friends" || target?.relationship === "sent") {
      return;
    }
    setLoadingIds((prev) => [...prev, id]);
    const toastId = toast.loading("Sending friend request...");
    try {
      const res = await sendFriendRequest({ userId: id }).unwrap();
      toast.success(res?.message || "Friend request sent.", { id: toastId });
      setUsers((prev) =>
        prev.map((u) => ((u._id || u.id) === id ? { ...u, relationship: "sent" } : u))
      );
      if (debouncedSearch) {
        searchUser(debouncedSearch, false).then(({ data }) => {
          if (data?.users) setUsers(data.users);
        });
      }
    } catch (err) {
      toast.error(err?.data?.message || "Could not send friend request", { id: toastId });
    } finally {
      setLoadingIds((prev) => prev.filter((loadingId) => loadingId !== id));
    }
  };

  const acceptFriendHandler = async (user) => {
    const id = user?._id || user?.id;
    if (!id || !user?.pendingRequestId) return;
    setLoadingIds((prev) => [...prev, id]);
    const toastId = toast.loading("Accepting friend request...");
    try {
      const res = await acceptFriendRequest({ requestId: user.pendingRequestId, accept: true }).unwrap();
      toast.success(res?.message || "Friend request accepted.", { id: toastId });
      setUsers((prev) =>
        prev.map((u) => ((u._id || u.id) === id ? { ...u, relationship: "friends", pendingRequestId: null } : u))
      );
    } catch (err) {
      toast.error(err?.data?.message || "Could not accept friend request", { id: toastId });
    } finally {
      setLoadingIds((prev) => prev.filter((loadingId) => loadingId !== id));
    }
  };

  return (
    <Dialog
      open={isSearch}
      onClose={searchCloseHandler}
      fullWidth
      maxWidth="xs"
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          mx: { xs: 1.5, sm: 3 },
          width: "100%",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: { xs: 2, sm: 2.5 },
          py: 1.5,
        }}
      >
        <Typography variant="h6" fontWeight={700}>
          Find People
        </Typography>
        <IconButton size="small" onClick={searchCloseHandler} aria-label="Close search">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: { xs: 2, sm: 2.5 }, pb: 2.5, pt: 0.5, overflowX: "hidden" }}>
        <Stack spacing={1.5} width="100%">
          <TextField
            fullWidth
            autoFocus
            placeholder="Search by name or @username..."
            value={search.value}
            onChange={search.changeHandler}
            variant="outlined"
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: search.value ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear search"
                    onClick={() => search.changeHandler({ target: { value: "" } })}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />

          {error && (
            <Typography variant="caption" color="error">
              {error}
            </Typography>
          )}

          <List disablePadding sx={{ maxHeight: "55vh", overflowY: "auto", overflowX: "hidden" }}>
            {isFetching ? (
              <Box py={3} textAlign="center">
                <CircularProgress size={24} />
              </Box>
            ) : !debouncedSearch ? (
              <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                Type a name or username to find friends.
              </Typography>
            ) : users.length === 0 ? (
              <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                No matching users found.
              </Typography>
            ) : (
              users.map((user) => (
                <UserItem
                  user={user}
                  key={user._id}
                  handler={addFriendHandler}
                  handlerIsLoading={loadingIds.includes(user._id)}
                  relationship={user.relationship || "none"}
                  onAcceptFriend={acceptFriendHandler}
                  onSelectUser={(u) => setSelectedUser(u)}
                />
              ))
            )}
          </List>
        </Stack>
      </DialogContent>
      {selectedUser && (
        <Suspense fallback={null}>
          <UserProfileDialog
            open={Boolean(selectedUser)}
            onClose={() => setSelectedUser(null)}
            userId={selectedUser?._id || selectedUser?.id}
            initialUser={selectedUser}
          />
        </Suspense>
      )}
    </Dialog>
  );
};

export default Search;
