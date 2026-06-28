import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import { singleAvatar } from "../middlewares/multer.js";

import {
    acceptFriendRequest,
    changePassword,
    deleteProfile,
    forgotPassword,
    getMyAllFriends,
    getMyProfile,
    getNotifications,
    getStarredMessages,
    login,
    logout,
    newUser,
    resetPassword,
    searchUser,
    sendFriendRequest,
    toggleStarMessage,
    updateProfile,
    updateStatus,
    updatePrivacy,
} from "../controllers/user.js";

import {
    acceptFriendRequestValidator,
    loginValidator,
    registerValidator,
    sendFriendRequestValidator,
    validateHandler,
} from "../lib/validators.js";

const app = express.Router();

// ─── Public Routes (no auth required) ────────────────────────────────────────
app.post("/newuser", singleAvatar, registerValidator(), validateHandler, newUser);
app.post("/login", loginValidator(), validateHandler, login);
app.post("/forgot-password", forgotPassword);
app.post("/reset-password", resetPassword);

// ─── Authenticated Routes ─────────────────────────────────────────────────────
app.use(isAuthenticated);

app.get("/me", getMyProfile);
app.put("/profile", singleAvatar, updateProfile);
app.delete("/profile", deleteProfile);
app.put("/password", changePassword);
app.put("/status", updateStatus);
app.put("/privacy", updatePrivacy);
app.post("/logout", logout);
app.get("/search", searchUser);

// Friends
app.put("/sendrequest", sendFriendRequestValidator(), validateHandler, sendFriendRequest);
app.put("/acceptrequest", acceptFriendRequest);
app.get("/notifications", getNotifications);
app.get("/friends", getMyAllFriends);

// Starred messages
app.post("/star/:id", toggleStarMessage);
app.get("/starred", getStarredMessages);

export default app;