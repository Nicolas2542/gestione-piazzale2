FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build React app with more verbose output
RUN npm run build || (echo "Build failed" && cat /app/npm-debug.log && exit 1)

# Install production dependencies
RUN npm install --production

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"] 