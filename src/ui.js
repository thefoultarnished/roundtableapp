import { state } from './state.js';
import * as utils from './utils.js';
import { 
    sendMessageToBackend, 
    announcePresence, 
    logChatParticipants, 
    initiateFileDownload,
    logSessionStart,
    downloadFile
} from './network.js';

// Re-export needed functions if necessary, or just keep them here.

/**
 * Initializes all UI components and event handlers
 */
export function initializeUI() {
    const userListEl = document.getElementById('user-list');
    const welcomeScreenEl = document.getElementById('welcome-screen');
    const chatViewEl = document.getElementById('chat-view');
    const messagesContainerEl = document.getElementById('messages-container');
    const messageFormEl = document.getElementById('message-form');
    const messageInputEl = document.getElementById('message-input');
    const attachmentBtn = document.getElementById('attachment-btn');
    const fileInput = document.getElementById('file-input');
    const sendBtn = document.getElementById('send-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const settingsBtn = document.getElementById('settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
    const userSearchInput = document.getElementById('user-search-input');
    const smartReplyBtn = document.getElementById('smart-reply-btn');
    const summarizeBtn = document.getElementById('summarize-btn');
    const closeSummaryBtn = document.getElementById('close-summary-btn');
    const summaryModal = document.getElementById('summary-modal');
    const closeChatBtn = document.getElementById('close-chat-btn');

    if (!localStorage.getItem('port')) {
        localStorage.setItem('port', state.MSG_PORT);
    }

    [chatViewEl, messagesContainerEl, messageInputEl, messageFormEl].forEach(element => {
        element?.addEventListener('click', () => {
            clearUnreadForActiveChat();
        });
    });

    messageInputEl?.addEventListener('focus', () => {
        clearUnreadForActiveChat();
    });

    messagesContainerEl?.addEventListener('scroll', () => {
        clearUnreadForActiveChat();
    });

    messageInputEl?.addEventListener('input', () => {
        clearUnreadForActiveChat();
    });

    messageFormEl?.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = messageInputEl.value.trim();
        const targetUser = state.allUsers.find(user => user.id === state.activeChatUserId);

        if (!targetUser) {
            console.error("No active user selected to send a message.");
            return;
        }

        let messageSent = false;

        if (state.selectedFiles.length > 0) {
            messageSent = true;
            state.selectedFiles.forEach(file => {
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
                        transferId: transferId,
                        status: 'offered'
                    }
                };

                if (!state.messages[state.activeChatUserId]) state.messages[state.activeChatUserId] = [];
                state.messages[state.activeChatUserId].push(fileOfferMessage);

                // Use the global invoke function directly or through network module helper?
                // Using globalInvokeFunc from state
                let invokeFunc = state.globalInvokeFunc;
                 if (invokeFunc) {
                    invokeFunc('initiate_file_offer', {
                        targetId: targetUser.id,
                        targetIp: targetUser.ip,
                        targetPort: targetUser.port,
                        transferId: transferId,
                        fileName: file.name,
                        fileSize: file.size,
                        filePath: file.path,
                        senderId: myUserId,
                        senderName: myDisplayName,
                        senderUsername: myUsername,
                        senderProfilePicture: myProfilePicture
                    }).catch(err => console.error("Error initiating file offer:", err));
                }
            });
        }

        if (text) {
            messageSent = true;

            const newMessage = {
                sender: 'me',
                text: text,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                timestamp: Date.now(),
                files: []
            };

            if (!state.messages[state.activeChatUserId]) {
                state.messages[state.activeChatUserId] = [];
            }
            state.messages[state.activeChatUserId].push(newMessage);

            const messageEl = createMessageBubble(newMessage);
            messageEl.classList.add('slide-in-right');
            document.getElementById('messages-container').appendChild(messageEl);

            sendMessageToBackend(text, targetUser.ip, targetUser.port);
        }
        
         if (messageSent) {
            messageInputEl.value = '';
            adjustTextareaHeight(messageInputEl);
            // Clear selected files array in state
            state.selectedFiles.splice(0, state.selectedFiles.length);
            updateFilePreview();
            updateSendButton();
            scrollToBottom();
        }
    });
    
    // File attachment logic
    attachmentBtn?.addEventListener('click', async () => {
    if (!window.__TAURI__ || !window.__TAURI__.dialog || !window.__TAURI__.fs || !window.__TAURI__.path) {
      alert('File APIs are not available in this environment.');
      return;
    }

    try {
      attachmentBtn.classList.add('animate-pulse');

      const selected = await window.__TAURI__.dialog.open({
        multiple: true,
        title: 'Select Files to Send',
      });

      attachmentBtn.classList.remove('animate-pulse');

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        const filesToAdd = [];

        for (const path of paths) {
          try {
            console.log(`Processing selected file: ${path}`);
            const metadata = await window.__TAURI__.fs.stat(path);
            const fileName = await window.__TAURI__.path.basename(path);

            filesToAdd.push({
              name: fileName,
              path: path,
              size: metadata.size,
              type: '',
            });

          } catch (metaError) {
            console.error(`Could not get metadata for file: ${path}`, metaError);
            alert(`Error reading file metadata: ${path}\nError: ${metaError.message}`);
          }
        }

        state.selectedFiles.push(...filesToAdd);
        updateFilePreview();
        updateSendButton();

        attachmentBtn.classList.add('text-green-500', 'animate-bounce');
        setTimeout(() => {
          attachmentBtn.classList.remove('text-green-500', 'animate-bounce');
        }, 1000);
      }
    } catch (err) {
      console.error('Error opening file dialog:', err);
      attachmentBtn.classList.remove('animate-pulse');
      alert(`Error opening file selector: ${err.message}`);
    }
  });

  fileInput?.addEventListener('change', (e) => {
    state.selectedFiles.push(...Array.from(e.target.files));
    updateFilePreview();
    updateSendButton();
    fileInput.value = '';
    attachmentBtn.classList.add('text-green-500', 'animate-bounce');
    setTimeout(() => { attachmentBtn.classList.remove('text-green-500', 'animate-bounce'); }, 1000);
  });

  messageInputEl?.addEventListener('input', () => {
    updateSendButton();
    adjustTextareaHeight(messageInputEl);
  });

  messageInputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) {
        messageFormEl.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    }
  });
  
  // Search input
    userSearchInput?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    // Update displayedUsers in state
    // We need to re-assign state.displayedUsers. 
    // Since state is a const object, we can modify its properties.
    const filtered = state.allUsers.filter(user =>
      user.name.toLowerCase().includes(query) ||
      user.ip.includes(query)
    );
    // Clear and push to maintain reference if used elsewhere, or just replace
    state.displayedUsers.length = 0;
    state.displayedUsers.push(...filtered);
    
    renderUserList();

    userSearchInput.classList.add('ring-2', 'ring-blue-500/30');
    clearTimeout(userSearchInput.searchTimer);
    userSearchInput.searchTimer = setTimeout(() => {
      userSearchInput.classList.remove('ring-2', 'ring-blue-500/30');
    }, 500);
  });
  
  // Smart Reply Button
   smartReplyBtn?.addEventListener('click', async () => {
    if (!state.activeChatUserId) return;

    smartReplyBtn.classList.add('animate-spin');
    const originalText = smartReplyBtn.innerHTML;
    smartReplyBtn.innerHTML = '⚡';

    const userMessages = state.messages[state.activeChatUserId] || [];
    const lastMessage = userMessages.filter(m => m.sender !== 'me').pop();
    
      const aiSuggestionsContainer = document.getElementById('ai-suggestions-container');

    if (!lastMessage || !lastMessage.text) {
      aiSuggestionsContainer.innerHTML = `<p class="text-sm text-slate-500 animate-pulse">No message to reply to.</p>`;
      smartReplyBtn.classList.remove('animate-spin');
      smartReplyBtn.innerHTML = originalText;
      return;
    }

    aiSuggestionsContainer.innerHTML = `<div class="flex items-center gap-2 text-sm text-purple-400 animate-pulse">
      <div class="w-4 h-4 bg-purple-500 rounded-full animate-bounce"></div>
      <div class="w-4 h-4 bg-purple-500 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
      <div class="w-4 h-4 bg-purple-500 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
      <span class="ml-2">AI is thinking...</span>
    </div>`;
  });
  
  // Summarize Button
    summarizeBtn?.addEventListener('click', async () => {
    if (!state.activeChatUserId) return;
    const userMessages = state.messages[state.activeChatUserId] || [];
    if (userMessages.length === 0) return;

    summarizeBtn.classList.add('animate-spin');
    const summaryModal = document.getElementById('summary-modal');
    const summaryContent = document.getElementById('summary-content');

    summaryModal.classList.remove('hidden');

    summaryContent.innerHTML = `<div class="flex flex-col items-center gap-4">
      <div class="w-16 h-16 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center animate-spin">
        <span class="text-2xl">🧠</span>
      </div>
      <p class="text-lg text-indigo-400 animate-pulse">AI is reading and analyzing the conversation...</p>
      <div class="flex gap-2">
        <div class="w-3 h-3 bg-indigo-500 rounded-full animate-bounce"></div>
        <div class="w-3 h-3 bg-purple-500 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
        <div class="w-3 h-3 bg-pink-500 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
      </div>
    </div>`;
  });
  
   closeSummaryBtn?.addEventListener('click', () => {
    document.getElementById('summary-modal').classList.add('hidden');
  });

  document.getElementById('summary-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('summary-modal')) {
      document.getElementById('summary-modal').classList.add('hidden');
    }
  });
  
  // Settings
  settingsBtn?.addEventListener('click', () => {
    settingsBtn.classList.add('animate-spin');
    setTimeout(() => settingsBtn.classList.remove('animate-spin'), 300);
    showSettings();
  });

  closeChatBtn?.addEventListener('click', closeActiveChat);
  closeSettingsBtn?.addEventListener('click', closeSettings);
  cancelSettingsBtn?.addEventListener('click', closeSettings);
  
  // Save Settings
    document.getElementById('save-settings-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();

    const username = document.getElementById('settings-username').value;
    const displayName = document.getElementById('settings-displayname').value;
    const fontSize = document.getElementById('font-size-slider').value;
    const autoDownload = document.getElementById('settings-auto-download').checked;

    const oldDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
    const oldUsername = localStorage.getItem('username') || 'Anonymous';

    localStorage.setItem('username', username);
    localStorage.setItem('displayName', displayName);
    localStorage.setItem('fontSizeScale', fontSize);
    localStorage.setItem('autoDownloadFiles', autoDownload);

    renderMyUserProfileFooter();

    document.documentElement.style.setProperty('--font-size-scale', fontSize / 100);

    const nameChanged = displayName !== oldDisplayName;
    const usernameChanged = username !== oldUsername;

    const saveBtn = document.getElementById('save-settings-btn');
    saveBtn.classList.add('animate-pulse', 'bg-green-500');

    if (nameChanged || usernameChanged) {
      console.log(`Name changed from "${oldDisplayName}" to "${displayName}"`);

      const myUserId = utils.getSafeUserId();
      const myUserIndex = state.allUsers.findIndex(u => u.id === myUserId);
      if (myUserIndex !== -1) {
        state.allUsers[myUserIndex].name = displayName;
        // update displayedUsers
        state.displayedUsers = [...state.allUsers];
        renderUserList();
      }

      saveBtn.textContent = 'Broadcasting Name Change...';

      announcePresence();

      setTimeout(() => announcePresence(), 1000);
      setTimeout(() => announcePresence(), 2000);

      saveBtn.textContent = 'Name Updated! ✓';
      showNotification(`Name changed to "${displayName}"`);

    } else {
      saveBtn.textContent = 'Saved! ✓';
    }

    setTimeout(() => {
      saveBtn.classList.remove('animate-pulse', 'bg-green-500');
      saveBtn.textContent = 'Save Changes';
      closeSettings();
    }, 1500);
  });
  
  // Refresh Users
    document.getElementById('refresh-users')?.addEventListener('click', (e) => {
    const button = e.currentTarget;
    button.classList.add('animate-spin');

    announcePresence();
    state.globalInvokeFunc('broadcast_discovery_query');
    showNotification('Searching for users...');
    if (!localStorage.getItem('port')) {
      localStorage.setItem('port', state.MSG_PORT);
    }

    setTimeout(() => {
      button.classList.remove('animate-spin');
    }, 1000);
  });
  
}

