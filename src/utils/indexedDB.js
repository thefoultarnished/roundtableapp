/**
 * IndexedDB utility for storing messages and user data
 * Enables instant loading on app startup
 */

const DB_NAME = 'RoundtableDB';
const DB_VERSION = 2;

// ===== CONFIG: Change this value to limit messages per conversation =====
// Set to null or Infinity to keep ALL messages (recommended for single user)
// Set to 50 to keep only last 50 messages per conversation
// Set to 1000 to keep last 1000 messages per conversation
export const MAX_MESSAGES_PER_CONVERSATION = 15; // Store last 15 messages per conversation
// =========================================================================

// Object stores (tables)
const STORES = {
  MESSAGES: 'messages',
  FRIENDS: 'friends',
  CONVERSATIONS: 'conversations',
  PROFILE_PICTURES: 'profilePictures'
};

/**
 * Initialize IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Messages store: { id, friendId, sender, text, timestamp, files, ... }
      if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
        const messagesStore = db.createObjectStore(STORES.MESSAGES, {
          keyPath: 'id',
          autoIncrement: true
        });
        messagesStore.createIndex('friendId', 'friendId', { unique: false });
        messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Friends store: { userId, username, displayName, profilePicture, status }
      if (!db.objectStoreNames.contains(STORES.FRIENDS)) {
        const friendsStore = db.createObjectStore(STORES.FRIENDS, { keyPath: 'userId' });
        friendsStore.createIndex('username', 'username', { unique: false });
      }

      // Conversations metadata: { friendId, lastMessageTime, unreadCount }
      if (!db.objectStoreNames.contains(STORES.CONVERSATIONS)) {
        const conversationsStore = db.createObjectStore(STORES.CONVERSATIONS, { keyPath: 'friendId' });
        conversationsStore.createIndex('lastMessageTime', 'lastMessageTime', { unique: false });
      }

      // Profile Pictures store: { userId, blob, timestamp, url, cachedAt, size }
      if (!db.objectStoreNames.contains(STORES.PROFILE_PICTURES)) {
        const profilePicturesStore = db.createObjectStore(STORES.PROFILE_PICTURES, { keyPath: 'userId' });
        profilePicturesStore.createIndex('timestamp', 'timestamp', { unique: false });
        profilePicturesStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };
  });
}

/**
 * Deduplicate messages by messageId or sender+timestamp proximity.
 * Returns sorted array (oldest first).
 * @param {Array} messages - Array of message records
 * @returns {Array} - Deduplicated and sorted array
 */
