# Stage 1: Build the React application /    dev 
FROM node:18-alpine AS build

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./

RUN npm C

COPY . ./

EXPOSE 3000

CMD ["npm", "start"]


# Stage 1: Build the React application
# FROM node:18-alpine AS build

# WORKDIR /app

# COPY package.json ./
# COPY package-lock.json ./

# RUN npm install

# COPY . ./

# RUN npm run build

# # Stage 2: Serve the production build with Nginx
# FROM nginx:alpine

# COPY --from=build /app/build /usr/share/nginx/html

# EXPOSE 80

# CMD ["nginx", "-g", "daemon off;"]