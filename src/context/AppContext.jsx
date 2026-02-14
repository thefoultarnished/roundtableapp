import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { useOnlineMode } from '../hooks/useOnlineMode';

const AppContext = createContext(null);

const initialState = {
  currentUser: (() => {
    try {
      const stored = localStorage.getItem('currentUser');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })(),
  messages: {
    'placeholder-aemeath': [
      { sender: 'placeholder-aemeath', text: "Hey! Ready to run some stress tests on the UI?", time: "10:00 AM", timestamp: Date.now() - 3600000, files: [] },
      { sender: 'me', text: "Always. What do you have in mind?", time: "10:01 AM", timestamp: Date.now() - 3540000, files: [] },
      { sender: 'placeholder-aemeath', text: "I want to see how the glassmorphism holds up with a massive message history.", time: "10:02 AM", timestamp: Date.now() - 3480000, files: [] },
      { sender: 'me', text: "The blur should be fine, but performance might dip if we don't virtualize.", time: "10:03 AM", timestamp: Date.now() - 3420000, files: [] },
      { sender: 'placeholder-aemeath', text: "Let's find out. I'm going to start sending a bunch of messages.", time: "10:04 AM", timestamp: Date.now() - 3360000, files: [] },
      { sender: 'me', text: "Go for it.", time: "10:05 AM", timestamp: Date.now() - 3300000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 1 check", time: "10:06 AM", timestamp: Date.now() - 3240000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 2 check", time: "10:06 AM", timestamp: Date.now() - 3180000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 3 check", time: "10:07 AM", timestamp: Date.now() - 3120000, files: [] },
      { sender: 'me', text: "Received first batch. Scroll is smooth so far.", time: "10:08 AM", timestamp: Date.now() - 3060000, files: [] },
      { sender: 'placeholder-aemeath', text: "How about some longer text to test the bubble expansion?", time: "10:09 AM", timestamp: Date.now() - 3000000, files: [] },
      { sender: 'placeholder-aemeath', text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam in dui mauris. Vivamus hendrerit arcu sed erat molestie vehicula. Sed auctor neque eu tellus rhoncus ut eleifend nibh porttitor.", time: "10:10 AM", timestamp: Date.now() - 2940000, files: [] },
      { sender: 'me', text: "Bubble looks great. The padding is consistent.", time: "10:11 AM", timestamp: Date.now() - 2880000, files: [] },
      { sender: 'placeholder-aemeath', text: "Nice. Sending a few more quickly now.", time: "10:12 AM", timestamp: Date.now() - 2820000, files: [] },
      { sender: 'placeholder-aemeath', text: "Check 4", time: "10:12 AM", timestamp: Date.now() - 2760000, files: [] },
      { sender: 'placeholder-aemeath', text: "Check 5", time: "10:12 AM", timestamp: Date.now() - 2700000, files: [] },
      { sender: 'placeholder-aemeath', text: "Check 6", time: "10:12 AM", timestamp: Date.now() - 2640000, files: [] },
      { sender: 'placeholder-aemeath', text: "Check 7", time: "10:12 AM", timestamp: Date.now() - 2580000, files: [] },
      { sender: 'me', text: "Rapid fire is working. No dropped frames.", time: "10:13 AM", timestamp: Date.now() - 2520000, files: [] },
      { sender: 'placeholder-aemeath', text: "What about multi-line manual breaks?\nLine 1\nLine 2\nLine 3", time: "10:14 AM", timestamp: Date.now() - 2460000, files: [] },
      { sender: 'me', text: "Handled perfectly.", time: "10:15 AM", timestamp: Date.now() - 2400000, files: [] },
      { sender: 'placeholder-aemeath', text: "Great. Let's keep going. We need at least 40 for a good test.", time: "10:16 AM", timestamp: Date.now() - 2340000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 15...", time: "10:17 AM", timestamp: Date.now() - 2280000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 16...", time: "10:18 AM", timestamp: Date.now() - 2220000, files: [] },
      { sender: 'me', text: "I'll contribute some too.", time: "10:19 AM", timestamp: Date.now() - 2160000, files: [] },
      { sender: 'me', text: "This is a really long message history test.", time: "10:20 AM", timestamp: Date.now() - 2100000, files: [] },
      { sender: 'me', text: "Testing the scroll to bottom behavior.", time: "10:21 AM", timestamp: Date.now() - 2040000, files: [] },
      { sender: 'placeholder-aemeath', text: "Does it auto-scroll when I send new ones?", time: "10:22 AM", timestamp: Date.now() - 1980000, files: [] },
      { sender: 'me', text: "If I'm already at the bottom, it should.", time: "10:23 AM", timestamp: Date.now() - 1920000, files: [] },
      { sender: 'placeholder-aemeath', text: "Test scroll 1", time: "10:24 AM", timestamp: Date.now() - 1860000, files: [] },
      { sender: 'placeholder-aemeath', text: "Test scroll 2", time: "10:25 AM", timestamp: Date.now() - 1800000, files: [] },
      { sender: 'placeholder-aemeath', text: "Test scroll 3", time: "10:26 AM", timestamp: Date.now() - 1740000, files: [] },
      { sender: 'me', text: "Yep, it's sticking to the bottom.", time: "10:27 AM", timestamp: Date.now() - 1680000, files: [] },
      { sender: 'placeholder-aemeath', text: "Fantastic. Almost there.", time: "10:28 AM", timestamp: Date.now() - 1620000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 30", time: "10:29 AM", timestamp: Date.now() - 1560000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 31", time: "10:30 AM", timestamp: Date.now() - 1500000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 32", time: "10:31 AM", timestamp: Date.now() - 1440000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 33", time: "10:32 AM", timestamp: Date.now() - 1380000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 34", time: "10:33 AM", timestamp: Date.now() - 1320000, files: [] },
      { sender: 'me', text: "Still smooth as butter.", time: "10:34 AM", timestamp: Date.now() - 1260000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 36", time: "10:35 AM", timestamp: Date.now() - 1200000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 37", time: "10:36 AM", timestamp: Date.now() - 1140000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 38", time: "10:37 AM", timestamp: Date.now() - 1080000, files: [] },
      { sender: 'placeholder-aemeath', text: "Message 39", time: "10:38 AM", timestamp: Date.now() - 1020000, files: [] },
      { sender: 'placeholder-aemeath', text: "And Message 40! We made it.", time: "10:39 AM", timestamp: Date.now() - 960000, files: [] },
      { sender: 'me', text: "Mission accomplished. The UI passed the test.", time: "10:40 AM", timestamp: Date.now() - 900000, files: [] }
    ],
    'placeholder-qiuyuan': [
      { sender: 'placeholder-qiuyuan', text: 'Hey! Ready to test the new file transfer speeds?', time: '09:00 AM', timestamp: Date.now() - 3600000 * 5, files: [] },
      { sender: 'me', text: 'Absolutely, let me know when you start the broadcast.', time: '09:02 AM', timestamp: Date.now() - 3600000 * 4.9, files: [] }
    ]
  },
  allUsers: [
    /*
    {
      id: 'placeholder-aemeath',
      name: 'Aemeath',
      username: 'aemeath_v',
      ip: '127.0.0.1',
      port: 1421,
      status: 'online',
      avatarGradient: 'from-pink-400 to-rose-500',
      profile_picture: 'https://images.unsplash.com/photo-1578632292335-df3abbb0d586?auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'placeholder-qiuyuan',
      name: 'Qiuyuan',
      username: 'qiuyuan_x',
      ip: '192.168.1.42',
      port: 1422,
      status: 'online',
      avatarGradient: 'from-blue-400 to-cyan-500',
      profile_picture: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'placeholder-lynae',
      name: 'Lynae',
      username: 'lynae_z',
      ip: '10.0.0.5',
      port: 1423,
      status: 'offline',
      avatarGradient: 'from-purple-400 to-violet-500',
      profile_picture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80'
    }
    */
  ],
  displayedUsers: [
    /*
    {
      id: 'placeholder-aemeath',
      name: 'Aemeath',
      username: 'aemeath_v',
      ip: '127.0.0.1',
      port: 1421,
      status: 'online',
      avatarGradient: 'from-pink-400 to-rose-500',
      profile_picture: 'https://images.unsplash.com/photo-1578632292335-df3abbb0d586?auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'placeholder-qiuyuan',
      name: 'Qiuyuan',
      username: 'qiuyuan_x',
      ip: '192.168.1.42',
      port: 1422,
      status: 'online',
      avatarGradient: 'from-blue-400 to-cyan-500',
      profile_picture: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'placeholder-lynae',
      name: 'Lynae',
      username: 'lynae_z',
      ip: '10.0.0.5',
      port: 1423,
      status: 'offline',
      avatarGradient: 'from-purple-400 to-violet-500',
      profile_picture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80'
    }
    */
  ],
  discoveredUsers: [],
  activeChatUserId: null,
  selectedFiles: [],
  unreadCounts: {
    'placeholder-aemeath': 1
  },
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
      localStorage.removeItem('currentUser');
      localStorage.removeItem('username');
      localStorage.removeItem('displayName');
      localStorage.removeItem('profilePicture');
      localStorage.removeItem('userId'); // Clear old random userId
      localStorage.removeItem('appUserId'); // Clear persistent user ID
      localStorage.removeItem('tempAuthPassword'); // Clear temporary password
      localStorage.removeItem('authPassword'); // Clear persistent password on logout
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
      return {
        ...state,
        messages: { ...state.messages, [userId]: [...existing, message] },
      };
    }

    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };

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
      const { userId, profilePicture } = action.payload;
      const updatedUsers = state.allUsers.map(u =>
        u.id === userId ? { ...u, profile_picture: profilePicture } : u
      );
      return { ...state, allUsers: updatedUsers, displayedUsers: updatedUsers };
    }

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
