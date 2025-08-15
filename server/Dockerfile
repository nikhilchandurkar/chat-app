# ----------- Build stage -----------
FROM node:18-alpine AS build

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production

# Copy the rest of the code
COPY . .

# ----------- Production image -----------
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy only the necessary files from build stage
COPY --from=build /usr/src/app /usr/src/app

# Expose port
EXPOSE 3000

# Set runtime env variables — ideally set these via your deployment platform (docker run -e ... / ECS / k8s / etc)
ENV NODE_ENV=production \
    PORT=3000

# Start the app
CMD ["node", "app.js"]
