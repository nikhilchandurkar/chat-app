import React, { useState, useEffect, Suspense, lazy } from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Tabs,
  Tab,
  Stack,
  Avatar,
  Divider,
  CircularProgress,
  Grid,
  Menu,
  MenuItem,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Backdrop,
} from "@mui/material";
import { 
  Close as CloseIcon, 
  Description as DocIcon, 
  MoreVert as MoreVertIcon, 
  Edit as EditIcon, 
  Check as CheckIcon,
  PersonAdd as PersonAddIcon,
  ExitToApp as ExitToAppIcon,
  Delete as DeleteIcon
} from "@mui/icons-material";
import { 
  useLazyGetChatMediaQuery, 
  useChatDetailsQuery,
  useRenameGroupMutation,
  useRemoveGroupMemberMutation,
  useAddAdminMutation,
  useRemoveAdminMutation,
  useToggleRestrictMessagesMutation,
  useDeleteChatMutation,
} from "../../redux/api/api";
import { fileFormat } from "../../lib/feature";
import { useSelector, useDispatch } from "react-redux";
import { useAsyncMutation } from "../../hooks/hook";
import { useNavigate } from "react-router-dom";
import { setIsAddMember } from "../../redux/reducers/misc";

const ConfirmDeleteDialog = lazy(() => import("../dialogs/ConfirmDeleteDialog"));
const AddMemberDialog = lazy(() => import("../dialogs/AddMemberDialog"));

