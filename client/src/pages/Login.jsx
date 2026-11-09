import React, { useState, useEffect, useRef } from "react";
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Stack,
  Divider,
  IconButton,
  CircularProgress,
  Tabs,
  Tab,
  InputAdornment,
  Link,
} from "@mui/material";
import {
  ArrowBack,
  EmailOutlined,
  LockOutlined,
  PersonOutline,
  Visibility,
  VisibilityOff,
  CheckCircleOutline,
} from "@mui/icons-material";
import axios from "axios";
import toast from "react-hot-toast";
import { useDispatch } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import { server } from "../constants/config.js";
import { userExists } from "../redux/reducers/auth.js";

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

const GitHubIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#24292e">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

const DEFAULT_GOOGLE_CLIENT_ID =
  "417703095184-trc78n2da0pab0pqa3ihp2v9vj89mmap.apps.googleusercontent.com";
const DEFAULT_GITHUB_CLIENT_ID = "Ov23li8YB5o8SCTqWXST";

const Login = () => {
  const [tabIndex, setTabIndex] = useState(0); // 0 = Login, 1 = Register
  const [mode, setMode] = useState("password"); // "password" | "otp"

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Register form state
  const [registerStep, setRegisterStep] = useState("details"); // "details" | "otp"
  const [regUsername, setRegUsername] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);

  // OTP state
  const [otpEmail, setOtpEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [authConfig, setAuthConfig] = useState({
    google_client_id:
      import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID,
    github_client_id:
      import.meta.env.VITE_GITHUB_CLIENT_ID || DEFAULT_GITHUB_CLIENT_ID,
  });

  const digitRefs = useRef([]);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  // Fetch server auth config on mount
  useEffect(() => {
    axios
      .get(`${server}/api/v1/auth/config`)
      .then(({ data }) => {
        if (data.google_client_id || data.github_client_id) {
          setAuthConfig((prev) => ({
            google_client_id: data.google_client_id || prev.google_client_id,
            github_client_id: data.github_client_id || prev.github_client_id,
          }));
        }
      })
      .catch(() => {});
  }, []);

  // Handle OAuth code redirect in URL query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const state = params.get("state") || "";

    if (code) {
      // Determine if Google or GitHub
      const isGitHub = state.includes("github") || location.search.includes("github");
      const provider = isGitHub ? "github" : "google";
      handleOAuthCodeExchange(provider, code);
    }
  }, [location.search]);

  // Resend countdown timer for OTP
  useEffect(() => {
    let timer;
    if ((mode === "otp" || registerStep === "otp") && countdown > 0) {
      timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    } else if (countdown === 0) {
      setCanResend(true);
    }
    return () => clearInterval(timer);
  }, [mode, registerStep, countdown]);

  // OAuth Code Exchange
  const handleOAuthCodeExchange = async (provider, code) => {
    setIsLoading(true);
    const toastId = toast.loading(`Completing ${provider} sign in...`);
    try {
      const redirectUri = `${window.location.origin}/login`;
      const endpoint =
        provider === "google"
          ? `${server}/api/v1/auth/oauth/google`
          : `${server}/api/v1/auth/oauth/github`;

      const { data } = await axios.post(
        endpoint,
        {
          code,
          redirect_uri: redirectUri,
          device_id: `web-${navigator.userAgent.slice(0, 30)}`,
          platform: "web",
        },
        { withCredentials: true }
      );

      if (data.token) {
        localStorage.setItem("chitChat-Token", data.token);
      }
      dispatch(userExists(data.user));
      toast.success(data.message || `Welcome, ${data.user?.name || data.user?.username}!`, {
        id: toastId,
      });
      // Clean query string
      window.history.replaceState({}, document.title, window.location.pathname);
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(
        error?.response?.data?.message || `${provider} sign in failed. Please try again.`,
        { id: toastId }
      );
      window.history.replaceState({}, document.title, window.location.pathname);
    } finally {
      setIsLoading(false);
    }
  };

  // 1. Password Login
  const handlePasswordLogin = async (e) => {
    if (e) e.preventDefault();
    const identifier = loginIdentifier.trim();
    if (!identifier) {
      toast.error("Please enter your username or email address");
      return;
    }
    if (!loginPassword) {
      toast.error("Please enter your password");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Signing in...");
    try {
      const { data } = await axios.post(
        `${server}/api/v1/auth/login`,
        {
          username: identifier,
          password: loginPassword,
          device_id: `web-${navigator.userAgent.slice(0, 30)}`,
          platform: "web",
        },
        { withCredentials: true }
      );

      if (data.token) {
        localStorage.setItem("chitChat-Token", data.token);
      }
      dispatch(userExists(data.user));
      toast.success(data.message || `Welcome back, ${data.user?.name || data.user?.username}!`, {
        id: toastId,
      });
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Invalid username or password",
        { id: toastId }
      );
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Register Step 1: Request OTP
  const handleRegisterRequest = async (e) => {
    if (e) e.preventDefault();
    const username = regUsername.trim();
    const email = regEmail.trim().toLowerCase();
    const password = regPassword;
    const confirmPassword = regConfirmPassword;

    if (!username || username.length < 3) {
      toast.error("Username must be at least 3 characters");
      return;
    }
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (!password || password.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Sending verification code to your email...");
    try {
      const { data } = await axios.post(
        `${server}/api/v1/auth/register/request`,
        {
          username,
          name: regName.trim() || username,
          email,
          password,
          confirm_password: confirmPassword,
        },
        { withCredentials: true }
      );

      toast.success(data.message || "Code sent to your email!", { id: toastId });
      setOtpEmail(email);
      setRegisterStep("otp");
      setCountdown(60);
      setCanResend(false);
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => digitRefs.current[0]?.focus(), 200);
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Failed to initiate registration",
        { id: toastId }
      );
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Register Step 2: Verify OTP and Complete Registration
  const handleRegisterVerify = async (e) => {
    if (e) e.preventDefault();
    const otpCode = otpDigits.join("");
    if (otpCode.length !== 6) {
      toast.error("Please enter the complete 6-digit code");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Verifying code & creating account...");
    try {
      const { data } = await axios.post(
        `${server}/api/v1/auth/register/verify`,
        {
          username: regUsername.trim(),
          name: regName.trim() || regUsername.trim(),
          email: otpEmail.trim().toLowerCase(),
          password: regPassword,
          otp: otpCode,
          device_id: `web-${navigator.userAgent.slice(0, 30)}`,
          platform: "web",
        },
        { withCredentials: true }
      );

      if (data.token) {
        localStorage.setItem("chitChat-Token", data.token);
      }
      dispatch(userExists(data.user));
      toast.success(data.message || "Welcome to ChitChat!", { id: toastId });
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Invalid or expired verification code",
        { id: toastId }
      );
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Passwordless Login OTP Request
  const handlePasswordlessOTPRequest = async (e) => {
    if (e) e.preventDefault();
    const cleanEmail = otpEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Sending login code...");
    try {
      const { data } = await axios.post(
        `${server}/api/v1/auth/otp/request`,
        { email: cleanEmail, purpose: "login" },
        { withCredentials: true }
      );
      toast.success(data.message || "Code sent to your email", { id: toastId });
      setMode("otp_verify");
      setCountdown(60);
      setCanResend(false);
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => digitRefs.current[0]?.focus(), 200);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to send code", {
        id: toastId,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Passwordless Login OTP Verify
  const handlePasswordlessOTPVerify = async (e) => {
    if (e) e.preventDefault();
    const otpCode = otpDigits.join("");
    if (otpCode.length !== 6) {
      toast.error("Please enter all 6 digits");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Verifying code...");
    try {
      const { data } = await axios.post(
        `${server}/api/v1/auth/otp/verify`,
        {
          email: otpEmail.trim().toLowerCase(),
          otp: otpCode,
          device_id: `web-${navigator.userAgent.slice(0, 30)}`,
          platform: "web",
        },
        { withCredentials: true }
      );

      if (data.token) {
        localStorage.setItem("chitChat-Token", data.token);
      }
      dispatch(userExists(data.user));
      toast.success(data.message || "Welcome to ChitChat!", { id: toastId });
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Invalid code", {
        id: toastId,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Social OAuth Redirect
  const handleSocialClick = (provider) => {
    const redirectUri = `${window.location.origin}/login`;

    if (provider === "Google") {
      const clientId =
        authConfig.google_client_id || DEFAULT_GOOGLE_CLIENT_ID;
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${encodeURIComponent(
        clientId
      )}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=openid%20email%20profile&access_type=offline&prompt=select_account`;
      window.location.href = googleAuthUrl;
    } else if (provider === "GitHub") {
      const clientId =
        authConfig.github_client_id || DEFAULT_GITHUB_CLIENT_ID;
      const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(
        clientId
      )}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=user:email&state=github`;
      window.location.href = githubAuthUrl;
    }
  };

  // OTP Input handlers with auto-focus movement & paste
  const handleDigitChange = (index, val) => {
    const cleanVal = val.replace(/\D/g, "");
    if (!cleanVal) {
      const newDigits = [...otpDigits];
      newDigits[index] = "";
      setOtpDigits(newDigits);
      return;
    }

    const char = cleanVal.slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = char;
    setOtpDigits(newDigits);

    if (index < 5 && char) {
      digitRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (pasted.length === 6) {
      const newDigits = pasted.split("");
      setOtpDigits(newDigits);
      digitRefs.current[5]?.focus();
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F7F7F5",
        p: 2,
      }}
    >
      <Container maxWidth="xs">
        <Paper
          elevation={0}
          sx={{
            p: 4,
            borderRadius: 2.5,
            backgroundColor: "#FFFFFF",
            border: "1px solid #E3E6E1",
            boxShadow: "0 4px 16px rgba(32, 36, 33, 0.05)",
          }}
        >
          {/* Header */}
          <Box textAlign="center" mb={2}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                backgroundColor: "#236B4A",
                color: "#FFFFFF",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 1.5,
              }}
            >
              <Typography variant="h6" fontWeight={800} color="inherit">
                C
              </Typography>
            </Box>
            <Typography
              variant="h5"
              fontWeight={700}
              color="#202421"
              gutterBottom
            >
              ChitChat
            </Typography>
            <Typography variant="body2" color="#737A75">
              Secure, private, self-hosted messaging
            </Typography>
          </Box>

          {/* Navigation Tabs: Sign In / Create Account */}
          {mode === "password" && registerStep === "details" && (
            <Tabs
              value={tabIndex}
              onChange={(_, val) => setTabIndex(val)}
              variant="fullWidth"
              sx={{
                mb: 3,
                borderBottom: "1px solid #E3E6E1",
                "& .MuiTabs-indicator": { backgroundColor: "#236B4A" },
                "& .MuiTab-root": {
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "14px",
                  color: "#737A75",
                  "&.Mui-selected": { color: "#236B4A" },
                },
              }}
            >
              <Tab label="Sign In" />
              <Tab label="Create Account" />
            </Tabs>
          )}

          {/* TAB 0: SIGN IN */}
          {tabIndex === 0 && mode === "password" && (
            <Box>
              {/* Social Login Buttons */}
              <Stack spacing={1.5} mb={2.5}>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={() => handleSocialClick("Google")}
                  startIcon={<GoogleIcon />}
                  sx={{
                    borderColor: "#E3E6E1",
                    color: "#202421",
                    textTransform: "none",
                    fontWeight: 600,
                    py: 1.1,
                    borderRadius: 1.5,
                    "&:hover": {
                      borderColor: "#D0D4CE",
                      backgroundColor: "#F1F2EF",
                    },
                  }}
                >
                  Continue with Google
                </Button>

                <Button
                  fullWidth
                  variant="outlined"
                  onClick={() => handleSocialClick("GitHub")}
                  startIcon={<GitHubIcon />}
                  sx={{
                    borderColor: "#E3E6E1",
                    color: "#202421",
                    textTransform: "none",
                    fontWeight: 600,
                    py: 1.1,
                    borderRadius: 1.5,
                    "&:hover": {
                      borderColor: "#D0D4CE",
                      backgroundColor: "#F1F2EF",
                    },
                  }}
                >
                  Continue with GitHub
                </Button>
              </Stack>

              <Divider sx={{ my: 2 }}>
                <Typography variant="caption" color="#A6AEA8" fontWeight={500}>
                  OR SIGN IN WITH PASSWORD
                </Typography>
              </Divider>

              {/* Password Login Form */}
              <form onSubmit={handlePasswordLogin}>
                <TextField
                  fullWidth
                  required
                  label="Username or Email"
                  placeholder="name or name@example.com"
                  variant="outlined"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  disabled={isLoading}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonOutline sx={{ color: "#737A75", fontSize: 20 }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ mb: 2 }}
                />

                <TextField
                  fullWidth
                  required
                  type={showPassword ? "text" : "password"}
                  label="Password"
                  variant="outlined"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  disabled={isLoading}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlined sx={{ color: "#737A75", fontSize: 20 }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? (
                            <VisibilityOff fontSize="small" />
                          ) : (
                            <Visibility fontSize="small" />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ mb: 1.5 }}
                />

                <Box display="flex" justifyContent="flex-end" mb={2}>
                  <Link
                    href="/forgot-password"
                    underline="hover"
                    variant="caption"
                    sx={{ color: "#236B4A", fontWeight: 600, cursor: "pointer" }}
                  >
                    Forgot password?
                  </Link>
                </Box>

                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  disabled={isLoading}
                  sx={{
                    backgroundColor: "#236B4A",
                    color: "#FFFFFF",
                    py: 1.3,
                    fontWeight: 600,
                    textTransform: "none",
                    borderRadius: 1.5,
                    boxShadow: "none",
                    "&:hover": {
                      backgroundColor: "#1B573C",
                      boxShadow: "none",
                    },
                  }}
                >
                  {isLoading ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>

              <Box textAlign="center" mt={2.5}>
                <Typography variant="body2" color="#737A75">
                  Don't have an account?{" "}
                  <Link
                    component="button"
                    variant="body2"
                    onClick={() => setTabIndex(1)}
                    sx={{
                      color: "#236B4A",
                      fontWeight: 600,
                      textDecoration: "none",
                      "&:hover": { textDecoration: "underline" },
                    }}
                  >
                    Sign up now
                  </Link>
                </Typography>

                <Button
                  size="small"
                  onClick={() => {
                    setMode("otp_email");
                    setOtpEmail("");
                  }}
                  sx={{
                    mt: 1.5,
                    textTransform: "none",
                    color: "#737A75",
                    fontSize: "12px",
                  }}
                >
                  Sign in with Email OTP code instead
                </Button>
              </Box>
            </Box>
          )}

          {/* TAB 1: CREATE ACCOUNT (STEP 1: DETAILS) */}
          {tabIndex === 1 &&
            mode === "password" &&
            registerStep === "details" && (
              <Box>
                <Typography
                  variant="body2"
                  color="#737A75"
                  mb={2}
                  textAlign="center"
                >
                  Enter your details. We will email an OTP to verify your account.
                </Typography>

                <form onSubmit={handleRegisterRequest}>
                  <TextField
                    fullWidth
                    required
                    label="Username"
                    placeholder="e.g. nikhil24"
                    variant="outlined"
                    value={regUsername}
                    onChange={(e) =>
                      setRegUsername(
                        e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
                      )
                    }
                    disabled={isLoading}
                    helperText="Alphanumeric & underscore only (min 3 chars)"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonOutline sx={{ color: "#737A75", fontSize: 20 }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ mb: 1.5 }}
                  />

                  <TextField
                    fullWidth
                    label="Display Name (Optional)"
                    placeholder="e.g. Nikhil Chandurkar"
                    variant="outlined"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    disabled={isLoading}
                    sx={{ mb: 1.5 }}
                  />

                  <TextField
                    fullWidth
                    required
                    type="email"
                    label="Email address"
                    placeholder="name@example.com"
                    variant="outlined"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    disabled={isLoading}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <EmailOutlined sx={{ color: "#737A75", fontSize: 20 }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ mb: 1.5 }}
                  />

                  <TextField
                    fullWidth
                    required
                    type={showRegPassword ? "text" : "password"}
                    label="Password"
                    placeholder="At least 8 characters"
                    variant="outlined"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    disabled={isLoading}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlined sx={{ color: "#737A75", fontSize: 20 }} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() =>
                              setShowRegPassword(!showRegPassword)
                            }
                            edge="end"
                            size="small"
                          >
                            {showRegPassword ? (
                              <VisibilityOff fontSize="small" />
                            ) : (
                              <Visibility fontSize="small" />
                            )}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                    sx={{ mb: 1.5 }}
                  />

                  <TextField
                    fullWidth
                    required
                    type={showRegPassword ? "text" : "password"}
                    label="Confirm Password"
                    variant="outlined"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    error={
                      Boolean(regConfirmPassword) &&
                      regPassword !== regConfirmPassword
                    }
                    helperText={
                      Boolean(regConfirmPassword) &&
                      regPassword !== regConfirmPassword
                        ? "Passwords do not match"
                        : ""
                    }
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlined sx={{ color: "#737A75", fontSize: 20 }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ mb: 2.5 }}
                  />

                  <Button
                    fullWidth
                    type="submit"
                    variant="contained"
                    disabled={isLoading}
                    sx={{
                      backgroundColor: "#236B4A",
                      color: "#FFFFFF",
                      py: 1.3,
                      fontWeight: 600,
                      textTransform: "none",
                      borderRadius: 1.5,
                      boxShadow: "none",
                      "&:hover": {
                        backgroundColor: "#1B573C",
                        boxShadow: "none",
                      },
                    }}
                  >
                    {isLoading ? (
                      <CircularProgress size={24} color="inherit" />
                    ) : (
                      "Send Verification Code"
                    )}
                  </Button>
                </form>

                <Box textAlign="center" mt={2.5}>
                  <Typography variant="body2" color="#737A75">
                    Already have an account?{" "}
                    <Link
                      component="button"
                      variant="body2"
                      onClick={() => setTabIndex(0)}
                      sx={{
                        color: "#236B4A",
                        fontWeight: 600,
                        textDecoration: "none",
                        "&:hover": { textDecoration: "underline" },
                      }}
                    >
                      Sign In
                    </Link>
                  </Typography>
                </Box>
              </Box>
            )}

          {/* TAB 1: CREATE ACCOUNT (STEP 2: OTP VERIFICATION) */}
          {tabIndex === 1 && registerStep === "otp" && (
            <Box>
              <Box display="flex" alignItems="center" mb={1.5}>
                <IconButton
                  onClick={() => setRegisterStep("details")}
                  size="small"
                  sx={{ mr: 1, color: "#202421" }}
                >
                  <ArrowBack fontSize="small" />
                </IconButton>
                <Typography variant="h6" fontWeight={700} color="#202421">
                  Verify Email
                </Typography>
              </Box>

              <Typography variant="body2" color="#737A75" mb={0.5}>
                We emailed a 6-digit verification code to:
              </Typography>
              <Typography
                variant="body2"
                fontWeight={600}
                color="#236B4A"
                mb={2.5}
              >
                {otpEmail}
              </Typography>

              {/* 6 Digit Input Boxes */}
              <Box
                display="flex"
                justifyContent="space-between"
                mb={3}
                onPaste={handlePaste}
              >
                {otpDigits.map((digit, idx) => (
                  <TextField
                    key={idx}
                    inputRef={(el) => (digitRefs.current[idx] = el)}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    inputProps={{
                      maxLength: 1,
                      style: {
                        textAlign: "center",
                        fontSize: "20px",
                        fontWeight: 700,
                        padding: "10px 0",
                        width: "42px",
                        color: "#202421",
                      },
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 1.5,
                        backgroundColor: "#F1F2EF",
                        "& fieldset": { borderColor: "#E3E6E1" },
                        "&.Mui-focused fieldset": {
                          borderColor: "#236B4A",
                          borderWidth: 2,
                        },
                      },
                    }}
                  />
                ))}
              </Box>

              <Button
                fullWidth
                variant="contained"
                onClick={handleRegisterVerify}
                disabled={isLoading || otpDigits.join("").length !== 6}
                sx={{
                  backgroundColor: "#236B4A",
                  color: "#FFFFFF",
                  py: 1.3,
                  fontWeight: 600,
                  textTransform: "none",
                  borderRadius: 1.5,
                  mb: 2,
                  boxShadow: "none",
                  "&:hover": {
                    backgroundColor: "#1B573C",
                    boxShadow: "none",
                  },
                }}
              >
                {isLoading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  "Verify & Complete Registration"
                )}
              </Button>

              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mt={2}
              >
                <Typography variant="caption" color="#737A75">
                  {canResend ? (
                    <Button
                      size="small"
                      onClick={handleRegisterRequest}
                      sx={{
                        textTransform: "none",
                        color: "#236B4A",
                        fontWeight: 600,
                        p: 0,
                      }}
                    >
                      Resend code
                    </Button>
                  ) : (
                    `Resend code in ${countdown}s`
                  )}
                </Typography>

                <Button
                  size="small"
                  onClick={() => setRegisterStep("details")}
                  sx={{ textTransform: "none", color: "#737A75", p: 0 }}
                >
                  Edit details
                </Button>
              </Box>
            </Box>
          )}

          {/* STANDALONE PASSWORDLESS OTP LOGIN */}
          {mode === "otp_email" && (
            <Box>
              <Box display="flex" alignItems="center" mb={2}>
                <IconButton
                  onClick={() => setMode("password")}
                  size="small"
                  sx={{ mr: 1, color: "#202421" }}
                >
                  <ArrowBack fontSize="small" />
                </IconButton>
                <Typography variant="h6" fontWeight={700} color="#202421">
                  Email Code Sign In
                </Typography>
              </Box>

              <Typography variant="body2" color="#737A75" mb={2.5}>
                Enter your email address and we'll send a 6-digit one-time sign in code.
              </Typography>

              <form onSubmit={handlePasswordlessOTPRequest}>
                <TextField
                  fullWidth
                  required
                  type="email"
                  label="Email address"
                  placeholder="name@example.com"
                  variant="outlined"
                  value={otpEmail}
                  onChange={(e) => setOtpEmail(e.target.value)}
                  disabled={isLoading}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailOutlined sx={{ color: "#737A75", fontSize: 20 }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ mb: 2 }}
                />

                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  disabled={isLoading}
                  sx={{
                    backgroundColor: "#236B4A",
                    color: "#FFFFFF",
                    py: 1.3,
                    fontWeight: 600,
                    textTransform: "none",
                    borderRadius: 1.5,
                    boxShadow: "none",
                    "&:hover": {
                      backgroundColor: "#1B573C",
                      boxShadow: "none",
                    },
                  }}
                >
                  {isLoading ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : (
                    "Send Sign In Code"
                  )}
                </Button>
              </form>

              <Box textAlign="center" mt={2}>
                <Button
                  size="small"
                  onClick={() => setMode("password")}
                  sx={{ textTransform: "none", color: "#236B4A", fontWeight: 600 }}
                >
                  Return to Password Sign In
                </Button>
              </Box>
            </Box>
          )}

          {/* STANDALONE PASSWORDLESS OTP VERIFY */}
          {mode === "otp_verify" && (
            <Box>
              <Box display="flex" alignItems="center" mb={1.5}>
                <IconButton
                  onClick={() => setMode("otp_email")}
                  size="small"
                  sx={{ mr: 1, color: "#202421" }}
                >
                  <ArrowBack fontSize="small" />
                </IconButton>
                <Typography variant="h6" fontWeight={700} color="#202421">
                  Enter Code
                </Typography>
              </Box>

              <Typography variant="body2" color="#737A75" mb={0.5}>
                We emailed a 6-digit code to:
              </Typography>
              <Typography
                variant="body2"
                fontWeight={600}
                color="#236B4A"
                mb={2.5}
              >
                {otpEmail}
              </Typography>

              {/* 6 Digit Input Boxes */}
              <Box
                display="flex"
                justifyContent="space-between"
                mb={3}
                onPaste={handlePaste}
              >
                {otpDigits.map((digit, idx) => (
                  <TextField
                    key={idx}
                    inputRef={(el) => (digitRefs.current[idx] = el)}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    inputProps={{
                      maxLength: 1,
                      style: {
                        textAlign: "center",
                        fontSize: "20px",
                        fontWeight: 700,
                        padding: "10px 0",
                        width: "42px",
                        color: "#202421",
                      },
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 1.5,
                        backgroundColor: "#F1F2EF",
                        "& fieldset": { borderColor: "#E3E6E1" },
                        "&.Mui-focused fieldset": {
                          borderColor: "#236B4A",
                          borderWidth: 2,
                        },
                      },
                    }}
                  />
                ))}
              </Box>

              <Button
                fullWidth
                variant="contained"
                onClick={handlePasswordlessOTPVerify}
                disabled={isLoading || otpDigits.join("").length !== 6}
                sx={{
                  backgroundColor: "#236B4A",
                  color: "#FFFFFF",
                  py: 1.3,
                  fontWeight: 600,
                  textTransform: "none",
                  borderRadius: 1.5,
                  mb: 2,
                  boxShadow: "none",
                  "&:hover": {
                    backgroundColor: "#1B573C",
                    boxShadow: "none",
                  },
                }}
              >
                {isLoading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  "Verify & Sign In"
                )}
              </Button>

              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mt={2}
              >
                <Typography variant="caption" color="#737A75">
                  {canResend ? (
                    <Button
                      size="small"
                      onClick={handlePasswordlessOTPRequest}
                      sx={{
                        textTransform: "none",
                        color: "#236B4A",
                        fontWeight: 600,
                        p: 0,
                      }}
                    >
                      Resend code
                    </Button>
                  ) : (
                    `Resend code in ${countdown}s`
                  )}
                </Typography>

                <Button
                  size="small"
                  onClick={() => setMode("otp_email")}
                  sx={{ textTransform: "none", color: "#737A75", p: 0 }}
                >
                  Change email
                </Button>
              </Box>
            </Box>
          )}
        </Paper>
      </Container>
    </Box>
  );
};

export default Login;
