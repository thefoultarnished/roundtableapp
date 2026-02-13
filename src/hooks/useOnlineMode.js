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

    // Store shared keys: { [userId]: CryptoKey }
    const sharedKeys = useRef({}); 
    // Store user's public keys to derive shared keys later: { [userId]: JsonWebKey }
    const userPublicKeys = useRef({});

    const wsRef = useRef(null);
    const pendingMessages = useRef([]); // [{targetId, text}]

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

            // Initial Connection Check
            checkConnection();
        }

        function checkConnection() {
            const mode = localStorage.getItem('connectionMode') || 'online';
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
    useEffect(() => {
        if (ws && ws.readyState === WebSocket.OPEN && keyPair) {
             const identify = async () => {
                // Use Username as the primary unique ID if available, fallback to random userId
                const myUsername = localStorage.getItem('username');
                const myId = myUsername && myUsername !== 'Anonymous' && myUsername !== 'RoundtableUser' 
                    ? myUsername 
                    : String(localStorage.getItem('userId')); 
                
                const pubKeyJwk = await exportKey(keyPair.publicKey);
                const name = localStorage.getItem('displayName') || myId;
                const profilePicture = localStorage.getItem('profilePicture') || null;

                console.log(`🔑 Identifying as [${myId}] and sharing Public Key`);

                ws.send(JSON.stringify({
                    type: 'identify',
                    userId: myId,
                    publicKey: pubKeyJwk,
                    info: {
                        name: name,
                        username: myId,
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
                        console.log(`📡 Captured Public Key for new user: ${newUser.id}`);
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

    return useMemo(() => ({ connect, sendMessageOnline, isOnline }), [connect, sendMessageOnline, isOnline]);
}
