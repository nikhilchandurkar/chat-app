import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { getSockets } from "../lib/helper.js";

const cookieOption = {
    maxAge: 15 * 24 * 60 * 60 * 1000,
    // sameSite: "lax",
    samesite: "none",
    // sameSite:"true",
    httpOnly: true,
    secure: true,

}

const connectDB = (uri) => {
    mongoose.connect(uri, { dbName: "ChitChat" })
        .then((data) => console.log(`Connected to DB: ${data.connection.host}`))
        .catch((err) => {
            console.error("Error connecting to DB:", err);
            process.exit(1);
        });
};

// jwt for auth

const sendToken = (res, user, code, message) => {
    const token = jwt.sign({ _id: user._id },
        process.env.JWT_SECRET,
    );

    return res.status(code)
        .cookie("chitChat-Token", token, cookieOption)
        .json({
            success: true,
            message,
            user,
        });

}

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const emitEvent = (req, event, users, data) => {
    const io = req.app.get("io");
    if (!io) return;
    const usersSocket = getSockets(users);
    io.to(usersSocket).emit(event, data);
};

const uploadFilesToCloudinary = async (files = []) => {
    // With multer.diskStorage, the files are already saved to disk.
    // We just need to map them to the same format as Cloudinary used.
    if (!files || files.length === 0) {
        throw new Error("No files provided for upload.");
    }

    // Usually req.protocol and host are passed, but features.js doesn't have it here. 
    // Wait, the controllers pass `req.file`, we can just map the filename.
    // Actually, since we need full URL, we'll assume a relative path or construct it.
    // The controllers can prefix it if needed, but we'll return what we can.
    return files.map((file) => ({
        public_id: file.filename, // we use filename as the public_id
        url: `/api/v1/media/${file.filename}`, // Relative URL is safer anyway
    }));
};

const deleteFilesFromCloudnary = async (public_ids = []) => {
    if (!public_ids || public_ids.length === 0) return;

    public_ids.forEach(({ public_id }) => {
        if (!public_id) return;
        const filePath = path.join(__dirname, "..", "media", public_id);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            console.error("Failed to delete file from local storage:", error);
        }
    });
};

export {
    connectDB, cookieOption, deleteFilesFromCloudnary, emitEvent, sendToken, uploadFilesToCloudinary
};

