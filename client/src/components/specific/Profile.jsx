import {
  CalendarMonth as CalendarIcon,
  Face as FaceIcon,
  AlternateEmail as UsernameIcon,
  CameraAlt as CameraAltIcon,
  Lock as LockIcon,
  Email as EmailIcon,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import {
  Avatar, Box, Button, Collapse, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, Divider, IconButton, InputAdornment,
  Stack, TextField, Typography
} from "@mui/material";
import moment from "moment";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { transformImage } from "../../lib/feature";
import {
  useUpdateProfileMutation,
  useDeleteProfileMutation,
  useChangePasswordMutation,
  useUpdateStatusMutation,
  useUpdatePrivacyMutation,
} from "../../redux/api/api";
import { userExists, userNotExists } from "../../redux/reducers/auth";
import toast from "react-hot-toast";
import { VisuallyHiddenInput } from "../styles/StyledComponents";
import StatusSelector from "./StatusSelector";

const Profile = () => {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar?.url ? transformImage(user.avatar.url) : "");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Change password state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [updateProfile, { isLoading: isUpdating }] = useUpdateProfileMutation();
  const [deleteProfile, { isLoading: isDeleting }] = useDeleteProfileMutation();
  const [changePassword, { isLoading: isChangingPassword }] = useChangePasswordMutation();
  const [updateStatus] = useUpdateStatusMutation();
  const [updatePrivacy, { isLoading: isUpdatingPrivacy }] = useUpdatePrivacyMutation();

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) { setAvatar(file); setAvatarPreview(URL.createObjectURL(file)); }
  };

  const handleSave = async () => {
    const toastId = toast.loading("Updating profile...");
    const formData = new FormData();
    formData.append("name", name);
    formData.append("bio", bio);
    if (avatar) formData.append("avatar", avatar);
    try {
      const res = await updateProfile(formData).unwrap();
      dispatch(userExists(res.user));
      setIsEditing(false);
      toast.success("Profile updated!", { id: toastId });
    } catch (error) {
      toast.error(error?.data?.message || "Failed to update profile", { id: toastId });
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    const toastId = toast.loading("Changing password...");
    try {
      await changePassword({ currentPassword, newPassword }).unwrap();
      toast.success("Password changed successfully!", { id: toastId });
      setShowPasswordForm(false);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      toast.error(err?.data?.message || "Failed to change password", { id: toastId });
    }
  };

  const handleStatusChange = async (status) => {
    try {
      await updateStatus({ status }).unwrap();
      dispatch(userExists({ ...user, status }));
      toast.success(`Status set to ${status}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handlePrivacyChange = async (e) => {
    const profilePrivacy = e.target.value;
    const toastId = toast.loading("Updating privacy settings...");
    try {
      await updatePrivacy({ profile: profilePrivacy }).unwrap();
      dispatch(userExists({ ...user, privacy: { ...user.privacy, profile: profilePrivacy } }));
      toast.success("Privacy updated", { id: toastId });
    } catch {
      toast.error("Failed to update privacy", { id: toastId });
    }
  };

  const handleDelete = async () => {
    const toastId = toast.loading("Deleting account...");
    try {
      await deleteProfile().unwrap();
      dispatch(userNotExists());
      toast.success("Account deleted", { id: toastId });
    } catch (error) {
      toast.error(error?.data?.message || "Failed to delete account", { id: toastId });
    }
  };

  return (
    <Stack spacing="1.5rem" direction="column" alignItems="center">
      {/* Avatar Container with Gradient */}
      <Box 
        sx={{ 
          position: "relative", 
          borderRadius: "50%", 
        }}
      >
        <Avatar
          src={avatarPreview}
          alt={user?.name || "User"}
          sx={{ width: 180, height: 180, objectFit: "cover", border: "4px solid", borderColor: "background.paper", fontSize: "4rem" }}
        >
          {user?.name ? user.name[0].toUpperCase() : user?.username ? user.username[0].toUpperCase() : "U"}
        </Avatar>
        {isEditing && (
          <IconButton
            sx={{ position: "absolute", bottom: 10, right: 10, color: "white", bgcolor: "primary.main", boxShadow: 2, ":hover": { bgcolor: "primary.dark" } }}
            component="label"
          >
            <CameraAltIcon />
            <VisuallyHiddenInput type="file" onChange={handleAvatarChange} />
          </IconButton>
        )}
      </Box>

      {/* Status selector (always visible) */}
      <StatusSelector currentStatus={user?.status || "online"} onStatusChange={handleStatusChange} />

      {isEditing ? (
        <Stack spacing="1rem" width="100%" maxWidth="300px">
          <TextField label="Name" variant="outlined" fullWidth value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Bio" variant="outlined" fullWidth multiline value={bio} onChange={(e) => setBio(e.target.value)} />
          <Stack direction="row" spacing="1rem">
            <Button variant="contained" fullWidth onClick={handleSave} disabled={isUpdating}>Save</Button>
            <Button variant="outlined" color="secondary" fullWidth onClick={() => setIsEditing(false)}>Cancel</Button>
          </Stack>

          <Divider sx={{ my: 1 }} />

          {/* Change Password Section */}
          <Button
            variant="text"
            startIcon={<LockIcon />}
            onClick={() => setShowPasswordForm((s) => !s)}
            size="small"
            sx={{ color: "rgba(255,255,255,0.7)" }}
          >
            {showPasswordForm ? "Hide" : "Change Password"}
          </Button>
          <Collapse in={showPasswordForm}>
            <form onSubmit={handleChangePassword}>
              <Stack spacing={1}>
                <TextField
                  label="Current Password" type={showPwd ? "text" : "password"} size="small" fullWidth
                  value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPwd((s) => !s)} edge="end" size="small">
                          {showPwd ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField label="New Password" type={showPwd ? "text" : "password"} size="small" fullWidth value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                <TextField label="Confirm New Password" type={showPwd ? "text" : "password"} size="small" fullWidth value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                <Button type="submit" variant="contained" size="small" color="warning" disabled={isChangingPassword}>
                  {isChangingPassword ? "Changing..." : "Update Password"}
                </Button>
              </Stack>
            </form>
          </Collapse>
        </Stack>
      ) : (
        <Stack spacing={2} width="100%" alignItems="center">
          <ProfileCard heading="Bio" text={user?.bio || "No bio"} Icon={FaceIcon} />
          <ProfileCard heading="Username" text={`@${user?.username}`} Icon={UsernameIcon} />
          <ProfileCard heading="Name" text={user?.name} Icon={FaceIcon} />
          <ProfileCard heading="Email" text={user?.email || "Not set"} Icon={EmailIcon} />
          <ProfileCard heading="Joined" text={moment(user?.createdAt).fromNow()} Icon={CalendarIcon} />
          
          <Divider sx={{ my: 2, width: "100%", maxWidth: "350px" }} />
          
          <TextField
            select
            label="Profile Visibility"
            size="medium"
            value={user?.privacy?.profile || "everyone"}
            onChange={handlePrivacyChange}
            disabled={isUpdatingPrivacy}
            SelectProps={{ native: true }}
            sx={{ width: "100%", maxWidth: "350px", "& .MuiOutlinedInput-root": { borderRadius: "1rem" } }}
          >
            <option value="everyone">Everyone</option>
            <option value="friends">Friends Only</option>
            <option value="nobody">Nobody</option>
          </TextField>

          <Stack direction="row" spacing={2} mt={2} width="100%" maxWidth="350px">
            <Button variant="contained" color="primary" fullWidth onClick={() => setIsEditing(true)} sx={{ borderRadius: "2rem", py: 1 }}>
              Edit Profile
            </Button>
            <Button variant="outlined" color="error" fullWidth onClick={() => setIsDeleteDialogOpen(true)} sx={{ borderRadius: "2rem", py: 1 }}>
              Delete Account
            </Button>
          </Stack>
        </Stack>
      )}

      {/* Delete confirmation */}
      <Dialog open={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)} PaperProps={{ sx: { borderRadius: "1rem" } }}>
        <DialogTitle fontWeight={600}>Delete Account?</DialogTitle>
        <DialogContent>
          <DialogContentText color="text.secondary">
            Are you sure you want to permanently delete your account? This action cannot be undone and you will lose all chats.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setIsDeleteDialogOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={isDeleting} sx={{ borderRadius: "2rem", px: 3 }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

const ProfileCard = ({ text, Icon, heading }) => (
  <Stack 
    direction="row" 
    spacing="1.2rem" 
    alignItems="center" 
    sx={{ 
      width: "100%", 
      maxWidth: "350px",
      p: 2, 
      bgcolor: "background.paper", 
      borderRadius: "1rem", 
      boxShadow: "0 4px 15px rgba(0,0,0,0.03)",
      border: "1px solid",
      borderColor: "divider",
      transition: "transform 0.2s ease, box-shadow 0.2s ease",
      "&:hover": { transform: "translateY(-2px)", boxShadow: "0 8px 25px rgba(0,0,0,0.08)" }
    }}
  >
    {Icon && (
      <Box sx={{ p: 1, bgcolor: "primary.light", borderRadius: "50%", color: "primary.dark", display: "flex" }}>
        <Icon />
      </Box>
    )}
    <Stack alignItems="flex-start" sx={{ minWidth: 0, flex: 1 }}>
      <Typography variant="body1" fontWeight={600} color="text.primary" sx={{ fontFamily: "'Inter', sans-serif", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {text}
      </Typography>
      <Typography variant="caption" color="text.secondary" fontWeight={500} sx={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {heading}
      </Typography>
    </Stack>
  </Stack>
);

export default Profile;
