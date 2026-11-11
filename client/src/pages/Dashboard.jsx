import React from "react";
import AppLayout from "../components/layout/AppLayout";
import Home from "./Home";
import Chat from "./Chat";
import { useSelector } from "react-redux";

const Dashboard = ({ user }) => {
    const { activeChatId } = useSelector((state) => state.misc);

    if (activeChatId) return <Chat key={activeChatId} chatId={activeChatId} user={user} />;
    
    return <Home />;
};

export default AppLayout()(Dashboard);
