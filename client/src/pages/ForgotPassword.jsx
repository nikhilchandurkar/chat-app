import React, { useState } from "react";
import { Container, Paper, Typography, TextField, Button, Box, Alert } from "@mui/material";
import { Email as EmailIcon } from "@mui/icons-material";
import { Link } from "react-router-dom";
import axios from "axios";
import { server } from "../constants/config";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await axios.post(`${server}/api/v1/user/forgot-password`, { email });
      setSubmitted(true);
    } catch (err) {
      setError(err?.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", minHeight: "100vh" }}>
      <Container component="main" maxWidth="xs" sx={{ height: "100vh", display: "flex", alignItems: "center" }}>
        <Paper elevation={8} sx={{ p: 4, width: "100%", borderRadius: 3 }}>
          <Box textAlign="center" mb={3}>
            <Box sx={{ width: 56, height: 56, borderRadius: "50%", bgcolor: "primary.main", display: "inline-flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <EmailIcon sx={{ color: "white", fontSize: 28 }} />
            </Box>
            <Typography variant="h5" fontWeight={700}>Forgot Password?</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              No worries! Enter your email and we'll send you a reset link.
            </Typography>
          </Box>

          {submitted ? (
            <Alert severity="success" sx={{ borderRadius: 2 }}>
              <Typography fontWeight={600}>Check your inbox!</Typography>
              <Typography variant="body2" mt={0.5}>
                If an account exists with <strong>{email}</strong>, a password reset link has been sent. The link expires in 1 hour.
              </Typography>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
              <TextField
                required
                fullWidth
                label="Email Address"
                type="email"
                margin="normal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={isLoading}
                sx={{ mt: 2, py: 1.4, borderRadius: 2, fontWeight: 600, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
              >
                {isLoading ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>
          )}

          <Box textAlign="center" mt={3}>
            <Link to="/login" style={{ color: "#667eea", textDecoration: "none", fontSize: 14 }}>
              ← Back to Login
            </Link>
          </Box>
        </Paper>
      </Container>
    </div>
  );
};

export default ForgotPassword;
