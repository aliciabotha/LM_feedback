# Use official Node.js image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy all other files
COPY . .

# Expose port for Fly.io health checks
EXPOSE 3000

# Start the bot
CMD ["node", "index.js"]
