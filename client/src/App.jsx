import axios from "axios";
import React, { Suspense, lazy, useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import ProtectRoute from "./components/auth/ProtectRoute";
import { LayoutLoader } from "./components/layout/Loaders";
import { server } from "./constants/config";
import { userExists, userNotExists } from "./redux/reducers/auth";
import { SocketProvider } from "./socket.jsx";
import { isCapacitorNative } from "./utils/device";
import { getPendingBrowserAndroidOAuthUrl, parseIncomingOAuthAppUrl } from "./utils/oauthDeepLink";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import CssBaseline from "@mui/material/CssBaseline";

import {
  lightBackground,
  lightSurface,
  lightText,
  lightTextSecondary,
  lightAction,
  lightActionHover,
  lightBorder,
  darkBackground,
  darkSurface,
  darkText,
  darkTextSecondary,
  darkAction,
  darkBorder,
  successColor,
  warningColor,
  errorColor,
} from "./constants/color";

const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Chat = lazy(() => import("./pages/Chat"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const Groups = lazy(() => import("./pages/Groups"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// Global Axios authorization interceptor
axios.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("chitChat-Token") ||
    localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Immediately sign out locally if active session is revoked from another device
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const reqUrl = error?.config?.url || "";
    const statusCode = error?.response?.status;
    const isAuthAttempt = /\/api\/v1\/(auth|user)\/(login|register|otp|qr|mfa\/login-verify|sessions\/resolve-limit|refresh)/.test(reqUrl);
    if (statusCode === 401 && !isAuthAttempt) {
      const hadToken = Boolean(localStorage.getItem("chitChat-Token") || localStorage.getItem("access_token"));
      if (hadToken) {
        localStorage.removeItem("chitChat-Token");
        localStorage.removeItem("access_token");
        window.dispatchEvent(new Event("chitchat:session-revoked"));
      }
    }
    return Promise.reject(error);
  }
);

const isSuperAdminUser = (u) =>
  Boolean(u && (u.is_superuser || (u.role === "admin" && u.is_staff)));

const AdminOnlyRoute = ({ user, children }) => {
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdminUser(user)) return <Navigate to="/" replace />;
  return children;
};

let handledColdStartOAuthUrl = null;

/** Listens for incoming custom-scheme OAuth callbacks when running inside Capacitor Android. */
const CapacitorDeepLinkHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isCapacitorNative()) return undefined;

    const handleIncomingUrl = (rawUrl) => {
      const nextRoute = parseIncomingOAuthAppUrl(rawUrl);
      if (!nextRoute) return;
      Browser.close().catch(() => {});
      navigate(nextRoute, { replace: true });
    };

    let listenerHandle;
    let cancelled = false;

    CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      if (!cancelled) handleIncomingUrl(url);
    })
      .then((handle) => {
        if (cancelled) {
          handle.remove();
        } else {
          listenerHandle = handle;
        }
      })
      .catch(() => {});

    CapacitorApp.getLaunchUrl()
      .then((res) => {
        if (!cancelled && res?.url && res.url !== handledColdStartOAuthUrl) {
          handledColdStartOAuthUrl = res.url;
          handleIncomingUrl(res.url);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [navigate]);

  return null;
};

const AndroidOAuthReturnScreen = ({ deepLinkUrl, onContinueInBrowser }) => {
  useEffect(() => {
    if (window.__chitchatAndroidOAuthTarget !== deepLinkUrl) {
      window.__chitchatAndroidOAuthTarget = deepLinkUrl;
      window.location.replace(deepLinkUrl);
    }
  }, [deepLinkUrl]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}
    >
      <Paper elevation={3} sx={{ p: 4, maxWidth: 420, width: "100%", textAlign: "center", borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          Returning to ChitChat
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Tap below if the ChitChat Android app does not open automatically.
        </Typography>
        <Stack spacing={1.5}>
          <Button variant="contained" size="large" component="a" href={deepLinkUrl} fullWidth>
            Open ChitChat App
          </Button>
          <Button variant="text" size="small" onClick={onContinueInBrowser} fullWidth>
            Continue in browser instead
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
};

const App = () => {
  const { user, loader } = useSelector((state) => state.auth);
  const { themeMode, fontFamily } = useSelector((state) => state.misc);
  const [stayInBrowser, setStayInBrowser] = useState(false);
  const dispatch = useDispatch();
  const browserAndroidOAuthUrl = stayInBrowser ? null : getPendingBrowserAndroidOAuthUrl();

  const theme = React.useMemo(() => createTheme({
    palette: {
      mode: themeMode,
      primary: {
        main: themeMode === "dark" ? darkAction : lightAction,
        dark: lightActionHover,
        contrastText: "#FFFFFF",
      },
      secondary: {
        main: successColor,
      },
      error: {
        main: errorColor,
      },
      warning: {
        main: warningColor,
      },
      divider: themeMode === "dark" ? darkBorder : lightBorder,
      ...(themeMode === "dark" ? {
        background: { default: darkBackground, paper: darkSurface },
        text: { primary: darkText, secondary: darkTextSecondary },
      } : {
        background: { default: lightBackground, paper: lightSurface },
        text: { primary: lightText, secondary: lightTextSecondary },
      }),
    },
    typography: {
      fontFamily: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`,
      button: {
        textTransform: "none",
        fontWeight: 600,
      }
    },
    shape: {
      borderRadius: 8,
    }
  }), [themeMode]);

  useEffect(() => {
    // Fast path: Check cookies or tokens before blocking with an unnecessary network call
    const hasAuthCookie =
      document.cookie.includes("chitChat-Token") ||
      document.cookie.includes("sessionid") ||
      document.cookie.includes("access_token");
    const hasStoredToken =
      Boolean(localStorage.getItem("chitChat-Token")) ||
      Boolean(localStorage.getItem("access_token"));

    // If completely unauthenticated, instantly resolve to Login with 0ms delay
    if (!hasAuthCookie && !hasStoredToken) {
      dispatch(userNotExists());
      return;
    }

    axios
      .get(`${server}/api/v1/user/me`, { withCredentials: true })
      .then(({ data }) => dispatch(userExists(data.user)))
      .catch(() => {
        localStorage.removeItem("chitChat-Token");
        localStorage.removeItem("access_token");
        dispatch(userNotExists());
      });
  }, [dispatch]);

  useEffect(() => {
    const onSessionRevoked = () => dispatch(userNotExists());
    window.addEventListener("chitchat:session-revoked", onSessionRevoked);
    return () => window.removeEventListener("chitchat:session-revoked", onSessionRevoked);
  }, [dispatch]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {browserAndroidOAuthUrl ? (
        <AndroidOAuthReturnScreen
          deepLinkUrl={browserAndroidOAuthUrl}
          onContinueInBrowser={() => setStayInBrowser(true)}
        />
      ) : loader ? (
        <LayoutLoader />
      ) : (
        <SocketProvider user={user}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <CapacitorDeepLinkHandler />
            <Suspense fallback={<LayoutLoader />}>
              <Routes>
                <Route element={<ProtectRoute user={user} />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/groups" element={<Groups />} />
                  <Route
                    path="/admin-panel"
                    element={
                      <AdminOnlyRoute user={user}>
                        <AdminDashboard />
                      </AdminOnlyRoute>
                    }
                  />
                  <Route
                    path="/admin-dashboard"
                    element={
                      <AdminOnlyRoute user={user}>
                        <AdminDashboard />
                      </AdminOnlyRoute>
                    }
                  />
                </Route>
                <Route
                  path="/login"
                  element={
                    <ProtectRoute user={!user} redirect="/">
                      <Login />
                    </ProtectRoute>
                  }
                />
                {/* Public password reset routes */}
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <Toaster position="bottom-center" />
          </BrowserRouter>
        </SocketProvider>
      )}
    </ThemeProvider>
  );
};

export default App;

