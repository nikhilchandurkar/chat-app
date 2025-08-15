

const corsOption = {
    origin: [
        "http://localhost:5173",
        'https://chat-app-frontend-wine-two.vercel.app',
        process.env.CLIENT_URL,
        "http://localhost:3000",
    ],
    methods:["GET",
              "POST",
              "PUT",
              "PATCH",
              "DELETE",
              "OPTIONS" ],
    credentials: true,
}

const chitChatTocken="chitChat-Token"

export { chitChatTocken, corsOption }
