import React, { useState, useEffect, useCallback } from 'react';

export default function NotificationContainer() {
  const [notifications, setNotifications] = useState([]);

  // Expose a global function for adding notifications
  useEffect(() => {
    window.__showNotification = (message, isError = false) => {
      const id = Date.now() + Math.random();
      setNotifications(prev => [...prev, { id, message, isError }]);
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 4000);
    };

    window.__showBeautifulNotification = (senderName, messageContent) => {
      const id = Date.now() + Math.random();
      setNotifications(prev => [...prev, { id, senderName, messageContent, isRich: true }]);
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 5000);
    };

    return () => {
      delete window.__showNotification;
      delete window.__showBeautifulNotification;
    };
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return (
    <div className="fixed top-12 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {notifications.map(n => (
        n.isRich ? (
          <RichNotification key={n.id} notification={n} onRemove={() => removeNotification(n.id)} />
        ) : (
          <SimpleNotification key={n.id} notification={n} onRemove={() => removeNotification(n.id)} />
        )
      ))}
    </div>
  );
}

function SimpleNotification({ notification, onRemove }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(timer);
  }, []);

  let content;
  if (notification.message.includes(' - ')) {
    const [username, messageContent] = notification.message.split(' - ', 2);
    content = (
      <>
        <span className="text-green-300 font-semibold">{username}</span> - <span className="text-white">{messageContent}</span>
      </>
    );
  } else {
    content = notification.message;
  }

  return (
    <div
      className={`pointer-events-auto bg-black/20 backdrop-blur-md border border-white/20 text-white px-4 py-2 rounded-lg shadow-lg transform transition-all duration-500 cursor-pointer hover:bg-black/30 ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
      onClick={onRemove}
    >
      {content}
    </div>
  );
}

function RichNotification({ notification, onRemove }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const truncated = notification.messageContent?.length > 60
    ? notification.messageContent.substring(0, 57) + '...'
    : notification.messageContent;

  return (
    <div className="pointer-events-auto glassmorphism-notification">
      <div className={`glassmorphism bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl border border-white/30 dark:border-slate-700/30 rounded-2xl p-4 shadow-2xl transform transition-all duration-500 hover:scale-105 min-w-[300px] max-w-[400px] ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold text-white text-sm shadow-lg">
              {notification.senderName?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 dark:text-white truncate">{notification.senderName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">New message</p>
            </div>
            <button onClick={onRemove} className="w-6 h-6 rounded-full bg-slate-200/50 dark:bg-slate-700/50 hover:bg-red-500/20 text-slate-600 dark:text-slate-300 hover:text-red-500 transition-all duration-300 flex items-center justify-center text-sm font-bold">
              ×
            </button>
          </div>
          <div className="bg-slate-100/50 dark:bg-slate-700/30 rounded-xl p-3 backdrop-blur-sm">
            <p className="text-slate-700 dark:text-slate-200 text-sm leading-relaxed break-words">
              {truncated}
            </p>
          </div>
        </div>
        <div className="absolute top-2 left-2 w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-lg" />
      </div>
    </div>
  );
}
