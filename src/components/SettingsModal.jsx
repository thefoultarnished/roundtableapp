import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { useNetwork } from '../hooks/useNetwork';
import GlassDropdown from './GlassDropdown';
import { setCachedProfilePic } from '../utils/profilePictureCache';

export default function SettingsModal() {
  const { state, dispatch, online } = useAppContext();
  const { announcePresence } = useNetwork();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [autoDownload, setAutoDownload] = useState(false);
  const [appFont, setAppFont] = useState("'Inter', sans-serif");
  const [chatFont, setChatFont] = useState("'Inter', sans-serif");
  const [fontScale, setFontScale] = useState(100);
  const [saveStatus, setSaveStatus] = useState('');
  const [theme, setTheme] = useState('light');
  const [profilePicture, setProfilePicture] = useState('');
  const [savedProfilePicture, setSavedProfilePicture] = useState(''); // Track last saved picture
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const blobUrlRef = useRef(null); // Track blob URL for cleanup
  const [windowTransparency, setWindowTransparency] = useState(true);
  const [transparencyLevel, setTransparencyLevel] = useState(0.75); // UI Glass
  const [windowOpacity, setWindowOpacity] = useState(0.70); // Main Background
  const [publicKeyJwk, setPublicKeyJwk] = useState(null);
  const [privateKeyJwk, setPrivateKeyJwk] = useState(null);

  useEffect(() => {
    // Sync state from localStorage when settings are opened
    const syncSettings = () => {
      setDisplayName(state.currentUser?.displayName || localStorage.getItem('displayName') || '');
      const currentUsername = state.currentUser?.username || localStorage.getItem('username') || '';
      setUsername(currentUsername);
      setAutoDownload(localStorage.getItem('autoDownloadFiles') === 'true');
      setAppFont(localStorage.getItem('appFont') || "'Inter', sans-serif");
      setChatFont(localStorage.getItem('chatFont') || "'Inter', sans-serif");
      setFontScale(parseInt(localStorage.getItem('fontSizeScale') || '100'));
      setTheme(localStorage.getItem('theme') || 'aurora');

      // Load profile picture from Redux state (server source of truth)
      const currentUserData = state.allUsers.find(u => u.username === currentUsername);
      const picFromServer = currentUserData?.profile_picture || '';
      setProfilePicture(picFromServer);
      setSavedProfilePicture(picFromServer);

      setWindowTransparency(localStorage.getItem('windowTransparency') !== 'false');
      setTransparencyLevel(parseFloat(localStorage.getItem('transparencyLevel') || '0.75'));
      setWindowOpacity(parseFloat(localStorage.getItem('windowOpacity') || '0.70'));

      // Load crypto keys for testing
      try {
        if (currentUsername) {
          const pubKeyStr = localStorage.getItem(`keys_${currentUsername}_pub`);
          const privKeyStr = localStorage.getItem(`keys_${currentUsername}_priv`);
          if (pubKeyStr) {
            setPublicKeyJwk(JSON.parse(pubKeyStr));
          } else {
             // Fallback to legacy
             const legacyPub = localStorage.getItem('pubKey');
             if (legacyPub) setPublicKeyJwk(JSON.parse(legacyPub));
          }
          if (privKeyStr) {
            setPrivateKeyJwk(JSON.parse(privKeyStr));
          } else {
             // Fallback to legacy
             const legacyPriv = localStorage.getItem('privKey');
             if (legacyPriv) setPrivateKeyJwk(JSON.parse(legacyPriv));
          }
        }
      } catch (err) {
        console.error('Failed to load keys:', err);
      }

      // Clear upload states when opening settings
      setUploadingPicture(false);
      setUploadError('');
    };

    if (state.settingsOpen) {
      syncSettings();
    }

    // Cleanup blob URL on unmount
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [state.settingsOpen, state.allUsers]);

  const closeSettings = () => dispatch({ type: 'SET_SETTINGS_OPEN', payload: false });

  // Upload profile picture with rollback on error
  const uploadProfilePictureWithRollback = async () => {
    setUploadingPicture(true);
    setUploadError('');

    const userId = localStorage.getItem('username');
    const serverUrl = localStorage.getItem('relayServerUrl') || 'http://129.154.231.157:8080';
    const uploadUrl = serverUrl.replace('ws://', 'http://').replace('wss://', 'https://') + '/upload-image';
    const timestamp = Date.now();
    const versionedFileName = `${userId}_${timestamp}.png`;

    let uploadedImageUrl = null;
    const previousPicture = savedProfilePicture;

    try {
      // Step 1: Upload to MinIO with versioned filename
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: profilePicture,
          userId: userId,
          fileName: versionedFileName
        })
      });

      const data = await response.json();

      if (!data.success || !data.imageUrl) {
        throw new Error(data.error || 'Upload failed');
      }

      uploadedImageUrl = data.imageUrl;
      console.log(`✅ Image uploaded to MinIO: ${uploadedImageUrl}`);

      // Step 2: Update database via WebSocket
      if (online?.sendProfilePictureUpdate) {
        online.sendProfilePictureUpdate(uploadedImageUrl);
      } else {
        throw new Error('Not connected to server');
      }

      // Step 3: Update local state
      dispatch({
        type: 'UPDATE_USER_PROFILE_PICTURE',
        payload: {
          userId: userId,
          profilePicture: uploadedImageUrl
        }
      });

      // Step 4: Update cache
      setCachedProfilePic(userId, uploadedImageUrl, timestamp);

      // Step 5: Cleanup blob URL
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      setSavedProfilePicture(uploadedImageUrl);
      setProfilePicture(uploadedImageUrl);
      setUploadingPicture(false);

    } catch (err) {
      console.error('❌ Image upload error:', err);
      setUploadError(err.message || 'Upload failed');

      // Rollback: Revert UI to previous picture
      setProfilePicture(previousPicture);
      setSavedProfilePicture(previousPicture);

      // Cleanup blob URL on error
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      setUploadingPicture(false);

      // TODO: If MinIO upload succeeded but broadcast failed,
      // we should delete the uploaded file from MinIO
      // This would require a delete endpoint on the server
    }
  };

  const handleSave = () => {
    // Persist to localStorage
    localStorage.setItem('username', username);
    localStorage.setItem('displayName', displayName);
    localStorage.setItem('fontSizeScale', fontScale);
    localStorage.setItem('autoDownloadFiles', autoDownload);
    localStorage.setItem('appFont', appFont);
    localStorage.setItem('chatFont', chatFont);
    localStorage.setItem('windowTransparency', windowTransparency);
    localStorage.setItem('transparencyLevel', transparencyLevel);
    localStorage.setItem('windowOpacity', windowOpacity);
    localStorage.setItem('theme', theme);

    // Update AppContext currentUser
    dispatch({
      type: 'LOGIN',
      payload: { username, displayName }
    });

    // Apply Visual CSS Variables
    document.documentElement.style.setProperty('--app-font', appFont);
    document.documentElement.style.setProperty('--chat-font', chatFont);
    document.documentElement.style.setProperty('--font-size-scale', fontScale / 100);
    document.documentElement.style.setProperty('--glass-opacity', transparencyLevel);

    // Apply Theme Classes
    document.documentElement.classList.remove('dark', 'aurora');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    if (theme === 'aurora') document.documentElement.classList.add('aurora');

    // Apply Window Background Opacity
    const root = document.getElementById('root');
    if (root) {
      if (windowTransparency) {
         const isDark = theme === 'dark' || theme === 'aurora';
         root.style.background = isDark
            ? `rgba(2, 6, 23, ${windowOpacity})`
            : `rgba(235, 238, 244, ${windowOpacity})`;
      } else {
         const isDark = theme === 'dark' || theme === 'aurora';
         root.style.background = isDark ? '#020617' : '#e2e8f0';
      }
    }

    // Check if profile picture changed
    const profilePicChanged = profilePicture !== savedProfilePicture;
    if (profilePicChanged && profilePicture && !uploadingPicture) {
      // Upload to MinIO through server with new flow
      uploadProfilePictureWithRollback();
    }

    // Only announce presence if username or displayName actually changed
    const prevUsername = localStorage.getItem('username');
    const prevDisplayName = localStorage.getItem('displayName');
    const usernameChanged = prevUsername !== username;
    const displayNameChanged = prevDisplayName !== displayName;

    // Don't broadcast identity for profile pic changes - sendProfilePictureUpdate handles that
    if (usernameChanged || displayNameChanged) {
      // Send username update to server if in online mode
      if (online?.ws && online.ws.readyState === WebSocket.OPEN) {
        const userId = localStorage.getItem('userId');
        if (userId && username) {
          online.ws.send(JSON.stringify({
            type: 'update_username',
            userId: userId,
            newUsername: username
          }));
          console.log(`📤 Sent username update to server: ${username}`);
        }
      }

      // Announce presence changes to server (for online mode)
      if (online?.broadcastIdentity) {
        online.broadcastIdentity();
      } else if (announcePresence) {
        announcePresence();
      }
    }

    // Show save status
    setSaveStatus('Saved!');
    const timer = setTimeout(() => setSaveStatus(''), 1500);
    return () => clearTimeout(timer);
  };

  if (!state.settingsOpen) return null;

  const handlePfpChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;

    // Clear any previous error
    setUploadError('');

    // Cleanup previous blob URL if exists
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        canvas.getContext('2d').drawImage(img, 0, 0, 96, 96);
        const resized = canvas.toDataURL('image/png');

        // Create blob URL for instant preview (optimistic update)
        fetch(resized)
          .then(res => res.blob())
          .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            blobUrlRef.current = blobUrl;
          });

        // Set the base64 data for upload (will happen on Save)
        setProfilePicture(resized);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  };

  const inputClass = "w-full px-3 py-2 text-xs rounded-app bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10 outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/40 transition-all duration-300 text-slate-800 dark:text-slate-200 placeholder:text-slate-400/60 backdrop-blur-sm";
  const selectClass = "w-full p-2 text-[11px] rounded-app glass-select outline-none text-slate-800 dark:text-slate-200 cursor-pointer";
  const labelClass = "block text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-1.5 ml-0.5";

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 modal-backdrop" onClick={(e) => {
      if (e.target.closest('.z-\\[99999\\]')) return;
      if (e.target === e.currentTarget) closeSettings();
    }}>
      <div className="glass-panel-heavy rounded-3xl w-full max-w-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="py-3 px-5 border-b border-white/20 dark:border-white/20 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-sm shadow-lg shadow-teal-500/20">⚙</span>
            <span>Settings</span>
            <span className="text-[9px] text-teal-500 font-bold uppercase tracking-widest ml-4 h-3 animate-pulse self-center mt-1">
              {saveStatus}
            </span>
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white text-xs font-bold transition-all duration-300 hover:shadow-lg hover:shadow-teal-500/30"
            >
              Save
            </button>
            <button
              onClick={closeSettings}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-slate-600 dark:text-slate-400 hover:bg-white/20 hover:text-red-500 dark:hover:text-red-400 hover:border-red-500/30 transition-all duration-300 hover:rotate-90 group"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 pt-4 pb-10 grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Column 1: Profile */}
          <div className="space-y-4">
            <SectionHeader color="teal" label="Profile" />
            <div className="flex flex-col items-center p-4 rounded-2xl bg-white/15 dark:bg-white/5 border border-white/15 dark:border-white/5 backdrop-blur-sm">
              <div className="relative group mb-3">
                <div className={`w-20 h-20 rounded-full overflow-hidden ring-3 ring-white/20 group-hover:ring-teal-400/40 transition-all duration-400 shadow-lg ${uploadingPicture ? 'opacity-50' : ''}`}>
                  <img
                    src={profilePicture || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'}
                    className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 object-cover"
                    alt="Profile"
                  />
                </div>
                {uploadingPicture && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => document.getElementById('pfp-file-input')?.click()}
                  disabled={uploadingPicture}
                  className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-white shadow-lg shadow-teal-500/30 border-2 border-white dark:border-slate-900 hover:scale-110 transition-transform duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <input type="file" id="pfp-file-input" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handlePfpChange} disabled={uploadingPicture} />
              </div>
              {uploadError && (
                <p className="text-[9px] text-red-500 text-center mt-2 font-medium">{uploadError}</p>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Display Name</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} placeholder="Name" />
              </div>
              <div>
                <label className={labelClass}>Username (@) <span className="text-[8px] text-slate-500 font-normal">Cannot be changed</span></label>
                <input type="text" value={username} disabled className={inputClass + " opacity-60 cursor-not-allowed"} placeholder="Unique ID" />
              </div>
            </div>
          </div>

          {/* Column 2: Appearance */}
          <div className="space-y-4">
            <SectionHeader color="purple" label="Appearance" />
            <div className="space-y-3 p-3 rounded-2xl bg-white/15 dark:bg-white/5 border border-white/15 dark:border-white/5 backdrop-blur-sm">
              <div>
                <label className={labelClass}>Theme</label>
                <GlassDropdown
                  value={theme}
                  onChange={(val) => setTheme(val)}
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'aurora', label: 'Aurora' }
                  ]}
                />
              </div>
              <div>
                <label className={labelClass}>App Font</label>
                <GlassDropdown
                  value={appFont}
                  onChange={(val) => setAppFont(val)}
                  options={[
                    { value: "'Inter', sans-serif", label: 'Inter (Clean)' },
                    { value: "'Roboto', sans-serif", label: 'Roboto' },
                    { value: "'Montserrat', sans-serif", label: 'Montserrat' },
                    { value: "'Space Grotesk', sans-serif", label: 'Space Tech' },
                    { value: "'Comic Sans MS', cursive", label: 'Comic Sans' }
                  ]}
                />
              </div>
              <div>
                <label className={labelClass}>Chat Font</label>
                <GlassDropdown
                  value={chatFont}
                  onChange={(val) => setChatFont(val)}
                  options={[
                    { value: "'Inter', sans-serif", label: 'Inter (Clean)' },
                    { value: "'Roboto Mono', monospace", label: 'Roboto Mono' },
                    { value: "'Fira Code', monospace", label: 'Fira Code' },
                    { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
                    { value: "'Space Grotesk', sans-serif", label: 'Space Tech' }
                  ]}
                />
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-white/15 dark:bg-white/5 border border-white/15 dark:border-white/5 backdrop-blur-sm">
              <div className="flex justify-between items-center mb-2">
                <label className={labelClass + ' mb-0'}>Scale</label>
                <span className="text-[10px] font-bold font-mono text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-lg">{fontScale}%</span>
              </div>
              <input type="range" min="50" max="200" step="10" value={fontScale} onChange={(e) => setFontScale(e.target.value)}
                className="w-full h-1.5 rounded-lg appearance-none bg-white/20 dark:bg-white/10 accent-purple-500 cursor-pointer" />
            </div>
            
            {/* Window Transparency Toggle */}
            {/* Window Transparency Toggle */}
             <div className="p-3 rounded-2xl bg-white/15 dark:bg-white/5 border border-white/15 dark:border-white/5 backdrop-blur-sm space-y-3 mb-10">
              <div className="flex items-center justify-between">
                <span className={labelClass + ' mb-0'}>Transparency</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={windowTransparency} 
                    onChange={(e) => setWindowTransparency(e.target.checked)} 
                    className="sr-only peer" 
                  />
                  <div className="w-9 h-5 bg-white/20 dark:bg-white/10 rounded-full peer peer-checked:bg-gradient-to-r peer-checked:from-purple-500 peer-checked:to-indigo-500 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 after:shadow-lg" />
                </label>
              </div>

              {/* Transparency Level Slider */}
              {windowTransparency && (
                <div className="animate-fade-in-down space-y-3">
                  {/* UI Glass Opacity */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[9px] text-slate-400 font-medium">UI Glass Opacity</label>
                      <span className="text-[9px] font-mono text-slate-500">{Math.round(transparencyLevel * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="10" 
                      max="100" 
                      step="5" 
                      value={transparencyLevel * 100} 
                      onChange={(e) => setTransparencyLevel(e.target.value / 100)}
                      className="w-full h-1.5 rounded-lg appearance-none bg-white/20 dark:bg-white/10 accent-indigo-500 cursor-pointer" 
                    />
                  </div>
                  
                  {/* Background Opacity */}
                  <div>
                   <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[9px] text-slate-400 font-medium">Win. Background Opacity</label>
                      <span className="text-[9px] font-mono text-slate-500">{Math.round(windowOpacity * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      step="5" 
                      value={windowOpacity * 100} 
                      onChange={(e) => setWindowOpacity(e.target.value / 100)}
                      className="w-full h-1.5 rounded-lg appearance-none bg-white/20 dark:bg-white/10 accent-teal-500 cursor-pointer" 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Network */}
          <div className="space-y-4">
            <SectionHeader color="blue" label="Network" />
            <div className="p-3 rounded-2xl bg-white/15 dark:bg-white/5 border border-white/15 dark:border-white/5 backdrop-blur-sm">
              <label className={labelClass}>Connection Mode</label>
              <ConnectionModeToggle />
            </div>
            <div className="p-3 rounded-2xl bg-white/15 dark:bg-white/5 border border-white/15 dark:border-white/5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className={labelClass + ' mb-0'}>Auto-Download</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={autoDownload} onChange={(e) => setAutoDownload(e.target.checked)} className="sr-only peer" />
                  <div className="w-9 h-5 bg-white/20 dark:bg-white/10 rounded-full peer peer-checked:bg-gradient-to-r peer-checked:from-teal-400 peer-checked:to-cyan-500 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 after:shadow-lg" />
                </label>
              </div>
            </div>

            {/* Public Key Display */}
            <div className="p-3 rounded-2xl bg-white/15 dark:bg-white/5 border border-white/15 dark:border-white/5 backdrop-blur-sm">
              <label className={labelClass}>Public Key (Test)</label>
              <div className="max-h-24 overflow-y-auto bg-black/20 rounded-lg p-2 text-[8px] font-mono text-cyan-300 break-all">
                {publicKeyJwk ? JSON.stringify(publicKeyJwk, null, 2) : 'No public key found'}
              </div>
            </div>

            {/* Private Key Display */}
            <div className="p-3 rounded-2xl bg-white/15 dark:bg-white/5 border border-white/15 dark:border-white/5 backdrop-blur-sm">
              <label className={labelClass}>Private Key (Test)</label>
              <div className="max-h-24 overflow-y-auto bg-black/20 rounded-lg p-2 text-[8px] font-mono text-purple-300 break-all">
                {privateKeyJwk ? JSON.stringify(privateKeyJwk, null, 2) : 'No private key found'}
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={() => {
                // Tell server to disconnect this user first
                if (online?.sendLogout) {
                  online.sendLogout();
                }
                // Then clear local state
                dispatch({ type: 'LOGOUT' });
                closeSettings();
              }}
              className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold text-sm hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 hover:scale-105 active:scale-95 mt-2"
            >
              Logout
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function SectionHeader({ color, label }) {
  const colorMap = {
    teal: 'text-teal-500 border-teal-500/20',
    purple: 'text-purple-500 border-purple-500/20',
    blue: 'text-blue-500 border-blue-500/20',
  };

  return (
    <h3 className={`text-[10px] font-bold uppercase tracking-[0.2em] border-b pb-2 ${colorMap[color] || colorMap.teal}`}>
      {label}
    </h3>
  );
}

function ConnectionModeToggle() {
  const [mode, setMode] = useState(localStorage.getItem('connectionMode') || 'online');
  const [serverUrl, setServerUrl] = useState(localStorage.getItem('relayServerUrl') || 'ws://129.154.231.157:8080');

  useEffect(() => {
    localStorage.setItem('connectionMode', mode);
    window.dispatchEvent(new Event('settings-changed'));
  }, [mode]);

  useEffect(() => {
    const timer = setTimeout(() => {
        localStorage.setItem('relayServerUrl', serverUrl);
        window.dispatchEvent(new Event('settings-changed'));
    }, 500);
    return () => clearTimeout(timer);
  }, [serverUrl]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative bg-white/10 dark:bg-white/5 p-1 rounded-xl flex border border-white/10 h-10">
        {/* Sliding Background */}
        <div 
            className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg shadow-sm transition-all duration-300 z-0 backdrop-blur-md border border-white/10 ${mode === 'online' ? 'left-[calc(50%)] bg-purple-500/20' : 'left-1 bg-teal-500/20'}`}
        />
        
        <button 
            type="button" 
            onClick={() => setMode('lan')}
            className={`flex-1 text-[10px] font-bold z-10 transition-colors outline-none rounded-lg ${mode === 'lan' ? 'text-teal-400' : 'text-slate-400'}`}
        >
          LAN
        </button>
        <button 
            type="button" 
            onClick={() => setMode('online')}
            className={`flex-1 text-[10px] font-bold z-10 transition-colors outline-none rounded-lg ${mode === 'online' ? 'text-purple-400' : 'text-slate-400'}`}
        >
          ONLINE
        </button>
      </div>

      <p className="text-[9px] text-center text-slate-500 uppercase tracking-wider font-bold">
        {mode === 'online' ? 'Global Relay Network' : 'Local Area Network'}
      </p>

      {/* Server URL Input (Only for Online Mode) */}
      {mode === 'online' && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Relay Server URL</label>
            <input 
                type="text" 
                value={serverUrl} 
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="ws://123.45.67.89:8080"
                className="w-full px-3 py-2 text-[10px] font-mono rounded-lg bg-black/20 border border-white/10 text-slate-300 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
            />
        </div>
      )}
    </div>
  );
}
