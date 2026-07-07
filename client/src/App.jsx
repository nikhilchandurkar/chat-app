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

import { lightBackground, lightSurface, lightText, darkBackground, darkSurface, darkText, purple, lightBlue } from "./constants/color";

const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Chat = lazy(() => import("./pages/Chat"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Groups = lazy(() => import("./pages/Groups"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

const App = () => {
  const { user, loader } = useSelector((state) => state.auth);
  const { themeMode, fontFamily } = useSelector((state) => state.misc);
  const dispatch = useDispatch();

  const theme = React.useMemo(() => createTheme({
    palette: {
      mode: themeMode,
      primary: { main: purple }, // Apple Blue
      secondary: { main: lightBlue }, // Apple Green
      ...(themeMode === "dark" ? {
        background: { default: darkBackground, paper: darkSurface },
        text: { primary: darkText },
      } : {
        background: { default: lightBackground, paper: lightSurface },
        text: { primary: lightText },
      }),
    },
    typography: {
      fontFamily: `"${fontFamily}", "Helvetica", "Arial", sans-serif`,
      button: {
        textTransform: "none", // Apple style buttons are not uppercase
        fontWeight: 600,
      }
    },
    shape: {
      borderRadius: 12, // More rounded corners
    }
  }), [themeMode, fontFamily]);

  useEffect(() => {
    axios
      .get(`${server}/api/v1/user/me`, { withCredentials: true })
      .then(({ data }) => dispatch(userExists(data.user)))
      .catch(() => dispatch(userNotExists()));
  }, [dispatch]);

  return loader ? (
    <LayoutLoader />
  ) : (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SocketProvider>
        <BrowserRouter>
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
    </ThemeProvider>
  );
};

export default App;

