import mongoose from "mongoose";
import dotenv from "dotenv";
import { Chat } from "./models/chat.js";

dotenv.config({
  path: "./.env",
});

const migrate = async () => {
  try {
    console.log("Connecting to Database for Migration...");
    await mongoose.connect(process.env.MONGO_URI, { dbName: "ChitChat" });
    console.log("Connected. Running migration for Chat schema...");

    const chats = await Chat.find({ groupChat: true });
    console.log(`Found ${chats.length} group chats to migrate.`);

    let updatedCount = 0;
    for (const chat of chats) {
      let changed = false;

      if (!chat.admins || chat.admins.length === 0) {
        if (chat.creator) {
          chat.admins = [chat.creator];
          changed = true;
        }
      }

      if (typeof chat.restrictedMessages === 'undefined') {
        chat.restrictedMessages = false;
        changed = true;
      }

      if (changed) {
        await chat.save();
        updatedCount++;
      }
    }

    console.log(`Migration complete! Successfully updated ${updatedCount} group chats.`);
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

migrate();
