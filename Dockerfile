# Dockerfile for GrabFreeModels metrics exporter and nightly validation
# Uses a lightweight Node.js on Alpine LTS base image.

FROM node:20-alpine

WORKDIR /app

# Install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy scripts and data
COPY scripts/ ./scripts/
COPY server/ ./server/
COPY data/ ./data/
COPY available-models.json ./

EXPOSE 9180

ENTRYPOINT ["node","./scripts/metrics-exporter.js","--port","9180"]