// ... Additional helper functions like adjustTextareaHeight, createMessageBubble, etc.

export function adjustTextareaHeight(textarea) {
  textarea.style.height = 'auto';

  const style = window.getComputedStyle(textarea);
  const paddingTop = parseFloat(style.paddingTop);
  const paddingBottom = parseFloat(style.paddingBottom);
  const lineHeight = parseFloat(style.lineHeight) || 24;

  const maxContentHeight = 6 * lineHeight;
  const maxHeight = maxContentHeight + paddingTop + paddingBottom;
  const minHeight = 48;
  const requiredHeight = Math.max(textarea.scrollHeight, minHeight);

  if (requiredHeight > maxHeight) {
    textarea.style.height = `${maxHeight}px`;
    textarea.style.overflowY = 'auto';
  } else {
    textarea.style.height = `${requiredHeight}px`;
    textarea.style.overflowY = 'hidden';
  }
}

export function renderUserList() {
  const userListEl = document.getElementById('user-list');
  if (!userListEl) return;

  userListEl.innerHTML = '';
  state.displayedUsers.forEach(user => {
    const userEl = document.createElement('div');
    userEl.className = `user-item flex items-center p-2 m-1 rounded-xl cursor-pointer hover:bg-slate-200/40 dark:hover:bg-slate-700/40 transition-all duration-300 ${user.id === state.activeChatUserId ? 'bg-gradient-to-r from-slate-200/60 to-slate-300/60 dark:from-slate-700/60 dark:to-slate-600/60 shadow-md' : ''}`;
    userEl.dataset.userId = user.id;

    const statusClass = user.status === 'online' ? 'bg-green-500' : 'bg-slate-500';
    const glowClass = user.status === 'online' ? 'status-online-glow' : '';
    const unreadCount = state.unreadCounts[user.id] || 0;

    const unreadBadgeHtml = unreadCount > 0
      ? `<div class="unread-badge ml-auto px-2 py-0.5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold rounded-full shadow-lg ring-2 ring-white dark:ring-slate-800 animate-pulse min-w-[1.5rem] flex items-center justify-center">${unreadCount > 99 ? '99+' : unreadCount}</div>`
      : '';

    const avatarHtml = user.profile_picture
      ? `<img src="${user.profile_picture}" class="w-10 h-10 rounded-full object-cover shadow-lg">`
      : `<div class="w-10 h-10 rounded-full bg-gradient-to-br ${user.avatarGradient} flex items-center justify-center font-bold text-white text-lg shadow-lg">${user.name.charAt(0)}</div>`;

    userEl.innerHTML = `
      <div class="relative mr-3 flex-shrink-0">
        ${avatarHtml}
        <span class="absolute bottom-0 right-0 block h-3 w-3 rounded-full ${statusClass} border-2 border-white dark:border-slate-800 ${glowClass}"></span>
      </div>
      <div class="flex-grow overflow-hidden min-w-0">
        <p class="font-semibold text-slate-800 dark:text-white truncate">${user.name}</p>
        <p class="text-sm text-slate-500 dark:text-slate-400 font-mono truncate">${user.ip}</p>
      </div>
      ${unreadBadgeHtml}
    `;

    userEl.addEventListener('click', () => handleUserClick(user.id));
    userListEl.appendChild(userEl);
  });

  updateTitlebarStatus();
}

