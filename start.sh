#!/bin/bash

# Ollama Proxy Startup Script

echo "🚀 Starting Ollama Proxy..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if Ollama is running
OLLAMA_URL=${OLLAMA_URL:-"http://localhost:11434"}
if ! curl -s "$OLLAMA_URL/api/tags" > /dev/null 2>&1; then
    echo "⚠️  Warning: Ollama server not responding at $OLLAMA_URL"
    echo "   Make sure Ollama is running: ollama serve"
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create logs directory
mkdir -p logs

# Copy environment file if it doesn't exist
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "📄 Created .env file from template"
fi

# Start the server
echo "🎯 Starting proxy server..."
npm start