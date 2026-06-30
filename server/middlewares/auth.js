import jwt from "jsonwebtoken";
import { chitChatTocken } from "../constants/config.js";
import { User } from "../models/user.js";
import { ErrorHandler } from "../utils/utility.js";
import { tryCatch } from "./error.js";

const handleJwtError = (error, next) => {
    if (error.name === 'TokenExpiredError') {
        return next(new ErrorHandler("Your session has expired. Please log in again.", 401));
    }
    if (error.name === 'JsonWebTokenError') {
        return next(new ErrorHandler("Invalid authentication token. Please log in again.", 401));
    }
    return next(new ErrorHandler("Authentication failed.", 401));
};

const isAuthenticated = tryCatch((req, res, next) => {
    const token = req.cookies[chitChatTocken];
    if (!token) {
        return next(new ErrorHandler("Please log in to access this route.", 401))
    }
    
    try {
        const decodedData = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decodedData._id;
        next();
    } catch (error) {
        return handleJwtError(error, next);
    }
})

const adminOnly = tryCatch((req, res, next) => {
    const token = req.cookies['chitChat-admin-token'];
    if (!token) {
        return next(new ErrorHandler("Admin access only.", 401))
    }

    try {
        const decodedData = jwt.verify(token, process.env.ADMIN_SECRET_KEY);
        req.user = decodedData._id;
        next();
    } catch (error) {
        return handleJwtError(error, next);
    }
});

const socketAuthenticator = async (err, socket, next) => {
    try {
        if (err) {
            return next(err);
        }
    
        const authToken = socket.request.cookies[chitChatTocken];

        if (!authToken) {
            return next(new ErrorHandler("Please log in to connect to chat.", 401));
        }
        
        let decodedData;
        try {
            decodedData = jwt.verify(authToken, process.env.JWT_SECRET);
        } catch (error) {
            if (error.name === 'TokenExpiredError') return next(new ErrorHandler("Session expired.", 401));
            return next(new ErrorHandler("Invalid token.", 401));
        }

        const user = await User.findById(decodedData._id);
        if (!user) {
            return next(new ErrorHandler("User not found.", 404));
        }
        
        socket.user = user;
        return next();
    } catch (error) {
        console.error("Socket Auth Error:", error);
        return next(new ErrorHandler("Authentication failed.", 401));
    }
}

export { adminOnly, isAuthenticated, socketAuthenticator };