export function handleUserClick(userId) {
  if (userId === state.activeChatUserId) {
    console.log(`Chat with user ${userId} is already active. No re-render needed.`);
    clearUnreadForActiveChat();
    return;
  }
  state.activeChatUserId = userId;
  clearUnreadForActiveChat();
  renderUserList();
  renderChatWindow();
  const targetUser = state.allUsers.find(user => user.id === userId);
  if (targetUser) {
    logChatParticipants(targetUser);
  }
  const userEl = document.querySelector(`[data-user-id="${userId}"]`);
  if (userEl) {
    userEl.classList.add('animate-pulse');
    setTimeout(() => userEl.classList.remove('animate-pulse'), 1000);
  }
}

export function renderMyUserProfileFooter() {
  const usernameEl = document.getElementById('footer-username');
  const pfpImgEl = document.getElementById('footer-pfp-img');
  const pfpInitialEl = document.getElementById('footer-pfp-initial');
  const settingsBtn = document.getElementById('footer-settings-btn');

  if (!usernameEl || !pfpImgEl || !pfpInitialEl || !settingsBtn) {
    console.error("User profile footer elements not found!");
    return;
  }

  const displayName = localStorage.getItem('displayName') || 'New User';
  const username = localStorage.getItem('username') || 'anonymous';
  const profilePicture = localStorage.getItem('profilePicture');

  usernameEl.textContent = `${displayName} (@${username})`;

  if (profilePicture) {
    pfpImgEl.src = profilePicture;
    pfpImgEl.classList.remove('hidden');
    pfpInitialEl.classList.add('hidden');
  } else {
    pfpImgEl.classList.add('hidden');
    pfpInitialEl.classList.remove('hidden');
    pfpInitialEl.textContent = displayName.charAt(0).toUpperCase();
  }

  settingsBtn.addEventListener('click', showSettings);
}

