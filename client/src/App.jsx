import axios from "axios";
import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Toaster } from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import ProtectRoute from "./components/auth/ProtectRoute";
import { LayoutLoader } from "./components/layout/Loaders";
import { server } from "./constants/config";
import { userExists, userNotExists } from "./redux/reducers/auth";
import {
  setActiveChatId,
  setIsMobile,
  setIsMobileProfile,
  setIsNewGroup,
  setIsNotification,
  setIsSearch,
} from "./redux/reducers/misc";
import { SocketProvider } from "./socket.jsx";
import { isCapacitorNative } from "./utils/device";
import { getPendingBrowserAndroidOAuthUrl, parseIncomingOAuthAppUrl } from "./utils/oauthDeepLink";
import {
  isPrivacyBlurEnabled,
  isScreenshotBlockEnabled,
  PREFS_EVENT,
} from "./utils/feedback";
import { syncScreenPrivacy } from "./utils/screenPrivacy";
import {
  APP_LOCK_EVENT,
  canUseNativeBiometricUnlock,
  isAppLockEnabled,
  isBiometricUnlockEnabled,
  triggerNativeBiometricUnlock,
  verifyAppLockPin,
} from "./utils/appLock";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import CssBaseline from "@mui/material/CssBaseline";
import toast from "react-hot-toast";

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
const InviteAccept = lazy(() => import("./pages/InviteAccept"));

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

