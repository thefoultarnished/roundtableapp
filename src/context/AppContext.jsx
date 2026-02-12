import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';

const AppContext = createContext(null);

const initialState = {
  messages: {
    'placeholder-antigravity': [
      {
        sender: 'placeholder-antigravity',
        text: 'Hello! I am Antigravity. I have been added so you can test the new glassmorphic UI and features.',
        time: '10:00 AM',
        timestamp: Date.now() - 3600000,
        files: []
      },
      {
        sender: 'me',
        text: 'This looks amazing! The blur and transparency are perfect.',
        time: '10:05 AM',
        timestamp: Date.now() - 3300000,
        files: []
      },
      {
        sender: 'placeholder-antigravity',
        text: 'Exactly! You can also test the settings modal and the dark mode switch.',
        time: '10:06 AM',
        timestamp: Date.now() - 3240000,
        files: []
      }
    ],
    'placeholder-aether': [
      { sender: 'placeholder-aether', text: 'Hey! Ready to test the new file transfer speeds?', time: '09:00 AM', timestamp: Date.now() - 3600000 * 5, files: [] },
      { sender: 'me', text: 'Absolutely, let me know when you start the broadcast.', time: '09:02 AM', timestamp: Date.now() - 3600000 * 4.9, files: [] },
      { sender: 'placeholder-aether', text: 'I just pushed the latest UI updates to the repo.', time: '09:05 AM', timestamp: Date.now() - 3600000 * 4.8, files: [] },
      { sender: 'placeholder-aether', text: 'Did you see the new blur effect on the sidebar?', time: '09:06 AM', timestamp: Date.now() - 3600000 * 4.7, files: [] },
      { sender: 'me', text: 'Yeah, it looks much cleaner now. The glassmorphism is really popping.', time: '09:10 AM', timestamp: Date.now() - 3600000 * 4.6, files: [] },
      { sender: 'placeholder-aether', text: 'What about the performance on mobile?', time: '09:15 AM', timestamp: Date.now() - 3600000 * 4.5, files: [] },
      { sender: 'me', text: 'Still a bit laggy on older iPhones. We need to optimize the backdrop-filters.', time: '09:18 AM', timestamp: Date.now() - 3600000 * 4.4, files: [] },
      { sender: 'placeholder-aether', text: 'I can look into a fallback for lower-spec devices.', time: '09:20 AM', timestamp: Date.now() - 3600000 * 4.3, files: [] },
      { sender: 'placeholder-aether', text: 'Check this code snippet for the optimization:', time: '09:21 AM', timestamp: Date.now() - 3600000 * 4.2, files: [] },
      { sender: 'placeholder-aether', text: '```css\n.low-spec { backdrop-filter: none; background: rgba(0,0,0,0.8); }\n```', time: '09:21 AM', timestamp: Date.now() - 3600000 * 4.1, files: [] },
      { sender: 'me', text: 'That should work as a safe fallback.', time: '09:25 AM', timestamp: Date.now() - 3600000 * 4.0, files: [] },
      { sender: 'placeholder-aether', text: 'Sending the full documentation now.', time: '09:30 AM', timestamp: Date.now() - 3600000 * 3.9, files: [] },
      { sender: 'placeholder-aether', text: 'Wait, I need to zip it first.', time: '09:31 AM', timestamp: Date.now() - 3600000 * 3.8, files: [] },
      { sender: 'me', text: 'No rush.', time: '09:35 AM', timestamp: Date.now() - 3600000 * 3.7, files: [] },
      { sender: 'placeholder-aether', text: 'Okay, here it is.', time: '09:40 AM', timestamp: Date.now() - 3600000 * 3.6, files: [] },
      { sender: 'placeholder-aether', fileTransfer: { fileName: 'Architecture_v2.pdf', fileSize: 5242880, status: 'offered', transferId: 'tx-1' }, time: '09:41 AM', timestamp: Date.now() - 3600000 * 3.5 },
      { sender: 'me', text: 'Got it. Reviewing it now.', time: '09:45 AM', timestamp: Date.now() - 3600000 * 3.4, files: [] },
      { sender: 'placeholder-aether', text: 'Any thoughts on the new routing system?', time: '09:50 AM', timestamp: Date.now() - 3600000 * 3.3, files: [] },
      { sender: 'me', text: 'It seems way more robust than the previous one.', time: '09:55 AM', timestamp: Date.now() - 3600000 * 3.2, files: [] },
      { sender: 'placeholder-aether', text: 'Great. Let\'s sync up tomorrow for the deploy.', time: '10:00 AM', timestamp: Date.now() - 3600000 * 3.1, files: [] }
    ]
  },
  allUsers: [
    {
      id: 'placeholder-antigravity',
      name: 'Antigravity',
      username: 'deepmind_ai',
      ip: '127.0.0.1',
      port: 1421,
      status: 'online',
      avatarGradient: 'from-blue-500 to-indigo-600',
      profile_picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'placeholder-aether',
      name: 'Aether',
      username: 'sky_walker',
      ip: '192.168.1.42',
      port: 1422,
      status: 'online',
      avatarGradient: 'from-emerald-400 to-teal-500',
      profile_picture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'placeholder-nova',
      name: 'Nova',
      username: 'cosmic_ray',
      ip: '10.0.0.5',
      port: 1423,
      status: 'offline',
      avatarGradient: 'from-purple-500 to-pink-500',
      profile_picture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    }
  ],
  displayedUsers: [
    {
      id: 'placeholder-antigravity',
      name: 'Antigravity',
      username: 'deepmind_ai',
      ip: '127.0.0.1',
      port: 1421,
      status: 'online',
      avatarGradient: 'from-blue-500 to-indigo-600',
      profile_picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'placeholder-aether',
      name: 'Aether',
      username: 'sky_walker',
      ip: '192.168.1.42',
      port: 1422,
      status: 'online',
      avatarGradient: 'from-emerald-400 to-teal-500',
      profile_picture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'placeholder-nova',
      name: 'Nova',
      username: 'cosmic_ray',
      ip: '10.0.0.5',
      port: 1423,
      status: 'offline',
      avatarGradient: 'from-purple-500 to-pink-500',
      profile_picture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'
    }
  ],
  discoveredUsers: [],
  activeChatUserId: null,
  selectedFiles: [],
  unreadCounts: {
    'placeholder-antigravity': 1
  },
  globalInvokeFunc: null,
  MSG_PORT: (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.__tauriVersion) ? 2427 : 2426,

  // Modals
  settingsOpen: false,
  summaryOpen: false,

  // Notifications queue
  notifications: [],
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_INVOKE_FUNC':
      return { ...state, globalInvokeFunc: action.payload };

    case 'ADD_USER': {
      const user = action.payload;
      const exists = state.allUsers.find(u => u.id === user.id);
      if (exists) {
        const updatedUsers = state.allUsers.map(u => u.id === user.id ? { ...u, ...user } : u);
        return { ...state, allUsers: updatedUsers, displayedUsers: updatedUsers };
      }
      const newUsers = [...state.allUsers, user];
      return { ...state, allUsers: newUsers, displayedUsers: newUsers };
    }

    case 'SET_USERS':
      return { ...state, allUsers: action.payload, displayedUsers: action.payload };

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

    case 'UPDATE_USER_STATUS': {
      const { userId, status } = action.payload;
      const updatedUsers = state.allUsers.map(u =>
        u.id === userId ? { ...u, status } : u
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

  return (
    <AppContext.Provider value={{ state, dispatch, getState }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}