export function renderChatWindow() {
  const welcomeScreenEl = document.getElementById('welcome-screen');
  const chatViewEl = document.getElementById('chat-view');
  const chatHeaderAvatarEl = document.getElementById('chat-header-avatar');
  const chatHeaderNameEl = document.getElementById('chat-header-name');
  const chatHeaderStatusEl = document.getElementById('chat-header-status');
  const messagesContainerEl = document.getElementById('messages-container');
  const aiSuggestionsContainer = document.getElementById('ai-suggestions-container');

  if (!welcomeScreenEl || !chatViewEl) return;

  if (!state.activeChatUserId) {
    welcomeScreenEl.style.display = 'flex';
    chatViewEl.style.display = 'none';
    return;
  }

  welcomeScreenEl.style.display = 'none';
  chatViewEl.style.display = 'flex';
  if (aiSuggestionsContainer) aiSuggestionsContainer.innerHTML = '';

  const user = state.allUsers.find(u => u.id === state.activeChatUserId);
  if (!user) return;

  if (user.profile_picture) {
    chatHeaderAvatarEl.className = 'w-12 h-12 rounded-full flex-shrink-0 shadow-lg';
    chatHeaderAvatarEl.innerHTML = `<img src="${user.profile_picture}" class="w-full h-full rounded-full object-cover">`;
  } else {
    chatHeaderAvatarEl.className = `w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-xl flex-shrink-0 bg-gradient-to-br ${user.avatarGradient} shadow-lg`;
    chatHeaderAvatarEl.innerHTML = user.name.charAt(0);
  }

  const usernameDisplay = user.username ? `<span class="text-base font-normal text-slate-500 dark:text-slate-400 ml-2">(@${user.username})</span>` : '';
  chatHeaderNameEl.innerHTML = `${user.name}${usernameDisplay}`;

  const statusColor = user.status === 'online' ? 'text-green-400' : 'text-slate-400';
  let statusLine = `<span class="${statusColor}">● ${user.status}</span> <span class="text-slate-500">&middot;</span> ${user.ip}`;
  if (user.hostname) {
    statusLine += ` <span class="text-slate-500">&middot;</span> <span class="hidden md:inline">${user.hostname}</span>`;
  }
  chatHeaderStatusEl.innerHTML = statusLine;

  const userMessages = state.messages[state.activeChatUserId] || [];
  const wasAtBottom = utils.isScrolledToBottom(messagesContainerEl);

  messagesContainerEl.innerHTML = '';
  const fragment = document.createDocumentFragment();
  const groupedMessages = utils.groupMessagesByDate(userMessages);

  groupedMessages.forEach(group => {
    const dateHeader = document.createElement('div');
    dateHeader.className = 'flex justify-center my-4';
    dateHeader.innerHTML = `<div class="bg-slate-200/70 dark:bg-slate-700/70 rounded-full px-4 py-1 text-xs text-slate-600 dark:text-slate-300 backdrop-blur-sm">${group.dateLabel}</div>`;
    fragment.appendChild(dateHeader);

    group.messages.forEach(message => {
      const messageEl = createMessageBubble(message);
      fragment.appendChild(messageEl);
    });
  });

  messagesContainerEl.appendChild(fragment);

  if (wasAtBottom) {
    scrollToBottom(true);
  }
}

