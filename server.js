import { WebSocket, WebSocketServer } from "ws";
import http from "http";
import Database from "better-sqlite3";
import crypto from "crypto";
import { Client as MinioClient } from "minio";

// Configuration
const PORT = process.env.PORT || 8080;
const DB_PATH = "./roundtable.db";

// MinIO Configuration
const MINIO_ENDPOINT = "129.154.231.157";
const MINIO_PORT = 9000;
const MINIO_ACCESS_KEY = "admin";
const MINIO_SECRET_KEY = "minMIN_35!@";
const MINIO_BUCKET = "roundtable";
const MINIO_URL = `http://${MINIO_ENDPOINT}:${MINIO_PORT}`;

// Initialize MinIO Client
const minioClient = new MinioClient({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: false,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

// Ensure bucket exists
minioClient.bucketExists(MINIO_BUCKET, (err) => {
  if (err) {
    console.error("❌ Error checking MinIO bucket:", err);
  } else {
    console.log(`✅ MinIO bucket "${MINIO_BUCKET}" is ready`);
  }
});

// Initialize Database
const db = new Database(DB_PATH);
console.log("✅ Connected to SQLite database");

// Password hashing utilities
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  if (!passwordHash || !passwordHash.includes(":")) return false;
  const [salt, hash] = passwordHash.split(":");
  const testHash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return testHash === hash;
}

// Create users table if it doesn't exist
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      username TEXT,
      display_name TEXT,
      public_key TEXT,
      profile_picture TEXT,
      password_hash TEXT,
      last_seen INTEGER,
      created_at INTEGER
    );
  `);
  console.log("✅ Users table ready");
} catch (err) {
  console.error("Error creating users table:", err.message);
}

// Create messages table if it doesn't exist
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE,
      sender_id TEXT,
      recipient_id TEXT,
      content TEXT,
      timestamp INTEGER,
      delivered INTEGER DEFAULT 0,
      read_msg INTEGER DEFAULT 0
    );
  `);
  console.log("✅ Messages table ready");
} catch (err) {
  console.error("Error creating messages table:", err.message);
}

// Create friend_requests table if it doesn't exist
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at INTEGER,
      updated_at INTEGER,
      UNIQUE(sender_id, receiver_id)
    );
  `);
  console.log("✅ Friend requests table ready");
} catch (err) {
  console.error("Error creating friend_requests table:", err.message);
}

// Create friendships table to store accepted friendships
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      created_at INTEGER,
      UNIQUE(user_id, friend_id)
    );
  `);
  console.log("✅ Friendships table ready");
} catch (err) {
  console.error("Error creating friendships table:", err.message);
}

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
  UPDATE users SET last_seen = ? WHERE username = ? OR user_id = ?
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

const getUserProfilePicture = db.prepare(`
  SELECT profile_picture FROM users WHERE username = ? OR user_id = ?
`);

const getChatHistory = db.prepare(`
  SELECT * FROM messages
  WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
  ORDER BY timestamp DESC
  LIMIT ? OFFSET ?
`);

// Friend request statements
const sendFriendRequest = db.prepare(`
  INSERT INTO friend_requests (sender_id, receiver_id, status, created_at, updated_at)
  VALUES (?, ?, 'pending', ?, ?)
  ON CONFLICT(sender_id, receiver_id) DO UPDATE SET status = 'pending', updated_at = ?
`);

const getPendingFriendRequests = db.prepare(`
  SELECT sender_id, receiver_id, created_at FROM friend_requests
  WHERE receiver_id = ? AND status = 'pending'
  ORDER BY created_at DESC
`);

const acceptFriendRequest = db.prepare(`
  UPDATE friend_requests SET status = 'accepted', updated_at = ?
  WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
`);

const declineFriendRequest = db.prepare(`
  UPDATE friend_requests SET status = 'declined', updated_at = ?
  WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
`);

const createFriendship = db.prepare(`
  INSERT INTO friendships (user_id, friend_id, created_at)
  VALUES (?, ?, ?)
  ON CONFLICT(user_id, friend_id) DO NOTHING
`);

const getFriendsList = db.prepare(`
  SELECT friend_id FROM friendships WHERE user_id = ?
`);

const getSentFriendRequests = db.prepare(`
  SELECT receiver_id, created_at FROM friend_requests
  WHERE sender_id = ? AND status = 'pending'
  ORDER BY created_at DESC
`);

