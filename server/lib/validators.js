import {
    body,
    check,
    param,
    validationResult
} from 'express-validator';
import { ErrorHandler } from '../utils/utility.js';

const validateHandler = (req, res, next) => {
    const errors = validationResult(req);
    const errorMessage = errors.array().map((error) => error.msg).join(",");
    console.log(errorMessage);
    if (errors.isEmpty()) return next();
    else next(new ErrorHandler(errorMessage, 400));
}

const chatIdValidator = () => [param("id", "please enter chat ID ").notEmpty()]

const nameValidator = () => [param("name", "please enter name ").notEmpty()]

const registerValidator = () => [
    body("name", "please enter name").notEmpty(),
    body("username", "please enter username").notEmpty(),
    body("password", "please enter password").notEmpty(),

]

const loginValidator = () => [
    body("username", "please enter username").notEmpty(),
    body("password", "please enter password").notEmpty()
]

const newGroupValidator = () => [
    body("name", "please enter name ").notEmpty(),
    body("members", "please add members")
        .notEmpty().withMessage("enter member in group ")
        .isArray({ min: 2, max: 100 })
        .withMessage("members must between 2 to 100")
]

const addMembersValidator = () => [
    body("chatId", "please enter chat ID ").notEmpty(),
    body("members", "please add members")
        .notEmpty().withMessage("enter member in group ")
        .isArray({ min: 1, max: 97 })
        .withMessage("members must between 1 to 97")
]

const removeMembersValidator = () => [
    body("chatId", "please enter chat ID ").notEmpty(),
    body("userId", "please enter user ID ").notEmpty(),

]

const sendAttachmentValidator = () => [
    body("id", "please enter chat ID ").notEmpty(),
]
const renameGrouptValidator = () => [
    param("id", "please enter chat ID ").notEmpty(),
    body("name", "please enter new name ").notEmpty(),

]

const sendFriendRequestValidator = () => [
    body("userId", "please enter user ID").notEmpty(),
]

const acceptFriendRequestValidator = () => [
    body("requestId")
        .notEmpty()
        .withMessage("please enter request ID"),
    body("request")
        .notEmpty()
        .withMessage("please add accept")
        .isBoolean()
        .withMessage("Accept must be a boolean")
]

const adminLoginValidator = () => [
    body("secretKey")
        .notEmpty()
        .withMessage("please enter secret key"),

]

export {
    addMembersValidator,
    chatIdValidator,
    loginValidator,
    newGroupValidator,
    registerValidator,
    removeMembersValidator,
    renameGrouptValidator,
    sendAttachmentValidator,
    sendFriendRequestValidator,
    validateHandler,
    acceptFriendRequestValidator,
    adminLoginValidator,
};