export function createMessageBubble(message) {
  const isSentByMe = message.sender === 'me';
  const bubbleWrapper = document.createElement('div');
  bubbleWrapper.className = `flex w-full ${isSentByMe ? 'justify-end' : 'justify-start'} my-1`;
  const animationClass = isSentByMe ? 'slide-in-right' : 'slide-in-left';

  if (message.fileTransfer) {
    const ft = message.fileTransfer;
    const fileSizeMb = (ft.fileSize / 1024 / 1024).toFixed(2);
    let statusHtml = '';

    switch (ft.status) {
      case 'offered':
        statusHtml = `<p class="text-sm text-slate-500 dark:text-slate-400">${fileSizeMb} MB · <span class="text-teal-500 font-semibold">Offer Sent</span></p>`;
        break;
      case 'incoming':
        const acceptBtnId = `accept-${ft.transferId}`;
        const rejectBtnId = `reject-${ft.transferId}`;

        statusHtml = `
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-2">${fileSizeMb} MB · Wants to send you a file.</p>
          <div class="flex gap-2 mt-1">
            <button id="${rejectBtnId}" class="flex-1 bg-red-500/20 hover:bg-red-500/40 text-red-700 dark:text-red-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300">Decline</button>
            <button id="${acceptBtnId}" class="flex-1 bg-green-500/20 hover:bg-green-500/40 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300">Accept</button>
          </div>`;

        setTimeout(() => {
          const acceptBtn = document.getElementById(acceptBtnId);
          const rejectBtn = document.getElementById(rejectBtnId);

          if (acceptBtn) {
            acceptBtn.addEventListener('click', () => window.acceptFileOffer(ft.transferId));
          }
          if (rejectBtn) {
            rejectBtn.addEventListener('click', () => window.rejectFileOffer(ft.transferId));
          }
        }, 100);
        break;
      case 'accepted':
           statusHtml = `<p class="text-sm text-slate-500 dark:text-slate-400">${fileSizeMb} MB · <span class="text-green-500 font-semibold">Accepted, starting transfer...</span></p>`;
        break;
      case 'downloading':
        const progress = ft.progress || 0;
        statusHtml = `
          <p class="text-sm text-slate-500 dark:text-slate-400">${fileSizeMb} MB</p>
          <div class="w-full bg-gray-200 rounded-full h-2.5 mb-2 dark:bg-gray-700">
            <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${progress}%"></div>
          </div>
          <p class="text-xs text-blue-500 font-semibold">Downloading... ${progress}%</p>
        `;
        break;
      case 'completed':
        statusHtml = `<p class="text-sm text-slate-500 dark:text-slate-400">${fileSizeMb} MB · <span class="text-green-500 font-semibold">Download Complete</span></p>`;
        break;
      case 'failed':
        statusHtml = `<p class="text-sm text-slate-500 dark:text-slate-400">${fileSizeMb} MB · <span class="text-red-500 font-semibold">Transfer Failed</span></p>`;
        break;
      case 'rejected':
        statusHtml = `<p class="text-sm text-slate-500 dark:text-slate-400">${fileSizeMb} MB · <span class="text-red-500 font-semibold">Offer Rejected</span></p>`;
        break;
      default:
        statusHtml = `<p class="text-sm text-slate-500 dark:text-slate-400">${fileSizeMb} MB</p>`;
    }

    const fileBubbleHtml = `
      <div class="flex items-center gap-3 p-3 bg-slate-200 dark:bg-slate-700 rounded-xl max-w-sm shadow-md ${animationClass}">
        <div class="w-12 h-12 bg-slate-300 dark:bg-slate-600 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
          ${utils.getFileIcon(ft.fileType || '')}
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-slate-800 dark:text-white truncate">${ft.fileName}</p>
          ${statusHtml}
        </div>
      </div>`;

    bubbleWrapper.innerHTML = `
      <div class="flex items-end gap-2 max-w-[85%]">
        ${isSentByMe ? `<div class="text-[0.7rem] text-slate-500 dark:text-slate-400 pb-1 flex-shrink-0">${message.time}</div>` : ''}
        ${fileBubbleHtml}
        ${!isSentByMe ? `<div class="text-[0.7rem] text-slate-500 dark:text-slate-400 pb-1 flex-shrink-0">${message.time}</div>` : ''}
      </div>`;

    return bubbleWrapper;
  }
  
  // Normal text bubbles ...
    const bubbleContent = document.createElement('div');
  bubbleContent.className = `flex items-end gap-2 max-w-[85%] ${animationClass}`;

  const senderUser = isSentByMe ? null : state.allUsers.find(u => u.id === message.sender);
  const myProfilePicture = localStorage.getItem('profilePicture');

  let senderAvatarHtml = '';
  if (!isSentByMe) {
    if (senderUser && senderUser.profile_picture) {
      senderAvatarHtml = `<img src="${senderUser.profile_picture}" class="w-12 h-12 rounded-full object-cover shadow-lg flex-shrink-0">`;
    } else {
      const avatarInitial = senderUser ? senderUser.name.charAt(0) : '?';
      const avatarGradient = senderUser ? senderUser.avatarGradient : 'from-gray-500 to-gray-600';
      senderAvatarHtml = `<div class="w-12 h-12 rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center font-bold text-white flex-shrink-0 shadow-lg">${avatarInitial}</div>`;
    }
  }

  let myAvatarHtml = '';
  if (isSentByMe) {
    if (myProfilePicture) {
      myAvatarHtml = `<img src="${myProfilePicture}" class="w-12 h-12 rounded-full object-cover shadow-lg flex-shrink-0">`;
    } else {
      const avatarGradient = 'from-purple-500 to-indigo-600';
      myAvatarHtml = `<div class="w-12 h-12 rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center font-bold text-white flex-shrink-0 shadow-lg">U</div>`;
    }
  }

  const messageColor = isSentByMe
    ? 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white'
    : 'bg-slate-200/80 dark:bg-slate-700/80 text-slate-800 dark:text-white';

  let textHtml = '';
  if (message.text) {
    const escapedText = message.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const formattedText = escapedText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="underline text-blue-400 hover:text-blue-300 transition-colors">\$1</a>');
    textHtml = `<p class="leading-normal break-words">${formattedText}</p>`;
  }

  const timestampHtml = `<div class="text-[0.7rem] text-slate-500 dark:text-slate-400 pb-1 flex-shrink-0">${message.time}</div>`;

  bubbleContent.innerHTML = `
    ${!isSentByMe ? senderAvatarHtml : ''}
    ${isSentByMe ? timestampHtml : ''}
    <div class="flex-1 min-w-0">
      <div class="px-4 py-1.5 rounded-2xl shadow-lg ${messageColor} ${isSentByMe ? 'rounded-br-lg' : 'rounded-bl-lg'}">
        ${textHtml}
      </div>
    </div>
    ${!isSentByMe ? timestampHtml : ''}
    ${isSentByMe ? myAvatarHtml : ''}
  `;

  bubbleWrapper.appendChild(bubbleContent);
  return bubbleWrapper;
}