// Create HTTP server
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle image upload endpoint
  if (req.method === "POST" && req.url === "/upload-image") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        const { imageData, userId, fileName } = data;

        if (!imageData || !userId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing imageData or userId" }));
          return;
        }

        // Convert base64 to buffer
        const buffer = Buffer.from(imageData.split(",")[1], "base64");
        const objectName = `${userId}/${fileName || `profile-${Date.now()}.png`}`;

        // Upload to MinIO
        minioClient.putObject(
          MINIO_BUCKET,
          objectName,
          buffer,
          buffer.length,
          {},
          (err) => {
            if (err) {
              console.error("❌ MinIO upload error:", err);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Upload failed" }));
            } else {
              const imageUrl = `${MINIO_URL}/${MINIO_BUCKET}/${objectName}`;
              console.log(`✅ Image uploaded to MinIO: ${imageUrl}`);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true, imageUrl }));
            }
          },
        );
      } catch (err) {
        console.error("❌ Upload endpoint error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Server error" }));
      }
    });
    return;
  }

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
      updateUserLastSeen.run(now, ws.userId, ws.userId);

      connectedUsers.delete(ws.userId);
      broadcastUserList();
    }
  });
});

// Message Handler
function handleMessage(ws, data) {
  switch (data.type) {
    case "validate_auth":
      handleValidateAuth(ws, data);
      break;
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
    case "send_friend_request":
      handleSendFriendRequest(ws, data);
      break;
    case "get_friend_requests":
      handleGetFriendRequests(ws, data);
      break;
    case "accept_friend_request":
      handleAcceptFriendRequest(ws, data);
      break;
    case "decline_friend_request":
      handleDeclineFriendRequest(ws, data);
      break;
    case "get_friends_list":
      handleGetFriendsList(ws, data);
      break;
    case "get_sent_friend_requests":
      handleGetSentFriendRequests(ws, data);
      break;
    case "update_username":
      handleUpdateUsername(ws, data);
      break;
    case "update_profile_picture":
      handleUpdateProfilePicture(ws, data);
      break;
    case "user_logout":
      handleUserLogout(ws, data);
      break;
    default:
      console.log("Unknown message type:", data.type);
  }
}

// Validate Auth - Check username/password for login or username availability for signup
function handleValidateAuth(ws, data) {
  const { username, password, mode } = data; // mode: 'login' or 'signup'

  if (!username) {
    ws.send(
      JSON.stringify({
        type: "auth_validation",
        valid: false,
        reason: "Username is required",
      }),
    );
    return;
  }

  // Validate username format
  const usernameRegex = /^[a-zA-Z0-9_.]{2,14}$/;
  if (!usernameRegex.test(username)) {
    ws.send(
      JSON.stringify({
        type: "auth_validation",
        valid: false,
        reason:
          "Username must be 2-14 chars with only letters, numbers, dots, or underscores",
      }),
    );
    return;
  }

  // Validate password if provided
  if (password && password.length > 14) {
    ws.send(
      JSON.stringify({
        type: "auth_validation",
        valid: false,
        reason: "Password must be 14 characters or less",
      }),
    );
    return;
  }

  try {
    const checkUsername = db.prepare(`
      SELECT user_id, password_hash FROM users WHERE LOWER(username) = LOWER(?)
    `);
    const existing = checkUsername.get(username);

    if (mode === "signup") {
      if (existing) {
        console.log(`❌ Username "${username}" already taken`);
        ws.send(
          JSON.stringify({
            type: "auth_validation",
            valid: false,
            reason: "Username already taken",
          }),
        );
      } else {
        console.log(`✅ Username "${username}" is available for signup`);
        ws.send(
          JSON.stringify({
            type: "auth_validation",
            valid: true,
            mode: "signup",
            username: username,
          }),
        );
      }
    } else if (mode === "login") {
      if (!existing) {
        console.log(`❌ Username "${username}" not found`);
        ws.send(
          JSON.stringify({
            type: "auth_validation",
            valid: false,
            reason: "Username or password incorrect",
          }),
        );
      } else if (!password) {
        ws.send(
          JSON.stringify({
            type: "auth_validation",
            valid: false,
            reason: "Password is required",
          }),
        );
      } else if (!verifyPassword(password, existing.password_hash)) {
        console.log(`❌ Invalid password for username "${username}"`);
        ws.send(
          JSON.stringify({
            type: "auth_validation",
            valid: false,
            reason: "Username or password incorrect",
          }),
        );
      } else {
        console.log(`✅ Login successful for username "${username}"`);
        ws.send(
          JSON.stringify({
            type: "auth_validation",
            valid: true,
            mode: "login",
            username: username,
            userId: existing.user_id,
          }),
        );
      }
    }
  } catch (err) {
    console.error("Failed to validate auth:", err);
    ws.send(
      JSON.stringify({
        type: "auth_validation",
        valid: false,
        reason: "Database error",
      }),
    );
  }
}

