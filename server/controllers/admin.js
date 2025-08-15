import { cookie } from "express-validator";
import { tryCatch } from "../middlewares/error.js";
import { Chat } from "../models/chat.js";
import { Message } from "../models/message.js";
import { User } from "../models/user.js";
import { ErrorHandler } from "../utils/utility.js";
import { cookieOption } from "../utils/features.js"
import jwt from "jsonwebtoken";

const adminLogin = tryCatch(async (req, res, next) => {
    const { secretKey } = req.body;
    const adminSecretKey = "adminadmin";
    console.log(adminSecretKey);

    const isMatched = secretKey === adminSecretKey

    // if (!isMatched) {
    //     return next(new ErrorHandler("Invalid admin key", 401));
    // }
    console.log(isMatched)
    const token = jwt.sign({ secretKey }, process.env.JWT_SECRET);
    console.log(token)
    return res
        .status(200)
        .cookie("chitChat-admin-token", token, {
            ...cookieOption,
            maxAge: 1000 * 60 * 30,
        })
        .json({
            success: true,
            message: "Authenticated successfully, welcome admin"
        });
});

const adminLogout = tryCatch(async (req, res, next) => {
    return res
        .status(200)
        .cookie("chitChat-admin-token", "", { // Setting token to an empty string
            ...cookieOption,
            maxAge: 0,
        })
        .json({
            success: true,
            message: "Admin logged out successfully"
        });
});

const getAdminData = tryCatch(async (req, res, next) => {

})

const allUsers = tryCatch(async (req, res, next) => {
    const users = await User.find({});

    const transformedUsers = await Promise.all(users.map(async ({ name, username, avatar, _id }) => {
        const [groups, friends] = await Promise.all([
            Chat.countDocuments({ groupChat: true, users: _id }),
            Chat.countDocuments({ groupChat: false, users: _id })
        ]);

        return {
            name,
            username,
            avatar: avatar.url,
            _id,
            groups: groups,
            friends: friends
        };
    }));

    res.status(200).json({
        status: "success",
        users: transformedUsers,
    });
});


const allChats = tryCatch(async (req, res, next) => {

    const chats = await Chat.find({})
        .populate("members", "name avatar")
        .populate("creator", "name avatar");

    const transformedChats = await Promise.all(chats.map(

        async ({ members, _id, groupChat, name, creator }) => {
            const totalMessages = await Message.countDocuments({ chat: _id });
            return {
                _id,
                groupChat,
                name,
                avatar: members.slice(0, 3).map((member) => member.avatar?.url || null),
                members: members.map(({ _id, name, avatar }) => ({
                    _id,
                    name,
                    avatar: avatar?.url || null,
                })),
                creator: {
                    name: creator?.name || null,
                    avatar: creator?.avatar?.url || null,
                },
                totalMembers: members.length,
                totalMessages
            };
        }
    ));

    res.status(200).json({
        status: "success",
        chats: transformedChats,
    });
});


const allMessages = tryCatch(async (req, res, next) => {
    const messages = await Message.find({})
        .populate("sender", "name avatar")
        .populate("chat", "groupChat");

    const transformedMessages = messages.map(
        ({ content, attachments, sender, createdAt, _id, chat }) => ({
            _id,
            attachments,
            content,
            createdAt,
            sender: {
                _id: sender._id,
                name: sender.name,
                avatar: sender.avatar.url,
            },
            chat: chat._id,
            groupChat: chat.groupChat,
        })
    );

    res.status(200).json({
        status: "success",
        messages: transformedMessages,
    });
});


const getDashboardStats = tryCatch(async (req, res, next) => {
    const users = await User.find({});

    const [groupsCount, usersCount, messagesCount, totalChatsCount] = await Promise.all([
        Chat.countDocuments({ groupChat: true }),
        User.countDocuments({}),
        Message.countDocuments({}),
        Chat.countDocuments({}),
    ]);

    const today = new Date();
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    const last7DaysMessages = await Message.find({
        createdAt: {
            $gte: last7Days,
            $lte: today
        }
    }).select("createdAt");

    const dayInMilliseconds = 1000 * 60 * 60 * 24;
    const messageCounts = new Array(7).fill(0);

    last7DaysMessages.forEach((message) => {
        const indexApprox = (today.getTime() - message.createdAt.getTime()) / dayInMilliseconds;
        const index = Math.floor(indexApprox);
        messageCounts[6 - index]++;
    });

    const stats = {
        groupsCount,
        usersCount,
        messagesCount,
        totalChatsCount,
        last7DaysMessages: messageCounts
    };

    res.status(200).json({
        status: "success",
        stats
    });
});




export {
    allUsers,
    allChats,
    allMessages,
    getDashboardStats,
    adminLogin,
    adminLogout,
    getAdminData
} 