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
      className="glass-panel-heavy m-2 mr-0 rounded-2xl flex flex-col flex-shrink-0 z-10 min-w-[250px] w-[320px] max-w-[500px]"
    >
      {/* Animated status bar */}
      <div id="sidebar-status" className="pt-3 pb-1 flex items-center justify-center gap-2 font-medium text-[11px]">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        <span className="text-emerald-600 dark:text-emerald-400 tracking-wide">
          Connected
        </span>
        <span className="text-slate-400 dark:text-slate-500">·</span>
        <span className="text-slate-500 dark:text-slate-400">
          {onlineCount} user{onlineCount !== 1 ? 's' : ''} online
        </span>
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
            className="w-full pl-10 pr-10 py-2 rounded-xl bg-white/30 dark:bg-white/5 border border-white/30 dark:border-white/10 focus:border-teal-500/50 outline-none transition-all duration-300 placeholder-slate-400/70 text-sm text-slate-800 dark:text-slate-200 backdrop-blur-sm"
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
      <div id="user-list" className="flex-grow overflow-y-auto px-2 py-1">
        {filteredUsers.length === 0 && (
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
        {filteredUsers.map((user, index) => (
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

      {/* Profile footer — Glass card */}
      <div className="p-3 mt-auto border-t border-white/10 dark:border-white/5">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-white/20 dark:bg-white/5 backdrop-blur-sm border border-white/15 dark:border-white/5 transition-all duration-300 hover:bg-white/30 dark:hover:bg-white/8 group">
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
            className="p-2 rounded-lg text-slate-400 hover:text-teal-400 hover:bg-teal-500/10 transition-all duration-300 hover:rotate-90"
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
      className={`user-item shimmer-hover flex items-center p-2.5 my-0.5 rounded-xl cursor-pointer transition-all duration-300 ${
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
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">{user.ip}</p>
      </div>
      {unreadCount > 0 && (
        <div className="unread-badge ml-auto px-2.5 py-0.5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[10px] font-bold rounded-full shadow-lg shadow-red-500/20 min-w-[1.5rem] flex items-center justify-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}
    </div>
  );
}
