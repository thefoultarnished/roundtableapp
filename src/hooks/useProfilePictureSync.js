import { useEffect, useRef } from 'react';
import { getCachedProfilePic, isCacheStale, setCachedProfilePic } from '../utils/profilePictureCache';

/**
 * Hook to sync profile pictures on app launch
 * Checks localStorage cache and fetches from server if stale
 */
export function useProfilePictureSync(dispatch, allUsers, isOnline) {
  const syncedUsers = useRef(new Set());

  useEffect(() => {
    if (!isOnline || !allUsers || allUsers.length === 0) return;

    allUsers.forEach(user => {
      const username = user.username || user.id;

      // Skip if already synced in this session
      if (syncedUsers.current.has(username)) return;

      // Check cache
      const cached = getCachedProfilePic(username);

      if (!cached || isCacheStale(cached.timestamp)) {
        // Cache is empty or stale
        console.log(`📸 Cache stale/empty for ${username}, using server data`);

        if (user.profile_picture) {
          // Update cache with fresh data from server
          setCachedProfilePic(username, user.profile_picture, Date.now());
          syncedUsers.current.add(username);
        }
      } else {
        // Cache is valid
        console.log(`📸 Using cached profile pic for ${username}`);

        // If server data differs from cache, update UI with cached version
        // (This handles the case where localStorage has newer data than initial server sync)
        if (user.profile_picture !== cached.url) {
          dispatch({
            type: 'UPDATE_USER_PROFILE_PICTURE',
            payload: {
              userId: username,
              profilePicture: cached.url
            }
          });
        }

        syncedUsers.current.add(username);
      }
    });
  }, [allUsers, isOnline, dispatch]);

  // Clear synced users on logout (when allUsers becomes empty)
  useEffect(() => {
    if (!allUsers || allUsers.length === 0) {
      syncedUsers.current.clear();
    }
  }, [allUsers]);
}