function deduplicateMessages(messages) {
  const seen = new Map();

  for (const m of messages) {
    // Primary key: messageId
    if (m.messageId) {
      if (!seen.has(m.messageId)) {
        seen.set(m.messageId, m);
      }
      continue;
    }

    // Fallback: sender + timestamp (within 2s window)
    const senderKey = m.senderId || m.sender || 'unknown';
    let isDup = false;
    for (const [, existing] of seen) {
      const existingSender = existing.senderId || existing.sender || 'unknown';
      if (existingSender === senderKey && Math.abs(existing.timestamp - m.timestamp) < 2000) {
        isDup = true;
        break;
      }
    }
    if (!isDup) {
      seen.set(`noid-${m.timestamp}-${senderKey}`, m);
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Save a message to IndexedDB
 * @param {Object} message - Message object
 * @returns {Promise<void>}
 */
export async function saveMessage(message) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.MESSAGES], 'readwrite');
    const store = transaction.objectStore(STORES.MESSAGES);
    const request = store.add(message);

    request.onsuccess = () => {
      cleanupOldMessages(message.friendId).catch(err =>
        console.warn('🗄️ IndexedDB - Cleanup warning:', err)
      );
      resolve();
    };
    request.onerror = () => {
      console.error('🗄️ IndexedDB - Save failed:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Save multiple messages in bulk
 * @param {Array} messages - Array of message objects
 * @returns {Promise<void>}
 */
export async function saveMessages(messages) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.MESSAGES], 'readwrite');
    const store = transaction.objectStore(STORES.MESSAGES);

    messages.forEach(msg => store.add(msg));

    transaction.oncomplete = () => {
      // Clean up old messages for each unique friend
      const uniqueFriends = [...new Set(messages.map(m => m.friendId))];
      Promise.all(uniqueFriends.map(friendId => cleanupOldMessages(friendId)))
        .then(() => resolve())
        .catch(err => {
          console.warn('🗄️ IndexedDB - Cleanup warning after bulk save:', err);
          resolve(); // Don't fail the save if cleanup fails
        });
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Clean up old messages - keep only the last N messages per friend
 * Uses MAX_MESSAGES_PER_CONVERSATION setting (null = unlimited)
 * @param {string} friendId - Friend's user ID
 * @returns {Promise<void>}
 */
async function cleanupOldMessages(friendId) {
  // Skip cleanup if limit is not set (null or Infinity = keep all)
  if (!MAX_MESSAGES_PER_CONVERSATION || MAX_MESSAGES_PER_CONVERSATION === Infinity) {
    return Promise.resolve();
  }

  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.MESSAGES], 'readwrite');
    const store = transaction.objectStore(STORES.MESSAGES);
    const index = store.index('friendId');
    const request = index.getAll(friendId);

    request.onsuccess = () => {
      const messages = request.result || [];

      if (messages.length > MAX_MESSAGES_PER_CONVERSATION) {
        // Sort by timestamp to identify oldest messages
        messages.sort((a, b) => a.timestamp - b.timestamp);

        // Delete oldest messages, keeping only the limit
        const messagesToDelete = messages.slice(0, messages.length - MAX_MESSAGES_PER_CONVERSATION);
        console.log(`🗄️ IndexedDB - Cleaning up ${messagesToDelete.length} old messages for friend ${friendId}`);

        const deleteTransaction = db.transaction([STORES.MESSAGES], 'readwrite');
        const deleteStore = deleteTransaction.objectStore(STORES.MESSAGES);

        messagesToDelete.forEach(msg => {
          if (msg.id) {
            deleteStore.delete(msg.id);
          }
        });

        deleteTransaction.oncomplete = () => {
          console.log(`🗄️ IndexedDB - Kept last ${MAX_MESSAGES_PER_CONVERSATION} messages for friend ${friendId}`);
          resolve();
        };
        deleteTransaction.onerror = () => {
          console.warn('🗄️ IndexedDB - Cleanup failed:', deleteTransaction.error);
          reject(deleteTransaction.error);
        };
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update a message in IndexedDB by its messageId.
 * Used to set server timestamp and delivered status after delivery confirmation.
 * @param {string} messageId - The message's unique ID
 * @param {Object} updates - Fields to update (e.g., { timestamp, delivered })
 * @returns {Promise<boolean>} - Whether the message was found and updated
 */
export async function updateMessageByMessageId(messageId, updates) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.MESSAGES], 'readwrite');
    const store = transaction.objectStore(STORES.MESSAGES);
    const request = store.getAll();

    request.onsuccess = () => {
      const messages = request.result || [];
      const target = messages.find(m => m.messageId === messageId);

      if (!target) {
        resolve(false);
        return;
      }

      // Merge updates into the record
      const updated = { ...target, ...updates };
      const putRequest = store.put(updated);

      putRequest.onsuccess = () => resolve(true);
      putRequest.onerror = () => reject(putRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load all messages for a specific friend (deduplicated)
 * @param {string} friendId - Friend's user ID
 * @returns {Promise<Array>}
 */
export async function loadMessagesByFriend(friendId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.MESSAGES], 'readonly');
    const store = transaction.objectStore(STORES.MESSAGES);
    const index = store.index('friendId');
    const request = index.getAll(friendId);

    request.onsuccess = () => {
      const messages = request.result || [];
      resolve(deduplicateMessages(messages));
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load all messages (grouped by friend)
 * @returns {Promise<Object>} - { friendId: [messages] }
 */
export async function loadAllMessages() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.MESSAGES], 'readonly');
    const store = transaction.objectStore(STORES.MESSAGES);
    const request = store.getAll();

    request.onsuccess = () => {
      const messages = request.result || [];

      // Group by friendId
      const grouped = messages.reduce((acc, msg) => {
        if (!acc[msg.friendId]) acc[msg.friendId] = [];
        acc[msg.friendId].push(msg);
        return acc;
      }, {});

      // Deduplicate and sort each friend's messages
      Object.keys(grouped).forEach(friendId => {
        grouped[friendId] = deduplicateMessages(grouped[friendId]);
      });

      resolve(grouped);
    };
    request.onerror = () => {
      console.error('🗄️ IndexedDB - DEBUG: Load failed:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Save friend data
 * @param {Object} friend - Friend object { userId, username, displayName, profilePicture, status }
 * @returns {Promise<void>}
 */
export async function saveFriend(friend) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.FRIENDS], 'readwrite');
    const store = transaction.objectStore(STORES.FRIENDS);
    const request = store.put(friend); // Use put to update if exists

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save multiple friends in bulk
 * @param {Array} friends - Array of friend objects
 * @returns {Promise<void>}
 */
export async function saveFriends(friends) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.FRIENDS], 'readwrite');
    const store = transaction.objectStore(STORES.FRIENDS);

    friends.forEach(friend => store.put(friend));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Load all friends
 * @returns {Promise<Array>}
 */
