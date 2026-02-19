# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**⚠️ IMPORTANT: Unless explicitly stated otherwise, all changes, features, and modifications discussed are for ONLINE MODE only, not LAN mode.**

## Project Overview

**Roundtable** is primarily an **internet-based end-to-end encrypted messenger** (think Signal/Telegram), built with:
- **Frontend**: React 19 + TailwindCSS (glassmorphic UI with aurora animations)
- **Backend**: Rust async runtime (Tokio) via Tauri — handles desktop integration only, NOT networking
- **Desktop Framework**: Tauri 2.0 (cross-platform desktop app)
- **Relay Server**: WebSocket server at `ws://129.154.231.157:8080` (configurable via localStorage `relayServerUrl`)
- **Key Features**: E2EE messaging, friends system, read receipts, profile pictures, message history, online presence

### How Online Mode Works
- Connects to a **WebSocket relay server** on startup, auto-reconnects every 5s on drop
- **Auth**: Users sign up/log in with username + password; server issues a `userId`
- **E2EE**: Keypairs are derived deterministically from username+password (ECDH). Messages encrypted with AES-GCM. The server routes but cannot decrypt messages
- **Friends system**: Send/accept/decline friend requests by username; friend list persisted server-side
- **Message history**: Stored on server + cached locally in IndexedDB (encrypted). Supports pagination
- **Presence**: Server broadcasts online/offline status to all users
- **Read receipts**: `message_delivery_confirmation` and `message_read_confirmation` from server
- **Profile pictures**: Base64-encoded, synced via server, cached in localStorage + IndexedDB

### Key Server Message Types
| Message | Purpose |
|---|---|
| `identify` | Register with server (username, public key, password) |
| `message` | Send encrypted chat message |
| `get_chat_history` | Fetch past messages with a user |
| `message_read` | Send read receipt |
| `send_friend_request` / `accept_friend_request` / `decline_friend_request` | Friend management |
| `get_friends_list` / `get_friend_requests` / `get_sent_friend_requests` | Fetch friend data |
| `update_profile_picture` | Upload profile picture |
| `user_logout` | Notify server of logout |

> **Note**: LAN/IPMSG mode exists as a secondary feature but is NOT the primary use case. The Rust backend handles LAN networking only; all online mode logic is in the React frontend.

## Development Commands

```bash
# Development setup
npm install

# Run development build with hot reload (Tauri dev mode)
npm run dev

# Build production executable
npm run build

# Vite-only development (frontend without Tauri, port 1420)
npm run vite:dev

# Vite-only production build
npm run vite:build

# Preview production build
npm run preview

# Direct Tauri CLI access
npm run tauri <command>
```

No automated tests are currently configured. Manual testing needed for network functionality and UI changes.

## Project Structure

```
roundtable/
├── src/                           # React frontend (19 components + hooks)
│   ├── App.jsx                   # Root app component with theme/layout management
│   ├── main.jsx                  # Vite entry point
│   ├── context/
│   │   └── AppContext.jsx        # Global state management (~600 lines)
│   ├── components/               # Main UI components
│   │   ├── Titlebar.jsx
│   │   ├── Sidebar.jsx           # User list & discovery (~1000 lines)
│   │   ├── ChatArea.jsx          # Message display & input (~1300 lines)
│   │   ├── MessageBubble.jsx     # Individual message rendering
│   │   ├── SettingsModal.jsx     # Profile & app settings
│   │   ├── NotificationContainer.jsx
│   │   └── Particles.jsx         # Background animation
│   ├── hooks/                    # Custom React hooks
│   │   ├── useTauriIntegration.js   # Tauri IPC & window management
│   │   ├── useOnlineMode.js       # Main network loop (~1300 lines)
│   │   ├── useNetwork.js          # WebSocket message parsing
│   │   ├── useProfilePictureSync.js
│   │   ├── useTaskbarBadge.js
│   │   └── useTheme.js
│   ├── utils/                    # Utility functions
│   │   ├── crypto.js            # ECDSA signing & key management
│   │   └── profilePictureCache.js
│   └── styles/                   # CSS files
│
├── src-tauri/                    # Rust backend (Tauri app)
│   ├── src/
│   │   └── main.rs              # Core networking logic (~1500 lines)
│   │       ├── UDP discovery (broadcast detection)
│   │       ├── Chunk management (large message fragmentation)
│   │       ├── Buffer pool (memory optimization)
│   │       ├── File transfer protocol
│   │       └── Session logging to disk
│   ├── Cargo.toml               # Rust dependencies (Tokio, serde, socket2)
│   └── tauri.conf.json          # Window & app configuration
│
├── index.html                   # Vite entry HTML
├── vite.config.js              # Vite configuration (React plugin, port 1420)
├── package.json                # Node.js dependencies & scripts
└── README.md                    # Project documentation
```

