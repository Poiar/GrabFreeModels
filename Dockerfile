# Dockerfile for GrabFreeModels metrics exporter and nightly validation
# Uses a lightweight Node.js on Alpine LTS base image.

FROM node:20-alpine

# Create work directory
WORKDIR /app

# Copy scripts and data
COPY scripts/ ./scripts/
COPY available-models.json ./

# Expose Prometheus metrics port (default 9180)
EXPOSE 9180

# Default command runs the metrics exporter; you can override to run nightly maintenance via a cron job inside container.
ENTRYPOINT ["node","./scripts/metrics-exporter.js","--port","9180"]
