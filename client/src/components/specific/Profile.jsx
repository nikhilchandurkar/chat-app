import {
  CalendarMonth as CalendarIcon,
  Face as FaceIcon,
  AlternateEmail as UsernameIcon,
  CameraAlt as CameraAltIcon,
  Lock as LockIcon,
  Email as EmailIcon,
  Visibility,
  VisibilityOff,
  Security as SecurityIcon,
  AdminPanelSettings as AdminIcon,
  Block as BlockIcon,
  NotificationsActive as PushIcon,
  ExpandMore as ExpandIcon,
} from "@mui/icons-material";
import {
  Avatar, Box, Button, Chip, Collapse, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, Divider, FormControlLabel, IconButton, InputAdornment,
  Paper, Stack, Switch, TextField, Typography
} from "@mui/material";
import React, { useEffect, useState, lazy, Suspense } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { setFontFamily } from "../../redux/reducers/misc";
import { formatTimeAgo, transformImage } from "../../lib/feature";
import {
  isPrivacyBlurEnabled,
  isScreenshotBlockEnabled,
  setPrivacyBlurPreference,
  setScreenshotBlockPreference,
} from "../../utils/feedback";
import {
  canUseNativeBiometricUnlock,
  disableAppLock,
  enableAppLockWithPin,
  isAppLockEnabled,
  isBiometricUnlockEnabled,
  setBiometricUnlockPreference,
} from "../../utils/appLock";
import { isWebPushSupported, subscribeBrowserPushNotifications } from "../../utils/pushNotifications";
import {
  useUpdateProfileMutation,
  useDeleteProfileMutation,
  useChangePasswordMutation,
  useUpdateStatusMutation,
  useUpdatePrivacyMutation,
  useGetBlockedUsersQuery,
  useUnblockUserMutation,
  useGetNotificationPrefsQuery,
  useUpdateNotificationPrefsMutation,
} from "../../redux/api/api";
import { userExists, userNotExists } from "../../redux/reducers/auth";
import toast from "react-hot-toast";
import { VisuallyHiddenInput } from "../styles/StyledComponents";
import StatusSelector from "./StatusSelector";

const SecurityDevicesDialog = lazy(() => import("../dialogs/SecurityDevicesDialog"));

