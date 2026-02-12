import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

export default function Titlebar() {
  const { state, dispatch } = useAppContext();
  const [hovered, setHovered] = useState(null);

  const handleMinimize = async () => {
    if (window.__TAURI__?.window) {
      const appWindow = window.__TAURI__.window.getCurrentWindow();
      await appWindow.minimize();
    }
  };

  const handleMaximize = async () => {
    if (window.__TAURI__?.window) {
      const appWindow = window.__TAURI__.window.getCurrentWindow();
      const isMax = await appWindow.isMaximized();
      isMax ? await appWindow.unmaximize() : await appWindow.maximize();
    }
  };

  const handleClose = async () => {
    if (window.__TAURI__?.window) {
      const appWindow = window.__TAURI__.window.getCurrentWindow();
      await appWindow.close();
    }
  };

  const handleThemeToggle = (e) => {
    if (e.target.checked) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  return (
    <div data-tauri-drag-region className="titlebar">
      {/* Left side empty or could have context info */}
      <div className="flex-1 flex items-center">
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {/* Theme toggle */}
        <label className="relative inline-flex items-center cursor-pointer group modern-toggle" title="Toggle Theme">
          <input
            type="checkbox"
            id="theme-toggle"
            className="sr-only peer"
            defaultChecked={isDark}
            onChange={handleThemeToggle}
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

        {/* Window controls */}
        <div className="window-controls">
          <button className="window-btn minimize" onClick={handleMinimize} />
          <button className="window-btn maximize" onClick={handleMaximize} />
          <button className="window-btn close" onClick={handleClose} />
        </div>
      </div>
    </div>
  );
}
