/**
 * IndexedDB utility for storing messages and user data
 * Enables instant loading on app startup
 */

const DB_NAME = 'RoundtableDB';
const DB_VERSION = 1;

// Object stores (tables)
const STORES = {
  MESSAGES: 'messages',
  FRIENDS: 'friends',
  CONVERSATIONS: 'conversations'
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
    };
  });
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
      console.log('🗄️ IndexedDB - DEBUG: Message saved with ID:', request.result);
      resolve();
    };
    request.onerror = () => {
      console.error('🗄️ IndexedDB - DEBUG: Save failed:', request.error);
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

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Load all messages for a specific friend
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

    request.onsuccess = () => resolve(request.result || []);
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
      console.log('🗄️ IndexedDB - DEBUG: Raw messages from DB:', messages.length, 'messages');
      console.log('🗄️ IndexedDB - DEBUG: First message:', messages[0]);

      // Group by friendId
      const grouped = messages.reduce((acc, msg) => {
        if (!acc[msg.friendId]) acc[msg.friendId] = [];
        acc[msg.friendId].push(msg);
        return acc;
      }, {});

      // Sort each friend's messages by timestamp
      Object.keys(grouped).forEach(friendId => {
        grouped[friendId].sort((a, b) => a.timestamp - b.timestamp);
      });

      console.log('🗄️ IndexedDB - DEBUG: Grouped messages:', Object.keys(grouped).length, 'conversations');
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
 * Clear all data from IndexedDB (for logout or debugging)
 * @returns {Promise<void>}
 */
export async function clearAllData() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.MESSAGES, STORES.FRIENDS, STORES.CONVERSATIONS],
      'readwrite'
    );

    transaction.objectStore(STORES.MESSAGES).clear();
    transaction.objectStore(STORES.FRIENDS).clear();
    transaction.objectStore(STORES.CONVERSATIONS).clear();

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
