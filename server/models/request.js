import mongoose, { Schema, model, Types } from "mongoose";

const requestSchema = new Schema(
   {
      status: {
         type: String,
         default: "pending",
         enum: ["pending", "accepted", "rejected"]
      },
      sender: {
         type: Types.ObjectId,
         ref: "User",
         required: true
      },
      receiver: {
         type: Types.ObjectId,
         ref: "User",
         required: true
      }
   },
   {
      timestamps: true
   }
);

// Check if model already exists to avoid OverwriteModelError during hot-reloading
export const Request = mongoose.models.Request || model("Request", requestSchema);
