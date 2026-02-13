/**
 * Utility for managing Windows taskbar badge counts using overlay icons
 *
 * Windows doesn't support setBadgeCount() natively in Tauri, so we use
 * setOverlayIcon() with dynamically generated badge images instead.
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { Image } from '@tauri-apps/api/image';

/**
 * Creates a canvas-based badge icon with the specified count
 * @param {number} count - The badge count to display (0-99+)
 * @returns {string|null} - Data URL of the generated icon, or null if count is 0
 */
function createBadgeIcon(count) {
  if (count <= 0) {
    return null; // No badge needed
  }

  // Create a small canvas for the overlay icon (16x16 is standard for Windows)
  const canvas = document.createElement('canvas');
  const size = 16;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Draw circular background with gradient
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#ef4444'); // red-500
  gradient.addColorStop(1, '#ec4899'); // pink-500

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Draw white text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Adjust font size based on digit count
  const displayText = count > 99 ? '99+' : count.toString();
  const fontSize = displayText.length > 2 ? 8 : displayText.length > 1 ? 10 : 12;
  ctx.font = `bold ${fontSize}px Arial`;

  ctx.fillText(displayText, size / 2, size / 2);

  // Convert to data URL
  return canvas.toDataURL('image/png');
}

/**
 * Updates the Windows taskbar overlay icon with the badge count
 * @param {number} count - Total unread count across all chats
 */
export async function updateTaskbarBadge(count) {
  console.log('updateTaskbarBadge called with count:', count);

  try {
    const window = getCurrentWindow();
    console.log('Got current window:', window);

    if (count <= 0) {
      // Clear the overlay icon when count is 0
      await window.setOverlayIcon(null);
      console.log('Taskbar badge cleared');
    } else {
      // Generate badge icon
      const iconDataUrl = createBadgeIcon(count);

      if (iconDataUrl) {
        // Convert data URL to byte array for Tauri
        const base64Data = iconDataUrl.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Create Image from PNG bytes
        const image = await Image.fromBytes(bytes);

        // Set the overlay icon
        await window.setOverlayIcon(image);
        console.log(`Taskbar badge updated: ${count}`);
      }
    }
  } catch (error) {
    // Log detailed error information for debugging
    console.error('Failed to update taskbar badge:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
  }
}

/**
 * Calculates total unread count from the unreadCounts object
 * @param {Object} unreadCounts - Object mapping userId to unread count
 * @returns {number} - Total unread messages across all users
 */
export function calculateTotalUnread(unreadCounts) {
  return Object.values(unreadCounts || {}).reduce((total, count) => total + (count || 0), 0);
}
