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
    MSG_PORT: window.__TAURI__ && window.__TAURI__.__tauriVersion ? 2427 : 2426
};
