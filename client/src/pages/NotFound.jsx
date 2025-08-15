import React from 'react'
import { Container, Typography, Button, Box } from '@mui/material'
import { Link } from 'react-router-dom'

const NotFound = () => {
  return (
    <Container
      component="main"
      maxWidth="xs"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f3f4f6', 
      }}
    >
      <Box
        sx={{
          textAlign: 'center',
          backgroundColor: '#fff',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Typography variant="h1" sx={{ fontSize: '6rem', fontWeight: 'bold', color: '#FF6F61' }}>
          404
        </Typography>
        <Typography variant="h5" sx={{ marginBottom: '1rem' }}>
          Oops! The page you're looking for doesn't exist.
        </Typography>
        <Typography variant="body1" sx={{ marginBottom: '2rem' }}>
          It seems that the page has either been moved or deleted. Please check the URL or return to the homepage.
        </Typography>
        <Button
          variant="contained"
          color="primary"
          component={Link}
          to="/"
          sx={{
            textTransform: 'none',
            padding: '0.8rem 2rem',
            borderRadius: '30px',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
            '&:hover': {
              backgroundColor: '#FF6F61',
              boxShadow: '0 6px 10px rgba(0, 0, 0, 0.15)',
            },
          }}
        >
          Go to Homepage
        </Button>
      </Box>
    </Container>
  )
}

export default NotFound
