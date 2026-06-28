import { tryCatch } from "../middlewares/error.js";
import { ErrorHandler } from "../utils/utility.js";
import { Message } from "../models/message.js";
import { emitEvent } from "../utils/features.js";
import { MESSAGE_EDITED, MESSAGE_DELETED } from "../constants/events.js";
import { Chat } from "../models/chat.js";

/**
 * Edit a message. Only the sender can edit it.
 * Emits MESSAGE_EDITED to all chat members in real-time.
 */
const editMessage = tryCatch(async (req, res, next) => {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim())
        return next(new ErrorHandler("Content cannot be empty", 400));

    const message = await Message.findById(id);
    if (!message)
        return next(new ErrorHandler("Message not found", 404));

    if (message.isDeleted)
        return next(new ErrorHandler("Cannot edit a deleted message", 400));

    if (message.sender.toString() !== req.user.toString())
        return next(new ErrorHandler("You can only edit your own messages", 403));

    // Push original content to history before overwriting
    message.editHistory.push({ content: message.content, editedAt: new Date() });
    message.content = content.trim();
    message.isEdited = true;

    await message.save();

    // Get chat members to emit real-time update
    const chat = await Chat.findById(message.chat);
    emitEvent(req, MESSAGE_EDITED, chat.members, {
        messageId: message._id,
        chatId: message.chat,
        content: message.content,
        isEdited: true,
    });

    return res.status(200).json({
        success: true,
        message: "Message edited successfully",
        data: { content: message.content, isEdited: message.isEdited },
    });
});

/**
 * Soft-delete a message (tombstone). Sender or group creator can delete.
 * Emits MESSAGE_DELETED to all chat members in real-time.
 */
const deleteMessage = tryCatch(async (req, res, next) => {
    const { id } = req.params;

    const message = await Message.findById(id);
    if (!message)
        return next(new ErrorHandler("Message not found", 404));

    if (message.isDeleted)
        return next(new ErrorHandler("Message is already deleted", 400));

    const chat = await Chat.findById(message.chat);
    if (!chat)
        return next(new ErrorHandler("Chat not found", 404));

    const isSender = message.sender.toString() === req.user.toString();
    const isGroupCreator = chat.groupChat && chat.creator.toString() === req.user.toString();

    if (!isSender && !isGroupCreator)
        return next(new ErrorHandler("You do not have permission to delete this message", 403));

    // Soft-delete: wipe content, mark as deleted
    message.content = "";
    message.isDeleted = true;

    await message.save();

    emitEvent(req, MESSAGE_DELETED, chat.members, {
        messageId: message._id,
        chatId: message.chat,
    });

    return res.status(200).json({
        success: true,
        message: "Message deleted successfully",
    });
});

/**
 * Search messages in a specific chat using MongoDB full-text index.
 * Falls back to $regex for short queries (< 3 chars).
 * Results are paginated and relevance-ranked.
 */
