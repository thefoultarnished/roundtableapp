import React, { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import { useOnlineMode } from '../hooks/useOnlineMode';
import { useProfilePictureSync } from '../hooks/useProfilePictureSync';
import { setCachedProfilePic, clearAllProfilePicCaches } from '../utils/profilePictureCache';
import {
  loadAllMessages,
  loadAllFriends,
  saveFriend,
  loadConversationMetadata,
  updateConversationMetadata,
  clearAllData
} from '../utils/indexedDB';
import { deriveKeyPairFromPassword, exportKey, importPublicKey, deriveSharedKey, decryptMessage } from '../utils/crypto';

const AppContext = createContext(null);

const initialState = {
  currentUser: (() => {
    try {
      const stored = localStorage.getItem('currentUser');
      if (!stored) return null;

      const user = JSON.parse(stored);
      // Validate username - if invalid, clear localStorage and return null
      if (!user.username || user.username === 'Anonymous' || user.username === 'RoundtableUser') {
        console.log('⚠️  Invalid user in localStorage, clearing...');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('username');
        localStorage.removeItem('displayName');
        return null;
      }

      return user;
    } catch {
      return null;
    }
  })(),
  messages: {},
  allUsers: [],
  displayedUsers: [],
  discoveredUsers: [],
  activeChatUserId: null,
  selectedFiles: [],
  unreadCounts: {},
  globalInvokeFunc: null,
  MSG_PORT: (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.__tauriVersion) ? 2427 : 2426,

  // Modals
  settingsOpen: false,
  summaryOpen: false,

  // Notifications queue
  notifications: [],

  // Friends system
  friends: [],
  sentFriendRequests: [],
  pendingFriendRequests: [],

  // Read receipts tracking: { [userId]: lastReadMessageId }
  lastReadMessageIds: {},

  // Pagination: { [userId]: isLoadingOlderMessages }
  loadingOlderMessages: {},

  // Splash screen
  isAppReady: false,
};

function appReducer(state, action) {
  switch (action.type) {
    case 'LOGIN': {
      const { username, displayName } = action.payload;
      const user = { username, displayName };
      localStorage.setItem('currentUser', JSON.stringify(user));
      localStorage.setItem('username', username);
      localStorage.setItem('displayName', displayName);
      return { ...state, currentUser: user };
    }

    case 'LOGOUT': {
      // Note: sendLogout should be called from component, not here
      // This action just clears local state
      localStorage.removeItem('currentUser');
      localStorage.removeItem('username');
      localStorage.removeItem('displayName');
      localStorage.removeItem('profilePicture');
      localStorage.removeItem('userId'); // Clear old random userId
      localStorage.removeItem('appUserId'); // Clear persistent user ID
      localStorage.removeItem('tempAuthPassword'); // Clear temporary password
      localStorage.removeItem('authPassword'); // Clear persistent password on logout

      // DO NOT remove privKey/pubKey - keep them for old message decryption
      // localStorage.removeItem('privKey');
      // localStorage.removeItem('pubKey');

      // DO NOT clear IndexedDB - keep messages for next login (needed for decryption)
      // clearAllData().catch(err => console.error('Failed to clear IndexedDB:', err));

      // Clear all profile picture caches
      clearAllProfilePicCaches();

      return {
        ...state,
        currentUser: null,
        activeChatUserId: null,
        allUsers: [],
        displayedUsers: [],
        messages: {},
        friends: [],
        sentFriendRequests: [],
        pendingFriendRequests: [],
      };
    }

    case 'SET_INVOKE_FUNC':
      return { ...state, globalInvokeFunc: action.payload };

    case 'ADD_USER': {
      const user = action.payload;

      // We check if a user with this ID OR this SessionID already exists
      const existsIndex = state.allUsers.findIndex(u =>
        String(u.id) === String(user.id) ||
        (user.sessionId && u.sessionId && u.sessionId === user.sessionId)
      );

      if (existsIndex !== -1) {
        // User exists, just update their details
        const updatedUsers = [...state.allUsers];
        // If sessionId matches but ID is different, it means they renamed themselves.
        // We MUST update the ID to the new one.
        updatedUsers[existsIndex] = { ...updatedUsers[existsIndex], ...user, id: user.id, status: 'online' };
        return { ...state, allUsers: updatedUsers, displayedUsers: updatedUsers };
      }

      // NEW: If this user has a sessionId, mark any OLD entries with the same sessionId as offline
      let updatedUsers = [...state.allUsers];
      if (user.sessionId) {
        updatedUsers = updatedUsers.map(u =>
          u.sessionId === user.sessionId && String(u.id) !== String(user.id)
            ? { ...u, status: 'offline' }
            : u
        );
      }

      // Add new user
      const newUsers = [...updatedUsers, user];
      return { ...state, allUsers: newUsers, displayedUsers: newUsers };
    }

    case 'SET_USERS': {
      // Deduplicate users by sessionId - keep latest, mark old ones offline
      const users = action.payload;
      const seenSessionIds = new Set();
      const deduped = [];

      // Iterate in reverse to keep the LATEST occurrence of each sessionId
      for (let i = users.length - 1; i >= 0; i--) {
        const user = users[i];
        if (user.sessionId) {
          if (!seenSessionIds.has(user.sessionId)) {
            seenSessionIds.add(user.sessionId);
            deduped.unshift(user); // Keep this one
          }
          // Skip duplicates
        } else {
          // Users without sessionId - keep them (old data)
          deduped.unshift(user);
        }
      }

      return { ...state, allUsers: deduped, displayedUsers: deduped };
    }

    case 'SET_DISPLAYED_USERS':
      return { ...state, displayedUsers: action.payload };

    case 'SET_ACTIVE_CHAT':
      return { ...state, activeChatUserId: action.payload };

    case 'ADD_MESSAGE': {
      const { userId, message } = action.payload;
      const existing = state.messages[userId] || [];

      // Deduplicate: check if message with same messageId already exists
      if (message.messageId && existing.some(m => m.messageId === message.messageId)) {
        console.warn(`⚠️ Duplicate message received (ID: ${message.messageId}), skipping`);
        return state;
      }

      return {
        ...state,
        messages: { ...state.messages, [userId]: [...existing, message] },
      };
    }

    case 'PREPEND_MESSAGES': {
      const { userId, messages: newMessages } = action.payload;
      const existing = state.messages[userId] || [];

      // Build lookup set using messageId AND sender+timestamp as fallback
      // This handles cases where messageId format differs between IndexedDB and server
      const existingKeys = new Set();
      existing.forEach(m => {
        if (m.messageId) existingKeys.add(`id:${m.messageId}`);
        if (m.timestamp && m.sender) existingKeys.add(`ts:${m.sender}:${m.timestamp}`);
      });

      const filtered = newMessages.filter(m => {
        if (m.messageId && existingKeys.has(`id:${m.messageId}`)) return false;
        if (m.timestamp && m.sender && existingKeys.has(`ts:${m.sender}:${m.timestamp}`)) return false;
        return true;
      });

      return {
        ...state,
        messages: { ...state.messages, [userId]: [...filtered, ...existing] },
      };
    }

    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };

    case 'SET_UNREAD_COUNTS':
      return { ...state, unreadCounts: action.payload };

    case 'SET_SELECTED_FILES':
      return { ...state, selectedFiles: action.payload };

    case 'ADD_SELECTED_FILES':
      return { ...state, selectedFiles: [...state.selectedFiles, ...action.payload] };

    case 'REMOVE_SELECTED_FILE':
      return { ...state, selectedFiles: state.selectedFiles.filter((_, i) => i !== action.payload) };

    case 'CLEAR_SELECTED_FILES':
      return { ...state, selectedFiles: [] };

    case 'SET_UNREAD': {
      const { userId, count } = action.payload;
      return { ...state, unreadCounts: { ...state.unreadCounts, [userId]: count } };
    }

    case 'INCREMENT_UNREAD': {
      const uid = action.payload;
      const current = state.unreadCounts[uid] || 0;
      return { ...state, unreadCounts: { ...state.unreadCounts, [uid]: current + 1 } };
    }

    case 'CLEAR_UNREAD': {
      const uid = action.payload;
      return { ...state, unreadCounts: { ...state.unreadCounts, [uid]: 0 } };
    }

    case 'TOGGLE_SETTINGS':
      return { ...state, settingsOpen: !state.settingsOpen };

    case 'SET_SETTINGS_OPEN':
      return { ...state, settingsOpen: action.payload };

    case 'SET_SUMMARY_OPEN':
      return { ...state, summaryOpen: action.payload };

    case 'UPDATE_FILE_TRANSFER_STATUS': {
      const { transferId, status, progress } = action.payload;
      const newMessages = { ...state.messages };
      for (const uid in newMessages) {
        newMessages[uid] = newMessages[uid].map(msg => {
          if (msg.fileTransfer && msg.fileTransfer.transferId === transferId) {
            return {
              ...msg,
              fileTransfer: {
                ...msg.fileTransfer,
                status: status || msg.fileTransfer.status,
                progress: progress !== undefined ? progress : msg.fileTransfer.progress,
              },
            };
          }
          return msg;
        });
      }
      return { ...state, messages: newMessages };
    }

    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [...state.notifications, action.payload] };

    case 'REMOVE_NOTIFICATION':
      return { ...state, notifications: state.notifications.filter(n => n.id !== action.payload) };

    // Friends system
    case 'SET_FRIENDS':
      return { ...state, friends: action.payload };

    case 'ADD_FRIEND': {
      const friendId = action.payload;
      if (state.friends.includes(friendId)) return state;
      return { ...state, friends: [...state.friends, friendId] };
    }

    case 'SET_PENDING_REQUESTS':
      return { ...state, pendingFriendRequests: action.payload };

    case 'ADD_PENDING_REQUEST': {
      const req = action.payload;
      const exists = state.pendingFriendRequests.some(r => r.sender_id === req.sender_id);
      if (exists) return state;
      return { ...state, pendingFriendRequests: [...state.pendingFriendRequests, req] };
    }

    case 'REMOVE_PENDING_REQUEST':
      return { ...state, pendingFriendRequests: state.pendingFriendRequests.filter(r => r.sender_id !== action.payload) };

    case 'SET_SENT_REQUESTS':
      return { ...state, sentFriendRequests: action.payload };

    case 'ADD_SENT_REQUEST': {
      const target = action.payload;
      if (state.sentFriendRequests.includes(target)) return state;
      return { ...state, sentFriendRequests: [...state.sentFriendRequests, target] };
    }

    case 'REMOVE_SENT_REQUEST':
      return { ...state, sentFriendRequests: state.sentFriendRequests.filter(id => id !== action.payload) };

    case 'UPDATE_USER_STATUS': {
      const { userId, status } = action.payload;
      const updatedUsers = state.allUsers.map(u =>
        u.id === userId ? { ...u, status } : u
      );
      return { ...state, allUsers: updatedUsers, displayedUsers: updatedUsers };
    }

    case 'UPDATE_USER_PROFILE_PICTURE': {
      const { userId, profilePicture, timestamp } = action.payload;
      const updatedUsers = state.allUsers.map(u => {
        if (u.id === userId || u.username === userId) {
          return {
            ...u,
            profile_picture: profilePicture,
            profile_picture_timestamp: timestamp || Date.now()
          };
        }
        return u;
      });
      return { ...state, allUsers: updatedUsers, displayedUsers: updatedUsers };
    }

    case 'UPDATE_LAST_READ_MESSAGE': {
      const { userId, messageId } = action.payload;
      // Only update if the new messageId is greater than the current one (string comparison works for our format)
      const currentLastRead = state.lastReadMessageIds[userId];
      if (!currentLastRead || messageId > currentLastRead) {
        return {
          ...state,
          lastReadMessageIds: { ...state.lastReadMessageIds, [userId]: messageId }
        };
      }
      return state;
    }

    case 'SET_LOADING_OLDER_MESSAGES': {
      const { userId, isLoading } = action.payload;
      return {
        ...state,
        loadingOlderMessages: { ...state.loadingOlderMessages, [userId]: isLoading }
      };
    }

    case 'SET_APP_READY':
      return { ...state, isAppReady: true };

    default:
      return state;
  }
}



