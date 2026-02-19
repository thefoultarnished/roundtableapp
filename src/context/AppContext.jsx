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

    // Merges cached friends from IndexedDB into state without overwriting
    // live-discovered users or status. Safe to call any time.
    case 'SEED_FRIENDS_FROM_CACHE': {
      const { users, friendIds } = action.payload;
      const existingIds = new Set(state.allUsers.map(u => String(u.id)));
      const toAdd = users.filter(u => u.id && !existingIds.has(String(u.id)));
      const merged = toAdd.length ? [...state.allUsers, ...toAdd] : state.allUsers;
      const mergedFriendIds = Array.from(new Set([...state.friends, ...friendIds]));
      return { ...state, allUsers: merged, displayedUsers: merged, friends: mergedFriendIds };
    }

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

      // Normalize timestamp to ms
      const normTs = (ts) => (!ts ? 0 : ts < 1e12 ? ts * 1000 : ts);

      // Merge all, deduplicate by messageId, sort by timestamp
      const all = [...existing, ...newMessages];
      const seen = new Map();

      for (const m of all) {
        const ts = normTs(m.timestamp);
        const key = m.messageId || `${m.sender}:${ts}`;

        if (!seen.has(key)) {
          seen.set(key, { ...m, timestamp: ts });
        } else {
          // Keep the version with better status (delivered > not, read > not)
          const prev = seen.get(key);
          if ((m.delivered && !prev.delivered) || (m.read && !prev.read)) {
            seen.set(key, { ...m, timestamp: ts });
          }
        }
      }

      const merged = Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);

      return {
        ...state,
        messages: { ...state.messages, [userId]: merged },
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
        // Get credentials for decryption
        const username = localStorage.getItem('username');
        const password = localStorage.getItem('authPassword');

        // Only decrypt if user is properly logged in
        if (!username || username === 'RoundtableUser' || username === 'Anonymous') {
          console.warn('🗄️ IndexedDB - skipped decryption: invalid username');
          return;
        }

        if (!password) {
          console.warn('🗄️ IndexedDB - skipped decryption: password not available');
          return;
        }

        // Load messages (encrypted)
        const cachedMessages = await loadAllMessages();
        if (Object.keys(cachedMessages).length === 0) return;

        const totalMessages = Object.values(cachedMessages).reduce((sum, msgs) => sum + msgs.length, 0);
        console.log(`🗄️ IndexedDB - decrypting ${totalMessages} messages across ${Object.keys(cachedMessages).length} conversations`);

        if (username && password) {
          // Derive keys for decryption
          const keyPair = await deriveKeyPairFromPassword(username, password);

          // Load peer public keys
          const peerKeysCache = localStorage.getItem('peerPublicKeys');
          const peerKeys = peerKeysCache ? JSON.parse(peerKeysCache) : {};

          // Decrypt all messages
          const decryptedMessages = {};
          let decryptedCount = 0;
          let failedCount = 0;

          for (const [friendId, messages] of Object.entries(cachedMessages)) {
            decryptedMessages[friendId] = await Promise.all(
              messages.map(async (msg) => {
                try {
                  let text = '';

                  if (msg.content?.encrypted && msg.content.iv && msg.content.cipher) {
                    const senderId = msg.senderId === 'me' ? friendId : msg.senderId;
                    const peerKeyJwk = peerKeys[senderId];

                    if (peerKeyJwk) {
                      try {
                        const peerPublicKey = await importPublicKey(peerKeyJwk);
                        const sharedKey = await deriveSharedKey(keyPair.privateKey, peerPublicKey);
                        text = await decryptMessage(msg.content.iv, msg.content.cipher, sharedKey);
                        decryptedCount++;
                      } catch (decryptErr) {
                        console.warn(`🗄️ IndexedDB - decryption failed for ${senderId}:`, decryptErr.message);
                        text = '⚠️ Decryption failed (key mismatch)';
                        failedCount++;
                      }
                    } else {
                      text = '🔒 Encrypted (key not available)';
                      failedCount++;
                    }
                  } else {
                    text = msg.content?.text || '';
                  }

                  return {
                    sender: msg.sender || msg.senderId,
                    text,
                    time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    timestamp: msg.timestamp,
                    messageId: msg.messageId,
                    files: [],
                    delivered: msg.delivered || false,
                    read: msg.read || false,
                  };
                } catch (err) {
                  console.error('🗄️ IndexedDB - failed to process message:', err);
                  failedCount++;
                  return {
                    sender: msg.sender || msg.senderId,
                    text: '⚠️ Failed to decrypt',
                    time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    timestamp: msg.timestamp,
                    messageId: msg.messageId,
                    files: [],
                  };
                }
              })
            );
          }

          console.log(`🗄️ IndexedDB - ✅ done: ${decryptedCount} decrypted, ${failedCount} failed`);

          // Use PREPEND_MESSAGES per-user so we merge with existing state instead of
          // replacing it — avoids the blink caused by SET_MESSAGES wiping in-memory messages.
          for (const [userId, messages] of Object.entries(decryptedMessages)) {
            if (messages.length > 0) {
              dispatch({ type: 'PREPEND_MESSAGES', payload: { userId, messages } });
            }
          }
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

  // Load friends immediately on login — before message decryption starts.
  // This populates the sidebar with names right away so the UI feels instant.
  useEffect(() => {
    if (!state.currentUser?.username) return;

    const seedFriendsEarly = async () => {
      try {
        const cached = await loadAllFriends();
        if (!cached.length) return;

        const users = cached
          .map(f => ({
            id: f.id || f.userId,
            name: f.name || f.displayName,
            username: f.username,
            profile_picture: f.profile_picture || f.profilePicture,
            profile_picture_timestamp: f.profile_picture_timestamp,
            status: 'offline',
          }))
          .filter(u => u.id);

        if (!users.length) return;

        dispatch({
          type: 'SEED_FRIENDS_FROM_CACHE',
          payload: { users, friendIds: users.map(u => u.id) },
        });
      } catch (err) {
        console.error('🗄️ Failed to seed friends from cache:', err);
      }
    };

    seedFriendsEarly();
  }, [state.currentUser?.username]); // Fires once per login

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
              userId: friend.id || friend.username,    // IDB keyPath — must stay
              id: friend.id || friend.username,        // normalized
              name: friend.name,                       // normalized
              username: friend.username,
              displayName: friend.name,                // keep for backwards compat
              profile_picture: friend.profile_picture, // normalized
              profilePicture: friend.profile_picture,  // keep for backwards compat
              profile_picture_timestamp: friend.profile_picture_timestamp,
              status: friend.status,
            }).catch(() => {});
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
