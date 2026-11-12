import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Email as EmailIcon, LockReset as ResetIcon, Visibility, VisibilityOff } from "@mui/icons-material";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useDispatch } from "react-redux";
import { server } from "../constants/config";
import { userExists } from "../redux/reducers/auth";
import { getDeviceMetadata } from "../utils/device";

const ForgotPassword = () => {
  const [step, setStep] = useState("email"); // "email" | "verify"
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const handleRequestCode = async (e) => {
    if (e) e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      await axios.post(`${server}/api/v1/auth/forgot-password/request`, { email: cleanEmail });
      toast.success("If that email is registered, a 6-digit recovery code was sent.");
      setEmail(cleanEmail);
      setStep("verify");
      setCountdown(60);
    } catch (err) {
      setError(err?.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const cleanOtp = otp.replace(/\D/g, "");
    if (cleanOtp.length !== 6) {
      setError("Enter the 6-digit verification code sent to your email.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await axios.post(
        `${server}/api/v1/auth/forgot-password/reset`,
        {
          email,
          otp: cleanOtp,
          new_password: newPassword,
          ...getDeviceMetadata(),
        },
        { withCredentials: true }
      );

      if (data?.mfaRequired) {
        toast.success("Password updated! Please complete 2FA verification on Sign In.");
        navigate("/login", { replace: true });
        return;
      }
      if (data?.token) {
        localStorage.setItem("chitChat-Token", data.token);
      }
      if (data?.user) {
        dispatch(userExists(data.user));
      }
      toast.success("Password reset successfully!");
      navigate("/", { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Invalid or expired recovery code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: "#F7F7F5", minHeight: "100vh" }}>
      <Container component="main" maxWidth="xs" sx={{ minHeight: "100vh", display: "flex", alignItems: "center", py: 3 }}>
        <Paper
          elevation={0}
          sx={{
            p: 4,
            width: "100%",
            borderRadius: 2.5,
            border: "1px solid #E3E6E1",
            boxShadow: "0 4px 12px rgba(32, 36, 33, 0.04)",
          }}
        >
          <Box textAlign="center" mb={3}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                bgcolor: "#236B4A",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 1,
              }}
            >
              {step === "email" ? (
                <EmailIcon sx={{ color: "white", fontSize: 26 }} />
              ) : (
                <ResetIcon sx={{ color: "white", fontSize: 26 }} />
              )}
            </Box>
            <Typography variant="h5" fontWeight={700} color="#202421">
              {step === "email" ? "Forgot Password" : "Set New Password"}
            </Typography>
            <Typography variant="body2" color="#737A75" mt={0.5}>
              {step === "email"
                ? "Enter your account email and we'll send a 6-digit recovery code."
                : `Enter the 6-digit code sent to ${email} and choose a strong password.`}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 1.5 }}>
              {error}
            </Alert>
          )}

          {step === "email" ? (
            <form onSubmit={handleRequestCode}>
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
                {isLoading ? "Sending code..." : "Send 6-Digit Reset Code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleResetSubmit}>
              <Stack spacing={1.8}>
                <TextField
                  required
                  fullWidth
                  label="6-Digit Recovery Code"
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputProps={{ maxLength: 6, inputMode: "numeric" }}
                />
                <TextField
                  required
                  fullWidth
                  label="New Password (min 8 characters)"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword((s) => !s)} edge="end" size="small">
                          {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  required
                  fullWidth
                  label="Confirm New Password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  error={Boolean(confirmPassword) && newPassword !== confirmPassword}
                  helperText={Boolean(confirmPassword) && newPassword !== confirmPassword ? "Passwords do not match" : ""}
                />
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  disabled={isLoading}
                  sx={{
                    mt: 1,
                    py: 1.3,
                    borderRadius: 1.5,
                    fontWeight: 600,
                    backgroundColor: "#236B4A",
                    color: "#FFFFFF",
                    boxShadow: "none",
                    "&:hover": { backgroundColor: "#1B573C", boxShadow: "none" },
                  }}
                >
                  {isLoading ? "Updating Password..." : "Reset Password & Sign In"}
                </Button>
              </Stack>

              <Stack direction="row" justifyContent="space-between" alignItems="center" mt={2}>
                <Button
                  size="small"
                  disabled={countdown > 0 || isLoading}
                  onClick={() => handleRequestCode()}
                  sx={{ textTransform: "none", color: "#236B4A", p: 0 }}
                >
                  {countdown > 0 ? `Resend code in ${countdown}s` : "Resend code"}
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setStep("email");
                    setOtp("");
                    setError("");
                  }}
                  sx={{ textTransform: "none", color: "#737A75", p: 0 }}
                >
                  Change email
                </Button>
              </Stack>
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
