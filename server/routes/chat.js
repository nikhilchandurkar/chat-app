
import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import { attachmentsMulter } from "../middlewares/multer.js";
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
    sendAttachments
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

app.get("/my", getMyChats)

app.get("/my/groups", getMyGroup)

app.put("/addmembers", addMembersValidator(), validateHandler, addMembers)

app.put("/removemember", removeMembersValidator(), validateHandler, removeMembers)

app.delete("/leave/:id", chatIdValidator(), validateHandler, leaveGroup)

// why post because i am going to handle text messages via socket/ websocket 

app.post("/message",
    attachmentsMulter,
    sendAttachmentValidator(),
    validateHandler,
    sendAttachments);

// get messages 
app.get("/message/:id", chatIdValidator(), validateHandler, getMessages);

app.route("/:id")
    .get(chatIdValidator(), validateHandler, getChatDetails)
    .put(renameGrouptValidator(), validateHandler, renameGroup)
    .delete(chatIdValidator(), validateHandler, deleteChats);


export default app;