export function scrollToBottom(instant = false) {
  const messagesContainerEl = document.getElementById('messages-container');
  if (!messagesContainerEl) return;

  if (!instant) {
    const isNearBottom = messagesContainerEl.scrollHeight - messagesContainerEl.scrollTop <=
      messagesContainerEl.clientHeight + 100;

    if (isNearBottom) {
      messagesContainerEl.scrollTo({
        top: messagesContainerEl.scrollHeight,
        behavior: 'smooth'
      });
    } else {
      messagesContainerEl.scrollTo({
        top: messagesContainerEl.scrollHeight,
        behavior: 'auto'
      });
    }
  } else {
    messagesContainerEl.scrollTo({
      top: messagesContainerEl.scrollHeight,
      behavior: 'auto'
    });
  }
  messagesContainerEl.dataset.manuallyScrolled = 'true';
}

export function showSettings() {
    const settingsModal = document.getElementById('settings-modal');
    if (!settingsModal) return;

    const savedUsername = localStorage.getItem('username') || 'RoundtableUser';
    const savedDisplayName = localStorage.getItem('displayName') || 'Your Name';

    document.getElementById('settings-username').value = savedUsername;
    document.getElementById('settings-displayname').value = savedDisplayName;
    document.getElementById('settings-auto-download').checked = localStorage.getItem('autoDownloadFiles') === 'true';

    settingsModal.classList.remove('hidden');

    if (!localStorage.getItem('userId')) {
        localStorage.setItem('userId', Math.floor(Math.random() * 100000000));
    }

    const content = settingsModal.querySelector('.glassmorphism');
    if (content) content.classList.remove('scale-95', 'opacity-0');
}

export function closeSettings() {
    const settingsModal = document.getElementById('settings-modal');
    if (!settingsModal) return;

    const content = settingsModal.querySelector('.glassmorphism');
    if (content) content.classList.add('scale-95', 'opacity-0');

    setTimeout(() => {
        settingsModal.classList.add('hidden');
    }, 300);
}

export function showNotification(message, isError = false) {
    const notif = document.createElement('div');
    notif.className = 'fixed top-12 right-4 bg-black/20 backdrop-blur-md border border-white/20 text-white px-4 py-2 rounded-lg shadow-lg transform transition-all duration-500 opacity-0 translate-x-4 z-50 cursor-pointer hover:bg-black/30';

    if (message.includes(' - ')) {
        const [username, messageContent] = message.split(' - ', 2);
        notif.innerHTML = `<span class="text-green-300 font-semibold">${username}</span> - <span class="text-white">${messageContent}</span>`;
    } else {
        notif.textContent = message;
    }

    document.body.appendChild(notif);

    setTimeout(() => {
        notif.style.opacity = '1';
        notif.style.transform = 'translateX(0)';
    }, 10);

    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translateX(4px)';
        setTimeout(() => notif.remove(), 500);
    }, 4000);
}

export function updateTitlebarStatus() {
    const titlebarStatus = document.getElementById('titlebar-status');
    const sidebarStatus = document.getElementById('sidebar-status');

    const onlineCount = state.allUsers.filter(u => u.status === 'online').length;

    const statusHTML = `
    <span class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
    <span>Connected (${onlineCount} user online)</span>
  `;

    if (titlebarStatus) {
        titlebarStatus.className = 'flex items-center gap-1 text-green-400 font-medium text-xs';
        titlebarStatus.innerHTML = statusHTML;
    }

    if (sidebarStatus) {
        sidebarStatus.className = 'pt-2 flex items-center justify-center gap-2 text-green-400 font-medium text-xs';
        sidebarStatus.innerHTML = statusHTML;
    }
}

