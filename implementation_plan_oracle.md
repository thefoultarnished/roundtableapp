# Online Mode Implementation Plan (Oracle VM)

This plan details the steps to deploy the Relay Server to your Oracle Free Tier VM and update the Roundtable application to support secure Online Mode.

## Phase 1: Oracle VM Setup & Deployment
**Objective:** Host the Node.js Relay Server on the Cloud.

1.  **Prepare the VM**
    *   Connect to your VM via SSH.
    *   Install Node.js (v18+ recommended):
        ```bash
        sudo dnf module install nodejs:18 -y  # Oracle Linux
        # OR
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs # Ubuntu
        ```
    *   Install Process Manager (PM2) to keep server running:
        ```bash
        sudo npm install -g pm2
        ```

2.  **Deploy Code**
    *   SFTP/SCP the `server/` directory from your project to the VM (e.g., `/home/opc/roundtable-server`).
    *   Install dependencies:
        ```bash
        cd ~/roundtable-server
        npm install
        ```
    *   Start the server:
        ```bash
        pm2 start server.js --name roundtable-relay
        pm2 save
        pm2 startup
        ```

3.  **Network Configuration**
    *   **VM Firewall (OS Level)**: Open port 8080 (or your chosen port).
        ```bash
        sudo firewall-cmd --permanent --zone=public --add-port=8080/tcp
        sudo firewall-cmd --reload
        ```
    *   **Oracle Cloud Console (Security List)**:
        *   Go to VCN > Subnet > Security List.
        *   Add Ingress Rule: Source `0.0.0.0/0`, Protocol `TCP`, Destination Port `8080`.

## Phase 2: Client-Side Cryptography (E2EE)
**Objective:** Implement End-to-End Encryption so the Relay Server cannot read messages.

1.  **Create `src/utils/crypto.js`**
    *   Implement `generateKeyPair()` using `window.crypto.subtle` (ECDH P-256).
    *   Implement `deriveSharedKey(remotePublicKey)` (AES-GCM).
    *   Implement `encryptMessage(text, sharedKey)` and `decryptMessage(iv, cipher, sharedKey)`.
    *   Store specific keys in `localStorage` (or IndexedDB) for persistence.

## Phase 3: Online Mode Integration (Frontend)
**Objective:** Connect the React app to the Relay Server.

1.  **Create `src/hooks/useOnlineMode.js`**
    *   **WebSocket Logic**:
        *   Connect to `ws://<VM_IP>:8080`.
        *   Send `identify` payload with User ID and Public Key on connect.
        *   Listen for `user_list` to update `activeUsers` in AppContext.
        *   Listen for `message` to decrypt and dispatch to AppContext.
    *   **State Integration**:
        *   Hook should return `sendMessageOnline(targetId, content)`.
        *   Expose `isOnline` status.

2.  **Update `src/components/SettingsModal.jsx`**
    *   Add a **"Connection Mode"** toggle (LAN / Online).
    *   Add an **"Online Server URL"** input field (default to your VM IP).
    *   Save these to `localStorage`.

3.  **Update `src/hooks/useNetwork.js`**
    *   Modify `sendMessage` to check the current mode.
    *   If `Online`: call `sendMessageOnline`.
    *   If `LAN`: call `tauri.invoke('send_message')`.

## Phase 4: Testing
1.  Start the Server on VM.
2.  Open App on Machine A (Online Mode).
3.  Open App on Machine B (Online Mode).
4.  Verify they see each other in the user list.
5.  Send a message -> Verify encryption logs (if enabled) and successful decryption.

---

**Next Steps:**
Shall I proceed with **Phase 2 (Crypto Implementation)** and **Phase 3 (Hook Creation)** now?
