import { v2 as cloudinary } from "cloudinary";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { v4 as uuid } from "uuid";
import { getBase64 } from "../lib/helper.js";

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
            // user,
        });

}

const uploadFilesToCloudinary = async (files = []) => {
    if (!files || files.length === 0) {
        throw new Error("No files provided for upload.");
    }

    try {
        const uploads = files.map((file) =>
            cloudinary.uploader.upload(getBase64(file), {
                resource_type: "auto",
                // Generate unique ID for each file
                public_id: uuid(),
            })
        );

        const results = await Promise.all(uploads);

        console.log("Upload results:", results);

        return results.map((result) => ({
            public_id: result.public_id,
            url: result.secure_url,
        }));
    } catch (error) {
        console.error("Error uploading files to Cloudinary:", error);
        throw new Error("Error uploading files to Cloudinary");
    }
};


const emitEvent = (req, event, user, data) => {
    console.log("emmitng event", event)
}

const deleteFilesFromCloudnary = async (public_ids) => {


}



export {
    connectDB, cookieOption, deleteFilesFromCloudnary, emitEvent, sendToken, uploadFilesToCloudinary
};

