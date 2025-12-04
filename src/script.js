const messages = {};
let allUsers = [];
let displayedUsers = [...allUsers];
let discoveredUsers = [];
let activeChatUserId = null;
let selectedFiles = [];
let unreadCounts = {};
let globalInvokeFunc = null;

const MSG_PORT = window.__TAURI__ && window.__TAURI__.__tauriVersion ? 2427 : 2426;

console.log(`Using message port: ${MSG_PORT}`);
console.log("TAURI INSPECTOR");

if (window.__TAURI__) {
  console.log("Available at window.__TAURI__:", Object.keys(window.__TAURI__));
  
  if (window.__TAURI__.invoke) {
    console.log("invoke found at window.__TAURI__.invoke");
  } else {
    console.log("Not found at window.__TAURI__.invoke");
  }
  
  if (window.__TAURI__.tauri && window.__TAURI__.tauri.invoke) {
    console.log("invoke found at window.__TAURI__.tauri.invoke");
  } else {
    console.log("Not found at window.__TAURI__.tauri.invoke");
  }
  
  function findInvoke(obj, path = 'window.__TAURI__') {
    if (!obj) return;
    
    for (const key in obj) {
      const currentPath = `${path}.${key}`;
      if (key === 'invoke' && typeof obj[key] === 'function') {
        console.log(`invoke found at ${currentPath}`);
        return obj[key];
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        const result = findInvoke(obj[key], currentPath);
        if (result) return result;
      }
    }
    return null;
  }
  
  const invokeFunc = findInvoke(window.__TAURI__);
  if (invokeFunc) {
    console.log("Found invoke function, adding to window.tauriInvoke");
    window.tauriInvoke = invokeFunc;
  } else {
    console.log("Could not find invoke function anywhere in __TAURI__");
  }
}

console.log("TAURI VERSION CHECK");
if (window.__TAURI__) {
  if (window.__TAURI__.__tauriVersion) {
    console.log(`Tauri Version: ${window.__TAURI__.__tauriVersion}`);
  } else {
    console.log("Tauri version information not available");
  }
}

/**
 * Checks if the application window is currently focused
 */
async function isWindowFocused() {
  if (!window.__TAURI__ || !window.__TAURI__.window) {
    console.warn("Tauri window API not available - assuming not focused");
    return false;
  }
  
  try {
    const appWindow = window.__TAURI__.window.getCurrentWindow();
    const focused = await appWindow.isFocused();
    console.log(`Window focused: ${focused}`);
    return focused;
  } catch (error) {
    console.error("Error checking window focus:", error);
    return false;
  }
}

/**
 * Checks if the application window is visible (not minimized)
 */
async function isWindowVisible() {
  if (!window.__TAURI__ || !window.__TAURI__.window) {
    console.warn("Tauri window API not available - assuming not visible");
    return false;
  }
  
  try {
    const appWindow = window.__TAURI__.window.getCurrentWindow();
    const minimized = await appWindow.isMinimized();
    console.log(`Window minimized: ${minimized} (visible: ${!minimized})`);
    return !minimized;
  } catch (error) {
    console.error("Error checking window visibility:", error);
    return false;
  }
}

/**
 * Adjusts textarea height to fit content, up to a maximum of 6 lines
 */
function adjustTextareaHeight(textarea) {
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

/**
 * Displays an in-app notification and system notification if window is minimized
 */
async function showBeautifulNotification(senderName, messageContent) {
  createGlassmorphismNotification(senderName, messageContent);
  
  try {
    const visible = await isWindowVisible();
    if (!visible) {
      await window.__TAURI__.notification.sendNotification({
        title: `💬 ${senderName}`,
        body: messageContent.length > 50 ? messageContent.substring(0, 47) + "..." : messageContent,
        icon: "icons/128x128.png"
      });
    }
  } catch (error) {
    console.log("Could not check window visibility or show system notification");
  }
}

/**
 * Creates a glassmorphism-styled notification popup in the UI
 */
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
    const sender = allUsers.find(u => u.name === senderName);
    if (sender) {
      handleUserClick(sender.id);
      setTimeout(() => {
        document.getElementById('message-input')?.focus();
      }, 100);
    }
    removeNotification(notification);
  });
  
  viewBtn.addEventListener('click', () => {
    const sender = allUsers.find(u => u.name === senderName);
    if (sender) {
      handleUserClick(sender.id);
    }
    removeNotification(notification);
  });
  
  setTimeout(() => {
    removeNotification(notification);
  }, 2100);
}

/**
 * Animates and removes a notification element from the DOM
 */
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

/**
 * Safely retrieves or generates a valid user ID from localStorage
 */
function getSafeUserId() {
  const storedId = localStorage.getItem('userId');
  
  if (storedId && !isNaN(parseInt(storedId, 10))) {
    return parseInt(storedId, 10);
  }
  
  const newId = Math.floor(Math.random() * 100000000);
  console.warn(`⚠️ Invalid userId in localStorage. Generated new ID: ${newId}`);
  localStorage.setItem('userId', newId);
  return newId;
}

const previewContainer = document.createElement('div');
previewContainer.className = 'mt-4 p-3 rounded-lg border border-slate-300 dark:border-slate-600';

const fontSizeSlider = document.getElementById('font-size-slider');
const fontSizeValue = document.getElementById('font-size-value');

const savedFontSize = localStorage.getItem('fontSizeScale') || 100;
fontSizeSlider.value = savedFontSize;
fontSizeValue.textContent = `${savedFontSize}%`;
document.documentElement.style.setProperty('--font-size-scale', savedFontSize / 100);

fontSizeSlider.addEventListener('input', (e) => {
  const value = e.target.value;
  fontSizeValue.textContent = `${value}%`;
  
  const previewTexts = document.querySelectorAll('.font-size-preview');
  previewTexts.forEach(el => {
    const baseSize = el.classList.contains('preview-text-sm') ? 0.875 : 1;
    el.style.fontSize = `${baseSize * (value / 100)}rem`;
  });
  
  fontSizeValue.classList.add('text-purple-500', 'font-bold');
  setTimeout(() => {
    fontSizeValue.classList.remove('text-purple-500', 'font-bold');
  }, 500);
});

