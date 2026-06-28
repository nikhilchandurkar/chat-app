import React, { useState, useEffect } from "react";
import { Container, Paper, Typography, TextField, Button, Box, Alert, InputAdornment, IconButton } from "@mui/material";
import { LockReset as LockResetIcon, Visibility, VisibilityOff } from "@mui/icons-material";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { server } from "../constants/config";
import { useDispatch } from "react-redux";
import { userExists } from "../redux/reducers/auth";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !email) {
      toast.error("Invalid reset link");
      navigate("/forgot-password");
    }
  }, [token, email, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await axios.post(
        `${server}/api/v1/user/reset-password`,
        { token, email, newPassword },
        { withCredentials: true }
      );
      dispatch(userExists(data.user));
      toast.success("Password reset successfully! You are now logged in.");
      navigate("/");
    } catch (err) {
      setError(err?.response?.data?.message || "Reset link is invalid or expired. Please request a new one.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", minHeight: "100vh" }}>
      <Container component="main" maxWidth="xs" sx={{ height: "100vh", display: "flex", alignItems: "center" }}>
        <Paper elevation={8} sx={{ p: 4, width: "100%", borderRadius: 3 }}>
          <Box textAlign="center" mb={3}>
            <Box sx={{ width: 56, height: 56, borderRadius: "50%", bgcolor: "success.main", display: "inline-flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <LockResetIcon sx={{ color: "white", fontSize: 28 }} />
            </Box>
            <Typography variant="h5" fontWeight={700}>Set New Password</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              Choose a strong password for <strong>{email}</strong>
            </Typography>
          </Box>

          <form onSubmit={handleSubmit}>
            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

            <TextField
              required fullWidth label="New Password" type={showPassword ? "text" : "password"}
              margin="normal" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword((s) => !s)} edge="end">
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              required fullWidth label="Confirm New Password" type={showPassword ? "text" : "password"}
              margin="normal" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            />

            <Button
              type="submit" fullWidth variant="contained" disabled={isLoading}
              sx={{ mt: 2, py: 1.4, borderRadius: 2, fontWeight: 600, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
            >
              {isLoading ? "Resetting..." : "Reset Password"}
            </Button>
          </form>

          <Box textAlign="center" mt={3}>
            <Link to="/forgot-password" style={{ color: "#667eea", textDecoration: "none", fontSize: 14 }}>
              ← Request new link
            </Link>
          </Box>
        </Paper>
      </Container>
    </div>
  );
};

export default ResetPassword;
