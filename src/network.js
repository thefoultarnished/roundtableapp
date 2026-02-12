import { state } from './state.js';
import * as utils from './utils.js';
import { 
    renderUserList, 
    renderChatWindow, 
    showBeautifulNotification, 
    createMessageBubble, 
    showNotification,
    scrollToBottom,
    updateFilePreview,
    updateSendButton,
    handleUserClick
} from './ui.js';

export function setupTauriIntegration() {
    if (window.__TAURI__ && window.__TAURI__.invoke) {
        state.globalInvokeFunc = window.__TAURI__.invoke;
    } else if (window.__TAURI__ && window.__TAURI__.tauri && window.__TAURI__.tauri.invoke) {
        state.globalInvokeFunc = window.__TAURI__.tauri.invoke;
    } else if (window.tauriInvoke) {
        state.globalInvokeFunc = window.tauriInvoke;
    }
    console.log("Invoke function set:", !!state.globalInvokeFunc);

    window.__TAURI__.event.listen('file-transfer-accepted', (event) => {
        const { transferId } = event.payload;
        updateFileTransferStatus(transferId, 'accepted');
    });

    window.__TAURI__.event.listen('file-transfer-ready', (event) => {
        const { transferId, port, senderIp } = event.payload;
        console.log(`File transfer ready event received:`, { transferId, port, senderIp });

        if (!transferId || !port || !senderIp) {
            console.error("Invalid file-transfer-ready payload:", event.payload);
            return;
        }

        downloadFile(transferId, senderIp, port);
    });

    window.__TAURI__.event.listen('file-transfer-progress', (event) => {
        const { transferId, progress } = event.payload;
        console.log(`File transfer progress: ${progress}% for ${transferId}`);
        updateFileTransferProgress(transferId, progress);
    });

    window.__TAURI__.event.listen('file-transfer-complete', (event) => {
        const { transferId, size } = event.payload;
        console.log(`File transfer complete: ${transferId}, ${size} bytes`);
        updateFileTransferStatus(transferId, 'completed');
    });

    window.__TAURI__.event.listen('file-transfer-error', (event) => {
        const { transferId, error } = event.payload;
        console.error(`File transfer error: ${transferId}, ${error}`);
        updateFileTransferStatus(transferId, 'failed');
    });

    if (!window.__TAURI__) return;

    try {
        console.log('Available Tauri APIs:', Object.keys(window.__TAURI__));

         if (window.__TAURI__.window) {
             const tauriWindow = window.__TAURI__.window;
             const appWindow = tauriWindow.getCurrentWindow();
        
            if (appWindow) {
                 document.getElementById('titlebar-minimize')?.addEventListener('click', () => appWindow.minimize());
                 document.getElementById('titlebar-maximize')?.addEventListener('click', () => appWindow.toggleMaximize());
                 document.getElementById('titlebar-close')?.addEventListener('click', () => appWindow.close());
                 console.log('Window controls set up via appWindow');
            }
        }

        if (window.__TAURI__.event && window.__TAURI__.event.listen) {
            console.log('Setting up Tauri event listeners');

            window.__TAURI__.event.listen('user-online', (event) => {
                console.log('User online event:', event);
                addDiscoveredUser(event.payload || event.data);
            });

            window.__TAURI__.event.listen('user-offline', (event) => {
                console.log('User offline event:', event);
                const userId = (event.payload || event.data)?.id;
                markUserAsOffline(userId);
            });

            window.__TAURI__.event.listen('message-received', async (event) => {
                console.log('Message received event:', event);
                const data = event.payload || event.data;
                console.log('Message data:', data);
                await displayReceivedMessage(event.payload || event.data);
            });

            window.__TAURI__.event.listen('discovery-query-received', () => {
                console.log('Received discovery query, responding with our presence.');
                announcePresence();
            });

            state.globalInvokeFunc('broadcast_discovery_query');

            console.log('Tauri event listeners set up successfully');

            setTimeout(announcePresence, 1000);
        } else {
            console.error('Tauri event API not available or missing listen method');
        }

        window.__TAURI__.event.listen('file-offer-received', (event) => {
            const offerDetails = event.payload;
            console.log("File Offer Received:", offerDetails);

            addDiscoveredUser(offerDetails.sender);

            const fileOfferMessage = {
                sender: offerDetails.sender.id,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                timestamp: Date.now(),
                fileTransfer: {
                    fileName: offerDetails.fileName,
                    fileSize: offerDetails.fileSize,
                    transferId: offerDetails.transferId,
                    status: 'incoming'
                }
            };

            if (!state.messages[offerDetails.sender.id]) {
                state.messages[offerDetails.sender.id] = [];
            }
            state.messages[offerDetails.sender.id].push(fileOfferMessage);

            if (state.activeChatUserId === offerDetails.sender.id) {
                renderChatWindow();
            } else {
                state.unreadCounts[offerDetails.sender.id] = (state.unreadCounts[offerDetails.sender.id] || 0) + 1;
                renderUserList();

                showBeautifulNotification(
                    offerDetails.sender.name,
                    `📎 Wants to send you: ${offerDetails.fileName} (${(offerDetails.fileSize / 1024 / 1024).toFixed(2)} MB)`
                );
            }
        });
        
    } catch (error) {
        console.error('Error setting up Tauri integration:', error);
    }
    
    setupPeriodicDiscovery();
}