/**
 * Main initialization on DOM content loaded
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM content loaded');

  initializeModernToggle();
  localStorage.setItem('port', MSG_PORT);
  loadUserList();
  
  const searchContainer = document.getElementById('titlebar-search-container');
  if (searchContainer) {
    if (window.innerWidth < 900) {
      searchContainer.style.display = 'none';
    } else {
      searchContainer.style.display = 'block';
    }
  }
  
  logSessionStart();
  const savedFontSizeInit = localStorage.getItem('fontSizeScale') || 100;
  document.documentElement.style.setProperty('--font-size-scale', savedFontSizeInit / 100);

  console.log("DEBUGGING LOGGING:");
  console.log("globalInvokeFunc available:", !!globalInvokeFunc);

  if (globalInvokeFunc) {
    globalInvokeFunc('log_session_start', {
      userName: "Test User",
      userIp: "127.0.0.1"
    })
    .then(result => {
      console.log("LOG TEST SUCCESS:", result);
      console.log("Check Documents/RoundtableChat/ folder now");
    })
    .catch(error => {
      console.error("LOG TEST FAILED:", error);
    });
  } else {
    console.error("globalInvokeFunc is not available");
  }

  if (!localStorage.getItem('userId') || isNaN(parseInt(localStorage.getItem('userId'), 10))) {
    const newId = Math.floor(Math.random() * 100000000);
    localStorage.setItem('userId', newId);
    localStorage.setItem('username', 'RoundtableUser');
    localStorage.setItem('displayName', 'New User');
    console.log('Generated new user ID:', newId);
  }
  
  createParticles();
  initializeUI();
  renderMyUserProfileFooter();
  
  if (window.__TAURI__) {
    console.log('Tauri detected, setting up integration');
    setupTauriIntegration();
  } else {
    console.warn('Tauri not detected - running in browser mode');
  }

  window.__TAURI_DEBUG__ = {
    checkState: () => {
      console.log('Current users:', allUsers);
      console.log('Discovered users:', discoveredUsers);
      console.log('Active chat user ID:', activeChatUserId);
      console.log('Messages:', messages);
    }
  };

  window.addEventListener('resize', () => {
    const searchContainer = document.getElementById('titlebar-search-container');
    if (searchContainer) {
      if (window.innerWidth < 900) {
        searchContainer.style.display = 'none';
      } else {
        searchContainer.style.display = 'block';
      }
    }
    
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(() => {
      const messageBubbles = document.querySelectorAll('.message-bubble > div:not(.w-12)');
      messageBubbles.forEach(bubble => {
        const maxWidth = `min(28rem, calc(100vw - 8rem))`;
        bubble.style.maxWidth = maxWidth;
      });
      
      const messageImages = document.querySelectorAll('.message-bubble img');
      messageImages.forEach(img => {
        img.style.maxWidth = `min(20rem, calc(100vw - 12rem))`;
      });
    }, 100);
  });

  const pfpSelectBtn = document.getElementById('pfp-select-btn');
  const pfpFileInput = document.getElementById('pfp-file-input');
  const pfpPreview = document.getElementById('settings-pfp-preview');

  pfpSelectBtn.addEventListener('click', () => pfpFileInput.click());
  pfpPreview.addEventListener('click', () => pfpFileInput.click());

  if (localStorage.getItem('profilePicture')) {
    pfpPreview.src = localStorage.getItem('profilePicture');
  }

  pfpFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      resizeImage(event.target.result, 96, 96, (resizedBase64) => {
        pfpPreview.src = resizedBase64;
        localStorage.setItem('profilePicture', resizedBase64);
        renderMyUserProfileFooter();
        announcePresence();
      });
    };
    reader.readAsDataURL(file);
  });

  setupUserStatusMonitor();
  
  setTimeout(() => {
    renderUserList();
    renderChatWindow();
    initializeResizer();
  }, 100);
});

/**
 * Resizes an image to specified dimensions using canvas
 */
function resizeImage(base64Str, maxWidth, maxHeight, callback) {
  const img = new Image();
  img.src = base64Str;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = maxWidth;
    canvas.height = maxHeight;
    ctx.drawImage(img, 0, 0, maxWidth, maxHeight);
    callback(canvas.toDataURL('image/jpeg', 0.8));
  };
}

/**
 * Creates animated background particles
 */
