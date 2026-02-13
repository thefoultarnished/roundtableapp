import React, { useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';

export default function Sidebar() {
  const { state, dispatch } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const onlineCount = state.allUsers.filter(u => u.status === 'online').length;

  const filteredUsers = searchQuery
    ? state.allUsers.filter(u =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.ip?.includes(searchQuery)
      )
    : state.displayedUsers;

  const handleUserClick = useCallback((userId) => {
    dispatch({ type: 'SET_ACTIVE_CHAT', payload: userId });
    dispatch({ type: 'CLEAR_UNREAD', payload: userId });
  }, [dispatch]);

  const handleRefresh = useCallback(() => {
    if (state.globalInvokeFunc) {
      state.globalInvokeFunc('broadcast_discovery_query');
    }
  }, [state.globalInvokeFunc]);

  const displayName = localStorage.getItem('displayName') || 'New User';
  const username = localStorage.getItem('username') || 'anonymous';
  const profilePicture = localStorage.getItem('profilePicture');

  return (
    <aside
      id="user-list-container"
      data-tauri-drag-region
      className="glass-panel my-2 ml-2 rounded-2xl flex flex-col flex-shrink-0 z-10 w-[320px] max-w-[500px]"
      style={{ height: 'calc(100vh - 16px)' }}
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
            id="refresh-users"
            onClick={handleRefresh}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-slate-400 hover:text-teal-400 hover:bg-teal-500/10 transition-all duration-300 hover:rotate-180"
            title="Refresh user list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* User list */}
      <div id="user-list" className="flex-grow overflow-y-auto px-2 py-1 space-y-4">
        {state.allUsers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-200/50 to-slate-300/30 dark:from-slate-700/30 dark:to-slate-800/20 flex items-center justify-center mb-4 backdrop-blur-sm animate-pulse">
              <svg className="w-8 h-8 text-slate-400/60" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">No users found</p>
            <p className="text-xs text-slate-400/60 mt-1">Waiting for peers on the network...</p>
          </div>
        )}

        {/* Online Section */}
        {(() => {
          const onlineUsers = state.allUsers
            .filter(u => u.status === 'online')
            .filter(u => !searchQuery || u.name.toLowerCase().includes(searchQuery.toLowerCase()))
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
                />
              ))}
            </div>
          );
        })()}

        {/* Offline Section */}
        {(() => {
          const offlineUsers = state.allUsers
            .filter(u => u.status !== 'online')
            .filter(u => !searchQuery || u.name.toLowerCase().includes(searchQuery.toLowerCase()))
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
                />
              ))}
            </div>
          );
        })()}
      </div>

      {/* Profile footer — Glass card */}
      <div className="p-3 mt-auto border-t border-white/10 dark:border-white/5">
        <div className="flex items-center gap-3 p-2 rounded-app bg-white/20 dark:bg-white/5 backdrop-blur-sm border border-white/15 dark:border-white/5 transition-all duration-300 hover:bg-white/30 dark:hover:bg-white/8 group">
          <div className="relative flex-shrink-0">
            {profilePicture ? (
              <img src={profilePicture} className="w-10 h-10 rounded-full object-cover shadow-lg ring-2 ring-white/20 group-hover:ring-teal-400/30 transition-all duration-300" alt="Profile" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white text-lg shadow-lg ring-2 ring-white/20 group-hover:ring-purple-400/40 transition-all duration-300 group-hover:scale-105">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Online indicator */}
            <span className="absolute -bottom-0.5 -right-0.5 block h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 status-online-glow" />
          </div>
          <div className="flex-grow overflow-hidden min-w-0">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium">Welcome,</p>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
              {displayName} <span className="text-slate-400 dark:text-slate-500 font-normal">@{username}</span>
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
      </div>
    </aside>
  );
}

function UserItem({ user, index, isActive, unreadCount, onClick }) {
  const avatarHtml = user.profile_picture
    ? <img src={user.profile_picture} className="w-10 h-10 rounded-full object-cover shadow-lg ring-2 ring-white/20" alt={user.name} />
    : (
      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${user.avatarGradient || 'from-teal-400 to-blue-500'} flex items-center justify-center font-bold text-white text-lg shadow-lg ring-2 ring-white/20`}>
        {user.name?.charAt(0) || '?'}
      </div>
    );

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
      {unreadCount > 0 && (
        <div className="unread-badge ml-auto px-2.5 py-0.5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[10px] font-bold rounded-full shadow-lg shadow-red-500/20 min-w-[1.5rem] flex items-center justify-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}
    </div>
  );
}