## Key Architecture Patterns

### Frontend-Backend Communication (Tauri IPC)
- **useOnlineMode.js** (~1300 lines): Main event loop managing the connection state
- **Commands sent to Rust**: Network operations, file operations
- **Events emitted from Rust**: User online/offline, messages received, file offers, transfer progress
- Look at `useTauriIntegration.js` for window/app-level Tauri integration

### Network Protocol
- **UDP Discovery (Port 2425)**: Broadcast queries for finding users, online/offline announcements
- **UDP Messages (Port 2426 dev / 2427 prod)**: Chat messages, file offers, acknowledgments
- **TCP File Transfer**: Dynamic ports, P2P direct streaming with progress tracking
- **Message Format**: JSON-based serialization with chunking for large payloads (>6KB split into 2KB chunks)

### Rust Backend (main.rs)
Key structures:
- **BufferPool**: Reuses allocated buffers to reduce GC pressure (~50 buffers)
- **ChunkManager**: Tracks message chunks and handles reassembly, includes deduplication
- **SocketManager**: Manages UDP/TCP sockets with error recovery
- **Global Registry**: `FILE_TRANSFERS` HashMap tracks ongoing file transfers

Important constants:
- `BUFFER_SIZE: 8192`, `CHUNK_SIZE: 2000`, `MAX_SINGLE_PACKET_SIZE: 6000`
- `CHUNK_TIMEOUT_SECS: 30` - incomplete chunks cleaned up after 30s
- `CLEANUP_INTERVAL_SECS: 60` - periodic cleanup of stale data

### Frontend State Management (AppContext)
Central Redux-like context in `src/context/AppContext.jsx`:
- **Users state**: Online users, statuses, metadata
- **Messages state**: Per-conversation message history
- **Settings state**: User profile, themes, preferences
- **UI state**: Active chat, modals, notifications

### Styling
- **TailwindCSS 3** with custom CSS (`src/styles/`)
- **Glassmorphic Design**: Frosted glass effects, aurora gradient animations, particle background
- **Theme System**: Aurora (animated gradient), Dark, Light modes with localStorage persistence
- **Layout**: Flexbox-based responsive layout with draggable sidebar resize

## Important Implementation Details

### Session Logging
- Conversations are automatically logged to disk:
  - **Windows**: `C:\Users\<Username>\Documents\RoundtableChat\`
  - **macOS/Linux**: `~/Documents/RoundtableChat/`
- File format: JSON with timestamps, usernames, and message content

### Profile Pictures
- Stored as **Base64 in localStorage** (profile data)
- Auto-resized to 96x96 pixels on upload
- Cache synced across app with `useProfilePictureSync.js`
- See `utils/profilePictureCache.js` for caching logic

### User Detection & Presence
- Automatic UDP broadcast queries on startup
- Periodic presence announcements every 30s
- Users marked offline after 60s of silence
- Manual refresh available in UI

### File Transfers
- **Accept/Reject Dialog**: User must accept before TCP connection
- **Unique Transfer IDs**: Prevents confusion between multiple transfers
- **Auto-Download Option**: Can accept all file offers automatically
- **Progress Tracking**: Real-time upload/download percentage

### Keyboard & Accessibility
- Context menus for messages (reply, copy, delete)
- Resizable components with mouse drag
- Keyboard shortcuts supported in settings
- TailwindCSS accessibility defaults

### Common Debugging Tasks

**To understand message flow:**
1. Start in `useOnlineMode.js` - tracks all incoming events
2. Dispatch actions to AppContext for state updates
3. Components subscribe to context changes and re-render
4. Rust backend (main.rs) handles actual network I/O

**To add network features:**
1. Define message type in Rust (enum in main.rs)
2. Serialize/deserialize with serde
3. Emit from Rust, listen in `useOnlineMode.js`
4. Update AppContext and trigger UI updates

**To modify UI styling:**
- Check `src/styles/` for custom CSS (animations, glassmorphic effects)
- TailwindCSS classes in JSX files
- Theme variables in localStorage (theme, windowOpacity, etc.)

## Build & Deployment

- **Development build**: Runs Tauri dev with hot reload
- **Production build**: Creates Windows MSI, macOS DMG, or Linux packages via `npm run build`
- **Artifacts location after build**: `src-tauri/target/release/bundle/`

## Technology Stack Reference

| Component | Technology | Version |
|-----------|-----------|---------|
| Desktop Framework | Tauri | 2.0 |
| Frontend Framework | React | 19.2.4 |
| Styling | TailwindCSS | 3.x |
| Backend Runtime | Tokio | 1.x |
| Serialization | serde + serde_json | 1.0 |
| Build Tool | Vite | 7.x |
| Networking | socket2 | 0.5 |

