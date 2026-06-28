
import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import { httpCache } from "../middlewares/cache.js";
import { attachmentsMulter, singleAvatar } from "../middlewares/multer.js";
import {
    addMembers,
    deleteChats,
    getChatDetails,
    getMessages,
    getMyChats,
    getMyGroup,
    leaveGroup,
    newGroupChat,
    removeMembers,
    renameGroup,
    sendAttachments,
    pinMessage,
    unpinMessage,
    getPinnedMessages,
    addAdmin,
    removeAdmin,
    toggleRestrictMessages,
} from "../controllers/chat.js";

import {
    addMembersValidator,
    chatIdValidator,
    newGroupValidator,
    removeMembersValidator,
    renameGrouptValidator,
    sendAttachmentValidator,
    validateHandler
} from "../lib/validators.js";

const app = express.Router();

// afer here user must be logged in to access following groutes

app.use(isAuthenticated)

app.post("/new", newGroupValidator(),
    validateHandler,
    newGroupChat)

app.get("/my", httpCache, getMyChats)

app.get("/my/groups", httpCache, getMyGroup)

app.put("/addmembers", addMembersValidator(), validateHandler, addMembers)

app.put("/removemember", removeMembersValidator(), validateHandler, removeMembers)

app.delete("/leave/:id", chatIdValidator(), validateHandler, leaveGroup)

// why post because i am going to handle text messages via socket/ websocket 

app.post("/message",
    attachmentsMulter,
    sendAttachments);

// get messages 
app.get("/message/:id", chatIdValidator(), validateHandler, httpCache, getMessages);

app.route("/:id")
    .get(chatIdValidator(), validateHandler, httpCache, getChatDetails)
    .put(singleAvatar, renameGrouptValidator(), validateHandler, renameGroup)
    .delete(chatIdValidator(), validateHandler, deleteChats);

// ─── Advanced Admin Controls ──────────────────────────────────────────────────
app.put("/:id/restrict", toggleRestrictMessages);
app.post("/add-admin", addAdmin);
app.post("/remove-admin", removeAdmin);

// Pin routes
app.get("/:chatId/pins", getPinnedMessages);
app.post("/:chatId/pin/:messageId", pinMessage);
app.delete("/:chatId/pin/:messageId", unpinMessage);

export default app;
