import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';

const AppContext = createContext(null);

const initialState = {
  messages: {
    'placeholder-aemeath': [
      {
        sender: 'placeholder-aemeath',
        text: 'Hello! I am Aemeath. Ready to test the new roundness settings?',
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
      }
    ],
    'placeholder-qiuyuan': [
      { sender: 'placeholder-qiuyuan', text: 'Hey! Ready to test the new file transfer speeds?', time: '09:00 AM', timestamp: Date.now() - 3600000 * 5, files: [] },
      { sender: 'me', text: 'Absolutely, let me know when you start the broadcast.', time: '09:02 AM', timestamp: Date.now() - 3600000 * 4.9, files: [] }
    ]
  },
  allUsers: [
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
  ],
  displayedUsers: [
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
