import mongoose, { Schema, model, Types } from "mongoose";

const editHistorySchema = new Schema({
   content: { type: String },
   editedAt: { type: Date, default: Date.now },
}, { _id: false });

const schema = new Schema(
   {
      content: { type: String, default: "" },
      attachments: [{
         public_id: { type: String, required: true },
         url: { type: String, required: true },
      }],
      sender: {
         type: Types.ObjectId,
         ref: "User",
         required: true
      },
      chat: {
         type: Types.ObjectId,
         ref: "Chat",
         required: true
      },
      // Edit / Delete (Tombstone) fields
      isDeleted: { type: Boolean, default: false },
      isEdited: { type: Boolean, default: false },
      editHistory: [editHistorySchema],
      
      // Emoji reactions (Slack/WhatsApp style)
      reactions: [{
         user: { type: Types.ObjectId, ref: "User", required: true },
         emoji: { type: String, required: true }
      }],
   },
   { timestamps: true }
);

// Full-text search index on content
schema.index({ content: "text" });
// Compound index for fast per-chat paginated message loading
schema.index({ chat: 1, createdAt: -1 });
// Index for fast ownership checks on edit/delete
schema.index({ sender: 1 });

export const Message = mongoose.models.Message || model("Message", schema);