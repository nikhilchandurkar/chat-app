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
    <div style={{ backgroundColor: "#F7F7F5", minHeight: "100vh" }}>
      <Container component="main" maxWidth="xs" sx={{ height: "100vh", display: "flex", alignItems: "center" }}>
        <Paper elevation={0} sx={{ p: 4, width: "100%", borderRadius: 2, border: "1px solid #E3E6E1", boxShadow: "0 4px 12px rgba(32, 36, 33, 0.04)" }}>
          <Box textAlign="center" mb={3}>
            <Box sx={{ width: 52, height: 52, borderRadius: "50%", bgcolor: "#236B4A", display: "inline-flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <LockResetIcon sx={{ color: "white", fontSize: 26 }} />
            </Box>
            <Typography variant="h5" fontWeight={700} color="#202421">Set Security Credentials</Typography>
            <Typography variant="body2" color="#737A75" mt={0.5}>
              Account verification for <strong>{email}</strong>
            </Typography>
          </Box>

          <form onSubmit={handleSubmit}>
            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 1.5 }}>{error}</Alert>}

            <TextField
              required fullWidth label="New Passcode" type={showPassword ? "text" : "password"}
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
              sx={{
                "& .MuiOutlinedInput-root.Mui-focused fieldset": {
                  borderColor: "#236B4A",
                },
              }}
            />
            <TextField
              required fullWidth label="Confirm New Passcode" type={showPassword ? "text" : "password"}
              margin="normal" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              sx={{
                "& .MuiOutlinedInput-root.Mui-focused fieldset": {
                  borderColor: "#236B4A",
                },
              }}
            />

            <Button
              type="submit" fullWidth variant="contained" disabled={isLoading}
              sx={{
                mt: 2, py: 1.3, borderRadius: 1.5, fontWeight: 600,
                backgroundColor: "#236B4A", color: "#FFFFFF", boxShadow: "none",
                "&:hover": { backgroundColor: "#1B573C", boxShadow: "none" }
              }}
            >
              {isLoading ? "Updating..." : "Update Credentials"}
            </Button>
          </form>

          <Box textAlign="center" mt={3}>
            <Link to="/forgot-password" style={{ color: "#236B4A", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
              ← Request new link
            </Link>
          </Box>
        </Paper>
      </Container>
    </div>
  );
};

export default ResetPassword;
