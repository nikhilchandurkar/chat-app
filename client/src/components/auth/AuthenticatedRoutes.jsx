/**
 * AuthenticatedRoutes
 *
 * Rendered ONLY when the user is logged in.
 * The SocketProvider (WebSocket) is initialised here so it never
 * opens a connection on the login/public pages.
 */
import React, { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { useSelector } from "react-redux";
import { SocketProvider } from "../../socket.ts";
import { LayoutLoader } from "../layout/Loaders";

const Dashboard = lazy(() => import("../../pages/Dashboard"));
const Groups    = lazy(() => import("../../pages/Groups"));
const NotFound  = lazy(() => import("../../pages/NotFound"));

const AuthenticatedRoutes = () => {
  const token = useSelector((state) => state.auth?.token);

  return (
    // WebSocket only connects once we're inside this component (user is authed)
    <SocketProvider token={token}>
      <Suspense fallback={<LayoutLoader />}>
        <Routes>
          <Route path="/"       element={<Dashboard />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="*"       element={<NotFound />} />
        </Routes>
      </Suspense>
    </SocketProvider>
  );
};

export default AuthenticatedRoutes;
