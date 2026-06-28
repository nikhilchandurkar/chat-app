import { Drawer, Grid, Skeleton, Box } from '@mui/material';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom'; // Remove this if unused elsewhere, but leave for now to avoid errors.
import sampleChats from '../../constants/sampleData';
import { useErrors } from '../../hooks/hook';
import { useMyChatsQuery, useGetNotificationsQuery } from '../../redux/api/api';
import { getSocket } from '../../socket';
import { NEW_REQUEST, ONLINE_USERS, NEW_MESSAGE_ALERT, START_TYPING, STOP_TYPING, REFETCH_CHATS } from '../../constants/events';
import { useSocketEvents } from '../../hooks/hook';
import { incrementNotificationCount, setIsMobile, setIsMobileProfile, setNotificationCount } from '../../redux/reducers/misc';
import { useCallback, useState, useEffect } from 'react';
import ChatList from '../specific/ChatList';
import Profile from '../specific/Profile';
import Header from './Header';
import toast from 'react-hot-toast';
import { NEW_MESSAGE } from '../../constants/events';



const AppLayout = () => (WrappedComponent) => {
  
  
  return (props) => {
    const { activeChatId: chatId } = useSelector((state) => state.misc);
    const dispatch = useDispatch();
    const params = useParams();
    const { data, isLoading, isError, refetch, error } = useMyChatsQuery("")
    
    const socket = getSocket();
    const { user } = useSelector((state) => state.auth);
    const { isMobile, isMobileProfile, notificationCount } = useSelector((state) => state.misc);
    
    // Fetch initial notification count
    const { data: notificationsData } = useGetNotificationsQuery();
    
    useEffect(() => {
      if (notificationsData?.allRequests) {
        // If the backend has pending requests, sync the Redux count
        dispatch(setNotificationCount(notificationsData.allRequests.length));
      }
    }, [notificationsData, dispatch]);

    const [onlineUsers, setOnlineUsers] = useState([]);
    const [newMessagesAlert, setNewMessagesAlert] = useState([]);
    const [typingChats, setTypingChats] = useState([]);
    
    useErrors([{ isError,error }]);

    const newRequestHandler = useCallback(() => {
      dispatch(incrementNotificationCount());
      toast.success("New Friend Request received!");
    }, [dispatch]);

    const onlineUsersListener = useCallback((data) => {
      setOnlineUsers(data);
    }, []);

    const newMessageAlertListener = useCallback((data) => {
      if (data.chatId === chatId) return;
      
      const senderName = data.message?.sender?.name || "Someone";
      toast(`New Message from ${senderName}`, { icon: "💬" });

      setNewMessagesAlert((prev) => {
        const existing = prev.find((i) => i.chatId === data.chatId);
        if (existing) {
          return prev.map((i) =>
            i.chatId === data.chatId ? { ...i, count: i.count + 1, message: data.message } : i
          );
        }
        return [...prev, { chatId: data.chatId, count: 1, message: data.message }];
      });
    }, [chatId]);

    const startTypingListener = useCallback((data) => {
      setTypingChats((prev) => {
        if (!prev.includes(data.chatId)) return [...prev, data.chatId];
        return prev;
      });
    }, []);

    const stopTypingListener = useCallback((data) => {
      setTypingChats((prev) => prev.filter((id) => id !== data.chatId));
    }, []);

    const eventHandlers = {
      [NEW_REQUEST]: newRequestHandler,
      [ONLINE_USERS]: onlineUsersListener,
      [NEW_MESSAGE]: newMessageAlertListener,
      [START_TYPING]: startTypingListener,
      [STOP_TYPING]: stopTypingListener,
      [REFETCH_CHATS]: refetch,
    };

    useSocketEvents(socket, eventHandlers);
    const handleDeleteChats = (e, _id, groupChat) => {
      e.preventDefault();
    }
    
    const handleMobileClose = () => dispatch(setIsMobile(false))


    return (
      <>
        <Header unreadMessagesCount={newMessagesAlert.reduce((acc, alert) => acc + alert.count, 0)} />
        {isLoading ? (
          <Skeleton />
        ) : (
          <Drawer 
            open={isMobile}
            onClose={handleMobileClose}
          >
            <ChatList
              w="70vw"
              chats={data?.chats}
              chatId={chatId}
              onlineUsers={onlineUsers}
              newMessagesAlert={newMessagesAlert}
              typingChats={typingChats}
              // handleDeleteChat={handleDeleteChats}
            />
          </Drawer>
        )}

        <Drawer 
          anchor="right" 
          open={isMobileProfile} 
          onClose={() => dispatch(setIsMobileProfile(false))}
        >
          <Box sx={{ width: "80vw", maxWidth: 400, height: "100%", overflowY: "auto", p: 2 }}>
            <Profile />
          </Box>
        </Drawer>

        <Grid container height={"calc(100vh - 4rem)"}>
          <Grid item height={"100%"}
            sm={4}
            md={3}
            lg={3}
            sx={{
              display: { xs: "none", sm: "block" },
            }}
            aria-label="Chat List"
          >

            {
              isLoading ? (<Skeleton />) : (
                <ChatList
                  handleDeleteChat={handleDeleteChats}
                  chats={data?.chats || sampleChats}
                  chatId={chatId}
                  user={user}
                  onlineUsers={onlineUsers}
                  newMessagesAlert={newMessagesAlert}
                  typingChats={typingChats}
                />
              )
            }

          </Grid>
          <Grid item
            xs={12}
            sm={8}
            md={5}
            lg={6}
            height={"100%"}
          >
          <WrappedComponent {...props}
           chatId={chatId} 
           user={user}
            />

          </Grid>
          <Grid item height={"100%"}
            md={4}
            lg={3}
            sx={{
              display: { xs: "none", md: "block" },
              padding: "2rem",
            }}
          >
            <Profile 
            // user={user} 
            />
          </Grid>
        </Grid>
      </>
    )
  }
}

export default AppLayout;