const Profile = () => {
  const { user } = useSelector((state) => state.auth);
  const { fontFamily } = useSelector((state) => state.misc);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [blockScreenshots, setBlockScreenshots] = useState(isScreenshotBlockEnabled);
  const [blurOnSwitch, setBlurOnSwitch] = useState(isPrivacyBlurEnabled);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [appLockOpen, setAppLockOpen] = useState(false);
  const [appLockActive, setAppLockActive] = useState(isAppLockEnabled);
  const [biometricPref, setBiometricPref] = useState(isBiometricUnlockEnabled);
  const [nativeBiometricSupported, setNativeBiometricSupported] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pushBusy, setPushBusy] = useState(false);

  const [updatePrivacy, { isLoading: isUpdatingPrivacy }] = useUpdatePrivacyMutation();
  const { data: blockedData } = useGetBlockedUsersQuery(undefined, { skip: !blockedOpen });
  const [unblockUser] = useUnblockUserMutation();
  const { data: notifPrefsData } = useGetNotificationPrefsQuery(undefined, { skip: !pushOpen });
  const [updateNotifPrefs] = useUpdateNotificationPrefsMutation();

  const [privacyForm, setPrivacyForm] = useState(() => ({
    privacy_avatar: user?.profile?.privacy_avatar || "everyone",
    privacy_online: user?.profile?.privacy_online || "everyone",
    privacy_last_seen: user?.profile?.privacy_last_seen || "everyone",
    who_can_add_to_groups: user?.profile?.who_can_add_to_groups || "everyone",
    who_can_message_me: user?.profile?.who_can_message_me || "everyone",
    hide_from_search: Boolean(user?.profile?.hide_from_search),
    privacy_read_receipts: user?.profile?.privacy_read_receipts !== false,
    privacy_typing_indicator: user?.profile?.privacy_typing_indicator !== false,
  }));

  useEffect(() => {
    canUseNativeBiometricUnlock().then(setNativeBiometricSupported).catch(() => {});
  }, []);

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar?.url ? transformImage(user.avatar.url) : "");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);

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
      localStorage.removeItem("chitChat-Token");
      localStorage.removeItem("access_token");
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
          boxShadow: "0 0 20px rgba(0, 122, 255, 0.3)", // Glowing Apple Blue shadow
        }}
      >
        <Avatar
          src={avatarPreview}
          alt={user?.name || "User"}
          imgProps={{ draggable: false }}
          onContextMenu={(e) => blockScreenshots && e.preventDefault()}
          sx={{ width: { xs: 120, sm: 150 }, height: { xs: 120, sm: 150 }, objectFit: "cover", border: "4px solid", borderColor: "background.paper", fontSize: "3.2rem", userSelect: "none" }}
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
            sx={{ color: "text.secondary" }}
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
          <ProfileCard heading="Name" text={user?.name || user?.username} Icon={FaceIcon} />
          <ProfileCard heading="Email" text={user?.email || "Not set"} Icon={EmailIcon} />
          <ProfileCard heading="Joined" text={formatTimeAgo(user?.created_at || user?.createdAt)} Icon={CalendarIcon} />
          
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

          <TextField
            select
            label="App Font Family"
            size="medium"
            value={fontFamily || "Inter"}
            onChange={(e) => dispatch(setFontFamily(e.target.value))}
            SelectProps={{ native: true }}
            sx={{ width: "100%", maxWidth: "350px", "& .MuiOutlinedInput-root": { borderRadius: "1rem" } }}
          >
            <option value="Inter">Inter (Modern Sans)</option>
            <option value="Outfit">Outfit (Sleek Geometric)</option>
            <option value="Poppins">Poppins (Rounded)</option>
            <option value="Roboto">Roboto (Classic Material)</option>
          </TextField>

          <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
            {(user?.is_superuser || (user?.role === "admin" && user?.is_staff)) && (
              <Chip
                icon={<AdminIcon />}
                label="Superadmin Dashboard"
                size="small"
                color="primary"
                variant="outlined"
                onClick={() => navigate("/admin-panel")}
                clickable
              />
            )}
            <Chip
              icon={<SecurityIcon />}
              label={user?.mfa_enabled ? "2FA Active" : "2FA Off"}
              size="small"
              color={user?.mfa_enabled ? "success" : "default"}
              onClick={() => setIsSecurityOpen(true)}
            />
          </Stack>

          <Paper variant="outlined" sx={{ width: "100%", maxWidth: "350px", p: 1.5, borderRadius: 2 }}>
            <Typography variant="caption" fontWeight={700} color="primary" display="block" mb={0.5}>
              Screen Privacy Shield
            </Typography>
            <Stack spacing={0.25}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={blockScreenshots}
                    onChange={(e) => {
                      setBlockScreenshots(e.target.checked);
                      setScreenshotBlockPreference(e.target.checked);
                    }}
                  />
                }
                label={<Typography variant="caption">Block Screenshots &amp; Screen Recording</Typography>}
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={blurOnSwitch}
                    onChange={(e) => {
                      setBlurOnSwitch(e.target.checked);
                      setPrivacyBlurPreference(e.target.checked);
                    }}
                  />
                }
                label={<Typography variant="caption">Blur Preview When Switching Apps</Typography>}
              />
            </Stack>
          </Paper>

          {/* Granular Account Privacy Controls */}
          <Paper variant="outlined" sx={{ width: "100%", maxWidth: "350px", p: 1.5, borderRadius: 2 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              onClick={() => setPrivacyOpen((v) => !v)}
              sx={{ cursor: "pointer" }}
            >
              <Typography variant="caption" fontWeight={700} color="primary">
                Privacy &amp; Visibility Controls
              </Typography>
              <ExpandIcon fontSize="small" sx={{ transform: privacyOpen ? "rotate(180deg)" : "none", transition: "0.2s" }} />
            </Stack>
            <Collapse in={privacyOpen}>
              <Stack spacing={1.25} pt={1.25}>
                {[
                  { key: "privacy_avatar", label: "Who can see my photo" },
                  { key: "privacy_online", label: "Who can see I'm online" },
                  { key: "privacy_last_seen", label: "Who can see my last seen" },
                  { key: "who_can_add_to_groups", label: "Who can add me to groups" },
                  { key: "who_can_message_me", label: "Who can DM me" },
                ].map((item) => (
                  <TextField
                    key={item.key}
                    select
                    size="small"
                    fullWidth
                    label={item.label}
                    SelectProps={{ native: true }}
                    value={privacyForm[item.key]}
                    onChange={(e) => setPrivacyForm((prev) => ({ ...prev, [item.key]: e.target.value }))}
                  >
                    <option value="everyone">Everyone</option>
                    <option value="contacts">Contacts Only</option>
                    <option value="nobody">Nobody</option>
                  </TextField>
                ))}
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={privacyForm.hide_from_search}
                      onChange={(e) => setPrivacyForm((p) => ({ ...p, hide_from_search: e.target.checked }))}
                    />
                  }
                  label={<Typography variant="caption">Hide Me From User Search</Typography>}
                />
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={privacyForm.privacy_read_receipts}
                      onChange={(e) => setPrivacyForm((p) => ({ ...p, privacy_read_receipts: e.target.checked }))}
                    />
                  }
                  label={<Typography variant="caption">Send Read Receipts</Typography>}
                />
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={privacyForm.privacy_typing_indicator}
                      onChange={(e) => setPrivacyForm((p) => ({ ...p, privacy_typing_indicator: e.target.checked }))}
                    />
                  }
                  label={<Typography variant="caption">Show Typing Indicator</Typography>}
                />
                <Button
                  size="small"
                  variant="contained"
                  disabled={isUpdatingPrivacy}
                  onClick={async () => {
                    try {
                      await updatePrivacy(privacyForm).unwrap();
                      toast.success("Privacy settings saved");
                    } catch {
                      toast.error("Failed to save privacy settings");
                    }
                  }}
                >
                  Save Privacy Preferences
                </Button>
              </Stack>
            </Collapse>
          </Paper>

          {/* App Lock (PIN + Native Biometric) */}
          <Paper variant="outlined" sx={{ width: "100%", maxWidth: "350px", p: 1.5, borderRadius: 2 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              onClick={() => setAppLockOpen((v) => !v)}
              sx={{ cursor: "pointer" }}
            >
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <LockIcon fontSize="small" color="primary" />
                <Typography variant="caption" fontWeight={700} color="primary">
                  App Lock ({appLockActive ? "ON" : "OFF"})
                </Typography>
              </Stack>
              <ExpandIcon fontSize="small" sx={{ transform: appLockOpen ? "rotate(180deg)" : "none", transition: "0.2s" }} />
            </Stack>
            <Collapse in={appLockOpen}>
              <Stack spacing={1} pt={1.25}>
                {appLockActive ? (
                  <>
                    {nativeBiometricSupported && (
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={biometricPref}
                            onChange={(e) => {
                              setBiometricPref(e.target.checked);
                              setBiometricUnlockPreference(e.target.checked);
                            }}
                          />
                        }
                        label={<Typography variant="caption">Allow Fingerprint / Device Unlock</Typography>}
                      />
                    )}
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      onClick={() => {
                        disableAppLock();
                        setAppLockActive(false);
                        toast.success("App Lock disabled");
                      }}
                    >
                      Disable App Lock
                    </Button>
                  </>
                ) : (
                  <Stack direction="row" spacing={1}>
                    <TextField
                      size="small"
                      type="password"
                      placeholder="Set 4-6 digit PIN"
                      inputProps={{ inputMode: "numeric", maxLength: 6 }}
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      fullWidth
                    />
                    <Button
                      size="small"
                      variant="contained"
                      onClick={async () => {
                        try {
                          await enableAppLockWithPin(pinInput);
                          setPinInput("");
                          setAppLockActive(true);
                          toast.success("App Lock enabled");
                        } catch (err) {
                          toast.error(err?.message || "Invalid PIN");
                        }
                      }}
                    >
                      Enable
                    </Button>
                  </Stack>
                )}
              </Stack>
            </Collapse>
          </Paper>

          {/* Push Notifications */}
          <Paper variant="outlined" sx={{ width: "100%", maxWidth: "350px", p: 1.5, borderRadius: 2 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              onClick={() => setPushOpen((v) => !v)}
              sx={{ cursor: "pointer" }}
            >
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <PushIcon fontSize="small" color="primary" />
                <Typography variant="caption" fontWeight={700} color="primary">
                  Push Notification Alerts
                </Typography>
              </Stack>
              <ExpandIcon fontSize="small" sx={{ transform: pushOpen ? "rotate(180deg)" : "none", transition: "0.2s" }} />
            </Stack>
            <Collapse in={pushOpen}>
              <Stack spacing={1} pt={1.25}>
                {isWebPushSupported() && (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={pushBusy}
                    onClick={async () => {
                      setPushBusy(true);
                      try {
                        const res = await subscribeBrowserPushNotifications();
                        if (res.subscribed) toast.success("Push notifications enabled!");
                        else toast(res.reason || "Check browser notification settings");
                      } catch {
                        toast.error("Failed to enable push notifications");
                      } finally {
                        setPushBusy(false);
                      }
                    }}
                  >
                    {pushBusy ? "Configuring..." : "Enable Browser Push Alerts"}
                  </Button>
                )}
                {notifPrefsData?.preferences && (
                  <>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={Boolean(notifPrefsData.preferences.push_enabled)}
                          onChange={(e) => updateNotifPrefs({ push_enabled: e.target.checked })}
                        />
                      }
                      label={<Typography variant="caption">Push Alerts Enabled</Typography>}
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={Boolean(notifPrefsData.preferences.show_message_preview)}
                          onChange={(e) => updateNotifPrefs({ show_message_preview: e.target.checked })}
                        />
                      }
                      label={<Typography variant="caption">Show Message Preview in Alert</Typography>}
                    />
                  </>
                )}
              </Stack>
            </Collapse>
          </Paper>

          {/* Blocked Users */}
          <Paper variant="outlined" sx={{ width: "100%", maxWidth: "350px", p: 1.5, borderRadius: 2 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              onClick={() => setBlockedOpen((v) => !v)}
              sx={{ cursor: "pointer" }}
            >
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <BlockIcon fontSize="small" color="error" />
                <Typography variant="caption" fontWeight={700} color="text.primary">
                  Blocked Users
                </Typography>
              </Stack>
              <ExpandIcon fontSize="small" sx={{ transform: blockedOpen ? "rotate(180deg)" : "none", transition: "0.2s" }} />
            </Stack>
            <Collapse in={blockedOpen}>
              <Stack spacing={0.75} pt={1}>
                {!(blockedData?.blockedUsers || []).length ? (
                  <Typography variant="caption" color="text.secondary">No blocked users.</Typography>
                ) : (
                  blockedData.blockedUsers.map((bu) => (
                    <Stack key={bu._id} direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="caption" fontWeight={600} noWrap>
                        {bu.name || bu.username} (@{bu.username})
                      </Typography>
                      <Button
                        size="small"
                        onClick={async () => {
                          await unblockUser(bu._id);
                          toast.success(`Unblocked ${bu.username}`);
                        }}
                      >
                        Unblock
                      </Button>
                    </Stack>
                  ))
                )}
              </Stack>
            </Collapse>
          </Paper>

          <Button
            variant="outlined"
            color="primary"
            fullWidth
            startIcon={<SecurityIcon />}
            onClick={() => setIsSecurityOpen(true)}
            sx={{ maxWidth: "350px", borderRadius: "2rem", py: 1 }}
          >
            Security &amp; Shared Sessions
          </Button>

          <Stack direction="row" spacing={2} mt={1} width="100%" maxWidth="350px">
            <Button variant="contained" color="primary" fullWidth onClick={() => setIsEditing(true)} sx={{ borderRadius: "2rem", py: 1 }}>
              Edit Profile
            </Button>
            <Button variant="outlined" color="error" fullWidth onClick={() => setIsDeleteDialogOpen(true)} sx={{ borderRadius: "2rem", py: 1 }}>
              Delete Account
            </Button>
          </Stack>
        </Stack>
      )}

      <Suspense fallback={null}>
        <SecurityDevicesDialog open={isSecurityOpen} onClose={() => setIsSecurityOpen(false)} />
      </Suspense>

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
