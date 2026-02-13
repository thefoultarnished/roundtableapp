/**
 * React hook to show a red notification dot on Windows taskbar
 */

import { useEffect } from 'react';
import { updateNotificationDot, hasUnreadMessages } from '../utils/simpleTaskbarBadge';

/**
 * Shows a red dot on taskbar when there are unread messages
 * @param {Object} unreadCounts - Object mapping userId to unread count from AppContext
 */
export function useTaskbarBadge(unreadCounts) {
  useEffect(() => {
    // Check if there are any unread messages
    const showDot = hasUnreadMessages(unreadCounts);

    // Show or hide the red dot
    updateNotificationDot(showDot);
  }, [unreadCounts]); // Re-run whenever unread counts change
}
