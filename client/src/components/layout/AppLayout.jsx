import { Drawer, Grid, Skeleton, Box } from '@mui/material';
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useErrors, useSocketEvents } from '../../hooks/hook';
import { useMyChatsQuery, useGetNotificationsQuery } from '../../redux/api/api';
import { getSocket } from '../../socket.jsx';
import { NEW_REQUEST, ONLINE_USERS, NEW_MESSAGE, NEW_MESSAGE_ALERT, START_TYPING, STOP_TYPING, REFETCH_CHATS, ALERT } from '../../constants/events';
import ChatList from '../specific/ChatList';
import Profile from '../specific/Profile';
import Header from './Header';
import DeleteChatMenu from '../dialogs/DeleteChatMenu';
import { incrementNotificationCount, setIsMobile, setIsMobileProfile, setNotificationCount, setIsDeleteMenu, setSelectedDeleteChat } from '../../redux/reducers/misc';



const AppLayout = () => (WrappedComponent) => {
  
  
  return (props) => {
    const { activeChatId: chatId } = useSelector((state) => state.misc);
    const dispatch = useDispatch();
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
      if (!data) return;
      if (Array.isArray(data)) {
        const ids = data
          .map((u) => (typeof u === "object" && u !== null ? String(u.user_id || u.id || u._id || "") : String(u)))
          .filter(Boolean);
        setOnlineUsers(ids);
      } else if (typeof data === "object") {
        const uid = String(data.user_id || data.userId || data.id || "");
        if (uid) {
          setOnlineUsers((prev) => {
            const current = Array.isArray(prev) ? prev.map(String) : [];
            if (data.status === "offline") {
              return current.filter((id) => id !== uid);
            } else {
              return current.includes(uid) ? current : [...current, uid];
            }
          });
        }
      }
    }, []);

    const newMessageAlertListener = useCallback((data) => {
      if (!data || data.chatId === chatId) return;
      
      const senderName = data.message?.sender?.name || "Someone";
      toast(`New Message from ${senderName}`, { icon: "💬" });

      setNewMessagesAlert((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const existing = list.find((i) => i.chatId === data.chatId);
        if (existing) {
          return list.map((i) =>
            i.chatId === data.chatId ? { ...i, count: i.count + 1, message: data.message } : i
          );
        }
        return [...list, { chatId: data.chatId, count: 1, message: data.message }];
      });
    }, [chatId]);

    const startTypingListener = useCallback((data) => {
      if (!data?.chatId) return;
      setTypingChats((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (!list.includes(data.chatId)) return [...list, data.chatId];
        return list;
      });
    }, []);

    const stopTypingListener = useCallback((data) => {
      if (!data?.chatId) return;
      setTypingChats((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.filter((id) => id !== data.chatId);
      });
    }, []);

    const eventHandlers = {
      [NEW_REQUEST]: newRequestHandler,
      [ONLINE_USERS]: onlineUsersListener,
      "user.online": onlineUsersListener,
      "user.offline": onlineUsersListener,
      [NEW_MESSAGE]: newMessageAlertListener,
      [START_TYPING]: startTypingListener,
      [STOP_TYPING]: stopTypingListener,
      [REFETCH_CHATS]: refetch,
    };

    useSocketEvents(socket, eventHandlers);
    const deleteMenuAnchor = useRef(null);

    const handleDeleteChats = (e, _id, groupChat) => {
      e.preventDefault();
      deleteMenuAnchor.current = e.currentTarget;
      dispatch(setIsDeleteMenu(true));
      dispatch(setSelectedDeleteChat({ chatId: _id, groupChat }));
    };
    
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

        <Box sx={{ display: 'flex', height: 'calc(100vh - 4rem)', bgcolor: 'background.default' }}>
          <Grid container sx={{ height: '100%', m: 0, p: 0 }}>
            <Grid item
              sm={4}
              md={3}
              lg={3}
              sx={{
                height: "100%",
                display: { xs: "none", sm: "block" },
                borderRight: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                overflowY: "auto",
              }}
              aria-label="Chat List"
            >
              {
                isLoading ? (<Skeleton />) : (
                  <ChatList
                    handleDeleteChat={handleDeleteChats}
                    chats={data?.chats || []}
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
              md={6}
              lg={6}
              sx={{ 
                height: "100%",
                bgcolor: 'background.default',
                overflowY: "auto",
              }}
            >
              <WrappedComponent {...props}
                key={chatId || "dashboard"}
                chatId={chatId} 
                user={user}
              />
            </Grid>
            
            <Grid item
              md={3}
              lg={3}
              sx={{
                height: "100%",
                display: { xs: "none", md: "block" },
                borderLeft: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                padding: "2rem",
                overflowY: "auto",
              }}
            >
              <Profile 
              // user={user} 
              />
            </Grid>
          </Grid>
        </Box>
        <DeleteChatMenu dispatch={dispatch} deleteMenuAnchor={deleteMenuAnchor} />
      </>
    )
  }
}

export default AppLayout;
