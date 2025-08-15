import {
  Dialog,
  DialogTitle,
  InputAdornment,
  List,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import React, { useEffect, useState } from "react";
import { useInputValidation } from "6pp";
import { Search as SearchIcon } from "@mui/icons-material";
import UserItem from "../shared/UserItem";
import { useDispatch, useSelector } from "react-redux";
import { setIsSearch } from "../../redux/reducers/misc";
import { useLazySearchUserQuery, useSendFriendRequestMutation } from "../../redux/api/api";
import { useAsyncMutation } from "../../hooks/hook";

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

  const debouncedSearch = useDebounce(search.value, 1000);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loadingIds, setLoadingIds] = useState([]);

  const searchCloseHandler = () => dispatch(setIsSearch(false));

  const [sendFriendRequest] = useAsyncMutation(useSendFriendRequestMutation);

  useEffect(() => {
    if (debouncedSearch) {
      searchUser(debouncedSearch)
        .then(({ data }) => {
          setUsers(data?.users || []);
          setError("");
        })
        .catch(() => setError("Failed to fetch users. Please try again."));
    }
  }, [debouncedSearch]);

  const addFriendHandler = async (id) => {
    setLoadingIds((prev) => [...prev, id]);
    await sendFriendRequest("Sending friend request...", { userId: id });
    setLoadingIds((prev) => prev.filter((loadingId) => loadingId !== id));
  };

  return (
    <Dialog open={isSearch} onClose={searchCloseHandler}>
      <Stack p={"2rem"} direction={"column"} width={"25rem"}>
        <DialogTitle textAlign={"center"}>Find People</DialogTitle>
        <TextField
          label="Search"
          value={search.value}
          onChange={search.changeHandler}
          variant="outlined"
          size="small"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
        {error && <Typography color="error">{error}</Typography>}
        <List>
          {isFetching ? (
            <Typography textAlign="center">Loading...</Typography>
          ) : (
            users.map((user) => (
              <UserItem
                user={user}
                key={user._id}
                handler={addFriendHandler}
                handlerIsLoading={loadingIds.includes(user._id)}
              />
            ))
          )}
        </List>
      </Stack>
    </Dialog>
  );
};

export default Search;