export async function loadAllFriends() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.FRIENDS], 'readonly');
    const store = transaction.objectStore(STORES.FRIENDS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update conversation metadata (last message time, unread count)
 * @param {string} friendId - Friend's user ID
 * @param {Object} metadata - { lastMessageTime, unreadCount }
 * @returns {Promise<void>}
 */
export async function updateConversationMetadata(friendId, metadata) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CONVERSATIONS], 'readwrite');
    const store = transaction.objectStore(STORES.CONVERSATIONS);
    const request = store.put({ friendId, ...metadata });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load all conversation metadata
 * @returns {Promise<Object>} - { friendId: { lastMessageTime, unreadCount } }
 */
export async function loadConversationMetadata() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CONVERSATIONS], 'readonly');
    const store = transaction.objectStore(STORES.CONVERSATIONS);
    const request = store.getAll();

    request.onsuccess = () => {
      const metadata = request.result || [];
      const grouped = metadata.reduce((acc, conv) => {
        acc[conv.friendId] = {
          lastMessageTime: conv.lastMessageTime,
          unreadCount: conv.unreadCount
        };
        return acc;
      }, {});
      resolve(grouped);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * One-time cleanup: remove duplicate records already in IndexedDB.
 * Call on app startup to purge duplicates accumulated before dedup was added.
 * @returns {Promise<number>} - Number of duplicates removed
 */
export async function purgeExistingDuplicates() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.MESSAGES], 'readwrite');
    const store = transaction.objectStore(STORES.MESSAGES);
    const request = store.getAll();

    request.onsuccess = () => {
      const allMessages = request.result || [];
      if (allMessages.length === 0) { resolve(0); return; }

      // Group by friendId
      const grouped = {};
      for (const m of allMessages) {
        if (!grouped[m.friendId]) grouped[m.friendId] = [];
        grouped[m.friendId].push(m);
      }

      // For each group, find duplicates and collect IDs to delete
      const idsToDelete = [];
      for (const friendId in grouped) {
        const msgs = grouped[friendId];
        const seen = new Map();

        for (const m of msgs) {
          let key = m.messageId;
          if (!key) {
            const sender = m.senderId || m.sender || 'unknown';
            key = `${sender}:${m.timestamp}`;
          }

          if (seen.has(key)) {
            // This is a duplicate — mark for deletion
            idsToDelete.push(m.id);
          } else {
            seen.set(key, m);
          }
        }
      }

      if (idsToDelete.length === 0) {
        console.log('🗄️ IndexedDB - No duplicates found');
        resolve(0);
        return;
      }

      console.log(`🗄️ IndexedDB - Purging ${idsToDelete.length} duplicate records...`);

      // Delete duplicates
      const deleteTx = db.transaction([STORES.MESSAGES], 'readwrite');
      const deleteStore = deleteTx.objectStore(STORES.MESSAGES);
      idsToDelete.forEach(id => deleteStore.delete(id));

      deleteTx.oncomplete = () => {
        console.log(`🗄️ IndexedDB - ✅ Purged ${idsToDelete.length} duplicates`);
        resolve(idsToDelete.length);
      };
      deleteTx.onerror = () => reject(deleteTx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all data from IndexedDB (for logout or debugging)
 * @returns {Promise<void>}
 */
export async function clearAllData() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.MESSAGES, STORES.FRIENDS, STORES.CONVERSATIONS, STORES.PROFILE_PICTURES],
      'readwrite'
    );

    transaction.objectStore(STORES.MESSAGES).clear();
    transaction.objectStore(STORES.FRIENDS).clear();
    transaction.objectStore(STORES.CONVERSATIONS).clear();
    transaction.objectStore(STORES.PROFILE_PICTURES).clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Delete messages for a specific friend (for blocking/removing)
 * @param {string} friendId - Friend's user ID
 * @returns {Promise<void>}
 */
