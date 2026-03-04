#!/bin/bash

# Change to the attendance-checker directory
cd "$(dirname "$0")"

echo "=========================================="
echo "  Starting Student Attendance Checker"
echo "=========================================="
echo ""
echo "Server will start on port 3002"
echo ""

# Get local IP address
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

# Start Cloudflare tunnel if not already running
if ! pgrep -f "cloudflared tunnel run cosmodrive" > /dev/null 2>&1; then
    echo "🌐 Starting Cloudflare Tunnel..."
    cloudflared tunnel run cosmodrive &
    sleep 2
    echo "✅ Cloudflare Tunnel started"
else
    echo "🌐 Cloudflare Tunnel already running"
fi

echo "Access the application at:"
echo "  Local:   http://localhost:3002"
echo "  Network: http://$IP:3002"
echo "  Public:  https://studentattendance.icanacademy.work"
echo ""
echo "Press Ctrl+C to stop the server"
echo "=========================================="
echo ""

# Start the server
npm start

# Keep terminal open if there's an error
if [ $? -ne 0 ]; then
    echo ""
    echo "Server stopped with an error. Press any key to close..."
    read -n 1
fi