export function clearUnreadForActiveChat() {
    if (state.activeChatUserId && state.unreadCounts[state.activeChatUserId] > 0) {
        console.log(`Clearing ${state.unreadCounts[state.activeChatUserId]} unread messages for active chat ${state.activeChatUserId}`);

        const userEl = document.querySelector(`[data-user-id="${state.activeChatUserId}"]`);
        const badge = userEl?.querySelector('.unread-badge');
        if (badge) {
            badge.style.transform = 'scale(1.2)';
            badge.style.opacity = '0.7';
            setTimeout(() => {
                badge.style.transform = 'scale(0)';
                badge.style.opacity = '0';
            }, 150);
        }

        setTimeout(() => {
            state.unreadCounts[state.activeChatUserId] = 0;
            renderUserList();
        }, 300);
    }
}

export function createParticles() {
  const particlesContainer = document.getElementById('particles-container');
  if (!particlesContainer) {
    console.error('Particles container not found');
    return;
  }
  
  const particleCount = 50;
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 20 + 's';
    particle.style.animationDuration = (15 + Math.random() * 10) + 's';
    particlesContainer.appendChild(particle);
  }
}

export function initializeModernToggle() {
    const toggle = document.getElementById('theme-toggle');
    const label = toggle.closest('.modern-toggle');

    if (!toggle || !label) return;

    label.addEventListener('click', (e) => {
        createClickParticles(e, label);
        label.style.transform = 'scale(0.95)';
        setTimeout(() => {
            label.style.transform = '';
        }, 100);
    });
}

function createClickParticles(event, element) {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    for (let i = 0; i < 6; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: 4px;
      height: 4px;
      background: ${document.documentElement.classList.contains('dark') ? '#667eea' : '#fbbf24'};
      border-radius: 50%;
      pointer-events: none;
      z-index: 1000;
    `;

        document.body.appendChild(particle);

        const angle = (i / 6) * Math.PI * 2;
        const velocity = 50 + Math.random() * 50;
        const vx = Math.cos(angle) * velocity;
        const vy = Math.sin(angle) * velocity;

        let px = 0, py = 0, opacity = 1;

        function animate() {
            px += vx * 0.02;
            py += vy * 0.02;
            opacity -= 0.02;

            particle.style.transform = `translate(${px}px, ${py}px)`;
            particle.style.opacity = opacity;

            if (opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                document.body.removeChild(particle);
            }
        }
        animate();
    }
}

export function initializeResizer() {
    const resizeHandle = document.getElementById('resize-handle');
    const userListContainer = document.getElementById('user-list-container');

    if (!resizeHandle || !userListContainer) {
        console.warn('Resize elements not found');
        return;
    }

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const savedWidth = localStorage.getItem('userListWidth');
    if (savedWidth) {
        const width = parseInt(savedWidth, 10);
        if (width >= 250 && width <= 500) {
            userListContainer.style.width = width + 'px';
        }
    }

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = parseInt(window.getComputedStyle(userListContainer).width, 10);

        resizeHandle.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const diff = e.clientX - startX;
        const newWidth = startWidth + diff;

        const minWidth = 250;
        const maxWidth = Math.min(500, window.innerWidth * 0.6);
        const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        userListContainer.style.width = constrainedWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizeHandle.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            const currentWidth = parseInt(window.getComputedStyle(userListContainer).width, 10);
            localStorage.setItem('userListWidth', currentWidth);

            showResizeNotification(currentWidth);
        }
    });

    resizeHandle.addEventListener('dblclick', () => {
        userListContainer.style.width = '320px';
        localStorage.setItem('userListWidth', '320');
        showResizeNotification(320, 'Reset to default width');
    });
}

function showResizeNotification(width, customMessage = null) {
    const notification = document.createElement('div');
    notification.className = 'fixed top-12 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-4 py-2 rounded-xl shadow-lg z-50 transition-all duration-300 opacity-0 glassmorphism';
    notification.textContent = customMessage || `Sidebar width: ${width}px`;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translate(-50%, 0)';
    }, 10);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, -10px)';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

export function closeActiveChat() {
    state.activeChatUserId = null;
    renderUserList();
    renderChatWindow();
}

 export function showBeautifulNotification(senderName, messageContent) {
  createGlassmorphismNotification(senderName, messageContent);
  
  utils.isWindowVisible().then(visible => {
    if (!visible && window.__TAURI__) {
       window.__TAURI__.notification.sendNotification({
        title: `💬 ${senderName}`,
        body: messageContent.length > 50 ? messageContent.substring(0, 47) + "..." : messageContent,
        icon: "icons/128x128.png"
      });
    }
  });
}

function createGlassmorphismNotification(senderName, messageContent) {
  const existingNotif = document.querySelector('.glassmorphism-notification');
  if (existingNotif) {
    existingNotif.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = 'glassmorphism-notification fixed top-4 right-4 z-[9999] pointer-events-auto';
  
  const truncatedMessage = messageContent.length > 60 
    ? messageContent.substring(0, 57) + "..." 
    : messageContent;
  
  notification.innerHTML = `
    <div class="glassmorphism bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border border-white/30 dark:border-slate-700/30 rounded-2xl p-4 shadow-2xl transform transition-all duration-500 opacity-0 translate-x-8 hover:scale-105 min-w-[300px] max-w-[400px]">
      <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl"></div>
      <div class="relative z-10">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold text-white text-sm shadow-lg">
            ${senderName.charAt(0)}
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-slate-800 dark:text-white truncate">${senderName}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">New message</p>
          </div>
          <button class="close-notification w-6 h-6 rounded-full bg-slate-200/50 dark:bg-slate-700/50 hover:bg-red-500/20 text-slate-600 dark:text-slate-300 hover:text-red-500 transition-all duration-300 flex items-center justify-center text-sm font-bold">
            ×
          </button>
        </div>
        <div class="bg-slate-100/50 dark:bg-slate-700/30 rounded-xl p-3 backdrop-blur-sm">
          <p class="text-slate-700 dark:text-slate-200 text-sm leading-relaxed break-words">
            ${truncatedMessage}
          </p>
        </div>
        <div class="flex gap-2 mt-3">
          <button class="reply-btn flex-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-500/30 text-purple-700 dark:text-purple-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 hover:scale-105">
            Reply
          </button>
          <button class="view-btn flex-1 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 hover:from-blue-500/30 hover:to-cyan-500/30 border border-blue-500/30 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 hover:scale-105">
            View Chat
          </button>
        </div>
      </div>
      <div class="absolute top-2 left-2 w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-lg"></div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    const notifElement = notification.querySelector('.glassmorphism');
    notifElement.style.opacity = '1';
    notifElement.style.transform = 'translateX(0)';
  }, 10);
  
  const closeBtn = notification.querySelector('.close-notification');
  const replyBtn = notification.querySelector('.reply-btn');
  const viewBtn = notification.querySelector('.view-btn');
  
  closeBtn.addEventListener('click', () => {
    removeNotification(notification);
  });
  
  replyBtn.addEventListener('click', () => {
    const sender = state.allUsers.find(u => u.name === senderName);
    if (sender) {
      handleUserClick(sender.id);
      setTimeout(() => {
        document.getElementById('message-input')?.focus();
      }, 100);
    }
    removeNotification(notification);
  });
  
  viewBtn.addEventListener('click', () => {
    const sender = state.allUsers.find(u => u.name === senderName);
    if (sender) {
      handleUserClick(sender.id);
    }
    removeNotification(notification);
  });
  
  setTimeout(() => {
    removeNotification(notification);
  }, 2100);
}