export async function deleteMessagesByFriend(friendId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.MESSAGES], 'readwrite');
    const store = transaction.objectStore(STORES.MESSAGES);
    const index = store.index('friendId');
    const request = index.openCursor(IDBKeyRange.only(friendId));

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save profile picture blob to IndexedDB
 * @param {Object} profilePicture - { userId, blob, timestamp, url, cachedAt, size }
 * @returns {Promise<void>}
 */
export async function saveProfilePictureBlob(profilePicture) {
  const db = await initDB();

  // Check if store exists (handle version mismatch)
  if (!db.objectStoreNames.contains(STORES.PROFILE_PICTURES)) {
    console.warn(`⚠️ Store ${STORES.PROFILE_PICTURES} not found. Force closing DB to trigger upgrade.`);
    db.close();
    // Close and reopen to trigger upgrade
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => {
        console.log('🗄️ Database deleted, will be recreated on next access');
        resolve();
      };
      request.onerror = () => {
        console.error('Failed to delete database:', request.error);
        reject(request.error);
      };
    });
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PROFILE_PICTURES], 'readwrite');
    const store = transaction.objectStore(STORES.PROFILE_PICTURES);
    const request = store.put(profilePicture);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get profile picture blob from IndexedDB
 * @param {string} userId - User's ID
 * @returns {Promise<Object|null>} - Profile picture object or null
 */
export async function getProfilePictureBlob(userId) {
  const db = await initDB();

  // Check if store exists (handle version mismatch)
  if (!db.objectStoreNames.contains(STORES.PROFILE_PICTURES)) {
    console.warn(`⚠️ Store ${STORES.PROFILE_PICTURES} not found. Database needs upgrade.`);
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PROFILE_PICTURES], 'readonly');
    const store = transaction.objectStore(STORES.PROFILE_PICTURES);
    const request = store.get(userId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete profile picture blob for a specific user
 * @param {string} userId - User's ID
 * @returns {Promise<void>}
 */
export async function deleteProfilePictureBlob(userId) {
  const db = await initDB();

  // Check if store exists
  if (!db.objectStoreNames.contains(STORES.PROFILE_PICTURES)) {
    console.log('⚠️ Profile pictures store not found, skipping delete');
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PROFILE_PICTURES], 'readwrite');
    const store = transaction.objectStore(STORES.PROFILE_PICTURES);
    const request = store.delete(userId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all profile picture blobs
 * @returns {Promise<Array>}
 */
export async function getAllProfilePictureBlobs() {
  const db = await initDB();

  // Check if store exists
  if (!db.objectStoreNames.contains(STORES.PROFILE_PICTURES)) {
    console.log('⚠️ Profile pictures store not found');
    return [];
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PROFILE_PICTURES], 'readonly');
    const store = transaction.objectStore(STORES.PROFILE_PICTURES);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all profile picture blobs
 * @returns {Promise<void>}
 */
export async function clearAllProfilePictureBlobs() {
  const db = await initDB();

  // Check if store exists
  if (!db.objectStoreNames.contains(STORES.PROFILE_PICTURES)) {
    console.log('⚠️ Profile pictures store not found, skipping clear');
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PROFILE_PICTURES], 'readwrite');
    const store = transaction.objectStore(STORES.PROFILE_PICTURES);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Force database upgrade by deleting and recreating
 * Call this if you get "store not found" errors
 * @returns {Promise<void>}
 */
export async function forceUpgradeDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      console.log('🗄️ Database deleted and will be recreated with new schema on next access');
      resolve();
    };
    request.onerror = () => {
      console.error('Failed to delete database:', request.error);
      reject(request.error);
    };
  });
}
