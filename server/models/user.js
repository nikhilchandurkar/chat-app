import mongoose, { Schema, model, Types } from "mongoose";
import { hash } from "bcrypt";

const schema = new Schema({
   name: { type: String, required: true },
   bio: { type: String, default: "" },

   email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
   },

   username: { type: String, required: true },

   password: { type: String, select: false, required: true },

   avatar: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
   },

   // User availability status
   status: {
      type: String,
      enum: ["online", "away", "busy", "dnd"],
      default: "online",
   },

   // Bookmarked/Starred messages
   starredMessages: [{ type: Types.ObjectId, ref: "Message" }],

   // Password reset (production URL-token based)
   resetPasswordToken: { type: String, select: false },
   resetPasswordExpires: { type: Date, select: false },

   // Privacy Settings
   privacy: {
      profile: {
         type: String,
         enum: ["everyone", "friends", "nobody"],
         default: "everyone",
      },
   },

}, { timestamps: true });

// Indexes
schema.index({ username: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
schema.index({ email: 1 }, { unique: true });
schema.index({ name: "text", bio: "text" }, { weights: { name: 5, bio: 1 } });
schema.index({ createdAt: -1, username: 1 });

// Auto-hash password before save
schema.pre("save", async function (next) {
   if (!this.isModified("password")) return next();
   this.password = await hash(this.password, 10);
   return next();
});

export const User = mongoose.models.User || model("User", schema);