/** Handles Capacitor deep links AND native Android hardware back button navigation. */
const CapacitorDeepLinkHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { activeChatId, isMobile, isMobileProfile, isSearch, isNotification, isNewGroup } = useSelector(
    (state) => state.misc
  );
  const backStateRef = useRef({
    activeChatId,
    isMobile,
    isMobileProfile,
    isSearch,
    isNotification,
    isNewGroup,
    pathname: location.pathname,
  });

  useEffect(() => {
    backStateRef.current = {
      activeChatId,
      isMobile,
      isMobileProfile,
      isSearch,
      isNotification,
      isNewGroup,
      pathname: location.pathname,
    };
  }, [activeChatId, isMobile, isMobileProfile, isSearch, isNotification, isNewGroup, location.pathname]);

  useEffect(() => {
    if (!isCapacitorNative()) return undefined;

    const handleIncomingUrl = (rawUrl) => {
      const nextRoute = parseIncomingOAuthAppUrl(rawUrl);
      if (!nextRoute) return;
      Browser.close().catch(() => {});
      navigate(nextRoute, { replace: true });
    };

    let urlHandle;
    let backHandle;
    let cancelled = false;

    CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      if (!cancelled) handleIncomingUrl(url);
    })
      .then((handle) => {
        if (cancelled) handle.remove();
        else urlHandle = handle;
      })
      .catch(() => {});

    CapacitorApp.addListener("backButton", () => {
      const st = backStateRef.current;
      if (st.isSearch) {
        dispatch(setIsSearch(false));
      } else if (st.isNotification) {
        dispatch(setIsNotification(false));
      } else if (st.isNewGroup) {
        dispatch(setIsNewGroup(false));
      } else if (st.isMobileProfile) {
        dispatch(setIsMobileProfile(false));
      } else if (st.isMobile) {
        dispatch(setIsMobile(false));
      } else if (st.activeChatId) {
        dispatch(setActiveChatId(null));
      } else if (st.pathname !== "/" && st.pathname !== "/login") {
        navigate("/", { replace: true });
      } else {
        CapacitorApp.minimizeApp().catch(() => {});
      }
    })
      .then((handle) => {
        if (cancelled) backHandle?.remove();
        else backHandle = handle;
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
      if (urlHandle) urlHandle.remove();
      if (backHandle) backHandle.remove();
    };
  }, [dispatch, navigate]);

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
  const [privacyShielded, setPrivacyShielded] = useState(false);
  const [appLocked, setAppLocked] = useState(() => isAppLockEnabled());
  const [unlockPin, setUnlockPin] = useState("");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const dispatch = useDispatch();
  const browserAndroidOAuthUrl = stayInBrowser ? null : getPendingBrowserAndroidOAuthUrl();

  useEffect(() => {
    syncScreenPrivacy();
    const onPrefs = () => syncScreenPrivacy();
    window.addEventListener(PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(PREFS_EVENT, onPrefs);
  }, []);

  // Privacy Shield: blur app switcher / hidden tab & deter Web PrintScreen captures
  useEffect(() => {
    const onVisibility = () => {
      if (isPrivacyBlurEnabled()) {
        setPrivacyShielded(document.hidden);
      } else {
        setPrivacyShielded(false);
      }
      if (document.hidden && isAppLockEnabled()) {
        setAppLocked(true);
      }
    };
    const onAppLockChange = () => {
      if (!isAppLockEnabled()) setAppLocked(false);
    };
    canUseNativeBiometricUnlock().then(setBiometricAvailable).catch(() => {});
    const onKeyUp = (e) => {
      if (!isScreenshotBlockEnabled()) return;
      if (e.key === "PrintScreen") {
        navigator.clipboard?.writeText?.("").catch(() => {});
        toast("Screen capture protection is enabled", { icon: "🛡️" });
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener(APP_LOCK_EVENT, onAppLockChange);

    let stateHandle;
    let cancelled = false;
    if (isCapacitorNative()) {
      CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (!cancelled && isPrivacyBlurEnabled()) {
          setPrivacyShielded(!isActive);
        }
        if (!isActive && isAppLockEnabled()) {
          setAppLocked(true);
        }
      })
        .then((h) => {
          if (cancelled) h.remove();
          else stateHandle = h;
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener(APP_LOCK_EVENT, onAppLockChange);
      if (stateHandle) stateHandle.remove();
    };
  }, []);

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
                  <Route path="/invite/:token" element={<InviteAccept />} />
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
            {privacyShielded && (
              <Box
                sx={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 9998,
                  bgcolor: "rgba(18, 22, 19, 0.88)",
                  backdropFilter: "blur(18px)",
                  WebkitBackdropFilter: "blur(18px)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFFFFF",
                }}
              >
                <Typography variant="h6" fontWeight={700}>
                  ChitChat Privacy Shield
                </Typography>
                <Typography variant="caption" color="rgba(255,255,255,0.75)">
                  Screen hidden while app is inactive
                </Typography>
              </Box>
            )}
            {user && appLocked && (
              <Box
                sx={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 9999,
                  bgcolor: "rgba(18, 22, 19, 0.96)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  p: 2,
                }}
              >
                <Paper sx={{ p: 3, borderRadius: 3, maxWidth: 340, width: "100%", textAlign: "center" }}>
                  <Typography variant="h6" fontWeight={700} gutterBottom>
                    ChitChat Locked
                  </Typography>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    Enter your App Lock PIN to continue
                  </Typography>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const ok = await verifyAppLockPin(unlockPin);
                      if (ok) {
                        setUnlockPin("");
                        setAppLocked(false);
                      } else {
                        toast.error("Incorrect PIN");
                      }
                    }}
                  >
                    <Stack spacing={1.5}>
                      <TextField
                        type="password"
                        size="small"
                        fullWidth
                        autoFocus
                        inputProps={{ inputMode: "numeric", maxLength: 6 }}
                        placeholder="Enter 4-6 digit PIN"
                        value={unlockPin}
                        onChange={(e) => setUnlockPin(e.target.value)}
                      />
                      <Button type="submit" variant="contained" fullWidth>
                        Unlock
                      </Button>
                      {biometricAvailable && isBiometricUnlockEnabled() && (
                        <Button
                          variant="outlined"
                          fullWidth
                          onClick={async () => {
                            const ok = await triggerNativeBiometricUnlock();
                            if (ok) setAppLocked(false);
                          }}
                        >
                          Unlock with Fingerprint / Device Lock
                        </Button>
                      )}
                    </Stack>
                  </form>
                </Paper>
              </Box>
            )}
          </BrowserRouter>
        </SocketProvider>
      )}
    </ThemeProvider>
  );
};

export default App;

