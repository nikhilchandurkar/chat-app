import React from "react";
import AppLayout from "../components/layout/AppLayout";
import Home from "./Home";
import Chat from "./Chat";
import { useSelector } from "react-redux";
import Notifications from "../components/specific/Notifications";

const Dashboard = ({ chatId, user }) => {
    const { activeChatId, isNotification } = useSelector((state) => state.misc);

    if (isNotification) return <Notifications />;
    if (activeChatId) return <Chat chatId={activeChatId} user={user} />;
    
    return <Home />;
};

export default AppLayout()(Dashboard);
