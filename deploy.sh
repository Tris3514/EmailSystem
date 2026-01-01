#!/bin/bash

# Azure App Service deployment script for Next.js

echo "Starting Azure deployment..."

# Install dependencies
echo "Installing dependencies..."
npm ci --production=false

# Build the Next.js application
echo "Building Next.js application..."
npm run build

echo "Deployment completed successfully!"

