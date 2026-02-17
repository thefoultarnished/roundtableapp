import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import MessageBubble from './MessageBubble';
import { useNetwork } from '../hooks/useNetwork';
import EmojiPicker from 'emoji-picker-react';
import * as utils from '../utils';
import { useProfilePictureBlobUrl, useProfilePictureMap } from '../hooks/useProfilePictureBlobUrl';

export default function ChatArea() {
  const { state, dispatch, online } = useAppContext();
  const { sendMessage, initiateFileOffer } = useNetwork();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const [inputValue, setInputValue] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);
  const [searchActive, setSearchActive] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const searchInputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const lastRequestedTimestampRef = useRef({}); // Track last requested timestamp per user to prevent duplicates
  const [authMode, setAuthMode] = useState(null); // 'login', 'signup', or null
  const [authUsername, setAuthUsername] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authSuccess, setAuthSuccess] = useState('');

  useEffect(() => {
    if (searchActive && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchActive]);

  // Listen for signup success/failure events
  useEffect(() => {
    const handleSignupSuccess = (event) => {
      console.log('✅ Signup success event received:', event.detail);
      setAuthLoading(false);
      setAuthSuccess('✅ Signup successful! Please login.');
      setAuthError('');
      // Clear form
      setAuthUsername('');
      setAuthPassword('');
      setAuthDisplayName('');
      // Switch to login mode
      setTimeout(() => {
        setAuthMode('login');
        setAuthSuccess('');
      }, 2000);
    };

    const handleSignupFailure = (event) => {
      console.log('❌ Signup failure event received:', event.detail);
      setAuthLoading(false);
      setAuthError(event.detail.reason || 'Signup failed');
      setAuthSuccess('');
      // Clear temporary storage on failure
      localStorage.removeItem('username');
      localStorage.removeItem('displayName');
      localStorage.removeItem('authPassword');
    };

    window.addEventListener('signup_success', handleSignupSuccess);
    window.addEventListener('signup_failed', handleSignupFailure);

    return () => {
      window.removeEventListener('signup_success', handleSignupSuccess);
      window.removeEventListener('signup_failed', handleSignupFailure);
    };
  }, []);

  const activeUser = state.allUsers.find(u => u.id === state.activeChatUserId);
  const { blobUrl: activeUserProfilePicture } = useProfilePictureBlobUrl(
    activeUser?.id || activeUser?.username,
    activeUser?.profile_picture,
    activeUser?.profile_picture_timestamp
  );
  const userMessages = state.activeChatUserId ? (state.messages[state.activeChatUserId] || []) : [];
  const groupedMessages = useMemo(() => utils.groupMessagesByDate(userMessages), [userMessages]);

  // Load profile pictures ONCE for all senders in this chat (optimization)
  // Get unique senders from messages (memoized by sender IDs, not array reference)
  const senderIds = useMemo(() => {
    const ids = new Set();
    const currentUser = state.allUsers.find(u => u.username === state.currentUser?.username);

    // Always include current user for 'me' messages
    if (currentUser) {
      ids.add('me');
    }

    // Include all unique sender IDs from messages
    userMessages.forEach(msg => {
      if (msg.sender !== 'me') {
        ids.add(msg.sender);
      }
    });

    // Return sorted string for stable comparison
    return Array.from(ids).sort().join(',');
  }, [userMessages, state.allUsers, state.currentUser?.username]);

  // Build user objects only when sender IDs change
  const uniqueSenderUsers = useMemo(() => {
    const senderMap = {};
    const currentUser = state.allUsers.find(u => u.username === state.currentUser?.username);

    if (currentUser) {
      senderMap['me'] = currentUser;
    }

    // Split sender IDs and filter out empty strings
    if (senderIds && senderIds.trim()) {
      senderIds.split(',').forEach(id => {
        id = id.trim();
        if (id && id !== 'me') {
          const user = state.allUsers.find(u => u.id === id);
          if (user) {
            senderMap[id] = user;
          }
        }
      });
    }

    return Object.values(senderMap);
  }, [senderIds, state.allUsers, state.currentUser?.username]);

  // Load blob URLs for all senders ONCE (called only when sender IDs change)
  const senderProfilePictureMap = useProfilePictureMap(uniqueSenderUsers);

  // Scroll to bottom on new messages or when opening a new chat
  useEffect(() => {
    if (!messagesEndRef.current) return;

    // Don't auto-scroll if we're currently loading older messages from the top
    if (state.loadingOlderMessages?.[state.activeChatUserId]) {
      return;
    }

    // Only scroll to bottom when:
    // 1. User has scrolled to bottom and new messages arrive
    // 2. Messages list is empty (before any messages loaded)
    const shouldScroll = isScrolledToBottom || userMessages.length === 0;

    if (shouldScroll) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: userMessages.length < 60 ? 'smooth' : 'auto' });
      }, 0);
    }
  }, [userMessages.length, isScrolledToBottom, state.activeChatUserId, state.loadingOlderMessages]);

  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      setIsScrolledToBottom(scrollHeight - scrollTop - clientHeight < 100);
    }
  };

  // Track visible messages for read receipts
  useEffect(() => {
    if (!state.activeChatUserId) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const messageId = entry.target.dataset.messageId;
            if (messageId) {
              // Update last read message ID (debounced via action)
              dispatch({
                type: 'UPDATE_LAST_READ_MESSAGE',
                payload: { userId: state.activeChatUserId, messageId }
              });
            }
          }
        });
      },
      { root: messagesContainerRef.current, threshold: 0.5 }
    );

    // Observe all message elements
    const messageElements = messagesContainerRef.current?.querySelectorAll('[data-message-id]');
    messageElements?.forEach(el => observer.observe(el));

    return () => {
      messageElements?.forEach(el => observer.unobserve(el));
      observer.disconnect();
    };
  }, [state.activeChatUserId, userMessages.length, dispatch]);

  // Infinite scroll: detect when user scrolls to top to load older messages
  useEffect(() => {
    if (!state.activeChatUserId || userMessages.length === 0 || state.loadingOlderMessages?.[state.activeChatUserId]) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // User scrolled to top, load older messages
            const oldestMessage = userMessages[0];
            if (oldestMessage?.timestamp && !state.loadingOlderMessages?.[state.activeChatUserId]) {
              // Check if we've already requested this timestamp (prevent duplicates)
              const lastRequested = lastRequestedTimestampRef.current[state.activeChatUserId];
              if (lastRequested === oldestMessage.timestamp) {
                console.log(`⏭️ Already loading messages before ${oldestMessage.timestamp}, skipping duplicate request`);
                return;
              }

              console.log(`⬆️ Reached top, loading messages older than ${oldestMessage.timestamp}`);
              lastRequestedTimestampRef.current[state.activeChatUserId] = oldestMessage.timestamp;

              dispatch({
                type: 'SET_LOADING_OLDER_MESSAGES',
                payload: { userId: state.activeChatUserId, isLoading: true }
              });
              online?.requestChatHistory?.(state.activeChatUserId, 50, oldestMessage.timestamp);
            }
          }
        });
      },
      { root: messagesContainerRef.current, threshold: 0.1 }
    );

    // Observe the FIRST message (top of list)
    const firstMessage = messagesContainerRef.current?.querySelector('[data-message-id]');
    if (firstMessage) {
      observer.observe(firstMessage);
    }

    return () => {
      if (firstMessage) observer.unobserve(firstMessage);
      observer.disconnect();
    };
  }, [state.activeChatUserId, userMessages.length, online, dispatch]);

  // Auto-resize textarea
  const adjustTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxH = 128, minH = 48;
    const required = Math.max(textarea.scrollHeight, minH);
    textarea.style.height = `${Math.min(required, maxH)}px`;
    textarea.style.overflowY = required > maxH ? 'auto' : 'hidden';
  }, []);

  const hasContent = inputValue.trim().length > 0 || state.selectedFiles.length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!activeUser) return;
    let sent = false;

    if (state.selectedFiles.length > 0) {
      sent = true;
      state.selectedFiles.forEach(file => initiateFileOffer(file, activeUser));
    }

    if (inputValue.trim()) {
      sent = true;
      const isOnlineMode = localStorage.getItem('connectionMode') === 'online';
      
      // Only manually add if NOT in online mode (online mode handles its own optimistic update)
      if (!isOnlineMode) {
        const newMessage = {
          sender: 'me',
          text: inputValue.trim(),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: Date.now(),
          files: [],
        };
        dispatch({ type: 'ADD_MESSAGE', payload: { userId: state.activeChatUserId, message: newMessage } });
      }
      
      sendMessage(inputValue.trim(), activeUser.ip, activeUser.port);
    }

    if (sent) {
      setInputValue('');
      dispatch({ type: 'CLEAR_SELECTED_FILES' });
      if (textareaRef.current) textareaRef.current.style.height = '48px';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (hasContent) handleSubmit(e);
    }
  };

  const handleAttachment = async () => {
    if (!window.__TAURI__?.dialog || !window.__TAURI__?.fs || !window.__TAURI__?.path) {
      alert('File APIs not available in browser mode.');
      return;
    }
    try {
      const selected = await window.__TAURI__.dialog.open({ multiple: true, title: 'Select Files to Send' });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        const filesToAdd = [];
        for (const path of paths) {
          try {
            const metadata = await window.__TAURI__.fs.stat(path);
            const fileName = await window.__TAURI__.path.basename(path);
            filesToAdd.push({ name: fileName, path, size: metadata.size, type: '' });
          } catch (err) { console.error('Metadata error:', err); }
        }
        dispatch({ type: 'ADD_SELECTED_FILES', payload: filesToAdd });
      }
    } catch (err) { console.error('File dialog error:', err); }
  };

  const handleCloseChat = () => dispatch({ type: 'SET_ACTIVE_CHAT', payload: null });

  const handleEmojiClick = (emojiObject) => {
    setInputValue(prev => prev + emojiObject.emoji);
    setEmojiPickerOpen(false);
    textareaRef.current?.focus();
  };

  // Handle read receipts when user focuses on input (starts typing)
  const handleInputFocus = () => {
    setInputFocused(true);

    // Send read receipt when user clicks to type a reply
    if (state.activeChatUserId && online?.sendReadReceipts) {
      console.log(`✍️ User focused on input, sending read receipt for ${state.activeChatUserId}`);
      online.sendReadReceipts(state.activeChatUserId);
    }
  };

  // ===== Welcome Screen =====
  if (!state.activeChatUserId || !activeUser) {
    // Auth UI if not logged in
    if (!state.currentUser) {
      return (
        <main className="glass-panel flex-1 h-full flex flex-col rounded-2xl z-10 min-w-[400px] overflow-hidden relative">
          {/* Animated background elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-20 right-20 w-96 h-96 bg-gradient-to-br from-cyan-500/10 to-teal-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
            <div className="absolute bottom-20 left-20 w-80 h-80 bg-gradient-to-tr from-blue-500/5 to-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
          </div>

          <div className="flex flex-col items-center justify-center h-full p-8 text-center relative z-10">
            {/* Icon container with floating animation */}
            <div className="mb-12 relative">
              <div className="animate-float" style={{ animation: 'float 3s ease-in-out infinite' }}>
                <div className="relative w-32 h-32">
                  {/* Outer ring */}
                  <div className="absolute inset-0 rounded-full border-2 border-gradient-to-r from-cyan-400/30 to-teal-400/30 animate-spin" style={{ animationDuration: '8s', animationDirection: 'reverse' }} />

                  {/* Inner glow */}
                  <div className="absolute inset-2 rounded-full bg-gradient-to-br from-cyan-400/10 to-teal-400/10 blur-xl" />

                  {/* Icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-32 h-32 text-white/20 relative" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2" />
                    <rect width="18" height="18" x="3" y="4" rx="2" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>

                  {/* Orbiting particles */}
                  <div className="absolute w-2 h-2 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50" style={{
                    animation: 'orbit 6s linear infinite',
                    top: '50%', left: '50%',
                    transformOrigin: '0 0',
                  }} />
                  <div className="absolute w-1.5 h-1.5 rounded-full bg-teal-400 shadow-lg shadow-teal-400/50" style={{
                    animation: 'orbit 8s linear infinite',
                    top: '50%', left: '50%',
                    transformOrigin: '0 0',
                    animationDelay: '2s'
                  }} />
                </div>
              </div>
            </div>

            {/* Text content */}
            <div className="max-w-xl">
              <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-cyan-400 via-blue-300 to-teal-400 bg-clip-text text-transparent leading-tight" style={{
                fontFamily: '"Sohne", "Helvetica Neue", sans-serif',
                fontWeight: '700',
                letterSpacing: '-0.02em'
              }}>
                Welcome to Roundtable
              </h2>
              <p className="text-lg text-slate-400 leading-relaxed font-light">
                Sign up or log in to start chatting. Your messages are encrypted end-to-end and never stored.
              </p>
            </div>

            {/* Feature badges with staggered animation */}
            <div className="mt-12 flex flex-wrap gap-3 justify-center mb-8">
              {[
                { icon: '🔒', label: 'End-to-end encrypted', delay: '0s' },
                { icon: '📡', label: 'Peer-to-peer', delay: '0.1s' },
                { icon: '⚡', label: 'Real-time', delay: '0.2s' }
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="px-5 py-3 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 text-sm text-slate-300 backdrop-blur-md hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-all duration-500 hover:scale-105 hover:shadow-lg hover:shadow-cyan-400/10"
                  style={{
                    animation: 'fadeInUp 0.6s ease-out forwards',
                    animationDelay: item.delay,
                    opacity: 0
                  }}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>

            {/* Auth UI */}
            {!authMode ? (
              <div className="flex gap-4">
                <button
                  onClick={() => setAuthMode('signup')}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-teal-400 to-cyan-500 text-white font-semibold text-sm hover:shadow-lg hover:shadow-cyan-400/30 transition-all duration-300 hover:scale-105 active:scale-95"
                >
                  Sign Up
                </button>
                <button
                  onClick={() => setAuthMode('login')}
                  className="px-6 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white font-semibold text-sm hover:bg-white/20 hover:border-white/40 transition-all duration-300 hover:scale-105 active:scale-95 backdrop-blur-md"
                >
                  Log In
                </button>
              </div>
            ) : (
              <div className="w-full max-w-xs space-y-4">
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const usernameValid = authUsername.trim().length >= 2 && authUsername.trim().length <= 14;
                  const displayNameValid = authDisplayName.trim().length >= 2 && authDisplayName.trim().length <= 20;
                  const passwordValid = authPassword.length >= 1 && authPassword.length <= 14;
                  const usernameFormatValid = /^[a-zA-Z0-9_.]{2,14}$/.test(authUsername.trim());

                  setAuthError('');

                  // Client-side validation
                  if (!usernameFormatValid) {
                    setAuthError('Username: 2-14 chars (letters, numbers, dot, underscore only)');
                    return;
                  }
                  if (!usernameValid) {
                    setAuthError('Username must be 2-14 characters');
                    return;
                  }
                  if (!passwordValid) {
                    setAuthError('Password must be 1-14 characters');
                    return;
                  }
                  if (authMode === 'signup' && !displayNameValid) {
                    setAuthError('Display name must be 2-20 characters');
                    return;
                  }

                  setAuthLoading(true);
                  setAuthError('');
                  setAuthSuccess('');

                  try {
                    // Validate with server
                    const validation = await online?.validateUsername?.(authUsername.trim(), authPassword, authMode);

                    if (!validation?.valid) {
                      setAuthError(validation?.reason || 'Authentication failed');
                      setAuthLoading(false);
                      return;
                    }

                    if (authMode === 'signup') {
                      // SIGNUP FLOW: Don't auto-login, wait for server confirmation
                      const lowercaseUsername = authUsername.toLowerCase().trim();
                      console.log(`📝 Signup initiated for: ${lowercaseUsername}`);

                      // Store username and password for identify (lowercase)
                      localStorage.setItem('username', lowercaseUsername);
                      localStorage.setItem('displayName', authDisplayName.trim());
                      localStorage.setItem('authPassword', authPassword);

                      // Store password temporarily for identify
                      if (online?.setAuthPassword) {
                        online.setAuthPassword(authPassword);
                      }

                      // Send identify with password - server will create user and respond
                      setTimeout(() => {
                        if (online?.sendIdentifyWithPassword) {
                          online.sendIdentifyWithPassword();
                        }
                      }, 100);

                      // Keep loading state - will be cleared by signup_success/failure handler
                      // Don't clear form yet - wait for confirmation
                    } else {
                      // LOGIN FLOW: Proceed normally
                      const lowercaseUsername = authUsername.toLowerCase().trim();
                      console.log(`🔑 Login initiated for: ${lowercaseUsername}`);

                      // Store password in localStorage for session persistence
                      localStorage.setItem('authPassword', authPassword);

                      // Set password for identify
                      if (online?.setAuthPassword) {
                        online.setAuthPassword(authPassword);
                      }

                      dispatch({
                        type: 'LOGIN',
                        payload: {
                          username: lowercaseUsername,
                          displayName: lowercaseUsername
                        }
                      });

                      // Send identify with password
                      setTimeout(() => {
                        if (online?.sendIdentifyWithPassword) {
                          online.sendIdentifyWithPassword();
                        }
                      }, 100);

                      setAuthMode(null);
                      setAuthUsername('');
                      setAuthPassword('');
                      setAuthLoading(false);
                    }
                  } catch (err) {
                    setAuthError('Error during authentication');
                    console.error('Auth validation error:', err);
                    setAuthLoading(false);
                  }
                }} className="space-y-3">
                  <div>
                    <input
                      type="text"
                      placeholder="Username (a-z, 0-9, ., _)"
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      maxLength="14"
                      className="w-full px-4 py-2.5 rounded-lg bg-white/30 border border-white/20 text-white placeholder:text-white/50 outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400/50 transition-all duration-300 backdrop-blur-md text-sm"
                      autoFocus
                    />
                  </div>
                  <div>
                    <input
                      type="password"
                      placeholder="Password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      maxLength="14"
                      className="w-full px-4 py-2.5 rounded-lg bg-white/30 border border-white/20 text-white placeholder:text-white/50 outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400/50 transition-all duration-300 backdrop-blur-md text-sm"
                    />
                  </div>
                  {authMode === 'signup' && (
                    <div>
                      <input
                        type="text"
                        placeholder="Display Name"
                        value={authDisplayName}
                        onChange={(e) => setAuthDisplayName(e.target.value)}
                        maxLength="20"
                        className="w-full px-4 py-2.5 rounded-lg bg-white/30 border border-white/20 text-white placeholder:text-white/50 outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400/50 transition-all duration-300 backdrop-blur-md text-sm"
                      />
                    </div>
                  )}
                  {/* Validation Messages */}
                  {authUsername.trim() && !/^[a-zA-Z0-9_.]*$/.test(authUsername.trim()) && (
                    <p className="text-xs text-red-300/80">Only letters, numbers, dot, and underscore allowed</p>
                  )}
                  {authUsername.trim().length > 0 && authUsername.trim().length < 2 && (
                    <p className="text-xs text-red-300/80">Username minimum 2 characters</p>
                  )}
                  {authUsername.trim().length > 14 && (
                    <p className="text-xs text-red-300/80">Username maximum 14 characters</p>
                  )}
                  {authPassword.length > 0 && authPassword.length > 14 && (
                    <p className="text-xs text-red-300/80">Password maximum 14 characters</p>
                  )}
                  {authMode === 'signup' && authDisplayName.trim().length > 0 && authDisplayName.trim().length < 2 && (
                    <p className="text-xs text-red-300/80">Display name minimum 2 characters</p>
                  )}
                  {authMode === 'signup' && authDisplayName.trim().length > 20 && (
                    <p className="text-xs text-red-300/80">Display name maximum 20 characters</p>
                  )}
                  {authError && (
                    <p className="text-xs text-red-300/80 font-semibold">{authError}</p>
                  )}
                  {authSuccess && (
                    <p className="text-xs text-green-400 font-semibold">{authSuccess}</p>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={
                      authLoading ||
                      authUsername.trim().length < 2 ||
                      authUsername.trim().length > 14 ||
                      !/^[a-zA-Z0-9_.]*$/.test(authUsername.trim()) ||
                      authPassword.length < 1 ||
                      authPassword.length > 14 ||
                      (authMode === 'signup' && (authDisplayName.trim().length < 2 || authDisplayName.trim().length > 20))
                    }
                    className={`w-full px-4 py-2.5 rounded-lg font-semibold text-sm transition-all duration-300 active:scale-95 ${
                      authLoading ||
                      authUsername.trim().length < 2 ||
                      authUsername.trim().length > 14 ||
                      !/^[a-zA-Z0-9_.]*$/.test(authUsername.trim()) ||
                      authPassword.length < 1 ||
                      authPassword.length > 14 ||
                      (authMode === 'signup' && (authDisplayName.trim().length < 2 || authDisplayName.trim().length > 20))
                        ? 'bg-gradient-to-r from-slate-500 to-slate-600 text-white/50 cursor-not-allowed'
                        : 'bg-gradient-to-r from-teal-400 to-cyan-500 text-white hover:shadow-lg hover:shadow-cyan-400/30'
                    }`}
                  >
                    {authLoading ? 'Validating...' : (authMode === 'login' ? 'Log In' : 'Sign Up')}
                  </button>
                </form>
                <button
                  onClick={() => {
                    setAuthMode(null);
                    setAuthUsername('');
                    setAuthDisplayName('');
                  }}
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white/70 font-medium text-sm hover:bg-white/20 hover:border-white/40 transition-all duration-300 backdrop-blur-md"
                >
                  Back
                </button>
              </div>
            )}
          </div>

        <style>{`
          @keyframes orbit {
            from { transform: translate(-50%, -50%) rotate(0deg) translateX(48px) rotate(0deg); }
            to { transform: translate(-50%, -50%) rotate(360deg) translateX(48px) rotate(-360deg); }
          }
          @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
          }
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </main>
    );
    }

    // Regular welcome screen for logged-in users
    return (
      <main className="glass-panel flex-1 h-full flex flex-col rounded-2xl z-10 min-w-[400px] overflow-hidden relative">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 right-20 w-96 h-96 bg-gradient-to-br from-cyan-500/10 to-teal-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
          <div className="absolute bottom-20 left-20 w-80 h-80 bg-gradient-to-tr from-blue-500/5 to-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
        </div>

        <div className="flex flex-col items-center justify-center h-full p-8 text-center relative z-10">
          {/* Icon container with floating animation */}
          <div className="mb-12 relative">
            <div className="animate-float" style={{ animation: 'float 3s ease-in-out infinite' }}>
              <div className="relative w-32 h-32">
                {/* Outer ring */}
                <div className="absolute inset-0 rounded-full border-2 border-gradient-to-r from-cyan-400/30 to-teal-400/30 animate-spin" style={{ animationDuration: '8s', animationDirection: 'reverse' }} />

                {/* Inner glow */}
                <div className="absolute inset-2 rounded-full bg-gradient-to-br from-cyan-400/10 to-teal-400/10 blur-xl" />

                {/* Icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-32 h-32 text-white/20 relative" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2" />
                  <rect width="18" height="18" x="3" y="4" rx="2" />
                  <circle cx="12" cy="10" r="3" />
                </svg>

                {/* Orbiting particles */}
                <div className="absolute w-2 h-2 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50" style={{
                  animation: 'orbit 6s linear infinite',
                  top: '50%', left: '50%',
                  transformOrigin: '0 0',
                }} />
                <div className="absolute w-1.5 h-1.5 rounded-full bg-teal-400 shadow-lg shadow-teal-400/50" style={{
                  animation: 'orbit 8s linear infinite',
                  top: '50%', left: '50%',
                  transformOrigin: '0 0',
                  animationDelay: '2s'
                }} />
              </div>
            </div>
          </div>

          {/* Text content */}
          <div className="max-w-xl">
            <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-cyan-400 via-blue-300 to-teal-400 bg-clip-text text-transparent leading-tight" style={{
              fontFamily: '"Sohne", "Helvetica Neue", sans-serif',
              fontWeight: '700',
              letterSpacing: '-0.02em'
            }}>
              Welcome to Roundtable
            </h2>
            <p className="text-lg text-slate-400 leading-relaxed font-light">
              Select a conversation from the sidebar to begin. Your messages are encrypted end-to-end and never stored.
            </p>
          </div>

          {/* Feature badges with staggered animation */}
          <div className="mt-12 flex flex-wrap gap-3 justify-center">
            {[
              { icon: '🔒', label: 'End-to-end encrypted', delay: '0s' },
              { icon: '📡', label: 'Peer-to-peer', delay: '0.1s' },
              { icon: '⚡', label: 'Real-time', delay: '0.2s' }
            ].map((item, idx) => (
              <div
                key={idx}
                className="px-5 py-3 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 text-sm text-slate-300 backdrop-blur-md hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-all duration-500 hover:scale-105 hover:shadow-lg hover:shadow-cyan-400/10"
                style={{
                  animation: 'fadeInUp 0.6s ease-out forwards',
                  animationDelay: item.delay,
                  opacity: 0
                }}
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>

        <style>{`
          @keyframes orbit {
            from { transform: translate(-50%, -50%) rotate(0deg) translateX(48px) rotate(0deg); }
            to { transform: translate(-50%, -50%) rotate(360deg) translateX(48px) rotate(-360deg); }
          }
          @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
          }
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </main>
    );
  }

  // ===== Active Chat =====
  return (
    <main 
      className="glass-panel flex-1 h-full flex flex-col rounded-2xl z-10 min-w-[400px] overflow-hidden relative"
      onClick={() => {
        if (state.activeChatUserId) {
          dispatch({ type: 'CLEAR_UNREAD', payload: state.activeChatUserId });

          // Send read receipts when chat area is clicked
          if (online?.sendReadReceipts) {
            console.log(`👁️ Chat clicked, sending read receipts for ${state.activeChatUserId}`);
            online.sendReadReceipts(state.activeChatUserId);
          }
        }
      }}
    >
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-cyan-500/5 to-teal-500/5 blur-3xl" />
      </div>

      <div className="flex flex-col flex-grow h-full relative z-10">
        {/* Chat header */}
        <header className="px-6 py-4 flex items-center justify-between space-x-4 flex-shrink-0 border-b border-white/5 backdrop-blur-xl">
          <div className="flex items-center space-x-4 min-w-0">
            {/* Avatar */}
            <div className="relative flex-shrink-0 group">
              {activeUserProfilePicture ? (
                <div className="w-12 h-12 rounded-full shadow-lg ring-2 ring-cyan-400/20 overflow-hidden hover:ring-cyan-400/40 transition-all duration-300">
                  <img src={activeUserProfilePicture} className="w-full h-full object-cover" alt={activeUser.name} />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg flex-shrink-0 bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg ring-2 ring-cyan-400/20 group-hover:ring-cyan-400/40 transition-all duration-300">
                  {activeUser?.name?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
              {/* Status indicator */}
              <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-slate-900 ${activeUser?.status === 'online' ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-slate-600'} transition-all duration-300`} />
            </div>

            {/* User info */}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-white truncate flex items-center gap-2">
                {activeUser?.name}
                {activeUser?.username && (
                  <span className="text-xs font-normal text-slate-400">@{activeUser.username}</span>
                )}
              </h2>
              <div className="flex items-center gap-2 text-xs">
                <span className={`flex items-center gap-1 font-medium transition-colors duration-300 ${activeUser?.status === 'online' ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <span className={`w-2 h-2 rounded-full ${activeUser?.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  {activeUser?.status}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500 font-mono text-[10px]">{activeUser?.ip}</span>
              </div>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Search Toggle (Expandable) */}
             <div className={`relative overflow-hidden flex items-center transition-all duration-300 ease-out h-10 ${
               searchActive
                 ? 'w-64 bg-white/10 rounded-xl ring-1 ring-cyan-400/30'
                 : 'w-10 bg-transparent rounded-lg hover:bg-white/5'
             }`}>
               <button
                 onClick={() => setSearchActive(!searchActive)}
                 title={searchActive ? "Close Search" : "Search Messages"}
                 className={`absolute left-0 top-0 w-10 h-10 flex items-center justify-center transition-colors z-10 flex-shrink-0 ${
                   searchActive ? 'text-cyan-400' : 'text-slate-400 hover:text-white'
                 }`}
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                   <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                 </svg>
               </button>

               <input
                 ref={searchInputRef}
                 type="text"
                 placeholder="Search..."
                 className={`flex-1 h-full bg-transparent border-none outline-none text-xs text-white placeholder:text-slate-400 pl-10 pr-3 transition-all duration-200 ${
                   searchActive ? 'opacity-100 cursor-text' : 'opacity-0 cursor-pointer pointer-events-none'
                 }`}
               />
             </div>

            {/* Close button */}
            <button 
              onClick={handleCloseChat} 
              title="Close Chat" 
              className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-red-500/10 transition-all duration-300 hover:scale-110 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Messages container */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-grow p-5 overflow-y-auto space-y-3 scroll-smooth custom-scrollbar"
          style={{
            scrollBehavior: 'smooth',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(6, 182, 212, 0.4) transparent',
          }}
        >
          {groupedMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <div className="text-4xl mb-3 opacity-50">💬</div>
                <p className="text-slate-400 text-sm">No messages yet. Start the conversation!</p>
              </div>
            </div>
          ) : (
            <>
              {groupedMessages.map((group, gi) => (
                <React.Fragment key={gi}>
                  {/* Date separator */}
                  <div className="flex justify-center my-6">
                    <div className="px-4 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-gradient-to-r from-white/10 to-white/5 border border-white/10 text-slate-400 backdrop-blur-md shadow-sm hover:border-cyan-400/20 transition-all duration-300">
                      {group.dateLabel}
                    </div>
                  </div>
                  
                  {/* Messages */}
                  {group.messages.map((msg, mi) => (
                    <div
                      key={`${gi}-${mi}`}
                      data-message-id={msg.messageId}
                    >
                      <MessageBubble message={msg} profilePictureMap={senderProfilePictureMap} />
                    </div>
                  ))}
                </React.Fragment>
              ))}
              <div ref={messagesEndRef} className="h-2" />
            </>
          )}

          {/* CSS for message animations & custom scrollbar */}
          <style>{`
            @keyframes slideIn {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }

            /* Custom scrollbar - only thumb, no track */
            .custom-scrollbar::-webkit-scrollbar {
              width: 8px;
            }

            .custom-scrollbar::-webkit-scrollbar-track {
              background: transparent;
              margin: 8px 0;
            }

            .custom-scrollbar::-webkit-scrollbar-thumb {
              background: linear-gradient(180deg, rgba(34, 197, 230, 0.5) 0%, rgba(20, 184, 166, 0.5) 100%);
              border-radius: 10px;
              border: 2px solid transparent;
              background-clip: content-box;
              transition: all 0.3s ease;
            }

            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: linear-gradient(180deg, rgba(34, 197, 230, 0.8) 0%, rgba(20, 184, 166, 0.8) 100%);
              box-shadow: 0 0 12px rgba(6, 182, 212, 0.5);
              border: 1px solid rgba(6, 182, 212, 0.3);
              background-clip: padding-box;
            }

            .custom-scrollbar::-webkit-scrollbar-thumb:active {
              background: linear-gradient(180deg, rgba(34, 197, 230, 1) 0%, rgba(20, 184, 166, 1) 100%);
              box-shadow: 0 0 16px rgba(6, 182, 212, 0.7);
            }

            /* Dark theme scrollbar */
            .dark .custom-scrollbar::-webkit-scrollbar-thumb {
              background: linear-gradient(180deg, rgba(34, 197, 230, 0.4) 0%, rgba(20, 184, 166, 0.4) 100%);
            }

            .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: linear-gradient(180deg, rgba(34, 197, 230, 0.7) 0%, rgba(20, 184, 166, 0.7) 100%);
              box-shadow: 0 0 12px rgba(6, 182, 212, 0.4);
            }

            /* Aurora theme scrollbar */
            .aurora .custom-scrollbar::-webkit-scrollbar-thumb {
              background: linear-gradient(180deg, rgba(99, 102, 241, 0.4) 0%, rgba(34, 197, 230, 0.4) 100%);
            }

            .aurora .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: linear-gradient(180deg, rgba(99, 102, 241, 0.7) 0%, rgba(34, 197, 230, 0.7) 100%);
              box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
            }
          `}</style>
        </div>

        {/* File preview section */}
        {state.selectedFiles.length > 0 && (
          <div className="px-5 pb-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="p-3 bg-gradient-to-br from-cyan-500/10 to-teal-500/5 rounded-2xl flex flex-wrap gap-2.5 max-h-32 overflow-y-auto backdrop-blur-md border border-cyan-400/20 hover:border-cyan-400/40 transition-all duration-300">
              {state.selectedFiles.map((file, i) => (
                <div 
                  key={i} 
                  className="flex items-center gap-2.5 bg-white/10 p-2.5 rounded-lg text-sm hover:scale-[1.02] transition-all duration-300 group border border-white/10 hover:border-cyan-400/30"
                >
                  <span className="text-lg group-hover:scale-125 transition-transform">{utils.getFileIcon(file.type)}</span>
                  <span className="text-slate-200 font-medium text-xs flex-1 truncate">{file.name.length > 20 ? `${file.name.substring(0, 18)}...` : file.name}</span>
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">{(file.size / 1024 / 1024).toFixed(2)}MB</span>
                  <button 
                    className="w-5 h-5 rounded-full bg-red-500/20 text-red-300 hover:bg-red-500 hover:text-white transition-all duration-300 flex items-center justify-center text-xs font-bold hover:scale-110 active:scale-95"
                    onClick={() => dispatch({ type: 'REMOVE_SELECTED_FILE', payload: i })}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message input footer */}
        <footer className="p-5 flex-shrink-0 bg-gradient-to-t from-slate-950 via-slate-900/80 to-transparent">
          <form onSubmit={handleSubmit}>
            <div className={`flex items-end rounded-app overflow-visible transition-all duration-300 relative z-0 ${
              inputFocused
                ? 'ring-2 ring-cyan-400/40 shadow-lg shadow-cyan-400/10 border-cyan-400/30'
                : 'border border-white/10 hover:border-white/20'
            } bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl`}>
              
              {/* Attachment button wrapper */}
              <div className="h-12 flex items-center justify-center pl-2 pb-1">
                <button
                  type="button"
                  onClick={handleAttachment}
                  className="p-2 text-slate-400 hover:text-cyan-400 transition-all duration-300 hover:scale-110 rounded-app hover:bg-cyan-400/10 active:scale-95 flex-shrink-0"
                  title="Attach files"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
              </div>

              {/* Emoji picker button wrapper */}
              <div className="h-12 flex items-center justify-center relative" ref={emojiPickerRef}>
                <button
                  type="button"
                  onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
                  className="p-2 text-slate-400 hover:text-cyan-400 transition-all duration-300 hover:scale-110 rounded-app hover:bg-cyan-400/10 active:scale-95 flex-shrink-0"
                  title="Add emoji"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" />
                    <line x1="15" y1="9" x2="15.01" y2="9" />
                  </svg>
                </button>

                {/* Emoji picker popup */}
                {emojiPickerOpen && (
                  <div className="absolute bottom-12 left-0 z-50">
                    <EmojiPicker
                      onEmojiClick={handleEmojiClick}
                      theme="dark"
                      height={400}
                      width={320}
                    />
                  </div>
                )}
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows="1"
                placeholder="Type a message... (Shift+Enter for new line)"
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); adjustTextarea(); }}
                onKeyDown={handleKeyDown}
                onFocus={handleInputFocus}
                onBlur={() => setInputFocused(false)}
                className="flex-1 bg-transparent focus:outline-none text-sm text-white py-3.5 px-3 resize-none overflow-y-auto min-h-[3rem] max-h-32 border-0 placeholder:text-slate-500/60"
              />

              {/* Send button wrapper */}
              <div className="h-12 flex items-center justify-center pr-2 pb-1">
                <button
                  type="submit"
                  disabled={!hasContent}
                  className={`p-2 transition-all duration-300 rounded-app hover:bg-cyan-400/10 active:scale-95 flex-shrink-0 ${
                    hasContent 
                      ? 'scale-100 opacity-100 cursor-pointer' 
                      : 'opacity-30 scale-90 cursor-not-allowed'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24">
                    <defs>
                      <linearGradient id="send-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#14b8a6" />
                      </linearGradient>
                    </defs>
                    <path fill="url(#send-icon-gradient)" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </form>
        </footer>
      </div>
    </main>
  );
}