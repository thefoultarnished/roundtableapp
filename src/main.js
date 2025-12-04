import { invoke } from "@tauri-apps/api/tauri";

document.addEventListener('DOMContentLoaded', () => {
  let users = [];
  let messages = {};
  let activeChatUserId = null;

  const themeSelectorBtn = document.getElementById('theme-selector-btn');
  const themeDropdown = document.getElementById('theme-dropdown');
  const themeOptions = document.querySelectorAll('.theme-option');
  const userListEl = document.getElementById('user-list');
  const welcomeScreenEl = document.getElementById('welcome-screen');
  const chatViewEl = document.getElementById('chat-view');
  const chatHeaderEl = chatViewEl.querySelector('header');
  const messagesContainerEl = document.getElementById('messages-container');
  const messageFormEl = document.getElementById('message-form');
  const messageInputEl = document.getElementById('message-input');
  const fileShareBtn = document.getElementById('file-share-btn');
  const fileInput = document.getElementById('file-input');
  const autoSaveStatusEl = document.getElementById('auto-save-status');
  const themeToggle = document.getElementById('theme-toggle');
  const sunIcon = document.getElementById('theme-icon-sun');
  const moonIcon = document.getElementById('theme-icon-moon');

  // Update theme icon based on mode
  const updateThemeIcon = (isDark) => {
    if (isDark) {
      sunIcon.classList.remove('hidden');
      moonIcon.classList.add('hidden');
    } else {
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
    }
  };
  
  // Theme toggle handler
  themeToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
  });

  // Color theme selector
  themeSelectorBtn.addEventListener('click', () => {
    themeDropdown.classList.toggle('hidden');
  });

  themeOptions.forEach(option => {
    option.addEventListener('click', (e) => {
      e.preventDefault();
      const selectedTheme = e.target.dataset.theme;
      document.documentElement.setAttribute('data-color-theme', selectedTheme);
      localStorage.setItem('colorTheme', selectedTheme);
      themeDropdown.classList.add('hidden');
    });
  });

  document.addEventListener('click', (e) => {
    if (!themeSelectorBtn.contains(e.target) && !themeDropdown.contains(e.target)) {
      themeDropdown.classList.add('hidden');
    }
  });

  function renderUserList() {
    userListEl.innerHTML = '';
    users.forEach(user => {
      const userEl = document.createElement('div');
      userEl.className = `flex items-center p-3 m-1 rounded-lg cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/50 transition-all duration-200 ${user.id === activeChatUserId ? 'bg-slate-200 dark:bg-slate-700' : ''}`;
      userEl.dataset.userId = user.id;
      const statusClass = user.status === 'online' ? 'bg-green-500' : 'bg-slate-500';
      const glowClass = user.status === 'online' ? 'status-online-glow' : '';
      userEl.innerHTML = `
        <div class="relative mr-4">
          <div class="w-12 h-12 rounded-full bg-gradient-to-br ${user.avatarGradient} flex items-center justify-center font-bold text-white text-xl">${user.name.charAt(0)}</div>
          <span class="absolute bottom-0 right-0 block h-3.5 w-3.5 rounded-full ${statusClass} border-2 border-white dark:border-slate-800 ${glowClass}"></span>
        </div>
        <div class="flex-grow overflow-hidden">
          <p class="font-semibold text-slate-800 dark:text-white truncate">${user.name}</p>
          <p class="text-sm text-slate-500 dark:text-slate-400 font-mono truncate">${user.ip}</p>
        </div>
      `;
      userEl.addEventListener('click', () => handleUserClick(user.id));
      userListEl.appendChild(userEl);
    });
  }
  
  function renderChatWindow() {
    if (!activeChatUserId) {
      welcomeScreenEl.style.display = 'flex';
      chatViewEl.style.display = 'none';
      return;
    }
    welcomeScreenEl.style.display = 'none';
    chatViewEl.style.display = 'flex';

    const user = users.find(u => u.id === activeChatUserId);
    const userMessages = messages[activeChatUserId] || [];

    chatHeaderEl.innerHTML = `
      <div id="chat-header-avatar" class="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-xl flex-shrink-0 bg-gradient-to-br ${user.avatarGradient}">${user.name.charAt(0)}</div>
      <div>
        <h2 id="chat-header-name" class="text-lg font-bold text-slate-900 dark:text-white">${user.name}</h2>
        <p id="chat-header-status" class="text-sm font-mono text-slate-600 dark:text-slate-400">${user.status === 'online' ? `<span class="text-green-500">Online</span>` : `<span class="text-slate-500">Offline</span>`} <span class="text-slate-400 dark:text-slate-600">&middot;</span> ${user.ip}</p>
      </div>
    `;

    messagesContainerEl.innerHTML = '';
    userMessages.forEach(msg => {
      const messageEl = createMessageBubble(msg);
      messagesContainerEl.appendChild(messageEl);
    });
    
    scrollToBottom(true);
  }

  function createMessageBubble(message) {
    const isSentByMe = message.sender === 'me';
    const bubble = document.createElement('div');
    bubble.className = `flex items-end gap-3 message-bubble ${isSentByMe ? 'justify-end' : 'justify-start'}`;
    
    const senderUser = isSentByMe ? null : users.find(u => u.id === parseInt(message.sender));
    const avatarInitial = isSentByMe ? 'U' : senderUser.name.charAt(0);
    const avatarGradient = isSentByMe ? 'from-purple-500 to-indigo-600' : senderUser.avatarGradient;
    
    let contentHtml;
    if (message.type === 'file') {
      const messageColor = isSentByMe ? 'bg-purple-600' : 'bg-slate-200 dark:bg-slate-700';
      contentHtml = `
        <div class="px-4 py-3 rounded-2xl shadow-lg ${messageColor} ${isSentByMe ? 'rounded-br-lg' : 'rounded-bl-lg'} flex items-center gap-3 w-64">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-slate-500 dark:text-slate-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
          <div class="overflow-hidden">
            <p class="text-slate-800 dark:text-white font-medium truncate">${message.file.name}</p>
            <p class="text-sm text-slate-600 dark:text-slate-300">${message.file.size}</p>
          </div>
        </div>`;
    } else {
      const messageColor = isSentByMe ? 'bg-gradient-to-br from-[var(--color-accent-500)] to-[var(--color-accent-400)]' : 'bg-slate-200 dark:bg-slate-700';
      const textColor = isSentByMe ? 'text-white' : 'text-slate-800 dark:text-white';
      contentHtml = `
        <div class="px-5 py-3 rounded-2xl shadow-lg ${messageColor} ${isSentByMe ? 'rounded-br-lg' : 'rounded-bl-lg'}">
          <p class="${textColor} leading-relaxed">${message.text}</p>
        </div>`;
    }

    bubble.innerHTML = `
      ${!isSentByMe ? `<div class="w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center font-bold text-white flex-shrink-0">${avatarInitial}</div>` : ''}
      <div class="max-w-xl">
        ${contentHtml}
        <p class="text-xs text-slate-500 dark:text-slate-500 mt-2 px-2 ${isSentByMe ? 'text-right' : 'text-left'}">${message.time}</p>
      </div>
    `;
    return bubble;
  }

  function scrollToBottom(instant = false) {
    messagesContainerEl.scrollTo({ top: messagesContainerEl.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
  }

  function handleUserClick(userId) {
    activeChatUserId = userId;
    renderUserList();
    renderChatWindow();
  }

  // Handle message submission
  messageFormEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInputEl.value.trim();
    if (text && activeChatUserId) {
      const newMessage = { type: 'text', sender: 'me', text: text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
      addMessageToChat(newMessage);
      messageInputEl.value = '';
      simulateReply(activeChatUserId);
    }
  });
  
  // Handle file sharing
  fileShareBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && activeChatUserId) {
      const newMessage = { type: 'file', sender: 'me', file: { name: file.name, size: `${(file.size / 1024 / 1024).toFixed(2)} MB` }, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
      addMessageToChat(newMessage);
    }
    fileInput.value = '';
  });

  function addMessageToChat(message) {
    if (!messages[activeChatUserId]) messages[activeChatUserId] = [];
    messages[activeChatUserId].push(message);
    
    const messageEl = createMessageBubble(message);
    messagesContainerEl.appendChild(messageEl);
    scrollToBottom();
  }

  function simulateReply(userId) {
    const user = users.find(u => u.id === userId);
    if(user.status === 'offline') return;
    setTimeout(() => {
      const reply = { type: 'text', sender: userId, text: 'testing! ✨', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
      if(activeChatUserId === userId) {
        if (!messages[userId]) messages[userId] = [];
        messages[userId].push(reply);
        const messageEl = createMessageBubble(reply);
        messagesContainerEl.appendChild(messageEl);
        scrollToBottom();
      }
    }, 1500 + Math.random() * 1000);
  }
  
  let saveTimeout;
  function runAutoSave() {
    if(!activeChatUserId) {
      autoSaveStatusEl.textContent = '';
      return;
    }
    autoSaveStatusEl.textContent = 'Saving...';
    autoSaveStatusEl.classList.remove('text-green-500', 'dark:text-green-400');
    autoSaveStatusEl.classList.add('text-slate-500', 'dark:text-slate-500');
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      autoSaveStatusEl.textContent = 'Saved ✔';
      autoSaveStatusEl.classList.add('text-green-500', 'dark:text-green-400');
    }, 1500);
  }
  messageInputEl.addEventListener('input', runAutoSave);
  
  async function initializeApp() {
    const [initialUsers, initialMessages] = await invoke("get_initial_data");
    users = initialUsers;
    messages = initialMessages;

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      document.documentElement.classList.add('dark');
      updateThemeIcon(true);
    } else {
      document.documentElement.classList.remove('dark');
      updateThemeIcon(false);
    }
    
    const savedColorTheme = localStorage.getItem('colorTheme');
    if (savedColorTheme) {
      document.documentElement.setAttribute('data-color-theme', savedColorTheme);
    }

    renderUserList();
    renderChatWindow();
  }

  initializeApp();
});
