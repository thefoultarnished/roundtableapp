/**
 * Alternative Windows taskbar badge implementation using window.setIcon()
 *
 * This approach swaps the entire app icon rather than using overlay icons,
 * which may be more reliable on Windows 11.
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { Image } from '@tauri-apps/api/image';

/**
 * Creates a full-size app icon with a badge overlay in the corner
 * @param {number} count - The badge count to display (0-99+)
 * @returns {string|null} - Data URL of the generated icon, or null if count is 0
 */
function createBadgedAppIcon(count) {
  const canvas = document.createElement('canvas');
  const size = 256; // Standard app icon size
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Draw base icon background (you can customize this to match your app icon)
  // For now, using a simple gradient circle
  const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  gradient.addColorStop(0, '#6366f1'); // indigo-500
  gradient.addColorStop(1, '#4f46e5'); // indigo-600

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Add a chat bubble icon (simple representation)
  ctx.fillStyle = '#ffffff';
  ctx.font = `${size * 0.5}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💬', size / 2, size / 2);

  if (count > 0) {
    // Draw badge in top-right corner
    const badgeSize = size * 0.35;
    const badgeX = size - badgeSize / 2 - 10;
    const badgeY = badgeSize / 2 + 10;

    // Badge background with gradient
    const badgeGradient = ctx.createLinearGradient(
      badgeX - badgeSize/2,
      badgeY - badgeSize/2,
      badgeX + badgeSize/2,
      badgeY + badgeSize/2
    );
    badgeGradient.addColorStop(0, '#ef4444'); // red-500
    badgeGradient.addColorStop(1, '#ec4899'); // pink-500

    ctx.fillStyle = badgeGradient;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
    ctx.fill();

    // Badge border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Badge text
    ctx.fillStyle = '#ffffff';
    const displayText = count > 99 ? '99+' : count.toString();
    const fontSize = displayText.length > 2 ? badgeSize * 0.4 : displayText.length > 1 ? badgeSize * 0.5 : badgeSize * 0.6;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayText, badgeX, badgeY);
  }

  return canvas.toDataURL('image/png');
}

// Store the original icon state
let originalIconSet = false;
let badgeCount = 0;

/**
 * Updates the Windows taskbar icon with a badged version
 * @param {number} count - Total unread count across all chats
 */
export async function updateTaskbarBadgeAlt(count) {
  console.log('updateTaskbarBadgeAlt called with count:', count);

  // Avoid unnecessary updates
  if (count === badgeCount) {
    console.log('Badge count unchanged, skipping update');
    return;
  }

  badgeCount = count;

  try {
    const window = getCurrentWindow();
    console.log('Got current window');

    if (count <= 0 && originalIconSet) {
      // Could restore original icon here if we had it saved
      // For now, just skip - the original icon should be the app icon
      console.log('Badge cleared (count is 0)');
      return;
    }

    if (count > 0) {
      // Generate badged icon
      const iconDataUrl = createBadgedAppIcon(count);
      console.log('Generated badged icon');

      if (iconDataUrl) {
        // Convert data URL to byte array
        const base64Data = iconDataUrl.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        console.log('Converted to bytes, length:', bytes.length);

        // Create Image from PNG bytes
        const image = await Image.fromBytes(bytes);
        console.log('Created Image object');

        // Set the main window icon
        await window.setIcon(image);
        console.log(`Taskbar icon updated with badge: ${count}`);
        originalIconSet = true;
      }
    }
  } catch (error) {
    console.error('Failed to update taskbar badge (alt method):', error);
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
