import cookieParser from "cookie-parser";
import cors from 'cors';
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import dotenv from "dotenv";
import express from "express";
import { createServer } from 'http';
import { Server } from "socket.io";
import crypto from "crypto";
import { NEW_MESSAGE, START_TYPING, STOP_TYPING, ONLINE_USERS } from "./constants/events.js";
import { getSockets } from "./lib/helper.js";
import { socketAuthenticator } from "./middlewares/auth.js";
import { errorMiddleware } from "./middlewares/error.js";
import { Message } from "./models/message.js";
import adminRoute from "./routes/admin.js";
import chatRoute from "./routes/chat.js";
import userRoute from "./routes/user.js";
import messageRoute from "./routes/message.js";
import previewRoute from "./routes/preview.js";
import { connectDB } from "./utils/features.js";
import { corsOption } from "./constants/config.js";
import path from 'path';
import { fileURLToPath } from 'url';
import { requestLogger } from "./middlewares/logger.js";

try {
    dotenv.config({ path: ".env" });
    const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env.development";
    dotenv.config({ path: envFile, override: true });
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


const userSocketIDs = new Map();

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: corsOption });

// Make io accessible in controllers via req.app.get('io')
app.set("io", io);

app.use(express.json());
app.use(requestLogger);
app.use(helmet());
app.use(mongoSanitize());
app.use(xss());
app.use(cookieParser());
app.use(cors(corsOption));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/api/v1/media', express.static(path.join(__dirname, 'media')));

app.get("/", (req, res) => {
    res.json("hello its chat app API");
});
app.get("/hello", (req, res) => {
    res.json("hello from nikki");
});


app.use("/api/v1/user", userRoute);
app.use("/api/v1/chat", chatRoute);
app.use("/api/v1/admin", adminRoute);
app.use("/api/v1/message", messageRoute);
app.use("/api/v1/preview", previewRoute);

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
                _id: crypto.randomUUID(),
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

        socket.on(START_TYPING, ({ members, chatId }) => {
            const membersSocket = getSockets(members, userSocketIDs);
            socket.to(membersSocket).emit(START_TYPING, { chatId });
        });

        socket.on(STOP_TYPING, ({ members, chatId }) => {
            const membersSocket = getSockets(members, userSocketIDs);
            socket.to(membersSocket).emit(STOP_TYPING, { chatId });
        });

        io.emit(ONLINE_USERS, Array.from(userSocketIDs.keys()));

        socket.on("disconnect", () => {
            userSocketIDs.delete(user._id.toString());
            console.log("User disconnected, updated users:", userSocketIDs);
            io.emit(ONLINE_USERS, Array.from(userSocketIDs.keys()));
        });
    } catch (error) {
        console.error("Socket connection error:", error);
    }
});

app.use(errorMiddleware);

// Start the server
server.listen(port, '0.0.0.0', () => {
    console.log(`Server is running at port ${port} in ${process.env.NODE_ENV || "development"}`);
});

// Export userSocketIDs as a named export and app as the default export
export { userSocketIDs };
export default app;