import mongoose, { Schema, model, Types } from "mongoose";

import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.MESSAGE_ENCRYPTION_KEY || '12345678901234567890123456789012';
const IV_LENGTH = 16;

function encrypt(text) {
    if (!text) return text;
    if (text.startsWith('ENC:')) return text;
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return 'ENC:' + iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text || !text.startsWith('ENC:')) return text;
    try {
        let textParts = text.substring(4).split(':');
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join(':'), 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        return "[Encrypted Message - Unable to Decrypt]";
    }
}

const editHistorySchema = new Schema({
   content: { type: String, set: encrypt, get: decrypt },
   editedAt: { type: Date, default: Date.now },
}, { _id: false, toJSON: { getters: true }, toObject: { getters: true } });

const schema = new Schema(
   {
      content: { type: String, default: "", set: encrypt, get: decrypt },
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

      // Message Reply
      replyTo: {
         type: Types.ObjectId,
         ref: "Message",
         default: null
      },
      
      // Read Receipts
      readBy: [{
         type: Types.ObjectId,
         ref: "User"
      }],
   },
   { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } }
);

// Full-text search index on content
schema.index({ content: "text" });
// Compound index for fast per-chat paginated message loading
schema.index({ chat: 1, createdAt: -1 });
// Index for fast ownership checks on edit/delete
schema.index({ sender: 1 });

export const Message = mongoose.models.Message || model("Message", schema);