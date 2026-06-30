import { userSocketIDs } from "../app.js";

export const getOtherMembers = (members, userId) =>
    members.find((member) => member._id?.toString() !== userId.toString());

export const getSockets = (users = []) => {
    // Ensure `users` is always an array
    const userArray = Array.isArray(users) ? users : [users];
    
    const sockets = userArray
        .map((user) => {
            if (!user) return undefined;
            // Handle both populated users (user._id) and raw ObjectIds (user.toString())
            const id = user._id ? user._id.toString() : user.toString();
            return userSocketIDs.get(id);
        })
        .filter((socketId) => socketId !== undefined); 
    
    return sockets;
};


export const getBase64 = (file)=>
    `data:${file.mimetype};base64,${file.buffer.toString("base64")}`