const ChatDetailsDrawer = ({ open, onClose, chatId, isGroupChat }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { isAddMember } = useSelector((state) => state.misc);

  const [tabIndex, setTabIndex] = useState(0);
  
  // Media pagination state
  const [mediaPage, setMediaPage] = useState(1);
  const [mediaMessages, setMediaMessages] = useState([]);
  
  // Group Admin States
  const [isEditingName, setIsEditingName] = useState(false);
  const [groupNameValue, setGroupNameValue] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [confirmDeleteDialog, setConfirmDeleteDialog] = useState(false);

  // Mutations
  const [updateGroup, isLoadingGroupName] = useAsyncMutation(useRenameGroupMutation);
  const [removeMember, isLoadingRemoveMember] = useAsyncMutation(useRemoveGroupMemberMutation);
  const [addAdmin] = useAsyncMutation(useAddAdminMutation);
  const [removeAdmin] = useAsyncMutation(useRemoveAdminMutation);
  const [toggleRestrict, isLoadingRestrict] = useAsyncMutation(useToggleRestrictMessagesMutation);
  const [deleteGroup, isLoadingDeleteGroup] = useAsyncMutation(useDeleteChatMutation);
  
  const [fetchMedia, { isLoading: isMediaLoading, data: mediaData }] = useLazyGetChatMediaQuery();

  const { data: chatData, isLoading: isChatLoading } = useChatDetailsQuery(
    { chatId, populate: true },
    { skip: !chatId || !open }
  );

  const groupDetails = chatData?.chat;
  const isCreator = groupDetails?.creator === user?._id;
  const isAdmin = isCreator || groupDetails?.admins?.includes(user?._id);

  useEffect(() => {
    if (open && chatId && tabIndex === (isGroupChat ? 1 : 0)) {
      fetchMedia({ chatId, page: 1 }).unwrap().then(res => setMediaMessages(res.messages));
    }
    if (groupDetails) {
      setGroupNameValue(groupDetails.name);
    }
  }, [open, chatId, tabIndex, fetchMedia, groupDetails]);

  const allMedia = mediaMessages.flatMap(msg => msg.attachments);

  const imagesAndVideos = allMedia.filter(att => ["video", "image"].includes(fileFormat(att.url)));
  const docs = allMedia.filter(att => ["file", "audio"].includes(fileFormat(att.url)));

  const handleTabChange = (event, newValue) => {
    setTabIndex(newValue);
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = () => setAvatarPreview(reader.result);
      reader.readAsDataURL(file);
      setIsEditingName(true); // Open edit mode to show save button
    }
  };

  const handleUpdateGroup = () => {
    if (groupNameValue.trim() !== groupDetails?.name || avatarFile) {
      const formData = new FormData();
      if (groupNameValue.trim() !== groupDetails?.name) {
        formData.append("name", groupNameValue);
      }
      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }
      updateGroup("Updating Group Details...", { chatId, formData });
    }
    setIsEditingName(false);
    setAvatarFile(null);
  };

  const handleMenuOpen = (event, member) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedMember(member);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedMember(null);
  };

  const handleRemoveMember = () => {
    removeMember("Removing Member...", { chatId, userId: selectedMember._id });
    handleMenuClose();
  };

  const handleToggleAdmin = () => {
    const isMemberAdmin = groupDetails?.admins?.includes(selectedMember._id);
    if (isMemberAdmin) {
      removeAdmin("Demoting Admin...", { chatId, userId: selectedMember._id });
    } else {
      addAdmin("Promoting to Admin...", { chatId, userId: selectedMember._id });
    }
    handleMenuClose();
  };

  const handleToggleRestrict = () => {
    toggleRestrict("Updating restrictions...", chatId);
  };

  const handleDeleteOrLeaveGroup = () => {
    deleteGroup(isCreator ? "Deleting Group..." : "Leaving Group...", chatId);
    setConfirmDeleteDialog(false);
    onClose();
    navigate("/");
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 350, display: "flex", flexDirection: "column", height: "100%" }}>
        <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between", bgcolor: "primary.main", color: "white" }}>
          <Typography variant="h6">{isGroupChat ? "Group Info" : "Contact Info"}</Typography>
          <IconButton onClick={onClose} sx={{ color: "white" }}>
            <CloseIcon />
          </IconButton>
        </Box>

        {isChatLoading ? (
          <CircularProgress sx={{ m: "auto", mt: 4 }} />
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", p: 3, bgcolor: "rgba(0,0,0,0.03)" }}>
            {isAdmin ? (
              <label htmlFor="group-avatar-upload" style={{ cursor: "pointer", position: "relative" }}>
                <Avatar 
                  src={avatarPreview || groupDetails?.avatar?.[0]} 
                  sx={{ width: 120, height: 120, mb: 2, fontSize: "3rem", transition: "0.2s", "&:hover": { opacity: 0.7 } }}
                >
                  {groupDetails?.name ? groupDetails.name[0].toUpperCase() : "U"}
                </Avatar>
                <input 
                  type="file" 
                  id="group-avatar-upload" 
                  style={{ display: "none" }} 
                  accept="image/*"
                  onChange={handleAvatarChange}
                />
              </label>
            ) : (
              <Avatar 
                src={groupDetails?.avatar?.[0]} 
                sx={{ width: 120, height: 120, mb: 2, fontSize: "3rem" }}
              >
                {groupDetails?.name ? groupDetails.name[0].toUpperCase() : "U"}
              </Avatar>
            )}
            
            {isEditingName ? (
              <Stack direction="row" alignItems="center" spacing={1}>
                <TextField 
                  size="small" 
                  value={groupNameValue} 
                  onChange={(e) => setGroupNameValue(e.target.value)}
                  autoFocus
                />
                <IconButton onClick={handleUpdateGroup} disabled={isLoadingGroupName} color="primary">
                  <CheckIcon />
                </IconButton>
              </Stack>
            ) : (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h5" fontWeight="bold">{groupDetails?.name}</Typography>
                {isAdmin && (
                  <IconButton size="small" onClick={() => setIsEditingName(true)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            )}
            
            {isGroupChat && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {groupDetails?.members?.length} members
              </Typography>
            )}
          </Box>
        )}

        <Tabs value={tabIndex} onChange={handleTabChange} variant="fullWidth">
          {isGroupChat && <Tab label="Members" />}
          <Tab label="Media" />
          <Tab label="Docs" />
        </Tabs>

        <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
          {isGroupChat && tabIndex === 0 && (
            <Stack spacing={2}>
              {isAdmin && (
                <Button 
                  startIcon={<PersonAddIcon />} 
                  variant="outlined" 
                  color="primary" 
                  onClick={() => dispatch(setIsAddMember(true))}
                  sx={{ borderRadius: "2rem", py: 1 }}
                >
                  Add Member
                </Button>
              )}
              {groupDetails?.members?.map((member) => (
                <Box key={member._id} sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Avatar src={member.avatar}>
                    {member.name ? member.name[0].toUpperCase() : "U"}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body1" fontWeight={500}>{member.name}</Typography>
                    {groupDetails?.creator === member._id && (
                      <Typography variant="caption" color="primary">Group Creator</Typography>
                    )}
                    {groupDetails?.admins?.includes(member._id) && (
                      <Typography variant="caption" color="secondary" sx={{ ml: 1 }}>Admin</Typography>
                    )}
                  </Box>
                  {isAdmin && member._id !== user._id && (
                    <IconButton size="small" onClick={(e) => handleMenuOpen(e, member)}>
                      <MoreVertIcon />
                    </IconButton>
                  )}
                </Box>
              ))}
              
              {isAdmin && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>Group Settings</Typography>
                  <FormControlLabel
                    control={<Switch checked={groupDetails?.restrictedMessages || false} onChange={handleToggleRestrict} disabled={isLoadingRestrict} />}
                    label="Only Admins can send messages"
                  />
                </>
              )}

              {/* Leave/Delete Group */}
              <Divider sx={{ my: 2 }} />
              <Button 
                startIcon={isCreator ? <DeleteIcon /> : <ExitToAppIcon />}
                color="error"
                variant="text"
                onClick={() => setConfirmDeleteDialog(true)}
                fullWidth
              >
                {isCreator ? "Delete Group" : "Leave Group"}
              </Button>
            </Stack>
          )}

          {((isGroupChat && tabIndex === 1) || (!isGroupChat && tabIndex === 0)) && (
            isMediaLoading && mediaMessages.length === 0 ? (
              <CircularProgress sx={{ display: "block", m: "auto" }} />
            ) : imagesAndVideos.length === 0 ? (
              <Typography textAlign="center" color="text.secondary" mt={4}>No media shared yet.</Typography>
            ) : (
              <Grid container spacing={1}>
                {imagesAndVideos.map((att, idx) => (
                  <Grid item xs={4} key={idx}>
                    {fileFormat(att.url) === "image" ? (
                      <img src={att.url} alt="media" style={{ width: "100%", height: "100px", objectFit: "cover", borderRadius: "8px" }} />
                    ) : (
                      <video src={att.url} style={{ width: "100%", height: "100px", objectFit: "cover", borderRadius: "8px" }} />
                    )}
                  </Grid>
                ))}
              </Grid>
            )
          )}

          {((isGroupChat && tabIndex === 2) || (!isGroupChat && tabIndex === 1)) && (
            isMediaLoading && mediaMessages.length === 0 ? (
              <CircularProgress sx={{ display: "block", m: "auto" }} />
            ) : docs.length === 0 ? (
              <Typography textAlign="center" color="text.secondary" mt={4}>No documents shared yet.</Typography>
            ) : (
              <Stack spacing={1}>
                {docs.map((att, idx) => (
                  <Box key={idx} sx={{ display: "flex", alignItems: "center", gap: 2, p: 1, bgcolor: "rgba(0,0,0,0.05)", borderRadius: "8px" }}>
                    <DocIcon color="primary" />
                    <Typography variant="body2" noWrap sx={{ flex: 1 }}>Document</Typography>
                    <a href={att.url} target="_blank" rel="noreferrer" style={{ fontSize: "0.8rem", color: "blue" }}>Open</a>
                  </Box>
                ))}
              </Stack>
            )
          )}
        </Box>
      </Box>

      {/* Member Management Menu */}
      <Menu 
        anchorEl={anchorEl} 
        open={Boolean(anchorEl)} 
        onClose={handleMenuClose}
        disableScrollLock={true}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem onClick={handleToggleAdmin}>
          {groupDetails?.admins?.includes(selectedMember?._id) ? "Demote to Member" : "Promote to Admin"}
        </MenuItem>
        <MenuItem onClick={handleRemoveMember} sx={{ color: "error.main" }}>
          Remove from Group
        </MenuItem>
      </Menu>

      {/* Dialogs */}
      <Suspense fallback={<Backdrop open><CircularProgress color="inherit" /></Backdrop>}>
        {isAddMember && <AddMemberDialog chatId={chatId} />}
        {confirmDeleteDialog && (
          <ConfirmDeleteDialog 
            open={confirmDeleteDialog} 
            handleClose={() => setConfirmDeleteDialog(false)} 
            deleteHandler={handleDeleteOrLeaveGroup} 
            title={isCreator ? "Delete Group" : "Leave Group"}
            content={`Are you sure you want to ${isCreator ? "delete this group" : "leave this group"}? This action cannot be undone.`}
          />
        )}
      </Suspense>
    </Drawer>
  );
};

export default ChatDetailsDrawer;
