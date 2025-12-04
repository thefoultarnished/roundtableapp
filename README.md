<div align="center">

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██████╗  ██████╗ ██╗   ██╗███╗   ██╗██████╗             ║
║   ██╔══██╗██╔═══██╗██║   ██║████╗  ██║██╔══██╗            ║
║   ██████╔╝██║   ██║██║   ██║██╔██╗ ██║██║  ██║            ║
║   ██╔══██╗██║   ██║██║   ██║██║╚██╗██║██║  ██║            ║
║   ██║  ██║╚██████╔╝╚██████╔╝██║ ╚████║██████╔╝            ║
║   ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═════╝             ║
║                                                           ║
║   ████████╗ █████╗ ██████╗ ██╗     ███████╗               ║
║   ╚══██╔══╝██╔══██╗██╔══██╗██║     ██╔════╝               ║
║      ██║   ███████║██████╔╝██║     █████╗                 ║
║      ██║   ██╔══██║██╔══██╗██║     ██╔══╝                 ║
║      ██║   ██║  ██║██████╔╝███████╗███████╗               ║
║      ╚═╝   ╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝               ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

### 🌐 **Modern P2P LAN Messenger**  
*IPMSG Reimagined for the Modern Era*

[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-Latest-orange?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](#license)

**Zero-Configuration • Peer-to-Peer • Glassmorphic UI • Real-Time File Sharing**

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Architecture](#-architecture) • [Contributing](#-contributing)

---

</div>

## 📖 **Overview**

### **Born from Frustration, Built with Passion**

While using **IP Messenger (IPMSG)** at work, I grew tired of its dated interface and frustrating limitations—poor media handling, limited chat history, and a UI that looked stuck in the 90s. So I decided to build something better. Something modern. Something beautiful.

**Roundtable** is a cutting-edge, peer-to-peer local area network messenger that brings instant messaging to isolated networks without internet dependency. Named after the **Roundtable Hold** from *Elden Ring*—a sanctuary where warriors gather to strategize and connect—this app embodies the same spirit: *a place to meet, communicate, and collaborate.*

Built with security, performance, and aesthetics in mind, it's perfect for:

- 🏢 **Corporate Networks** - Secure internal communication without cloud dependency
- 🎓 **Educational Institutions** - Classrooms and campus-wide messaging
- 🏠 **Home Networks** - Family communication and file sharing
- 🛡️ **Air-Gapped Environments** - High-security isolated networks
- 🎮 **LAN Parties** - Quick coordination during gaming sessions becuase Discord eats up all my RAM

Inspired by the legendary **IPMSG Protocol** but rebuilt from the ground up with a stunning glassmorphic interface, persistent chat history, rich media support, and cutting-edge performance optimizations powered by Rust and Tauri.

---

## ✨ **Features**

### 🌐 **Network & Communication**

<table>
<tr>
<td width="50%">

#### **Zero-Configuration Discovery**
- 🔍 Automatic UDP broadcast peer detection
- 🚀 Instant network presence announcement
- 🔄 Real-time user online/offline tracking
- 📡 Dual-socket architecture for reliability

</td>
<td width="50%">

#### **Smart Messaging**
- 💬 Instant message delivery
- 📦 Chunked protocol for large messages
- 🎯 Quote & reply functionality
- ⚡ Sub-millisecond latency on LAN

</td>
</tr>
<tr>
<td>

#### **File Transfer System**
- 📁 Direct P2P file sharing via TCP
- 📊 Real-time progress tracking
- ✅ Accept/reject file offers
- 🔐 Unique transfer ID system
- 💾 Auto-save or manual download

</td>
<td>

#### **Session Management**
- 📝 Automatic conversation logging
- 🕐 Timestamp tracking
- 👥 Participant history
- 💬 Message persistence across sessions

</td>
</tr>
</table>

### 🎨 **User Interface & Experience**

<table>
<tr>
<td width="50%">

#### **Glassmorphic Design**
- ✨ Modern frosted-glass UI elements
- 🌓 Seamless dark/light theme switching
- 🎭 Animated particle background
- 🌈 Dynamic gradient animations
- 🎨 Custom color themes

</td>
<td width="50%">

#### **Smart Notifications**
- 🔔 Beautiful in-app glassmorphic alerts
- 🔕 System notifications when minimized
- 📬 Unread message badges
- 🎵 Visual-only (silent) notifications
- ⚡ Instant notification on new messages

</td>
</tr>
<tr>
<td>

#### **Customization**
- 👤 Custom display names & usernames
- 🖼️ Profile picture uploads (Base64)
- 🔤 Adjustable font size (50%-200%)
- 🎯 Resizable sidebar layout
- 🔍 User search & filtering

</td>
<td>

#### **Responsive Design**
- 📱 Adaptive to different window sizes
- ⌨️ Keyboard shortcuts support
- 🖱️ Context menus for messages
- ↔️ Draggable resize handles
- 🎯 Auto-scaling text areas

</td>
</tr>
</table>

### ⚡ **Performance & Optimization**

- 🏎️ **Buffer Pool System** - Reusable memory buffers for zero-allocation networking
- 🧩 **Chunk Management** - Efficient reassembly of fragmented messages
- 🔒 **Thread-Safe Design** - Arc, Mutex, and RwLock for concurrent operations
- 🚀 **Async Runtime** - Tokio-powered non-blocking I/O
- 🎯 **Message Deduplication** - Prevents duplicate message processing
- 🧹 **Auto Cleanup** - Periodic removal of stale chunks (60s intervals)

---

## 🏗️ **Architecture**

### **System Design**

```
┌─────────────────────────────────────────────────────────────┐
│                    ROUNDTABLE ARCHITECTURE                  │
└─────────────────────────────────────────────────────────────┘

   ┌──────────────────────┐         ┌──────────────────────┐
   │   Frontend (Tauri)   │◄───────►│   Backend (Rust)     │
   │                      │  IPC    │                      │
   │ • Vanilla JavaScript │         │ • Tokio Async        │
   │ • TailwindCSS        │         │ • UDP/TCP Sockets    │
   │ • Glassmorphic UI    │         │ • Event Emitters     │
   │ • Event Listeners    │         │ • Buffer Pools       │
   └──────────────────────┘         └──────────────────────┘
              │                                │
              │                                │
              ▼                                ▼
┌────────────────────────────────────────────────────────────┐
│                      NETWORK LAYER                         │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  UDP Discovery (Port 2425)      UDP Messages (2426/2427)   │
│  ┌────────────────────┐          ┌──────────────────┐      │
│  │ • User Online      │          │ • Text Messages  │      │
│  │ • User Offline     │          │ • Chunked Data   │      │
│  │ • Discovery Query  │          │ • File Offers    │      │
│  │ • Presence Response│          │ • File Accept/   │      │
│  └────────────────────┘          │   Reject         │      │
│                                  └──────────────────┘      │
│                                                            │
│           TCP File Transfer (Dynamic Ports)                │
│        ┌──────────────────────────────────────┐            │
│        │ • Direct P2P file streaming          │            │
│        │ • Progress tracking                  │            │
│        │ • Unique transfer IDs                │            │
│        └──────────────────────────────────────┘            │
└────────────────────────────────────────────────────────────┘
```

### **Message Flow Diagram**

```
User A                Network              User B
  │                     │                     │
  ├───[1] Send Message─►│                     │
  │                     ├──[2] Broadcast UDP─►│
  │                     │                     ├─[3] Receive
  │                     │                     ├─[4] Emit Event
  │                     │                     ├─[5] UI Update
  │                     │◄─[6] ACK (implicit) ┤
  │                     │                     │
  ├─ ─[7] File Offer───►│──────Broadcast─────►│
  │                     │                     ├─[8] Show Dialog
  │◄──[9] Accept────────┤◄────────────────────┤
  ├───[10] TCP Server───┤                     │
  │                     │─[11] TransferReady─►│
  │◄──[12] TCP Connect────────────────────────┤
  ├───[13] File Stream─►│────────────────────►│
  │                     │    [Progress]       │
  ├───[14] Complete─────┤────────────────────►│
  ▼                     ▼                     ▼
```

### **Tech Stack**

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Tauri v2 | Cross-platform desktop app framework |
| **Backend** | Rust (Edition 2021) | High-performance async networking |
| **Frontend** | Vanilla JavaScript (ES6+) | UI logic and event handling |
| **Styling** | TailwindCSS 3.x | Utility-first CSS framework |
| **Fonts** | Lexend, Roboto Mono | Modern, readable typography |
| **Runtime** | Tokio | Asynchronous runtime for Rust |
| **Networking** | socket2, UdpSocket, TcpListener | Low-level socket programming |
| **Serialization** | serde, serde_json | Message encoding/decoding |

---

## 📦 **Installation**

### **Prerequisites**

Before you begin, ensure you have:

- **Rust** (latest stable) - [Install via rustup](https://rustup.rs/)
- **Node.js** v16+ - [Download here](https://nodejs.org/)
- **npm** or **pnpm** - Comes with Node.js

### **Build from Source**

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/roundtable.git
cd roundtable

# 2. Install JavaScript dependencies
npm install
# or
pnpm install

# 3. Run in development mode
npm run dev

# 4. Build for production
npm run build
```

### **Installing the Built Application**

After building, the installer will be located at:

- **Windows**: `src-tauri/target/release/bundle/msi/Roundtable_0.1.0_x64_en-US.msi`
- **macOS**: `src-tauri/target/release/bundle/dmg/Roundtable_0.1.0_x64.dmg`
- **Linux**: `src-tauri/target/release/bundle/deb/roundtable_0.1.0_amd64.deb` or `.AppImage`

---

## **Usage**

### **Getting Started**

1. **Launch Roundtable** on multiple computers in the same local network
2. **Automatic Discovery** - Users will appear in the sidebar automatically
3. **Start Chatting** - Click on any user to open a conversation
4. **Send Files** - Use the 📎 attachment button to transfer files
5. **Customize** - Click the ⚙️ settings icon to personalize your profile

### **Network Requirements**

- All devices must be on the **same subnet** (e.g., 192.168.1.x)
- **Firewall ports** must allow:
  - UDP 2425 (discovery)
  - UDP 2426 or 2427 (messages)
  - Dynamic TCP ports (file transfers)

### **Settings & Customization**

1. Click the **gear icon** (⚙️) in the bottom-left sidebar
2. Configure:
   - **Username** - Your unique identifier
   - **Display Name** - How others see you
   - **Profile Picture** - Upload an image (auto-resized to 96x96)
   - **Font Size** - Adjust from 50% to 200%
   - **Auto-Download Files** - Toggle automatic file acceptance

---

## 🔧 **Development**

### **Project Structure**

```
roundtable/
├── 📁 src/                      # Frontend source files
│   ├── 📄 index.html           # Main HTML structure
│   ├── 📄 script.js            # Application logic (~3000 lines)
│   ├── 📄 main.js              # Tauri integration
│   ├── 📄 notifications.js     # Notification system
│   ├── 📄 styles.css           # Custom styles (~1500 lines)
│   └── 📁 assets/              # Images and static files
│       └── 🖼️ roundtable.jpg   # Welcome screen background
│
├── 📁 src-tauri/               # Rust backend
│   ├── 📁 src/
│   │   ├── 📄 main.rs          # Core application logic (~1560 lines)
│   │   └── 📄 lib.rs           # Library exports
│   ├── 📁 icons/               # Application icons
│   ├── 📄 Cargo.toml           # Rust dependencies
│   ├── 📄 tauri.conf.json      # Tauri configuration
│   └── 📄 build.rs             # Build script
│
├── 📄 package.json             # Node.js dependencies
├── 📄 .gitignore               # Git ignore rules
└── 📄 README.md                # This file
```


### **Configuration**

**Network Ports** (`src-tauri/src/main.rs`):
```rust
const DISCOVERY_PORT: u16 = 2425;  // UDP broadcast
const MSG_PORT: u16 = 2426;        // Dev mode
const MSG_PORT: u16 = 2427;        // Production
```

---

## 🌐 **Network Protocol**

### **Message Types**

```rust
enum DiscoveryMessage {
    Online(User),              // User joined network
    Offline(User),             // User left network
    Response(User),            // Response to discovery query
    Query,                     // Request user list
    Message { ... },           // Single-packet message
    ChunkedMessage { ... },    // Multi-packet message
    FileOffer { ... },         // File transfer request
    FileAccept { ... },        // Accept file transfer
    FileReject { ... },        // Reject file transfer
    TransferReady { ... },     // TCP server ready
}
```

### **User Discovery Flow**

1. **Application Start** → Send `Query` message (UDP broadcast)
2. **Receive Query** → Respond with `Online(User)` message
3. **Periodic Broadcast** → Announce presence every 30s
4. **Status Monitoring** → Mark users offline after 60s silence
5. **Manual Refresh** → User clicks refresh button

### **Message Chunking Algorithm**

For messages exceeding 6KB:

```
1. Split message into 2KB chunks
2. Generate unique chunk_id (sender_id-target_id-random)
3. Send each chunk with:
   - chunk_index (0-based)
   - total_chunks (e.g., 5)
   - content (2KB fragment)
4. Receiver reassembles when all chunks received
5. Auto-cleanup incomplete chunks after 30s
```

---

## 📊 **Session Logging**

Roundtable automatically logs conversations to:

**Windows**: `C:\Users\<Username>\Documents\RoundtableChat\`  
**macOS**: `~/Documents/RoundtableChat/`  
**Linux**: `~/Documents/RoundtableChat/`

---

## 🤝 **Contributing**

We welcome contributions! Here's how you can help:

### **Ways to Contribute**

- 🐛 **Report Bugs** - Open an issue with detailed reproduction steps
- 💡 **Suggest Features** - Share your ideas for improvements
- 📝 **Improve Docs** - Help make the documentation clearer
- 🎨 **Design** - Contribute UI/UX improvements
- 💻 **Code** - Submit pull requests for features or fixes

### **Development Workflow**

```bash
# 1. Fork the repository
# 2. Create a feature branch
git checkout -b feature/amazing-feature

# 3. Make your changes
# ... code code code ...

# 4. Commit with descriptive messages
git commit -m "Add amazing feature: detailed description"

# 5. Push to your fork
git push origin feature/amazing-feature

# 6. Open a Pull Request
```

### **Code Guidelines**

- **Rust**: Follow [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- **JavaScript**: Use ES6+ features, avoid `var`
- **Formatting**: Run `cargo fmt` for Rust, Prettier for JS
- **Comments**: Document complex logic and public APIs
- **Testing**: Add tests for new features


---

## 🐛 **Known Issues & Limitations**

- ⚠️ **Cross-Subnet Discovery** - Discovery limited to same subnet (broadcast limitation)
- 🔒 **Encryption** - Messages are not encrypted (use on trusted networks only)
- 📁 **Large Files** - Very large files (>1GB) may experience timeouts
- 🪟 **Window State** - First-run window position may vary
- 🔄 **Auto-Reconnect** - Manual refresh needed if network changes


---

## 🙏 **Acknowledgments**

- **Inspired by** [IP Messenger (IPMSG)](https://ipmsg.org/) by Shirouzu Hiroaki
- **Built with** [Tauri](https://tauri.app/) - The future of desktop apps
- **Powered by** [Rust](https://www.rust-lang.org/) - Fearless concurrency
- **UI Framework** [TailwindCSS](https://tailwindcss.com/) - Utility-first CSS
- **Async Runtime** [Tokio](https://tokio.rs/) - Reliable, asynchronous Rust

---

<div align="center">

### ⭐ **Star this repo if you find it useful!** ⭐

**Made with ❤️ by [d.veloper](https://github.com/yourusername)**