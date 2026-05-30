# Dockerfile for GrabFreeModels metrics exporter and nightly validation
# Uses a lightweight PowerShell on Ubuntu LTS base image.

FROM mcr.microsoft.com/powershell:lts-ubuntu-22.04

# Create work directory
WORKDIR /app

# Copy scripts and data
COPY scripts/ ./scripts/
COPY available-models.json ./

# Install any needed modules (e.g., Pester for tests, if you run them inside container)
# RUN pwsh -Command "Install-Module -Name Pester -Scope AllUsers -Force"

# Expose Prometheus metrics port (default 9180)
EXPOSE 9180

# Default command runs the metrics exporter; you can override to run nightly maintenance via a cron job inside container.
ENTRYPOINT ["pwsh","-NoProfile","-Command","./scripts/metrics-exporter.ps1 -Port 9180"]
