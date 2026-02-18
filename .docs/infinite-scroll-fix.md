# Infinite Scroll & Message Deduplication Fix

## Summary
Fixed the infinite scroll functionality to properly fetch older messages from the server when scrolling beyond the 15 messages stored in IndexedDB, and resolved message duplication issues.

## Changes Made

### 1. **Enhanced Message Deduplication** (`src/context/AppContext.jsx`)
- **Problem**: Messages from IndexedDB and server were being duplicated when merged
- **Solution**: 
  - Improved the `PREPEND_MESSAGES` reducer to use a more robust deduplication key
  - Added preference for messages with `messageId` over those without
  - Added logging to track duplicate removal
  - Changed merge order to prepend new messages first for better handling

**Key improvements:**
```javascript
// Create a robust key: use messageId if available, otherwise use sender + timestamp
const key = m.messageId || `${m.sender}:${ts}`;

// Keep the version with more data (prefer one with messageId)
if (m.messageId && !existing.messageId) {
  seen.set(key, { ...m, timestamp: ts });
}
```

### 2. **Visual Loading Indicator** (`src/components/ChatArea.jsx`)
- **Problem**: No visual feedback when loading older messages
- **Solution**: Added a loading spinner at the top of the message list
  - Shows "Loading older messages..." with animated spinner
  - Uses glassmorphism design consistent with app theme
  - Only appears when `loadingOlderMessages` state is true

### 3. **Scroll Position Preservation** (`src/components/ChatArea.jsx`)
- **Problem**: When older messages loaded, scroll position would jump
- **Solution**: 
  - Track scroll height before loading older messages
  - Calculate height difference after new messages are added
  - Adjust scroll position to maintain user's view
  - Added logging for debugging scroll behavior

**How it works:**
```javascript
// Before loading: save scroll height
previousScrollHeightRef.current = container.scrollHeight;

// After loading: restore position
const heightDifference = newScrollHeight - previousScrollHeightRef.current;
container.scrollTop += heightDifference;
```

## How It Works Now

1. **Initial Load**: App loads last 15 messages from IndexedDB instantly
2. **Scroll to Top**: When user scrolls to the first message:
   - Intersection Observer detects the first message is visible
   - Requests older messages from server with `before_timestamp` parameter
   - Shows loading indicator at top
3. **Server Response**: 
   - Server returns up to 50 older messages
   - Messages are decrypted and merged with existing ones
   - Deduplication removes any overlaps
   - Scroll position is preserved
4. **Repeat**: User can continue scrolling up to load even older messages

## Technical Details

### Message Flow
```
IndexedDB (15 msgs) → Display
    ↓
User scrolls up
    ↓
Request from server (before oldest timestamp)
    ↓
Server returns older messages
    ↓
PREPEND_MESSAGES action
    ↓
Deduplication & merge
    ↓
Update UI with preserved scroll
```

### Deduplication Strategy
- **Primary Key**: `messageId` (unique server-generated ID)
- **Fallback Key**: `${sender}:${normalizedTimestamp}`
- **Conflict Resolution**: Prefer messages with `messageId` over those without
- **Timestamp Normalization**: Handles both seconds and milliseconds

### State Management
- `loadingOlderMessages`: Object mapping `userId` to loading state
- `lastRequestedTimestampRef`: Prevents duplicate requests for same timestamp
- `previousScrollHeightRef`: Tracks scroll height for position restoration

## Testing Checklist

- [x] Messages load from IndexedDB on chat open
- [x] Scrolling to top triggers server request
- [x] Loading indicator appears during fetch
- [x] No duplicate messages after merge
- [x] Scroll position maintained after load
- [x] Can continue scrolling up for older messages
- [x] New messages still scroll to bottom
- [x] Sent messages scroll to bottom

## Configuration

The number of messages stored in IndexedDB can be adjusted in `src/utils/indexedDB.js`:

```javascript
export const MAX_MESSAGES_PER_CONVERSATION = 15; // Change this value
```

Recommended values:
- **15-50**: Fast initial load, frequent server requests
- **50-100**: Balanced performance
- **100+**: Slower initial load, fewer server requests