function createParticles() {
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

/**
 * Sets up Tauri backend integration including window controls, event listeners, and message handling
 */
function setupTauriIntegration() {
  if (window.__TAURI__ && window.__TAURI__.invoke) {
    globalInvokeFunc = window.__TAURI__.invoke;
  } else if (window.__TAURI__ && window.__TAURI__.tauri && window.__TAURI__.tauri.invoke) {
    globalInvokeFunc = window.__TAURI__.tauri.invoke;
  } else if (window.tauriInvoke) {
    globalInvokeFunc = window.tauriInvoke;
  }
  console.log("Invoke function set:", !!globalInvokeFunc);

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
      } else {
        console.error('appWindow not available in window.__TAURI__.window');
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

      globalInvokeFunc('broadcast_discovery_query');

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

      if (!messages[offerDetails.sender.id]) {
        messages[offerDetails.sender.id] = [];
      }
      messages[offerDetails.sender.id].push(fileOfferMessage);

      if (activeChatUserId === offerDetails.sender.id) {
        renderChatWindow();
      } else {
        unreadCounts[offerDetails.sender.id] = (unreadCounts[offerDetails.sender.id] || 0) + 1;
        renderUserList();

        showBeautifulNotification(
          offerDetails.sender.name,
          `📎 Wants to send you: ${offerDetails.fileName} (${(offerDetails.fileSize / 1024 / 1024).toFixed(2)} MB)`
        );
      }
    });

    window.sendMessageToBackend = function(message, targetIp, targetPort) {
      console.log(`SENDING MESSAGE to ${targetIp} (port ${targetPort}): "${message}"`);

      let invokeFunc = null;

      if (window.__TAURI__ && window.__TAURI__.invoke) {
        console.log("Using window.__TAURI__.invoke");
        invokeFunc = window.__TAURI__.invoke;
      } else if (window.__TAURI__ && window.__TAURI__.tauri && window.__TAURI__.tauri.invoke) {
        console.log("Using window.__TAURI__.tauri.invoke");
        invokeFunc = window.__TAURI__.tauri.invoke;
      } else if (window.tauriInvoke) {
        console.log("Using window.tauriInvoke");
        invokeFunc = window.tauriInvoke;
      }

      if (!invokeFunc) {
        console.error("Could not find invoke function");
        return;
      }

      const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
      const myUserId = getSafeUserId();

      const payload = {
        message: message,
        targetIp: targetIp,
        senderName: myDisplayName,
        senderId: myUserId,
        targetId: activeChatUserId,
        targetPort: targetPort,
        senderPort: parseInt(localStorage.getItem('port') || MSG_PORT, 10)
      };

      console.log(`Invoking send_message with:`, payload);

      try {
        invokeFunc('send_message', payload)
          .then((result) => {
            console.log('Message sent successfully to:', targetIp, 'Result:', result);
          })
          .catch(err => {
            console.error('Error sending message:', err);
          });
      } catch (e) {
        console.error('Exception when calling invoke:', e);
      }
    };

  } catch (error) {
    console.error('Error setting up Tauri integration:', error);
  }

  setupPeriodicDiscovery();
}

/**
 * Initializes all UI components and event handlers
 */
