# Profile Picture Flow Implementation

## Summary
Implemented a robust profile picture flow with caching, versioned URLs, error handling, and real-time sync.

---

## Flow Breakdown

### 1. **On App Launch** ✅

**File**: `src/hooks/useProfilePictureSync.js`, `src/context/AppContext.jsx`

1. **Check Cache**: Look up `localStorage` with key `profilePic_${username}`
2. **Validate Freshness**: Check if cache is stale (>24 hours old)
3. **Sync if Needed**: Use server data if cache is empty/stale
4. **Update UI**: Render profile picture from cache or server

**Key Features**:
- Automatic cache validation on app launch
- 24-hour cache expiry (configurable)
- Stores only URL string, not image data

---

### 2. **When User Updates Profile Picture** ✅

**File**: `src/components/SettingsModal.jsx`

#### Step-by-Step:

1. **Instant Preview** (Lines 210-230)
   - User selects image → create blob URL
   - Show preview immediately (optimistic update)
   - Store blob URL reference for cleanup

2. **Upload to MinIO** (Lines 67-105)
   - Generate versioned filename: `${username}_${timestamp}.png`
   - Upload to MinIO server
   - Get new URL with versioned filename
   - **On Failure**: Revert UI, revoke blob URL, show error

3. **Update Database** (Lines 83-90)
   - Broadcast new URL via WebSocket
   - Server updates database and broadcasts to all clients

4. **Cleanup** (Lines 91-98)
   - Revoke temporary blob URL (`URL.revokeObjectURL()`)
   - Update localStorage cache
   - Update local state with final MinIO URL

5. **Error Handling** (Lines 99-115)
   - **Rollback**: Revert to previous picture on any error
   - **Cleanup**: Always revoke blob URLs
   - **User Feedback**: Display error message in UI

---

### 3. **Real-time Sync (All Clients)** ✅

**File**: `src/hooks/useOnlineMode.js`

When another user updates their profile picture:

1. **Receive Broadcast** (Lines 741-759)
   ```json
   {
     "type": "profile_picture_updated",
     "userId": "john_doe",
     "profilePicture": "http://minio.../john_doe_1708012345.png",
     "timestamp": 1708012345
   }
   ```

2. **Cache Update**
   - Save new URL to `localStorage`
   - Use timestamp from broadcast

3. **UI Update**
   - Dispatch `UPDATE_USER_PROFILE_PICTURE` action
   - React re-renders with new URL
   - Browser fetches new image (cache busted by versioned filename)

---

## Files Modified

### New Files:
1. `src/utils/profilePictureCache.js` - Cache management utilities
2. `src/hooks/useProfilePictureSync.js` - Sync hook for app launch
3. `PROFILE_PICTURE_FLOW.md` - This documentation

### Modified Files:
1. `src/components/SettingsModal.jsx` - Upload flow with rollback
2. `src/context/AppContext.jsx` - Cache on logout, cache on update
3. `src/hooks/useOnlineMode.js` - Cache on user connect, cache on broadcast
4. `server.js` - Add timestamp to broadcast

---

## Key Improvements

### ✅ Fixed Issues:

1. **Cache Busting**
   - ❌ Before: Same URL = browser cache = stale images
   - ✅ After: Versioned filenames = unique URLs = fresh images

2. **Memory Leaks**
   - ❌ Before: Blob URLs never cleaned up
   - ✅ After: `URL.revokeObjectURL()` on cleanup and errors

3. **Error Handling**
   - ❌ Before: No rollback, upload errors lost data
   - ✅ After: Full rollback, error messages, previous state preserved

4. **Race Conditions**
   - ❌ Before: No handling
   - ✅ After: Last-write-wins (acceptable for profile pics)

5. **Cache Management**
   - ❌ Before: No caching
   - ✅ After: localStorage cache with timestamps, 24h expiry

---

## Usage

### Upload Profile Picture:
1. User clicks camera icon in Settings
2. Selects image file
3. Image resizes to 96x96 and shows instant preview
4. User clicks "Save"
5. Image uploads to MinIO with versioned filename
6. Server broadcasts update to all connected clients
7. All clients update their UI and cache

### On App Launch:
1. App checks `localStorage` for cached profile pic URLs
2. If cache is valid (<24h old), use cached URL
3. If stale or missing, fetch from server
4. Update cache with fresh data

### On Logout:
1. All profile picture caches are cleared
2. User state is reset

---

## API Reference

### Cache Functions (`profilePictureCache.js`)

```js
// Get cached profile pic
getCachedProfilePic(username) → {url, timestamp} | null

// Set cached profile pic
setCachedProfilePic(username, url, timestamp)

// Check if cache is stale
isCacheStale(timestamp, maxAge = 24h) → boolean

// Clear specific user cache
clearProfilePicCache(username)

// Clear all caches
clearAllProfilePicCaches()
```

---

## Testing Checklist

- [ ] Upload new profile picture → instant preview shown
- [ ] Save → spinner shows during upload
- [ ] Success → new picture persists after refresh
- [ ] Failure → reverts to old picture, shows error
- [ ] Other clients see update in real-time
- [ ] Cache persists across page refreshes
- [ ] Logout clears all caches
- [ ] No memory leaks (blob URLs cleaned up)
- [ ] Versioned URLs prevent browser caching issues

---

## Configuration

### Cache Expiry
Edit `src/utils/profilePictureCache.js`:
```js
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
```

### MinIO Settings
Edit `server.js`:
```js
const MINIO_ENDPOINT = "129.154.231.157";
const MINIO_PORT = 9000;
const MINIO_BUCKET = "roundtable";
```
