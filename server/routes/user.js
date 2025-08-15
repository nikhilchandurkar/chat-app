import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import { singleAvatar } from "../middlewares/multer.js";

import {
    acceptFriendRequest,
    getMyAllFriends,
    getMyProfile,
    getNotifications,
    login,
    logout,
    newUser,
    searchUser,
    sendFriendRequest
} from "../controllers/user.js";

import {
    acceptFriendRequestValidator,
    loginValidator,
    registerValidator,
    sendFriendRequestValidator,
    validateHandler
} from "../lib/validators.js";

const app = express.Router();
app.post("/newuser", singleAvatar, registerValidator(), validateHandler, newUser)

app.post("/login", loginValidator(), validateHandler, login)

// afer here user must be logged in to access following routes

app.use(isAuthenticated)

app.get("/me", getMyProfile)

app.post("/logout", logout)

app.get("/search", searchUser)

app.put("/sendrequest",
    sendFriendRequestValidator(),
    validateHandler,
    sendFriendRequest)

app.put("/acceptrequest",
    // acceptFriendRequestValidator(),
    // validateHandler,
    acceptFriendRequest)

app.get("/notifications", getNotifications);

app.get("/friends" , getMyAllFriends)





export default app;