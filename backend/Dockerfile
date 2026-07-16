FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled source (run tsc before docker build, or build here)
COPY . .
RUN npm run build

EXPOSE 5000

CMD ["node", "dist/index.js"]
