import axios from "axios";
import React, { Suspense, lazy, useEffect } from "react";
import { Toaster } from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import ProtectRoute from "./components/auth/ProtectRoute";
import { LayoutLoader } from "./components/layout/Loaders";
import { server } from "./constants/config";
import { userExists, userNotExists } from "./redux/reducers/auth";
import { SocketProvider } from "./socket";
import { ThemeProvider, createTheme } from "@mui/material/styles";
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

const App = () => {
  const { user, loader } = useSelector((state) => state.auth);
  const { themeMode, fontFamily } = useSelector((state) => state.misc);
  const dispatch = useDispatch();

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

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {loader ? (
        <LayoutLoader />
      ) : (
        <SocketProvider user={user}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Suspense fallback={<LayoutLoader />}>
              <Routes>
                <Route element={<ProtectRoute user={user} />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/groups" element={<Groups />} />
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