export function sendMessageToBackend(message, targetIp, targetPort) {
    console.log(`SENDING MESSAGE to ${targetIp} (port ${targetPort}): "${message}"`);

    let invokeFunc = state.globalInvokeFunc;

    if (!invokeFunc) {
         if (window.__TAURI__ && window.__TAURI__.invoke) {
             invokeFunc = window.__TAURI__.invoke;
         } else if (window.__TAURI__ && window.__TAURI__.tauri && window.__TAURI__.tauri.invoke) {
             invokeFunc = window.__TAURI__.tauri.invoke;
         } else if (window.tauriInvoke) {
             invokeFunc = window.tauriInvoke;
         }
    }

    if (!invokeFunc) {
        console.error("Could not find invoke function");
        return;
    }

    const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
    const myUserId = utils.getSafeUserId();

    const payload = {
        message: message,
        targetIp: targetIp,
        senderName: myDisplayName,
        senderId: myUserId,
        targetId: state.activeChatUserId,
        targetPort: targetPort,
        senderPort: parseInt(localStorage.getItem('port') || state.MSG_PORT, 10)
    };

    console.log(`Invoking send_message with:`, payload);

    try {
        invokeFunc('send_message', payload)
            .then((result) => {
                console.log('Message sent successfully to:', targetIp, 'Result:', result);
                
                // Log outgoing message
                logMessage(
                     myDisplayName,
                     "N/A", // senderIp not readily available without async check
                     state.allUsers.find(u => u.id === state.activeChatUserId)?.name || "Unknown",
                     targetIp,
                     message,
                     true
                );

            })
            .catch(err => {
                console.error('Error sending message:', err);
            });
    } catch (e) {
        console.error('Exception when calling invoke:', e);
    }
}

export function addDiscoveredUser(user) {
    if (!user || !user.id) {
        console.error("Invalid user data:", user);
        return;
    }

    const now = Date.now();
    user.lastSeen = now;

    const myUserId = utils.getSafeUserId();
    if (user.id === myUserId) {
        return;
    }

    if (!user.port || user.port === 0) {
        console.warn(`User ${user.name} has no port set, using default MSG_PORT`);
        user.port = state.MSG_PORT;
    }
    console.log(`Assigned port ${user.port} to user ${user.name}`);
    console.log(`User ${user.name} discovered with port ${user.port}`);

    const existingUserIndex = state.allUsers.findIndex(u => u.id === user.id);

    if (existingUserIndex !== -1) {
        console.log(`User already exists (ID: ${user.id}), updating details.`);

        const existingUser = state.allUsers[existingUserIndex];

        existingUser.name = user.name;
        existingUser.status = 'online';
        existingUser.lastSeen = now;
        existingUser.ip = user.ip;
        existingUser.port = user.port;
        existingUser.profile_picture = user.profile_picture;
        existingUser.username = user.username;
        existingUser.hostname = user.hostname;

    } else {
        console.log(`Adding new user: ${user.name} (ID: ${user.id})`);

        const avatarGradients = [
            'from-teal-400 to-blue-500',
            'from-pink-500 to-purple-600',
            'from-yellow-400 to-orange-500',
            'from-green-400 to-emerald-500',
            'from-red-400 to-pink-500'
        ];

        user.status = 'online';
        user.avatarGradient = avatarGradients[Math.floor(Math.random() * avatarGradients.length)];

        state.allUsers.push(user);
        state.discoveredUsers.push(user);
    }

    saveUserList();
    // Re-assign displayedUsers.
    // We must clear state.displayedUsers and copy allUsers to it, or similar logic.
    // In script.js: displayedUsers = [...allUsers];
    state.displayedUsers.length = 0;
    state.displayedUsers.push(...state.allUsers);
    
    renderUserList();
}

