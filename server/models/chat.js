import mongoose, { Schema, Types, model } from "mongoose";

const schema = new Schema({
    name: { type: String, required: true },
    groupChat: { type: Boolean, default: false },
    creator: { type: Types.ObjectId, ref: "User" },
    members: [{ type: Types.ObjectId, ref: "User" }],
    // Advanced group controls
    admins: [{ type: Types.ObjectId, ref: "User" }],
    restrictedMessages: { type: Boolean, default: false }, // if true, only admins can send messages
    
    // Pinned messages - max 3 per chat
    pinnedMessages: [{ type: Types.ObjectId, ref: "Message" }],
}, { timestamps: true });

export const Chat = mongoose.models.Chat || model("Chat", schema);