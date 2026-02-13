import { WebSocket, WebSocketServer } from "ws";
import http from "http";
import Database from "better-sqlite3";

// Configuration
const PORT = process.env.PORT || 8080;
const DB_PATH = "./roundtable.db";

// Initialize Database
const db = new Database(DB_PATH);
console.log("✅ Connected to SQLite database");

// Prepare statements for performance
const insertUser = db.prepare(`
  INSERT INTO users (user_id, username, display_name, public_key, profile_picture, last_seen, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    username = excluded.username,
    display_name = excluded.display_name,
    public_key = excluded.public_key,
    profile_picture = excluded.profile_picture,
    last_seen = excluded.last_seen
`);

const updateUserLastSeen = db.prepare(`
  UPDATE users SET last_seen = ? WHERE user_id = ?
`);

const insertMessage = db.prepare(`
  INSERT INTO messages (message_id, sender_id, recipient_id, content, timestamp, delivered)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const getPendingMessages = db.prepare(`
  SELECT * FROM messages WHERE recipient_id = ? AND delivered = 0 ORDER BY timestamp ASC
`);

const markMessagesDelivered = db.prepare(`
  UPDATE messages SET delivered = 1 WHERE id IN (SELECT id FROM messages WHERE recipient_id = ? AND delivered = 0)
`);

const markMessageDelivered = db.prepare(`
  UPDATE messages SET delivered = 1 WHERE message_id = ?
`);

const markMessageRead = db.prepare(`
  UPDATE messages SET read_msg = 1 WHERE message_id = ?
`);

const getAllUsers = db.prepare(`
  SELECT * FROM users ORDER BY last_seen DESC
`);

const getChatHistory = db.prepare(`
  SELECT * FROM messages
  WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
  ORDER BY timestamp DESC
  LIMIT ? OFFSET ?
`);

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Roundtable Relay Server is Running with SQLite Persistence");
});

// Create WebSocket Server
const wss = new WebSocketServer({ server });

// User Registry: { [userId]: { socket, publicKey, info, sessionId } }
const connectedUsers = new Map();

console.log(`🚀 Relay Server started on port ${PORT}`);

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  ws.isAlive = true;
  ws.userId = null;
  console.log(`New connection from ${ip}`);

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(ws, data);
    } catch (e) {
      console.error("Invalid JSON received:", e.message);
    }
  });

  ws.on("close", () => {
    if (ws.userId && connectedUsers.has(ws.userId)) {
      console.log(`User disconnected: ${ws.userId}`);

      // Update last_seen in database
      const now = Date.now();
      updateUserLastSeen.run(now, ws.userId);

      connectedUsers.delete(ws.userId);
      broadcastUserList();
    }
  });
});

// Message Handler
function handleMessage(ws, data) {
  switch (data.type) {
    case "identify":
      handleIdentify(ws, data);
      break;
    case "message":
      handleRouteMessage(ws, data);
      break;
    case "broadcast_presence":
      if (ws.userId && connectedUsers.has(ws.userId)) {
        const user = connectedUsers.get(ws.userId);
        user.info = { ...user.info, ...data.payload };

        // Update user info in database
        const now = Date.now();
        insertUser.run(
          ws.userId,
          user.info.username || user.info.name,
          user.info.name || user.info.username,
          JSON.stringify(user.publicKey),
          user.info.profilePicture || null,
          now,
          now,
        );

        broadcastUserList();
      }
      break;
    case "get_chat_history":
      handleGetChatHistory(ws, data);
      break;
    case "message_delivered":
      handleMessageDelivered(data);
      break;
    case "message_read":
      handleMessageRead(data);
      break;
    default:
      console.log("Unknown message type:", data.type);
  }
}

// Handle User Identification
function handleIdentify(ws, data) {
  const { userId, sessionId, publicKey, info } = data;

  if (!userId || !publicKey) {
    return;
  }

  console.log(`User Identified: ${info?.name || userId} (${userId})`);

  ws.userId = userId;
  ws.sessionId = sessionId;

  const now = Date.now();

  // Save/Update user in database
  try {
    insertUser.run(
      userId,
      info?.username || info?.name || userId,
      info?.name || info?.username || userId,
      JSON.stringify(publicKey),
      info?.profilePicture || null,
      now,
      now,
    );
    console.log(`✅ User ${userId} saved to database`);
  } catch (err) {
    console.error("Failed to save user to database:", err);
  }

  // De-duplicate sessions
  for (const [id, user] of connectedUsers.entries()) {
    if (user.sessionId === sessionId && id !== userId) {
      console.log(
        `Deduplicating: Replacing user [${id}] with [${userId}] for session ${sessionId}`,
      );
      connectedUsers.delete(id);
    }
  }

  connectedUsers.set(userId, {
    socket: ws,
    sessionId: sessionId,
    publicKey: publicKey,
    info: info || {},
  });

  // Send pending messages (offline queue)
  try {
    const pending = getPendingMessages.all(userId);

    if (pending.length > 0) {
      console.log(
        `📬 Delivering ${pending.length} pending messages to ${userId}`,
      );

      pending.forEach((msg) => {
        ws.send(
          JSON.stringify({
            type: "message",
            messageId: msg.message_id,
            senderId: msg.sender_id,
            payload: JSON.parse(msg.content),
            timestamp: msg.timestamp,
            queued: true, // Flag to indicate this was queued
          }),
        );
      });

      // Mark messages as delivered
      markMessagesDelivered.run(userId);
    }
  } catch (err) {
    console.error("Failed to retrieve pending messages:", err);
  }

  // Notify user they are registered
  ws.send(JSON.stringify({ type: "registered", success: true }));

  // Update everyone else
  broadcastUserList();

  // Notify others about the new user join
  const joinMessage = JSON.stringify({
    type: "user_connected",
    user: {
      id: userId,
      sessionId: sessionId,
      publicKey: publicKey,
      info: info || {},
    },
  });

  for (const [otherId, otherUser] of connectedUsers.entries()) {
    if (otherId !== userId && otherUser.socket.readyState === WebSocket.OPEN) {
      otherUser.socket.send(joinMessage);
    }
  }
}

// Route Encrypted Message
function handleRouteMessage(ws, data) {
  const { targetId, payload } = data;

  if (!targetId || !payload) return;

  const target = connectedUsers.get(targetId);
  const now = Date.now();

  // Generate unique message ID
  const messageId = `${ws.userId}-${targetId}-${now}`;

  if (target && target.socket.readyState === WebSocket.OPEN) {
    // User is ONLINE - deliver immediately
    target.socket.send(
      JSON.stringify({
        type: "message",
        messageId: messageId,
        senderId: ws.userId,
        payload: payload,
        timestamp: now,
      }),
    );

    console.log(`✉️  Delivered message from ${ws.userId} to ${targetId}`);

    // Still save to database for history (marked as delivered)
    try {
      insertMessage.run(
        messageId,
        ws.userId,
        targetId,
        JSON.stringify(payload),
        now,
        1, // Already delivered
      );
    } catch (err) {
      console.error("Failed to save delivered message:", err);
    }

    // Send delivery confirmation to sender
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "message_sent",
          messageId: messageId,
          delivered: true,
        }),
      );
    }
  } else {
    // User is OFFLINE - queue message in database
    console.log(
      `📥 Queueing message from ${ws.userId} to ${targetId} (offline)`,
    );

    try {
      insertMessage.run(
        messageId,
        ws.userId,
        targetId,
        JSON.stringify(payload),
        now,
        0, // Not delivered yet
      );

      // Send acknowledgment to sender
      ws.send(
        JSON.stringify({
          type: "message_queued",
          targetId: targetId,
          messageId: messageId,
        }),
      );
    } catch (err) {
      console.error("Failed to queue message:", err);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Failed to queue message",
        }),
      );
    }
  }
}

// Broadcast list of ALL users (online + offline from database)
function broadcastUserList() {
  // Get all users from database
  const allDbUsers = getAllUsers.all();

  // Create a map of all users with their status
  const userMap = new Map();

  // First, add all database users as offline
  allDbUsers.forEach((dbUser) => {
    userMap.set(dbUser.user_id, {
      id: dbUser.user_id,
      sessionId: null,
      publicKey: JSON.parse(dbUser.public_key),
      info: {
        name: dbUser.display_name,
        username: dbUser.username,
        profilePicture: dbUser.profile_picture,
      },
      status: "offline",
      lastSeen: dbUser.last_seen,
    });
  });

  // Then, update online users from connectedUsers
  for (const [id, u] of connectedUsers.entries()) {
    userMap.set(id, {
      id: id,
      sessionId: u.sessionId,
      publicKey: u.publicKey,
      info: u.info,
      status: "online",
      lastSeen: Date.now(),
    });
  }

  const users = Array.from(userMap.values());

  const broadcastData = JSON.stringify({
    type: "user_list",
    users: users,
  });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(broadcastData);
    }
  }
}

// Handle Get Chat History Request
function handleGetChatHistory(ws, data) {
  const { userId, otherUserId, limit = 50, offset = 0 } = data;

  if (!userId || !otherUserId) {
    ws.send(
      JSON.stringify({
        type: "chat_history_error",
        error: "Missing userId or otherUserId",
      }),
    );
    return;
  }

  try {
    // Fetch messages between the two users with pagination
    const messages = getChatHistory.all(
      userId,
      otherUserId,
      otherUserId,
      userId,
      limit,
      offset,
    );

    // Get sender's public key from database
    const getSenderKey = db.prepare(`SELECT public_key FROM users WHERE user_id = ?`);
    const senderKeyRow = getSenderKey.get(otherUserId);
    const senderPublicKey = senderKeyRow ? JSON.parse(senderKeyRow.public_key) : null;

    // Parse content back to objects and include sender's public key
    const parsedMessages = messages.map((msg) => ({
      id: msg.id,
      messageId: msg.message_id,
      senderId: msg.sender_id,
      recipientId: msg.recipient_id,
      content: JSON.parse(msg.content),
      timestamp: msg.timestamp,
      delivered: msg.delivered === 1,
      read: msg.read_msg === 1,
      senderPublicKey: msg.sender_id === otherUserId ? senderPublicKey : null,
    }));

    ws.send(
      JSON.stringify({
        type: "chat_history",
        userId: otherUserId,
        messages: parsedMessages.reverse(), // Oldest first
        hasMore: messages.length === limit, // If we got full limit, there might be more
        senderPublicKey: senderPublicKey, // Send the public key for the other user
      }),
    );

    console.log(
      `📜 Sent ${messages.length} messages of chat history between ${userId} and ${otherUserId}`,
    );
  } catch (err) {
    console.error("Failed to fetch chat history:", err);
    ws.send(
      JSON.stringify({
        type: "chat_history_error",
        error: "Failed to fetch chat history",
      }),
    );
  }
}

// Handle Message Delivered Acknowledgment
function handleMessageDelivered(data) {
  const { messageId } = data;

  if (!messageId) return;

  try {
    markMessageDelivered.run(messageId);
    console.log(`✅ Message ${messageId} marked as delivered`);
  } catch (err) {
    console.error("Failed to mark message as delivered:", err);
  }
}

// Handle Message Read Acknowledgment
function handleMessageRead(data) {
  const { messageId } = data;

  if (!messageId) return;

  try {
    markMessageRead.run(messageId);
    console.log(`👁️  Message ${messageId} marked as read`);
  } catch (err) {
    console.error("Failed to mark message as read:", err);
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

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down server...");
  db.close();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`📊 Database: ${DB_PATH}`);
});
