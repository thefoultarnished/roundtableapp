import { useEffect, useRef } from 'react';
import {
  migrateFromLocalStorage,
  cleanupOldProfilePictures,
  isCacheValid,
  cacheProfilePictureBlob
} from '../utils/profilePictureBlobCache';
import { getCachedProfilePic, setCachedProfilePic } from '../utils/profilePictureCache';

/**
 * Hook to sync profile pictures on app launch
 * Migrates from localStorage to IndexedDB and manages lazy loading
 */
export function useProfilePictureSync(dispatch, allUsers, isOnline) {
  const migrationDone = useRef(false);
  const syncedUsers = useRef(new Set());

  // One-time migration from localStorage to IndexedDB
  useEffect(() => {
    if (migrationDone.current) return;

    async function runMigration() {
      try {
        await migrateFromLocalStorage();
        await cleanupOldProfilePictures();
        migrationDone.current = true;
        console.log('📸 Profile picture storage ready.');
      } catch (error) {
        console.error('📸 Migration failed:', error);
      }
    }

    runMigration();
  }, []);

  // Lazy loading: check cache validity and update if needed
  useEffect(() => {
    if (!isOnline || !allUsers || allUsers.length === 0) return;

    allUsers.forEach(user => {
      const username = user.username || user.id;

      // Skip if already synced in this session
      if (syncedUsers.current.has(username)) return;

      const profilePictureUrl = user.profile_picture;
      const serverTimestamp = user.profile_picture_timestamp || Date.now();

      if (!profilePictureUrl) {
        syncedUsers.current.add(username);
        return;
      }

      // Check IndexedDB cache validity
      (async () => {
        try {
          const cacheIsValid = await isCacheValid(username, serverTimestamp);

          if (!cacheIsValid) {
            // Cache is stale or missing - fetch and cache blob
            console.log(`📸 Cache miss/stale for ${username}, fetching from server...`);

            // Keep localStorage during migration (temporary)
            setCachedProfilePic(username, profilePictureUrl, serverTimestamp);

            // Fetch and cache blob in background
            await cacheProfilePictureBlob(username, profilePictureUrl, serverTimestamp);

            console.log(`📸 Updated cache for ${username}`);
          } else {
            console.log(`📸 Using cached blob for ${username}`);
          }

          syncedUsers.current.add(username);
        } catch (error) {
          console.error(`📸 Sync failed for ${username}:`, error);

          // Fallback to localStorage during migration
          const cached = getCachedProfilePic(username);
          if (!cached || cached.url !== profilePictureUrl) {
            setCachedProfilePic(username, profilePictureUrl, serverTimestamp);
          }

          syncedUsers.current.add(username);
        }
      })();
    });
  }, [allUsers, isOnline, dispatch]);

  // Clear synced users on logout (when allUsers becomes empty)
  useEffect(() => {
    if (!allUsers || allUsers.length === 0) {
      syncedUsers.current.clear();
    }
  }, [allUsers]);
}
