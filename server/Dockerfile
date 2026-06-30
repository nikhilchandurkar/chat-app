
FROM node:18-slim AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
FROM node:18-slim
WORKDIR /usr/src/app
COPY --from=build /usr/src/app /usr/src/app
EXPOSE 3000
ENV NODE_ENV=production \
    PORT=3000
CMD ["node", "app.js"]