const searchMessages = tryCatch(async (req, res, next) => {
    const { chatId } = req.params;
    const { q = "", page = 1 } = req.query;
    const resultPerPage = 15;
    const skip = (page - 1) * resultPerPage;

    if (!q.trim())
        return res.status(200).json({ success: true, messages: [], totalPages: 0 });

    // Verify user is a member of this chat
    const chat = await Chat.findById(chatId);
    if (!chat)
        return next(new ErrorHandler("Chat not found", 404));

    if (!chat.members.some(m => m.toString() === req.user.toString()))
        return next(new ErrorHandler("Unauthorized", 403));

    let query = { chat: chatId, isDeleted: false };
    let sortOption = { createdAt: -1 };

    if (q.trim().length >= 3) {
        // Use MongoDB full-text search for proper relevance ranking
        query.$text = { $search: q.trim() };
        sortOption = { score: { $meta: "textScore" }, createdAt: -1 };
    } else {
        // Fallback to case-insensitive regex for short terms
        query.content = { $regex: q.trim(), $options: "i" };
    }

    const projection = q.trim().length >= 3
        ? { score: { $meta: "textScore" } }
        : {};

    const [messages, totalMessages] = await Promise.all([
        Message.find(query, projection)
            .sort(sortOption)
            .skip(skip)
            .limit(resultPerPage)
            .populate("sender", "name avatar")
            .lean(),
        Message.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalMessages / resultPerPage);

    return res.status(200).json({
        success: true,
        messages,
        totalPages,
        currentPage: Number(page),
        query: q.trim(),
    });
});

/**
 * Add, update, or remove an emoji reaction on a message.
 * Emits MESSAGE_REACTED to all chat members.
 */
const reactMessage = tryCatch(async (req, res, next) => {
    const { id } = req.params;
    const { emoji } = req.body; // e.g., "😂", "👍"

    if (!emoji) return next(new ErrorHandler("Emoji is required", 400));

    const message = await Message.findById(id);
    if (!message) return next(new ErrorHandler("Message not found", 404));

    const chat = await Chat.findById(message.chat);
    if (!chat) return next(new ErrorHandler("Chat not found", 404));

    // Verify user is in chat
    if (!chat.members.some(m => m.toString() === req.user.toString()))
        return next(new ErrorHandler("Unauthorized", 403));

    // Check if user already reacted
    const existingReactionIndex = message.reactions.findIndex(
        (r) => r.user.toString() === req.user.toString()
    );

    let action = "added";

    if (existingReactionIndex !== -1) {
        // If clicking the same emoji, remove it
        if (message.reactions[existingReactionIndex].emoji === emoji) {
            message.reactions.splice(existingReactionIndex, 1);
            action = "removed";
        } else {
            // Otherwise, update to new emoji
            message.reactions[existingReactionIndex].emoji = emoji;
            action = "updated";
        }
    } else {
        // Add new reaction
        message.reactions.push({ user: req.user, emoji });
    }

    await message.save();

    // Populate sender info for the frontend
    const populatedMessage = await Message.findById(id).populate("reactions.user", "name avatar");

    emitEvent(req, "MESSAGE_REACTED", chat.members, {
        messageId: message._id,
        chatId: message.chat,
        reactions: populatedMessage.reactions,
    });

    return res.status(200).json({
        success: true,
        message: `Reaction ${action}`,
        reactions: populatedMessage.reactions,
    });
});

/**
 * Forward a message to one or more chats.
 * Creates new messages and emits NEW_MESSAGE to target chats.
 */
const forwardMessage = tryCatch(async (req, res, next) => {
    const { messageId, targetChatIds } = req.body;

    if (!messageId || !targetChatIds || !targetChatIds.length) {
        return next(new ErrorHandler("Message ID and Target Chat IDs are required", 400));
    }

    const originalMessage = await Message.findById(messageId);
    if (!originalMessage || originalMessage.isDeleted) {
        return next(new ErrorHandler("Original message not found or deleted", 404));
    }

    // Verify user is in all target chats
    const targetChats = await Chat.find({ _id: { $in: targetChatIds } });
    const validChatIds = targetChats
        .filter(c => c.members.some(m => m.toString() === req.user.toString()))
        .map(c => c._id);

    if (!validChatIds.length) {
        return next(new ErrorHandler("You are not a member of the target chats", 403));
    }

    const newMessagesData = validChatIds.map(chatId => ({
        content: originalMessage.content,
        attachments: originalMessage.attachments,
        sender: req.user,
        chat: chatId,
    }));

    const newMessages = await Message.insertMany(newMessagesData);

    // Populate sender for sockets
    const populatedMessages = await Message.find({ _id: { $in: newMessages.map(m => m._id) } })
        .populate("sender", "name avatar");

    populatedMessages.forEach((msg) => {
        const chat = targetChats.find(c => c._id.toString() === msg.chat.toString());
        emitEvent(req, "NEW_MESSAGE", chat.members, {
            message: msg,
            chatId: chat._id,
        });
        emitEvent(req, "NEW_MESSAGE_ALERT", chat.members, { chatId: chat._id });
    });

    return res.status(200).json({
        success: true,
        message: "Message forwarded successfully",
    });
});

/**
 * Get all media attachments for a specific chat.
 */
const getMedia = tryCatch(async (req, res, next) => {
    const { chatId } = req.params;
    const { page = 1 } = req.query;
    const resultPerPage = 30;
    const skip = (page - 1) * resultPerPage;

    const chat = await Chat.findById(chatId);
    if (!chat) return next(new ErrorHandler("Chat not found", 404));

    if (!chat.members.some(m => m.toString() === req.user.toString()))
        return next(new ErrorHandler("Unauthorized", 403));

    const query = {
        chat: chatId,
        isDeleted: false,
        "attachments.0": { $exists: true }
    };

    const [messages, totalMessages] = await Promise.all([
        Message.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(resultPerPage)
            .populate("sender", "name avatar")
            .lean(),
        Message.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalMessages / resultPerPage);

    return res.status(200).json({
        success: true,
        messages,
        totalPages,
        currentPage: Number(page),
    });
});

export { editMessage, deleteMessage, searchMessages, reactMessage, forwardMessage, getMedia };
