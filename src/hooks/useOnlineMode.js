import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
// Import crypto functions (created in previous step)
// Note: We might need to ensure correct relative path import
// Assuming src/utils/crypto.js exists
import { isWindowFocused } from '../utils';
import { generateKeyPair, exportKey, importPrivateKey, importPublicKey, deriveSharedKey, encryptMessage, decryptMessage } from '../utils/crypto';

export function useOnlineMode(dispatch, getState) {
    const [ws, setWs] = useState(null);
    const [keyPair, setKeyPair] = useState(null);
    const [isOnline, setIsOnline] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    
    // Stable ID for the session (tab) - MUST be unique per tab to avoid server deduplicating valid separate sessions
    const clientSessionId = useRef(Math.random().toString(36).substr(2, 9) + Date.now().toString(36));

    // Store shared keys: { [userId]: CryptoKey }
    const sharedKeys = useRef({}); 
    // Store user's public keys to derive shared keys later: { [userId]: JsonWebKey }
    const userPublicKeys = useRef({});

    const wsRef = useRef(null);
    const pendingMessages = useRef([]); // [{targetId, text}]
    const handleServerMessageRef = useRef(null);

    // Connect to WebSocket Server (Moved to avoid TDZ)
    const connect = useCallback((serverUrl) => {
        console.log(`🔌 Attempting connection to: ${serverUrl}`);
        // Close existing socket and clear its handler to prevent state updates
        if (wsRef.current) {
            wsRef.current.onclose = null; // Important: Stop old socket from triggering close logic
            wsRef.current.close();
        }

        try {
            const socket = new WebSocket(serverUrl);
            wsRef.current = socket;

            socket.onopen = () => {
                console.log('✅ Connected to Relay Server');
                setIsOnline(true);
                setWs(socket); 
            };

            socket.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleServerMessageRef.current?.(data);
                } catch (e) {
                    console.error("Error parsing server message", e);
                }
            };

            socket.onerror = (error) => {
                console.error("❌ WebSocket Error:", error);
            };

            socket.onclose = (event) => {
                console.log(`⚠️ Disconnected from Relay Server (Code: ${event.code})`);
                // Only update state if this is still the active socket
                if (wsRef.current === socket) {
                    setIsOnline(false);
                    setWs(null);
                    wsRef.current = null;
                    
                    // Mark everyone as offline since we lost relay sync
                    const currentUsers = getState().allUsers;
                    currentUsers.forEach(u => {
                        dispatch({ type: 'UPDATE_USER_STATUS', payload: { userId: u.id, status: 'offline' } });
                    });
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

            try {
                if (storedPriv && storedPub) {
                    const privateKey = await importPrivateKey(JSON.parse(storedPriv));
                    const publicKey = await importPublicKey(JSON.parse(storedPub));
                    keys = { privateKey, publicKey };
                    console.log("Loaded E2EE Keys from Storage");
                } else {
                    throw new Error("Keys missing");
                }
            } catch (e) {
                console.log("Generating new E2EE Key Pair...");
                keys = await generateKeyPair();
                const privJwk = await exportKey(keys.privateKey);
                const pubJwk = await exportKey(keys.publicKey);
                localStorage.setItem('privKey', JSON.stringify(privJwk));
                localStorage.setItem('pubKey', JSON.stringify(pubJwk));
            }
            
            setKeyPair(keys);

            // Load cached peer keys
            const cachedKeys = localStorage.getItem('peerPublicKeys');
            if (cachedKeys) {
                try {
                    const parsed = JSON.parse(cachedKeys);
                    await Promise.all(Object.entries(parsed).map(async ([id, jwk]) => {
                        try {
                            const imported = await importPublicKey(jwk);
                            userPublicKeys.current[id] = imported;
                        } catch (e) { console.error(`Failed to import cached key for ${id}`); }
                    }));
                    console.log(`📂 Loaded ${Object.keys(userPublicKeys.current).length} peer keys from cache`);
                } catch (e) { console.error("Failed to parse cached peer keys"); }
            }

            setIsInitialized(true);
            checkConnection(true); // Pass true to indicate keys are ready
        }

        function checkConnection(keysAreReady = false) {
            const mode = localStorage.getItem('connectionMode') || 'online';
            // Default to localhost if not set, or the Oracle one if you prefer. 
            // Given the user is running 'sudo netstat ... 8080' locally, localhost is the safest bet for immediate success.
            let url = localStorage.getItem('relayServerUrl');
            
            if (!url) {
                url = 'ws://129.154.231.157:8080';
                console.log("⚠️ No relay URL found in storage, defaulting to Oracle VM:", url);
                // Optionally save it so settings UI reflects it? 
                // localStorage.setItem('relayServerUrl', url); 
            }
            
            if (mode === 'online' && url) {
                if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
                    return;
                }
                
                if (!keysAreReady && !keyPair) {
                     console.log("⏳ Keys not yet ready, delaying connection...");
                     return;
                }

                console.log("🚀 Keys ready, connecting to relay...");
                connect(url);
            } else {
                if (wsRef.current) {
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
            const mode = localStorage.getItem('connectionMode') || 'online';
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
    // Identify when both Socket and Keys are ready
    useEffect(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN || !keyPair) return;

        const identify = async () => {
            // Using ws directly instead of ref to ensure we use the TRIGGERING socket
            if (ws.readyState !== WebSocket.OPEN) return;
            
            // Use Username as the primary unique ID if available, fallback to random userId
            const myUsername = localStorage.getItem('username');
            const myId = myUsername && myUsername !== 'Anonymous' && myUsername !== 'RoundtableUser' 
                ? myUsername 
                : String(localStorage.getItem('userId')); 
            
            try {
                const pubKeyJwk = await exportKey(keyPair.publicKey);
                const name = localStorage.getItem('displayName') || myId;
                const profilePicture = localStorage.getItem('profilePicture') || null;

                console.log(`🔑 Identifying as [${myId}] on session [${clientSessionId.current}]`);

                ws.send(JSON.stringify({
                    type: 'identify',
                    userId: myId,
                    sessionId: clientSessionId.current, // Add persistent session tracking
                    publicKey: pubKeyJwk,
                    info: {
                        name: name,
                        username: myId,
                        profilePicture: profilePicture
                    }
                }));
            } catch (e) {
                console.error("Identity export failed", e);
            }
        };
        
        identify();
    }, [ws, keyPair, localStorage.getItem('displayName'), localStorage.getItem('username'), localStorage.getItem('profilePicture')]);

    const broadcastIdentity = useCallback(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && keyPair) {
            const myUsername = localStorage.getItem('username');
            const myId = myUsername && myUsername !== 'Anonymous' && myUsername !== 'RoundtableUser' 
                ? myUsername 
                : String(localStorage.getItem('userId')); 
            
            exportKey(keyPair.publicKey).then(pubKeyJwk => {
                const name = localStorage.getItem('displayName') || myId;
                console.log(`📣 Broadcasting Identity manually as [${myId}]...`);
                wsRef.current.send(JSON.stringify({
                    type: 'identify',
                    userId: myId,
                    sessionId: clientSessionId.current,
                    publicKey: pubKeyJwk,
                    info: {
                        name: name,
                        username: myId,
                        profilePicture: localStorage.getItem('profilePicture') || null
                    }
                }));
                console.log("📣 Manual Identity Broadcast Sent");
            });
        }
    }, [keyPair]);

    const handleServerMessage = async (data) => {
        const { type } = data;

        switch (type) {
            case 'user_connected': {
                const newUser = data.user;
                const myUn = localStorage.getItem('username');
                const myIdOnConnect = myUn && myUn !== 'Anonymous' && myUn !== 'RoundtableUser' 
                    ? myUn 
                    : String(localStorage.getItem('userId')); 

                if (newUser && String(newUser.id) !== String(myIdOnConnect) && newUser.publicKey) {
                    try {
                        const importedKey = await importPublicKey(newUser.publicKey);
                        userPublicKeys.current[newUser.id] = importedKey;
                        savePeerKey(newUser.id, newUser.publicKey);
                        // console.log(`📡 Captured Public Key for new user: ${newUser.id}`);
                        
                        // Add to Sidebar/Context
                        const numId = parseInt(newUser.id, 10);
                        const sId = isNaN(numId) ? newUser.id : numId;
                        console.log(`👤 Adding user to sidebar: ${sId} (${newUser.info.name}) [Session: ${newUser.sessionId}]`);
                        dispatch({
                            type: 'ADD_USER',
                            payload: {
                                id: sId,
                                sessionId: newUser.sessionId, // IMPORTANT: Used for client-side dedupe
                                name: newUser.info.name || 'Unknown User',
                                username: newUser.info.username || 'unknown',
                                profile_picture: newUser.info.profilePicture, 
                                status: 'online',
                                avatarGradient: 'from-blue-500 to-purple-500' 
                            }
                        });

                        processQueue(newUser.id);
                    } catch (e) {
                        console.error(`❌ CRITICAL: Failed to import key for ${newUser.id}`, e);
                    }
                }
                break;
            }

            case 'user_list': {
                // Filter out self
                const myUnList = localStorage.getItem('username');
                const myIdList = myUnList && myUnList !== 'Anonymous' && myUnList !== 'RoundtableUser' 
                    ? myUnList 
                    : String(localStorage.getItem('userId')); 
                
                const others = data.users.filter(u => String(u.id) !== String(myIdList));
                
                // Import and Store their public keys (Async)
                await Promise.all(others.map(async (u) => {
                    if (u.publicKey) {
                        try {
                            const importedKey = await importPublicKey(u.publicKey);
                            userPublicKeys.current[u.id] = importedKey;
                            savePeerKey(u.id, u.publicKey);
                            processQueue(u.id);
                        } catch (e) {
                            console.error(`❌ CRITICAL: Failed to import public key for ${u.id}`, e);
                        }
                    }
                }));

                // Update App Context (Full Sync)
                const userListForContext = others.map(u => {
                    const numericId = parseInt(u.id, 10);
                    const safeId = isNaN(numericId) ? u.id : numericId;
                    return {
                        id: safeId,
                        sessionId: u.sessionId, // IMPORTANT
                        name: u.info.name || 'Unknown User',
                        username: u.info.username || 'unknown',
                        profile_picture: u.info.profilePicture, 
                        status: 'online',
                        avatarGradient: 'from-blue-500 to-purple-500' 
                    };
                });

                dispatch({ type: 'SET_USERS', payload: userListForContext });
                console.log(`📡 Synced ${userListForContext.length} users from relay`);
                break;
            }

            case 'message':
                console.log("Received Online Message:", data);
                const { senderId, payload } = data; 
                
                try {
                    let finalText = "";

                    // Decrypt if encrypted
                    if (payload.encrypted && payload.iv && payload.cipher) {
                        const safeSenderId = String(senderId);
                        let sharedKey = sharedKeys.current[safeSenderId];
                        
                        // Try to derive key if missing
                        if (!sharedKey && userPublicKeys.current[safeSenderId] && keyPair) {
                             console.log(`Deriving shared key for sender ${safeSenderId}...`);
                             sharedKey = await deriveSharedKey(keyPair.privateKey, userPublicKeys.current[safeSenderId]);
                             sharedKeys.current[safeSenderId] = sharedKey;
                        }

                        if (sharedKey) {
                            try {
                                finalText = await decryptMessage(payload.iv, payload.cipher, sharedKey);
                            } catch (decErr) {
                                console.error("Decryption low-level error:", decErr);
                                finalText = "⚠️ Decryption Error";
                            }
                        } else {
                            finalText = "🔒 Encrypted Message (Missing Key)";
                            console.warn(`Missing shared key for ${safeSenderId}. Has PubKey: ${!!userPublicKeys.current[safeSenderId]}`);
                        }
                    } else {
                        // Plaintext fallback
                        finalText = payload.text || "";
                    }

                    // Auto-add user if not in list (Self-Healing)
                    const numericSenderId = parseInt(senderId, 10);
                    const safeSenderId = isNaN(numericSenderId) ? senderId : numericSenderId;

                    // Check if we know this user
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
                                text: finalText, 
                                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                timestamp: Date.now()
                            }
                        }
                    });

                    // Check unread count logic
                    const currentActive = getState().activeChatUserId;
                    const windowFocused = await isWindowFocused();

                    if (currentActive !== safeSenderId || !windowFocused) {
                        dispatch({
                            type: 'INCREMENT_UNREAD',
                            payload: safeSenderId
                        });
                    }

                } catch (e) {
                    console.error('Message handling failed', e);
                }
                break;
        }
    };

    handleServerMessageRef.current = handleServerMessage;

    const savePeerKey = (id, jwk) => {
        try {
            const cached = JSON.parse(localStorage.getItem('peerPublicKeys') || '{}');
            cached[id] = jwk;
            localStorage.setItem('peerPublicKeys', JSON.stringify(cached));
        } catch (e) { console.error("Failed to cache peer key", e); }
    };

    const processQueue = (targetId) => {
        const remaining = [];
        pendingMessages.current.forEach(msg => {
            if (msg.targetId === targetId) {
                console.log(`✉️ Retrying queued message for ${targetId}...`);
                sendMessageOnline(msg.targetId, msg.text);
            } else {
                remaining.push(msg);
            }
        });
        pendingMessages.current = remaining;
    };

    const sendMessageOnline = useCallback(async (targetId, text) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.warn('❌ Cannot send: Not connected. Queuing message.');
            pendingMessages.current.push({ targetId, text });
            return;
        }

        const safeTargetId = String(targetId);
        let payload = null;

        try {
            const peerKey = userPublicKeys.current[safeTargetId];
            if (peerKey && keyPair) {
                let sharedKey = sharedKeys.current[safeTargetId];
                if (!sharedKey) {
                    sharedKey = await deriveSharedKey(keyPair.privateKey, peerKey);
                    sharedKeys.current[safeTargetId] = sharedKey;
                }
                
                if (sharedKey) {
                    const encrypted = await encryptMessage(text, sharedKey);
                    payload = { 
                        iv: encrypted.iv, 
                        cipher: encrypted.cipher, 
                        encrypted: true,
                        text: "🔒 Encrypted Message" 
                    };
                }
            } else {
                console.warn(`🔐 Key missing for ${safeTargetId}. Queuing message until key arrives...`);
                pendingMessages.current.push({ targetId, text });
                return;
            }
        } catch (e) {
            console.error("❌ E2EE Encryption Failed Loudly:", e);
            return; // Don't send plaintext
        }

        if (payload) {
            wsRef.current.send(JSON.stringify({
                type: 'message',
                targetId: safeTargetId,
                payload: payload
            }));
            
            const numericTargetId = parseInt(safeTargetId, 10);
            const finalTargetId = isNaN(numericTargetId) ? safeTargetId : numericTargetId;

            dispatch({
                type: 'ADD_MESSAGE',
                payload: {
                    userId: finalTargetId,
                    message: {
                        sender: 'me',
                        text: text,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        timestamp: Date.now()
                    }
                }
            });
        }
    }, [dispatch, keyPair]);

    return useMemo(() => ({ connect, sendMessageOnline, isOnline, broadcastIdentity }), [connect, sendMessageOnline, isOnline, broadcastIdentity]);
}
