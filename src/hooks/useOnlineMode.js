import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
// Import crypto functions (created in previous step)
// Note: We might need to ensure correct relative path import
// Assuming src/utils/crypto.js exists
import { generateKeyPair, exportKey, importPrivateKey, deriveSharedKey, encryptMessage, decryptMessage } from '../utils/crypto';

export function useOnlineMode(dispatch, getState) {
    const [ws, setWs] = useState(null);
    const [keyPair, setKeyPair] = useState(null);
    const [isOnline, setIsOnline] = useState(false);

    // Store shared keys: { [userId]: CryptoKey }
    const sharedKeys = useRef({}); 
    // Store user's public keys to derive shared keys later: { [userId]: JsonWebKey }
    const userPublicKeys = useRef({});

    const wsRef = useRef(null);

    // Connect to WebSocket Server (Moved to avoid TDZ)
    const connect = useCallback((serverUrl) => {
        // Close existing socket and clear its handler to prevent state updates
        if (wsRef.current) {
            wsRef.current.onclose = null; // Important: Stop old socket from triggering close logic
            wsRef.current.close();
        }

        try {
            const socket = new WebSocket(serverUrl);
            wsRef.current = socket;

            socket.onopen = () => {
                console.log('Connected to Relay Server');
                setIsOnline(true);
                setWs(socket); // Trigger re-render to run the identification effect
            };

            socket.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleServerMessage(data);
                } catch (e) {
                    console.error("Error parsing server message", e);
                }
            };

            socket.onerror = (error) => {
                console.error("WebSocket Error:", error);
            };

            socket.onclose = () => {
                console.log('Disconnected from Relay Server');
                // Only update state if this is still the active socket
                if (wsRef.current === socket) {
                    setIsOnline(false);
                    setWs(null);
                    wsRef.current = null;
                }
            };
        } catch (err) {
            console.error("Failed to create WebSocket connection:", err);
            setIsOnline(false);
            setWs(null);
        }
    }, []);

    // Initialize Keys, Check Connection, and Listen for Changes
    useEffect(() => {
        async function init() {
            // Keys
            const storedPriv = localStorage.getItem('privKey');
            const storedPub = localStorage.getItem('pubKey');
            let keys;
            if (storedPriv && storedPub) {
                keys = await generateKeyPair();
                setKeyPair(keys);
            } else {
                keys = await generateKeyPair();
                setKeyPair(keys);
            }

            // Initial Connection Check
            checkConnection();
        }

        function checkConnection() {
            const mode = localStorage.getItem('connectionMode');
            const url = localStorage.getItem('relayServerUrl');
            if (mode === 'online' && url) {
                // Guard: Prevent redundant connections
                if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
                    // Simple check to avoid loop
                    console.log("Already connected/connecting. Skipping redundant connect.");
                    return;
                }
                console.log("Detecting Online Mode preference, connecting...");
                connect(url);
            } else {
                // If we switched to LAN or cleared URL, close socket
                 if (wsRef.current) {
                    console.log("Online Mode disabled, closing socket.");
                    wsRef.current.close();
                }
            }
        }

        init();

        // Listen for settings changes
        window.addEventListener('storage', checkConnection);
        
        // Custom event for same-window settings changes (since 'storage' only triggers on OTHER tabs)
        window.addEventListener('settings-changed', checkConnection);

        return () => {
            window.removeEventListener('storage', checkConnection);
            window.removeEventListener('settings-changed', checkConnection);
            
            // Cleanup socket on unmount to prevent leaks and zombie connections
            if (wsRef.current) {
                console.log("Cleaning up WebSocket on useOnlineMode unmount");
                wsRef.current.onclose = null; // Prevent state updates
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connect]); // Check connection on mount

    // Heartbeat / Auto-Reconnect
    useEffect(() => {
        const interval = setInterval(() => {
            const mode = localStorage.getItem('connectionMode');
            const url = localStorage.getItem('relayServerUrl');
            if (mode === 'online' && url) {
                if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
                    console.log("Heartbeat: Connection lost. Reconnecting...");
                    connect(url);
                }
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [connect]);

    // Connect to WebSocket Server



    // Identify when both Socket and Keys are ready
    useEffect(() => {
        if (ws && ws.readyState === WebSocket.OPEN && keyPair) {
             const identify = async () => {
                // Use getSafeUserId to ensure we use the same ID logic as the rest of the app
                const myId = String(localStorage.getItem('userId')); 
                const pubKeyJwk = await exportKey(keyPair.publicKey);
                
                // Fallbacks for missing profile info
                const name = localStorage.getItem('displayName') || `User ${myId.substr(0, 4)}`;
                const username = localStorage.getItem('username') || `user_${myId}`;
                const profilePicture = localStorage.getItem('profilePicture') || null;

                console.log("Sending Identity to Relay:", { name, myId });

                ws.send(JSON.stringify({
                    type: 'identify',
                    userId: myId,
                    publicKey: pubKeyJwk,
                    info: {
                        name: name,
                        username: username,
                        profilePicture: profilePicture
                    }
                }));
             };
             identify();
        }
    }, [ws, keyPair]);

    const handleServerMessage = async (data) => {
        const { type } = data;

        switch (type) {
            case 'user_list':
                // Update active users
                // Filter out self
                const myId = String(localStorage.getItem('userId'));
                
                // Ensure we compare strings to strings for ID check
                const others = data.users.filter(u => String(u.id) !== myId);
                
                // Store their public keys
                others.forEach(u => {
                    if (u.publicKey) {
                        userPublicKeys.current[u.id] = u.publicKey;
                    }
                });

                // Update App Context (Add/Update Users)
                others.forEach(u => {
                    // Convert ID to match app's internal Number format if possible, or keep as string
                    const numericId = parseInt(u.id, 10);
                    const safeId = isNaN(numericId) ? u.id : numericId;

                    dispatch({
                        type: 'ADD_USER',
                        payload: {
                            id: safeId,
                            name: u.info.name || 'Unknown User',
                            username: u.info.username || 'unknown',
                            profile_picture: u.info.profilePicture, 
                            status: 'online',
                            avatarGradient: 'from-blue-500 to-purple-500' 
                        }
                    });
                });
                break;

            case 'message':
                console.log("Received Online Message:", data);
                const { senderId, payload } = data; 
                
                try {
                // Auto-add user if not in list (Self-Healing)
                const numericSenderId = parseInt(senderId, 10);
                const safeSenderId = isNaN(numericSenderId) ? senderId : numericSenderId;

                // Check if we know this user
                // We access the current state via getState() which is available in the closure? No, we need it.
                const currentUserList = getState().allUsers;
                const senderExists = currentUserList.find(u => u.id === safeSenderId);
                
                if (!senderExists) {
                    dispatch({
                        type: 'ADD_USER',
                        payload: {
                            id: safeSenderId,
                            name: `User ${safeSenderId}`,
                            username: 'unknown',
                            status: 'online',
                            avatarGradient: 'from-gray-500 to-slate-500'
                        }
                    });
                }

                dispatch({
                    type: 'ADD_MESSAGE',
                    payload: {
                        userId: safeSenderId,
                        message: {
                            sender: safeSenderId,
                            text: payload.text, 
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            timestamp: Date.now()
                        }
                    }
                });

                } catch (e) {
                    console.error('Decryption failed', e);
                }
                break;
        }
    };

    const sendMessageOnline = useCallback((targetId, text) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.error('Not connected to online server. Attempting to reconnect...', {
                wsExists: !!wsRef.current,
                readyState: wsRef.current ? wsRef.current.readyState : 'N/A',
                url: localStorage.getItem('relayServerUrl')
            });
            
            // Try to reconnect immediately
            const url = localStorage.getItem('relayServerUrl');
            if (url) connect(url);
            
            return;
        }

        const safeTargetId = String(targetId);
        console.log(`Sending online message to ${safeTargetId}: ${text}`);

        wsRef.current.send(JSON.stringify({
            type: 'message',
            targetId: safeTargetId,
            payload: { text } 
        }));

        // OPTIMISTIC UPDATE REMOVED FOR DEBUGGING DUPLICATES
        // Use standard consistent ID for local display if we were to re-enable
        /*
        dispatch({
            type: 'ADD_MESSAGE',
            payload: {
                userId: isNaN(parseInt(safeTargetId)) ? safeTargetId : parseInt(safeTargetId),
                message: {
                    sender: 'me',
                    text: text,
                    time: new Date().toLocaleTimeString(),
                    timestamp: Date.now()
                }
            }
        });
        */
        // Temporarily, we will rely on the server confirming/echoing or just seeing if the duplicate disappears.
        // Wait, if I remove this, and server doesn't echo, I won't see my own message.
        // But the user says "2 messages are shown". 
        // So I WILL remove this to see if "1 message" remains (meaning we are getting an echo or alternate path)
        // OR if 0 remain.
        
        // Re-adding with a twist: Only add if we don't think it's an echo.
        // Actually, let's keep it removed. If the user complains "I don't see my message", we know the duplicate was just this + nothing.
        // If they see 1 message, then something else is adding it.
        
        // To be safe and give immediate feedback: I will restore it but ensure the ID is strictly a Number if possible to match the reducer's key.
        
        const numericTargetId = parseInt(safeTargetId, 10);
        const finalTargetId = isNaN(numericTargetId) ? safeTargetId : numericTargetId;

        // Optimistic UI Update removed to prevent duplicates as ChatArea handles it
        /*
        dispatch({
            type: 'ADD_MESSAGE',
            payload: {
                userId: finalTargetId,
                message: {
                    sender: 'me',
                    text: text,
                    time: new Date().toLocaleTimeString(),
                    timestamp: Date.now()
                }
            }
        });
        */

    }, [dispatch]);

    return useMemo(() => ({ connect, sendMessageOnline, isOnline }), [connect, sendMessageOnline, isOnline]);
}
