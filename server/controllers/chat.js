import { tryCatch } from "../middlewares/error.js";
import { ErrorHandler } from "../utils/utility.js";
import { Chat } from "../models/chat.js";
import { getOtherMembers } from "../lib/helper.js";
import { User } from "../models/user.js";
import { Message } from "../models/message.js";
import {
    deleteFilesFromCloudnary,
    emitEvent
} from "../utils/features.js";
import {
    ALERT,
    NEW_ATTACHMENT, 
    REFETCH_CHATS
} from "../constants/events.js";

const newGroupChat = tryCatch(async (req, res, next) => {
    const { name, members } = req.body;
    // if (members.length < 2)
    //     return next(new ErrorHandler("group must have at least 2 members", 400));

    const allMembers = [...members, req.user];

    await Chat.create({
        name,
        groupChat: true,
        creator: req.user,
        members: allMembers,
    }).catch((err) => next(new ErrorHandler(err.message, 500)));
    
    emitEvent(req, ALERT, allMembers, `Welcome to ${name} group`);
    emitEvent(req, REFETCH_CHATS, members);

    res.status(200).json({
        success: true,
        message: "Group chat created",
    });
});

const getMyChats = tryCatch(async (req, res, next) => {
    const chats = await Chat.find({ members: req.user }).populate(
        "members",
        "name username avatar"
    );

    const transformedChat = chats.map(({ _id, name, members, groupChat }) => {
        const otherMember = getOtherMembers(members, req.user);
        return {
            _id,
            groupChat,
            avatar: groupChat
                ? members.map(({ avatar }) => avatar.url)
                : [otherMember.avatar.url],
            name: groupChat ? name : otherMember.name,
            members: members.reduce((prev, curr) => {
                if (curr._id.toString() !== req.user.toString()) {
                    prev.push(curr._id);
                }
                return prev;
            }, []),
        };
    });

    res.status(200).json({
        success: true,
        chats: transformedChat,
    });
});

const getMyGroup = tryCatch(async (req, res, next) => {
    const chats = await Chat.find({
        members: req.user,
        groupChat: true,
        creator: req.user,
    }).populate("members", "name avatar");

    const groups = chats.map(({ members, _id, groupChat, name }) => ({
        _id,
        groupChat,
        name,
        avatar: members.slice(0, 3).map(({ avatar }) => avatar.url),
    }));
    return res.status(200).json({
        success: true,
        groups,
    });
});

const addMembers = tryCatch(async (req, res, next) => {
    const { chatId, members } = req.body;

    // Null checks for members and chatId
    if (!members || !chatId)
        return next(new ErrorHandler("Please provide members or  chatId", 400));

    const chat = await Chat.findById(chatId);
    if (!chat)
        return next(new ErrorHandler("Chat not found", 404));

    if (!chat.groupChat)
        return next(new ErrorHandler("This is not a GroupChat", 400));

    if (chat.creator.toString() !== req.user.toString())
        return next(new ErrorHandler("You are not allowed to add members", 403));

    // Fetching new members from the database
    const allNewMembersPromise = members.map((memberId) => User.findById(memberId, "name"));

    const allNewMembers = await Promise.all(allNewMembersPromise);

    // uniuque members onl remove duplicate members

    const uniuqueMembers = allNewMembers.filter(
        (i) => !chat.members.includes(i._id.toString())
    )

    // Add only the new members' IDs to the chat
    chat.members.push(...uniuqueMembers.map((i) => i._id));

    // Check if group member limit is exceeded
    if (chat.members.length > 100)
        return next(new ErrorHandler("Group member limit reached", 400));

    await chat.save();

    // Concatenating names of the new members
    const allUserNames = allNewMembers.map((i) => i.name).join(",");

    // Emitting events to alert members
    emitEvent(
        req,
        ALERT, // Assuming ALERT is a constant or event type
        chat.members,
        `You have been added to the group ${chat.name} by ${req.user.name}. ${allUserNames} has been added to the group.`
    );

    // Emit event to refresh chats for the members
    emitEvent(req, REFETCH_CHATS, chat.members);

    return res.status(200).json({
        success: true,
        message: "Members added successfully"
    });
});

const removeMembers = tryCatch(async (req, res, next) => {
    const { userId, chatId } = req.body;
    const [chat, userThatWillBeRemoved] = await Promise.all(
        [
            Chat.findById(chatId),
            Chat.findById(userId, "name")
        ]
    )

    if (!chat)
        return next(new ErrorHandler("Chat not found", 404));
    if (!chat.groupChat)
        return next(new ErrorHandler("This is not a GroupChat", 400));

    if (chat.creator.toString() !== req.user.toString())
        return next(new ErrorHandler("You are not allowed to add members", 403));

    if (chat.members.length <= 3)
        return next(new ErrorHandler("Group must have al least 3 members", 400));

    chat.members = chat.members.filter(member => member.toString() !== userId.toString())

    await chat.save()

    emitEvent(
        req,
        ALERT,
        chat.members,
        `${userThatWillBeRemoved.name} has been removed from the group`
    )

    emitEvent(req, REFETCH_CHATS, chat.members);
})

