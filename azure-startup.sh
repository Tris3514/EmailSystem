#!/bin/bash

# Azure App Service startup script for Linux
# This script ensures the app starts correctly in Azure

echo "Starting Email System on Azure..."

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --production=false
fi

# Build the application if .next doesn't exist
if [ ! -d ".next" ]; then
  echo "Building Next.js application..."
  npm run build
fi

# Start the server
echo "Starting server..."
exec node server.js