export function saveUserList() {
    try {
        localStorage.setItem('allUsers', JSON.stringify(state.allUsers));
    } catch (e) {
        console.error("Failed to save user list to localStorage.", e);
    }
}

export function loadUserList() {
    const savedUsersJSON = localStorage.getItem('allUsers') || '';
    if (savedUsersJSON) {
        try {
            const savedUsers = JSON.parse(savedUsersJSON);
            if (Array.isArray(savedUsers)) {
                // Clear existing
                state.allUsers.length = 0;
                
                const loaded = savedUsers.map(user => ({
                    ...user,
                    status: 'offline'
                }));
                state.allUsers.push(...loaded);
                
                state.displayedUsers.length = 0;
                state.displayedUsers.push(...state.allUsers);
                
                console.log(`Loaded ${state.allUsers.length} users from localStorage.`);
            }
        } catch (e) {
            console.error("Failed to parse saved user list from localStorage.", e);
        }
    }
}

export function markUserAsOffline(userId) {
    if (!userId) return;

    const userIndex = state.allUsers.findIndex(u => u.id === userId);

    if (userIndex !== -1 && state.allUsers[userIndex].status !== 'offline') {
        console.log(`User ${state.allUsers[userIndex].name} marked as offline.`);
        state.allUsers[userIndex].status = 'offline';

        const displayedUserIndex = state.displayedUsers.findIndex(u => u.id === userId);
        if (displayedUserIndex !== -1) {
            state.displayedUsers[displayedUserIndex].status = 'offline';
        }

        renderUserList();

        if (state.activeChatUserId === userId) {
            renderChatWindow();
        }
    }
    saveUserList();
}

export function setupUserStatusMonitor() {
    console.log("Setting up user status monitor");
    setInterval(() => {
        const now = Date.now();
        let changed = false;

        state.allUsers.forEach(user => {
            if (user.status === 'online' && user.lastSeen && (now - user.lastSeen > 60000)) {
                console.log(`User ${user.name} marked as offline due to inactivity.`);
                user.status = 'offline';
                changed = true;
            }
        });

        if (changed) {
            saveUserList();
            renderUserList();
            const activeUser = state.allUsers.find(u => u.id === state.activeChatUserId);
            if (activeUser && activeUser.status === 'offline') {
                renderChatWindow();
            }
        }
    }, 10000);
}

export function announcePresence() {
    console.log('Announcing presence');

    let invokeFunc = state.globalInvokeFunc;
     if (!invokeFunc) {
         if (window.__TAURI__ && window.__TAURI__.invoke) {
             invokeFunc = window.__TAURI__.invoke;
         } else if (window.__TAURI__ && window.__TAURI__.tauri && window.__TAURI__.tauri.invoke) {
             invokeFunc = window.__TAURI__.tauri.invoke;
         } else if (window.tauriInvoke) {
             invokeFunc = window.tauriInvoke;
         }
    }

    if (!invokeFunc) {
        console.error('Could not find invoke function for presence announcement');
        return;
    }

    try {
        const myUserId = utils.getSafeUserId();
        const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
        const myUsername = localStorage.getItem('username') || 'Anonymous';
        const myProfilePicture = localStorage.getItem('profilePicture') || null;

        console.log(`Broadcasting presence: ${myDisplayName} (ID: ${myUserId})`);

        invokeFunc('broadcast_user_presence', {
            userId: myUserId,
            name: myDisplayName,
            username: myUsername,
            profilePicture: myProfilePicture
        })
            .then(() => {
                console.log('Presence announcement sent');
            })
            .catch(err => {
                console.error('Error announcing presence:', err);

                console.log('Falling back to test_emit');
                return invokeFunc('test_emit');
            })
            .catch(err => {
                console.error('Fallback also failed:', err);
            });
    } catch (e) {
        console.error('Exception in announcePresence:', e);
    }
}

