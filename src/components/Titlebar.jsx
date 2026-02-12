import React from 'react';
import { useAppContext } from '../context/AppContext';

export default function Titlebar() {
  const { state, dispatch } = useAppContext();

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
      if (isMax) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
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
      <div className="flex items-center gap-4">
        <div className="relative pr-2">
          <h1 className="non-scalable text-lg font-bold bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
            Roundtable
          </h1>
        </div>
      </div>

      {/* Search */}
      <div id="titlebar-search-container" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative">
          <input
            type="text"
            placeholder="search conversations.."
            className="w-50 h-5 text-sm bg-black/10 dark:bg-white/5 border border-white/10 rounded-md pl-7 pr-2 text-slate-700 dark:text-slate-300 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500/80 transition-all duration-300"
          />
          <svg className="absolute left-2 top-1/2 -translate-y-1/3 h-4 w-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <label className="relative inline-flex items-center cursor-pointer group modern-toggle" title="Toggle Theme">
          <input
            type="checkbox"
            id="theme-toggle"
            className="sr-only peer"
            defaultChecked={isDark}
            onChange={handleThemeToggle}
          />
          <div className="toggle-track w-[32px] h-[16px] bg-gradient-to-br from-slate-200 to-white dark:from-slate-700 dark:to-slate-800 rounded-full peer-focus:outline-none peer-checked:bg-gradient-to-br peer-checked:from-sky-400 peer-checked:to-sky-500 dark:peer-checked:from-sky-700 dark:peer-checked:to-sky-900 transition-all duration-500 ease-out shadow-inner">
            <div className="toggle-thumb absolute top-[1.2px] left-[1.2px] bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 rounded-full h-[13.6px] w-[13.6px] flex items-center justify-center transition-all duration-500 ease-out shadow-lg peer-checked:translate-x-[16px] dark:peer-checked:shadow-sky-500/20">
              <svg className="sun-icon h-[7.2px] w-[7.2px] text-amber-500 transition-all duration-400 ease-out" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              </svg>
              <svg className="moon-icon absolute h-[7.2px] w-[7.2px] text-slate-300 transition-all duration-400 ease-out" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
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
