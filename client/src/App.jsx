import axios from "axios";
import React, { Suspense, lazy, useEffect } from "react";
import { Toaster } from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import ProtectRoute from "./components/auth/ProtectRoute";
import { LayoutLoader } from "./components/layout/Loaders";
import { server } from "./constants/config";
import { userExists, userNotExists } from "./redux/reducers/auth";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { lightBackground, lightSurface, lightText, darkBackground, darkSurface, darkText, purple, lightBlue } from "./constants/color";

// ── Lazy-loaded pages (each becomes its own JS chunk) ─────────────────────────
const Login          = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword  = lazy(() => import("./pages/ResetPassword"));
const NotFound       = lazy(() => import("./pages/NotFound"));

// Auth-required pages — only loaded after user is confirmed
const Dashboard      = lazy(() => import("./pages/Dashboard"));
const Groups         = lazy(() => import("./pages/Groups"));

// ── AuthenticatedApp: mounts SocketProvider ONLY when logged in ───────────────
// This prevents any WebSocket connection attempt on the login page or during
// the initial auth check, which eliminates the early WS error and wasted traffic.
const AuthenticatedRoutes = lazy(() => import("./components/auth/AuthenticatedRoutes"));

const App = () => {
  const { user, loader } = useSelector((state) => state.auth);
  const { themeMode, fontFamily } = useSelector((state) => state.misc);
  const dispatch = useDispatch();

  // Check auth once on mount — lightweight /me call
  useEffect(() => {
    axios
      .get(`${server}/api/v1/user/me`, { withCredentials: true })
      .then(({ data }) => dispatch(userExists(data)))
      .catch(() => dispatch(userNotExists()));
  }, [dispatch]);

  const theme = React.useMemo(() => createTheme({
    palette: {
      mode: themeMode,
      primary:    { main: purple },
      secondary:  { main: lightBlue },
      ...(themeMode === "dark"
        ? { background: { default: darkBackground, paper: darkSurface }, text: { primary: darkText } }
        : { background: { default: lightBackground, paper: lightSurface }, text: { primary: lightText } }),
    },
    typography: {
      fontFamily: `"${fontFamily}", "Helvetica", "Arial", sans-serif`,
      button: { textTransform: "none", fontWeight: 600 },
    },
    shape: { borderRadius: 12 },
  }), [themeMode, fontFamily]);

  // Show skeleton while the /me check is in flight
  if (loader) return <LayoutLoader />;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Suspense fallback={<LayoutLoader />}>
          <Routes>
            {/* Public routes — no socket, no heavy imports */}
            <Route
              path="/login"
              element={
                <ProtectRoute user={!user} redirect="/">
                  <Login />
                </ProtectRoute>
              }
            />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password"  element={<ResetPassword />} />

            {/* Protected routes — SocketProvider lives here, mounts only when authed */}
            <Route
              path="/*"
              element={
                <ProtectRoute user={user}>
                  <AuthenticatedRoutes />
                </ProtectRoute>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <Toaster position="bottom-center" />
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;
