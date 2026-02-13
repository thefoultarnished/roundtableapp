/**
 * SIMPLE Windows taskbar notification dot
 * Just shows a red dot when there are unread messages
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { Image } from '@tauri-apps/api/image';

/**
 * Creates a simple red notification dot (16x16 PNG image)
 */
function createRedDot() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');

  // Draw a red circle
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(8, 8, 7, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL('image/png');
}

/**
 * Shows or hides a red dot on the taskbar icon
 * @param {boolean} show - true to show dot, false to hide it
 */
export async function updateNotificationDot(show) {
  try {
    const window = getCurrentWindow();

    if (!show) {
      // Clear the overlay - no notifications
      await window.setOverlayIcon(null);
      console.log('Notification dot cleared');
    } else {
      // Show red dot - there are unread messages
      const dotImage = createRedDot();
      const base64Data = dotImage.split(',')[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const image = await Image.fromBytes(bytes);
      await window.setOverlayIcon(image);
      console.log('Notification dot shown');
    }
  } catch (error) {
    console.error('Failed to update notification dot:', error);
  }
}

/**
 * Check if there are any unread messages
 */
export function hasUnreadMessages(unreadCounts) {
  return Object.values(unreadCounts || {}).some(count => count > 0);
}
