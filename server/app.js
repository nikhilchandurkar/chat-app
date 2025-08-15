import { v2 as cloudinary } from "cloudinary";
import cookieParser from "cookie-parser";
import cors from 'cors';
import dotenv from "dotenv";
import express from "express";
import { createServer } from 'http';
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import { NEW_MESSAGE } from "./constants/events.js";
import { getSockets } from "./lib/helper.js";
import { socketAuthenticator } from "./middlewares/auth.js";
import { errorMiddleware } from "./middlewares/error.js";
import { Message } from "./models/message.js";
import adminRoute from "./routes/admin.js";
import chatRoute from "./routes/chat.js";
import userRoute from "./routes/user.js";
import { connectDB } from "./utils/features.js";
import { corsOption } from "./constants/config.js";

try {
    dotenv.config({ path: "./.env" });
} catch (error) {
    console.error("Failed to load environment variables:", error);
    process.exit(1); // Exit process if .env fails
}

const MONGO_URI = process.env.MONGO_URI
const port = process.env.PORT || 3000;

// Database connection
try {
    connectDB(MONGO_URI);  
} catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1); // Exit process if DB connection fails
}

// Cloudinary configuration
try {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
} catch (error) {
    console.error("Failed to configure Cloudinary:", error);
    process.exit(1); // Exit process if Cloudinary config fails
}

const userSocketIDs = new Map();

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: corsOption,
});

app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOption));

app.get("/", (req, res) => {
    res.json("hello its chat app API");
});
app.get("/hello", (req, res) => {
    res.json("hello from nikki");
});


app.use("/api/v1/user", userRoute);
app.use("/api/v1/chat", chatRoute);
app.use("/api/v1/admin", adminRoute);

io.use((socket, next) => {
    try {
        cookieParser()(socket.request, socket.request.res, async (err) => {
            if (err) {
                console.error("Cookie parsing failed:", err);
                return next(err);
            }
            await socketAuthenticator(err, socket, next);
        });
    } catch (error) {
        console.error("Socket authentication error:", error);
        next(error);
    }
});

io.on("connection", (socket) => {
    try {
        const user = socket.user;
        userSocketIDs.set(user._id.toString(), socket.id);
        console.log("Connected users:", userSocketIDs);

        socket.on(NEW_MESSAGE, async ({ chatId, members, message }) => {
            const messageForRealTime = {
                content: message,
                _id: uuid(),
                sender: {
                    _id: user._id,
                    name: user.name,
                },
                chat: chatId,
                createdAt: new Date().toISOString(),
            };

            const messageForDB = {
                content: message,
                sender: user._id,
                chat: chatId,
            };

            console.log("Emitting", messageForRealTime);
            try {
                const membersSocket = getSockets(members, userSocketIDs);
                io.to(membersSocket).emit(NEW_MESSAGE, {
                    chatId,
                    message: messageForRealTime,
                });
                io.to(membersSocket).emit("NEW_MESSAGE_COUNT", { chatId });
                await Message.create(messageForDB);
            } catch (error) {
                console.error("Failed to handle new message:", error);
            }
        });

        socket.on("disconnect", () => {
            userSocketIDs.delete(user._id.toString());
            console.log("User disconnected, updated users:", userSocketIDs);
        });
    } catch (error) {
        console.error("Socket connection error:", error);
    }
});

app.use(errorMiddleware);

// Start the server
server.listen(port, () => {
    console.log(`Server is running at port ${port} in ${process.env.NODE_ENV || "development"}`);
});

// Export userSocketIDs as a named export and app as the default export
export { userSocketIDs };
export default app;