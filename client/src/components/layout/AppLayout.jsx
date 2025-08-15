import { Drawer, Grid, Skeleton } from '@mui/material';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import sampleChats from '../../constants/sampleData';
import { useErrors } from '../../hooks/hook';
import { useMyChatsQuery } from '../../redux/api/api';
import { setIsMobile } from '../../redux/reducers/misc';
import { getSocket } from '../../socket';
import ChatList from '../specific/ChatList';
import Profile from '../specific/Profile';
import Header from './Header';



const AppLayout = () => (WrappedComponent) => {
  
  
  return (props) => {
    const params = useParams();
    const dispatch = useDispatch();
    const chatId = params.chatId;
    const { data, isLoading, isError, refetch, error } = useMyChatsQuery("")
    
    const socket = getSocket();
    const { user } = useSelector((state) => state.auth);
    const { isMobile } = useSelector((state) => state.misc);
    
    
    useErrors([{ isError,error }]);


    const handleDeleteChats = (e, _id, groupChat) => {
      e.preventDefault();
    }
    
    const handleMobileClose = () => dispatch(setIsMobile(false))


    return (
      <>
        <Header />
        {isLoading ? (
          <Skeleton />
        ) : (
          <Drawer 
          open={isMobile}
           onClose={handleMobileClose}>
            <ChatList
              w="70vw"
              chats={data?.chats}
              chatId={chatId}
              // handleDeleteChat={handleDeleteChats}
              // newMessagesAlert={newMessagesAlert}
              // onlineUsers={onlineUsers}
            />
          </Drawer>
        )}

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
                  onlineUsers={["0", "1", "2", "3"]}
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
              bgcolor: "rgba(0,0,0,1)",
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
