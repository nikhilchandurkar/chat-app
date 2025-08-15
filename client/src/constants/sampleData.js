import { Chat, Public } from "@mui/icons-material";

export const sampleChats = [
    {
        avatar: ["https://www.w3schools.com/howto/img_avatar.png"],
        name: "Jonh doe",
        _id: "0",
        groupChat: false,
        isOnline: true,

    },
    {
        avatar: ["https://www.w3schools.com/howto/img_avatar.png"],
        name: "user",
        _id: "2",
        groupChat: false,
        members: ["1", "2",],
    },
    {
        avatar: ["https://www.w3schools.com/howto/img_avatar.png"],
        name: "users99090909",
        _id: "3",
        groupChat: true,
        members: ["1", "2"],
    },
    {
        avatar: ["https://www.w3schools.com/howto/img_avatar.png"],
        name: "users99090909",
        _id: "4",
        groupChat: true,
        members: ["1", "2"],
    },

]
export default sampleChats

export const sampleUsers = [
    {
        avatar: ["https://www.w3schools.com/howto/img_avatar.png"],
        name: "Jonh doe",
        _id: "1",
    },
    {
        avatar: ["https://www.w3schools.com/howto/img_avatar.png"],
        name: "Jonh doe",
        _id: "2",

    },
    {
        avatar: ["https://www.w3schools.com/howto/img_avatar.png"],
        name: "Jonh doe",
        _id: "3",
    },

];


export const sampleNotifcations = [
    {
        sender: {
            avatar: ["https://www.w3schools.com/howto/img_avatar.png"],
            name: "Jonh doe",
        },
        _id: "1",
    },
    {
        sender: {
            avatar: ["https://www.w3schools.com/howto/img_avatar.png"],
            name: "Jonh doe",
        },
        _id: "2",

    },
    {
        sender: {
            avatar: ["https://www.w3schools.com/howto/img_avatar.png"],
            name: "Jonh doe",
        },
        _id: "2",
    },

];


export const sampleMessages = [
    {
        attachments: [
          {
            public_id: "asdsad",
            url: "https://www.w3schools.com/howto/img_avatar.png",
          },
        ],
        content: "helllo",
        _id: "sfnsdjkfsdnfkjbdjsbnd",
        sender: {
          _id: "123456",
          name: "user102",
        },
        chat: "chatId",
        createdAt: "2024-02-12T10:41:30.630Z",
      },
    
  
    {
      attachments: [
        {
          public_id: "asdsad 2",
          url: "https://www.w3schools.com/howto/img_avatar.png",
        },
      ],
      content: "helllo",
      _id: "sfnsdjkfsdnfkjbdjsbnd",
      sender: {
        _id: "78965",
        name: "user102",
      },
      chat: "chatId",
      createdAt: "2024-02-12T10:41:30.630Z",
    },
  ];