function removeNotification(notification) {
  const notifElement = notification.querySelector('.glassmorphism');
  notifElement.style.opacity = '0';
  notifElement.style.transform = 'translateX(8px)';
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 500);
}

export function updateFilePreview() {
  const filePreviewContainer = document.getElementById('file-preview-container');
  const filePreview = document.getElementById('file-preview');
  if (!filePreviewContainer || !filePreview) return;

  if (state.selectedFiles.length === 0) {
    filePreviewContainer.classList.add('hidden');
    return;
  }
  filePreviewContainer.classList.remove('hidden');
  filePreview.innerHTML = '';

  state.selectedFiles.forEach((file, index) => {
    const fileItem = document.createElement('div');
    fileItem.className = 'flex items-center gap-3 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800/50 dark:to-slate-700/50 p-3 rounded-lg text-sm shadow-sm hover:shadow-md transition-all duration-300 transform hover:scale-[1.02] group';
    const fileName = file.name.length > 20 ? `${file.name.substring(0, 18)}...` : file.name;
    fileItem.innerHTML = `
      <span class="text-xl animate-float group-hover:scale-110 transition-transform duration-300">${utils.getFileIcon(file.type)}</span>
      <span class="text-slate-800 dark:text-slate-200 font-medium flex-1">${fileName}</span>
      <span class="text-xs text-slate-500 dark:text-slate-400">${(file.size / 1024 / 1024).toFixed(2)}MB</span>
      <button class="ml-2 w-6 h-6 rounded-full bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 flex items-center justify-center group-hover:scale-110" onclick="window.removeFile(${index})">&times;</button>
    `;
    filePreview.appendChild(fileItem);
  });
}

export function updateSendButton() {
  const sendBtn = document.getElementById('send-btn');
  const messageInputEl = document.getElementById('message-input');
  if (!sendBtn || !messageInputEl) return;

  const hasContent = messageInputEl.value.trim().length > 0 || state.selectedFiles.length > 0;
  sendBtn.disabled = !hasContent;

  if (hasContent) {
    sendBtn.classList.add('enabled-glow');
  } else {
    sendBtn.classList.remove('enabled-glow');
  }
}

// Attach window functions that are called from HTML strings
window.removeFile = (index) => {
  state.selectedFiles.splice(index, 1);
  updateFilePreview();
  updateSendButton();

  const fileItems = document.getElementById('file-preview')?.children;
  if (fileItems && fileItems[index]) {
    fileItems[index].style.transform = 'scale(0)';
    fileItems[index].style.opacity = '0';
    setTimeout(() => updateFilePreview(), 300);
  }
};
