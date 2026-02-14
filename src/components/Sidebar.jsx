import React, { useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';

export default function Sidebar() {
  const { state, dispatch, online } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showRequests, setShowRequests] = useState(false);

  const friends = state.friends;
  const pendingRequests = state.pendingFriendRequests;
  const sentRequests = state.sentFriendRequests;

  const onlineCount = state.allUsers.filter(u => u.status === 'online').length;

  const addFriend = (username) => {
    if (online?.sendFriendRequest) {
      online.sendFriendRequest(username);
    }
  };

  const handleAcceptFriendRequest = (senderId) => {
    if (online?.acceptFriendRequest) {
      online.acceptFriendRequest(senderId);
    }
  };

  const handleDeclineFriendRequest = (senderId) => {
    if (online?.declineFriendRequest) {
      online.declineFriendRequest(senderId);
    }
  };

  const searchResults = searchQuery
    ? state.allUsers.filter(u => {
        const isSelf = String(u.id).toLowerCase() === String(state.currentUser?.username).toLowerCase() ||
                       String(u.username).toLowerCase() === String(state.currentUser?.username).toLowerCase();
        return !isSelf && (u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          u.name?.toLowerCase().includes(searchQuery.toLowerCase()));
      })
    : [];

  const friendMatches = searchResults.filter(u => friends.includes(u.id) || friends.includes(u.username));
  const userMatches = searchResults.filter(u => !friends.includes(u.id) && !friends.includes(u.username));

  const filteredUsers = !searchQuery ? state.displayedUsers : [];

  const handleUserClick = useCallback((userId) => {
    console.log(`👤 User clicked: ${userId}`);
    dispatch({ type: 'SET_ACTIVE_CHAT', payload: userId });
    dispatch({ type: 'CLEAR_UNREAD', payload: userId });

    // Request chat history from server
    if (online?.requestChatHistory) {
      console.log(`📜 Requesting history for ${userId}`);
      online.requestChatHistory(userId);
    } else {
      console.warn('⚠️ requestChatHistory not available');
    }

    // Send read receipts for messages in this chat
    if (online?.sendReadReceipts) {
      console.log(`👁️ Sending read receipts for ${userId}`);
      online.sendReadReceipts(userId);
    }
  }, [dispatch, online]);


  const displayName = localStorage.getItem('displayName') || 'New User';
  const username = localStorage.getItem('username') || 'anonymous';
  const currentUsername = state.currentUser?.username || localStorage.getItem('username');

  // Get profile picture mapped to current username
  const allProfilePics = JSON.parse(localStorage.getItem('profilePictures') || '{}');
  const profilePicture = allProfilePics[currentUsername];

  return (
    <>
    <aside
      id="user-list-container"
      data-tauri-drag-region
      className="glass-panel rounded-2xl flex flex-col flex-shrink-0 z-10 w-[320px] max-w-[500px]"
      style={{ height: 'calc(100vh - calc(var(--layout-spacing) * 2))', marginLeft: 'var(--layout-spacing)', marginTop: 'var(--layout-spacing)', marginBottom: 'var(--layout-spacing)' }}
    >
      {/* Logo & Status Header */}
      <div className="pt-2 pb-2 px-4 flex items-center justify-between" data-tauri-drag-region>
        {/* Left: Window Controls + Toggle */}
        <div className="flex items-center gap-3">
          {/* Window Controls */}
          <div className="flex gap-2 group/controls" data-tauri-drag-region>
            <button className="w-3.5 h-3.5 rounded-full bg-[#FF5F57] hover:bg-[#FF5F57] border border-black/10 flex items-center justify-center transition-all shadow-sm active:scale-95" onClick={() => window.__TAURI__?.window?.getCurrentWindow().close()}>
              <svg className="w-2 h-2 text-black/60 opacity-0 group-hover/controls:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <button className="w-3.5 h-3.5 rounded-full bg-[#FEBC2E] hover:bg-[#FEBC2E] border border-black/10 flex items-center justify-center transition-all shadow-sm active:scale-95" onClick={() => window.__TAURI__?.window?.getCurrentWindow().minimize()}>
              <svg className="w-2 h-2 text-black/60 opacity-0 group-hover/controls:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <button className="w-3.5 h-3.5 rounded-full bg-[#28C840] hover:bg-[#28C840] border border-black/10 flex items-center justify-center transition-all shadow-sm active:scale-95" onClick={async () => {
                 if (window.__TAURI__?.window) {
                   const win = window.__TAURI__.window.getCurrentWindow();
                   const max = await win.isMaximized();
                   max ? win.unmaximize() : win.maximize();
                 }
            }}>
              <svg className="w-1.5 h-1.5 text-black/60 opacity-0 group-hover/controls:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>
          </div>

          {/* Theme Toggle */}
          <label className="hidden relative inline-flex items-center cursor-pointer group modern-toggle scale-75 ml-1" title="Toggle Theme">
            <input
              type="checkbox"
              className="sr-only peer"
              onChange={(e) => {
                if (e.target.checked) {
                  document.documentElement.classList.add('dark');
                  localStorage.setItem('theme', 'dark');
                } else {
                  document.documentElement.classList.remove('dark');
                  localStorage.setItem('theme', 'light');
                }
              }}
              defaultChecked={document.documentElement.classList.contains('dark')}
            />
            <div className="toggle-track w-[32px] h-[16px] bg-gradient-to-br from-amber-100 to-orange-200 dark:from-indigo-800 dark:to-slate-900 rounded-full peer-focus:outline-none transition-all duration-500 ease-out shadow-inner border border-white/30 dark:border-white/10">
              <div className="toggle-thumb absolute top-[1.5px] left-[1.5px] bg-gradient-to-br from-amber-400 to-orange-400 dark:from-indigo-400 dark:to-blue-500 rounded-full h-[13px] w-[13px] flex items-center justify-center transition-all duration-500 ease-out shadow-lg peer-checked:translate-x-[16px]">
                <svg className="sun-icon h-[7px] w-[7px] text-white transition-all duration-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
                <svg className="moon-icon absolute h-[7px] w-[7px] text-white transition-all duration-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              </div>
            </div>
          </label>
        </div>

        {/* Right: Logo */}
        <div className="flex flex-col items-end" data-tauri-drag-region>
          <h1 className="non-scalable text-lg font-bold bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent tracking-tight">
            Roundtable
          </h1>
          <div className="hidden flex items-center gap-2 text-[10px] font-medium text-slate-500 dark:text-slate-400">
             <span>Connected</span>
          </div>
        </div>
      </div>

      {/* Search — Glass input */}
      <div className="px-3 py-2 flex-shrink-0">
        <div className={`relative rounded-xl transition-all duration-400 ${searchFocused ? 'ring-2 ring-teal-500/30 shadow-lg shadow-teal-500/10' : ''}`}>
          <svg className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none transition-colors duration-300 ${searchFocused ? 'text-teal-400' : 'text-slate-400'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            id="user-search-input"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="w-full pl-10 pr-10 py-2 rounded-app bg-white/30 dark:bg-white/5 border border-white/30 dark:border-white/10 focus:border-teal-500/50 outline-none transition-all duration-300 placeholder-slate-400/70 text-sm text-slate-800 dark:text-slate-200 backdrop-blur-sm"
          />
          <button
            onClick={() => setShowRequests(!showRequests)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all duration-300"
            title="Friend requests"
          >
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {pendingRequests.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* User list */}
      <div id="user-list" className="flex-grow overflow-y-auto px-2 py-1 space-y-4">
        {!state.currentUser ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-200/50 to-slate-300/30 dark:from-slate-700/30 dark:to-slate-800/20 flex items-center justify-center mb-4 backdrop-blur-sm">
              <svg className="w-8 h-8 text-slate-400/60" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">Log in to see users</p>
            <p className="text-xs text-slate-400/60 mt-1">Sign up or log in to get started</p>
          </div>
        ) : state.allUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-200/50 to-slate-300/30 dark:from-slate-700/30 dark:to-slate-800/20 flex items-center justify-center mb-4 backdrop-blur-sm animate-pulse">
              <svg className="w-8 h-8 text-slate-400/60" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">No users found</p>
            <p className="text-xs text-slate-400/60 mt-1">Waiting for peers on the network...</p>
          </div>
        ) : null}

        {/* Show users only if logged in */}
        {state.currentUser && (
        <>
        {/* Search Results */}
        {searchQuery && (
          <>
            {/* Friends Matches */}
            {friendMatches.length > 0 && (
              <div className="space-y-1">
                <div className="px-3 py-1 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(217,119,6,0.5)]"></span>
                  <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Friends</h3>
                  <span className="ml-auto text-[10px] font-medium text-slate-400/50 bg-slate-400/10 px-1.5 py-0.5 rounded-md">{friendMatches.length}</span>
                </div>
                {friendMatches.map((user, index) => (
                  <UserItem key={user.id} user={user} index={index} isActive={user.id === state.activeChatUserId} unreadCount={state.unreadCounts[user.id] || 0} onClick={() => handleUserClick(user.id)} isFriend={true} />
                ))}
              </div>
            )}

            {/* Users Matches */}
            {userMatches.length > 0 && (
              <div className="space-y-1">
                <div className="px-3 py-1 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]"></span>
                  <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Users</h3>
                  <span className="ml-auto text-[10px] font-medium text-slate-400/50 bg-slate-400/10 px-1.5 py-0.5 rounded-md">{userMatches.length}</span>
                </div>
                {userMatches.map((user, index) => (
                  <UserItemWithAddFriend key={user.id} user={user} index={index} currentUsername={currentUsername} onAddFriend={() => addFriend(user.username || user.id)} isPending={sentRequests.includes(user.id) || sentRequests.includes(user.username)} />
                ))}
              </div>
            )}

            {searchResults.length === 0 && (
              <div className="text-center py-6">
                <p className="text-xs text-slate-400">No users found</p>
              </div>
            )}
          </>
        )}

        {/* Online Section */}
        {!searchQuery && (() => {
          const onlineUsers = state.allUsers
            .filter(u => {
              // Only show friends
              const isFriend = friends.includes(u.id) || friends.includes(u.username);
              // Exclude current user by checking multiple fields
              const isSelf = String(u.id).toLowerCase() === String(currentUsername).toLowerCase() ||
                             String(u.username).toLowerCase() === String(currentUsername).toLowerCase() ||
                             String(u.info?.username).toLowerCase() === String(currentUsername).toLowerCase();
              return isFriend && u.status === 'online' && !isSelf;
            })
            .filter(u => !searchQuery || u.name?.toLowerCase().includes(searchQuery.toLowerCase()))
            .sort((a, b) => {
              const lastA = state.messages[a.id]?.at(-1)?.timestamp || 0;
              const lastB = state.messages[b.id]?.at(-1)?.timestamp || 0;
              return lastB - lastA;
            });

          if (onlineUsers.length === 0) return null;

          return (
            <div className="space-y-1">
              <div className="px-3 py-1 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Online</h3>
                <span className="ml-auto text-[10px] font-medium text-slate-400/50 bg-slate-400/10 px-1.5 py-0.5 rounded-md">{onlineUsers.length}</span>
              </div>
              {onlineUsers.map((user, index) => (
                <UserItem
                  key={user.id}
                  user={user}
                  index={index}
                  isActive={user.id === state.activeChatUserId}
                  unreadCount={state.unreadCounts[user.id] || 0}
                  onClick={() => handleUserClick(user.id)}
                  isFriend={friends.includes(user.id) || friends.includes(user.username)}
                  isPending={sentRequests.includes(user.id) || sentRequests.includes(user.username)}
                  onAddFriend={() => addFriend(user.username || user.id)}
                />
              ))}
            </div>
          );
        })()}

        {/* Offline Section */}
        {!searchQuery && (() => {
          const offlineUsers = state.allUsers
            .filter(u => {
              // Only show friends
              const isFriend = friends.includes(u.id) || friends.includes(u.username);
              // Exclude current user by checking multiple fields
              const isSelf = String(u.id).toLowerCase() === String(currentUsername).toLowerCase() ||
                             String(u.username).toLowerCase() === String(currentUsername).toLowerCase() ||
                             String(u.info?.username).toLowerCase() === String(currentUsername).toLowerCase();
              return isFriend && u.status !== 'online' && !isSelf;
            })
            .filter(u => !searchQuery || u.name?.toLowerCase().includes(searchQuery.toLowerCase()))
            .sort((a, b) => {
              const lastA = state.messages[a.id]?.at(-1)?.timestamp || 0;
              const lastB = state.messages[b.id]?.at(-1)?.timestamp || 0;
              return lastB - lastA;
            });

          if (offlineUsers.length === 0) return null;

          return (
            <div className="space-y-1">
              <div className="px-3 py-1 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-600"></span>
                <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Offline</h3>
                <span className="ml-auto text-[10px] font-medium text-slate-400/50 bg-slate-400/10 px-1.5 py-0.5 rounded-md">{offlineUsers.length}</span>
              </div>
              {offlineUsers.map((user, index) => (
                <UserItem
                  key={user.id}
                  user={user}
                  index={index}
                  isActive={user.id === state.activeChatUserId}
                  unreadCount={state.unreadCounts[user.id] || 0}
                  onClick={() => handleUserClick(user.id)}
                  isFriend={friends.includes(user.id) || friends.includes(user.username)}
                  isPending={sentRequests.includes(user.id) || sentRequests.includes(user.username)}
                  onAddFriend={() => addFriend(user.username || user.id)}
                />
              ))}
            </div>
          );
        })()}
        </>
        )}
      </div>

      {/* Profile footer — Glass card */}
      <div className="p-3 mt-auto border-t border-white/10 dark:border-white/5">
        {state.currentUser ? (
          <div className="flex items-center gap-3 p-2 rounded-app bg-white/20 dark:bg-white/5 backdrop-blur-sm border border-white/15 dark:border-white/5 transition-all duration-300 hover:bg-white/30 dark:hover:bg-white/8 group">
            <div className="relative flex-shrink-0">
              {profilePicture ? (
                <img src={profilePicture} className="w-10 h-10 rounded-full object-cover shadow-lg ring-2 ring-white/20 group-hover:ring-teal-400/30 transition-all duration-300" alt="Profile" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white text-lg shadow-lg ring-2 ring-white/20 group-hover:ring-purple-400/40 transition-all duration-300 group-hover:scale-105">
                  {state.currentUser.displayName?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
              {/* Online indicator */}
              <span
                className={`absolute -bottom-0.5 -right-0.5 block h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 transition-all duration-300 ${online.isOnline ? 'bg-emerald-500 status-online-glow' : 'bg-red-500'}`}
                title={online.isOnline ? 'Connected to Relay' : 'Disconnected'}
              />
            </div>
            <div className="flex-grow overflow-hidden min-w-0">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium">Welcome,</p>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                {state.currentUser.displayName} <span className="text-slate-400 dark:text-slate-500 font-normal">@{state.currentUser.username}</span>
              </p>
            </div>
            <button
              onClick={() => dispatch({ type: 'SET_SETTINGS_OPEN', payload: true })}
              title="Open Settings"
              className="p-2 rounded-app text-slate-400 hover:text-teal-400 hover:bg-teal-500/10 transition-all duration-300 hover:rotate-90"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-app bg-white/10 dark:bg-white/5 backdrop-blur-sm border border-white/15 dark:border-white/5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-slate-400 dark:text-slate-500">Log in to get started</p>
          </div>
        )}
      </div>
    </aside>

    {/* Friend Requests Modal - Outside sidebar */}
    {showRequests && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop" onClick={() => setShowRequests(false)}>
        <div className="glass-panel-heavy rounded-3xl w-full max-w-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="py-4 px-5 border-b border-white/20 flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-sm">🔔</span>
              Friend Requests
            </h2>
            <button onClick={() => setShowRequests(false)} className="text-slate-400 hover:text-slate-200 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 flex-grow overflow-y-auto space-y-3 max-h-96">
            {pendingRequests.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-slate-400">No pending requests</p>
              </div>
            ) : (
              pendingRequests.map((request) => {
                const senderId = request.sender_id;
                const user = state.allUsers.find(u => u.id === senderId || u.username === senderId);
                return (
                  <div key={senderId} className="flex items-center gap-3 p-3 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition-all">
                    <div className="flex-shrink-0">
                      {user?.profile_picture ? (
                        <img src={user.profile_picture} className="w-10 h-10 rounded-full object-cover" alt={user?.name} />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-600 dark:bg-slate-700"></div>
                      )}
                    </div>
                    <div className="flex-grow min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{user?.name || senderId}</p>
                      <p className="text-xs text-slate-500">@{user?.username || senderId}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleAcceptFriendRequest(senderId)}
                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-semibold hover:shadow-lg hover:shadow-emerald-500/30 transition-all active:scale-95"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleDeclineFriendRequest(senderId)}
                        className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-slate-300 text-xs font-semibold hover:bg-white/20 transition-all active:scale-95"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function UserItemWithAddFriend({ user, index, onAddFriend, currentUsername, isPending }) {
  const avatarHtml = user.profile_picture
    ? <img src={user.profile_picture} className="w-10 h-10 rounded-full object-cover shadow-lg ring-2 ring-white/20" alt={user.name} />
    : (
      <div className="w-10 h-10 rounded-full bg-slate-600 dark:bg-slate-700 flex items-center justify-center shadow-lg ring-2 ring-white/20">
      </div>
    );

  return (
    <div className="flex items-center p-2.5 rounded-app hover:bg-white/20 dark:hover:bg-white/5 transition-all duration-300 group border border-white/10 hover:border-cyan-400/30">
      <div className="relative mr-3 flex-shrink-0">
        {avatarHtml}
        <span className={`absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 transition-all duration-500 ${
          user.status === 'online'
            ? 'bg-emerald-500 status-online-glow'
            : 'bg-slate-400 dark:bg-slate-600'
        }`} />
      </div>
      <div className="flex-grow overflow-hidden min-w-0">
        <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{user.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">@{user.username || 'unknown'}</p>
      </div>
      {isPending ? (
        <span className="ml-2 px-2 py-1 rounded-lg text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 flex-shrink-0">
          Pending
        </span>
      ) : (
        <button
          onClick={onAddFriend}
          title="Send friend request"
          className="ml-2 p-2 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all duration-300 hover:scale-110 active:scale-95 flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  );
}

function UserItem({ user, index, isActive, unreadCount, onClick, isFriend, isPending, onAddFriend }) {
  const avatarHtml = user.profile_picture
    ? <img src={user.profile_picture} className="w-10 h-10 rounded-full object-cover shadow-lg ring-2 ring-white/20" alt={user.name} />
    : (
      <div className="w-10 h-10 rounded-full bg-slate-600 dark:bg-slate-700 flex items-center justify-center shadow-lg ring-2 ring-white/20">
      </div>
    );

  const handleSendRequest = (e) => {
    e.stopPropagation();
    if (onAddFriend) {
      onAddFriend();
    }
  };

  return (
    <div
      className={`user-item shimmer-hover flex items-center p-2.5 my-0.5 rounded-app cursor-pointer transition-all duration-300 ${
        isActive
          ? 'bg-gradient-to-r from-teal-500/15 to-cyan-500/10 dark:from-teal-500/10 dark:to-cyan-500/5 shadow-lg shadow-teal-500/5 border-teal-500/30 backdrop-blur-sm'
          : 'hover:bg-white/20 dark:hover:bg-white/5'
      }`}
      style={{ animationDelay: `${index * 50}ms` }}
      data-user-id={user.id}
      onClick={onClick}
    >
      <div className="relative mr-3 flex-shrink-0">
        {avatarHtml}
        <span className={`absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 transition-all duration-500 ${
          user.status === 'online'
            ? 'bg-emerald-500 status-online-glow'
            : 'bg-slate-400 dark:bg-slate-600'
        }`} />
      </div>
      <div className="flex-grow overflow-hidden min-w-0">
        <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{user.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">@{user.username || 'unknown'}</p>
      </div>
      {!isFriend && isPending && (
        <span className="ml-2 px-2 py-1 rounded-lg text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 flex-shrink-0">
          Pending
        </span>
      )}
      {!isFriend && !isPending && onAddFriend && (
        <button
          onClick={handleSendRequest}
          title="Send friend request"
          className="ml-2 p-2 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all duration-300 hover:scale-110 active:scale-95 flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
      {unreadCount > 0 && (
        <div className="unread-badge ml-auto px-2.5 py-0.5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[10px] font-bold rounded-full shadow-lg shadow-red-500/20 min-w-[1.5rem] flex items-center justify-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}
    </div>
  );
}
