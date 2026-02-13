/**
 * Checks if the application window is currently focused
 */
export async function isWindowFocused() {
    if (!window.__TAURI__ || !window.__TAURI__.window) {
        // Fallback for browser environment
        return document.hasFocus();
    }

    try {
        const appWindow = window.__TAURI__.window.getCurrentWindow();
        const focused = await appWindow.isFocused();
        console.log(`Window focused: ${focused}`);
        return focused;
    } catch (error) {
        console.error("Error checking window focus:", error);
        return false;
    }
}

/**
 * Checks if the application window is visible (not minimized)
 */
export async function isWindowVisible() {
    if (!window.__TAURI__ || !window.__TAURI__.window) {
        console.warn("Tauri window API not available - assuming not visible");
        return false;
    }

    try {
        const appWindow = window.__TAURI__.window.getCurrentWindow();
        const minimized = await appWindow.isMinimized();
        console.log(`Window minimized: ${minimized} (visible: ${!minimized})`);
        return !minimized;
    } catch (error) {
        console.error("Error checking window visibility:", error);
        return false;
    }
}

/**
 * Safely retrieves or generates a valid user ID from localStorage
 */
export function getSafeUserId() {
    const storedId = localStorage.getItem('userId');

    if (storedId && !isNaN(parseInt(storedId, 10))) {
        return parseInt(storedId, 10);
    }

    const newId = Math.floor(Math.random() * 100000000);
    console.warn(`⚠️ Invalid userId in localStorage. Generated new ID: ${newId}`);
    localStorage.setItem('userId', newId);
    return newId;
}

/**
 * Resizes an image to specified dimensions using canvas
 */
export function resizeImage(base64Str, maxWidth, maxHeight, callback) {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = maxWidth;
        canvas.height = maxHeight;
        ctx.drawImage(img, 0, 0, maxWidth, maxHeight);
        callback(canvas.toDataURL('image/jpeg', 0.8));
    };
}

/**
 * Retrieves the user's IP address from storage
 */
export async function getUserIP() {
    return localStorage.getItem('myIP') || '127.0.0.1';
}

/**
 * Groups messages by date for display with date headers
 */
export function groupMessagesByDate(messages) {
    const groups = [];
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayDate = today.toLocaleDateString();
    const yesterdayDate = yesterday.toLocaleDateString();

    const dateGroups = {};

    messages.forEach(message => {
        const msgDate = new Date(message.timestamp);
        const msgDateString = msgDate.toLocaleDateString();

        let dateLabel;
        if (msgDateString === todayDate) {
            dateLabel = 'Today';
        } else if (msgDateString === yesterdayDate) {
            dateLabel = 'Yesterday';
        } else {
            dateLabel = msgDate.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric'
            });
        }

        if (!dateGroups[dateLabel]) {
            dateGroups[dateLabel] = {
                dateLabel,
                date: msgDate,
                messages: []
            };
            groups.push(dateGroups[dateLabel]);
        }

        dateGroups[dateLabel].messages.push(message);
    });

    groups.sort((a, b) => a.date - b.date);

    return groups;
}

/**
 * Checks if the messages container is scrolled to the bottom
 */
export function isScrolledToBottom(element) {
    return element.scrollHeight - element.scrollTop <= element.clientHeight + 50;
}

/**
 * Returns an emoji icon based on file type
 */
export function getFileIcon(fileType) {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType.startsWith('video/')) return '🎥';
    if (fileType.startsWith('audio/')) return '🎵';
    if (fileType.includes('pdf')) return '📄';
    return '📁';
}

/**
 * Detects whether running in browser, dev, or release mode
 */
export function detectBuildType() {
    if (!window.__TAURI__) return 'browser';

    if (window.__TAURI__.__tauriVersion) {
        return 'release';
    } else {
        return 'dev';
    }
}

/**
 * Debug utility to check user ID validity
 */
export function checkUserIds() {
    const localId = localStorage.getItem('userId');
    const parsedId = parseInt(localId, 10);

    console.log({
        storedValue: localId,
        parsedValue: parsedId,
        isValidNumber: !isNaN(parsedId),
        safeId: getSafeUserId()
    });

    return !isNaN(parsedId) ? "User ID is valid" : "User ID is invalid, using fallback";
}
