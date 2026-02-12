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
    const maxHeight = 128;
    const minHeight = 48;
    const required = Math.max(textarea.scrollHeight, minHeight);
    if (required > maxHeight) {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.height = `${required}px`;
      textarea.style.overflowY = 'hidden';
    }
  }, []);

  const hasContent = inputValue.trim().length > 0 || state.selectedFiles.length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!activeUser) return;

    let messageSent = false;

    // Handle file offers
    if (state.selectedFiles.length > 0) {
      messageSent = true;
      state.selectedFiles.forEach(file => {
        initiateFileOffer(file, activeUser);
      });
    }

    // Handle text messages
    if (inputValue.trim()) {
      messageSent = true;
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

    if (messageSent) {
      setInputValue('');
      dispatch({ type: 'CLEAR_SELECTED_FILES' });
      if (textareaRef.current) {
        textareaRef.current.style.height = '48px';
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (hasContent) {
        handleSubmit(e);
      }
    }
  };

  const handleAttachment = async () => {
    if (!window.__TAURI__?.dialog || !window.__TAURI__?.fs || !window.__TAURI__?.path) {
      alert('File APIs are not available in this environment.');
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
          } catch (err) {
            console.error(`Could not get metadata for: ${path}`, err);
          }
        }
        dispatch({ type: 'ADD_SELECTED_FILES', payload: filesToAdd });
      }
    } catch (err) {
      console.error('Error opening file dialog:', err);
    }
  };

  const handleCloseChat = () => {
    dispatch({ type: 'SET_ACTIVE_CHAT', payload: null });
  };

  // Welcome screen
  if (!state.activeChatUserId) {
    return (
      <main id="chat-container" className="flex-grow flex flex-col m-2 ml-0 animated-gradient-bg rounded-xl shadow-2xl z-10 min-w-[400px] border border-slate-200/50 dark:border-slate-800/50">
        <div id="welcome-screen" className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400/80 p-8 text-center">
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-32 h-32 mb-6 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2" />
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <div className="absolute inset-0 w-32 h-32 bg-gradient-to-r from-teal-400/20 to-blue-500/20 blur-3xl" />
          </div>
          <h2 className="text-3xl font-medium bg-gradient-to-r from-slate-800 to-slate-950 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent mb-2">
            Welcome to Roundtable
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Select a user from the list to begin a conversation
          </p>
        </div>
      </main>
    );
  }

  // Active chat
  return (
    <main id="chat-container" className="flex-grow flex flex-col m-2 ml-0 animated-gradient-bg rounded-xl shadow-2xl z-10 min-w-[400px] border border-slate-200/50 dark:border-slate-800/50">
      <div id="chat-view" className="flex flex-col flex-grow h-full">
        {/* Chat header */}
        <header className="p-4 flex items-center justify-between space-x-4 flex-shrink-0 glassmorphism rounded-t-xl border-b border-slate-200/20 dark:border-slate-700/30">
          <div className="flex items-center space-x-4 min-w-0">
            {activeUser?.profile_picture ? (
              <div className="w-12 h-12 rounded-full flex-shrink-0 shadow-lg">
                <img src={activeUser.profile_picture} className="w-full h-full rounded-full object-cover" alt={activeUser.name} />
              </div>
            ) : (
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-xl flex-shrink-0 bg-gradient-to-br ${activeUser?.avatarGradient || 'from-teal-400 to-blue-500'} shadow-lg`}>
                {activeUser?.name?.charAt(0) || '?'}
              </div>
            )}
            <div className="min-w-0">
              <h2 id="chat-header-name" className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                {activeUser?.name}
                {activeUser?.username && (
                  <span className="text-base font-normal text-slate-600 dark:text-slate-400 ml-2">(@{activeUser.username})</span>
                )}
              </h2>
              <p id="chat-header-status" className="text-sm font-mono opacity-80 truncate">
                <span className={activeUser?.status === 'online' ? 'text-green-500 dark:text-green-400' : 'text-slate-600 dark:text-slate-400'}>
                  ● {activeUser?.status}
                </span>
                {' '}&middot;{' '}{activeUser?.ip}
              </p>
            </div>
          </div>
          <button onClick={handleCloseChat} title="Close Chat" className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Messages */}
        <div id="messages-container" ref={messagesContainerRef} className="flex-grow p-4 overflow-y-auto space-y-3">
          {groupedMessages.map((group, gi) => (
            <React.Fragment key={gi}>
              <div className="flex justify-center my-4">
                <div className="bg-slate-100 dark:bg-slate-800 rounded-full px-4 py-1 text-xs text-slate-700 dark:text-slate-300 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
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

        {/* AI suggestions placeholder */}
        <div id="ai-suggestions-container" className="px-6 pb-2 flex items-center gap-2 flex-wrap" />

        {/* File preview */}
        {state.selectedFiles.length > 0 && (
          <div className="px-4 pb-2">
            <div className="p-2 bg-slate-200/50 dark:bg-slate-900/50 rounded-xl flex flex-wrap gap-2 max-h-28 overflow-y-auto backdrop-blur-sm">
              {state.selectedFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-3 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800/50 dark:to-slate-700/50 p-3 rounded-lg text-sm shadow-sm hover:shadow-md transition-all duration-300 transform hover:scale-[1.02] group">
                  <span className="text-xl animate-float group-hover:scale-110 transition-transform duration-300">{utils.getFileIcon(file.type)}</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium flex-1">
                    {file.name.length > 20 ? `${file.name.substring(0, 18)}...` : file.name}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{(file.size / 1024 / 1024).toFixed(2)}MB</span>
                  <button
                    className="ml-2 w-6 h-6 rounded-full bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 flex items-center justify-center"
                    onClick={() => dispatch({ type: 'REMOVE_SELECTED_FILE', payload: i })}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message input */}
        <footer className="p-4 flex-shrink-0">
          <form id="message-form" className="relative" onSubmit={handleSubmit}>
            <div className="relative glassmorphism rounded-2xl shadow-lg overflow-hidden">
              <button
                type="button"
                onClick={handleAttachment}
                className="absolute left-3 bottom-3 p-1.5 text-slate-500 dark:text-slate-400 hover:text-teal-500 dark:hover:text-teal-400 transition-all duration-300 transform hover:scale-110 flex-shrink-0 rounded-lg hover:bg-slate-200/30 dark:hover:bg-slate-700/30 z-10"
                title="Attach files"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                style={{ color: 'white' }}
                className="w-full bg-transparent focus:outline-none text-base py-3 pl-12 pr-12 resize-none overflow-y-hidden min-h-[3rem] max-h-32 border-0"
              />
              <button
                type="submit"
                id="send-btn"
                disabled={!hasContent}
                className={`absolute right-3 bottom-3 p-1.5 transition-all duration-300 transform flex-shrink-0 rounded-lg hover:bg-slate-200/20 dark:hover:bg-slate-700/20 z-10 ${hasContent ? 'enabled-glow' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 send-icon" viewBox="0 0 24 24">
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