export function setupPeriodicDiscovery() {
    announcePresence();

    const discoveryInterval = setInterval(() => {
        console.log("Auto-discovery: Broadcasting presence...");
        announcePresence();
    }, 15000);

    window.__DISCOVERY_INTERVAL = discoveryInterval;
}

export async function displayReceivedMessage(messageData) {
    console.log('JS: Processing received message:', messageData);

    const myUserId = utils.getSafeUserId();

    if (messageData.sender_id === utils.getSafeUserId() || (messageData.target_id !== utils.getSafeUserId() && messageData.target_id !== 0)) {
        return;
    }

    let sender = state.allUsers.find(u => u.id === messageData.sender_id);
    if (!sender) {
        const newUser = {
            id: messageData.sender_id,
            name: messageData.sender || "Unknown User",
            ip: messageData.ip,
            port: messageData.sender_port || state.MSG_PORT,
            status: 'online',
            avatarGradient: 'from-gray-500 to-gray-600'
        };
        addDiscoveredUser(newUser);
        sender = newUser;
    } else {
        sender.status = 'online';
        sender.lastSeen = Date.now();
        renderUserList();
    }

    const newMessage = {
        sender: sender.id,
        text: messageData.content,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: messageData.timestamp * 1000,
        files: []
    };

    if (!state.messages[sender.id]) {
        state.messages[sender.id] = [];
    }
    state.messages[sender.id].push(newMessage);

    const windowIsFocused = await utils.isWindowFocused();

    if (state.activeChatUserId !== sender.id || !windowIsFocused) {
        state.unreadCounts[sender.id] = (state.unreadCounts[sender.id] || 0) + 1;
        console.log(`Unread count for ${sender.name} is now ${state.unreadCounts[sender.id]}`);

        renderUserList();

        setTimeout(() => {
            const userEl = document.querySelector(`[data-user-id="${sender.id}"]`);
            const badge = userEl?.querySelector('.unread-badge');
            if (badge) {
                badge.classList.add('new-message');
                setTimeout(() => badge.classList.remove('new-message'), 1500);
            }
        }, 100);

        showBeautifulNotification(sender.name, messageData.content);
    }

    const messagesContainerEl = document.getElementById('messages-container');
    if (messagesContainerEl && state.activeChatUserId === sender.id) {
        const messageEl = createMessageBubble(newMessage);
        messageEl.classList.add('slide-in-left');
        messagesContainerEl.appendChild(messageEl);
        scrollToBottom();
    }

    await logMessage(
        sender.name || 'Unknown',
        sender.ip || 'Unknown IP',
        localStorage.getItem('displayName') || 'Me',
        await utils.getUserIP(),
        messageData.content,
        false
    );
     
    // Duplicate check for window visibility?
    // The previous implementation had a redundant check at the end of displayReceivedMessage.
    // showBeautifulNotification already calls isWindowVisible.
}

export async function logMessage(senderName, senderIp, receiverName, receiverIp, message, isOutgoing) {
    if (!state.globalInvokeFunc) return;

    try {
        await state.globalInvokeFunc('log_message', {
            senderName,
            senderIp,
            receiverName,
            receiverIp,
            message,
            isOutgoing
        });
    } catch (error) {
        console.error('Failed to log message:', error);
    }
}

export async function logSessionStart() {
    if (!state.globalInvokeFunc) return;

    const userName = localStorage.getItem('displayName') || 'Roundtable User';
    const userIp = await utils.getUserIP();

    try {
        await state.globalInvokeFunc('log_session_start', {
            userName,
            userIp
        });
        console.log('Session logged');
    } catch (error) {
        console.error('Failed to log session start:', error);
    }
}

export async function logChatParticipants(remoteUser) {
    if (!state.globalInvokeFunc || !remoteUser) return;

    const localUser = localStorage.getItem('displayName') || 'Roundtable User';
    const localIp = await utils.getUserIP();

    try {
        await state.globalInvokeFunc('log_chat_participants', {
            localUser,
            localIp,
            remoteUser: remoteUser.name || 'Unknown User',
            remoteIp: remoteUser.ip || 'Unknown IP'
        });
        console.log('Chat participants logged');
    } catch (error) {
        console.error('Failed to log participants:', error);
    }
}

