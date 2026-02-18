import { useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import * as utils from '../utils';

const avatarGradients = [
  'from-teal-400 to-blue-500',
  'from-pink-500 to-purple-600',
  'from-yellow-400 to-orange-500',
  'from-green-400 to-emerald-500',
  'from-red-400 to-pink-500',
];

export function useTauriIntegration() {
  const { state, dispatch, getState } = useAppContext();
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const getStateRef = useRef(getState);
  getStateRef.current = getState;

  // Load saved users on mount
  useEffect(() => {
    const savedUsersJSON = localStorage.getItem('allUsers') || '';
    if (savedUsersJSON) {
      try {
        const savedUsers = JSON.parse(savedUsersJSON);
        if (Array.isArray(savedUsers)) {
          const loaded = savedUsers.map(user => ({ ...user, status: 'offline' }));
          dispatchRef.current({ type: 'SET_USERS', payload: loaded });
        }
      } catch (e) {
        console.error('Failed to parse saved user list', e);
      }
    }

    // Generate user ID if needed - ONLY on first install
    if (!localStorage.getItem('userId') || isNaN(parseInt(localStorage.getItem('userId'), 10))) {
      const newId = Math.floor(Math.random() * 100000000);
      localStorage.setItem('userId', newId);
      // DON'T set default username - keep null until user logs in
      // This prevents accidental key derivation with wrong username
    }

    // Load saved font scale
    const savedFontSize = localStorage.getItem('fontSizeScale') || 100;
    document.documentElement.style.setProperty('--font-size-scale', savedFontSize / 100);

    // Load saved fonts
    const savedAppFont = localStorage.getItem('appFont');
    const savedChatFont = localStorage.getItem('chatFont');
    if (savedAppFont) document.documentElement.style.setProperty('--app-font', savedAppFont);
    if (savedChatFont) document.documentElement.style.setProperty('--chat-font', savedChatFont);

    // Load saved blur radius
    const savedBlur = localStorage.getItem('glassBlur') || '24';
    document.documentElement.style.setProperty('--glass-blur', savedBlur + 'px');
  }, []);

  // Setup Tauri integration
  useEffect(() => {
    if (!window.__TAURI__) {
      console.warn('Tauri not detected - running in browser mode');
      // Fallback for browser mode: dispatch SET_APP_READY after a short delay
      setTimeout(() => {
        dispatchRef.current({ type: 'SET_APP_READY' });
      }, 500);
      return;
    }

    console.log('Tauri detected, setting up integration');
    let invokeFunc = null;

    if (window.__TAURI__.invoke) {
      invokeFunc = window.__TAURI__.invoke;
    } else if (window.__TAURI__.tauri?.invoke) {
      invokeFunc = window.__TAURI__.tauri.invoke;
    } else if (window.tauriInvoke) {
      invokeFunc = window.tauriInvoke;
    }

    if (invokeFunc) {
      dispatchRef.current({ type: 'SET_INVOKE_FUNC', payload: invokeFunc });
    }

    const cleanups = [];

    const setupListeners = async () => {
      try {
        // User online event
        const unlisten1 = await window.__TAURI__.event.listen('user-online', (event) => {
          console.log('User online event:', event);
          const user = event.payload || event.data;
          handleAddDiscoveredUser(user);
        });
        cleanups.push(unlisten1);

        // User offline event
        const unlisten2 = await window.__TAURI__.event.listen('user-offline', (event) => {
          const userId = (event.payload || event.data)?.id;
          if (userId) {
            dispatchRef.current({ type: 'UPDATE_USER_STATUS', payload: { userId, status: 'offline' } });
            saveUserList();
          }
        });
        cleanups.push(unlisten2);

        // Message received event
        const unlisten3 = await window.__TAURI__.event.listen('message-received', async (event) => {
          console.log('Message received event:', event);
          const data = event.payload || event.data;
          await handleReceivedMessage(data);
        });
        cleanups.push(unlisten3);

        // Discovery query received
        const unlisten4 = await window.__TAURI__.event.listen('discovery-query-received', () => {
          console.log('Received discovery query, responding with our presence.');
          announcePresenceImpl(invokeFunc);
        });
        cleanups.push(unlisten4);

        // File offer received
        const unlisten5 = await window.__TAURI__.event.listen('file-offer-received', (event) => {
          const offerDetails = event.payload;
          console.log("File Offer Received:", offerDetails);
          handleAddDiscoveredUser(offerDetails.sender);

          const fileOfferMessage = {
            sender: offerDetails.sender.id,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(),
            fileTransfer: {
              fileName: offerDetails.fileName,
              fileSize: offerDetails.fileSize,
              transferId: offerDetails.transferId,
              status: 'incoming',
            },
          };

          dispatchRef.current({ type: 'ADD_MESSAGE', payload: { userId: offerDetails.sender.id, message: fileOfferMessage } });

          const currentState = getStateRef.current();
          if (currentState.activeChatUserId !== offerDetails.sender.id) {
            dispatchRef.current({ type: 'INCREMENT_UNREAD', payload: offerDetails.sender.id });
            if (window.__showBeautifulNotification) {
              window.__showBeautifulNotification(
                offerDetails.sender.name,
                `📎 Wants to send you: ${offerDetails.fileName} (${(offerDetails.fileSize / 1024 / 1024).toFixed(2)} MB)`
              );
            }
          }
        });
        cleanups.push(unlisten5);

        // File transfer events
        const unlisten6 = await window.__TAURI__.event.listen('file-transfer-accepted', (event) => {
          dispatchRef.current({ type: 'UPDATE_FILE_TRANSFER_STATUS', payload: { transferId: event.payload.transferId, status: 'accepted' } });
        });
        cleanups.push(unlisten6);

        const unlisten7 = await window.__TAURI__.event.listen('file-transfer-progress', (event) => {
          dispatchRef.current({ type: 'UPDATE_FILE_TRANSFER_STATUS', payload: { transferId: event.payload.transferId, progress: event.payload.progress } });
        });
        cleanups.push(unlisten7);

        const unlisten8 = await window.__TAURI__.event.listen('file-transfer-complete', (event) => {
          dispatchRef.current({ type: 'UPDATE_FILE_TRANSFER_STATUS', payload: { transferId: event.payload.transferId, status: 'completed' } });
        });
        cleanups.push(unlisten8);

        const unlisten9 = await window.__TAURI__.event.listen('file-transfer-error', (event) => {
          dispatchRef.current({ type: 'UPDATE_FILE_TRANSFER_STATUS', payload: { transferId: event.payload.transferId, status: 'failed' } });
        });
        cleanups.push(unlisten9);

        const unlisten10 = await window.__TAURI__.event.listen('file-transfer-ready', (event) => {
          const { transferId, port, senderIp } = event.payload;
          if (transferId && port && senderIp && invokeFunc) {
            invokeFunc('download_file', { transferId, senderIp, port }).catch(err => console.error('Download error:', err));
          }
        });
        cleanups.push(unlisten10);

        // Initial broadcast
        if (invokeFunc) {
          invokeFunc('broadcast_discovery_query');
        }
        setTimeout(() => {
          announcePresenceImpl(invokeFunc);
          // Dispatch SET_APP_READY to fade out splash screen after Tauri setup completes
          dispatchRef.current({ type: 'SET_APP_READY' });
        }, 1000);

        console.log('Tauri event listeners set up successfully');

      } catch (error) {
        console.error('Error setting up Tauri integration:', error);
      }
    };

    setupListeners();

    // Periodic discovery
    const discoveryInterval = setInterval(() => {
      if (localStorage.getItem('connectionMode') !== 'online') {
        announcePresenceImpl(invokeFunc);
      }
    }, 15000);

    // User status monitor
    const statusMonitor = setInterval(() => {
      const currentState = getStateRef.current();
      const now = Date.now();
      let changed = false;
      currentState.allUsers.forEach(user => {
        if (user.status === 'online' && user.lastSeen && (now - user.lastSeen > 60000)) {
          dispatchRef.current({ type: 'UPDATE_USER_STATUS', payload: { userId: user.id, status: 'offline' } });
          changed = true;
        }
      });
      if (changed) saveUserList();
    }, 10000);

    // Log session start
    if (invokeFunc) {
      const logSession = async () => {
        const userName = localStorage.getItem('displayName') || 'Roundtable User';
        const userIp = await utils.getUserIP();
        try {
          await invokeFunc('log_session_start', { userName, userIp });
        } catch (e) {
          console.error('Failed to log session start:', e);
        }
      };
      logSession();
    }

    return () => {
      cleanups.forEach(fn => fn && fn());
      clearInterval(discoveryInterval);
      clearInterval(statusMonitor);
    };
  }, []);

  // Helper functions
  function handleAddDiscoveredUser(user) {
    if (!user || !user.id) return;
    const myUserId = utils.getSafeUserId();
    if (user.id === myUserId) return;

    const currentState = getStateRef.current();
    const MSG_PORT = currentState.MSG_PORT;
    if (!user.port || user.port === 0) user.port = MSG_PORT;

    user.lastSeen = Date.now();
    user.status = 'online';

    const existing = currentState.allUsers.find(u => u.id === user.id);
    if (!existing) {
      user.avatarGradient = avatarGradients[Math.floor(Math.random() * avatarGradients.length)];
    }

    dispatchRef.current({ type: 'ADD_USER', payload: user });
    saveUserList();
  }

  async function handleReceivedMessage(messageData) {
    const myUserId = utils.getSafeUserId();
    if (messageData.sender_id === myUserId) return;
    if (messageData.target_id && messageData.target_id !== myUserId && messageData.target_id !== 0) return;

    const currentState = getStateRef.current();
    let sender = currentState.allUsers.find(u => u.id === messageData.sender_id);

    if (!sender) {
      sender = {
        id: messageData.sender_id,
        name: messageData.sender || 'Unknown User',
        ip: messageData.ip,
        port: messageData.sender_port || currentState.MSG_PORT,
        status: 'online',
        avatarGradient: 'from-gray-500 to-gray-600',
      };
      handleAddDiscoveredUser(sender);
    } else {
      dispatchRef.current({ type: 'UPDATE_USER_STATUS', payload: { userId: sender.id, status: 'online' } });
    }

    const newMessage = {
      sender: sender.id,
      text: messageData.content,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: messageData.timestamp * 1000,
      files: [],
    };

    dispatchRef.current({ type: 'ADD_MESSAGE', payload: { userId: sender.id, message: newMessage } });

    const windowIsFocused = await utils.isWindowFocused();
    if (currentState.activeChatUserId !== sender.id || !windowIsFocused) {
      dispatchRef.current({ type: 'INCREMENT_UNREAD', payload: sender.id });
      if (window.__showBeautifulNotification) {
        window.__showBeautifulNotification(sender.name, messageData.content);
      }
    }
  }

  function saveUserList() {
    const currentState = getStateRef.current();
    try {
      localStorage.setItem('allUsers', JSON.stringify(currentState.allUsers));
    } catch (e) {
      console.error('Failed to save user list', e);
    }
  }

  function announcePresenceImpl(invokeFunc) {
    if (!invokeFunc) return;
    try {
      const myUserId = utils.getSafeUserId();
      const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
      const myUsername = localStorage.getItem('username') || 'Anonymous';
      const myProfilePicture = localStorage.getItem('profilePicture') || null;

      invokeFunc('broadcast_user_presence', {
        userId: myUserId,
        name: myDisplayName,
        username: myUsername,
        profilePicture: myProfilePicture,
      }).catch(err => {
        console.error('Error announcing presence:', err);
      });
    } catch (e) {
      console.error('Exception in announcePresence:', e);
    }
  }
}
