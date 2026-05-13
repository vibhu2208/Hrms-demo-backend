#!/bin/bash

# Script to kill process using port 5001
PORT=5001

echo "🔍 Looking for process using port $PORT..."

PID=$(lsof -ti:$PORT)

if [ -z "$PID" ]; then
    echo "✅ No process found using port $PORT"
    exit 0
fi

echo "📋 Found process: $PID"
echo "🔄 Killing process $PID..."

kill -9 $PID

sleep 1

# Verify it's killed
if lsof -ti:$PORT > /dev/null 2>&1; then
    echo "❌ Failed to kill process. Try running with sudo:"
    echo "   sudo kill -9 $PID"
    exit 1
else
    echo "✅ Process killed successfully!"
    echo "🚀 You can now start your server"
    exit 0
fi