// File Transfer Logic
export async function downloadFile(transferId, senderIp, port) {
    console.log(`Starting download for ${transferId} from ${senderIp}:${port}`);

    if (!transferId || !senderIp || !port) {
        console.error("Missing required parameters for download:", { transferId, senderIp, port });
        updateFileTransferStatus(transferId, 'failed');
        showNotification("Download failed: Missing connection information", true);
        return;
    }

    try {
        let fileName = "downloaded_file.bin";
        let fileSize = 0;
        for (const userId in state.messages) {
            const userMessages = state.messages[userId];
            const fileMessage = userMessages.find(m => m.fileTransfer && m.fileTransfer.transferId === transferId);
            if (fileMessage) {
                fileName = fileMessage.fileTransfer.fileName;
                fileSize = fileMessage.fileTransfer.fileSize;
                console.log(`Found file: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
                break;
            }
        }

        const saveDir = await window.__TAURI__.path.downloadDir();
        const savePath = await window.__TAURI__.path.join(saveDir, fileName);
        console.log(`Saving to: ${savePath}`);

        updateFileTransferStatus(transferId, 'downloading');

        const myUserId = utils.getSafeUserId();
        const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
        const myUsername = localStorage.getItem('username') || 'Anonymous';
        const myProfilePicture = localStorage.getItem('profilePicture') || null;

        console.log(`Invoking download_file with:`, { transferId, senderIp, port, savePath });
        await state.globalInvokeFunc('download_file', {
            transferId,
            senderIp,
            port,
            fileName,
            savePath,
            senderId: myUserId,
            senderName: myDisplayName,
            senderUsername: myUsername,
            senderProfilePicture: myProfilePicture
        });

        console.log(`Download command invoked for ${fileName}`);
    } catch (err) {
        console.error(`Download failed for ${transferId}:`, err);
        updateFileTransferStatus(transferId, 'failed');
        showNotification(`Download failed: ${err.message || 'Unknown error'}`, true);
    }
}

export function updateFileTransferProgress(transferId, progress) {
    for (const userId in state.messages) {
        const userMessages = state.messages[userId];
        const messageIndex = userMessages.findIndex(m => m.fileTransfer && m.fileTransfer.transferId === transferId);

        if (messageIndex !== -1) {
            state.messages[userId][messageIndex].fileTransfer.status = 'downloading';
            state.messages[userId][messageIndex].fileTransfer.progress = progress;

            if (parseInt(userId) === state.activeChatUserId) {
                const bubbles = document.querySelectorAll('[data-transfer-id]');
                for (const bubble of bubbles) {
                    if (bubble.dataset.transferId === transferId) {
                        const newBubble = createMessageBubble(state.messages[userId][messageIndex]);
                        bubble.replaceWith(newBubble);
                        break;
                    }
                }
            }
            break;
        }
    }
}

export function updateFileTransferStatus(transferId, newStatus) {
    for (const userId in state.messages) {
        const userMessages = state.messages[userId];
        const messageIndex = userMessages.findIndex(m => m.fileTransfer && m.fileTransfer.transferId === transferId);

        if (messageIndex !== -1) {
            state.messages[userId][messageIndex].fileTransfer.status = newStatus;

            if (parseInt(userId) === state.activeChatUserId) {
                renderChatWindow();
            }
            break;
        }
    }
}

export function initiateFileDownload(transferId, filePath, targetIp, targetPort) {
    console.log(`Initiating download for transfer: ${transferId}`);

    const myUserId = utils.getSafeUserId();
    const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
    const myUsername = localStorage.getItem('username') || 'Anonymous';
    const myProfilePicture = localStorage.getItem('profilePicture') || null;

    let invokeFunc = window.tauriInvoke || (window.__TAURI__ && (window.__TAURI__.invoke || (window.__TAURI__.tauri && window.__TAURI__.tauri.invoke)));
    if (invokeFunc) {
        invokeFunc('download_file', {
            transferId: transferId,
            filePath: filePath,
            targetIp: targetIp,
            targetPort: targetPort,
            senderId: myUserId,
            senderName: myDisplayName,
            senderUsername: myUsername,
            senderProfilePicture: myProfilePicture
        })
            .then(() => {
                console.log('File download initiated successfully');
                updateFileTransferStatus(transferId, 'downloading');
            })
            .catch(err => {
                console.error('Error initiating file download:', err);
                updateFileTransferStatus(transferId, 'error');
            });
    }
}

export function handleFileDownload(transferId, fileName) {
    const downloadPath = `Downloads/${fileName}`;

    const targetUser = state.allUsers.find(user => user.id === state.activeChatUserId);
    if (!targetUser) {
        console.error('Cannot find target user for download');
        return;
    }

    initiateFileDownload(transferId, downloadPath, targetUser.ip, targetUser.port);
}

// Attach window functions
window.acceptFileOffer = function (transferId) {
    console.log(`Accepting file offer: ${transferId}`);

    updateFileTransferStatus(transferId, 'accepted');

    document.querySelectorAll(`button[id*="${transferId}"]`).forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.6';
    });

    const myUserId = utils.getSafeUserId();
    const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
    const myUsername = localStorage.getItem('username') || 'Anonymous';
    const myProfilePicture = localStorage.getItem('profilePicture') || null;

    let senderInfo = null;
    for (const userId in state.messages) {
        const userMessages = state.messages[userId];
        const fileMessage = userMessages.find(m =>
            m.fileTransfer && m.fileTransfer.transferId === transferId
        );
        if (fileMessage) {
            senderInfo = state.allUsers.find(u => u.id == userId);
            console.log(`Found sender for transfer:`, senderInfo);
            break;
        }
    }

    if (!senderInfo) {
        console.error(`Could not find sender information for transfer: ${transferId}`);
        updateFileTransferStatus(transferId, 'error');
        return;
    }

    const senderPort = senderInfo.port || state.MSG_PORT;

    console.log(`Sending accept response to ${senderInfo.ip}:${senderPort}`);

    let invokeFunc = state.globalInvokeFunc || window.tauriInvoke ||
        (window.__TAURI__ && (window.__TAURI__.invoke || (window.__TAURI__.tauri && window.__TAURI__.tauri.invoke)));

    if (invokeFunc) {
        invokeFunc('respond_to_file_offer', {
            transferId: transferId,
            accepted: true,
            senderId: myUserId,
            senderName: myDisplayName,
            senderUsername: myUsername,
            senderProfilePicture: myProfilePicture,
            targetIp: senderInfo.ip,
            targetPort: senderPort
        })
            .then(() => {
                console.log('File offer acceptance sent successfully');
                showNotification('File offer accepted! Waiting for transfer...');
            })
            .catch(err => {
                console.error('Error responding to file offer:', err);
                updateFileTransferStatus(transferId, 'error');
                showNotification('Failed to accept file offer', true);
            });
    }
};

window.rejectFileOffer = function (transferId) {
    console.log(`Rejecting file offer: ${transferId}`);

    updateFileTransferStatus(transferId, 'rejected');

    const buttons = document.querySelectorAll(`button[onclick*="${transferId}"]`);
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.6';
    });

    const myUserId = utils.getSafeUserId();
    const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
    const myUsername = localStorage.getItem('username') || 'Anonymous';
    const myProfilePicture = localStorage.getItem('profilePicture') || null;

    let senderInfo = null;
    for (const userId in state.messages) {
        const userMessages = state.messages[userId];
        const fileMessage = userMessages.find(m =>
            m.fileTransfer && m.fileTransfer.transferId === transferId
        );
        if (fileMessage) {
            senderInfo = state.allUsers.find(u => u.id == userId);
            break;
        }
    }

    let invokeFunc = state.globalInvokeFunc || window.tauriInvoke || (window.__TAURI__ && (window.__TAURI__.invoke || (window.__TAURI__.tauri && window.__TAURI__.tauri.invoke)));
    if (invokeFunc) {
        invokeFunc('respond_to_file_offer', {
            transferId: transferId,
            accepted: false,
            senderId: myUserId,
            senderName: myDisplayName,
            senderUsername: myUsername,
            senderProfilePicture: myProfilePicture,
            targetIp: senderInfo ? senderInfo.ip : null,
            targetPort: senderInfo ? senderInfo.port : state.MSG_PORT

        })
            .then(() => {
                console.log('File offer rejection sent successfully');
                showNotification('File offer declined');
            })
            .catch(err => {
                console.error('Error responding to file offer:', err);
                showNotification('Failed to decline file offer', true);
            });
    }
};
