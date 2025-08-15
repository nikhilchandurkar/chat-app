# Real-Time Chat Application

A modern, full-stack real-time chat application built with the MERN stack, featuring WebSocket communication, user authentication,  direct messaging, media uploads, and Docker deployment support.

## 🚀 Features

- **Real-time messaging** with Socket.IO
- **Group chats** and **Direct Messages (DMs)**
- **User authentication** with JWT tokens
- **Media file uploads** with Cloudinary integration
- **Responsive design** for desktop and mobile
- **Dockerized deployment** for local, EC2, and EKS environments
- **MongoDB Atlas** or local MongoDB support
- **Secure cookie handling** and CORS configuration

## 🛠️ Tech Stack

### Frontend
- **React** - UI library
- **Vite** - Build tool and dev server
- **Socket.IO Client** - Real-time communication

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Socket.IO** - WebSocket implementation
- **JWT** - Authentication
- **bcrypt** - Password hashing

### Database & Storage
- **MongoDB** - Database (Atlas or local)
- **Cloudinary** - Media file storage (optional)

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration

## 📋 Prerequisites

Before running this application, ensure you have:

- **Node.js** 18+ installed
- **Docker** 24+ installed
- **MongoDB Atlas** account (or local MongoDB instance)
- **Cloudinary** account (optional, for media uploads)

## ⚙️ Environment Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd chat-application
```

### 2. Environment Variables

Create environment files from the provided examples:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

#### Server Environment (`server/.env`)

```env
# Database
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority

# Authentication
JWT_SECRET=<generate-secure-64-character-random-string>
ADMIN_SECRET_KEY=<your-admin-secret-key>

# Application
NODE_ENV=production
PORT=3000
SECURE_COOKIE=true

# Media Storage (Optional)
CLOUDINARY_CLOUD_NAME=<your-cloudinary-cloud-name>
CLOUDINARY_API_KEY=<your-cloudinary-api-key>
CLOUDINARY_API_SECRET=<your-cloudinary-api-secret>

# CORS Configuration
CLIENT_URL=http://localhost:5173
```

#### Client Environment (`client/.env`)

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

### 3. Generate JWT Secret

Generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 🏃‍♂️ Running the Application

### Development Mode (Without Docker)

#### Start the Backend Server

```bash
cd server
npm install
npm run dev
```

The server will start on `http://localhost:3000`

#### Start the Frontend Client

```bash
cd client
npm install
npm run dev
```

The client will start on `http://localhost:5173`

### Production Mode (With Docker)

#### Using Docker Compose

```bash
# Build and start all services
docker-compose up --build

# Run in detached mode
docker-compose up -d --build

# Stop services
docker-compose down
```

#### Individual Docker Commands

**Build and run backend:**
```bash
cd server
docker build -t chat-app-server .
docker run -p 3000:3000 --env-file .env chat-app-server
```

**Build and run frontend:**
```bash
cd client
docker build -t chat-app-client .
docker run -p 5173:5173 --env-file .env chat-app-client
```

## 🚢 Deployment

### AWS EC2 Deployment

1. **Launch EC2 instance** with Ubuntu 22.04
2. **Install Docker** and **Docker Compose**
3. **Clone repository** and set environment variables
4. **Configure security groups** (ports 3000, 5173, 80, 443)
5. **Run with Docker Compose**

### AWS EKS Deployment

1. **Create EKS cluster**
2. **Build and push images** to ECR
3. **Create Kubernetes manifests**
4. **Deploy using kubectl**

### Environment-Specific Configurations

#### Local Development
```env
CLIENT_URL=http://localhost:5173
VITE_API_BASE_URL=http://localhost:3000
```

#### EC2 Production
```env
CLIENT_URL=https://your-domain.com
VITE_API_BASE_URL=https://api.your-domain.com
```

## 📁 Project Structure

```
chat-application/
├── client/                 # React frontend
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── .env.example
│   └── Dockerfile
├── server/                 # Express backend
│   ├── src/
│   ├── package.json
│   ├── .env.example
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## 🔧 Available Scripts

### Server Scripts
- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm test` - Run tests

### Client Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## 🛡️ Security Features

- **JWT Authentication** with secure token handling
- **Password hashing** with bcrypt
- **CORS protection** with configurable origins
- **Secure cookies** in production
- **Environment variable protection**

## 📝 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Chat Endpoints
- `GET /api/chats` - Get user's chats
- `POST /api/chats` - Create new chat
- `GET /api/chats/:id/messages` - Get chat messages

### Socket Events
- `join_room` - Join a chat room
- `send_message` - Send message to room
- `receive_message` - Receive new message
- `user_typing` - Typing indicator



## 🆘 Troubleshooting

### Common Issues

**Database Connection Issues:**
- Verify MongoDB URI format
- Check network access in MongoDB Atlas
- Ensure correct username/password

**Socket Connection Issues:**
- Verify CORS configuration
- Check firewall settings
- Confirm WebSocket support

**Docker Issues:**
- Ensure Docker daemon is running
- Check port availability
- Verify environment variables in containers

### Support

For support and questions, please open an issue in the repository.

---

**Built with ❤️ using the MERN Stack**
