import { useInputValidation } from "6pp";
import {
  Button,
  Dialog,
  DialogTitle,
  Skeleton,
  Stack,
  TextField,
  Typography,
  CircularProgress,
  IconButton,
  InputAdornment,
} from "@mui/material";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  useAvailableFriendsQuery,
  useNewGroupMutation,
} from "../../redux/api/api";
import { useAsyncMutation, useErrors } from "../../hooks/hook";
import { setIsNewGroup, setActiveChatId } from "../../redux/reducers/misc";
import toast from "react-hot-toast";
import { Close as CloseIcon, Search as SearchIcon } from "@mui/icons-material";
import UserItem from "../shared/UserItem";

const NewGroup = () => {
  const { isNewGroup } = useSelector((state) => state.misc);
  const dispatch = useDispatch();

  const { isError, isLoading, error, data } = useAvailableFriendsQuery();
  const [newGroup, isLoadingNewGroup] = useAsyncMutation(useNewGroupMutation);

  const groupName = useInputValidation("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const MINIMUM_MEMBERS = 1; // Allow creating groups with just 1 other person

  const errors = [
    {
      isError,
      error,
    },
  ];

  useErrors(errors);

  const selectMemberHandler = (id) => {
    setSelectedMembers((prev) =>
      prev.includes(id)
        ? prev.filter((currElement) => currElement !== id)
        : [...prev, id]
    );
  };

  const submitHandler = async () => {
    if (!groupName.value.trim()) return toast.error("Group name is required");

    if (selectedMembers.length < MINIMUM_MEMBERS)
      return toast.error(`Please select at least ${MINIMUM_MEMBERS} friend(s)`);

    const res = await newGroup("Creating New Group...", {
      name: groupName.value.trim(),
      members: selectedMembers,
    });

    if (res?.data?.chatId) {
      dispatch(setActiveChatId(res.data.chatId));
    }
    
    closeHandler();
  };

  const closeHandler = () => {
    dispatch(setIsNewGroup(false));
  };

  return (
    <Dialog 
      onClose={closeHandler} 
      open={isNewGroup}
      fullWidth
      maxWidth="xs"
    >
      <Stack p={{ xs: "1.5rem", sm: "2rem" }} spacing={"1.5rem"}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <DialogTitle sx={{ p: 0 }}>New Group</DialogTitle>
          <IconButton onClick={closeHandler} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>

        <TextField
          label="Group Name"
          value={groupName.value}
          onChange={groupName.changeHandler}
          fullWidth
          autoFocus
          error={!!groupName.error}
          helperText={groupName.error ? "Group name is required" : ""}
        />



        <Stack>
          <Typography variant="body1" sx={{ mb: 1 }}>
            Members Selected: {selectedMembers.length}
            {selectedMembers.length < MINIMUM_MEMBERS && 
              ` (Need ${MINIMUM_MEMBERS - selectedMembers.length} more)`}
          </Typography>
          
          {isLoading ? (
            <Stack alignItems="center" py={2}>
              <CircularProgress size={24} />
            </Stack>
          ) : data?.friends?.length > 0 ? (
            data.friends.map((friend) => (
              <UserItem
                user={friend}
                key={friend._id}
                handler={selectMemberHandler}
                isAdded={selectedMembers.includes(friend._id)}
              />
            ))
          ) : (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
              No friends available to add
            </Typography>
          )}
        </Stack>

        <Stack direction={"row"} justifyContent={"flex-end"} spacing={2}>
          <Button
            variant="outlined"
            color="inherit"
            onClick={closeHandler}
            disabled={isLoadingNewGroup}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={submitHandler}
            disabled={isLoadingNewGroup || !groupName.value.trim() || selectedMembers.length < MINIMUM_MEMBERS}
          >
            {isLoadingNewGroup ? <CircularProgress size={24} /> : "Create Group"}
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  );
};

export default NewGroup;
