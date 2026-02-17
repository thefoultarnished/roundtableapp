import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
// Import crypto functions (created in previous step)
// Note: We might need to ensure correct relative path import
// Assuming src/utils/crypto.js exists
import { isWindowFocused } from '../utils';
import { generateKeyPair, exportKey, importPrivateKey, importPublicKey, deriveSharedKey, encryptMessage, decryptMessage, deriveKeyPairFromPassword } from '../utils/crypto';
import { setCachedProfilePic } from '../utils/profilePictureCache';
import { saveMessage as saveEncryptedMessage } from '../utils/indexedDB';
import { cacheProfilePictureBlob, clearAllProfilePictureBlobsWithRevoke } from '../utils/profilePictureBlobCache';
import { blobUrlManager } from '../utils/blobUrlManager';

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
    const authPasswordRef = useRef(null); // Temporary storage for password during signup

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
            console.log("🔑 CLAUDE: init() function CALLED");
            // Derive deterministic keys from password
            const storedPassword = localStorage.getItem('authPassword');
            const username = localStorage.getItem('username');
            let keys;

            console.log(`🔑 CLAUDE: Checking credentials: username=${username}, password=${storedPassword ? 'exists' : 'null'}`);

            if (!storedPassword || !username) {
                // No login yet - can't initialize keys, but still need to connect to relay
                console.log("⏸️  No credentials available, skipping key initialization");
                console.log(`Debug: Username=${username}, Password=${storedPassword ? '***' : 'null'}`);
                setIsInitialized(true);
                checkConnection(false); // Connect to relay even without keys
                return;
            }

            try {
                console.log(`🔑 CLAUDE: ===== INITIAL KEY DERIVATION START =====`);
                console.log(`🔑 CLAUDE: username variable = "${username}"`);
                console.log(`🔑 CLAUDE: Source = localStorage.getItem('username')`);
                console.log(`🔑 Starting key derivation for user: ${username}`);
                // Derive deterministic keys from username + password
                keys = await deriveKeyPairFromPassword(username, storedPassword);
                console.log("✅ Derived deterministic keys from password");

                // Store keys namespaced by username - use ONLY username variable for consistency
                const pubJwk = await exportKey(keys.publicKey);
                const privJwk = await exportKey(keys.privateKey);
                const keyStorageKey = `keys_${username}`;
                console.log(`🔑 CLAUDE: keyStorageKey = "${keyStorageKey}"`);
                console.log(`🔑 CLAUDE: Storing to localStorage["${keyStorageKey}_pub"] and localStorage["${keyStorageKey}_priv"]`);
                localStorage.setItem(`${keyStorageKey}_pub`, JSON.stringify(pubJwk));
                localStorage.setItem(`${keyStorageKey}_priv`, JSON.stringify(privJwk));
                console.log(`💾 Stored keys with key: ${keyStorageKey}`);
                console.log(`🔑 CLAUDE: Public Key JWK = ${JSON.stringify(pubJwk)}`);
                console.log(`🔑 CLAUDE: Private Key JWK = ${JSON.stringify(privJwk)}`);
                console.log(`🔑 CLAUDE: ===== INITIAL KEY DERIVATION END =====`);

                // Also update legacy global keys for now (backward compat) but they are dangerous
                // localStorage.setItem('pubKey', JSON.stringify(pubJwk)); 
                // localStorage.setItem('privKey', JSON.stringify(privJwk));

            } catch (e) {
                console.error("❌ CRITICAL: Failed to derive keys from password:", e);
                console.error(e.stack); // Print full stack trace
                alert("Failed to generate encryption keys: " + e.message);
                setIsInitialized(true);
                return;
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

                console.log("🚀 Connecting to relay...");
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
    useEffect(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN || !keyPair) {
            console.log('⏸️  Not ready to identify:', { hasWs: !!ws, wsOpen: ws?.readyState === WebSocket.OPEN, hasKeyPair: !!keyPair });
            return;
        }

        const identify = async () => {
            // Using ws directly instead of ref to ensure we use the TRIGGERING socket
            if (ws.readyState !== WebSocket.OPEN) return;

            // Use username as the unique ID - check both sources
            const myUsername = localStorage.getItem('username') || getState().currentUser?.username;

            // DON'T identify if not logged in (no username set)
            if (!myUsername || myUsername === 'Anonymous' || myUsername === 'RoundtableUser') {
                console.log('⏸️  Invalid username detected, logging out...');
                dispatch({ type: 'LOGOUT' });
                return;
            }

            try {
                const pubKeyJwk = await exportKey(keyPair.publicKey);
                const name = localStorage.getItem('displayName') || myUsername;

                console.log(`🔑 Identifying as [${myUsername}] on session [${clientSessionId.current}]`);

                // Get password from ref or localStorage
                // Use 'authPassword' for persistent session, or 'tempAuthPassword' for backward compatibility
                let password = authPasswordRef.current ||
                              localStorage.getItem('authPassword') ||
                              localStorage.getItem('tempAuthPassword');

                ws.send(JSON.stringify({
                    type: 'identify',
                    userId: myUsername,  // Use username as ID
                    sessionId: clientSessionId.current,
                    publicKey: pubKeyJwk,
                    password: password, // Include password for signup/initial login
                    info: {
                        name: name,
                        username: myUsername
                    }
                }));

                // Clear temporary password after sending (but keep authPassword for session persistence)
                localStorage.removeItem('tempAuthPassword');
                // Don't clear authPasswordRef immediately - it might be needed for reconnect
                setTimeout(() => {
                    authPasswordRef.current = null;
                }, 5000);
            } catch (e) {
                console.error("Identity export failed", e);
            }
        };

        identify();
    }, [ws, keyPair]);

    const sendIdentifyWithPassword = useCallback(async () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.warn('❌ Cannot send identify: WebSocket not ready');
            return;
        }

        const myUsername = localStorage.getItem('username');
        const storedPassword = localStorage.getItem('authPassword');

        if (!myUsername || !storedPassword) {
            console.warn('❌ No username or password found');
            return;
        }

        let currentKeyPair = keyPair;

        // If keyPair doesn't exist, derive it from password
        if (!currentKeyPair) {
            console.log(`⏳ KeyPair not ready, deriving from password for [${myUsername}]...`);
            try {
                console.log(`🔑 CLAUDE: ===== ON-DEMAND KEY DERIVATION START =====`);
                console.log(`🔑 CLAUDE: myUsername variable = "${myUsername}"`);
                console.log(`🔑 CLAUDE: Source = localStorage.getItem('username') || getState().currentUser?.username`);
                currentKeyPair = await deriveKeyPairFromPassword(myUsername, storedPassword);
                setKeyPair(currentKeyPair);
                console.log("✅ Derived keys on-demand for identify");

                 // CRITICAL FIX: Persist these keys so they are available on reload/settings
                 const pubJwk = await exportKey(currentKeyPair.publicKey);
                 const privJwk = await exportKey(currentKeyPair.privateKey);
                 const keyStorageKey = `keys_${myUsername}`;
                 console.log(`🔑 CLAUDE: keyStorageKey = "${keyStorageKey}"`);
                 console.log(`🔑 CLAUDE: Storing to localStorage["${keyStorageKey}_pub"] and localStorage["${keyStorageKey}_priv"]`);
                 localStorage.setItem(`${keyStorageKey}_pub`, JSON.stringify(pubJwk));
                 localStorage.setItem(`${keyStorageKey}_priv`, JSON.stringify(privJwk));
                 console.log(`💾 Saved on-demand keys for ${myUsername} to localStorage (key: ${keyStorageKey})`);
                 console.log(`🔑 CLAUDE: Public Key JWK = ${JSON.stringify(pubJwk)}`);
                 console.log(`🔑 CLAUDE: Private Key JWK = ${JSON.stringify(privJwk)}`);
                 console.log(`🔑 CLAUDE: ===== ON-DEMAND KEY DERIVATION END =====`);

            } catch (e) {
                console.error('❌ Failed to derive keys on-demand:', e);
                return;
            }
        }

        try {
            const pubKeyJwk = await exportKey(currentKeyPair.publicKey);
            const name = localStorage.getItem('displayName') || myUsername;
            const password = authPasswordRef.current || storedPassword;

            console.log(`🔑 Sending identify with password for [${myUsername}]`);

            wsRef.current.send(JSON.stringify({
                type: 'identify',
                userId: myUsername,
                sessionId: clientSessionId.current,
                publicKey: pubKeyJwk,
                password: password,
                info: {
                    name: name,
                    username: myUsername
                }
            }));

            console.log(`✅ Identify sent with password`);
        } catch (e) {
            console.error('❌ Failed to send identify:', e);
        }
    }, [keyPair]);

    const broadcastIdentity = useCallback(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && keyPair) {
            const myUsername = localStorage.getItem('username');

            // Get or create ONE persistent user ID for the entire app
            let myId = localStorage.getItem('username');
            if (!myId) {
                myId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                localStorage.setItem('username', myId);
            }

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
                        username: myUsername
                        // Profile picture is handled separately by sendProfilePictureUpdate
                    }
                }));
                console.log("📣 Manual Identity Broadcast Sent");
            });
        }
    }, [keyPair]);

    const requestChatHistory = useCallback((targetUserId, limit = 50, offset = 0) => {
        console.log(`🔍 requestChatHistory called with targetUserId: ${targetUserId}`);
        console.log(`📡 WS Status: ${wsRef.current ? wsRef.current.readyState : 'null'} (OPEN=${WebSocket.OPEN})`);

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.warn('❌ Cannot request history: Not connected to server');
            return;
        }

        // Get persistent user ID (global to app)
        let myId = localStorage.getItem('username');
        if (!myId) {
            console.warn(`⚠️ No persistent ID found`);
            return;
        }

        console.log(`📜 Requesting chat history with ${targetUserId}... (myId: ${myId})`);
        wsRef.current.send(JSON.stringify({
            type: 'get_chat_history',
            userId: myId,
            otherUserId: String(targetUserId),
            limit: limit,
            offset: offset
        }));
    }, []);

    // Debounce timer for read receipts
    const readReceiptDebounceRef = useRef({});

    const sendReadReceipts = useCallback((targetUserId) => {
        // Send read receipt for the highest message from the other user (covers all messages up to that point)
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.warn('❌ Cannot send read receipts: Not connected');
            return;
        }

        const currentMessages = getState().messages[targetUserId] || [];

        // Find the last message from the other user
        const lastMessageFromOther = currentMessages
            .slice()
            .reverse()
            .find(msg => msg.sender !== 'me');

        if (lastMessageFromOther?.messageId) {
            console.log(`👁️ Click handler: Sending read receipt for ${lastMessageFromOther.messageId}`);
            wsRef.current.send(JSON.stringify({
                type: 'message_read',
                messageId: lastMessageFromOther.messageId
            }));

            // Update context to track this as the read boundary
            dispatch({
                type: 'UPDATE_LAST_READ_MESSAGE',
                payload: { userId: targetUserId, messageId: lastMessageFromOther.messageId }
            });
        }
    }, [getState, dispatch]);

    const sendReadReceiptForMessage = useCallback((userId, messageId) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (!messageId) return;

        // Check if we've already sent this read receipt (avoid duplicates)
        const key = `${userId}-${messageId}`;
        if (readReceiptDebounceRef.current[key]) return;

        // Mark as sent to avoid resending
        readReceiptDebounceRef.current[key] = true;

        const readReceiptPayload = {
            type: 'message_read',
            messageId: messageId
        };

        console.log(`👁️ Sending smart read receipt for message: ${messageId}`);
        wsRef.current.send(JSON.stringify(readReceiptPayload));
    }, []);

    const handleServerMessage = async (data) => {
        const { type } = data;

        switch (type) {
            case 'user_connected': {
                const newUser = data.user;
                // Get persistent user ID (global to app)
                let myIdOnConnect = localStorage.getItem('username');
                if (!myIdOnConnect) {
                    myIdOnConnect = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    localStorage.setItem('username', myIdOnConnect);
                }

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
                        // Cache profile picture if available
                        if (newUser.info.profilePicture && newUser.info.username) {
                            setCachedProfilePic(newUser.info.username, newUser.info.profilePicture, Date.now());
                        }

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
                // Include ALL users including self - use persistent user ID (global to app)
                const myIdList = localStorage.getItem('username');
                const myUser = data.users.find(u => String(u.id) === String(myIdList));

                // Get all other users
                const others = data.users.filter(u => String(u.id) !== String(myIdList));

                // Import and Store their public keys (Async) - for others only
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

                // Update App Context (Full Sync) - include SELF
                const allUsersForContext = data.users.map(u => {
                    const numericId = parseInt(u.id, 10);
                    const safeId = isNaN(numericId) ? u.id : numericId;

                    // Cache profile picture if available
                    if (u.info.profilePicture && u.info.username) {
                        setCachedProfilePic(u.info.username, u.info.profilePicture, Date.now());
                    }

                    return {
                        id: safeId,
                        sessionId: u.sessionId, // IMPORTANT
                        name: u.info.name || 'Unknown User',
                        username: u.info.username || 'unknown',
                        profile_picture: u.info.profilePicture,
                        status: u.status || 'online',
                        avatarGradient: 'from-blue-500 to-purple-500'
                    };
                });

                dispatch({ type: 'SET_USERS', payload: allUsersForContext });
                console.log(`📡 Synced ${allUsersForContext.length} users from relay (including self)`);
                break;
            }

            case 'chat_history': {
                console.log('🎉 Received chat_history response from server!', data);
                console.log(`🔑 CLAUDE: ===== CHAT HISTORY DECRYPTION START =====`);
                const { userId, messages, senderPublicKey } = data;
                const numericUserId = parseInt(userId, 10);
                const safeUserId = isNaN(numericUserId) ? userId : numericUserId;

                console.log(`📜 Received ${messages.length} messages from history for user ${safeUserId}`);
                console.log(`🔑 CLAUDE: userId = "${userId}"`);
                console.log(`🔑 CLAUDE: senderPublicKey provided = ${!!senderPublicKey}`);

                // Decrypt messages asynchronously
                (async () => {
                    // Import sender's public key if provided
                    let senderKey = userPublicKeys.current[String(userId)];
                    console.log(`🔑 CLAUDE: senderKey in cache = ${!!senderKey}`);
                    if (!senderKey && senderPublicKey && keyPair) {
                        try {
                            console.log(`🔑 CLAUDE: Importing senderPublicKey from history response`);
                            senderKey = await importPublicKey(senderPublicKey);
                            userPublicKeys.current[String(userId)] = senderKey;
                            savePeerKey(String(userId), senderPublicKey);
                            console.log(`✅ Imported public key for sender ${userId} from history`);
                            console.log(`🔑 CLAUDE: senderPublicKey = ${JSON.stringify(senderPublicKey)}`);
                        } catch (e) {
                            console.error(`❌ CLAUDE: Failed to import public key for ${userId}:`, e);
                        }
                    }

                    const formattedMessages = await Promise.all(messages.map(async (msg, idx) => {
                        let decryptedText = '';
                        // Get persistent user ID (global to app)
                        const myId = localStorage.getItem('username');

                        // Check if sender is me
                        const isFromMe = msg.senderId === myId;

                        try {
                            // Decrypt if encrypted
                            if (msg.content.encrypted && msg.content.iv && msg.content.cipher) {
                                console.log(`🔑 CLAUDE: ===== HISTORY MESSAGE ${idx + 1} DECRYPTION =====`);
                                console.log(`🔑 CLAUDE: msg.senderId = "${msg.senderId}"`);
                                console.log(`🔑 CLAUDE: conversation partner (userId) = "${userId}"`);
                                console.log(`🔑 CLAUDE: myId = "${myId}"`);
                                console.log(`🔑 CLAUDE: isFromMe = ${isFromMe}`);

                                // CRITICAL FIX: Always use the CONVERSATION PARTNER's ID for shared key cache
                                // In ECDH, the shared key is the same regardless of who sent the message
                                const conversationPartnerId = String(userId);
                                let sharedKey = sharedKeys.current[conversationPartnerId];
                                console.log(`🔑 CLAUDE: sharedKey in cache for ${conversationPartnerId} = ${!!sharedKey}`);

                                // Try to derive key if missing
                                if (!sharedKey && senderKey && keyPair) {
                                    console.log(`🔑 CLAUDE: Deriving shared key for conversation with ${conversationPartnerId}...`);
                                    console.log(`🔑 CLAUDE: Using keyPair.privateKey (type: ${keyPair.privateKey.type})`);
                                    console.log(`🔑 CLAUDE: Using senderKey (type: ${senderKey.type})`);
                                    sharedKey = await deriveSharedKey(keyPair.privateKey, senderKey);
                                    // Cache under conversation partner's ID, NOT sender's ID
                                    sharedKeys.current[conversationPartnerId] = sharedKey;
                                    console.log(`🔑 CLAUDE: Shared key derived and cached under ${conversationPartnerId} (type: ${sharedKey.type})`);
                                }

                                if (sharedKey) {
                                    try {
                                        console.log(`🔑 CLAUDE: Attempting decryption...`);
                                        console.log(`🔑 CLAUDE: IV length = ${msg.content.iv?.length}`);
                                        console.log(`🔑 CLAUDE: Cipher length = ${msg.content.cipher?.length}`);
                                        decryptedText = await decryptMessage(msg.content.iv, msg.content.cipher, sharedKey);
                                        console.log(`✅ CLAUDE: Decryption SUCCESS`);
                                    } catch (decErr) {
                                        console.warn("❌ CLAUDE: Decryption FAILED:", decErr.message);
                                        console.warn("⚠️ Cannot decrypt message from history (keys may have changed):", decErr.message);
                                        decryptedText = "⚠️ Unable to decrypt (keys changed or corrupted)";
                                    }
                                } else {
                                    decryptedText = "🔒 Encrypted (Keys not available)";
                                    console.warn(`❌ CLAUDE: Missing shared key for ${conversationPartnerId} in history`);
                                    console.warn(`🔑 CLAUDE: senderKey available = ${!!senderKey}`);
                                    console.warn(`🔑 CLAUDE: keyPair available = ${!!keyPair}`);
                                }
                            } else {
                                // Plaintext message
                                decryptedText = msg.content.text || '';
                            }
                        } catch (e) {
                            console.error('Error processing history message:', e);
                            decryptedText = '⚠️ Error';
                        }

                        return {
                            sender: isFromMe ? 'me' : msg.senderId,
                            text: decryptedText,
                            time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            timestamp: msg.timestamp,
                            messageId: msg.messageId,
                            files: [],
                            delivered: msg.delivered,
                            read: msg.read
                        };
                    }));

                    console.log('Formatted messages:', formattedMessages);

                    // Set messages for this user
                    dispatch({
                        type: 'SET_MESSAGES',
                        payload: {
                            ...getState().messages,
                            [safeUserId]: formattedMessages
                        }
                    });

                    // Send initial read receipt for the last message from the other user
                    // This ensures that old messages (from before logout/reload) get marked as read
                    const lastMessageFromOther = formattedMessages
                        .slice()
                        .reverse()
                        .find(msg => msg.sender !== 'me');

                    if (lastMessageFromOther?.messageId && wsRef.current?.readyState === WebSocket.OPEN) {
                        console.log(`📮 Sending initial read receipt for chat history: ${lastMessageFromOther.messageId}`);
                        wsRef.current.send(JSON.stringify({
                            type: 'message_read',
                            messageId: lastMessageFromOther.messageId
                        }));
                        // Update context to track this as the read boundary
                        dispatch({
                            type: 'UPDATE_LAST_READ_MESSAGE',
                            payload: { userId: safeUserId, messageId: lastMessageFromOther.messageId }
                        });
                    }
                })();
                break;
            }

            case 'message_delivery_confirmation': {
                console.log('📬 Message delivered:', data);
                const { messageId, recipientId } = data;

                // Extract timestamp from messageId (format: sender-recipient-timestamp)
                const parts = messageId.split('-');
                const timestamp = parts[parts.length - 1]; // Last part is timestamp

                console.log(`📬 Looking for message with timestamp ${timestamp} in chat ${recipientId}`);

                // Update message state to mark as delivered
                const currentMessages = getState().messages;
                const updatedMessages = { ...currentMessages };

                // Update the message in the specific user's chat
                if (updatedMessages[recipientId]) {
                  updatedMessages[recipientId] = updatedMessages[recipientId].map(msg => {
                    // Match by timestamp (within 1 second) and sender='me'
                    if (msg.sender === 'me' && Math.abs(msg.timestamp - parseInt(timestamp)) < 1000) {
                      console.log(`✅ Updated message ${timestamp} to delivered`);
                      return { ...msg, delivered: true, messageId: messageId };
                    }
                    return msg;
                  });
                }

                dispatch({ type: 'SET_MESSAGES', payload: updatedMessages });
                break;
            }

            case 'message_read_confirmation': {
                console.log('👁️ Message read confirmation:', data);
                const { messageId } = data;

                // Extract sender and timestamp from messageId (format: sender-recipient-timestamp)
                const parts = messageId.split('-');
                const senderId = parts[0];
                const timestamp = parts[parts.length - 1];

                console.log(`👁️ Looking for MY message (${senderId}) with timestamp ${timestamp}`);

                // Update message state to mark as read
                const currentMessages = getState().messages;
                const updatedMessages = { ...currentMessages };

                // Update all MY messages (messages I sent that have been read)
                for (const userId in updatedMessages) {
                  updatedMessages[userId] = updatedMessages[userId].map(msg => {
                    // Match by timestamp and sender='me' (my sent messages)
                    if (msg.sender === 'me' && Math.abs(msg.timestamp - parseInt(timestamp)) < 1000) {
                      console.log(`👁️ Updated MY message at ${timestamp} to read`);
                      return { ...msg, read: true, delivered: true };
                    }
                    return msg;
                  });
                }

                console.log(`👁️ After update:`, updatedMessages);
                dispatch({ type: 'SET_MESSAGES', payload: updatedMessages });
                break;
            }

            case 'friend_request_received': {
                console.log('🔔 Friend request received from:', data.senderUsername || data.senderId);
                // Refresh friend requests from server to get enriched data
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'get_friend_requests' }));
                }
                break;
            }

            case 'friend_request_sent': {
                console.log('📤 Friend request sent to:', data.receiverUsername);
                // Refresh sent requests from server to get current state
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'get_sent_friend_requests' }));
                }
                break;
            }

            case 'friend_request_accepted': {
                console.log('✅ Friend request accepted, new friend:', data.friendId);
                dispatch({ type: 'ADD_FRIEND', payload: data.friendId });
                dispatch({ type: 'REMOVE_SENT_REQUEST', payload: data.friendId });
                dispatch({ type: 'REMOVE_PENDING_REQUEST', payload: data.friendId });
                break;
            }

            case 'friend_request_declined': {
                console.log('❌ Friend request declined by:', data.friendId);
                dispatch({ type: 'REMOVE_SENT_REQUEST', payload: data.friendId });
                dispatch({ type: 'REMOVE_PENDING_REQUEST', payload: data.friendId });
                break;
            }

            case 'friends_list': {
                console.log('👥 Received friends list:', data.friends);
                dispatch({ type: 'SET_FRIENDS', payload: data.friends });
                break;
            }

            case 'sent_friend_requests_list': {
                console.log('📤 Received sent requests:', data.requests);
                dispatch({ type: 'SET_SENT_REQUESTS', payload: data.requests });
                break;
            }

            case 'friend_requests_list': {
                console.log('📥 Received pending requests:', data.requests);
                dispatch({ type: 'SET_PENDING_REQUESTS', payload: data.requests });
                break;
            }

            case 'invalid_session': {
                console.log('❌ Invalid session detected:', data.reason);
                // Auto-logout: clear localStorage and reset state
                dispatch({ type: 'LOGOUT' });
                alert(data.reason || 'Your session is invalid. Please login again.');
                break;
            }

            case 'signup_success': {
                console.log('✅ Signup successful:', data.username);
                // Dispatch a custom event that ChatArea can listen to
                window.dispatchEvent(new CustomEvent('signup_success', {
                    detail: { username: data.username, message: data.message }
                }));
                break;
            }

            case 'signup_failed': {
                console.log('❌ Signup failed:', data.reason);
                // Dispatch a custom event that ChatArea can listen to
                window.dispatchEvent(new CustomEvent('signup_failed', {
                    detail: { reason: data.reason }
                }));
                break;
            }

            case 'registered': {
                console.log('✅ Registered with server, syncing friend data...');

                // Store userId from server
                if (data.userId) {
                    localStorage.setItem('username', data.userId);
                    localStorage.setItem('userId', data.userId); // Keep for compatibility
                    console.log(`✅ Stored userId from registration: ${data.userId}`);
                }

                // Sync friend state from server on login
                setTimeout(() => {
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({ type: 'get_friend_requests' }));
                        wsRef.current.send(JSON.stringify({ type: 'get_friends_list' }));
                        wsRef.current.send(JSON.stringify({ type: 'get_sent_friend_requests' }));
                    }
                }, 100);
                break;
            }

            case 'message':
                console.log("Received Online Message:", data);
                const { senderId, payload } = data;

                try {
                    let finalText = "";

                    // Decrypt if encrypted
                    if (payload.encrypted && payload.iv && payload.cipher) {
                        // Use sender's ID consistently for incoming messages
                        const safeSenderId = String(senderId);
                        let sharedKey = sharedKeys.current[safeSenderId];

                        // Try to derive key if missing
                        if (!sharedKey && userPublicKeys.current[safeSenderId] && keyPair) {
                             console.log(`🔑 Deriving shared key for conversation with ${safeSenderId}...`);
                             sharedKey = await deriveSharedKey(keyPair.privateKey, userPublicKeys.current[safeSenderId]);
                             // Cache under sender's ID (which is the conversation partner for incoming messages)
                             sharedKeys.current[safeSenderId] = sharedKey;
                             console.log(`🔑 Shared key derived and cached under ${safeSenderId}`);
                        }

                        if (sharedKey) {
                            try {
                                finalText = await decryptMessage(payload.iv, payload.cipher, sharedKey);
                                console.log(`✅ Real-time message decrypted successfully`);
                            } catch (decErr) {
                                console.warn("⚠️ Cannot decrypt message (keys may have changed):", decErr.message);
                                finalText = "⚠️ Unable to decrypt (keys changed or corrupted)";
                            }
                        } else {
                            finalText = "🔒 Encrypted (Keys not available)";
                            console.warn(`❌ Missing shared key for ${safeSenderId}. Has PubKey: ${!!userPublicKeys.current[safeSenderId]}, Has keyPair: ${!!keyPair}`);
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

                    // Save encrypted message to IndexedDB for persistence
                    saveEncryptedMessage({
                        friendId: safeSenderId,
                        senderId: safeSenderId,
                        content: payload.encrypted && payload.iv && payload.cipher
                            ? { encrypted: true, iv: payload.iv, cipher: payload.cipher }
                            : { encrypted: false, text: payload.text || finalText },
                        timestamp: Date.now(),
                        messageId: data.messageId,
                        sender: safeSenderId
                    })
                    .then(() => console.log('🗄️ IndexedDB - Saved ENCRYPTED incoming message'))
                    .catch(err => console.error('🗄️ IndexedDB - ❌ Failed to save incoming message:', err));

                    dispatch({
                        type: 'ADD_MESSAGE',
                        payload: {
                            userId: safeSenderId,
                            message: {
                                sender: safeSenderId,
                                text: finalText,
                                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                timestamp: Date.now(),
                                messageId: data.messageId,
                                delivered: false,
                                read: false
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

            case 'profile_picture_updated': {
                console.log('📸 Profile picture update received:', data);
                const { userId, profilePicture, timestamp } = data;

                // Only update if profilePicture URL is actually provided
                if (profilePicture) {
                    // Background fetch and cache blob
                    cacheProfilePictureBlob(userId, profilePicture, timestamp || Date.now())
                        .catch(err => console.error(`📸 Blob cache failed for ${userId}:`, err));

                    // Keep localStorage during migration (temporary)
                    setCachedProfilePic(userId, profilePicture, timestamp || Date.now());

                    dispatch({
                        type: 'UPDATE_USER_PROFILE_PICTURE',
                        payload: {
                            userId: userId,
                            profilePicture: profilePicture,
                            timestamp: timestamp || Date.now()
                        }
                    });
                    console.log(`✅ Updated profile picture for user ${userId} and cached`);
                } else {
                    console.log(`📸 Received profile picture confirmation (no URL in payload)`);
                }
                break;
            }
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

            const msgTimestamp = Date.now();
            const myMessageId = `${localStorage.getItem('username')}-${finalTargetId}-${msgTimestamp}`;

            // Save encrypted message to IndexedDB
            saveEncryptedMessage({
                friendId: finalTargetId,
                senderId: 'me',
                content: {
                    encrypted: true,
                    iv: payload.iv,
                    cipher: payload.cipher
                },
                timestamp: msgTimestamp,
                messageId: myMessageId,
                sender: 'me'
            })
            .then(() => console.log('🗄️ IndexedDB - Saved ENCRYPTED sent message'))
            .catch(err => console.error('🗄️ IndexedDB - ❌ Failed to save sent message:', err));

            dispatch({
                type: 'ADD_MESSAGE',
                payload: {
                    userId: finalTargetId,
                    message: {
                        sender: 'me',
                        text: text,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        timestamp: msgTimestamp,
                        messageId: myMessageId,
                        delivered: false,
                        read: false
                    }
                }
            });
        }
    }, [dispatch, keyPair]);

    // Request chat history when active chat changes
    useEffect(() => {
        console.log('🔄 useEffect triggered: Checking active chat user...');
        const activeUserId = getState().activeChatUserId;
        console.log(`📌 Active Chat User ID: ${activeUserId}`);
        console.log(`📡 WS Open: ${wsRef.current?.readyState === WebSocket.OPEN}`);

        if (activeUserId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log(`✅ Conditions met, requesting history for ${activeUserId}`);
            // Small delay to ensure connection is fully ready
            const timeout = setTimeout(() => {
                requestChatHistory(activeUserId);
            }, 100);
            return () => clearTimeout(timeout);
        } else {
            if (!activeUserId) console.warn('⚠️ No active chat user');
            if (!wsRef.current) console.warn('⚠️ No websocket connection');
            if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) console.warn(`⚠️ WS not open, state: ${wsRef.current.readyState}`);
        }
    }, [getState, requestChatHistory]);

    const validateUsername = useCallback((username, password, mode) => {
        return new Promise((resolve) => {
            // Wait for connection to be ready, with retries
            const checkConnection = (retries = 0) => {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    // Connection is ready, proceed with validation
                    sendValidation();
                } else if (retries < 30) {
                    // Retry every 100ms for up to 3 seconds
                    console.log(`⏳ Waiting for server connection... (attempt ${retries + 1}/30)`);
                    setTimeout(() => checkConnection(retries + 1), 100);
                } else {
                    console.warn('❌ Server connection timeout');
                    resolve({ valid: false, reason: 'Server connection timeout - please check relay server URL' });
                }
            };

            const sendValidation = () => {
                // Set up a one-time listener for the validation response
                const originalOnmessage = wsRef.current.onmessage;
                const validationHandler = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'auth_validation') {
                            // Restore original handler
                            wsRef.current.onmessage = originalOnmessage;

                            console.log(`✅ Auth validation response:`, data);
                            resolve(data);

                            // Re-trigger the original message handler for this message if needed
                            if (handleServerMessageRef.current) {
                                handleServerMessageRef.current(data);
                            }
                        }
                    } catch (e) {
                        console.error("Error parsing validation response:", e);
                    }
                };

                wsRef.current.onmessage = validationHandler;

                // Send validation request
                wsRef.current.send(JSON.stringify({
                    type: 'validate_auth',
                    username: username,
                    password: password,
                    mode: mode || 'signup'
                }));

                console.log(`📤 Sent auth validation request for: ${username}`);

                // Timeout after 5 seconds
                setTimeout(() => {
                    if (wsRef.current && wsRef.current.onmessage === validationHandler) {
                        console.warn('⚠️ Validation timeout');
                        wsRef.current.onmessage = originalOnmessage;
                        resolve({ valid: false, reason: 'Validation timeout' });
                    }
                }, 5000);
            };

            checkConnection();
        });
    }, []);

    const setAuthPassword = useCallback((password) => {
        authPasswordRef.current = password;
    }, []);

    const sendFriendRequest = useCallback((receiverUsername) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected');
            return;
        }
        wsRef.current.send(JSON.stringify({
            type: 'send_friend_request',
            receiverUsername: receiverUsername
        }));
    }, []);

    const getFriendRequests = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected');
            return;
        }
        wsRef.current.send(JSON.stringify({ type: 'get_friend_requests' }));
    }, []);

    const getFriendsList = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected');
            return;
        }
        wsRef.current.send(JSON.stringify({ type: 'get_friends_list' }));
    }, []);

    const getSentFriendRequests = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected');
            return;
        }
        wsRef.current.send(JSON.stringify({ type: 'get_sent_friend_requests' }));
    }, []);

    const acceptFriendRequest = useCallback((senderId) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected');
            return;
        }
        wsRef.current.send(JSON.stringify({
            type: 'accept_friend_request',
            senderId: senderId
        }));
    }, []);

    const declineFriendRequest = useCallback((senderId) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected');
            return;
        }
        wsRef.current.send(JSON.stringify({
            type: 'decline_friend_request',
            senderId: senderId
        }));
    }, []);

    const sendProfilePictureUpdate = useCallback((profilePicture) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.warn('❌ Cannot send profile picture update: Not connected to server');
            return;
        }

        const userId = localStorage.getItem('username');
        if (!userId) {
            console.warn('❌ No user ID found');
            return;
        }

        wsRef.current.send(JSON.stringify({
            type: 'update_profile_picture',
            userId: userId,
            profilePicture: profilePicture
        }));
        console.log(`📸 Sent profile picture update to server`);
    }, []);

    const sendLogout = useCallback(async () => {
        // Clear cryptographic keys on logout to prevent next user inheriting them
        setKeyPair(null);
        sharedKeys.current = {};
        // userPublicKeys.current = {}; // Optional: keep public keys to avoid re-fetching? No, safer to clear.
        authPasswordRef.current = null;
        setIsInitialized(false);

        // Cleanup blob URLs and IndexedDB cache
        try {
            await clearAllProfilePictureBlobsWithRevoke();
            console.log('📸 Cleaned up profile picture cache on logout');
        } catch (error) {
            console.error('📸 Failed to cleanup profile picture cache:', error);
        }

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.warn('⚠️ Not connected to server, but proceeding with logout');
            return;
        }

        const userId = localStorage.getItem('username');
        if (!userId) {
            console.warn('❌ No user ID found for logout');
            return;
        }

        wsRef.current.send(JSON.stringify({
            type: 'user_logout',
            userId: userId
        }));
        console.log(`👋 Sent logout message to server for user: ${userId}`);
    }, []);

    // Monitor lastReadMessageIds changes and send read receipts only when boundary moves forward
    useEffect(() => {
        const lastReadIds = getState().lastReadMessageIds;
        if (!lastReadIds || Object.keys(lastReadIds).length === 0) return;

        // For each conversation with a lastReadMessageId, send a read receipt
        Object.entries(lastReadIds).forEach(([userId, messageId]) => {
            if (messageId && wsRef.current?.readyState === WebSocket.OPEN) {
                sendReadReceiptForMessage(userId, messageId);
            }
        });
    }, [getState, sendReadReceiptForMessage]);

    return useMemo(() => ({ connect, sendMessageOnline, isOnline, broadcastIdentity, sendIdentifyWithPassword, requestChatHistory, sendReadReceipts, validateUsername, setAuthPassword, sendFriendRequest, getFriendRequests, getFriendsList, getSentFriendRequests, acceptFriendRequest, declineFriendRequest, sendProfilePictureUpdate, sendLogout }), [connect, sendMessageOnline, isOnline, broadcastIdentity, sendIdentifyWithPassword, requestChatHistory, sendReadReceipts, validateUsername, setAuthPassword, sendFriendRequest, getFriendRequests, getFriendsList, getSentFriendRequests, acceptFriendRequest, declineFriendRequest, sendProfilePictureUpdate, sendLogout]);
}
