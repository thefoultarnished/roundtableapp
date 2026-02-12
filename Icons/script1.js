const messages = {};
let allUsers = [];
let displayedUsers = [...allUsers];
let discoveredUsers = []; // Track users discovered via UDP

let activeChatUserId = null;
let selectedFiles = [];
//const MSG_PORT = 2425;
let unreadCounts = {};
let globalInvokeFunc = null;
const MSG_PORT = window.__TAURI__ && window.__TAURI__.__tauriVersion 
  ? 2427  
  : 2426; 

// Log the port configuration for debugging
console.log(`🔌 Using message port: ${MSG_PORT}`);


// Immediately inspect the Tauri object in detail
console.log("🔍 TAURI INSPECTOR 🔍");
if (window.__TAURI__) {
  console.log("Available at window.__TAURI__:", Object.keys(window.__TAURI__));
  
  // Check each possible location of the invoke function
  if (window.__TAURI__.invoke) {
    console.log("✅ invoke found at window.__TAURI__.invoke");
  } else {
    console.log("❌ Not found at window.__TAURI__.invoke");
  }
  
  if (window.__TAURI__.tauri && window.__TAURI__.tauri.invoke) {
    console.log("✅ invoke found at window.__TAURI__.tauri.invoke");
  } else {
    console.log("❌ Not found at window.__TAURI__.tauri.invoke");
  }
  
  // Try to find invoke recursively in the __TAURI__ object
  function findInvoke(obj, path = 'window.__TAURI__') {
    if (!obj) return;
    
    for (const key in obj) {
      const currentPath = `${path}.${key}`;
      if (key === 'invoke' && typeof obj[key] === 'function') {
        console.log(`✅ invoke found at ${currentPath}`);
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
    console.log("🎉 Found invoke function, adding to window.tauriInvoke");
    window.tauriInvoke = invokeFunc;
  } else {
    console.log("❓ Could not find invoke function anywhere in __TAURI__");
  }
}

console.log("🔍 TAURI VERSION CHECK 🔍");
if (window.__TAURI__) {
  if (window.__TAURI__.__tauriVersion) {
    console.log(`Tauri Version: ${window.__TAURI__.__tauriVersion}`);
  } else {
    console.log("Tauri version information not available");
  }
}

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
    return false; // Assume not focused on error
  }
}


async function isWindowVisible() {
  if (!window.__TAURI__ || !window.__TAURI__.window) {
    console.warn("Tauri window API not available - assuming not visible");
    return false;
  }
  
  try {
    const appWindow = window.__TAURI__.window.getCurrentWindow();
    const minimized = await appWindow.isMinimized();
    console.log(`Window minimized: ${minimized} (visible: ${!minimized})`);
    return !minimized;  // Return true if NOT minimized (i.e., UI is visible on screen)
  } catch (error) {
    console.error("Error checking window visibility:", error);
    return false; // Assume not visible on error
  }
}


/**
 * Adjusts the height of the textarea to fit content, up to a max of 8 lines.
 * @param {HTMLTextAreaElement} textarea The textarea element to adjust.
 */
function adjustTextareaHeight(textarea) {
    // Reset height to auto to correctly calculate the new scrollHeight
    textarea.style.height = 'auto';

    const style = window.getComputedStyle(textarea);
    const paddingTop = parseFloat(style.paddingTop);
    const paddingBottom = parseFloat(style.paddingBottom);
    const lineHeight = parseFloat(style.lineHeight) || 24;

    // Calculate the max height for 6 lines of text (adjusted for internal buttons)
    const maxContentHeight = 6 * lineHeight;
    const maxHeight = maxContentHeight + paddingTop + paddingBottom;

    // Minimum height to accommodate the internal buttons
    const minHeight = 48; // 3rem

    const requiredHeight = Math.max(textarea.scrollHeight, minHeight);

    if (requiredHeight > maxHeight) {
        textarea.style.height = `${maxHeight}px`;
        textarea.style.overflowY = 'auto';
    } else {
        textarea.style.height = `${requiredHeight}px`;
        textarea.style.overflowY = 'hidden';
    }
}

