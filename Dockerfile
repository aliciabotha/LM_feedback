# Use official Node.js 20 image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files and install deps
COPY package*.json ./
RUN npm install --production

# Copy all bot files
COPY . .

# Expose port for Fly.io health check
EXPOSE 3000

# Start the bot
CMD ["node", "index.js"]
