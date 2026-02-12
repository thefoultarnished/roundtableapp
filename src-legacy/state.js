export const state = {
    messages: {},
    allUsers: [],
    displayedUsers: [],
    discoveredUsers: [],
    activeChatUserId: null,
    selectedFiles: [],
    unreadCounts: {},
    globalInvokeFunc: null,
    // Initialize MSG_PORT safely based on Tauri environment
    MSG_PORT: window.__TAURI__ && window.__TAURI__.__tauriVersion ? 2427 : 2426,
    
    // Online Mode & E2EE State
    wsConnection: null,
    keyPair: null, // { publicKey, privateKey }
    remotePublicKeys: {}, // Map<userId, CryptoKey>
    relayUrl: 'ws://localhost:8080' // Default local dev URL, user can change later
};
