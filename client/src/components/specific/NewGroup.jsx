// import { useInputValidation } from "6pp";
// import {
//   Button,
//   Dialog,
//   DialogTitle,
//   Skeleton,
//   Stack,
//   TextField,
//   Typography,
// } from "@mui/material";
// import React, { useState } from "react";
// import { sampleUsers } from "../../constants/sampleData";
// import UserItem from "../shared/UserItem";
// import { useDispatch, useSelector } from "react-redux";
// import {
//   useAvailableFriendsQuery,
//   useNewGroupMutation,
// } from "../../redux/api/api";
// import { useAsyncMutation, useErrors } from "../../hooks/hook";
// import { setIsNewGroup } from "../../redux/reducers/misc";
// import toast from "react-hot-toast";

// const NewGroup = () => {
//   const { isNewGroup } = useSelector((state) => state.misc);
//   const dispatch = useDispatch();

//   const { isError, isLoading, error, data } = useAvailableFriendsQuery();
//   const [newGroup, isLoadingNewGroup] = useAsyncMutation(useNewGroupMutation);

//   const groupName = useInputValidation("");

//   const [selectedMembers, setSelectedMembers] = useState([]);

//   const errors = [
//     {
//       isError,
//       error,
//     },
//   ];

//   useErrors(errors);

//   const selectMemberHandler = (id) => {
//     setSelectedMembers((prev) =>
//       prev.includes(id)
//         ? prev.filter((currElement) => currElement !== id)
//         : [...prev, id]
//     );
//   };

//   const submitHandler = () => {
//     if (!groupName.value) return toast.error("Group name is required");

//     if (selectedMembers.length < 2)
//       return toast.error("Please Select Atleast 3 Members");

//     newGroup("Creating New Group...", {
//       name: groupName.value,
//       members: selectedMembers,
//     });

//     closeHandler();
//   };

//   const closeHandler = () => {
//     dispatch(setIsNewGroup(false));
//   };

//   return (
//     <Dialog onClose={closeHandler} open={isNewGroup}>
//       <Stack p={{ xs: "1rem", sm: "3rem" }} width={"25rem"} spacing={"2rem"}>
//         <DialogTitle textAlign={"center"} variant="h4">
//           New Group
//         </DialogTitle>

//         <TextField
//           label="Group Name"
//           value={groupName.value}
//           onChange={groupName.changeHandler}
//         />

//         <Typography variant="body1">Members</Typography>

//         <Stack>
//           {isLoading ? (
//             <Skeleton />
//           ) : (
//             data?.friends?.map((i) => (
//               <UserItem
//                 user={i}
//                 key={i._id}
//                 handler={selectMemberHandler}
//                 isAdded={selectedMembers.includes(i._id)}
//               />
//             ))
//           )}
//         </Stack>

//         <Stack direction={"row"} justifyContent={"space-evenly"}>
//           <Button
//             variant="text"
//             color="error"
//             size="large"
//             onClick={closeHandler}
//           >
//             Cancel
//           </Button>
//           <Button
//             variant="contained"
//             size="large"
//             onClick={submitHandler}
//             disabled={isLoadingNewGroup}
//           >
//             Create
//           </Button>
//         </Stack>
//       </Stack>
//     </Dialog>
//   );
// };

// export default NewGroup;








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
import { setIsNewGroup } from "../../redux/reducers/misc";
import toast from "react-hot-toast";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import UserItem from "../shared/UserItem";

const NewGroup = () => {
  const { isNewGroup } = useSelector((state) => state.misc);
  const dispatch = useDispatch();

  const { isError, isLoading, error, data } = useAvailableFriendsQuery();
  const [newGroup, isLoadingNewGroup] = useAsyncMutation(useNewGroupMutation);

  const groupName = useInputValidation("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [filteredFriends, setFilteredFriends] = useState([]);

  const MINIMUM_MEMBERS = 2; // Define constant for minimum members

  // Filter friends based on search query
  useEffect(() => {
    if (data?.friends) {
      setFilteredFriends(
        data.friends.filter((friend) =>
          friend.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      );
    }
  }, [data, searchQuery]);

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

  const submitHandler = () => {
    if (!groupName.value.trim()) return toast.error("Group name is required");

    // Updated to be consistent with MINIMUM_MEMBERS constant
    if (selectedMembers.length < MINIMUM_MEMBERS)
      return toast.error(`Please select at least ${MINIMUM_MEMBERS + 1} members`);

    newGroup("Creating New Group...", {
      name: groupName.value.trim(),
      members: selectedMembers,
    })
      .then(() => {
        toast.success("Group created successfully!");
        closeHandler();
      })
      .catch((err) => {
        toast.error("Failed to create group. Please try again.");
      });
  };

  const closeHandler = () => {
    // Reset form state when closing
    groupName.setValue("");
    setSelectedMembers([]);
    setSearchQuery("");
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
          error={groupName.error}
          helperText={groupName.error ? "Group name is required" : ""}
        />

        <TextField
          label="Search Friends"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          fullWidth
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />

        <Stack>
          <Typography variant="body1" sx={{ mb: 1 }}>
            Members Selected: {selectedMembers.length}
            {selectedMembers.length > 0 && 
              ` (Need ${Math.max(0, MINIMUM_MEMBERS + 1 - selectedMembers.length)} more)`}
          </Typography>
          
          {isLoading ? (
            <Stack alignItems="center" py={2}>
              <CircularProgress size={24} />
            </Stack>
          ) : filteredFriends.length > 0 ? (
            filteredFriends.map((friend) => (
              <UserItem
                user={friend}
                key={friend._id}
                handler={selectMemberHandler}
                isAdded={selectedMembers.includes(friend._id)}
              />
            ))
          ) : (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
              No friends match your search
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
            disabled={isLoadingNewGroup || !groupName.value.trim() || selectedMembers.length <= MINIMUM_MEMBERS}
          >
            {isLoadingNewGroup ? <CircularProgress size={24} /> : "Create Group"}
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  );
};

export default NewGroup;
