import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';

// Configuration
const PORT = process.env.PORT || 8080;

// Create HTTP server (can be used for health checks or hosting simple page)
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Roundtable Relay Server is Running');
});

// Create WebSocket Server
const wss = new WebSocketServer({ server });

// User Registry: { [userId]: { socket, publicKey, info } }
const connectedUsers = new Map();

console.log(`Relay Server started on port ${PORT}`);

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    ws.isAlive = true;
    ws.userId = null; // Will be set after 'identify' message

    console.log(`New connection from ${ip}`);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (e) {
            console.error('Invalid JSON received:', e.message);
        }
    });

    ws.on('close', () => {
        if (ws.userId && connectedUsers.has(ws.userId)) {
            console.log(`User disconnected: ${ws.userId}`);
            connectedUsers.delete(ws.userId);
            broadcastUserList();
        }
    });
});

// Message Handler
function handleMessage(ws, data) {
    switch (data.type) {
        case 'identify':
            handleIdentify(ws, data);
            break;
        case 'message':
            handleRouteMessage(ws, data);
            break;
        case 'broadcast_presence':
            // Logic to update user info if changed
            if (ws.userId && connectedUsers.has(ws.userId)) {
                const user = connectedUsers.get(ws.userId);
                user.info = { ...user.info, ...data.payload };
                broadcastUserList();
            }
            break;
        default:
            console.log('Unknown message type:', data.type);
    }
}

// Handle User Identification
function handleIdentify(ws, data) {
    // data: { type: 'identify', userId: '12345', publicKey: 'jwk_or_pem_string', info: { name: 'Nav', ... } }
    const { userId, publicKey, info } = data;

    if (!userId || !publicKey) {
        return;
    }

    console.log(`User Identified: ${info?.name || userId} (${userId})`);

    ws.userId = userId;
    
    connectedUsers.set(userId, {
        socket: ws,
        publicKey: publicKey,
        info: info || {}
    });

    // Notify user they are registered
    ws.send(JSON.stringify({ type: 'registered', success: true }));

    // Update everyone else
    broadcastUserList();

    // Explicitly notify others about the new user join (with their key)
    const joinMessage = JSON.stringify({
        type: 'user_connected',
        user: {
            id: userId,
            publicKey: publicKey,
            info: info || {}
        }
    });

    for (const [otherId, otherUser] of connectedUsers.entries()) {
        if (otherId !== userId && otherUser.socket.readyState === WebSocket.OPEN) {
            otherUser.socket.send(joinMessage);
        }
    }
}

// Route Encrypted Message
function handleRouteMessage(ws, data) {
    // data: { type: 'message', targetId: 'recipient_id', payload: { encryptedContent: '...', iv: '...' } }
    const { targetId, payload } = data;

    if (!targetId || !payload) return;

    const target = connectedUsers.get(targetId);

    if (target && target.socket.readyState === WebSocket.OPEN) {
        // Forward the message exactly as is, but tag the sender
        target.socket.send(JSON.stringify({
            type: 'message',
            senderId: ws.userId,
            payload: payload
        }));
        console.log(`Routed message from ${ws.userId} to ${targetId}`);
    } else {
        // Optional: Send error back to sender
        ws.send(JSON.stringify({ type: 'error', message: 'User not online' }));
    }
}

// Broadcast list of online users (excluding sockets/keys if strictly needed, but keys are public)
function broadcastUserList() {
    const users = Array.from(connectedUsers.entries()).map(([id, u]) => ({
        id: id,
        publicKey: u.publicKey,
        info: u.info,
        status: 'online'
    }));

    const broadcastData = JSON.stringify({
        type: 'user_list',
        users: users
    });

    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(broadcastData);
        }
    }
}

// Heartbeat to keep connections alive
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