const leaveGroup = tryCatch(async (req, res, next) => {

    const chatId = req.params.id;

    const chat = await Chat.findById(chatId)


    if (!chat)
        return next(new ErrorHandler("Chat not found", 404));

    if (!chat.groupChat) return next(new ErrorHandler("this is not the group", 400));

    if (chat.members.length <= 3)
        return next(new ErrorHandler("Group must have al least 3 members", 400));

    const [userThatWillBeRemoved] = Promise.all([
        User.findById(req.user, "name"),
        chat.save()
    ]);

    emitEvent(
        req,
        ALERT,
        chat.members,

        `${userThatWillBeRemoved.name} has left from the group`
    )

    emitEvent(req, REFETCH_CHATS, chat.members);
})

const sendAttachments = tryCatch(async (req, res, next) => {

    const { chatId } = req.body;

    const [chat, me] = await Promise.all([
        Chat.findById(chatId),
        User.findById(req.user, "name")
    ]);
    // check("files",).notEmpty()
    // .withMessage("please upload attachment ")
    // .isArray({ min: 1, max: 5 })
    // .withMessage("attachment must be between 1 to 5")

    if (!chat)
        return next(new ErrorHandler("Chat not found", 404));

    const files = req.files || [];
    //  


    // const attachments = [];

    if (!req.files || req.files.length < 1) {
        return next(new ErrorHandler("Please provide attachment", 400));
    }
    if (!req.files || req.files.length > 5) {
        return next(new ErrorHandler("Please ", 400));
    }
    //  upload files 
    const attachments = [];

    const messageForRealTime = {
        content: " ",
        attachments,
        sender: {
            _id: me._id,
            name: me.name,
            // avatar:me.avatar.url,    
        },
        chat: chatId,
    };

    const messageForDB = {
        content: " ",
        attachments,
        sender: me._id,
        chat: chatId,

    };

    const message = await Message.create(messageForDB);

    emitEvent(req, NEW_ATTACHMENT, chat.members, {
        message: messageForRealTime
    })


    return res.status(200).json({
        success: true,
        message,
        // message:"Attachment sent "
    })
})

const getChatDetails = tryCatch(async (req, res, next) => {
    if (req.query.populate === "true") {
        console.log("populate");
        const chat = await Chat.findById(req.params.id)
            .populate("members", "name avatar").lean();

        if (!chat)
            return next(new ErrorHandler("Chat not found", 404));

        chat.members = chat.members.map(({ _id, name, avatar }) => ({
            _id,
            name,
            avatar: avatar.url
        }));

        return res.status(200).json({
            success: true,
            chat
        })
    } else {
        console.log(" not populate");
        const chat = await Chat.findById(req.params.id);

        if (!chat)
            return next(new ErrorHandler("Chat not found", 404));

        return res.status(200).json({
            success: true,
            chat
        })

    }

})

const renameGroup = tryCatch(async (req, res, next) => {
    const chatId = req.params.id;
    const { name } = req.body;
    const chat = await Chat.findById(chatId);

    if (!chat)
        return next(new ErrorHandler("Chat not found", 404));

    if (!chat.groupChat) return next(new ErrorHandler("this is not the group", 400));

    if (chat.creator.toString() !== req.user.toString())
        return next(new ErrorHandler("You are not allowed to add members", 403));

    chat.name = name;

    await chat.save();

    emitEvent(req, REFETCH_CHATS, chat.members);

    res.status(200).json({
        success: true,
        message: "Group renamed succesfully"
    })



})

const deleteChats = tryCatch(async (req, res, next) => {
    const chatId = req.params.id;

    const chat = await Chat.findById(chatId);

    if (!chat) {
        return next(new ErrorHandler("Chat not found", 404)); // Chat should be checked before proceeding
    }

    const members = chat.members;

    if (chat.groupChat && chat.creator.toString() !== req.user.toString()) {
        return next(new ErrorHandler("You are not allowed to delete the group", 403));
    }

    if (!chat.groupChat && !chat.members.includes(req.user.toString())) {
        return next(new ErrorHandler("You are not allowed to delete this chat", 403));
    }

    const messageWithAttachments = await Message.find({
        chat: chatId,
        attachments: { $exists: true, $ne: [] }
    });

    const public_ids = [];

    messageWithAttachments.forEach(({ attachments }) =>
        attachments.forEach(({ public_id }) => {
            public_ids.push(public_id);
        })
    );

    await Promise.all([
        deleteFilesFromCloudnary(public_ids),
        Chat.deleteOne({ _id: chatId }),
        Message.deleteMany({ chat: chatId })
    ]);

    emitEvent(req, REFETCH_CHATS, members);

    return res.status(200).json({
        success: true,
        message: "Chat deleted successfully"
    });
});

const getMessages = tryCatch(async (req, res, next) => {
    const chatId = req.params.id;
    const { page = 1 } = req.query;
    const resultPerPage = 20;
    const skip = (page - 1) * resultPerPage;

    const [messages, totalMessages] = await Promise.all([
        Message.find({ chat: chatId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(resultPerPage)
            .populate("sender", "name")
            .lean(), 
        Message.countDocuments({ chat: chatId }),

    ])

    const totalPages = Math.ceil(totalMessages / resultPerPage);

    return res.status(200).json({
        success: true,
        messages: messages.reverse(),
        totalPages,
    })

})

export {
    newGroupChat,
    getMyChats,
    getMyGroup,
    addMembers,
    removeMembers,
    leaveGroup,
    sendAttachments,
    getChatDetails,
    renameGroup,
    deleteChats,
    getMessages,

};
