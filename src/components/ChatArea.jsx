import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import MessageBubble from './MessageBubble';
import { useNetwork } from '../hooks/useNetwork';
import * as utils from '../utils';

export default function ChatArea() {
  const { state, dispatch } = useAppContext();
  const { sendMessage, initiateFileOffer } = useNetwork();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const [inputValue, setInputValue] = useState('');
  const [inputFocused, setInputFocused] = useState(false);

  const activeUser = state.allUsers.find(u => u.id === state.activeChatUserId);
  const userMessages = state.activeChatUserId ? (state.messages[state.activeChatUserId] || []) : [];
  const groupedMessages = utils.groupMessagesByDate(userMessages);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [userMessages.length]);

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
      const newMessage = {
        sender: 'me',
        text: inputValue.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        files: [],
      };
      dispatch({ type: 'ADD_MESSAGE', payload: { userId: state.activeChatUserId, message: newMessage } });
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

  // ===== Welcome Screen =====
  if (!state.activeChatUserId) {
    return (
      <main id="chat-container" className="flex-grow flex flex-col m-2 ml-0 animated-gradient-bg rounded-2xl shadow-2xl z-10 min-w-[400px] glass-panel overflow-hidden">
        <div id="welcome-screen" className="flex flex-col items-center justify-center h-full p-8 text-center relative">
          <div className="relative mb-8">
            {/* Animated icon */}
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-28 h-28 text-slate-300/40 dark:text-slate-600/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2" />
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {/* Glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-teal-400/20 to-cyan-400/20 blur-3xl rounded-full" />
              {/* Orbiting dot */}
              <div className="absolute w-3 h-3 rounded-full bg-teal-400 shadow-lg shadow-teal-400/50" style={{
                animation: 'orbit 6s linear infinite',
                top: '50%', left: '50%',
              }} />
            </div>
          </div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 dark:from-white dark:via-slate-200 dark:to-slate-400 bg-clip-text text-transparent mb-3">
            Welcome to Roundtable
          </h2>
          <p className="text-base text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            Select a user from the sidebar to start a conversation
          </p>
          <div className="mt-8 flex gap-3">
            <div className="px-4 py-2 rounded-xl bg-white/20 dark:bg-white/5 border border-white/20 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400 backdrop-blur-sm">
              🔒 End-to-end encrypted
            </div>
            <div className="px-4 py-2 rounded-xl bg-white/20 dark:bg-white/5 border border-white/20 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400 backdrop-blur-sm">
              📡 Peer-to-peer
            </div>
          </div>
        </div>
        <style>{`
          @keyframes orbit {
            from { transform: translate(-50%, -50%) rotate(0deg) translateX(60px) rotate(0deg); }
            to { transform: translate(-50%, -50%) rotate(360deg) translateX(60px) rotate(-360deg); }
          }
        `}</style>
      </main>
    );
  }

  // ===== Active Chat =====
  return (
    <main id="chat-container" className="flex-grow flex flex-col m-2 ml-0 animated-gradient-bg rounded-2xl shadow-2xl z-10 min-w-[400px] glass-panel overflow-hidden">
      <div id="chat-view" className="flex flex-col flex-grow h-full">
        {/* Chat header — Heavy glass */}
        <header className="p-4 flex items-center justify-between space-x-4 flex-shrink-0 glass-panel-heavy rounded-t-2xl border-b border-white/10 dark:border-white/5">
          <div className="flex items-center space-x-4 min-w-0">
            {activeUser?.profile_picture ? (
              <div className="w-11 h-11 rounded-full flex-shrink-0 shadow-lg ring-2 ring-white/20 overflow-hidden">
                <img src={activeUser.profile_picture} className="w-full h-full object-cover" alt={activeUser.name} />
              </div>
            ) : (
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-white text-xl flex-shrink-0 bg-gradient-to-br ${activeUser?.avatarGradient || 'from-teal-400 to-blue-500'} shadow-lg ring-2 ring-white/20`}>
                {activeUser?.name?.charAt(0) || '?'}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-2">
                {activeUser?.name}
                {activeUser?.username && (
                  <span className="text-xs font-normal text-slate-400 dark:text-slate-500">@{activeUser.username}</span>
                )}
              </h2>
              <div className="flex items-center gap-2 text-xs">
                <span className={`flex items-center gap-1 ${activeUser?.status === 'online' ? 'text-emerald-500' : 'text-slate-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${activeUser?.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {activeUser?.status}
                </span>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="text-slate-400 dark:text-slate-500 font-mono">{activeUser?.ip}</span>
              </div>
            </div>
          </div>
          <button onClick={handleCloseChat} title="Close Chat" className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Messages */}
        <div id="messages-container" ref={messagesContainerRef} className="flex-grow p-4 overflow-y-auto space-y-2">
          {groupedMessages.map((group, gi) => (
            <React.Fragment key={gi}>
              {/* Date separator */}
              <div className="flex justify-center my-5">
                <div className="px-4 py-1 rounded-full text-[10px] font-medium tracking-wider uppercase bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10 text-slate-500 dark:text-slate-400 backdrop-blur-md shadow-sm">
                  {group.dateLabel}
                </div>
              </div>
              {group.messages.map((msg, mi) => (
                <MessageBubble key={`${gi}-${mi}`} message={msg} />
              ))}
            </React.Fragment>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* File preview */}
        {state.selectedFiles.length > 0 && (
          <div className="px-4 pb-2">
            <div className="p-2.5 bg-white/20 dark:bg-white/5 rounded-xl flex flex-wrap gap-2 max-h-28 overflow-y-auto backdrop-blur-md border border-white/20 dark:border-white/10">
              {state.selectedFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-2.5 glass-panel p-2.5 rounded-lg text-sm hover:scale-[1.02] transition-all duration-300 group">
                  <span className="text-xl animate-float group-hover:scale-110 transition-transform">{utils.getFileIcon(file.type)}</span>
                  <span className="text-slate-700 dark:text-slate-200 font-medium text-xs flex-1">{file.name.length > 20 ? `${file.name.substring(0, 18)}...` : file.name}</span>
                  <span className="text-[10px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)}MB</span>
                  <button className="w-5 h-5 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all duration-300 flex items-center justify-center text-xs font-bold"
                    onClick={() => dispatch({ type: 'REMOVE_SELECTED_FILE', payload: i })}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message input — Glass bar */}
        <footer className="p-4 flex-shrink-0">
          <form id="message-form" onSubmit={handleSubmit}>
            <div className={`relative glass-panel rounded-2xl overflow-hidden transition-all duration-400 ${inputFocused ? 'ring-2 ring-teal-500/30 shadow-lg shadow-teal-500/10 border-teal-500/30' : ''}`}>
              {/* Attachment button */}
              <button
                type="button"
                onClick={handleAttachment}
                className="absolute left-3 bottom-3 p-1.5 text-slate-400 hover:text-teal-400 transition-all duration-300 hover:scale-110 z-10 rounded-lg hover:bg-teal-500/10"
                title="Attach files"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>

              <textarea
                ref={textareaRef}
                id="message-input"
                rows="1"
                placeholder="Type a message..."
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); adjustTextarea(); }}
                onKeyDown={handleKeyDown}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                className="w-full bg-transparent focus:outline-none text-sm text-white py-3 pl-12 pr-12 resize-none overflow-y-hidden min-h-[3rem] max-h-32 border-0 placeholder:text-slate-400/50"
              />

              {/* Send button */}
              <button
                type="submit"
                disabled={!hasContent}
                className={`absolute right-3 bottom-3 p-1.5 transition-all duration-300 z-10 rounded-lg hover:bg-white/10 ${hasContent ? 'enabled-glow scale-100' : 'opacity-40 scale-90'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24">
                  <defs>
                    <linearGradient id="send-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" className="grad-start" />
                      <stop offset="100%" className="grad-end" />
                    </linearGradient>
                  </defs>
                  <path fill="url(#send-icon-gradient)" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </form>
        </footer>
      </div>
    </main>
  );
}
