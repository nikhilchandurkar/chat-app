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
    <div style={{ backgroundColor: "#F7F7F5", minHeight: "100vh" }}>
      <Container component="main" maxWidth="xs" sx={{ height: "100vh", display: "flex", alignItems: "center" }}>
        <Paper elevation={0} sx={{ p: 4, width: "100%", borderRadius: 2, border: "1px solid #E3E6E1", boxShadow: "0 4px 12px rgba(32, 36, 33, 0.04)" }}>
          <Box textAlign="center" mb={3}>
            <Box sx={{ width: 52, height: 52, borderRadius: "50%", bgcolor: "#236B4A", display: "inline-flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <EmailIcon sx={{ color: "white", fontSize: 26 }} />
            </Box>
            <Typography variant="h5" fontWeight={700} color="#202421">Account Access Recovery</Typography>
            <Typography variant="body2" color="#737A75" mt={0.5}>
              Enter your email and we'll send you a secure verification link.
            </Typography>
          </Box>

          {submitted ? (
            <Alert severity="success" sx={{ borderRadius: 1.5 }}>
              <Typography fontWeight={600}>Check your inbox!</Typography>
              <Typography variant="body2" mt={0.5}>
                If an account exists with <strong>{email}</strong>, a recovery verification link has been sent. The link expires in 1 hour.
              </Typography>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 1.5 }}>{error}</Alert>}
              <TextField
                required
                fullWidth
                label="Email Address"
                type="email"
                margin="normal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                sx={{
                  "& .MuiOutlinedInput-root.Mui-focused fieldset": {
                    borderColor: "#236B4A",
                  },
                }}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={isLoading}
                sx={{
                  mt: 2,
                  py: 1.3,
                  borderRadius: 1.5,
                  fontWeight: 600,
                  backgroundColor: "#236B4A",
                  color: "#FFFFFF",
                  boxShadow: "none",
                  "&:hover": { backgroundColor: "#1B573C", boxShadow: "none" },
                }}
              >
                {isLoading ? "Sending..." : "Send Verification Link"}
              </Button>
            </form>
          )}

          <Box textAlign="center" mt={3}>
            <Link to="/login" style={{ color: "#236B4A", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
              ← Back to Login
            </Link>
          </Box>
        </Paper>
      </Container>
    </div>
  );
};

export default ForgotPassword;