function initializeUI() {
  const userListEl = document.getElementById('user-list');
  const welcomeScreenEl = document.getElementById('welcome-screen');
  const chatViewEl = document.getElementById('chat-view');
  const chatHeaderAvatarEl = document.getElementById('chat-header-avatar');
  const chatHeaderNameEl = document.getElementById('chat-header-name');
  const chatHeaderStatusEl = document.getElementById('chat-header-status');
  const chatHeaderStatusDot = document.getElementById('chat-header-status-dot');
  const messagesContainerEl = document.getElementById('messages-container');
  const messageFormEl = document.getElementById('message-form');
  const messageInputEl = document.getElementById('message-input');
  const attachmentBtn = document.getElementById('attachment-btn');
  const fileInput = document.getElementById('file-input');
  const filePreviewContainer = document.getElementById('file-preview-container');
  const filePreview = document.getElementById('file-preview');
  const sendBtn = document.getElementById('send-btn');
  const themeToggle = document.getElementById('theme-toggle');
  const sunIcon = document.getElementById('theme-icon-sun');
  const moonIcon = document.getElementById('theme-icon-moon');
  const statusBar = document.getElementById('status-bar');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
  const userSearchInput = document.getElementById('user-search-input');
  const smartReplyBtn = document.getElementById('smart-reply-btn');
  const aiSuggestionsContainer = document.getElementById('ai-suggestions-container');
  const summarizeBtn = document.getElementById('summarize-btn');
  const summaryModal = document.getElementById('summary-modal');
  const summaryContent = document.getElementById('summary-content');
  const closeSummaryBtn = document.getElementById('close-summary-btn');

  if (!localStorage.getItem('port')) {
    localStorage.setItem('port', MSG_PORT);
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
    const targetUser = allUsers.find(user => user.id === activeChatUserId);

    if (!targetUser) {
      console.error("No active user selected to send a message.");
      return;
    }

    let messageSent = false;

    if (selectedFiles.length > 0) {
      messageSent = true;

      selectedFiles.forEach(file => {
        const transferId = `${getSafeUserId()}-${targetUser.id}-${Date.now()}-${Math.random()}`;
        const myUserId = getSafeUserId();
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

        if (!messages[activeChatUserId]) messages[activeChatUserId] = [];
        messages[activeChatUserId].push(fileOfferMessage);

        let invokeFunc = window.tauriInvoke || (window.__TAURI__ && (window.__TAURI__.invoke || (window.__TAURI__.tauri && window.__TAURI__.tauri.invoke)));
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

      if (!messages[activeChatUserId]) {
        messages[activeChatUserId] = [];
      }
      messages[activeChatUserId].push(newMessage);

      const messageEl = createMessageBubble(newMessage);
      messageEl.classList.add('slide-in-right');
      document.getElementById('messages-container').appendChild(messageEl);

      if (window.sendMessageToBackend) {
        window.sendMessageToBackend(text, targetUser.ip, targetUser.port);
      }

      let invokeFunc = window.tauriInvoke || (window.__TAURI__ && (window.__TAURI__.invoke || (window.__TAURI__.tauri && window.__TAURI__.tauri.invoke)));
      if (invokeFunc) {
        const myName = localStorage.getItem('displayName') || 'Me';
        invokeFunc('log_message', {
          senderName: myName,
          senderIp: "N/A",
          receiverName: targetUser.name,
          receiverIp: targetUser.ip,
          message: text,
          isOutgoing: true
        }).catch(error => console.error("Error logging message:", error));
      }
    }

    if (messageSent) {
      messageInputEl.value = '';
      adjustTextareaHeight(messageInputEl);
      selectedFiles = [];
      updateFilePreview();
      updateSendButton();
      scrollToBottom();
    }
  });

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
            console.log(`Got metadata:`, metadata);

            const fileName = await window.__TAURI__.path.basename(path);
            console.log(`Got filename: ${fileName}`);

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

        selectedFiles.push(...filesToAdd);
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
    selectedFiles.push(...Array.from(e.target.files));
    updateFilePreview();
    updateSendButton();
    fileInput.value = '';

    attachmentBtn.classList.add('text-green-500', 'animate-bounce');
    setTimeout(() => {
      attachmentBtn.classList.remove('text-green-500', 'animate-bounce');
    }, 1000);
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

  userSearchInput?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    displayedUsers = allUsers.filter(user =>
      user.name.toLowerCase().includes(query) ||
      user.ip.includes(query)
    );
    renderUserList();

    userSearchInput.classList.add('ring-2', 'ring-blue-500/30');
    clearTimeout(userSearchInput.searchTimer);
    userSearchInput.searchTimer = setTimeout(() => {
      userSearchInput.classList.remove('ring-2', 'ring-blue-500/30');
    }, 500);
  });

  smartReplyBtn?.addEventListener('click', async () => {
    if (!activeChatUserId) return;

    smartReplyBtn.classList.add('animate-spin');
    const originalText = smartReplyBtn.innerHTML;
    smartReplyBtn.innerHTML = '⚡';

    const userMessages = messages[activeChatUserId] || [];
    const lastMessage = userMessages.filter(m => m.sender !== 'me').pop();

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

  summarizeBtn?.addEventListener('click', async () => {
    if (!activeChatUserId) return;
    const userMessages = messages[activeChatUserId] || [];
    if (userMessages.length === 0) return;

    summarizeBtn.classList.add('animate-spin');

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

    const conversationText = userMessages.map(msg => {
      const senderName = msg.sender === 'me' ? 'Me' : allUsers.find(u => u.id === msg.sender)?.name || 'Them';
      return `${senderName}: ${msg.text}`;
    }).join('\n');
  });

  closeSummaryBtn?.addEventListener('click', () => {
    summaryModal.classList.add('hidden');
  });

  summaryModal?.addEventListener('click', (e) => {
    if (e.target === summaryModal) {
      summaryModal.classList.add('hidden');
    }
  });

  settingsBtn?.addEventListener('click', () => {
    settingsBtn.classList.add('animate-spin');
    setTimeout(() => settingsBtn.classList.remove('animate-spin'), 300);
    showSettings();
  });

  const closeChatBtn = document.getElementById('close-chat-btn');
  closeChatBtn?.addEventListener('click', closeActiveChat);

  closeSettingsBtn?.addEventListener('click', closeSettings);
  cancelSettingsBtn?.addEventListener('click', closeSettings);

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

    localStorage.setItem('username', username);
    localStorage.setItem('displayName', displayName);
    localStorage.setItem('fontSizeScale', fontSize);
    document.documentElement.style.setProperty('--font-size-scale', fontSize / 100);

    const saveBtn = document.getElementById('save-settings-btn');
    saveBtn.classList.add('animate-pulse', 'bg-green-500');

    if (nameChanged || usernameChanged) {
      console.log(`Name changed from "${oldDisplayName}" to "${displayName}"`);

      const myUserId = getSafeUserId();
      const myUserIndex = allUsers.findIndex(u => u.id === myUserId);
      if (myUserIndex !== -1) {
        allUsers[myUserIndex].name = displayName;
        displayedUsers = [...allUsers];
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

  document.getElementById('refresh-users')?.addEventListener('click', (e) => {
    const button = e.currentTarget;
    button.classList.add('animate-spin');

    announcePresence();
    globalInvokeFunc('broadcast_discovery_query');
    showNotification('Searching for users...');
    if (!localStorage.getItem('port')) {
      localStorage.setItem('port', MSG_PORT);
    }

    setTimeout(() => {
      button.classList.remove('animate-spin');
    }, 1000);
  });
}

/**
 * Adds a newly discovered user to the user list or updates existing user info
 */
function addDiscoveredUser(user) {
  if (!user || !user.id) {
    console.error("Invalid user data:", user);
    return;
  }

  const now = Date.now();
  user.lastSeen = now;

  const myUserId = getSafeUserId();
  if (user.id === myUserId) {
    return;
  }

  if (!user.port || user.port === 0) {
    console.warn(`User ${user.name} has no port set, using default MSG_PORT`);
    user.port = MSG_PORT;
  }
  console.log(`Assigned port ${user.port} to user ${user.name}`);
  console.log(`User ${user.name} discovered with port ${user.port}`);

  const existingUserIndex = allUsers.findIndex(u => u.id === user.id);

  if (existingUserIndex !== -1) {
    console.log(`User already exists (ID: ${user.id}), updating details.`);

    const existingUser = allUsers[existingUserIndex];

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

    allUsers.push(user);
    discoveredUsers.push(user);
  }

  saveUserList();
  displayedUsers = [...allUsers];
  renderUserList();
}

/**
 * Sets up periodic monitoring of user activity status
 */
function setupUserStatusMonitor() {
  console.log("Setting up user status monitor");
  setInterval(() => {
    const now = Date.now();
    let changed = false;

    allUsers.forEach(user => {
      if (user.status === 'online' && user.lastSeen && (now - user.lastSeen > 60000)) {
        console.log(`User ${user.name} marked as offline due to inactivity.`);
        user.status = 'offline';
        changed = true;
      }
    });

    if (changed) {
      saveUserList();
      renderUserList();
      const activeUser = allUsers.find(u => u.id === activeChatUserId);
      if (activeUser && activeUser.status === 'offline') {
        renderChatWindow();
      }
    }
  }, 10000);
}

/**
 * Marks a specific user as offline
 */
function markUserAsOffline(userId) {
  if (!userId) return;

  const userIndex = allUsers.findIndex(u => u.id === userId);

  if (userIndex !== -1 && allUsers[userIndex].status !== 'offline') {
    console.log(`User ${allUsers[userIndex].name} marked as offline.`);
    allUsers[userIndex].status = 'offline';

    const displayedUserIndex = displayedUsers.findIndex(u => u.id === userId);
    if (displayedUserIndex !== -1) {
      displayedUsers[displayedUserIndex].status = 'offline';
    }

    renderUserList();

    if (activeChatUserId === userId) {
      renderChatWindow();
    }
  }
  saveUserList();
}

/**
 * Displays a toast notification message
 */
function showNotification(message, isError = false) {
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

/**
 * Clears unread message count for the currently active chat
 */
function clearUnreadForActiveChat() {
  if (activeChatUserId && unreadCounts[activeChatUserId] > 0) {
    console.log(`Clearing ${unreadCounts[activeChatUserId]} unread messages for active chat ${activeChatUserId}`);

    const userEl = document.querySelector(`[data-user-id="${activeChatUserId}"]`);
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
      unreadCounts[activeChatUserId] = 0;
      renderUserList();
    }, 300);
  }
}

/**
 * Removes a user from the discovered users list
 */
function removeDiscoveredUser(userId) {
  discoveredUsers = discoveredUsers.filter(u => u.id !== userId);
  allUsers = allUsers.filter(u => u.id !== userId);
  displayedUsers = [...allUsers];
  renderUserList();

  if (activeChatUserId === userId) {
    activeChatUserId = null;
    renderChatWindow();
  }
}

/**
 * Persists the user list to localStorage
 */
function saveUserList() {
  try {
    localStorage.setItem('allUsers', JSON.stringify(allUsers));
  } catch (e) {
    console.error("Failed to save user list to localStorage.", e);
  }
}

/**
 * Loads the user list from localStorage on startup
 */
function loadUserList() {
  const savedUsersJSON = localStorage.getItem('allUsers') || '';
  if (savedUsersJSON) {
    try {
      const savedUsers = JSON.parse(savedUsersJSON);
      if (Array.isArray(savedUsers)) {
        allUsers = savedUsers.map(user => ({
          ...user,
          status: 'offline'
        }));
        displayedUsers = [...allUsers];
        console.log(`Loaded ${allUsers.length} users from localStorage.`);
      }
    } catch (e) {
      console.error("Failed to parse saved user list from localStorage.", e);
      allUsers = [];
    }
  }
}

/**
 * Shows a clickable notification that navigates to the sender's chat when clicked
 */
function showClickableNotification(message, senderId) {
  const notif = document.createElement('div');
  notif.className = 'fixed top-12 right-4 bg-black/20 backdrop-blur-md border border-white/20 text-white px-4 py-2 rounded-lg shadow-lg transform transition-all duration-500 opacity-0 translate-x-4 z-50 cursor-pointer hover:bg-black/30';

  if (message.includes(' - ')) {
    const [username, messageContent] = message.split(' - ', 2);
    notif.innerHTML = `<span class="text-green-300 font-semibold">${username}</span> - <span class="text-white">${messageContent}</span>`;
  } else {
    notif.textContent = message;
  }

  notif.addEventListener('click', () => {
    handleUserClick(senderId);
    notif.remove();
  });

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

/**
 * Processes and displays an incoming message from another user
 */
async function displayReceivedMessage(messageData) {
  console.log('JS: Processing received message:', messageData);

  const myUserId = getSafeUserId();

  if (messageData.sender_id === getSafeUserId() || (messageData.target_id !== getSafeUserId() && messageData.target_id !== 0)) {
    return;
  }

  let sender = allUsers.find(u => u.id === messageData.sender_id);
  if (!sender) {
    const newUser = {
      id: messageData.sender_id,
      name: messageData.sender || "Unknown User",
      ip: messageData.ip,
      port: messageData.sender_port || MSG_PORT,
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

  if (!messages[sender.id]) {
    messages[sender.id] = [];
  }
  messages[sender.id].push(newMessage);

  const windowIsFocused = await isWindowFocused();

  if (activeChatUserId !== sender.id || !windowIsFocused) {
    unreadCounts[sender.id] = (unreadCounts[sender.id] || 0) + 1;
    console.log(`Unread count for ${sender.name} is now ${unreadCounts[sender.id]}`);

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
  if (messagesContainerEl && activeChatUserId === sender.id) {
    const messageEl = createMessageBubble(newMessage);
    messageEl.classList.add('slide-in-left');
    messagesContainerEl.appendChild(messageEl);
    scrollToBottom();
  }

  await logMessage(
    sender.name || 'Unknown',
    sender.ip || 'Unknown IP',
    localStorage.getItem('displayName') || 'Me',
    await getUserIP(),
    messageData.content,
    false
  );

  isWindowVisible().then(visible => {
    console.log(`Window visible: ${visible}`);
    if (!visible) {
      console.log(`Showing beautiful notification: App is minimized/hidden`);
      showBeautifulNotification(sender.name, messageData.content);
    } else {
      console.log(`Skipping notification: App is visible`);
    }
  }).catch(error => {
    console.error("Error checking window visibility:", error);
  });
}

/**
 * Updates the taskbar badge with total unread message count
 */
async function updateTaskbarBadge() {
  if (!window.__TAURI__ || !window.__TAURI__.window) return;

  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

  try {
    const appWindow = window.__TAURI__.window.getCurrentWindow();
    await appWindow.setBadgeCount(totalUnread);
    console.log(`Taskbar badge count set to: ${totalUnread}`);
  } catch (error) {
    console.error("Failed to set taskbar badge count:", error);
  }
}

/**
 * Renders the sidebar user list with online status and unread counts
 */
function renderUserList() {
  const userListEl = document.getElementById('user-list');
  if (!userListEl) return;

  userListEl.innerHTML = '';
  displayedUsers.forEach(user => {
    const userEl = document.createElement('div');
    userEl.className = `user-item flex items-center p-2 m-1 rounded-xl cursor-pointer hover:bg-slate-200/40 dark:hover:bg-slate-700/40 transition-all duration-300 ${user.id === activeChatUserId ? 'bg-gradient-to-r from-slate-200/60 to-slate-300/60 dark:from-slate-700/60 dark:to-slate-600/60 shadow-md' : ''}`;
    userEl.dataset.userId = user.id;

    const statusClass = user.status === 'online' ? 'bg-green-500' : 'bg-slate-500';
    const glowClass = user.status === 'online' ? 'status-online-glow' : '';
    const unreadCount = unreadCounts[user.id] || 0;

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

/**
 * Renders the current user's profile information in the sidebar footer
 */
function renderMyUserProfileFooter() {
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

/**
 * Updates the status bar with online user count
 */
function updateStatusBar() {
  const statusBar = document.getElementById('status-bar');
  if (!statusBar) return;

  const onlineCount = allUsers.filter(u => u.status === 'online').length;
  statusBar.innerHTML = `
    <span class="flex items-center gap-2">
      <span class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
      ${onlineCount} users online
    </span>
    <span class="text-xs opacity-50">${new Date().toLocaleTimeString()}</span>
  `;
}

/**
 * Renders the main chat window with message history for the active user
 */
function renderChatWindow() {
  const welcomeScreenEl = document.getElementById('welcome-screen');
  const chatViewEl = document.getElementById('chat-view');
  const chatHeaderAvatarEl = document.getElementById('chat-header-avatar');
  const chatHeaderNameEl = document.getElementById('chat-header-name');
  const chatHeaderStatusEl = document.getElementById('chat-header-status');
  const messagesContainerEl = document.getElementById('messages-container');
  const aiSuggestionsContainer = document.getElementById('ai-suggestions-container');

  if (!welcomeScreenEl || !chatViewEl) return;

  if (!activeChatUserId) {
    welcomeScreenEl.style.display = 'flex';
    chatViewEl.style.display = 'none';
    return;
  }

  welcomeScreenEl.style.display = 'none';
  chatViewEl.style.display = 'flex';
  if (aiSuggestionsContainer) aiSuggestionsContainer.innerHTML = '';

  const user = allUsers.find(u => u.id === activeChatUserId);
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

  const userMessages = messages[activeChatUserId] || [];
  const wasAtBottom = isScrolledToBottom(messagesContainerEl);

  messagesContainerEl.innerHTML = '';
  const fragment = document.createDocumentFragment();
  const groupedMessages = groupMessagesByDate(userMessages);

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

/**
 * Updates the chat header with user information
 */
function updateChatHeader(user, avatarEl, nameEl, statusEl) {
  avatarEl.className = `w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-xl flex-shrink-0 bg-gradient-to-br ${user.avatarGradient} shadow-lg`;
  avatarEl.textContent = user.name.charAt(0);
  nameEl.textContent = user.name;

  statusEl.innerHTML = user.status === 'online'
    ? `<span class="text-green-400">● Online</span> <span class="text-slate-500">&middot;</span> ${user.ip}`
    : `<span class="text-slate-400">● Offline</span> <span class="text-slate-500">&middot;</span> ${user.ip}`;
}

/**
 * Groups messages by date for display with date headers
 */
function groupMessagesByDate(messages) {
  const groups = [];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayDate = today.toLocaleDateString();
  const yesterdayDate = yesterday.toLocaleDateString();

  const dateGroups = {};

  messages.forEach(message => {
    const msgDate = new Date(message.timestamp);
    const msgDateString = msgDate.toLocaleDateString();

    let dateLabel;
    if (msgDateString === todayDate) {
      dateLabel = 'Today';
    } else if (msgDateString === yesterdayDate) {
      dateLabel = 'Yesterday';
    } else {
      dateLabel = msgDate.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });
    }

    if (!dateGroups[dateLabel]) {
      dateGroups[dateLabel] = {
        dateLabel,
        date: msgDate,
        messages: []
      };
      groups.push(dateGroups[dateLabel]);
    }

    dateGroups[dateLabel].messages.push(message);
  });

  groups.sort((a, b) => a.date - b.date);

  return groups;
}

/**
 * Checks if the messages container is scrolled to the bottom
 */
function isScrolledToBottom(element) {
  return element.scrollHeight - element.scrollTop <= element.clientHeight + 50;
}

/**
 * Updates the connection status in the titlebar and sidebar
 */
function updateTitlebarStatus() {
  const titlebarStatus = document.getElementById('titlebar-status');
  const sidebarStatus = document.getElementById('sidebar-status');

  const onlineCount = allUsers.filter(u => u.status === 'online').length;

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

/**
 * Closes the active chat and returns to the welcome screen
 */
function closeActiveChat() {
  activeChatUserId = null;
  renderUserList();
  renderChatWindow();
}

/**
 * Creates a styled message bubble element for text messages or file transfers
 */
function createMessageBubble(message) {
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
          ${getFileIcon(ft.fileType || '')}
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

  const bubbleContent = document.createElement('div');
  bubbleContent.className = `flex items-end gap-2 max-w-[85%] ${animationClass}`;

  const senderUser = isSentByMe ? null : allUsers.find(u => u.id === message.sender);
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

/**
 * Scrolls the messages container to the bottom
 */
function scrollToBottom(instant = false) {
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

/**
 * Handles user selection from the sidebar list
 */
function handleUserClick(userId) {
  if (userId === activeChatUserId) {
    console.log(`Chat with user ${userId} is already active. No re-render needed.`);
    clearUnreadForActiveChat();
    return;
  }
  activeChatUserId = userId;
  clearUnreadForActiveChat();
  renderUserList();
  renderChatWindow();
  const targetUser = allUsers.find(user => user.id === userId);
  if (targetUser) {
    logChatParticipants(targetUser);
  }
  const userEl = document.querySelector(`[data-user-id="${userId}"]`);
  if (userEl) {
    userEl.classList.add('animate-pulse');
    setTimeout(() => userEl.classList.remove('animate-pulse'), 1000);
  }
}

/**
 * Updates the file preview container with selected files
 */
function updateFilePreview() {
  const filePreviewContainer = document.getElementById('file-preview-container');
  const filePreview = document.getElementById('file-preview');
  if (!filePreviewContainer || !filePreview) return;

  if (selectedFiles.length === 0) {
    filePreviewContainer.classList.add('hidden');
    return;
  }
  filePreviewContainer.classList.remove('hidden');
  filePreview.innerHTML = '';

  selectedFiles.forEach((file, index) => {
    const fileItem = document.createElement('div');
    fileItem.className = 'flex items-center gap-3 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800/50 dark:to-slate-700/50 p-3 rounded-lg text-sm shadow-sm hover:shadow-md transition-all duration-300 transform hover:scale-[1.02] group';
    const fileName = file.name.length > 20 ? `${file.name.substring(0, 18)}...` : file.name;
    fileItem.innerHTML = `
      <span class="text-xl animate-float group-hover:scale-110 transition-transform duration-300">${getFileIcon(file.type)}</span>
      <span class="text-slate-800 dark:text-slate-200 font-medium flex-1">${fileName}</span>
      <span class="text-xs text-slate-500 dark:text-slate-400">${(file.size / 1024 / 1024).toFixed(2)}MB</span>
      <button class="ml-2 w-6 h-6 rounded-full bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 flex items-center justify-center group-hover:scale-110" onclick="removeFile(${index})">&times;</button>
    `;
    filePreview.appendChild(fileItem);
  });
}

/**
 * Removes a file from the selected files array
 */
window.removeFile = (index) => {
  selectedFiles.splice(index, 1);
  updateFilePreview();
  updateSendButton();

  const fileItems = document.getElementById('file-preview')?.children;
  if (fileItems && fileItems[index]) {
    fileItems[index].style.transform = 'scale(0)';
    fileItems[index].style.opacity = '0';
    setTimeout(() => updateFilePreview(), 300);
  }
};

/**
 * Returns an emoji icon based on file type
 */
function getFileIcon(fileType) {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType.startsWith('video/')) return '🎥';
  if (fileType.startsWith('audio/')) return '🎵';
  if (fileType.includes('pdf')) return '📄';
  return '📁';
}

/**
 * Updates the send button state based on message content
 */
function updateSendButton() {
  const sendBtn = document.getElementById('send-btn');
  const messageInputEl = document.getElementById('message-input');
  if (!sendBtn || !messageInputEl) return;

  const hasContent = messageInputEl.value.trim().length > 0 || selectedFiles.length > 0;
  sendBtn.disabled = !hasContent;

  if (hasContent) {
    sendBtn.classList.add('enabled-glow');
  } else {
    sendBtn.classList.remove('enabled-glow');
  }
}

/**
 * Opens the settings modal and populates it with current values
 */
function showSettings() {
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

  settingsModal.classList.remove('hidden');
  const content = settingsModal.querySelector('.glassmorphism');
  if (content) content.classList.remove('scale-95', 'opacity-0');
}

/**
 * Closes the settings modal with animation
 */
function closeSettings() {
  const settingsModal = document.getElementById('settings-modal');
  if (!settingsModal) return;

  const content = settingsModal.querySelector('.glassmorphism');
  if (content) content.classList.add('scale-95', 'opacity-0');

  setTimeout(() => {
    settingsModal.classList.add('hidden');
  }, 300);
}

const themeToggleCheckbox = document.getElementById('theme-toggle');
if (themeToggleCheckbox) {
  const isDark = localStorage.getItem('theme') === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  themeToggleCheckbox.checked = !isDark;

  themeToggleCheckbox.addEventListener('change', () => {
    const isDarkNow = !themeToggleCheckbox.checked;
    document.documentElement.classList.toggle('dark', isDarkNow);
    localStorage.setItem('theme', isDarkNow ? 'dark' : 'light');
  });
}

/**
 * Broadcasts user presence to discover other users on the network
 */
function announcePresence() {
  console.log('Announcing presence');

  let invokeFunc = null;

  if (window.__TAURI__ && window.__TAURI__.invoke) {
    invokeFunc = window.__TAURI__.invoke;
  } else if (window.__TAURI__ && window.__TAURI__.tauri && window.__TAURI__.tauri.invoke) {
    invokeFunc = window.__TAURI__.tauri.invoke;
  } else if (window.tauriInvoke) {
    invokeFunc = window.tauriInvoke;
  }

  if (!invokeFunc) {
    console.error('Could not find invoke function for presence announcement');
    return;
  }

  try {
    const myUserId = getSafeUserId();
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

/**
 * Sets up periodic presence broadcasts for network discovery
 */
function setupPeriodicDiscovery() {
  announcePresence();

  const discoveryInterval = setInterval(() => {
    console.log("Auto-discovery: Broadcasting presence...");
    announcePresence();
  }, 15000);

  window.__DISCOVERY_INTERVAL = discoveryInterval;
}

window.addEventListener('beforeunload', () => {
  if (window.__TAURI__ && window.__TAURI__.invoke) {
    const myUserId = getSafeUserId();
    globalInvokeFunc('broadcast_offline', { userId: myUserId })
      .catch((e) => console.error("Could not send offline broadcast:", e));
  }
});

/**
 * Debug utility to check user ID validity
 */
window.checkUserIds = function () {
  const localId = localStorage.getItem('userId');
  const parsedId = parseInt(localId, 10);

  console.log({
    storedValue: localId,
    parsedValue: parsedId,
    isValidNumber: !isNaN(parsedId),
    safeId: getSafeUserId()
  });

  return !isNaN(parsedId) ? "User ID is valid" : "User ID is invalid, using fallback";
};

/**
 * Initializes the sidebar resize handle functionality
 */
function initializeResizer() {
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

/**
 * Initializes the theme toggle with particle effects
 */
function initializeModernToggle() {
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

/**
 * Creates particle animation effect on click
 */
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

/**
 * Shows a notification for sidebar resize actions
 */
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

/**
 * Logs a message to the backend for chat history
 */
async function logMessage(senderName, senderIp, receiverName, receiverIp, message, isOutgoing) {
  if (!globalInvokeFunc) return;

  try {
    await globalInvokeFunc('log_message', {
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

/**
 * Logs the start of a new session
 */
async function logSessionStart() {
  if (!globalInvokeFunc) return;

  const userName = localStorage.getItem('displayName') || 'Roundtable User';
  const userIp = await getUserIP();

  try {
    await globalInvokeFunc('log_session_start', {
      userName,
      userIp
    });
    console.log('Session logged');
  } catch (error) {
    console.error('Failed to log session start:', error);
  }
}

/**
 * Logs participants when starting a chat
 */
async function logChatParticipants(remoteUser) {
  if (!globalInvokeFunc || !remoteUser) return;

  const localUser = localStorage.getItem('displayName') || 'Roundtable User';
  const localIp = await getUserIP();

  try {
    await globalInvokeFunc('log_chat_participants', {
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

/**
 * Retrieves the user's IP address from storage
 */
async function getUserIP() {
  return localStorage.getItem('myIP') || '127.0.0.1';
}

/**
 * Updates file transfer progress in the UI
 */
function updateFileTransferProgress(transferId, progress) {
  for (const userId in messages) {
    const userMessages = messages[userId];
    const messageIndex = userMessages.findIndex(m => m.fileTransfer && m.fileTransfer.transferId === transferId);

    if (messageIndex !== -1) {
      messages[userId][messageIndex].fileTransfer.status = 'downloading';
      messages[userId][messageIndex].fileTransfer.progress = progress;

      if (parseInt(userId) === activeChatUserId) {
        const bubbles = document.querySelectorAll('[data-transfer-id]');
        for (const bubble of bubbles) {
          if (bubble.dataset.transferId === transferId) {
            const newBubble = createMessageBubble(messages[userId][messageIndex]);
            bubble.replaceWith(newBubble);
            break;
          }
        }
      }
      break;
    }
  }
}

/**
 * Accepts an incoming file transfer offer
 */
window.acceptFileOffer = function (transferId) {
  console.log(`Accepting file offer: ${transferId}`);

  updateFileTransferStatus(transferId, 'accepted');

  document.querySelectorAll(`button[id*="${transferId}"]`).forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.6';
  });

  const myUserId = getSafeUserId();
  const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
  const myUsername = localStorage.getItem('username') || 'Anonymous';
  const myProfilePicture = localStorage.getItem('profilePicture') || null;

  let senderInfo = null;
  for (const userId in messages) {
    const userMessages = messages[userId];
    const fileMessage = userMessages.find(m =>
      m.fileTransfer && m.fileTransfer.transferId === transferId
    );
    if (fileMessage) {
      senderInfo = allUsers.find(u => u.id == userId);
      console.log(`Found sender for transfer:`, senderInfo);
      break;
    }
  }

  if (!senderInfo) {
    console.error(`Could not find sender information for transfer: ${transferId}`);
    updateFileTransferStatus(transferId, 'error');
    return;
  }

  const senderPort = senderInfo.port || MSG_PORT;

  console.log(`Sending accept response to ${senderInfo.ip}:${senderPort}`);

  let invokeFunc = globalInvokeFunc || window.tauriInvoke ||
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

/**
 * Rejects an incoming file transfer offer
 */
window.rejectFileOffer = function (transferId) {
  console.log(`Rejecting file offer: ${transferId}`);

  updateFileTransferStatus(transferId, 'rejected');

  const buttons = document.querySelectorAll(`button[onclick*="${transferId}"]`);
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.6';
  });

  const myUserId = getSafeUserId();
  const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
  const myUsername = localStorage.getItem('username') || 'Anonymous';
  const myProfilePicture = localStorage.getItem('profilePicture') || null;

  let senderInfo = null;
  for (const userId in messages) {
    const userMessages = messages[userId];
    const fileMessage = userMessages.find(m =>
      m.fileTransfer && m.fileTransfer.transferId === transferId
    );
    if (fileMessage) {
      senderInfo = allUsers.find(u => u.id == userId);
      break;
    }
  }

  let invokeFunc = globalInvokeFunc || window.tauriInvoke || (window.__TAURI__ && (window.__TAURI__.invoke || (window.__TAURI__.tauri && window.__TAURI__.tauri.invoke)));
  if (invokeFunc) {
    invokeFunc('respond_to_file_offer', {
      transferId: transferId,
      accepted: false,
      senderId: myUserId,
      senderName: myDisplayName,
      senderUsername: myUsername,
      senderProfilePicture: myProfilePicture,
      targetIp: senderInfo ? senderInfo.ip : null,
      targetPort: senderInfo ? senderInfo.port : MSG_PORT

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

/**
 * Initiates a file download from a peer
 */
function initiateFileDownload(transferId, filePath, targetIp, targetPort) {
  console.log(`Initiating download for transfer: ${transferId}`);

  const myUserId = getSafeUserId();
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

/**
 * Handles user clicking download on a file transfer message
 */
function handleFileDownload(transferId, fileName) {
  const downloadPath = `Downloads/${fileName}`;

  const targetUser = allUsers.find(user => user.id === activeChatUserId);
  if (!targetUser) {
    console.error('Cannot find target user for download');
    return;
  }

  initiateFileDownload(transferId, downloadPath, targetUser.ip, targetUser.port);
}

/**
 * Downloads a file from a peer after transfer is ready
 */
async function downloadFile(transferId, senderIp, port) {
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
    for (const userId in messages) {
      const userMessages = messages[userId];
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

    const myUserId = getSafeUserId();
    const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
    const myUsername = localStorage.getItem('username') || 'Anonymous';
    const myProfilePicture = localStorage.getItem('profilePicture') || null;

    console.log(`Invoking download_file with:`, { transferId, senderIp, port, savePath });
    await globalInvokeFunc('download_file', {
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

/**
 * Updates the status of a file transfer and re-renders if needed
 */
function updateFileTransferStatus(transferId, newStatus) {
  for (const userId in messages) {
    const userMessages = messages[userId];
    const messageIndex = userMessages.findIndex(m => m.fileTransfer && m.fileTransfer.transferId === transferId);

    if (messageIndex !== -1) {
      messages[userId][messageIndex].fileTransfer.status = newStatus;

      if (parseInt(userId) === activeChatUserId) {
        renderChatWindow();
      }
      break;
    }
  }
}

/**
 * Detects whether running in browser, dev, or release mode
 */
function detectBuildType() {
  if (!window.__TAURI__) return 'browser';

  if (window.__TAURI__.__tauriVersion) {
    return 'release';
  } else {
    return 'dev';
  }
}

const buildType = detectBuildType();
console.log(`Running in ${buildType} mode with port ${MSG_PORT}`);