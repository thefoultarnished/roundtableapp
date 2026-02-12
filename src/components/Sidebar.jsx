import React, { useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import * as utils from '../utils';

export default function Sidebar() {
  const { state, dispatch } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');

  const onlineCount = state.allUsers.filter(u => u.status === 'online').length;

  const filteredUsers = searchQuery
    ? state.allUsers.filter(u =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.ip?.includes(searchQuery)
      )
    : state.displayedUsers;

  const handleUserClick = useCallback((userId) => {
    if (userId === state.activeChatUserId) {
      dispatch({ type: 'CLEAR_UNREAD', payload: userId });
      return;
    }
    dispatch({ type: 'SET_ACTIVE_CHAT', payload: userId });
    dispatch({ type: 'CLEAR_UNREAD', payload: userId });
  }, [state.activeChatUserId, dispatch]);

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
      className="bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-xl m-2 mr-0 rounded-xl shadow-2xl flex flex-col flex-shrink-0 z-10 min-w-[250px] w-[320px] max-w-[500px] border border-slate-200/50 dark:border-slate-800/50"
    >
      {/* Status bar */}
      <div id="sidebar-status" className="pt-2 flex items-center justify-center gap-2 text-green-400 font-medium text-xs">
        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        <span>Connected ({onlineCount} user{onlineCount !== 1 ? 's' : ''} online)</span>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-slate-200/50 dark:border-slate-700/50 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            id="user-search-input"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 outline-none transition-all duration-300 placeholder-slate-400 text-slate-900 dark:text-slate-100"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <button
              id="refresh-users"
              onClick={handleRefresh}
              className="p-1.5 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
              title="Refresh user list"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* User list */}
      <div id="user-list" className="flex-grow overflow-y-auto p-2">
        {filteredUsers.map(user => (
          <UserItem
            key={user.id}
            user={user}
            isActive={user.id === state.activeChatUserId}
            unreadCount={state.unreadCounts[user.id] || 0}
            onClick={() => handleUserClick(user.id)}
          />
        ))}
      </div>

      {/* Profile footer */}
      <div id="my-user-profile-footer" className="p-3 border-t border-slate-200/50 dark:border-slate-700/50 mt-auto">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            {profilePicture ? (
              <img src={profilePicture} className="w-10 h-10 rounded-full object-cover shadow-lg" alt="Profile" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white text-lg shadow-lg">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-grow overflow-hidden min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">Welcome,</p>
            <p id="footer-username" className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {displayName} (@{username})
            </p>
          </div>
          <button
            onClick={() => dispatch({ type: 'SET_SETTINGS_OPEN', payload: true })}
            title="Open Settings"
            className="text-slate-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors duration-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

function UserItem({ user, isActive, unreadCount, onClick }) {
  const statusClass = user.status === 'online' ? 'bg-green-500' : 'bg-slate-500';
  const glowClass = user.status === 'online' ? 'status-online-glow' : '';

  const avatarHtml = user.profile_picture
    ? <img src={user.profile_picture} className="w-10 h-10 rounded-full object-cover shadow-lg" alt={user.name} />
    : (
      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${user.avatarGradient || 'from-teal-400 to-blue-500'} flex items-center justify-center font-bold text-white text-lg shadow-lg`}>
        {user.name?.charAt(0) || '?'}
      </div>
    );

  return (
    <div
      className={`user-item flex items-center p-2 m-1 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-300 ${isActive ? 'bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 shadow-md border border-teal-500/20' : ''}`}
      data-user-id={user.id}
      onClick={onClick}
    >
      <div className="relative mr-3 flex-shrink-0">
        {avatarHtml}
        <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ${statusClass} border-2 border-slate-50 dark:border-slate-900 ${glowClass}`} />
      </div>
      <div className="flex-grow overflow-hidden min-w-0">
        <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{user.name}</p>
        <p className="text-sm text-slate-600 dark:text-slate-400 font-mono truncate">{user.ip}</p>
      </div>
      {unreadCount > 0 && (
        <div className="unread-badge ml-auto px-2 py-0.5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold rounded-full shadow-lg ring-2 ring-white dark:ring-slate-800 animate-pulse min-w-[1.5rem] flex items-center justify-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}
    </div>
  );
}