async function showBeautifulNotification(senderName, messageContent) {
  // Always show the beautiful glassmorphism notification
  createGlassmorphismNotification(senderName, messageContent);
  
  // Check if window is visible and show system notification if not
  try {
    const visible = await isWindowVisible();
    if (!visible) {
      // Show system notification when window is minimized
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

function createGlassmorphismNotification(senderName, messageContent) {
  // Remove any existing notification
  const existingNotif = document.querySelector('.glassmorphism-notification');
  if (existingNotif) {
    existingNotif.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = 'glassmorphism-notification fixed top-4 right-4 z-[9999] pointer-events-auto';
  
  // Truncate message if too long
  const truncatedMessage = messageContent.length > 60 
    ? messageContent.substring(0, 57) + "..." 
    : messageContent;
  
  notification.innerHTML = `
    <div class="glassmorphism bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border border-white/30 dark:border-slate-700/30 rounded-2xl p-4 shadow-2xl transform transition-all duration-500 opacity-0 translate-x-8 hover:scale-105 min-w-[300px] max-w-[400px]">
      <!-- Gradient background overlay -->
      <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl"></div>
      
      <!-- Content -->
      <div class="relative z-10">
        <!-- Header -->
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
        
        <!-- Message -->
        <div class="bg-slate-100/50 dark:bg-slate-700/30 rounded-xl p-3 backdrop-blur-sm">
          <p class="text-slate-700 dark:text-slate-200 text-sm leading-relaxed break-words">
            ${truncatedMessage}
          </p>
        </div>
        
        <!-- Action buttons -->
        <div class="flex gap-2 mt-3">
          <button class="reply-btn flex-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-500/30 text-purple-700 dark:text-purple-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 hover:scale-105">
            Reply
          </button>
          <button class="view-btn flex-1 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 hover:from-blue-500/30 hover:to-cyan-500/30 border border-blue-500/30 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 hover:scale-105">
            View Chat
          </button>
        </div>
      </div>
      
      <!-- Status indicator -->
      <div class="absolute top-2 left-2 w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-lg"></div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    const notifElement = notification.querySelector('.glassmorphism');
    notifElement.style.opacity = '1';
    notifElement.style.transform = 'translateX(0)';
  }, 10);
  
  // Set up event listeners
  const closeBtn = notification.querySelector('.close-notification');
  const replyBtn = notification.querySelector('.reply-btn');
  const viewBtn = notification.querySelector('.view-btn');
  
  closeBtn.addEventListener('click', () => {
    removeNotification(notification);
  });
  
  replyBtn.addEventListener('click', () => {
    // Focus message input and switch to this chat
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
    // Switch to this chat
    const sender = allUsers.find(u => u.name === senderName);
    if (sender) {
      handleUserClick(sender.id);
    }
    removeNotification(notification);
  });
  
  // Auto-remove after 8 seconds
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


































/**
 * Safely parses a user ID from localStorage with validation
 * @returns {number} A valid numeric user ID
 */
function getSafeUserId() {
  const storedId = localStorage.getItem('userId');
  
  // Check if value exists and can be properly parsed
  if (storedId && !isNaN(parseInt(storedId, 10))) {
    return parseInt(storedId, 10);
  }
  
  // Generate and store a new valid ID if parsing failed
  const newId = Math.floor(Math.random() * 100000000);
  console.warn(`⚠️ Invalid userId in localStorage. Generated new ID: ${newId}`);
  localStorage.setItem('userId', newId);
  return newId;
}




// Font size adjustment
const previewContainer = document.createElement('div');
previewContainer.className = 'mt-4 p-3 rounded-lg border border-slate-300 dark:border-slate-600';

const fontSizeSlider = document.getElementById('font-size-slider');
const fontSizeValue = document.getElementById('font-size-value');

// Load saved font size or use default
const savedFontSize = localStorage.getItem('fontSizeScale') || 100;
fontSizeSlider.value = savedFontSize;
fontSizeValue.textContent = `${savedFontSize}%`;
document.documentElement.style.setProperty('--font-size-scale', savedFontSize / 100);

// Update when slider changes
fontSizeSlider.addEventListener('input', (e) => {
  const value = e.target.value;
  fontSizeValue.textContent = `${value}%`;
  
  // Update only the preview texts
  const previewTexts = document.querySelectorAll('.font-size-preview');
  previewTexts.forEach(el => {
    const baseSize = el.classList.contains('preview-text-sm') ? 0.875 : 1;
    el.style.fontSize = `${baseSize * (value / 100)}rem`;
  });
  
  // Visual feedback
  fontSizeValue.classList.add('text-purple-500', 'font-bold');
  setTimeout(() => {
    fontSizeValue.classList.remove('text-purple-500', 'font-bold');
  }, 500);
});



// Single DOM content loaded event listener
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM content loaded');

initializeModernToggle();

    localStorage.setItem('port', MSG_PORT);
      loadUserList(); 
const searchContainer = document.getElementById('titlebar-search-container');
    if (searchContainer) {
        if (window.innerWidth < 900) { // Increased breakpoint for better spacing
            searchContainer.style.display = 'none';
        } else {
            searchContainer.style.display = 'block';
        }
    }
    logSessionStart();
    const savedFontSize = localStorage.getItem('fontSizeScale') || 100;
  document.documentElement.style.setProperty('--font-size-scale', savedFontSize / 100);

// Add this to your DOMContentLoaded event listener or anywhere after Tauri is set up
console.log("🔍 DEBUGGING LOGGING:");
console.log("globalInvokeFunc available:", !!globalInvokeFunc);

// Test if the invoke function works at all
if (globalInvokeFunc) {
  globalInvokeFunc('log_session_start', {
    userName: "Test User", 
    userIp: "127.0.0.1"
  })
  .then(result => {
    console.log("✅ LOG TEST SUCCESS:", result);
    console.log("Check Documents/RoundtableChat/ folder now");
  })
  .catch(error => {
    console.error("❌ LOG TEST FAILED:", error);
  });
} else {
  console.error("❌ globalInvokeFunc is not available");
}


    // Ensure user has a unique ID for discovery
    if (!localStorage.getItem('userId') || isNaN(parseInt(localStorage.getItem('userId'), 10))) {
      const newId = Math.floor(Math.random() * 100000000);
      localStorage.setItem('userId', newId);
      localStorage.setItem('username', 'RoundtableUser');
      localStorage.setItem('displayName', 'New User');
      console.log('Generated new user ID:', newId);
    }
    // --- PARTICLE BACKGROUND ---
    createParticles();
  
    // Initialize UI components
    initializeUI();
    renderMyUserProfileFooter();
    // Set up Tauri if available
    if (window.__TAURI__) {
      console.log('Tauri detected, setting up integration');
      setupTauriIntegration();
    } else {
      console.warn('Tauri not detected - running in browser mode');
    }

    // --- DEBUG UTILITY ---
    window.__TAURI_DEBUG__ = {
      checkState: () => {
        console.log('Current users:', allUsers);
        console.log('Discovered users:', discoveredUsers);
        console.log('Active chat user ID:', activeChatUserId);
        console.log('Messages:', messages);
      }
    };

    // --- INITIALIZATION ---

    
window.addEventListener('resize', () => {
  
   const searchContainer = document.getElementById('titlebar-search-container');
    if (searchContainer) {
        if (window.innerWidth < 900) { // Increased breakpoint for better spacing
            searchContainer.style.display = 'none';
        } else {
            searchContainer.style.display = 'block';
        }
    }
  
  // Debounce resize events
  clearTimeout(window.resizeTimer);
  window.resizeTimer = setTimeout(() => {
    // Recalculate message bubble max-widths
    const messageBubbles = document.querySelectorAll('.message-bubble > div:not(.w-12)');
    messageBubbles.forEach(bubble => {
      const maxWidth = `min(28rem, calc(100vw - 8rem))`;
      bubble.style.maxWidth = maxWidth;
    });
    
    // Recalculate image sizes
    const messageImages = document.querySelectorAll('.message-bubble img');
    messageImages.forEach(img => {
      img.style.maxWidth = `min(20rem, calc(100vw - 12rem))`;
    });
  }, 100); // 100ms debounce
});
    
// Add these variables and listeners inside your DOMContentLoaded event
const pfpSelectBtn = document.getElementById('pfp-select-btn');
const pfpFileInput = document.getElementById('pfp-file-input');
const pfpPreview = document.getElementById('settings-pfp-preview');

// 1. Trigger the hidden file input when the button or image is clicked
pfpSelectBtn.addEventListener('click', () => pfpFileInput.click());
pfpPreview.addEventListener('click', () => pfpFileInput.click());

// Load existing profile picture on settings open
if (localStorage.getItem('profilePicture')) {
    pfpPreview.src = localStorage.getItem('profilePicture');
}

// 2. Handle the file selection
pfpFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        // IMPORTANT: Resize the image before saving to keep data size small
        resizeImage(event.target.result, 96, 96, (resizedBase64) => {
            // Update the preview
            pfpPreview.src = resizedBase64;
            
            // Save the resized Base64 string to localStorage
            localStorage.setItem('profilePicture', resizedBase64);
            renderMyUserProfileFooter(); 
            // Re-broadcast presence immediately with the new picture
            announcePresence();
        });
    };
    reader.readAsDataURL(file);
});



    
    setupUserStatusMonitor();
    // Initialize with animations
    setTimeout(() => {
      renderUserList();
      renderChatWindow();
      initializeResizer();
    }, 100);
});



// 3. Helper function to resize the image on a canvas
function resizeImage(base64Str, maxWidth, maxHeight, callback) {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = maxWidth;
        canvas.height = maxHeight;
        ctx.drawImage(img, 0, 0, maxWidth, maxHeight);
        // Convert canvas to a new, smaller Base64 string
        callback(canvas.toDataURL('image/jpeg', 0.8)); // Use JPEG for smaller size
    };
}


// Function to create background particles
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

// Function to set up Tauri integration
function setupTauriIntegration() {

if (window.__TAURI__ && window.__TAURI__.invoke) {
  globalInvokeFunc = window.__TAURI__.invoke;
} else if (window.__TAURI__ && window.__TAURI__.tauri && window.__TAURI__.tauri.invoke) {
  globalInvokeFunc = window.__TAURI__.tauri.invoke;
} else if (window.tauriInvoke) {
  globalInvokeFunc = window.tauriInvoke;
}
console.log("Invoke function set:", !!globalInvokeFunc);


// Listen for when the recipient accepts your file
window.__TAURI__.event.listen('file-transfer-accepted', (event) => {
    const { transferId } = event.payload;
    updateFileTransferStatus(transferId, 'accepted');
    
   // globalInvokeFunc('start_file_transfer', { transferId });
});

window.__TAURI__.event.listen('file-transfer-ready', (event) => {
    const { transferId, port, senderIp } = event.payload;
    console.log(`📩 File transfer ready event received:`, { transferId, port, senderIp });
    
    // Validate the payload
    if (!transferId || !port || !senderIp) {
        console.error("❌ Invalid file-transfer-ready payload:", event.payload);
        return;
    } 
    
    // Start the actual download
    downloadFile(transferId, senderIp, port);
});

// Also add listeners for transfer progress, completion and errors
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
    
    // Set up window controls
    if (window.__TAURI__.window) {
      // For Tauri v2, use appWindow property
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
    
    // Set up event listeners
    if (window.__TAURI__.event && window.__TAURI__.event.listen) {
      console.log('Setting up Tauri event listeners');
      
      // User online event
      window.__TAURI__.event.listen('user-online', (event) => {
        console.log('User online event:', event);
        addDiscoveredUser(event.payload || event.data);
      });
      
      // User offline event
      window.__TAURI__.event.listen('user-offline', (event) => {
  console.log('User offline event:', event);
  const userId = (event.payload || event.data)?.id;
  markUserAsOffline(userId);
});
      
      // Message received event
      window.__TAURI__.event.listen('message-received', async (event) => {
        console.log('Message received event:', event);
        const data = event.payload || event.data;
        console.log('📨 Message data:', data);
        await displayReceivedMessage(event.payload || event.data);
      });
      
      window.__TAURI__.event.listen('discovery-query-received', () => {
  console.log('📢 Received discovery query, responding with our presence.');
  announcePresence();
});

globalInvokeFunc('broadcast_discovery_query');
      
      console.log('Tauri event listeners set up successfully');
      
      // Add this: Announce your presence after setting up listeners
      setTimeout(announcePresence, 1000);
    } else {
      console.error('Tauri event API not available or missing listen method');
    }

    


// Add these inside setupTauriIntegration() -> window.__TAURI__.event.listen(...) section

// Listen for an incoming file offer
// Listen for an incoming file offer
window.__TAURI__.event.listen('file-offer-received', (event) => {
    const offerDetails = event.payload;
    console.log("File Offer Received:", offerDetails);

    // Add the sender to discovered users if not already present
    addDiscoveredUser(offerDetails.sender);

    // Create a message bubble in the UI showing the file offer
    const fileOfferMessage = {
        sender: offerDetails.sender.id,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        fileTransfer: {
            fileName: offerDetails.fileName,
            fileSize: offerDetails.fileSize,
            transferId: offerDetails.transferId,
            status: 'incoming' // Special status for UI
        }
    };
    
    if (!messages[offerDetails.sender.id]) {
        messages[offerDetails.sender.id] = [];
    }
    messages[offerDetails.sender.id].push(fileOfferMessage);
    
    // If the chat is active, re-render to show the new offer
    if (activeChatUserId === offerDetails.sender.id) {
        renderChatWindow();
    } else {
        // Otherwise, show a notification and unread count
        unreadCounts[offerDetails.sender.id] = (unreadCounts[offerDetails.sender.id] || 0) + 1;
        renderUserList();
        
        // Show beautiful notification for file offer
        showBeautifulNotification(
            offerDetails.sender.name, 
            `📎 Wants to send you: ${offerDetails.fileName} (${(offerDetails.fileSize / 1024 / 1024).toFixed(2)} MB)`
        );
    }
});







    // Update window.sendMessageToBackend to accept targetPort as parameter
window.sendMessageToBackend = function(message, targetIp, targetPort) {
  console.log(`🚀 SENDING MESSAGE to ${targetIp} (port ${targetPort}): "${message}"`);
  
  let invokeFunc = null;
  
  // Try all possible locations of the invoke function
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
    console.error("❌ Could not find invoke function");
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
    senderPort: parseInt(localStorage.getItem('port') || MSG_PORT, 10)  // Add sender port
};
  
  console.log(`📤 Invoking send_message with:`, payload);
  
  try {
    invokeFunc('send_message', payload)
      .then((result) => {
        console.log('✅ Message sent successfully to:', targetIp, 'Result:', result);
      })
      .catch(err => {
        console.error('❌ Error sending message:', err);
      });
  } catch (e) {
    console.error('❌ Exception when calling invoke:', e);
  }
};

  } catch (error) {
    console.error('Error setting up Tauri integration:', error);
  }


  setupPeriodicDiscovery();

}







// Function to initialize the UI 
function initializeUI() {
  // --- DOM ELEMENTS ---
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
  
  // Add click listeners to various chat elements
[chatViewEl, messagesContainerEl, messageInputEl, messageFormEl].forEach(element => {
  element?.addEventListener('click', () => {
    clearUnreadForActiveChat();
  });
});

// Also clear when focusing on message input
messageInputEl?.addEventListener('focus', () => {
  clearUnreadForActiveChat();
});

messagesContainerEl?.addEventListener('scroll', () => {
  clearUnreadForActiveChat();
});
messageInputEl?.addEventListener('input', () => {
  clearUnreadForActiveChat();
});
    
  // --- EVENT HANDLERS ---
  messageFormEl?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInputEl.value.trim();
    const targetUser = allUsers.find(user => user.id === activeChatUserId);

    // Exit if there is no selected user to send a message to.
    if (!targetUser) {
        console.error("No active user selected to send a message.");
        return;
    }

    // A flag to check if any action was performed.
    let messageSent = false;

    // 1. Handle sending file offers first.
    if (selectedFiles.length > 0) {
        messageSent = true;
        
        // Loop through each selected file and create a distinct offer for each.
// In script.js, inside the messageFormEl 'submit' event listener

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
    
    // This object is for the sender's UI immediately.
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

    // Invoke the backend to send the actual file offer to the peer.
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

    // 2. Handle sending the text message.
    if (text) {
        messageSent = true;
        
        const newMessage = {
            sender: 'me',
            text: text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(),
            files: [] // Files are handled separately above.
        };

        if (!messages[activeChatUserId]) {
            messages[activeChatUserId] = [];
        }
        messages[activeChatUserId].push(newMessage);

   

        const messageEl = createMessageBubble(newMessage);
        messageEl.classList.add('slide-in-right');
        document.getElementById('messages-container').appendChild(messageEl);

        // Send message to backend
        if (window.sendMessageToBackend) {
            window.sendMessageToBackend(text, targetUser.ip, targetUser.port);
        }

        // Log the sent text message.
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

    // 3. Update the UI if any message (text or file) was processed.
    if (messageSent) {
        // Re-render the entire chat window to show new message bubbles.
        //renderChatWindow();
        
        // Clear the form and reset UI elements.
        messageInputEl.value = '';
        adjustTextareaHeight(messageInputEl);
        selectedFiles = [];
        updateFilePreview();
        updateSendButton();
        scrollToBottom();
       // aiSuggestionsContainer.innerHTML = ''; // Clear AI suggestions.
    }
});




// Attachment button click handler
attachmentBtn?.addEventListener('click', async () => {
    // 1. Check if the Tauri dialog API is available
    if (!window.__TAURI__ || !window.__TAURI__.dialog || !window.__TAURI__.fs || !window.__TAURI__.path) {
        alert('File APIs are not available in this environment.');
        return;
    }

    try {
        attachmentBtn.classList.add('animate-pulse');

        // 2. Use the Tauri API to open a native file selection dialog
        const selected = await window.__TAURI__.dialog.open({
            multiple: true,
            title: 'Select Files to Send',
        });

        attachmentBtn.classList.remove('animate-pulse');

        // 3. If the user selected files, process them
        if (selected) {
            const paths = Array.isArray(selected) ? selected : [selected];
            const filesToAdd = [];

            for (const path of paths) {
                try {
                    // 4. More detailed logging for debugging
                    console.log(`Processing selected file: ${path}`);
                    
                    // 5. Get file metadata (like size) and name using the path
                    const metadata = await window.__TAURI__.fs.stat(path);
                    console.log(`Got metadata:`, metadata);
                    
                    const fileName = await window.__TAURI__.path.basename(path);
                    console.log(`Got filename: ${fileName}`);

                    // 6. Create an object that matches what the rest of your app expects
                    filesToAdd.push({
                        name: fileName,
                        path: path,
                        size: metadata.size,
                        // Mime type isn't critical here, but you could add a library for it if needed
                        type: '', 
                    });

                } catch (metaError) {
                    console.error(`Could not get metadata for file: ${path}`, metaError);
                    // More specific error message with path details
                    alert(`Error reading file metadata: ${path}\nError: ${metaError.message}`);
                }
            }
            
            // 7. Add the processed files to your selection and update the UI
            selectedFiles.push(...filesToAdd);
            updateFilePreview();
            updateSendButton();

            // Show success animation
            attachmentBtn.classList.add('text-green-500', 'animate-bounce');
            setTimeout(() => {
                attachmentBtn.classList.remove('text-green-500', 'animate-bounce');
            }, 1000);
        }
    } catch (err) {
        // This catches errors if the dialog itself fails to open
        console.error('Error opening file dialog:', err);
        attachmentBtn.classList.remove('animate-pulse');
        alert(`Error opening file selector: ${err.message}`);
    }
});









  // File input change handler
  fileInput?.addEventListener('change', (e) => {
    selectedFiles.push(...Array.from(e.target.files));
    updateFilePreview();
    updateSendButton();
    fileInput.value = '';
    
    // Show success animation
    attachmentBtn.classList.add('text-green-500', 'animate-bounce');
    setTimeout(() => {
      attachmentBtn.classList.remove('text-green-500', 'animate-bounce');
    }, 1000);
  });

  // Message input handler for typing animations and button state
  messageInputEl?.addEventListener('input', () => {
    updateSendButton();
    adjustTextareaHeight(messageInputEl);
  });

  messageInputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Prevent new line
        if (!sendBtn.disabled) {
            messageFormEl.dispatchEvent(new Event('submit', { cancelable: true }));
        }
    }
});

  // User search input handler
  userSearchInput?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    displayedUsers = allUsers.filter(user => 
      user.name.toLowerCase().includes(query) ||
      user.ip.includes(query)
    );
    renderUserList();
    
    // Add search animation
    userSearchInput.classList.add('ring-2', 'ring-blue-500/30');
    clearTimeout(userSearchInput.searchTimer);
    userSearchInput.searchTimer = setTimeout(() => {
      userSearchInput.classList.remove('ring-2', 'ring-blue-500/30');
    }, 500);
  });

  // Smart reply button click handler
  smartReplyBtn?.addEventListener('click', async () => {
    if (!activeChatUserId) return;
    
    // Add loading animation
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

  // Summarize button click handler
  summarizeBtn?.addEventListener('click', async () => {
    if (!activeChatUserId) return;
    const userMessages = messages[activeChatUserId] || [];
    if (userMessages.length === 0) return;
    
    // Add loading animation
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

  // Close summary button click handler
  closeSummaryBtn?.addEventListener('click', () => {
    summaryModal.classList.add('hidden');
  });

  // Summary modal background click handler
  summaryModal?.addEventListener('click', (e) => {
    if (e.target === summaryModal) {
      summaryModal.classList.add('hidden');
    }
  });



  // Settings button click handler
  settingsBtn?.addEventListener('click', () => {
    settingsBtn.classList.add('animate-spin');
    setTimeout(() => settingsBtn.classList.remove('animate-spin'), 300);
    showSettings();
  });

  const closeChatBtn = document.getElementById('close-chat-btn');
    closeChatBtn?.addEventListener('click', closeActiveChat);

  // Settings close buttons click handlers
  closeSettingsBtn?.addEventListener('click', closeSettings);
  cancelSettingsBtn?.addEventListener('click', closeSettings);
  



  // Save settings button click handler
// Save settings button click handler (Fixed async issue)
document.getElementById('save-settings-btn')?.addEventListener('click', async (e) => {
  e.preventDefault(); // Prevent any form submission
  
  const username = document.getElementById('settings-username').value;
  const displayName = document.getElementById('settings-displayname').value;
  const fontSize = document.getElementById('font-size-slider').value;
  const autoDownload = document.getElementById('settings-auto-download').checked;
  
  // Get old values for comparison
  const oldDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
  const oldUsername = localStorage.getItem('username') || 'Anonymous';
  
  // Save new values
  localStorage.setItem('username', username);
  localStorage.setItem('displayName', displayName);
  localStorage.setItem('fontSizeScale', fontSize);
  localStorage.setItem('autoDownloadFiles', autoDownload);

  renderMyUserProfileFooter(); 

  document.documentElement.style.setProperty('--font-size-scale', fontSize / 100);
  
  // Check if display name actually changed
  const nameChanged = displayName !== oldDisplayName;
  const usernameChanged = username !== oldUsername;
  

  

  
  // Save new values FIRST
  localStorage.setItem('username', username);
  localStorage.setItem('displayName', displayName);
  localStorage.setItem('fontSizeScale', fontSize);
  document.documentElement.style.setProperty('--font-size-scale', fontSize / 100);
  
  const saveBtn = document.getElementById('save-settings-btn');
  saveBtn.classList.add('animate-pulse', 'bg-green-500');
 
  
  if (nameChanged || usernameChanged) {
    console.log(`🔄 Name changed from "${oldDisplayName}" to "${displayName}"`);
    
    // Update your own user in the allUsers array immediately
    const myUserId = getSafeUserId();
    const myUserIndex = allUsers.findIndex(u => u.id === myUserId);
    if (myUserIndex !== -1) {
      allUsers[myUserIndex].name = displayName;
      displayedUsers = [...allUsers];
      renderUserList();
    }
    
    saveBtn.textContent = 'Broadcasting Name Change...';
    
    // IMMEDIATE BROADCAST - use existing announcePresence function
    announcePresence();
    
    // Also trigger multiple broadcasts to ensure delivery
    setTimeout(() => announcePresence(), 1000);
    setTimeout(() => announcePresence(), 2000);
    
    saveBtn.textContent = 'Name Updated! ✓';
    showNotification(`Name changed to "${displayName}"`);
    
  } else {
    saveBtn.textContent = 'Saved! ✓';
  }
  

  
  // Reset button after delay
  setTimeout(() => {
    saveBtn.classList.remove('animate-pulse', 'bg-green-500');
    saveBtn.textContent = 'Save Changes';
    closeSettings();
  }, 1500);
});

  // refresh button
  document.getElementById('refresh-users')?.addEventListener('click', (e) => {
  // Animate the button
  const button = e.currentTarget;
  button.classList.add('animate-spin');
  
  // Trigger discovery
  announcePresence();
  globalInvokeFunc('broadcast_discovery_query');
  // Show feedback
  showNotification('Searching for users...');
  if (!localStorage.getItem('port')) {
  localStorage.setItem('port', MSG_PORT);
}
  // Stop animation after 1 second
  setTimeout(() => {
    button.classList.remove('animate-spin');
  }, 1000);
  });
}







// --- USER MANAGEMENT FUNCTIONS ---
function addDiscoveredUser(user) {
  if (!user || !user.id) {
    console.error("❌ Invalid user data:", user);
    return;
  }
  
  const now = Date.now();
  user.lastSeen = now;
  
  const myUserId = getSafeUserId();
  if (user.id === myUserId) {
    return;
  }


  if (!user.port || user.port === 0) {
        console.warn(`⚠️ User ${user.name} has no port set, using default MSG_PORT`);
        user.port = MSG_PORT;
    }
    console.log(`📌 Assigned port ${user.port} to user ${user.name}`);
    
    console.log(`📌 User ${user.name} discovered with port ${user.port}`);
  const existingUserIndex = allUsers.findIndex(u => u.id === user.id);
  
  
  if (existingUserIndex !== -1) {
    console.log(`🔄 User already exists (ID: ${user.id}), updating details.`);
    
    // --- THIS BLOCK IS NOW CORRECTED ---
    // Get a direct reference to the user object we want to update
    const existingUser = allUsers[existingUserIndex];
    
    // Update all properties
    existingUser.name = user.name;
    existingUser.status = 'online';
    existingUser.lastSeen = now;
    existingUser.ip = user.ip;
    existingUser.port = user.port;
    existingUser.profile_picture = user.profile_picture;
    // These lines are now fixed to use the correct variable
    existingUser.username = user.username;
    existingUser.hostname = user.hostname;
    
  } else {
    console.log(`✨ Adding new user: ${user.name} (ID: ${user.id})`);
  
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

  // Save the updated list and re-render the UI
  saveUserList();
  displayedUsers = [...allUsers];
  renderUserList();
}




function setupUserStatusMonitor() {
  console.log("⏱️ Setting up user status monitor");
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    
    allUsers.forEach(user => {
      // Check for inactivity only for users who are currently 'online'
      if (user.status === 'online' && user.lastSeen && (now - user.lastSeen > 60000)) { // 60-second timeout
        console.log(`User ${user.name} marked as offline due to inactivity.`);
        user.status = 'offline';
        changed = true;
      }
    });
    
    if (changed) {
      saveUserList(); 
      renderUserList();
      // If the active user went offline, update the chat window to show it
      const activeUser = allUsers.find(u => u.id === activeChatUserId);
      if (activeUser && activeUser.status === 'offline') {
        renderChatWindow();
      }
    }
  }, 10000); // Check every 10 seconds
}

function markUserAsOffline(userId) {
  if (!userId) return;
  
  const userIndex = allUsers.findIndex(u => u.id === userId);
  
  if (userIndex !== -1 && allUsers[userIndex].status !== 'offline') {
    console.log(`User ${allUsers[userIndex].name} marked as offline.`);
    allUsers[userIndex].status = 'offline';

    // We must update both the master list and the displayed list
    const displayedUserIndex = displayedUsers.findIndex(u => u.id === userId);
    if (displayedUserIndex !== -1) {
        displayedUsers[displayedUserIndex].status = 'offline';
    }

    renderUserList();
    
    // If the offline user is the one you are chatting with, update the header
    if (activeChatUserId === userId) {
      renderChatWindow();
    }
  }
  saveUserList(); 
}

function showNotification(message, isError = false) {
  const notif = document.createElement('div');
  notif.className = 'fixed top-12 right-4 bg-black/20 backdrop-blur-md border border-white/20 text-white px-4 py-2 rounded-lg shadow-lg transform transition-all duration-500 opacity-0 translate-x-4 z-50 cursor-pointer hover:bg-black/30';
  
  // Parse username and message if it contains " - "
  if (message.includes(' - ')) {
    const [username, messageContent] = message.split(' - ', 2);
    notif.innerHTML = `<span class="text-green-300 font-semibold">${username}</span> - <span class="text-white">${messageContent}</span>`;
  } else {
    notif.textContent = message;
  }
  
  document.body.appendChild(notif);
  
  // Animate in from right
  setTimeout(() => {
    notif.style.opacity = '1';
    notif.style.transform = 'translateX(0)';
  }, 10);
  
  // Remove after 4 seconds (changed from 1 second)
  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transform = 'translateX(4px)';
    setTimeout(() => notif.remove(), 500);
  }, 4000);
}


// Function to clear unread count when interacting with active chat
function clearUnreadForActiveChat() {
  if (activeChatUserId && unreadCounts[activeChatUserId] > 0) {
    console.log(`👀 Clearing ${unreadCounts[activeChatUserId]} unread messages for active chat ${activeChatUserId}`);
    
    // Add animation effect before clearing
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
    
    // Clear the count after animation
    setTimeout(() => {
      unreadCounts[activeChatUserId] = 0;
      renderUserList(); // Re-render to remove the badge
    }, 300);
  }
}


// Function to remove user from the list
function removeDiscoveredUser(userId) {
  discoveredUsers = discoveredUsers.filter(u => u.id !== userId);
  allUsers = allUsers.filter(u => u.id !== userId);
  displayedUsers = [...allUsers];
  renderUserList();
  
  // If the removed user was the active chat, close the chat
  if (activeChatUserId === userId) {
    activeChatUserId = null;
    renderChatWindow();
  }
}

/**
 * Saves the entire allUsers array to localStorage.
 */
function saveUserList() {
  try {
    localStorage.setItem('allUsers', JSON.stringify(allUsers));
  } catch (e) {
    console.error("❌ Failed to save user list to localStorage.", e);
  }
}


// Loads the user list from localStorage on startup.
function loadUserList() {
  const savedUsersJSON = localStorage.getItem('allUsers')|| '';
  if (savedUsersJSON) {
    try {
      const savedUsers = JSON.parse(savedUsersJSON);
      if (Array.isArray(savedUsers)) {
        allUsers = savedUsers.map(user => ({
          ...user,
          status: 'offline' 
        }));
        displayedUsers = [...allUsers];
        console.log(`✅ Loaded ${allUsers.length} users from localStorage.`);
      }
    } catch (e) {
      console.error("❌ Failed to parse saved user list from localStorage.", e);
      allUsers = []; 
    }
  }
}

// click handler and sender info to showNotification
function showClickableNotification(message, senderId) {
  const notif = document.createElement('div');
  notif.className = 'fixed top-12 right-4 bg-black/20 backdrop-blur-md border border-white/20 text-white px-4 py-2 rounded-lg shadow-lg transform transition-all duration-500 opacity-0 translate-x-4 z-50 cursor-pointer hover:bg-black/30';
  
  if (message.includes(' - ')) {
    const [username, messageContent] = message.split(' - ', 2);
    notif.innerHTML = `<span class="text-green-300 font-semibold">${username}</span> - <span class="text-white">${messageContent}</span>`;
  } else {
    notif.textContent = message;
  }
  
  // Add click handler
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

// Function to display received messages
async function displayReceivedMessage(messageData) {
  console.log('📨 JS: Processing received message:', messageData);
  
  const myUserId = getSafeUserId();

  // Ignore messages from or not for you
  if (messageData.sender_id === getSafeUserId() || (messageData.target_id !== getSafeUserId() && messageData.target_id !== 0)) {
    return;
  }

  // Find the sender user
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
  
  // Create the new message object
  const newMessage = {
    sender: sender.id,
    text: messageData.content,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    timestamp: messageData.timestamp * 1000,
    files: []
  };
  
  // Add message to the central messages store
  if (!messages[sender.id]) {
    messages[sender.id] = [];
  }
  messages[sender.id].push(newMessage);
  
  // Check if window is focused
  const windowIsFocused = await isWindowFocused();
  
  // Update unread count if chat is not active or window not focused
  if (activeChatUserId !== sender.id || !windowIsFocused) {
    unreadCounts[sender.id] = (unreadCounts[sender.id] || 0) + 1;
    console.log(`📥 Unread count for ${sender.name} is now ${unreadCounts[sender.id]}`);
    
    // Re-render user list to show the new badge
    renderUserList();
    
    // Add animation to the new badge
    setTimeout(() => {
      const userEl = document.querySelector(`[data-user-id="${sender.id}"]`);
      const badge = userEl?.querySelector('.unread-badge');
      if (badge) {
        badge.classList.add('new-message');
        setTimeout(() => badge.classList.remove('new-message'), 1500);
      }
    }, 100);
    
    // Show in-app notification
/*const truncatedContent = messageData.content.length > 30 
  ? messageData.content.substring(0, 27) + "..." 
  : messageData.content;
showClickableNotification(`${sender.name} - ${truncatedContent}`, sender.id);*/

showBeautifulNotification(sender.name, messageData.content);

  }
  
  // Append to UI only if this is the active chat
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
  // Show system notification if window is not visible
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
 * Updates the taskbar icon badge with the total number of unread messages.
 */
async function updateTaskbarBadge() {
  if (!window.__TAURI__ || !window.__TAURI__.window) return;

  // Calculate the total number of unread messages from all chats
  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

  try {
    const appWindow = window.__TAURI__.window.getCurrentWindow();
    // Use the setBadgeCount method from the Tauri API
    await appWindow.setBadgeCount(totalUnread);
    console.log(`✅ Taskbar badge count set to: ${totalUnread}`);
  } catch (error) {
    console.error("❌ Failed to set taskbar badge count:", error);
  }
}



// --- RENDER FUNCTIONS ---
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

        // Conditional avatar logic
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
 * Renders the user's own profile info in the sidebar footer.
 */
/**
 * Renders the user's own profile info in the sidebar footer.
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
    // Get the username as well
    const username = localStorage.getItem('username') || 'anonymous';
    const profilePicture = localStorage.getItem('profilePicture');

    // Update the text to include both name and username
    usernameEl.textContent = `${displayName} (@${username})`;

    // Update the profile picture or initial
    if (profilePicture) {
        pfpImgEl.src = profilePicture;
        pfpImgEl.classList.remove('hidden');
        pfpInitialEl.classList.add('hidden');
    } else {
        pfpImgEl.classList.add('hidden');
        pfpInitialEl.classList.remove('hidden');
        pfpInitialEl.textContent = displayName.charAt(0).toUpperCase();
    }

    // Make the settings button open the settings modal
    settingsBtn.addEventListener('click', showSettings);
}



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

    // --- Profile Picture Logic for Chat Header ---
    if (user.profile_picture) {
        chatHeaderAvatarEl.className = 'w-12 h-12 rounded-full flex-shrink-0 shadow-lg';
        chatHeaderAvatarEl.innerHTML = `<img src="${user.profile_picture}" class="w-full h-full rounded-full object-cover">`;
    } else {
        chatHeaderAvatarEl.className = `w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-xl flex-shrink-0 bg-gradient-to-br ${user.avatarGradient} shadow-lg`;
        chatHeaderAvatarEl.innerHTML = user.name.charAt(0);
    }

    // --- Name and Username Display ---
    const usernameDisplay = user.username ? `<span class="text-base font-normal text-slate-500 dark:text-slate-400 ml-2">(@${user.username})</span>` : '';
    chatHeaderNameEl.innerHTML = `${user.name}${usernameDisplay}`;

    // --- Status, IP, and Hostname Display ---
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

// Helper function to update chat header
function updateChatHeader(user, avatarEl, nameEl, statusEl) {
  avatarEl.className = `w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-xl flex-shrink-0 bg-gradient-to-br ${user.avatarGradient} shadow-lg`;
  avatarEl.textContent = user.name.charAt(0);
  nameEl.textContent = user.name;
  
  statusEl.innerHTML = user.status === 'online' 
    ? `<span class="text-green-400">● Online</span> <span class="text-slate-500">&middot;</span> ${user.ip}`
    : `<span class="text-slate-400">● Offline</span> <span class="text-slate-500">&middot;</span> ${user.ip}`;
}

// Helper function to group messages by date
function groupMessagesByDate(messages) {
  const groups = [];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Format today and yesterday dates for comparison
  const todayDate = today.toLocaleDateString();
  const yesterdayDate = yesterday.toLocaleDateString();
  
  // Group messages by date
  const dateGroups = {};
  
  messages.forEach(message => {
    const msgDate = new Date(message.timestamp);
    const msgDateString = msgDate.toLocaleDateString();
    
    // Create readable date label
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
    
    // Create or add to group
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
  
  // Sort groups by date (oldest first)
  groups.sort((a, b) => a.date - b.date);
  
  return groups;
}

// Helper function to check if scroll is at the bottom
function isScrolledToBottom(element) {
  return element.scrollHeight - element.scrollTop <= element.clientHeight + 50; // 50px buffer
}

function updateTitlebarStatus() {
    // Get both the original and the new status elements
    const titlebarStatus = document.getElementById('titlebar-status');
    const sidebarStatus = document.getElementById('sidebar-status');

    // Calculate the online user count once
    const onlineCount = allUsers.filter(u => u.status === 'online').length;
    
    // Define the content to be displayed
    const statusHTML = `
        <span class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
        <span>Connected (${ onlineCount } user online)</span>
    `;

    // Update the original title bar status
    if (titlebarStatus) {
        titlebarStatus.className = 'flex items-center gap-1 text-green-400 font-medium text-xs';
        titlebarStatus.innerHTML = statusHTML;
    }

    // Update the new sidebar status
    if (sidebarStatus) {
        // We use slightly different classes to match the sidebar's style
        // After
sidebarStatus.className = 'pt-2 flex items-center justify-center gap-2 text-green-400 font-medium text-xs';
        sidebarStatus.innerHTML = statusHTML;
    }
}

/**
 * Closes the active chat and returns to the welcome screen.
 */
function closeActiveChat() {
    activeChatUserId = null; // Reset the active chat ID
    renderUserList();        // Re-render the user list to un-highlight the selection
    renderChatWindow();      // Re-render the chat window, which will show the welcome screen
}

function createMessageBubble(message) {
    const isSentByMe = message.sender === 'me';
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = `flex w-full ${isSentByMe ? 'justify-end' : 'justify-start'} my-1`;
    const animationClass = isSentByMe ? 'slide-in-right' : 'slide-in-left';

    // --- NEW: LOGIC TO HANDLE FILE TRANSFER BUBBLES ---
    if (message.fileTransfer) {
        const ft = message.fileTransfer;
        const fileSizeMb = (ft.fileSize / 1024 / 1024).toFixed(2);
        let statusHtml = '';

        // Determine what to display based on the file transfer status
        switch (ft.status) {
            case 'offered':
                statusHtml = `<p class="text-sm text-slate-500 dark:text-slate-400">${fileSizeMb} MB · <span class="text-teal-500 font-semibold">Offer Sent</span></p>`;
                break;
           // In createMessageBubble function, replace the 'incoming' case:
case 'incoming':
    const acceptBtnId = `accept-${ft.transferId}`;
    const rejectBtnId = `reject-${ft.transferId}`;
    
    statusHtml = `
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-2">${fileSizeMb} MB · Wants to send you a file.</p>
        <div class="flex gap-2 mt-1">
            <button id="${rejectBtnId}" class="flex-1 bg-red-500/20 hover:bg-red-500/40 text-red-700 dark:text-red-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300">Decline</button>
            <button id="${acceptBtnId}" class="flex-1 bg-green-500/20 hover:bg-green-500/40 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300">Accept</button>
        </div>`;
    
    // Add event listeners after the bubble is created
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
            // In the switch case for file transfers in createMessageBubble, add:
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
            
        return bubbleWrapper; // Return here to prevent falling through to text message logic
    }
    
    // --- EXISTING LOGIC FOR STANDARD TEXT MESSAGES ---
    // This part remains the same as your original code for handling text.
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
        const formattedText = escapedText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="underline text-blue-400 hover:text-blue-300 transition-colors">$1</a>');
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




function scrollToBottom(instant = false) {
  const messagesContainerEl = document.getElementById('messages-container');
  if (!messagesContainerEl) return;
  
  // Store the current scroll state before scrolling
  if (!instant) {
    // Check if already near bottom before smooth scrolling
    const isNearBottom = messagesContainerEl.scrollHeight - messagesContainerEl.scrollTop <= 
                         messagesContainerEl.clientHeight + 100;
    
    // Only use smooth scroll when already near bottom
    if (isNearBottom) {
      messagesContainerEl.scrollTo({ 
        top: messagesContainerEl.scrollHeight, 
        behavior: 'smooth'
      });
    } else {
      // Jump directly to bottom if far away
      messagesContainerEl.scrollTo({ 
        top: messagesContainerEl.scrollHeight, 
        behavior: 'auto'
      });
    }
  } else {
    // Use instant scroll when requested
    messagesContainerEl.scrollTo({ 
      top: messagesContainerEl.scrollHeight, 
      behavior: 'auto'
    });
  }
  
  // Mark that we've manually scrolled to bottom
  messagesContainerEl.dataset.manuallyScrolled = 'true';
}





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

// Function to remove file from selected files
window.removeFile = (index) => {
  selectedFiles.splice(index, 1);
  updateFilePreview();
  updateSendButton();
  
  // Add removal animation
  const fileItems = document.getElementById('file-preview')?.children;
  if (fileItems && fileItems[index]) {
    fileItems[index].style.transform = 'scale(0)';
    fileItems[index].style.opacity = '0';
    setTimeout(() => updateFilePreview(), 300);
  }
};

function getFileIcon(fileType) {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType.startsWith('video/')) return '🎥';
  if (fileType.startsWith('audio/')) return '🎵';
  if (fileType.includes('pdf')) return '📄';
  return '📁';
}

function updateSendButton() {
  const sendBtn = document.getElementById('send-btn');
  const messageInputEl = document.getElementById('message-input');
  if (!sendBtn || !messageInputEl) return;

  const hasContent = messageInputEl.value.trim().length > 0 || selectedFiles.length > 0;
  sendBtn.disabled = !hasContent;

  // The function now only needs to toggle the glow class.
  // The :disabled state in our new CSS will handle the color and cursor.
  if (hasContent) {
    sendBtn.classList.add('enabled-glow');
  } else {
    sendBtn.classList.remove('enabled-glow');
  }
}


function showSettings() {
  const settingsModal = document.getElementById('settings-modal');
  if (!settingsModal) return;
  
  // Get saved values or use defaults
  const savedUsername = localStorage.getItem('username') || 'RoundtableUser';
  const savedDisplayName = localStorage.getItem('displayName') || 'Your Name';
  
  
  document.getElementById('settings-username').value = savedUsername;
  document.getElementById('settings-displayname').value = savedDisplayName;
  document.getElementById('settings-auto-download').checked = localStorage.getItem('autoDownloadFiles') === 'true';

  settingsModal.classList.remove('hidden');
  
  // Add this to set your user ID if not already set
  if (!localStorage.getItem('userId')) {
    localStorage.setItem('userId', Math.floor(Math.random() * 100000000));
  }
  
  settingsModal.classList.remove('hidden');
  const content = settingsModal.querySelector('.glassmorphism');
  if (content) content.classList.remove('scale-95', 'opacity-0');
}

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
  // Set the initial state of the checkbox based on localStorage
  const isDark = localStorage.getItem('theme') === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  // This logic is key: the checkbox is CHECKED for LIGHT mode
  themeToggleCheckbox.checked = !isDark;

  // Listen for clicks and update the theme
  themeToggleCheckbox.addEventListener('change', () => {
    const isDarkNow = !themeToggleCheckbox.checked;
    document.documentElement.classList.toggle('dark', isDarkNow);
    localStorage.setItem('theme', isDarkNow ? 'dark' : 'light');
  });
}



 





// Add this function to your script.js
function announcePresence() {
  console.log('🔊 Announcing presence');
  
  let invokeFunc = null;
  
  // Try all possible locations of the invoke function
  if (window.__TAURI__ && window.__TAURI__.invoke) {
    invokeFunc = window.__TAURI__.invoke;
  } else if (window.__TAURI__ && window.__TAURI__.tauri && window.__TAURI__.tauri.invoke) {
    invokeFunc = window.__TAURI__.tauri.invoke;
  } else if (window.tauriInvoke) {
    invokeFunc = window.tauriInvoke;
  }
  
  if (!invokeFunc) {
    console.error('❌ Could not find invoke function for presence announcement');
    return;
  }
  
  try {
    const myUserId = getSafeUserId();
    const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
    const myUsername = localStorage.getItem('username') || 'Anonymous';
    const myProfilePicture = localStorage.getItem('profilePicture') || null;
    
    console.log(`🔊 Broadcasting presence: ${myDisplayName} (ID: ${myUserId})`);
    
    // Fix parameter names to match Rust function
    invokeFunc('broadcast_user_presence', {
      userId: myUserId,        // Changed from user_id
      name: myDisplayName,
      username: myUsername,
      profilePicture: myProfilePicture 
    })
    .then(() => {
      console.log('✅ Presence announcement sent');
    })
    .catch(err => {
      console.error('❌ Error announcing presence:', err);
      
      // Fallback to test_emit if broadcast_user_presence fails
      console.log('🔄 Falling back to test_emit');
      return invokeFunc('test_emit');
    })
    .catch(err => {
      console.error('❌ Fallback also failed:', err);
    });
  } catch (e) {
    console.error('❌ Exception in announcePresence:', e);
  }
}








// Add this function to automatically re-announce your presence periodically
function setupPeriodicDiscovery() {
  // Announce immediately first
  announcePresence();
  
  // Then set up a timer to do it every 30 seconds
  const discoveryInterval = setInterval(() => {
    console.log("Auto-discovery: Broadcasting presence...");
    announcePresence();
  }, 15000); // 30 seconds
  
  // Store reference to clear it if needed
  window.__DISCOVERY_INTERVAL = discoveryInterval;
}

// Call this at the end of your setupTauriIntegration function:


window.addEventListener('beforeunload', () => {
  if (window.__TAURI__ && window.__TAURI__.invoke) {
    const myUserId = getSafeUserId();
    globalInvokeFunc('broadcast_offline', { userId: myUserId })
   .catch((e) => console.error("Could not send offline broadcast:", e));
  }
});







// Debug utility function
window.checkUserIds = function() {
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



// Add this function to initialize the resizer
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
  
  // Load saved width
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
    
    // Prevent text selection while dragging
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const diff = e.clientX - startX;
    const newWidth = startWidth + diff;
    
    // Constrain width between min and max
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
      
      // Save the new width
      const currentWidth = parseInt(window.getComputedStyle(userListContainer).width, 10);
      localStorage.setItem('userListWidth', currentWidth);
      
      // Show feedback notification
      showResizeNotification(currentWidth);
    }
  });
  
  // Double-click to reset to default
  resizeHandle.addEventListener('dblclick', () => {
    userListContainer.style.width = '320px';
    localStorage.setItem('userListWidth', '320');
    showResizeNotification(320, 'Reset to default width');
  });
}

function initializeModernToggle() {
    const toggle = document.getElementById('theme-toggle');
    const label = toggle.closest('.modern-toggle');
    
    if (!toggle || !label) return;
    
    // Add click particle effect
    label.addEventListener('click', (e) => {
        createClickParticles(e, label);
        
        // Add haptic-like feedback
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


// Notification function with your existing styling
function showResizeNotification(width, customMessage = null) {
  const notification = document.createElement('div');
  notification.className = 'fixed top-12 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-4 py-2 rounded-xl shadow-lg z-50 transition-all duration-300 opacity-0 glassmorphism';
  notification.textContent = customMessage || `Sidebar width: ${width}px`;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translate(-50%, 0)';
  }, 10);
  
  // Remove after 2 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translate(-50%, -10px)';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}


// === LOGGING FUNCTIONS ===
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

async function logSessionStart() {
  if (!globalInvokeFunc) return;
  
  const userName = localStorage.getItem('displayName') || 'Roundtable User';
  const userIp = await getUserIP();
  
  try {
    await globalInvokeFunc('log_session_start', {
      userName,
      userIp
    });
    console.log('📝 Session logged');
  } catch (error) {
    console.error('Failed to log session start:', error);
  }
}

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
    console.log('📝 Chat participants logged');
  } catch (error) {
    console.error('Failed to log participants:', error);
  }
}

async function getUserIP() {
  // You can get this from your existing network detection or use a fallback
  return localStorage.getItem('myIP') || '127.0.0.1';
}


/**
 * Finds a file transfer message by its ID and updates its status, then re-renders the chat.
 * @param {string} transferId The unique ID of the file transfer.
 * @param {string} newStatus The new status (e.g., 'accepted', 'rejected', 'downloading').
 */
function updateFileTransferProgress(transferId, progress) {
    for (const userId in messages) {
        const userMessages = messages[userId];
        const messageIndex = userMessages.findIndex(m => m.fileTransfer && m.fileTransfer.transferId === transferId);
        
        if (messageIndex !== -1) {
            messages[userId][messageIndex].fileTransfer.status = 'downloading';
            messages[userId][messageIndex].fileTransfer.progress = progress;
            
            // If this is the active chat, update just this element in the DOM
            if (parseInt(userId) === activeChatUserId) {
                // Find the element by transfer ID
                const bubbles = document.querySelectorAll('[data-transfer-id]');
                for (const bubble of bubbles) {
                    if (bubble.dataset.transferId === transferId) {
                        // Replace with new element
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
 * Called when a user clicks the 'Accept' button on a file offer.
 * @param {string} transferId The ID of the transfer to accept.
 */
window.acceptFileOffer = function(transferId) {
    console.log(`🟢 Accepting file offer: ${transferId}`);
    
    // Update UI immediately to show acceptance
    updateFileTransferStatus(transferId, 'accepted');
    
    // Disable buttons to prevent double-clicking
    document.querySelectorAll(`button[id*="${transferId}"]`).forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.6';
    });
    
    // Get current user info
    const myUserId = getSafeUserId();
    const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
    const myUsername = localStorage.getItem('username') || 'Anonymous';
    const myProfilePicture = localStorage.getItem('profilePicture') || null;
    
    // Find the sender info from the transfer
    let senderInfo = null;
    for (const userId in messages) {
        const userMessages = messages[userId];
        const fileMessage = userMessages.find(m => 
            m.fileTransfer && m.fileTransfer.transferId === transferId
        );
        if (fileMessage) {
            senderInfo = allUsers.find(u => u.id == userId);
            console.log(`📋 Found sender for transfer:`, senderInfo);
            break;
        }
    }
    
    if (!senderInfo) {
        console.error(`❌ Could not find sender information for transfer: ${transferId}`);
        updateFileTransferStatus(transferId, 'error');
        return;
    }
    
    // CRITICAL FIX: Determine the correct port based on the sender
    // If sender is using port 2425 (dev), respond to 2425
    // If sender is using port 2426 (release), respond to 2426
   const senderPort = senderInfo.port || MSG_PORT;
    
    console.log(`📤 Sending accept response to ${senderInfo.ip}:${senderPort}`);
      
    // Call the backend to notify the sender that we accepted
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
            targetPort: senderPort // Use the sender's actual port
        })
        .then(() => {
            console.log('✅ File offer acceptance sent successfully');
            showNotification('File offer accepted! Waiting for transfer...');
        })
        .catch(err => {
            console.error('❌ Error responding to file offer:', err);
            updateFileTransferStatus(transferId, 'error');
            showNotification('Failed to accept file offer', true);
        });
    }
};

/**
 * Called when a user clicks the 'Decline' button on a file offer.
 * @param {string} transferId The ID of the transfer to reject.
 */
window.rejectFileOffer = function(transferId) {
    console.log(`Rejecting file offer: ${transferId}`);
    
    // Update UI immediately to show rejection
    updateFileTransferStatus(transferId, 'rejected');
    
    // Disable the buttons
    const buttons = document.querySelectorAll(`button[onclick*="${transferId}"]`);
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.6';
    });
    
    // Get current user info
    const myUserId = getSafeUserId();
    const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
    const myUsername = localStorage.getItem('username') || 'Anonymous';
    const myProfilePicture = localStorage.getItem('profilePicture') || null;
    
    // Find the sender info from the transfer
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

    // Call the backend to notify the sender that we rejected
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
 * Initiates a file download
 * @param {string} transferId The transfer ID
 * @param {string} filePath Where to save the file
 * @param {string} targetIp IP of the file sender
 * @param {number} targetPort Port of the file sender
 */
function initiateFileDownload(transferId, filePath, targetIp, targetPort) {
    console.log(`Initiating download for transfer: ${transferId}`);
    
    // Get current user info
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
            // Update UI to show download in progress
            updateFileTransferStatus(transferId, 'downloading');
        })
        .catch(err => {
            console.error('Error initiating file download:', err);
            updateFileTransferStatus(transferId, 'error');
        });
    }
}


/**
 * Called when user clicks download button on a file transfer
 * @param {string} transferId The transfer ID
 * @param {string} fileName The original file name
 */
function handleFileDownload(transferId, fileName) {
    // In a real implementation, you might want to show a file save dialog
    // For now, we'll use a default downloads location
    const downloadPath = `Downloads/${fileName}`;
    
    // Find the sender info from the transfer ID or active chat
    const targetUser = allUsers.find(user => user.id === activeChatUserId);
    if (!targetUser) {
        console.error('Cannot find target user for download');
        return;
    }
    
    initiateFileDownload(transferId, downloadPath, targetUser.ip, targetUser.port);
}


async function downloadFile(transferId, senderIp, port) {
  console.log(`🔄 Starting download for ${transferId} from ${senderIp}:${port}`);
  
  if (!transferId || !senderIp || !port) {
    console.error("❌ Missing required parameters for download:", { transferId, senderIp, port });
    updateFileTransferStatus(transferId, 'failed');
    showNotification("Download failed: Missing connection information", true);
    return;
  }
  
  try {
    let fileName = "downloaded_file.bin";
    let fileSize = 0; // Optional: Store size for validation
    for (const userId in messages) {
      const userMessages = messages[userId];
      const fileMessage = userMessages.find(m => m.fileTransfer && m.fileTransfer.transferId === transferId);
      if (fileMessage) {
        fileName = fileMessage.fileTransfer.fileName;
        fileSize = fileMessage.fileTransfer.fileSize;
        console.log(`📄 Found file: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
        break;
      }
    }
    
    const saveDir = await window.__TAURI__.path.downloadDir();
    const savePath = await window.__TAURI__.path.join(saveDir, fileName);
    console.log(`🔽 Saving to: ${savePath}`);
    
    updateFileTransferStatus(transferId, 'downloading');
    
    const myUserId = getSafeUserId();
    const myDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
    const myUsername = localStorage.getItem('username') || 'Anonymous';
    const myProfilePicture = localStorage.getItem('profilePicture') || null;
    
    console.log(`📥 Invoking download_file with:`, { transferId, senderIp, port, savePath });
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
    
    console.log(`✅ Download command invoked for ${fileName}`);
  } catch (err) {
    console.error(`❌ Download failed for ${transferId}:`, err);
    updateFileTransferStatus(transferId, 'failed');
    showNotification(`Download failed: ${err.message || 'Unknown error'}`, true);
  }
}


/**
 * Finds a file transfer message by its ID and updates its status, then re-renders the chat.
 * @param {string} transferId The unique ID of the file transfer.
 * @param {string} newStatus The new status (e.g., 'accepted', 'rejected', 'downloading').
 */
function updateFileTransferStatus(transferId, newStatus) {
    for (const userId in messages) {
        const userMessages = messages[userId];
        const messageIndex = userMessages.findIndex(m => m.fileTransfer && m.fileTransfer.transferId === transferId);
        
        if (messageIndex !== -1) {
            messages[userId][messageIndex].fileTransfer.status = newStatus;
            
            // If this is the active chat, re-render it
            if (parseInt(userId) === activeChatUserId) {
                renderChatWindow();
            }
            break;
        }
    }
}




function detectBuildType() {
  // Check if we're in Tauri
  if (!window.__TAURI__) return 'browser';
  
  // Try to detect build type
  if (window.__TAURI__.__tauriVersion) {
    return 'release';
  } else {
    return 'dev';
  }
}

// Store the build type for later use
const buildType = detectBuildType();
console.log(`🏗️ Running in ${buildType} mode with port ${MSG_PORT}`);
