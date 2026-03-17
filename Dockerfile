# Use official Node.js 20 slim image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files first (caches npm install)
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy the rest of your bot files
COPY . .

# Expose port for Fly.io health check
EXPOSE 3000

# Start the bot
CMD ["node", "bot.mjs"]
