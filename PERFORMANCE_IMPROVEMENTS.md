# Performance Improvements Roadmap

## ✅ Already Implemented

1. **MessageBubble Memoization** - Prevents unnecessary re-renders when other messages change
2. **groupMessagesByDate Memoization** - Only recalculates when messages actually change
3. **localStorage Caching** - Profile picture read once on mount, not on every render
4. **User Lookup Memoization** - Caches sender user lookup, recalculates only when needed
5. **Removed Animations & Blur** - Eliminated expensive CSS effects causing scroll jank

**Result:** Smooth scrolling with 12-15 visible messages

---

## 🎯 Next Steps (Do Tomorrow)

### High Impact - Do These First

#### 1. Split AppContext into Multiple Contexts (Medium Complexity, 20-30 min)
**Why:** Currently all state in one context. Any state change causes potential re-renders everywhere.

**What to do:**
- Create `src/context/MessagesContext.jsx` - For `messages`, `selectedFiles`
- Create `src/context/UsersContext.jsx` - For `allUsers`, `displayedUsers`, `discoveredUsers`
- Create `src/context/UIContext.jsx` - For `settingsOpen`, `summaryOpen`, `activeChatUserId`, `unreadCounts`, `notifications`
- Keep `AppProvider` that wraps all three
- Update component imports to use specific contexts

**Files to update:**
- ChatArea.jsx - uses MessagesContext, UIContext
- Sidebar.jsx - uses UsersContext, UIContext
- SettingsModal, SummaryModal - use UIContext only
- NotificationContainer - use UIContext only

**Risk:** Medium - test thoroughly after changes

---

#### 2. Memoize ChatArea Lookups (Low Complexity, 5 min)
**Currently:** `activeUser` lookup runs every render
```jsx
// OLD
const activeUser = state.allUsers.find(u => u.id === state.activeChatUserId);

// NEW
const activeUser = useMemo(() =>
  state.allUsers.find(u => u.id === state.activeChatUserId),
  [state.allUsers, state.activeChatUserId]
);
```
**File:** `src/components/ChatArea.jsx` (line ~28)

---

#### 3. Memoize Sidebar User Operations (Low Complexity, 10 min)
**Currently:** User sorting/filtering happens every render

**In Sidebar.jsx:**
```jsx
// Memoize online users
const onlineUsers = useMemo(() =>
  state.allUsers
    .filter(u => u.status === 'online')
    .filter(u => !searchQuery || u.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const lastA = state.messages[a.id]?.at(-1)?.timestamp || 0;
      const lastB = state.messages[b.id]?.at(-1)?.timestamp || 0;
      return lastB - lastA;
    }),
  [state.allUsers, state.messages, searchQuery]
);

// Same for offlineUsers
```

---

### Medium Impact - Do If You Still See Lag

#### 4. Debounce Textarea Adjustments (Low Complexity, 5 min)
**Currently:** `adjustTextarea()` runs on every keystroke with DOM manipulation
```jsx
// Add to ChatArea.jsx imports
import { useCallback, useMemo, useRef } from 'react';

// Use debounce (create simple debounce utility or use lodash)
const adjustTextarea = useCallback(() => {
  // ... existing code
}, []);

// Debounce the onChange
const handleInputChange = useCallback((e) => {
  setInputValue(e.target.value);
  // Call with debounce (100ms should be fine)
}, []);
```

---

#### 5. Lazy Load Emoji Picker (Low Complexity, 5 min)
**Currently:** Emoji picker imported globally, loaded with every component
```jsx
// OLD
import EmojiPicker from 'emoji-picker-react';

// NEW
const EmojiPicker = React.lazy(() => import('emoji-picker-react'));

// Wrap in Suspense where it's used
<React.Suspense fallback={<div>Loading...</div>}>
  <EmojiPicker ... />
</React.Suspense>
```
**File:** `src/components/ChatArea.jsx`

---

#### 6. Lazy Load Profile Images (Low Complexity, 3 min)
Add `loading="lazy"` to all `<img>` tags:
```jsx
// In MessageBubble.jsx and Sidebar.jsx
<img src={...} loading="lazy" className="..." />
```

---

### Low Impact - Polish (Only if bored)

#### 7. Memoize Message Text Formatting
**Currently:** Link regex runs on every message render
```jsx
const formattedText = useMemo(() => {
  if (!message.text) return '';
  const escaped = message.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" ...>$1</a>');
}, [message.text]);
```

#### 8. Add React.memo to More Components
```jsx
export default React.memo(Sidebar);
export default React.memo(SettingsModal);
```

#### 9. Optimize Sidebar Animations
Remove/reduce the shimmer effect on hover if it causes lag

---

## 📊 Expected Results

| Optimization | Impact | Effort |
|---|---|---|
| Split Context | 🟢 High | 🟠 Medium |
| Memoize lookups | 🟢 High | 🟢 Low |
| Debounce textarea | 🟡 Medium | 🟢 Low |
| Lazy load emoji | 🟡 Medium | 🟢 Low |
| Lazy load images | 🟡 Medium | 🟢 Low |
| Memoize text format | 🟡 Medium | 🟢 Low |
| More React.memo | 🟡 Medium | 🟢 Low |

---

## 🧪 Testing Checklist

After each optimization:
- [ ] Open a chat - no lag
- [ ] Scroll through messages - smooth
- [ ] Type in input - responsive
- [ ] Send message - appears quickly
- [ ] Switch between chats - no flash/delay
- [ ] Emoji picker opens - fast
- [ ] Sidebar updates - no jank

---

## 📝 Notes

- Start with **Context Splitting** for biggest impact
- Test after each change
- If something breaks, it's easily reversible
- Don't over-optimize - stop when it feels smooth
