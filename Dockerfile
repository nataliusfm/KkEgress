# Universal container image — works on Fly.io, Google Cloud Run, Railway,
# Azure, AWS App Runner, etc.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# App source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Persist the JSON data store across restarts when a volume is mounted here.
VOLUME ["/app/data"]

CMD ["npm", "start"]