export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const getState = useCallback(() => stateRef.current, []);

  const online = useOnlineMode(dispatch, getState);

  // Sync profile pictures on app launch
  useProfilePictureSync(dispatch, state.allUsers, online?.isOnline);

  // Separate function to load encrypted messages from IndexedDB
  const loadEncryptedMessages = useCallback(async () => {
    // Only load if user is logged in
    if (!state.currentUser?.username) {
      console.log('🗄️ IndexedDB - Skipped (user not logged in)');
      return;
    }
      try {
        console.log('🗄️ IndexedDB - Loading cached data...');

        // Get credentials for decryption
        const username = localStorage.getItem('username');
        const password = localStorage.getItem('authPassword');

        // Load messages (encrypted)
        const cachedMessages = await loadAllMessages();
        console.log('🗄️ IndexedDB - DEBUG: loadAllMessages returned:', cachedMessages);
        console.log('🗄️ IndexedDB - DEBUG: Number of conversations:', Object.keys(cachedMessages).length);
        console.log('🗄️ IndexedDB - DEBUG: username:', username, 'password:', password ? 'exists' : 'missing');

        // Only decrypt if user is properly logged in (not default username)
        if (!username || username === 'RoundtableUser' || username === 'Anonymous') {
          console.error(`❌ CLAUDE: CANNOT DECRYPT INDEXEDDB - Invalid/Default Username: "${username}"`);
          console.error(`❌ CLAUDE: Expected a real username, got: "${username}"`);
          console.error(`❌ CLAUDE: Action Required: User must login with proper credentials before messages can be decrypted`);
          console.error(`❌ CLAUDE: Cached messages exist but cannot be accessed without proper user login`);
          return;
        }

        if (Object.keys(cachedMessages).length === 0) {
          console.log(`🔑 CLAUDE: No cached messages to decrypt`);
          return;
        }

        if (!password) {
          console.error(`❌ CLAUDE: CANNOT DECRYPT INDEXEDDB - Missing Password`);
          console.error(`❌ CLAUDE: Username: "${username}"`);
          console.error(`❌ CLAUDE: Password: ${password ? 'exists' : 'MISSING'}`);
          console.error(`❌ CLAUDE: Cached messages exist but password is not available for decryption`);
          return;
        }

        if (username && password) {
          console.log(`🔑 CLAUDE: ===== INDEXEDDB DECRYPTION START =====`);
          const totalMessages = Object.values(cachedMessages).reduce((sum, msgs) => sum + msgs.length, 0);
          console.log(`🗄️ IndexedDB - Loaded ${Object.keys(cachedMessages).length} conversations (${totalMessages} messages)`);
          console.log(`🔑 CLAUDE: username = "${username}"`);
          console.log(`🔑 CLAUDE: Source = localStorage.getItem('username')`);
          console.log(`🔑 CLAUDE: password exists = ${!!password}`);
          console.log(`🗄️ IndexedDB - Starting decryption with username: ${username}`);

          // Derive keys for decryption
          const keyPair = await deriveKeyPairFromPassword(username, password);
          console.log(`🗄️ IndexedDB - ✅ Derived key pair for decryption`);
          console.log(`🔑 CLAUDE: keyPair.privateKey type = ${keyPair.privateKey.type}`);
          console.log(`🔑 CLAUDE: keyPair.publicKey type = ${keyPair.publicKey.type}`);

          // Load peer public keys
          const peerKeysCache = localStorage.getItem('peerPublicKeys');
          const peerKeys = peerKeysCache ? JSON.parse(peerKeysCache) : {};
          console.log(`🔑 CLAUDE: peerPublicKeys found in localStorage = ${!!peerKeysCache}`);
          console.log(`🔑 CLAUDE: Number of peer keys available = ${Object.keys(peerKeys).length}`);
          console.log(`🔑 CLAUDE: Peer IDs: ${Object.keys(peerKeys).join(', ')}`);
          console.log(`🔑 CLAUDE: Full peerKeys object = ${JSON.stringify(peerKeys)}`);

          // Decrypt all messages
          const decryptedMessages = {};
          let encryptedCount = 0;
          let decryptedCount = 0;
          let failedCount = 0;

          for (const [friendId, messages] of Object.entries(cachedMessages)) {
            console.log(`🗄️ IndexedDB - 🔓 Decrypting ${messages.length} messages for friend: ${friendId}`);
            console.log(`🗄️ IndexedDB - Available peer keys:`, Object.keys(peerKeys));
            decryptedMessages[friendId] = await Promise.all(
              messages.map(async (msg, idx) => {
                try {
                  let text = '';

                  // Check if message is encrypted
                  if (msg.content?.encrypted && msg.content.iv && msg.content.cipher) {
                    encryptedCount++;
                    console.log(`🔑 CLAUDE: ===== MESSAGE ${idx + 1} DECRYPTION START =====`);
                    // Decrypt message
                    const senderId = msg.senderId === 'me' ? friendId : msg.senderId;
                    console.log(`🔑 CLAUDE: friendId = "${friendId}"`);
                    console.log(`🔑 CLAUDE: msg.senderId = "${msg.senderId}"`);
                    console.log(`🔑 CLAUDE: Calculated senderId = "${senderId}"`);

                    const peerKeyJwk = peerKeys[senderId];
                    console.log(`🔑 CLAUDE: Looking for peerKeys["${senderId}"]`);
                    console.log(`🔑 CLAUDE: peerKeyJwk found = ${!!peerKeyJwk}`);

                    if (peerKeyJwk) {
                      try {
                        console.log(`🔑 CLAUDE: peerKeyJwk content = ${JSON.stringify(peerKeyJwk)}`);
                        console.log(`🔑 CLAUDE: msg.content.iv = ${JSON.stringify(msg.content.iv)}`);
                        console.log(`🔑 CLAUDE: msg.content.cipher = ${JSON.stringify(msg.content.cipher).substring(0, 100)}...`);

                        const peerPublicKey = await importPublicKey(peerKeyJwk);
                        console.log(`🔑 CLAUDE: peerPublicKey imported successfully, type = ${peerPublicKey.type}`);

                        const sharedKey = await deriveSharedKey(keyPair.privateKey, peerPublicKey);
                        console.log(`🔑 CLAUDE: sharedKey derived successfully, type = ${sharedKey.type}`);

                        text = await decryptMessage(msg.content.iv, msg.content.cipher, sharedKey);
                        decryptedCount++;
                        console.log(`✅ CLAUDE: Decryption SUCCESS for ${senderId}`);
                        console.log(`🗄️ IndexedDB - ✅ Decrypted message from ${senderId}`);
                        console.log(`🔑 CLAUDE: ===== MESSAGE ${idx + 1} DECRYPTION END (SUCCESS) =====`);
                      } catch (decryptErr) {
                        console.error(`❌ CLAUDE: Decryption FAILED for ${senderId}:`, decryptErr.message);
                        console.error(`🔑 CLAUDE: Error details = ${decryptErr.toString()}`);
                        console.error(`🗄️ IndexedDB - ❌ Decryption failed for ${senderId}:`, decryptErr.message);
                        text = '⚠️ Decryption failed (key mismatch)';
                        failedCount++;
                        console.log(`🔑 CLAUDE: ===== MESSAGE ${idx + 1} DECRYPTION END (FAILED) =====`);
                      }
                    } else {
                      text = '🔒 Encrypted (Key not available)';
                      console.warn(`❌ CLAUDE: Missing public key for ${senderId}`);
                      console.warn(`🔑 CLAUDE: Available peer IDs: ${Object.keys(peerKeys).join(', ')}`);
                      console.warn(`🗄️ IndexedDB - ❌ Missing public key for ${senderId}. Available: ${Object.keys(peerKeys).join(', ')}`);
                      failedCount++;
                      console.log(`🔑 CLAUDE: ===== MESSAGE ${idx + 1} DECRYPTION END (NO KEY) =====`);
                    }
                  } else {
                    // Plaintext message
                    text = msg.content?.text || '';
                  }

                  return {
                    sender: msg.sender || msg.senderId,
                    text: text,
                    time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    timestamp: msg.timestamp,
                    messageId: msg.messageId,
                    files: [],
                    delivered: msg.delivered || false,
                    read: msg.read || false
                  };
                } catch (err) {
                  console.error('🗄️ IndexedDB - ❌ Failed to decrypt message:', err);
                  failedCount++;
                  return {
                    sender: msg.sender || msg.senderId,
                    text: '⚠️ Failed to decrypt',
                    time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    timestamp: msg.timestamp,
                    messageId: msg.messageId,
                    files: []
                  };
                }
              })
            );
          }

          console.log(`🗄️ IndexedDB - ✅ Decryption complete: ${decryptedCount}/${encryptedCount} succeeded, ${failedCount} failed`);
          console.log(`🔑 CLAUDE: ===== INDEXEDDB DECRYPTION SUMMARY =====`);
          console.log(`🔑 CLAUDE: Total messages processed = ${encryptedCount + Object.values(cachedMessages).reduce((sum, msgs) => sum + msgs.filter(m => !m.content?.encrypted).length, 0)}`);
          console.log(`🔑 CLAUDE: Encrypted messages = ${encryptedCount}`);
          console.log(`🔑 CLAUDE: Successfully decrypted = ${decryptedCount}`);
          console.log(`🔑 CLAUDE: Failed to decrypt = ${failedCount}`);
          console.log(`🔑 CLAUDE: username used = "${username}"`);
          console.log(`🔑 CLAUDE: Peer keys available = ${Object.keys(peerKeys).length}`);
          console.log(`🔑 CLAUDE: ===== INDEXEDDB DECRYPTION END =====`);

          const mergedMessages = decryptedMessages;
          dispatch({
            type: 'SET_MESSAGES',
            payload: mergedMessages
          });
        }

        // Load friends
        const cachedFriends = await loadAllFriends();
        if (cachedFriends.length > 0) {
          console.log(`🗄️ IndexedDB - Loaded ${cachedFriends.length} friends`);
          dispatch({ type: 'SET_ALL_USERS', payload: cachedFriends });
        }

        // Load conversation metadata (unread counts, last message times)
        const metadata = await loadConversationMetadata();
        if (Object.keys(metadata).length > 0) {
          console.log(`🗄️ IndexedDB - Loaded metadata for ${Object.keys(metadata).length} conversations`);
          // Update unread counts
          const unreadCounts = {};
          Object.keys(metadata).forEach(friendId => {
            unreadCounts[friendId] = metadata[friendId].unreadCount || 0;
          });
          dispatch({ type: 'SET_UNREAD_COUNTS', payload: unreadCounts });
        }

        console.log('🗄️ IndexedDB - ✅ Cache loading complete');
      } catch (err) {
        console.error('🗄️ IndexedDB - ❌ Failed to load cached data:', err);
      }
  }, [state.currentUser?.username, dispatch]);

  // Load on mount if user already logged in
  useEffect(() => {
    loadEncryptedMessages();
  }, []); // Only run once on mount

  // Load when user logs in (currentUser changes from null to user)
  useEffect(() => {
    if (state.currentUser?.username) {
      console.log('🗄️ IndexedDB - Triggering load after login');
      loadEncryptedMessages();
    }
  }, [state.currentUser?.username, loadEncryptedMessages]); // Watch for login

  // Messages are now saved encrypted in useOnlineMode when they arrive/are sent
  // No need to save from AppContext anymore

  // Save friends to IndexedDB when they change
  useEffect(() => {
    const saveFriendsToCache = async () => {
      // Only save if user is logged in
      if (!state.currentUser?.username) {
        return;
      }

      try {
        if (state.allUsers.length > 0) {
          for (const friend of state.allUsers) {
            await saveFriend({
              userId: friend.id || friend.username,
              username: friend.username,
              displayName: friend.name,
              profilePicture: friend.profile_picture,
              status: friend.status
            }).catch(() => {}); // Ignore errors
          }
        }
      } catch (err) {
        console.error('🗄️ IndexedDB - ❌ Failed to save friends:', err);
      }
    };

    // Debounce saves
    const timer = setTimeout(saveFriendsToCache, 500);
    return () => clearTimeout(timer);
  }, [state.allUsers]);

  // Save conversation metadata when unread counts change
  useEffect(() => {
    const saveMetadata = async () => {
      // Only save if user is logged in
      if (!state.currentUser?.username) {
        return;
      }

      try {
        for (const [friendId, count] of Object.entries(state.unreadCounts)) {
          await updateConversationMetadata(friendId, {
            unreadCount: count,
            lastMessageTime: Date.now()
          }).catch(() => {});
        }
      } catch (err) {
        console.error('🗄️ IndexedDB - ❌ Failed to save conversation metadata:', err);
      }
    };

    const timer = setTimeout(saveMetadata, 500);
    return () => clearTimeout(timer);
  }, [state.unreadCounts]);

  return (
    <AppContext.Provider value={{ state, dispatch, getState, online }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}
