import { createContext, useMemo, useContext } from "react";
import io from "socket.io-client";
import { server } from "./constants/config";

const SocketContext = createContext();

const getSocket = () => useContext(SocketContext);

const SocketProvider = ({ children }) => {
  const socketHost = server || (typeof window !== "undefined" ? window.location.origin : "");
  const socket = useMemo(
    () =>
      io(socketHost, {
        withCredentials: true,
        transports: ["websocket", "polling"],
        path: "/socket.io/",
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      }),
    [socketHost]
  );

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};

export { SocketProvider, getSocket };
