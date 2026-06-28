import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import { editMessage, deleteMessage, searchMessages, reactMessage, forwardMessage, getMedia } from "../controllers/message.js";

const app = express.Router();

app.use(isAuthenticated);

// Search messages in a chat
app.get("/search/:chatId", searchMessages);

// Edit a message (sender only)
app.patch("/:id", editMessage);

// Soft-delete a message (tombstone)
app.delete("/:id", deleteMessage);

// React to a message
app.post("/react/:id", reactMessage);

// Forward a message
app.post("/forward", forwardMessage);

// Get chat media
app.get("/media/:chatId", getMedia);

export default app;
