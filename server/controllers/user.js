import { compare } from "bcrypt";
import crypto from "crypto";
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
} from "../utils/features.js";
import { ErrorHandler } from "../utils/utility.js";
import { sendResetEmail } from "../utils/mailer.js";
import { Message } from "../models/message.js";

// ─── Utility ──────────────────────────────────────────────────────────────────
const sendResponse = (res, success, message, data = {}) => {
    res.status(success ? 200 : 400).json({ success, message, ...data });
};

const userValidationSchema = Joi.object({
    name: Joi.string().min(3).max(50).required(),
    username: Joi.string().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    bio: Joi.string().max(150).allow("", null),
    avatar: Joi.any().optional(),
});

// ─── Register ─────────────────────────────────────────────────────────────────
const newUser = tryCatch(async (req, res, next) => {
    const { name, username, password, bio, email } = req.body;
    const file = req.file;

    const { error } = userValidationSchema.validate({ name, username, email, password, bio });
    if (error) return next(new ErrorHandler(error.details[0].message, 400));

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
        const field = existingUser.username === username ? "Username" : "Email";
        return next(new ErrorHandler(`${field} already in use`, 400));
    }

    let avatar = { public_id: "", url: "" };
    if (file) {
        avatar = {
            public_id: file.filename,
            url: `/api/v1/media/${file.filename}`,
        };
    }

    const user = await User.create({ name, username, email, password, bio, avatar });
    sendToken(res, user, 201, "User Created");
});

// ─── Login (username OR email) ────────────────────────────────────────────────
const login = tryCatch(async (req, res, next) => {
    const { username, password } = req.body;

    // Support login via username or email
    const user = await User.findOne({
        $or: [
            { username: username?.toLowerCase() },
            { email: username?.toLowerCase() },
        ],
    }).select("+password");

    if (!user) return next(new ErrorHandler("Invalid credentials", 401));

    const isMatch = await compare(password, user.password);
    if (!isMatch) return next(new ErrorHandler("Invalid credentials", 401));

    sendToken(res, user, 200, `Welcome back, ${user.name}!`);
});

// ─── Get Profile ──────────────────────────────────────────────────────────────
const getMyProfile = tryCatch(async (req, res, next) => {
    const user = await User.findById(req.user).select("-password");
    if (!user) return next(new ErrorHandler("User not found", 404));
    sendResponse(res, true, "User profile fetched", { user });
});

// ─── Logout ───────────────────────────────────────────────────────────────────
const logout = tryCatch(async (req, res, next) => {
    res.status(200)
        .cookie("chitChat-Token", "", { ...cookieOption, maxAge: 0 })
        .json({ success: true, message: "Logout successful" });
});

// ─── Update Profile ───────────────────────────────────────────────────────────
const updateProfile = tryCatch(async (req, res, next) => {
    const { name, bio } = req.body;
    const file = req.file;

    const user = await User.findById(req.user).select("+password");
    if (!user) return next(new ErrorHandler("User not found", 404));

    if (name) user.name = name;
    if (bio !== undefined) user.bio = bio;

    if (file) {
        user.avatar = {
            public_id: file.filename,
            url: `/api/v1/media/${file.filename}`,
        };
    }

    await user.save();
    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.password;
    sendResponse(res, true, "Profile updated successfully", { user: userWithoutPassword });
});

// ─── Change Password (authenticated) ─────────────────────────────────────────
const changePassword = tryCatch(async (req, res, next) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword)
        return next(new ErrorHandler("Please provide current and new password", 400));

    if (newPassword.length < 8)
        return next(new ErrorHandler("New password must be at least 8 characters", 400));

    const user = await User.findById(req.user).select("+password");
    if (!user) return next(new ErrorHandler("User not found", 404));

    const isMatch = await compare(currentPassword, user.password);
    if (!isMatch) return next(new ErrorHandler("Current password is incorrect", 401));

    user.password = newPassword; // pre-save hook will hash it
    await user.save();

    sendResponse(res, true, "Password changed successfully");
});

