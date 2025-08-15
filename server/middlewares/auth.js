import jwt from "jsonwebtoken";
import { chitChatTocken } from "../constants/config.js";
import { User } from "../models/user.js";
import { ErrorHandler } from "../utils/utility.js";
import { tryCatch } from "./error.js";

const isAuthenticated = tryCatch((req, res, next) => {
    const token = req.cookies[chitChatTocken];
    if (!token) {
        return next(new ErrorHandler("please login to acces this route", 401))
    }
    const decodedData = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decodedData._id;
    next();
})

const adminOnly = (req, res, next) => {
    const token = req.cookies['chitChat-admin-token'];
    if (!token) {
        return next(new ErrorHandler("admin access only", 401))
    }
    const decodedData = jwt.verify(token, process.env.ADMIN_SECRET_KEY)
    req.user = decodedData._id;
    next();
}

const socketAuthenticator = async (err, socket, next) => {
    try {
        if (err) {
            console.log(err);
            return next(err);
        }
    
        const authToken = socket.request.cookies[chitChatTocken];

        if (!authToken) {
            return next(new ErrorHandler("Please login to access this route", 401));
        }
        
        const decodedData = jwt.verify(authToken, process.env.JWT_SECRET);
        const user = await User.findById(decodedData._id);
        
        if (!user) {
            return next(new ErrorHandler("Please login to access this route", 401));
        }
        
        socket.user = user;
        return next();

    } catch (error) {
        console.log(error);
        return next(new ErrorHandler("Please login to access this route", 401));
    }
}

export { adminOnly, isAuthenticated, socketAuthenticator };

