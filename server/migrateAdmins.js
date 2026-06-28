import mongoose from "mongoose";
import dotenv from "dotenv";
import { Chat } from "./models/chat.js";

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        const groupChats = await Chat.find({ groupChat: true });
        
        let updatedCount = 0;
        for (const chat of groupChats) {
            if (chat.creator && (!chat.admins || chat.admins.length === 0)) {
                chat.admins = [chat.creator];
                await chat.save();
                updatedCount++;
            }
        }
        
        console.log(`Migration complete. Updated ${updatedCount} group chats.`);
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

migrate();
