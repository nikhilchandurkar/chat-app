import { compare } from "bcrypt";
import Joi from "joi";
import { NEW_REQUEST, REFETCH_CHATS } from "../constants/events.js";
import { getOtherMembers } from "../lib/helper.js";
import { tryCatch } from "../middlewares/error.js";
import { Chat } from "../models/chat.js";
import { Request } from "../models/request.js";
import { User } from "../models/user.js";
import {
    cookieOption,
    emitEvent,
    sendToken,
    uploadFilesToCloudinary,
} from "../utils/features.js";
import { ErrorHandler } from "../utils/utility.js";

// Utility for standardized responses
const sendResponse = (res, success, message, data = {}) => {
    res.status(success ? 200 : 400).json({ success, message, ...data });
};

// Validation schema for user data
const userValidationSchema = Joi.object({
    name: Joi.string().min(3).max(50).required(),
    username: Joi.string().min(3).max(30).required(),
    password: Joi.string().min(8).required(),
    bio: Joi.string().max(150),
});

// Create new user, save in DB, and set a cookie
const newUser = tryCatch(async (req, res, next) => {
    const { name, username, password, bio } = req.body;
    const file = req.file;

    const { error } = userValidationSchema.validate(req.body);
    if (error) {
        return next(new ErrorHandler(error.details[0].message, 400));
    }

    if (!file) {
        return next(new ErrorHandler("Please upload an avatar", 400));
    }

    let avatar;
    try {
        const result = await uploadFilesToCloudinary([file]);
        if (!result || !result[0]) throw new Error("Avatar upload failed");
        avatar = { public_id: result[0].public_id, url: result[0].url };
    } catch (err) {
        return next(new ErrorHandler(err.message, 500));
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
        return next(new ErrorHandler("Username already exists", 400));
    }

    try {
        const user = await User.create({ name, username, password, bio, avatar });
        sendToken(res, user, 201, "User Created");
    } catch (err) {
        return next(new ErrorHandler("Failed to create user: " + err.message, 500));
    }
});

// Login user
const login = tryCatch(async (req, res, next) => {
    const { username, password } = req.body;

    const user = await User.findOne({ username }).select("+password");
    if (!user) {
        return next(new ErrorHandler("Invalid username or password", 404));
    }

    const isMatch = await compare(password, user.password);
    if (!isMatch) {
        return next(new ErrorHandler("Invalid username or password", 404));
    }

    sendToken(res, user, 200, `Welcome back ${user.name}`);
});

// Get user profile
const  getMyProfile = tryCatch(async (req, res, next) => {
    const user = await User.findById(req.user).select("-password");
    if (!user) {
        return next(new ErrorHandler("User not found", 404));
    }
    console.log(user)
    sendResponse(res, true, "User profile fetched", { user });
});

// Logout user
const logout = tryCatch(async (req, res, next) => {
    res.status(200)
        .cookie("chitChat-Token", "", { ...cookieOption, maxAge: 0 })
        .json({ success: true, message: "Logout successful" });
});

// Search user
const searchUser = tryCatch(async (req, res, next) => {
    const { name = "", page = 1, limit = 10 } = req.query;

    const myChats = await Chat.find({ GroupChat: false, members: req.user });
    const allUsersFromMyChats = myChats.map(chat => chat.members).flat();

    const allUserExceptMeAndMyFriends = await User.find({
        _id: { $nin: allUsersFromMyChats },
        name: { $regex: name, $options: "i" },
    })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const users = allUserExceptMeAndMyFriends.map(({ _id, avatar, name }) => ({
        _id,
        name,
        avatar: avatar.url,
    }));

    sendResponse(res, true, "Users fetched successfully", { users });
});

// Send friend request
const sendFriendRequest = tryCatch(async (req, res, next) => {
    const { userId } = req.body;

    if (req.user === userId) {
        return next(new ErrorHandler("You cannot send a friend request to yourself", 400));
    }

    const request = await Request.findOne({
        $or: [
            { sender: req.user, receiver: userId },
            { sender: userId, receiver: req.user },
        ],
    });

    if (request) {
        return next(new ErrorHandler("Request already sent", 400));
    }

    try {
        await Request.create({ sender: req.user, receiver: userId });
        emitEvent(req.user, NEW_REQUEST, userId, "request");
        sendResponse(res, true, "Friend request sent successfully");
    } catch (err) {
        return next(new ErrorHandler("Failed to send friend request: " + err.message, 500));
    }
});

// Accept friend request
const acceptFriendRequest = tryCatch(async (req, res, next) => {
    const { requestId, accept } = req.body;

    const request = await Request.findById(requestId).populate("sender", "name").populate("receiver", "name");

    if (!request) return next(new ErrorHandler("Request not found", 404));
    if (request.receiver._id.toString() !== req.user.toString()) {
        return next(new ErrorHandler("Unauthorized", 401));
    }

    if (!accept) {
        await request.deleteOne();
        return sendResponse(res, true, "Request rejected");
    }

    const members = [request.sender._id, request.receiver._id];

    try {
        await Promise.all([
            Chat.create({ members, name: `${request.sender.name} <===> ${request.receiver.name}` }),
            request.deleteOne(),
        ]);
        emitEvent(req, REFETCH_CHATS, members);
        sendResponse(res, true, "Friend request accepted", { senderId: request.sender._id });
    } catch (err) {
        return next(new ErrorHandler("Failed to process the friend request: " + err.message, 500));
    }
});

// Get notifications
const getNotifications = tryCatch(async (req, res, next) => {
    const requests = await Request.find({ receiver: req.user }).populate("sender", "name avatar");
    const allRequests = requests.map(({ _id, sender }) => ({
        _id,
        sender: {
            _id: sender._id,
            name: sender.name,
            avatar: sender.avatar?.url || null,
        },
    }));

    sendResponse(res, true, "Notifications fetched successfully", { allRequests });
});

// Get all friends
const getMyAllFriends = tryCatch(async (req, res, next) => {
    const { chatId } = req.query;

    const chats = await Chat.find({ members: req.user, GroupChat: false }).populate("members", "name avatar");

    const friends = chats
        .map(({ members }) => {
            const otherUser = getOtherMembers(members, req.user);
            if (!otherUser) return null;
            return { _id: otherUser._id, name: otherUser.name, avatar: otherUser.avatar?.url || null };
        })
        .filter(Boolean);

    if (chatId) {
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return sendResponse(res, false, "Chat not found");
        }

        const availableFriends = friends.filter(friend => !chat.members.includes(friend._id.toString()));
        return sendResponse(res, true, "Available friends fetched", { friends: availableFriends });
    }

    sendResponse(res, true, "Friends fetched successfully", { friends });
});

export {
    acceptFriendRequest,
    getMyAllFriends,
    getMyProfile,
    getNotifications,
    login,
    logout,
    newUser,
    searchUser,
    sendFriendRequest,
};
