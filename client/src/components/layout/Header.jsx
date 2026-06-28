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
} from "@mui/icons-material";
import {
  AppBar,
  Backdrop,
  Badge,
  Box,
  IconButton,
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
import { userExists } from "../../redux/reducers/auth";
import { setIsMobile, setIsMobileProfile, setIsNotification, setIsSearch, resetNotificationCount, setActiveChatId, toggleTheme } from "../../redux/reducers/misc";


const SearchDialog = lazy(() => import("../specific/Search"));
const NotificationsDialog = lazy(() => import("../specific/Notifications"));
const NewGroupsDialog = lazy(() => import("../specific/NewGroup"));
const StarredMessages = lazy(() => import("../specific/StarredMessages"));


const Header = ({ unreadMessagesCount = 0 }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { isSearch, isNotification, notificationCount, themeMode } = useSelector(state => state.misc);

  const [isNewGroup, setIsNewGroup] = useState(false);
  const [showStarred, setShowStarred] = useState(false);

  const handleMobile = () => dispatch(setIsMobile(true));
  const openMobileProfile = () => dispatch(setIsMobileProfile(true));
  const openSearch = () => dispatch(setIsSearch(true));

  const addNewGroup = () => setIsNewGroup((prev) => !prev);
  const openNotification = () => {
    dispatch(setIsNotification(true));
    dispatch(resetNotificationCount());
  };


  const logoutHandler = async () => {
    try {
      const { data } = await axios.post(`${server}/api/v1/user/logout`, {},
        { withCredentials: true, });
      dispatch(userExists());
      toast.success(data.message);
    } catch (error) {
      toast.error(error?.response?.data?.message || "something went wrong");
    }
  };


  return (
    <>
      <Box sx={{ flexGrow: 1 }} height="4rem">
        <AppBar color={"secondary"} position="static" >
          <Toolbar >
            <Typography 
              variant="h6" 
              sx={{ display: { xs: "none", sm: "block" }, cursor: "pointer" }}
              onClick={() => {
                dispatch(setActiveChatId(null));
                dispatch(setIsNotification(false));
                navigate("/");
              }}
            >
              Chat App
            </Typography>

            <Box sx={{ display: { xs: "block", sm: "none" } }}>
              <IconButton color="inherit" onClick={handleMobile}>
                <Badge badgeContent={unreadMessagesCount} color="error">
                  <MenuIcon />
                </Badge>
              </IconButton>
            </Box>
            <Box sx={{ flexGrow: 1 }} />
            <Box>
              <IconBtn 
                title="Profile" 
                icon={<AccountCircleIcon />} 
                onClick={openMobileProfile} 
                sx={{ display: { xs: "inline-flex", md: "none" } }} 
              />
              <IconBtn title="Search" icon={<SearchIcon />} onClick={openSearch} />
              <IconBtn title="New Group" icon={<AddIcon />} onClick={addNewGroup} />
              <IconBtn title="Starred Messages" icon={<StarIcon />} onClick={() => setShowStarred(true)} />
              <IconBtn 
                title={themeMode === 'dark' ? "Light Mode" : "Dark Mode"} 
                icon={themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />} 
                onClick={() => dispatch(toggleTheme())} 
              />
              <IconBtn title="Notifications" icon={<Badge badgeContent={notificationCount} color="error"><NotificationsIcon /></Badge>} onClick={openNotification} />
              <IconBtn title="Logout" icon={<LogoutIcon />} onClick={logoutHandler} />
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
    </>
  );
};

const IconBtn = ({ title, icon, onClick, sx }) => {
  return (
    <Tooltip title={title}>
      <IconButton color="inherit" size="large" onClick={onClick} aria-label={title} sx={sx}>
        {icon}
      </IconButton>
    </Tooltip>
  );
};

export default Header;
