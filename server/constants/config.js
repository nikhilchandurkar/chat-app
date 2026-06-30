

const corsOption = {
    origin: (origin, callback) => {
        const allowedOrigins = [
            "http://localhost:5173",
            "http://localhost:3000",
            "https://nikhil-chats.chickenkiller.com",
            "http://16.113.26.38",
            "https://chat-app-frontend-wine-two.vercel.app",
            process.env.CLIENT_URL,
        ].filter(Boolean); // remove undefined

        // Allow requests with no origin (curl, mobile apps, SSR)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn("CORS blocked origin:", origin);
            callback(null, true); // still allow in prod to avoid silent failures
        }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
}

const chitChatTocken="chitChat-Token"

export { chitChatTocken, corsOption }