// Handle User Identification
function handleIdentify(ws, data) {
  const { userId, sessionId, publicKey, info, password } = data;

  if (!userId || !publicKey) {
    return;
  }

  const now = Date.now();
  const username =
    info?.username && info.username.trim()
      ? info.username
      : info?.name || userId;

  // Validate: If no password provided (auto-login), check if user exists in DB
  try {
    const checkUserStmt = db.prepare(
      `SELECT user_id, password_hash FROM users WHERE username = ?`,
    );
    const existingUser = checkUserStmt.get(username);

    // If no password and user doesn't exist → invalid session (stale localStorage)
    if (!password && !existingUser) {
      console.log(`❌ Invalid session: User "${username}" not found in DB`);
      ws.send(
        JSON.stringify({
          type: "invalid_session",
          reason: "User not found. Please login again.",
        }),
      );
      return;
    }

    console.log(`User Identified: ${info?.name || userId} (${userId})`);

    ws.userId = userId;
    ws.sessionId = sessionId;

    // If password provided (signup), hash it
    let passwordHash = null;
    if (password) {
      passwordHash = hashPassword(password);
    }

    const displayName = info?.name && info.name.trim() ? info.name : username;
    const publicKeyStr = JSON.stringify(publicKey);
    const profilePic = info?.profilePicture || null;

    const userExists = existingUser;

    if (userExists) {
      // User exists - update them (keep password if they have one)
      // Only update profile_picture if it was explicitly provided in the identify message
      if (info?.profilePicture) {
        const updateStmt = db.prepare(`
          UPDATE users
          SET user_id = ?, display_name = ?, public_key = ?, profile_picture = ?, last_seen = ?
          WHERE username = ?
        `);
        updateStmt.run(
          userId,
          displayName,
          publicKeyStr,
          profilePic,
          now,
          username,
        );
      } else {
        const updateStmt = db.prepare(`
          UPDATE users
          SET user_id = ?, display_name = ?, public_key = ?, last_seen = ?
          WHERE username = ?
        `);
        updateStmt.run(userId, displayName, publicKeyStr, now, username);
      }
      console.log(`✅ User ${userId} updated in database`);
    } else {
      // New user - insert with password if provided
      try {
        const insertStmt = db.prepare(`
          INSERT INTO users (user_id, username, display_name, public_key, profile_picture, password_hash, last_seen, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertStmt.run(
          userId,
          username,
          displayName,
          publicKeyStr,
          profilePic,
          passwordHash,
          now,
          now,
        );
        console.log(`✅ New user ${userId} created in database`);

        // Send signup success confirmation if this was a signup (password provided)
        if (password) {
          ws.send(
            JSON.stringify({
              type: "signup_success",
              username: username,
              message: "Account created successfully",
            }),
          );
          console.log(`📤 Sent signup_success to ${username}`);
        }
      } catch (insertErr) {
        console.error(`❌ Failed to insert user ${userId}:`, insertErr);
        // Send signup failure if this was a signup attempt
        if (password) {
          ws.send(
            JSON.stringify({
              type: "signup_failed",
              reason: "Failed to create account. Please try again.",
            }),
          );
        }
        return; // Don't proceed with connection if signup failed
      }
    }
  } catch (err) {
    console.error("Failed to save user to database:", err);
    // Send failure message if password was provided (signup attempt)
    if (password) {
      ws.send(
        JSON.stringify({
          type: "signup_failed",
          reason: "Database error occurred",
        }),
      );
    }
    return;
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

        // Notify sender that message was delivered
        const sender = connectedUsers.get(msg.sender_id);
        if (sender && sender.socket.readyState === WebSocket.OPEN) {
          console.log(
            `📬 Sending delivery confirmation for message ${msg.message_id} to ${msg.sender_id}`,
          );
          sender.socket.send(
            JSON.stringify({
              type: "message_delivery_confirmation",
              messageId: msg.message_id,
              recipientId: userId,
              delivered: true,
            }),
          );
        }
      });

      // Mark messages as delivered
      markMessagesDelivered.run(userId);
    }
  } catch (err) {
    console.error("Failed to retrieve pending messages:", err);
  }

  // Notify user they are registered and send their user_id
  ws.send(
    JSON.stringify({ type: "registered", success: true, userId: userId }),
  );

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

    // Send delivery confirmation to sender (message reached recipient)
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "message_delivery_confirmation",
          messageId: messageId,
          recipientId: targetId,
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

  // First, add all database users as offline (skip those with no username)
  allDbUsers.forEach((dbUser) => {
    // Only include users that have a valid username (not null/empty)
    if (dbUser.username && dbUser.username.trim()) {
      userMap.set(dbUser.user_id, {
        id: dbUser.user_id,
        sessionId: null,
        publicKey: JSON.parse(dbUser.public_key),
        info: {
          name: dbUser.display_name || dbUser.username, // Fallback to username if no display_name
          username: dbUser.username,
          profilePicture: dbUser.profile_picture,
        },
        status: "offline",
        lastSeen: dbUser.last_seen,
      });
    }
  });

  // Then, update online users from connectedUsers
  for (const [id, u] of connectedUsers.entries()) {
    // Get the user's database record to ensure we have the latest profilePicture
    const dbUser = getUserProfilePicture.get(id, id);
    const profilePicture = dbUser?.profile_picture || null;

    userMap.set(id, {
      id: id,
      sessionId: u.sessionId,
      publicKey: u.publicKey,
      info: {
        ...u.info,
        profilePicture: profilePicture,
      },
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
    const getSenderKey = db.prepare(
      `SELECT public_key FROM users WHERE user_id = ?`,
    );
    const senderKeyRow = getSenderKey.get(otherUserId);
    const senderPublicKey = senderKeyRow
      ? JSON.parse(senderKeyRow.public_key)
      : null;

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

  console.log(`📬 Received message_read for:`, messageId);

  if (!messageId) {
    console.warn("⚠️ No messageId in message_read event");
    return;
  }

  try {
    markMessageRead.run(messageId);
    console.log(`👁️  Message ${messageId} marked as read in database`);

    // Extract sender ID from messageId format: senderId-recipientId-timestamp
    const parts = messageId.split("-");
    console.log(`📝 MessageId parts:`, parts);

    if (parts.length >= 2) {
      const senderId = parts[0]; // The original sender
      console.log(`🔍 Looking for sender: ${senderId}`);

      const sender = connectedUsers.get(senderId);
      console.log(`📡 Sender connected:`, !!sender);

      // Send read confirmation to sender if they're online
      if (sender && sender.socket.readyState === WebSocket.OPEN) {
        console.log(`📤 Sending read confirmation to ${senderId}`);
        sender.socket.send(
          JSON.stringify({
            type: "message_read_confirmation",
            messageId: messageId,
          }),
        );
      } else {
        console.warn(`⚠️ Sender ${senderId} not connected or socket not open`);
      }
    } else {
      console.warn(`⚠️ Invalid messageId format:`, messageId);
    }
  } catch (err) {
    console.error("Failed to mark message as read:", err);
  }
}

// Handle Send Friend Request
function handleSendFriendRequest(ws, data) {
  const { receiverUsername } = data;
  if (!ws.userId || !receiverUsername) return;

  try {
    // Look up receiver's userId from username
    const lookupReceiver = db.prepare(
      `SELECT user_id, username FROM users WHERE username = ?`,
    );
    const receiverUser = lookupReceiver.get(receiverUsername);

    if (!receiverUser) {
      console.log(`❌ User not found: ${receiverUsername}`);
      ws.send(
        JSON.stringify({
          type: "friend_request_error",
          reason: "User not found",
        }),
      );
      return;
    }

    const now = Date.now();
    // Store both sender_id and receiver_id as userIds
    sendFriendRequest.run(ws.userId, receiverUser.user_id, now, now, now);
    console.log(
      `📤 Friend request sent from ${ws.userId} to ${receiverUser.user_id} (${receiverUsername})`,
    );

    // Send confirmation back to sender
    ws.send(
      JSON.stringify({
        type: "friend_request_sent",
        receiverUsername: receiverUsername,
        receiverId: receiverUser.user_id,
      }),
    );

    // Notify receiver if they're online - tell them to refresh their requests
    const receiver = connectedUsers.get(receiverUser.user_id);
    if (receiver && receiver.socket.readyState === WebSocket.OPEN) {
      // Get sender's info for the notification
      const senderInfo = db
        .prepare(`SELECT username, display_name FROM users WHERE user_id = ?`)
        .get(ws.userId);

      receiver.socket.send(
        JSON.stringify({
          type: "friend_request_received",
          senderId: ws.userId,
          senderUsername: senderInfo?.username || ws.userId,
          senderDisplayName:
            senderInfo?.display_name || senderInfo?.username || ws.userId,
        }),
      );
    }
  } catch (err) {
    console.error("Error sending friend request:", err.message);
  }
}

// Handle Get Friend Requests
function handleGetFriendRequests(ws, data) {
  if (!ws.userId) return;

  try {
    const requests = getPendingFriendRequests.all(ws.userId);
    console.log(
      `📥 Retrieved ${requests.length} pending requests for ${ws.userId}`,
    );

    // Enrich requests with sender information
    const enrichedRequests = requests.map((req) => {
      const sender = db
        .prepare(`SELECT username, display_name FROM users WHERE user_id = ?`)
        .get(req.sender_id);
      return {
        sender_id: req.sender_id,
        sender_username: sender?.username || req.sender_id,
        sender_display_name:
          sender?.display_name || sender?.username || req.sender_id,
        receiver_id: req.receiver_id,
        created_at: req.created_at,
      };
    });

    ws.send(
      JSON.stringify({
        type: "friend_requests_list",
        requests: enrichedRequests,
      }),
    );
  } catch (err) {
    console.error("Error getting friend requests:", err.message);
  }
}

// Handle Accept Friend Request
function handleAcceptFriendRequest(ws, data) {
  const { senderId } = data;
  if (!ws.userId || !senderId) return;

  try {
    const now = Date.now();
    acceptFriendRequest.run(now, senderId, ws.userId);
    // Create friendships in both directions
    createFriendship.run(ws.userId, senderId, now);
    createFriendship.run(senderId, ws.userId, now);
    console.log(`✅ Friend request accepted: ${senderId} <-> ${ws.userId}`);

    // Notify acceptor with full friends list refresh
    ws.send(
      JSON.stringify({
        type: "friend_request_accepted",
        friendId: senderId,
      }),
    );
    // Also send updated friends list to acceptor
    const acceptorFriends = getFriendsList.all(ws.userId);
    const acceptorFriendIds = acceptorFriends.map((f) => f.friend_id);
    ws.send(
      JSON.stringify({
        type: "friends_list",
        friends: acceptorFriendIds,
      }),
    );

    // Notify original sender if online
    const sender = connectedUsers.get(senderId);
    if (sender && sender.socket.readyState === WebSocket.OPEN) {
      sender.socket.send(
        JSON.stringify({
          type: "friend_request_accepted",
          friendId: ws.userId,
        }),
      );
      // Also send updated friends list to sender
      const senderFriends = getFriendsList.all(senderId);
      const senderFriendIds = senderFriends.map((f) => f.friend_id);
      sender.socket.send(
        JSON.stringify({
          type: "friends_list",
          friends: senderFriendIds,
        }),
      );
    }
  } catch (err) {
    console.error("Error accepting friend request:", err.message);
  }
}

// Handle Decline Friend Request
function handleDeclineFriendRequest(ws, data) {
  const { senderId } = data;
  if (!ws.userId || !senderId) return;

  try {
    const now = Date.now();
    declineFriendRequest.run(now, senderId, ws.userId);
    console.log(`❌ Friend request declined: ${senderId} -> ${ws.userId}`);

    // Notify decliner
    ws.send(
      JSON.stringify({
        type: "friend_request_declined",
        friendId: senderId,
      }),
    );

    // Notify original sender if online (so they see + button again)
    const sender = connectedUsers.get(senderId);
    if (sender && sender.socket.readyState === WebSocket.OPEN) {
      sender.socket.send(
        JSON.stringify({
          type: "friend_request_declined",
          friendId: ws.userId,
        }),
      );
    }
  } catch (err) {
    console.error("Error declining friend request:", err.message);
  }
}

// Handle Get Friends List
function handleGetFriendsList(ws, data) {
  if (!ws.userId) return;

  try {
    const friends = getFriendsList.all(ws.userId);
    const friendIds = friends.map((f) => f.friend_id);
    console.log(`👥 Retrieved ${friendIds.length} friends for ${ws.userId}`);

    ws.send(
      JSON.stringify({
        type: "friends_list",
        friends: friendIds,
      }),
    );
  } catch (err) {
    console.error("Error getting friends list:", err.message);
  }
}

// Handle Get Sent Friend Requests
function handleGetSentFriendRequests(ws, data) {
  if (!ws.userId) return;

  try {
    const requests = getSentFriendRequests.all(ws.userId);
    console.log(
      `📤 Retrieved ${requests.length} sent requests for ${ws.userId}`,
    );

    // Enrich requests with receiver information
    const enrichedRequests = requests.map((req) => {
      const receiver = db
        .prepare(`SELECT username, display_name FROM users WHERE user_id = ?`)
        .get(req.receiver_id);
      return {
        receiver_id: req.receiver_id,
        receiver_username: receiver?.username || req.receiver_id,
        receiver_display_name:
          receiver?.display_name || receiver?.username || req.receiver_id,
        created_at: req.created_at,
      };
    });

    // Also return just the IDs for backward compatibility
    const receiverIds = enrichedRequests.map((r) => r.receiver_id);

    ws.send(
      JSON.stringify({
        type: "sent_friend_requests_list",
        requests: receiverIds, // Keep for backward compatibility
        requestsDetailed: enrichedRequests, // New detailed format
      }),
    );
  } catch (err) {
    console.error("Error getting sent friend requests:", err.message);
  }
}

// Handle Update Username
function handleUpdateUsername(ws, data) {
  const { userId, newUsername } = data;
  if (!userId || !newUsername) return;

  try {
    const updateStmt = db.prepare(`
      UPDATE users SET username = ? WHERE user_id = ?
    `);
    const result = updateStmt.run(newUsername, userId);

    if (result.changes > 0) {
      console.log(`✅ Username updated for user ${userId}: ${newUsername}`);
      ws.send(
        JSON.stringify({
          type: "username_updated",
          success: true,
          userId: userId,
          newUsername: newUsername,
        }),
      );
      broadcastUserList();
    } else {
      console.log(`❌ User ${userId} not found for username update`);
      ws.send(
        JSON.stringify({
          type: "username_updated",
          success: false,
          reason: "User not found",
        }),
      );
    }
  } catch (err) {
    console.error("Error updating username:", err.message);
    ws.send(
      JSON.stringify({
        type: "username_updated",
        success: false,
        reason: "Database error",
      }),
    );
  }
}

// Handle User Logout
function handleUserLogout(ws, data) {
  const { userId } = data;
  if (!userId) return;

  try {
    // Remove user from connected users
    if (connectedUsers.has(userId)) {
      console.log(`🔌 User ${userId} explicitly logged out`);

      // Update last_seen in database
      const now = Date.now();
      updateUserLastSeen.run(now, userId, userId);

      // Remove from connected users
      connectedUsers.delete(userId);

      // Broadcast updated user list to all clients
      broadcastUserList();

      console.log(`✅ User ${userId} disconnected from server`);
    }
  } catch (err) {
    console.error("Failed to handle logout:", err);
  }
}

// Handle Update Profile Picture
function handleUpdateProfilePicture(ws, data) {
  const { userId, profilePicture } = data;
  if (!userId || !profilePicture) return;

  try {
    // Update user's profile picture in database (using username as identifier)
    const updateStmt = db.prepare(`
      UPDATE users SET profile_picture = ? WHERE username = ?
    `);
    const result = updateStmt.run(profilePicture, userId);

    if (result.changes > 0) {
      console.log(`📸 Profile picture updated for user ${userId}`);

      // Update the in-memory connectedUsers
      const user = connectedUsers.get(userId);
      if (user) {
        user.info = { ...user.info, profilePicture: profilePicture };
      }

      // Broadcast the profile picture update to ALL connected users
      const broadcastData = JSON.stringify({
        type: "profile_picture_updated",
        userId: userId,
        profilePicture: profilePicture,
        timestamp: Date.now(),
      });

      console.log(
        `📡 Broadcasting profile picture update for user ${userId} to ${wss.clients.size} clients`,
      );

      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(broadcastData);
        }
      }

      // Don't broadcast user list - the profile_picture_updated message is sufficient

      // Send confirmation to the user who updated it
      ws.send(
        JSON.stringify({
          type: "profile_picture_updated",
          success: true,
          userId: userId,
        }),
      );
    } else {
      console.log(`❌ User ${userId} not found for profile picture update`);
      ws.send(
        JSON.stringify({
          type: "profile_picture_update_error",
          reason: "User not found",
        }),
      );
    }
  } catch (err) {
    console.error("Error updating profile picture:", err.message);
    ws.send(
      JSON.stringify({
        type: "profile_picture_update_error",
        reason: "Database error",
      }),
    );
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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server listening on port ${PORT} (all interfaces)`);
  console.log(`📊 Database: ${DB_PATH}`);
});
