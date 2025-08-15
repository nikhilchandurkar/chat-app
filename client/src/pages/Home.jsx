import React from 'react'
import AppLayout from '../components/layout/AppLayout'
import { Typography, Box } from '@mui/material';


const Home = () => {
  return (
    <Box
      sx={{
        backgroundColor: "lightGray",
        height: "100%",
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Typography
        variant='h5'
        sx={{
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        Select a friend to chat
      </Typography>
    </Box>
  )
}

export default AppLayout()(Home);
