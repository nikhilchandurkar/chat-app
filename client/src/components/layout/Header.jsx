import {
  Add as AddIcon,
  Logout as LogoutIcon,
  Menu as MenuIcon,
  Notifications as NotificationsIcon,
  Search as SearchIcon,
  Star as StarIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  AccountCircle as AccountCircleIcon,
  Palette as PaletteIcon,
  Speed as SpeedIcon,
  Wifi as WifiIcon,
  MoreVert as MoreVertIcon,
  Security as SecurityIcon,
  AdminPanelSettings as AdminIcon,
} from "@mui/icons-material";
import {
  AppBar,
  Backdrop,
  Badge,
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material';
import axios from "axios";
import React, { Suspense, lazy, useState } from 'react';
import toast from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from 'react-router-dom';
import { server } from '../../constants/config';
import { userNotExists } from "../../redux/reducers/auth";
import { setIsMobile, setIsMobileProfile, setIsNotification, setIsSearch, setIsNewGroup, resetNotificationCount, setActiveChatId, toggleTheme } from "../../redux/reducers/misc";

const SearchDialog = lazy(() => import("../specific/Search"));
const NotificationsDialog = lazy(() => import("../specific/Notifications"));
const NewGroupsDialog = lazy(() => import("../specific/NewGroup"));
const StarredMessages = lazy(() => import("../specific/StarredMessages"));
const AppearanceSettingsDialog = lazy(() => import("../dialogs/AppearanceSettingsDialog"));
const DevicePerformanceDialog = lazy(() => import("../dialogs/DevicePerformanceDialog"));
const ConnectivityOfflineDialog = lazy(() => import("../dialogs/ConnectivityOfflineDialog"));
const SecurityDevicesDialog = lazy(() => import("../dialogs/SecurityDevicesDialog"));

const Header = ({ unreadMessagesCount = 0 }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { isSearch, isNotification, isNewGroup, notificationCount, themeMode } = useSelector(state => state.misc);
  const { user } = useSelector(state => state.auth);
  const isAdminUser = Boolean(user && (user.is_superuser || (user.role === "admin" && user.is_staff)));

  const [showStarred, setShowStarred] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [showConnectivity, setShowConnectivity] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [mobileMenuAnchor, setMobileMenuAnchor] = useState(null);

  const handleMobile = () => dispatch(setIsMobile(true));
  const openMobileProfile = () => dispatch(setIsMobileProfile(true));
  const openSearch = () => dispatch(setIsSearch(true));

  const addNewGroup = () => dispatch(setIsNewGroup(true));
  const openNotification = () => {
    dispatch(setIsNotification(true));
    dispatch(resetNotificationCount());
  };


  const logoutHandler = async () => {
    setMobileMenuAnchor(null);
    try {
      const { data } = await axios.post(`${server}/api/v1/user/logout`, {},
        { withCredentials: true });
      toast.success(data?.message || "Logged out successfully");
    } catch (error) {
      // Clear local session even if server cookie already expired
    } finally {
      localStorage.removeItem("chitChat-Token");
      localStorage.removeItem("access_token");
      dispatch(setActiveChatId(null));
      dispatch(userNotExists());
      navigate("/login", { replace: true });
    }
  };


  return (
    <>
      <Box sx={{ flexGrow: 1 }} height="4rem">
        <AppBar 
          elevation={0}
          position="fixed" 
          sx={{ 
            backgroundColor: themeMode === "dark" ? "#202522" : "#FFFFFF",
            color: themeMode === "dark" ? "#F1F3F0" : "#202421",
            borderBottom: `1px solid ${themeMode === "dark" ? "#343B36" : "#E3E6E1"}`,
            zIndex: 1200
          }}
        >
          <Toolbar >
              <Typography 
              variant="h6" 
              fontWeight={700}
              sx={{ display: { xs: "none", sm: "block" }, cursor: "pointer", letterSpacing: "-0.3px" }}
              onClick={() => {
                dispatch(setActiveChatId(null));
                dispatch(setIsNotification(false));
                navigate("/");
              }}
            >
              ChitChat
            </Typography>

            <Box sx={{ display: { xs: "block", sm: "none" } }}>
              <IconButton color="inherit" onClick={handleMobile}>
                <Badge badgeContent={unreadMessagesCount} color="error">
                  <MenuIcon />
                </Badge>
              </IconButton>
            </Box>
            <Box sx={{ flexGrow: 1 }} />
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <IconBtn 
                title="Profile" 
                icon={<AccountCircleIcon />} 
                onClick={openMobileProfile} 
                sx={{ display: { xs: "inline-flex", md: "none" } }} 
              />
              <IconBtn title="Search" icon={<SearchIcon />} onClick={openSearch} />
              <IconBtn title="New Group" icon={<AddIcon />} onClick={addNewGroup} />
              <IconBtn title="Notifications" icon={<Badge badgeContent={notificationCount} color="error"><NotificationsIcon /></Badge>} onClick={openNotification} />

              {/* Desktop Quick Actions */}
              <Box sx={{ display: { xs: "none", md: "inline-flex" }, alignItems: "center" }}>
                <IconBtn title="Starred Messages" icon={<StarIcon />} onClick={() => setShowStarred(true)} />
                <IconBtn title="Appearance & Experience" icon={<PaletteIcon />} onClick={() => setShowAppearance(true)} />
                <IconBtn title="Security & Shared Sessions" icon={<SecurityIcon />} onClick={() => setShowSecurity(true)} />
                {isAdminUser && (
                  <IconBtn title="Superadmin Dashboard" icon={<AdminIcon color="secondary" />} onClick={() => navigate("/admin-panel")} />
                )}
                <IconBtn title="Device & Performance" icon={<SpeedIcon />} onClick={() => setShowPerformance(true)} />
                <IconBtn title="Connectivity & Offline" icon={<WifiIcon />} onClick={() => setShowConnectivity(true)} />
                <IconBtn 
                  title={themeMode === 'dark' ? "Light Mode" : "Dark Mode"} 
                  icon={themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />} 
                  onClick={() => dispatch(toggleTheme())} 
                />
                <IconBtn title="Logout" icon={<LogoutIcon />} onClick={logoutHandler} />
              </Box>

              {/* Mobile Overflow Menu so toolbar never clips on narrow Android screens */}
              <Box sx={{ display: { xs: "inline-flex", md: "none" } }}>
                <IconButton color="inherit" aria-label="More options" onClick={(e) => setMobileMenuAnchor(e.currentTarget)}>
                  <MoreVertIcon />
                </IconButton>
                <Menu
                  anchorEl={mobileMenuAnchor}
                  open={Boolean(mobileMenuAnchor)}
                  onClose={() => setMobileMenuAnchor(null)}
                >
                  <MenuItem onClick={() => { setMobileMenuAnchor(null); setShowStarred(true); }}>
                    <ListItemIcon><StarIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Starred Messages</ListItemText>
                  </MenuItem>
                  <MenuItem onClick={() => { setMobileMenuAnchor(null); setShowAppearance(true); }}>
                    <ListItemIcon><PaletteIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Appearance</ListItemText>
                  </MenuItem>
                  <MenuItem onClick={() => { setMobileMenuAnchor(null); setShowSecurity(true); }}>
                    <ListItemIcon><SecurityIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Security &amp; Shared Sessions</ListItemText>
                  </MenuItem>
                  {isAdminUser && (
                    <MenuItem onClick={() => { setMobileMenuAnchor(null); navigate("/admin-panel"); }}>
                      <ListItemIcon><AdminIcon fontSize="small" color="secondary" /></ListItemIcon>
                      <ListItemText>Admin Dashboard</ListItemText>
                    </MenuItem>
                  )}
                  <MenuItem onClick={() => { setMobileMenuAnchor(null); setShowPerformance(true); }}>
                    <ListItemIcon><SpeedIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Device & Performance</ListItemText>
                  </MenuItem>
                  <MenuItem onClick={() => { setMobileMenuAnchor(null); setShowConnectivity(true); }}>
                    <ListItemIcon><WifiIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Connectivity & Sync</ListItemText>
                  </MenuItem>
                  <MenuItem onClick={() => { setMobileMenuAnchor(null); dispatch(toggleTheme()); }}>
                    <ListItemIcon>{themeMode === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}</ListItemIcon>
                    <ListItemText>{themeMode === "dark" ? "Light Mode" : "Dark Mode"}</ListItemText>
                  </MenuItem>
                  <MenuItem onClick={logoutHandler} sx={{ color: "error.main" }}>
                    <ListItemIcon><LogoutIcon fontSize="small" color="error" /></ListItemIcon>
                    <ListItemText>Log Out</ListItemText>
                  </MenuItem>
                </Menu>
              </Box>
            </Box>
          </Toolbar>
        </AppBar>
      </Box>

      {isSearch && (
        <Suspense fallback={<Backdrop open><Typography>Loading...</Typography></Backdrop>}>
          <SearchDialog />
        </Suspense>
      )}

      {isNotification && (
        <Suspense fallback={<Backdrop open><Typography>Loading...</Typography></Backdrop>}>
          <NotificationsDialog />
        </Suspense>
      )}

      {isNewGroup && (
        <Suspense fallback={<Backdrop open><Typography>Loading...</Typography></Backdrop>}>
          <NewGroupsDialog />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <StarredMessages open={showStarred} onClose={() => setShowStarred(false)} />
      </Suspense>

      <Suspense fallback={null}>
        <AppearanceSettingsDialog open={showAppearance} onClose={() => setShowAppearance(false)} />
      </Suspense>

      <Suspense fallback={null}>
        <DevicePerformanceDialog open={showPerformance} onClose={() => setShowPerformance(false)} />
      </Suspense>

      <Suspense fallback={null}>
        <ConnectivityOfflineDialog open={showConnectivity} onClose={() => setShowConnectivity(false)} />
      </Suspense>

      <Suspense fallback={null}>
        <SecurityDevicesDialog open={showSecurity} onClose={() => setShowSecurity(false)} />
      </Suspense>
    </>
  );
};

import { motion } from "framer-motion";

const IconBtn = ({ title, icon, onClick, sx }) => {
  return (
    <Tooltip title={title}>
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} style={{ display: 'inline-block' }}>
        <IconButton color="inherit" size="large" onClick={onClick} aria-label={title} sx={sx}>
          {icon}
        </IconButton>
      </motion.div>
    </Tooltip>
  );
};

export default Header;
