import { useCallback, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import * as utils from '../utils';

export function useNetwork() {
  const { state, dispatch, getState, online } = useAppContext();
  const getStateRef = useRef(getState);
  getStateRef.current = getState;

  const { connect, sendMessageOnline, isOnline } = online;

  const sendMessage = useCallback((message, targetIp, targetPort) => {
    const currentState = getStateRef.current();
    const mode = localStorage.getItem('connectionMode');

    // --- ONLINE MODE ---
    if (mode === 'online') {
        if (!isOnline) {
            console.warn("Offline. Cannot send message.");
            return;
        }
        sendMessageOnline(String(currentState.activeChatUserId), message);
        return;
    }

    // --- LAN MODE (Existing Logic) ---
    let invokeFunc = currentState.globalInvokeFunc;

    if (!invokeFunc) {
      if (window.__TAURI__?.invoke) invokeFunc = window.__TAURI__.invoke;
      else if (window.__TAURI__?.tauri?.invoke) invokeFunc = window.__TAURI__.tauri.invoke;
      else if (window.tauriInvoke) invokeFunc = window.tauriInvoke;
    }

    if (!invokeFunc) {
      console.error('Could not find invoke function');
      return;
    }

    const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
    const myUserId = utils.getSafeUserId();

    const payload = {
      message,
      targetIp,
      senderName: myDisplayName,
      senderId: myUserId,
      targetId: currentState.activeChatUserId,
      targetPort,
      senderPort: parseInt(localStorage.getItem('port') || currentState.MSG_PORT, 10),
    };

    console.log('Invoking send_message with:', payload);

    invokeFunc('send_message', payload)
      .then((result) => {
        console.log('Message sent successfully:', result);
      })
      .catch((err) => {
        console.error('Error sending message:', err);
      });
  }, [isOnline, sendMessageOnline]);

  const announcePresence = useCallback(() => {
    const currentState = getStateRef.current();
    let invokeFunc = currentState.globalInvokeFunc;

    if (!invokeFunc) {
      if (window.__TAURI__?.invoke) invokeFunc = window.__TAURI__.invoke;
      else if (window.__TAURI__?.tauri?.invoke) invokeFunc = window.__TAURI__.tauri.invoke;
      else if (window.tauriInvoke) invokeFunc = window.tauriInvoke;
    }

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
      }).catch(err => console.error('Error announcing presence:', err));
    } catch (e) {
      console.error('Exception in announcePresence:', e);
    }
  }, []);

  const initiateFileOffer = useCallback((file, targetUser) => {
    const currentState = getStateRef.current();
    const invokeFunc = currentState.globalInvokeFunc;
    if (!invokeFunc) return;

    const transferId = `${utils.getSafeUserId()}-${targetUser.id}-${Date.now()}-${Math.random()}`;
    const myUserId = utils.getSafeUserId();
    const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
    const myUsername = localStorage.getItem('username') || 'Anonymous';
    const myProfilePicture = localStorage.getItem('profilePicture') || null;

    if (!file.path) {
      console.error('File path is missing for:', file.name);
      return;
    }

    const fileOfferMessage = {
      sender: 'me',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      fileTransfer: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        transferId,
        status: 'offered',
      },
    };

    dispatch({ type: 'ADD_MESSAGE', payload: { userId: currentState.activeChatUserId, message: fileOfferMessage } });

    invokeFunc('initiate_file_offer', {
      targetId: targetUser.id,
      targetIp: targetUser.ip,
      targetPort: targetUser.port,
      transferId,
      fileName: file.name,
      fileSize: file.size,
      filePath: file.path,
      senderId: myUserId,
      senderName: myDisplayName,
      senderUsername: myUsername,
      senderProfilePicture: myProfilePicture,
    }).catch(err => console.error('Error initiating file offer:', err));
  }, [dispatch]);

  return { sendMessage, announcePresence, initiateFileOffer };
}
