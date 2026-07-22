# Multi-stage Dockerfile for Render Deployment
FROM python:3.11-slim

# Install system dependencies & Node.js 20
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    build-essential \
    cmake \
    libgl1 \
    libglib2.0-0 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY face_service/requirements.txt ./face_service/requirements.txt
RUN pip install --no-cache-dir -r ./face_service/requirements.txt

# Copy package files and install Node dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy application source code
COPY . .

# Build Node server and Vite frontend
RUN npm run build

# Make start script executable
RUN chmod +x start.sh

EXPOSE 8000 8001

CMD ["bash", "start.sh"]