// ─── Forgot Password ──────────────────────────────────────────────────────────
const forgotPassword = tryCatch(async (req, res, next) => {
    const { email } = req.body;
    if (!email) return next(new ErrorHandler("Please provide your email address", 400));

    const user = await User.findOne({ email: email.toLowerCase() });
    // Always return success to prevent user enumeration attacks
    if (!user) {
        return res.status(200).json({
            success: true,
            message: "If an account exists with that email, a reset link has been sent.",
        });
    }

    // Generate secure random token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    // Build production-ready reset URL
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const resetUrl = `${clientUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

    try {
        await sendResetEmail(user.email, resetUrl, user.name);
    } catch (err) {
        // Rollback token if email fails
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save({ validateBeforeSave: false });
        return next(new ErrorHandler("Email could not be sent. Please try again later.", 500));
    }

    res.status(200).json({
        success: true,
        message: "If an account exists with that email, a reset link has been sent.",
    });
});

// ─── Reset Password (URL token based) ────────────────────────────────────────
const resetPassword = tryCatch(async (req, res, next) => {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword)
        return next(new ErrorHandler("Invalid reset request", 400));

    if (newPassword.length < 8)
        return next(new ErrorHandler("Password must be at least 8 characters", 400));

    // Hash the incoming raw token to compare with stored hash
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
        email: email.toLowerCase(),
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() },
    }).select("+resetPasswordToken +resetPasswordExpires +password");

    if (!user) return next(new ErrorHandler("Reset link is invalid or has expired. Please request a new one.", 400));

    user.password = newPassword; // pre-save hook hashes it
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    sendToken(res, user, 200, "Password reset successfully. You are now logged in.");
});

// ─── Update Status ────────────────────────────────────────────────────────────
const updateStatus = tryCatch(async (req, res, next) => {
    const { status } = req.body;
    const validStatuses = ["online", "away", "busy", "dnd"];

    if (!validStatuses.includes(status))
        return next(new ErrorHandler("Invalid status value", 400));

    await User.findByIdAndUpdate(req.user, { status });

    // Emit to all connected sockets via req.app (io is attached to app)
    const io = req.app.get("io");
    if (io) {
        io.emit("USER_STATUS_CHANGED", { userId: req.user.toString(), status });
    }

    sendResponse(res, true, "Status updated", { status });
});

// ─── Delete Profile ───────────────────────────────────────────────────────────
const deleteProfile = tryCatch(async (req, res, next) => {
    const user = await User.findById(req.user);
    if (!user) return next(new ErrorHandler("User not found", 404));

    const oneOnOneChats = await Chat.find({ members: req.user, groupChat: false });
    const oneOnOneChatIds = oneOnOneChats.map((chat) => chat._id);

    await Message.deleteMany({ chat: { $in: oneOnOneChatIds } });
    await Chat.deleteMany({ _id: { $in: oneOnOneChatIds } });

    const groupChats = await Chat.find({ members: req.user, groupChat: true });
    for (const chat of groupChats) {
        chat.members = chat.members.filter((m) => m.toString() !== req.user.toString());
        await chat.save();
    }

    await user.deleteOne();
    res.status(200)
        .cookie("chitChat-Token", "", { ...cookieOption, maxAge: 0 })
        .json({ success: true, message: "Account deleted successfully" });
});

// ─── Search User ──────────────────────────────────────────────────────────────
const searchUser = tryCatch(async (req, res, next) => {
    const { name = "", page = 1, limit = 10 } = req.query;
    const myChats = await Chat.find({ groupChat: false, members: req.user });
    const allUsersFromMyChats = myChats.map((chat) => chat.members).flat();

    const allUserExceptMeAndMyFriends = await User.find({
        _id: { $nin: allUsersFromMyChats },
        name: { $regex: name, $options: "i" },
    })
        .select("name avatar privacy")
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const users = allUserExceptMeAndMyFriends.map((u) => {
        const canSeeProfile = u.privacy?.profile === "everyone";
        return {
            _id: u._id,
            name: u.name,
            avatar: canSeeProfile ? u.avatar?.url : null,
        };
    });

    sendResponse(res, true, "Users fetched successfully", { users });
});

// ─── Friend Requests ──────────────────────────────────────────────────────────
const sendFriendRequest = tryCatch(async (req, res, next) => {
    const { userId } = req.body;
    if (req.user === userId)
        return next(new ErrorHandler("You cannot send a friend request to yourself", 400));

    // Check if they are already friends (a direct chat exists between them)
    const existingChat = await Chat.findOne({
        groupChat: false,
        members: { $all: [req.user, userId] },
    });
    if (existingChat) return next(new ErrorHandler("You are already friends", 400));

    const request = await Request.findOne({
        $or: [
            { sender: req.user, receiver: userId },
            { sender: userId, receiver: req.user },
        ],
    });
    if (request) return next(new ErrorHandler("Request already sent", 400));

    await Request.create({ sender: req.user, receiver: userId });
    emitEvent(req, NEW_REQUEST, [userId], "request");
    sendResponse(res, true, "Friend request sent successfully");
});

const acceptFriendRequest = tryCatch(async (req, res, next) => {
    const { requestId, accept } = req.body;
    const request = await Request.findById(requestId)
        .populate("sender", "name")
        .populate("receiver", "name");

    if (!request) return next(new ErrorHandler("Request not found", 404));
    if (request.receiver._id.toString() !== req.user.toString())
        return next(new ErrorHandler("Unauthorized", 401));

    if (!accept) {
        await request.deleteOne();
        return sendResponse(res, true, "Request rejected");
    }

    const members = [request.sender._id, request.receiver._id];
    await Promise.all([
        Chat.create({ members, name: `${request.sender.name} <==> ${request.receiver.name}` }),
        request.deleteOne(),
    ]);
    emitEvent(req, REFETCH_CHATS, members);
    sendResponse(res, true, "Friend request accepted", { senderId: request.sender._id });
});

// ─── Notifications ────────────────────────────────────────────────────────────
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
    sendResponse(res, true, "Notifications fetched", { allRequests });
});

// ─── Friends ──────────────────────────────────────────────────────────────────
const getMyAllFriends = tryCatch(async (req, res, next) => {
    const { chatId } = req.query;
    // Need to select privacy to check it
    const chats = await Chat.find({ members: req.user, groupChat: false }).populate("members", "name avatar status privacy");

    const friends = chats
        .map(({ members }) => {
            const otherUser = getOtherMembers(members, req.user);
            if (!otherUser) return null;
            
            const canSeeProfile = otherUser.privacy?.profile !== "nobody";
            
            return { 
                _id: otherUser._id, 
                name: otherUser.name, 
                avatar: canSeeProfile ? (otherUser.avatar?.url || null) : null, 
                status: canSeeProfile ? otherUser.status : "offline" 
            };
        })
        .filter(Boolean);

    if (chatId) {
        const chat = await Chat.findById(chatId);
        if (!chat) return sendResponse(res, false, "Chat not found");
        const available = friends.filter((f) => !chat.members.includes(f._id.toString()));
        return sendResponse(res, true, "Available friends fetched", { friends: available });
    }

    sendResponse(res, true, "Friends fetched successfully", { friends });
});

// ─── Star a Message ───────────────────────────────────────────────────────────
const toggleStarMessage = tryCatch(async (req, res, next) => {
    const { id: messageId } = req.params;
    const user = await User.findById(req.user);

    const alreadyStarred = user.starredMessages.some((m) => m.toString() === messageId);

    if (alreadyStarred) {
        user.starredMessages = user.starredMessages.filter((m) => m.toString() !== messageId);
        await user.save();
        return sendResponse(res, true, "Message unstarred");
    }

    user.starredMessages.push(messageId);
    await user.save();
    sendResponse(res, true, "Message starred");
});

// ─── Get Starred Messages ─────────────────────────────────────────────────────
const getStarredMessages = tryCatch(async (req, res, next) => {
    const user = await User.findById(req.user).populate({
        path: "starredMessages",
        populate: { path: "sender", select: "name avatar" },
    });

    sendResponse(res, true, "Starred messages fetched", { messages: user.starredMessages });
});

// ─── Update Privacy Settings ──────────────────────────────────────────────────
const updatePrivacy = tryCatch(async (req, res, next) => {
    const { profile } = req.body;
    if (!["everyone", "friends", "nobody"].includes(profile)) {
        return next(new ErrorHandler("Invalid privacy setting", 400));
    }

    const user = await User.findById(req.user);
    if (!user) return next(new ErrorHandler("User not found", 404));

    if (!user.privacy) user.privacy = {};
    user.privacy.profile = profile;
    await user.save();

    sendResponse(res, true, "Privacy settings updated", { privacy: user.privacy });
});

export {
    acceptFriendRequest,
    changePassword,
    deleteProfile,
    forgotPassword,
    getMyAllFriends,
    getMyProfile,
    getNotifications,
    getStarredMessages,
    login,
    logout,
    newUser,
    resetPassword,
    searchUser,
    sendFriendRequest,
    toggleStarMessage,
    updateProfile,
    updateStatus,
    updatePrivacy,
};
