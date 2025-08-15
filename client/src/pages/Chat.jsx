import {
  AttachFile as AttachFileIcon,
  Send as SendIcon
} from '@mui/icons-material';
import { IconButton, Skeleton, Stack } from '@mui/material';
import React, { useCallback, useRef, useState } from 'react';
// import Filemenu from '../components/dialogs/Filemenu';
import AppLayout from '../components/layout/AppLayout';
import MessageComponent from '../components/shared/MessageComponent';

import { orange } from '@mui/material/colors';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { NEW_MESSAGE } from '../constants/events';
import { useSocketEvents } from '../hooks/hook';
import { useChatDetailsQuery, useGetMessagesQuery } from '../redux/api/api';
import { getSocket } from '../socket';
import { useInfiniteScrollTop } from '6pp';


const Chat = ({ chatId,user }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const socket = getSocket();


  // const {user} = useSelector((state)=>state.misc)
  const containerRef = useRef(null);
  const bottomRef = useRef(null);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [page, setPage] = useState(1);
  // const [fileMenuAnchor, setFileMenuAnchor] = useState(null);
  
  const chatDetails = useChatDetailsQuery({ chatId, skip: !chatId })
  const oldMessageChunk = useGetMessagesQuery({chatId,})

  const { data: oldMessages, setData: setOldMessages } = useInfiniteScrollTop(
    containerRef,
    oldMessageChunk.data?.totalPages,
    page,
    setPage,
    oldMessageChunk.data?.messages
  );

  const members = chatDetails?.data?.chat?.members

  const submitHandler = (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    socket.emit(NEW_MESSAGE, { chatId, members, message });
    setMessage("");
  };

  const newMessagesHandler = useCallback((data) => {
    setMessages((prev) => [...prev, data.message]);
  }, []);


  const errors = [
    { isError: chatDetails.isError, error: chatDetails.error },
    { isError: oldMessageChunk.isError, error: oldMessageChunk.error },
  ];

  

const eventArr = {[NEW_MESSAGE] : newMessagesHandler}
    const eventHandlers = {[NEW_MESSAGE]: newMessagesHandler };
    useSocketEvents(socket, eventArr)

    const allMessages = [...oldMessages, ...messages];

  return chatDetails.isLoading ? <Skeleton /> :
    (
      <>
        <Stack
          ref={containerRef}
          boxSizing={"border-box"}
          padding={"1rem"}
          spacing={"1rem"}
          bgcolor={"rgba(247,247,247,1)"}
          height={"90%"}
          sx={{
            overflowX: "hidden",
            overflowY: "auto",
          }}
        >
          {allMessages.map((value) => (
            <MessageComponent
              key={value._id}
              message={value}
              user={user}
            />
          ))}
        </Stack>

        <form
          onSubmit={submitHandler}
          style={{
            height: "10%",
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Stack
           direction={"row"} 
           height={"100%"} 
            padding={"1rem"}
           alignItems={"center"} 
           position={"relative"} 
           flex={1}>
            <IconButton sx={{
              position: "absolute",
              left: "1.5rem",
              rotate: "-30deg",
              color: "secondary.main",
              "&:hover": {
                bgcolor: "secondary.dark"
              }
            }}>
              <AttachFileIcon />
            </IconButton>

            <input
              value={message}
            onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message here..."

              style={{
                width: "100%",
                height: "100%",
                border: "none",
                outline: "none",
                padding: "0 3rem",
                borderRadius: "1.5rem",
                backgroundColor: "rgba(247,247,247,1)",
              }}
            />

            <IconButton type='submit'
             sx={{
              rotate: "-30deg",
              bgcolor: orange,
              color: "white",
              marginLeft: "1rem",
              padding: "0.5rem",
              "&:hover": {
                bgcolor: "error.dark",
              },
            }}
            >
              <SendIcon  />
            </IconButton>
          </Stack>
        </form>

        {/* <Filemenu /> */}
      </>
    );
};

export default AppLayout()(Chat);
