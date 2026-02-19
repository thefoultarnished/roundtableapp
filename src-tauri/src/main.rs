#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use socket2::{Domain, Socket, Type};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::UdpSocket;
use tokio::sync::RwLock;
use tokio::time::sleep;
use std::collections::HashSet;
use std::fs::OpenOptions;
use std::io::Write;
use chrono::{DateTime, Local};
use once_cell::sync::Lazy;

const DISCOVERY_PORT: u16 = 2425;
const BUFFER_SIZE: usize = 8192;
const CHUNK_SIZE: usize = 2000;
const CHUNK_TIMEOUT_SECS: u64 = 30;
const CLEANUP_INTERVAL_SECS: u64 = 60;
const CHUNK_SEND_DELAY_MS: u64 = 10;
const MAX_SINGLE_PACKET_SIZE: usize = 6000;
const BUFFER_POOL_SIZE: usize = 50;

#[cfg(debug_assertions)]
const MSG_PORT: u16 = 2426;

#[cfg(not(debug_assertions))]
const MSG_PORT: u16 = 2427;

// Global file transfer registry
static FILE_TRANSFERS: Lazy<Mutex<HashMap<String, String>>> = Lazy::new(|| {
    Mutex::new(HashMap::new())
});


#[derive(Debug)]
#[allow(dead_code)]
enum MessageError {
    SerializationError(serde_json::Error),
    NetworkError(std::io::Error),
    InvalidData(String),
}

impl std::fmt::Display for MessageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MessageError::SerializationError(e) => write!(f, "Serialization error: {}", e),
            MessageError::NetworkError(e) => write!(f, "Network error: {}", e),
            MessageError::InvalidData(s) => write!(f, "Invalid data: {}", s),
        }
    }
}

impl std::error::Error for MessageError {}

// Optimized buffer pool // might update later for better memory management
struct BufferPool {
    buffers: Arc<Mutex<Vec<Vec<u8>>>>,
    max_size: usize,
}

impl BufferPool {
    fn new(max_size: usize) -> Self {
        Self {
            buffers: Arc::new(Mutex::new(Vec::with_capacity(max_size))),
            max_size,
        }
    }

    fn get_buffer(&self) -> Vec<u8> {
        self.buffers
            .lock()
            .unwrap()
            .pop()
            .unwrap_or_else(|| Vec::with_capacity(BUFFER_SIZE))
    }
    
    fn return_buffer(&self, mut buf: Vec<u8>) {
        if buf.capacity() >= BUFFER_SIZE {
            buf.clear();
            buf.resize(BUFFER_SIZE, 0);
            
            let mut buffers = self.buffers.lock().unwrap();
            if buffers.len() < self.max_size {
                buffers.push(buf);
            }
        }
    }
}

// Improved chunk management 
#[derive(Debug, Clone)]
struct ChunkData {
    content: String,
    timestamp: Instant,
}

struct ChunkManager {
    chunks: Arc<RwLock<HashMap<String, HashMap<u16, ChunkData>>>>,
    processed_messages: Arc<RwLock<HashSet<String>>>,
}

impl ChunkManager {
    fn new() -> Self {
        Self {
            chunks: Arc::new(RwLock::new(HashMap::new())),
            processed_messages: Arc::new(RwLock::new(HashSet::new())),
        }
    }

    async fn cleanup_old_chunks(&self) {
        let now = Instant::now();
        let timeout = Duration::from_secs(CHUNK_TIMEOUT_SECS);
        
        let mut chunks = self.chunks.write().await;
        chunks.retain(|_, message_chunks| {
            message_chunks.retain(|_, chunk_data| {
                now.duration_since(chunk_data.timestamp) < timeout
            });
            !message_chunks.is_empty()
        });
    }

    async fn is_processed(&self, message_id: &str) -> bool {
        self.processed_messages.read().await.contains(message_id)
    }

    async fn mark_processed(&self, message_id: String) {
        self.processed_messages.write().await.insert(message_id);
    }
}

// Socket management
pub struct SocketManager {
    pub message_socket: Arc<UdpSocket>,
    pub discovery_socket: Option<Arc<UdpSocket>>,
    buffer_pool: BufferPool,
    chunk_manager: ChunkManager,
}

impl SocketManager {
    fn new(message_socket: Arc<UdpSocket>, discovery_socket: Option<Arc<UdpSocket>>) -> Self {
        Self {
            message_socket,
            discovery_socket,
            buffer_pool: BufferPool::new(BUFFER_POOL_SIZE),
            chunk_manager: ChunkManager::new(),
        }
    }
}

// User data structure
#[derive(Serialize, Deserialize, Debug, Clone)]
struct User {
    id: u64,
    name: String,
    username: String,
    ip: String,
    port: u16,
    profile_picture: Option<String>,
    hostname: Option<String>,
}

impl User {
    fn validate(&self) -> Result<(), MessageError> {
        if self.name.is_empty() {
            return Err(MessageError::InvalidData("Username cannot be empty".to_string()));
        }
        if self.name.len() > 100 {
            return Err(MessageError::InvalidData("Username too long".to_string()));
        }
        Ok(())
    }
}

// Improved message types 
#[derive(Serialize, Deserialize, Debug, Clone)]
enum DiscoveryMessage {
    Online(User),
    Offline(User),
    Response(User),
    Query,
    Message {
        content: String,
        sender: String,
        sender_id: u64,
        target_id: u64,
        sender_port: u16,
        timestamp: u64,
    },
    ChunkedMessage {
        chunk_id: String,
        chunk_index: u16,
        total_chunks: u16,
        content: String,
        sender: String,
        sender_id: u64,
        target_id: u64,
        sender_port: u16,
        timestamp: u64,
    },
    FileOffer {
        sender: User,
        file_name: String,
        file_size: u64,
        transfer_id: String,
    },
    FileAccept {
        receiver: User,
        transfer_id: String,
    },
    FileReject {
        transfer_id: String,
    },
    TransferReady {
        transfer_id: String,
        tcp_port: u16,
    },
}

impl DiscoveryMessage {
    fn validate(&self) -> Result<(), MessageError> {
        match self {
            DiscoveryMessage::Online(user) | 
            DiscoveryMessage::Offline(user) | 
            DiscoveryMessage::Response(user) => user.validate(),

            DiscoveryMessage::Message { content, sender, .. } => {
                if content.len() > 100_000 {
                    return Err(MessageError::InvalidData("Message too long".to_string()));
                }
                if sender.is_empty() {
                    return Err(MessageError::InvalidData("Sender name required".to_string()));
                }
                Ok(())
            },

            DiscoveryMessage::ChunkedMessage { content, sender, total_chunks, .. } => {
                if content.len() > CHUNK_SIZE {
                    return Err(MessageError::InvalidData("Chunk too large".to_string()));
                }
                if sender.is_empty() {
                    return Err(MessageError::InvalidData("Sender name required".to_string()));
                }
                if *total_chunks == 0 || *total_chunks > 1000 {
                    return Err(MessageError::InvalidData("Invalid chunk count".to_string()));
                }
                Ok(())
            },

            DiscoveryMessage::FileOffer { file_name, .. } => {
                if file_name.is_empty() {
                    return Err(MessageError::InvalidData("File name cannot be empty".to_string()));
                }
                Ok(())
            },
            DiscoveryMessage::FileAccept { .. } => Ok(()),
            DiscoveryMessage::FileReject { .. } => Ok(()),
            DiscoveryMessage::TransferReady { .. } => Ok(()),
            DiscoveryMessage::Query => Ok(()),
        }
    }
}

#[tauri::command]
fn set_acrylic_effect(window: tauri::Window, enable: bool) {
    use tauri::window::{Color, Effect, EffectState, EffectsBuilder};
    if enable {
        let effects = EffectsBuilder::new()
            .effect(Effect::Acrylic)
            .state(EffectState::Active)
            .color(Color(0, 0, 0, 50))
            .build();
        let _ = window.set_effects(effects);
    } else {
        let _ = window.set_effects(None);
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Force no decorations at the OS level before window is shown
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_decorations(false);
            }

            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                if let Err(e) = setup_networking(app_handle).await {
                    eprintln!("Failed to setup networking: {}", e);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            broadcast_offline,
            send_message,
            test_emit,
            broadcast_user_presence,
            echo_test,
            log_message,
            log_session_start,
            log_chat_participants,
            broadcast_discovery_query,
            initiate_file_offer,
    respond_to_file_offer,
    start_file_transfer,
    download_file,
    set_acrylic_effect
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


#[tauri::command]
async fn broadcast_discovery_query(state: State<'_, Arc<SocketManager>>) -> Result<(), String> {
    println!("Broadcasting Discovery");
    let query_message = DiscoveryMessage::Query;
    broadcast_message(&state, &query_message).await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn setup_networking(app_handle: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let socket_manager = if DISCOVERY_PORT == MSG_PORT {
        println!("Dev mode: Using single socket on port {}", MSG_PORT);
        
        let socket = create_socket(MSG_PORT)?;
        let socket_arc = Arc::new(socket);
        
        SocketManager::new(socket_arc.clone(), None)
    } else {
        println!("Release mode: Using discovery port {} and message port {}", DISCOVERY_PORT, MSG_PORT);

        let discovery_socket = Arc::new(create_socket(DISCOVERY_PORT)?);
        let message_socket = Arc::new(create_socket(MSG_PORT)?);
        
        SocketManager::new(message_socket, Some(discovery_socket))
    };

    let socket_manager_arc = Arc::new(socket_manager);
    app_handle.manage(socket_manager_arc.clone());

    start_cleanup_task(socket_manager_arc.clone()).await;

    start_socket_listeners(app_handle, socket_manager_arc).await;

    Ok(())
}

async fn start_cleanup_task(socket_manager: Arc<SocketManager>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(CLEANUP_INTERVAL_SECS));
        loop {
            interval.tick().await;
            socket_manager.chunk_manager.cleanup_old_chunks().await;
        }
    });
}

async fn start_socket_listeners(app_handle: AppHandle, socket_manager: Arc<SocketManager>) {
    if let Some(discovery_socket) = &socket_manager.discovery_socket {
        let discovery_handle = app_handle.clone();
        let discovery_socket_clone = discovery_socket.clone();
        let socket_manager_clone = socket_manager.clone();
        
        tokio::spawn(async move {
            socket_listener(discovery_handle, discovery_socket_clone, socket_manager_clone, true).await;
        });
    }

    let msg_handle = app_handle.clone();
    let msg_socket_clone = socket_manager.message_socket.clone();
    let socket_manager_clone = socket_manager.clone();
    
    tokio::spawn(async move {
        socket_listener(msg_handle, msg_socket_clone, socket_manager_clone, false).await;
    });
}

async fn socket_listener(
    app_handle: AppHandle,
    socket: Arc<UdpSocket>,
    socket_manager: Arc<SocketManager>,
    is_discovery_only: bool,
) {
    loop {
        let buffer = socket_manager.buffer_pool.get_buffer();
        let mut buf = buffer;
        buf.resize(BUFFER_SIZE, 0);
        
        match socket.recv_from(&mut buf).await {
            Ok((len, addr)) => {
                let data = buf[..len].to_vec();
                let app_clone = app_handle.clone();
                let socket_manager_clone = socket_manager.clone();
                
                // Handling message in separate task to avoid blocking
                tokio::spawn(async move {
                    handle_message(app_clone, socket_manager_clone, &data, addr, is_discovery_only).await;
                });
                
                socket_manager.buffer_pool.return_buffer(buf);
            }
            Err(e) => {
                eprintln!(" Socket receive error: {}", e);
                socket_manager.buffer_pool.return_buffer(buf);
                sleep(Duration::from_millis(100)).await;
            }
        }
    }
}

// message handling 
async fn handle_message(
    app: AppHandle,
    socket_manager: Arc<SocketManager>,
    data: &[u8],
    addr: SocketAddr,
    is_discovery_only: bool,
) {
    println!("Received message from {} on {} socket", addr, 
             if is_discovery_only { "discovery" } else { "message" });
    
    let message = match serde_json::from_slice::<DiscoveryMessage>(data) {
        Ok(msg) => msg,
        Err(e) => {
            eprintln!("Failed to deserialize message from {}: {}", addr, e);
            return;
        }
    };

    // logginf for file transfer messages
    match &message {
        DiscoveryMessage::FileOffer { transfer_id, .. } => {
            println!("File offer message, transfer ID: {}", transfer_id);
        },
        DiscoveryMessage::FileAccept { transfer_id, .. } => {
            println!("File accept message, transfer ID: {}", transfer_id);
        },
        DiscoveryMessage::TransferReady { transfer_id, tcp_port } => {
            println!("Transfer ready message, transfer ID: {}, TCP port: {}", transfer_id, tcp_port);
        },
        _ => {}
    }

    if let Err(e) = message.validate() {
        eprintln!("Invalid message received: {}", e);
        return;
    }

    let main_window = match app.get_webview_window("main") {
        Some(window) => window,
        None => {
            eprintln!("Main window not found");
            return;
        }
    };

    match message {
        DiscoveryMessage::Online(mut user) => {
            user.ip = addr.ip().to_string();
            println!("{} ({}:{})", user.name, user.ip, user.port);
            let _ = main_window.emit("user-online", user);
        }
        
        DiscoveryMessage::Response(mut user) => {
            user.ip = addr.ip().to_string();
            println!("User response: {} ({})", user.name, user.ip);
            let _ = main_window.emit("user-online", user);
        }

        DiscoveryMessage::Offline(user) => {
            println!("User offline: {}", user.name);
            let _ = main_window.emit("user-offline", user);
        }

        DiscoveryMessage::Query => {
            println!("Received Discovery from : {}", addr);
            let _ = main_window.emit("discovery-query-received", ());
        }

        DiscoveryMessage::Message { content, sender, sender_id, target_id, sender_port, timestamp } => {
            if is_discovery_only {
                return;     
            }
            
            let message_id = format!("{}-{}-{}", sender_id, target_id, timestamp);
            if socket_manager.chunk_manager.is_processed(&message_id).await {
                return; 
            }
            
            println!("Message from {} ({}): {} chars", sender, addr.ip(), content.len());
            socket_manager.chunk_manager.mark_processed(message_id).await;
            emit_complete_message(&main_window, content, sender, sender_id, target_id, sender_port, addr);
        }

        DiscoveryMessage::ChunkedMessage { 
            chunk_id, chunk_index, total_chunks, content, sender, sender_id, target_id, sender_port, timestamp: _
        } => {
            if is_discovery_only {
                return;     
            }
            
            println!("Chunk {}/{} received for message {}", chunk_index + 1, total_chunks, chunk_id);
            
            let complete_message = reassemble_chunks(
                &socket_manager,
                chunk_id.clone(),
                chunk_index,
                total_chunks,
                content,
            ).await;

            if let Some(complete) = complete_message {
                println!("Complete message reassembled: {} chars", complete.len());
                emit_complete_message(&main_window, complete, sender, sender_id, target_id, sender_port, addr);
            }
        }


      DiscoveryMessage::FileOffer {
    sender,
    file_name,
    file_size,
    transfer_id,
} => {
    println!(
        "Received file offer for '{}' from {} ({})",
        file_name, sender.name, addr
    );
    let mut updated_sender = sender;
    updated_sender.ip = addr.ip().to_string();

    // payload for the frontend 
    let payload = serde_json::json!({
        "sender": updated_sender,
        "fileName": file_name,
        "fileSize": file_size,
        "transferId": transfer_id,
    });

    if let Err(e) = main_window.emit("file-offer-received", payload) {
        eprintln!("Failed to emit file-offer-received event: {}", e);
    }
}



DiscoveryMessage::FileAccept { receiver, transfer_id } => {
    println!("Received file accept ID : {}", transfer_id);
    
    if !FILE_TRANSFERS.lock().unwrap().contains_key(&transfer_id) {
        return; 
    }
    
    let actual_sender_ip = addr.ip().to_string();
     println!("SENDER IP : {}", actual_sender_ip);

     let accepter_port = receiver.port;
    
    let mut updated_receiver = receiver;
    updated_receiver.ip = actual_sender_ip.clone();
    
    let payload = serde_json::json!({
        "transferId": transfer_id,
        "receiver": updated_receiver,
    });

    if let Err(e) = main_window.emit("file-transfer-accepted", payload) {
        eprintln!("Failed to emit file-transfer-accepted event: {}", e);
    }
    
    let tcp_port = get_available_tcp_port().unwrap_or(0);
    
    // Start a TCP server for the file transfer
    if tcp_port > 0 {
        let transfer_id_clone = transfer_id.clone();
        let app_handle_clone = app.clone();
        
        tokio::spawn(async move {
            if let Err(e) = setup_file_transfer_server(transfer_id_clone, tcp_port, app_handle_clone).await {
                eprintln!("Failed to setup file transfer server: {}", e);
            }
        });
        
        let ready_message = DiscoveryMessage::TransferReady {
            transfer_id,
            tcp_port,
        };
        
        let message_bytes = serde_json::to_vec(&ready_message).unwrap();
        let target_addr = format!("{}:{}", actual_sender_ip, accepter_port);
    println!("Sending TransferReady to specific target: {}", target_addr);

    if let Err(e) = socket_manager.message_socket.send_to(&message_bytes, &target_addr).await {
        eprintln!("Failed to send TransferReady message to {}: {}", target_addr, e);
    }
    } else {
        eprintln!("Failed to get available TCP port");
    }
}

        DiscoveryMessage::FileReject { transfer_id } => {
            println!("Received file reject for transfer ID: {}", transfer_id);
        }

        
DiscoveryMessage::TransferReady { transfer_id, tcp_port } => {
    println!("Received transfer ready for ID : {} on port : {}", transfer_id, tcp_port);
    
    let payload = serde_json::json!({
        "transferId": transfer_id,
        "port": tcp_port,
        "senderIp": addr.ip().to_string() 
    });
    
    if let Err(e) = main_window.emit("file-transfer-ready", payload) {
        println!("Failed to emit file-transfer-ready event: {}", e);
    } else {
        println!("Emitted file-transfer-ready event to frontend");
    }
}


    }
}

async fn reassemble_chunks(
    socket_manager: &SocketManager,
    chunk_id: String,
    chunk_index: u16,
    total_chunks: u16,
    content: String,
) -> Option<String> {
    let chunk_data = ChunkData {
        content,
        timestamp: Instant::now(),
    };

    let mut chunks = socket_manager.chunk_manager.chunks.write().await;
    let message_chunks = chunks.entry(chunk_id.clone()).or_insert_with(HashMap::new);
    message_chunks.insert(chunk_index, chunk_data);
    
    if message_chunks.len() == total_chunks as usize {
        let mut complete = String::with_capacity(total_chunks as usize * CHUNK_SIZE);
        
        let mut sorted_chunks: Vec<_> = message_chunks.iter().collect();
        sorted_chunks.sort_by_key(|(index, _)| *index);
        
        for (_, chunk_data) in sorted_chunks {
            complete.push_str(&chunk_data.content);
        }
        
        chunks.remove(&chunk_id);
        Some(complete)
    } else {
        None
    }
}

fn emit_complete_message(
    main_window: &tauri::WebviewWindow,
    content: String,
    sender: String,
    sender_id: u64,
    target_id: u64,
    sender_port: u16,
    addr: SocketAddr,
) {
    let message_data = serde_json::json!({
        "content": content,
        "sender": sender,
        "sender_id": sender_id,
        "target_id": target_id,
        "sender_port": sender_port, 
        "ip": addr.ip().to_string(),
        "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
    });

    if let Err(e) = main_window.emit("message-received", message_data) {
        eprintln!("Failed to emit message: {}", e);
    }
}

fn create_socket(port: u16) -> Result<UdpSocket, Box<dyn std::error::Error>> {
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse()?;
    
    let raw_socket = Socket::new(Domain::IPV4, Type::DGRAM, None)?;
    raw_socket.set_reuse_address(true)?;
    raw_socket.set_nonblocking(true)?;
    raw_socket.bind(&addr.into())?;
    raw_socket.set_broadcast(true)?;
    
    if let Err(e) = raw_socket.set_recv_buffer_size(BUFFER_SIZE * 4) {
        eprintln!("Warning: Could not set receive buffer size: {}", e);
    }
    if let Err(e) = raw_socket.set_send_buffer_size(BUFFER_SIZE * 4) {
        eprintln!("Warning: Could not set send buffer size: {}", e);
    }
    
    let socket = UdpSocket::from_std(raw_socket.into())?;
    Ok(socket)
}

// Improved broadcast with retry logic
async fn broadcast_message(
    socket_manager: &SocketManager, 
    message: &DiscoveryMessage
) -> Result<(), MessageError> {
    message.validate()?;

    let message_bytes = serde_json::to_vec(message)
        .map_err(MessageError::SerializationError)?;
    
    
    let discovery_addr = format!("255.255.255.255:{}", DISCOVERY_PORT);
    let msg_addr = format!("255.255.255.255:{}", MSG_PORT);
    
    let discovery_socket = socket_manager.discovery_socket.as_ref()
        .unwrap_or(&socket_manager.message_socket);
    
    if let Err(e) = discovery_socket.send_to(&message_bytes, &discovery_addr).await {
        eprintln!("Warning: Failed to send to discovery port: {}", e);
    }
    
    if DISCOVERY_PORT != MSG_PORT {
        if let Err(e) = socket_manager.message_socket.send_to(&message_bytes, &msg_addr).await {
            eprintln!("Warning: Failed to send to message port: {}", e);
        }
    }
    
    Ok(())
}

// Chunked message sending with better performance
async fn send_chunked_message_with_id(
    message: String,
    target_addr: String,
    sender_name: String,
    sender_id: u64,
    target_id: u64,
    sender_port: u16,
    socket_manager: &SocketManager,
    random_id: u32,
) -> Result<String, MessageError> {
    let chunk_id = format!("{}-{}-{}", sender_id, target_id, random_id);
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
        .unwrap().as_secs();
    
    let message_bytes = message.as_bytes();
    let mut chunks = Vec::new();
    let mut start = 0;
    
    while start < message_bytes.len() {
        let end = std::cmp::min(start + CHUNK_SIZE, message_bytes.len());
        let chunk_bytes = &message_bytes[start..end];
        
        let chunk_str = match std::str::from_utf8(chunk_bytes) {
            Ok(s) => s.to_string(),
            Err(e) => {
                let valid_end = start + e.valid_up_to();
                let chunk_bytes = &message_bytes[start..valid_end];
                std::str::from_utf8(chunk_bytes).unwrap().to_string()
            }
        };
        
        let chunk_len = chunk_str.len();
        chunks.push(chunk_str);
        start += chunk_len;
    }
    
    let total_chunks = chunks.len() as u16;
    println!("Sending {} chunks for message of {} chars", total_chunks, message.len());

    let semaphore = Arc::new(tokio::sync::Semaphore::new(10));
    let mut tasks = Vec::new();

    for (index, chunk) in chunks.into_iter().enumerate() {
        let chunked_msg = DiscoveryMessage::ChunkedMessage {
            chunk_id: chunk_id.clone(),
            chunk_index: index as u16,
            total_chunks,
            content: chunk,
            sender: sender_name.clone(),
            sender_id,
            target_id,
            sender_port,
            timestamp,
        };

        let chunk_bytes = serde_json::to_vec(&chunked_msg)
            .map_err(MessageError::SerializationError)?;

        let socket = socket_manager.message_socket.clone();
        let addr = target_addr.clone();
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        
        let task = tokio::spawn(async move {
            let _permit = permit;
            
            let result = socket.send_to(&chunk_bytes, &addr).await;
            if let Err(e) = result {
                eprintln!("Failed to send chunk {}: {}", index, e);
            } else {
                println!("Sent chunk {}/{}", index + 1, total_chunks);
            }
            
            sleep(Duration::from_millis(CHUNK_SEND_DELAY_MS)).await;
        });
        
        tasks.push(task);
    }

    for task in tasks {
        let _ = task.await;
    }

    Ok(format!("Chunked message sent successfully ({} chunks)", total_chunks))
}

// Enhanced Tauri commands
#[tauri::command]
async fn send_message(
    message: String,
    target_ip: String,
    sender_name: String,
    sender_id: u64,
    target_id: u64,
    target_port: u16,
    sender_port: u16,
    state: State<'_, Arc<SocketManager>>,
) -> Result<String, String> {
    if message.is_empty() {
        return Err("Message cannot be empty".to_string());
    }
    
    if message.len() > 1_000_000 {
        return Err("Message too large".to_string());
    }
    
    let random_id = rand::random::<u32>();
    
    println!("Sending message: {} chars to {}:{}", message.len(), target_ip, target_port);
    
    let target_addr = format!("{}:{}", target_ip, target_port);
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
        .unwrap().as_secs();
    
    let single_msg = DiscoveryMessage::Message {
        content: message.clone(),
        sender: sender_name.clone(),
        sender_id,
        target_id,
        sender_port,
        timestamp,
    };

    if let Ok(message_bytes) = serde_json::to_vec(&single_msg) {
        if message_bytes.len() <= MAX_SINGLE_PACKET_SIZE {
            match state.message_socket.send_to(&message_bytes, &target_addr).await {
                Ok(bytes_sent) => {
                    println!("Single message sent: {} bytes", bytes_sent);
                    return Ok(format!("Message sent successfully, {} bytes", bytes_sent));
                }
                Err(e) => {
                    println!("Single message failed ({}), trying chunked approach", e);
                }
            }
        }
    }

    send_chunked_message_with_id(message, target_addr, sender_name, sender_id, target_id, sender_port, &state, random_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn broadcast_user_presence(
    user_id: u64,
    name: String,
    username: String,
    profile_picture: Option<String>, 
    app_handle: AppHandle,
) -> Result<String, String> {
    if name.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    println!("{} ({})", name, user_id);
    let hostname = hostname::get().ok().and_then(|s| s.into_string().ok());
    let user = User {
        id: user_id,
        name,
        username, 
        ip: "0.0.0.0".to_string(),
        port: MSG_PORT,
        profile_picture,
        hostname,
    };

    if let Err(e) = user.validate() {
        return Err(e.to_string());
    }

    let online_message = DiscoveryMessage::Online(user);
    let state = app_handle.state::<Arc<SocketManager>>();

    broadcast_message(&state, &online_message).await
        .map_err(|e| e.to_string())?;

    Ok("Presence broadcasted successfully".to_string())
}

#[tauri::command]
async fn broadcast_offline(user_id: u64, state: State<'_, Arc<SocketManager>>) -> Result<(), String> {
    let user_to_remove = User {
        id: user_id,
        name: "Roundtable User".to_string(),
        username: "".to_string(),
        ip: "0.0.0.0".to_string(),
        port: MSG_PORT,
        profile_picture: None,
        hostname: None,
    };
    let offline_message = DiscoveryMessage::Offline(user_to_remove);
    broadcast_message(&state, &offline_message).await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn test_emit(app_handle: AppHandle) -> Result<(), String> {
    let test_user = User {
        id: 12345,
        name: "Test User".to_string(),
        username: "testuser".to_string(), 
        ip: "192.168.1.100".to_string(),
        port: MSG_PORT,
        profile_picture: None,
        hostname: Some("test-pc".to_string()),
    };

    app_handle.emit("user-online", test_user)
        .map_err(|e| format!("Failed to emit test event: {}", e))?;

    Ok(())
}


#[tauri::command]
async fn initiate_file_offer(
    _target_id: u64,
    target_ip: String,
    target_port: u16,
    transfer_id: String,
    file_name: String,
    file_size: u64,
    file_path: Option<String>,
    sender_id: u64,
    sender_name: String,
    sender_username: String,
    sender_profile_picture: Option<String>,
    state: State<'_, Arc<SocketManager>>,
    _app_handle: AppHandle,
) -> Result<(), String> {
    let valid_path = match file_path {
        Some(path) if !path.is_empty() => path,
        _ => {
            let err_msg = "File offer failed because the file path was not provided or was empty.".to_string();
            eprintln!("{}", &err_msg);
            return Err(err_msg);
        }
    };

    println!(
        "Initiating file offer '{}' (path: {}) to {}:{}",
        file_name, &valid_path, target_ip, target_port
    );

    // Register the file transfer using the validated path
    FILE_TRANSFERS.lock().unwrap().insert(transfer_id.clone(), valid_path);
    println!("Registered transfer : {} -> {}", &transfer_id, &file_name);

    let sender_user = User {
        id: sender_id,
        name: sender_name,
        username: sender_username,
        ip: "0.0.0.0".to_string(),
        port: MSG_PORT,
        profile_picture: sender_profile_picture,
        hostname: hostname::get().ok().and_then(|s| s.into_string().ok()),
    };

    let offer_message = DiscoveryMessage::FileOffer {
        sender: sender_user,
        file_name,
        file_size,
        transfer_id,
    };

    let message_bytes = serde_json::to_vec(&offer_message)
        .map_err(|e| format!("Serialization error: {}", e))?;

    let target_addr = format!("{}:{}", target_ip, target_port);

    state
        .message_socket
        .send_to(&message_bytes, &target_addr)
        .await
        .map_err(|e| format!("Network error: {}", e))?;
    println!("FT Offer Sent to : {}", target_addr);
    Ok(())
}



#[tauri::command]
async fn respond_to_file_offer(
    transfer_id: String,
    accepted: bool,
    sender_id: u64,
    sender_name: String,
    sender_username: String,
    sender_profile_picture: Option<String>,
    target_ip: Option<String>,
    target_port: Option<u16>,
    state: State<'_, Arc<SocketManager>>,
) -> Result<(), String> {
    println!("Responding to file offer {} with: {} to {:?}:{:?}", 
             transfer_id, accepted, target_ip, target_port);
    
    let receiver_user = User {
        id: sender_id,
        name: sender_name,
        username: sender_username,
        ip: "0.0.0.0".to_string(),
        port: MSG_PORT,
        profile_picture: sender_profile_picture,
        hostname: hostname::get().ok().and_then(|s| s.into_string().ok()),
    };

    let response_message = if accepted {
        DiscoveryMessage::FileAccept {
            receiver: receiver_user,
            transfer_id,
        }
    } else {
        DiscoveryMessage::FileReject {
            transfer_id,
        }
    };

    let message_bytes = serde_json::to_vec(&response_message)
        .map_err(|e| format!("Serialization error: {}", e))?;

    let target_addr = if let (Some(ip), Some(port)) = (target_ip, target_port) {
        format!("{}:{}", ip, port)
    } else {
        format!("255.255.255.255:{}", MSG_PORT)
    };
    
    println!("Sending response to: {}", target_addr);
    
    state
        .message_socket
        .send_to(&message_bytes, &target_addr)
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    println!("File offer response sent");
    Ok(())
}








#[tauri::command]
async fn start_file_transfer(
    transfer_id: String,
    state: State<'_, Arc<SocketManager>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    println!("Starting file transfer for: {}", transfer_id);
    
    let tcp_port = get_available_tcp_port()
        .map_err(|e| format!("Failed to get available TCP port: {}", e))?;
    
    // Start file transfer server in the background
    let transfer_id_clone = transfer_id.clone();
    let app_handle_clone = app_handle.clone();
    
    tokio::spawn(async move {
        if let Err(e) = setup_file_transfer_server(transfer_id_clone, tcp_port, app_handle_clone).await {
            eprintln!("File transfer server error: {}", e);
        }
    });
    
    let ready_message = DiscoveryMessage::TransferReady {
        transfer_id,
        tcp_port,
    };
    
    let message_bytes = serde_json::to_vec(&ready_message)
        .map_err(|e| format!("Serialization error: {}", e))?;
    
    let broadcast_addr = format!("255.255.255.255:{}", MSG_PORT);
    
    state
        .message_socket
        .send_to(&message_bytes, &broadcast_addr)
        .await
        .map_err(|e| format!("Network error: {}", e))?;
    
    Ok(())
}




#[tauri::command]
async fn download_file(
   transfer_id: String,
  sender_ip: String,
  port: u16,
  _file_name: String,
  save_path: String,
  _sender_id: u64,
  _sender_name: String,
  _sender_username: String,
  _sender_profile_picture: Option<String>,
    app_handle: AppHandle,
) -> Result<(), String> {
    println!("Downloading file from {}:{} to {}", sender_ip, port, save_path);
    
    if let Some(parent) = std::path::Path::new(&save_path).parent() {
        if !parent.exists() {
            if let Err(e) = tokio::fs::create_dir_all(parent).await {
                return Err(format!("Failed to create directory: {}", e));
            }
        }
    }
    
    let main_window = app_handle.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    
    tokio::spawn(async move {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        
        let connect_future = tokio::net::TcpStream::connect(format!("{}:{}", sender_ip, port));
        let timeout_duration = Duration::from_secs(15); // 15 second connection timeout
        
        let stream = match tokio::time::timeout(timeout_duration, connect_future).await {
            Ok(Ok(stream)) => {
                println!("Connected to file server at {}:{}", sender_ip, port);
                stream
            },
            Ok(Err(e)) => {
                let error_msg = format!("Failed to connect to file server: {}", e);
                eprintln!("{}", error_msg);
                let _ = main_window.emit("file-transfer-error", serde_json::json!({
                    "transferId": transfer_id,
                    "error": error_msg
                }));
                return;
            },
            Err(_) => {
                let error_msg = "Connection attempt timed out";
                eprintln!("{}", error_msg);
                let _ = main_window.emit("file-transfer-error", serde_json::json!({
                    "transferId": transfer_id,
                    "error": error_msg
                }));
                return;
            }
        };
        
        let mut stream = stream;
        
        let mut size_buf = [0u8; 8];
        if let Err(e) = stream.read_exact(&mut size_buf).await {
            eprintln!("Failed to read file size: {}", e);
            let _ = main_window.emit("file-transfer-error", serde_json::json!({
                "transferId": transfer_id,
                "error": format!("Failed to read file size: {}", e)
            }));
            return;
        }
        
        let file_size = u64::from_be_bytes(size_buf);
        println!("File size to download: {} bytes", file_size);
        
        let mut file = match tokio::fs::File::create(&save_path).await {
            Ok(file) => file,
            Err(e) => {
                eprintln!("Failed to create output file: {}", e);
                let _ = main_window.emit("file-transfer-error", serde_json::json!({
                    "transferId": transfer_id,
                    "error": format!("Failed to create output file: {}", e)
                }));
                return;
            }
        };
        
        let mut buffer = vec![0u8; 16384];
        let mut total_bytes = 0;
        let mut last_progress = 0;
        
        println!("Starting file download...");
        loop {
            match stream.read(&mut buffer).await {
                Ok(0) => break,
                Ok(n) => {
                    if let Err(e) = file.write_all(&buffer[0..n]).await {
                        eprintln!("Failed to write to file: {}", e);
                        let _ = main_window.emit("file-transfer-error", serde_json::json!({
                            "transferId": transfer_id,
                            "error": format!("Failed to write to file: {}", e)
                        }));
                        return;
                    }
                    
                    total_bytes += n as u64;
                    
                    if file_size > 0 {
                        let progress = (total_bytes as f64 / file_size as f64 * 100.0) as u8;
                        if progress != last_progress {
                            println!("Download progress: {}% ({}/{})", progress, total_bytes, file_size);
                            last_progress = progress;
                            let _ = main_window.emit("file-transfer-progress", serde_json::json!({
                                "transferId": transfer_id,
                                "progress": progress
                            }));
                        }
                    }
                    
                    if total_bytes >= file_size {
                        break;
                    }
                },
                Err(e) => {
                    eprintln!("Failed to read from stream: {}", e);
                    let _ = main_window.emit("file-transfer-error", serde_json::json!({
                        "transferId": transfer_id,
                        "error": format!("Failed to read from stream: {}", e)
                    }));
                    return;
                }
            }
        }
        
        println!("File download complete: {} bytes saved to {}", total_bytes, save_path);
        let _ = main_window.emit("file-transfer-complete", serde_json::json!({
            "transferId": transfer_id,
            "filePath": save_path,
            "size": total_bytes
        }));
    });
    
    Ok(())
}


#[tauri::command]
async fn log_message(
    sender_name: String,
    sender_ip: String,
    receiver_name: String,
    receiver_ip: String,
    message: String,
    is_outgoing: bool,
) -> Result<(), String> {
    let log_content = format_log_entry(
        sender_name,
        sender_ip,
        receiver_name,
        receiver_ip,
        message,
        is_outgoing,
    ).await;

    write_to_log_file(log_content).await.map_err(|e| e.to_string())
}

async fn format_log_entry(
    sender_name: String,
    sender_ip: String,
    receiver_name: String,
    receiver_ip: String,
    message: String,
    is_outgoing: bool,
) -> String {
    let now: DateTime<Local> = Local::now();
    let timestamp = now.format("%H:%M:%S").to_string();
    let _date = now.format("%Y-%m-%d").to_string();
    
    let (from_name, from_ip, _to_name, _to_ip) = if is_outgoing {
        (sender_name, sender_ip, receiver_name, receiver_ip)
    } else {
        (sender_name, sender_ip, receiver_name, receiver_ip)
    };

    format!(
        "[{}] {} ({}): {}\n",
        timestamp, from_name, from_ip, message
    )
}

async fn write_to_log_file(content: String) -> std::io::Result<()> {
    let documents_dir = dirs::document_dir()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Documents directory not found"))?;
    
    let log_dir = documents_dir.join("RoundtableChat");
    std::fs::create_dir_all(&log_dir)?;
    
    let now: DateTime<Local> = Local::now();
    let log_filename = "rounddtable_chat_log.txt".to_string();
    let log_path = log_dir.join(log_filename);
    
    let file_exists = log_path.exists();
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)?;

    if !file_exists {
        let header = format!(
            "=== Roundtable Chat Log ===\nDate: {}\nLog started at: {}\n{}\n",
            now.format("%Y-%m-%d"),
            now.format("%H:%M:%S"),
            "=".repeat(50)
        );
        file.write_all(header.as_bytes())?;
    }

    file.write_all(content.as_bytes())?;
    Ok(())
}

#[tauri::command]
async fn log_session_start(user_name: String, user_ip: String) -> Result<(), String> {
    let now: DateTime<Local> = Local::now();
    let session_info = format!(
        "\n--- Session Started ---\nLocal User: {} ({})\nTime: {}\n{}\n",
        user_name,
        user_ip,
        now.format("%Y-%m-%d %H:%M:%S"),
        "-".repeat(30)
    );
    
    write_to_log_file(session_info).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn log_chat_participants(local_user: String, local_ip: String, remote_user: String, remote_ip: String) -> Result<(), String> {
    let participants_info = format!(
        "\n--- Chat Participants ---\nLocal: {} ({})\nRemote: {} ({})\nTime: {}\n{}\n",
        local_user,
        local_ip,
        remote_user,
        remote_ip,
        Local::now().format("%Y-%m-%d %H:%M:%S"),
        "-".repeat(25)
    );
    
    write_to_log_file(participants_info).await.map_err(|e| e.to_string())
}



fn get_available_tcp_port() -> Result<u16, std::io::Error> {
    let socket = std::net::TcpListener::bind("127.0.0.1:0")?;
    let port = socket.local_addr()?.port();
    Ok(port)
}


async fn setup_file_transfer_server(transfer_id: String, port: u16, app_handle: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tokio::net::TcpListener;
    use tokio::io::AsyncWriteExt;
    use std::path::PathBuf;
    
    println!("Setting FT server for ID : {} , PORT : {}", transfer_id, port);
    let main_window = app_handle.get_webview_window("main").unwrap();

    let file_path_to_send = {
        let transfers = FILE_TRANSFERS.lock().unwrap();
        transfers.get(&transfer_id).cloned()
    };

    let final_file_path = match file_path_to_send {
        Some(path) => PathBuf::from(path),
        None => {
            let error_msg = format!("File path for transfer ID {} not found in registry.", transfer_id);
            eprintln!("{}", error_msg);
            let _ = main_window.emit("file-transfer-error", serde_json::json!({
                "transferId": transfer_id,
                "error": error_msg
            }));
            return Err(Box::new(std::io::Error::new(std::io::ErrorKind::NotFound, error_msg)));
        }
    };
    
    let listener = TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    println!("FT Server PORT : {} (waiting for connection)", port);
    
    let timeout_duration = Duration::from_secs(60);
    let accept_future = listener.accept();
    
    match tokio::time::timeout(timeout_duration, accept_future).await {
        Ok(Ok((mut socket, addr))) => {
            println!("File transfer connection accepted from: {}", addr);
            
            println!("Sending file: {:?}", final_file_path);
            
            let file_content = match tokio::fs::read(&final_file_path).await {
                Ok(content) => content,
                Err(e) => {
                    eprintln!("Failed to read file: {}", e);
                    let _ = main_window.emit("file-transfer-error", serde_json::json!({
                        "transferId": transfer_id,
                        "error": format!("Failed to read file: {}", e)
                    }));
                    FILE_TRANSFERS.lock().unwrap().remove(&transfer_id);
                    return Err(Box::new(std::io::Error::new(std::io::ErrorKind::NotFound, "File not found")));
                }
            };
            
            let file_size = file_content.len() as u64;
            println!("Sending file size: {} bytes", file_size);
            socket.write_all(&file_size.to_be_bytes()).await?;
            
            let chunk_size = 16384;
            println!("Starting file content transfer...");
            for chunk in file_content.chunks(chunk_size) {
                if let Err(e) = socket.write_all(chunk).await {
                     eprintln!("Error sending file chunk: {}", e);
                     break; 
                }
            }
            
            println!("File sent successfully: {} bytes", file_size);
        },
        Ok(Err(e)) => {
            eprintln!("Failed to accept connection: {}", e);
             let _ = main_window.emit("file-transfer-error", serde_json::json!({
                "transferId": transfer_id,
                "error": format!("Failed to accept connection: {}", e)
            }));
            // Clean up registry
            FILE_TRANSFERS.lock().unwrap().remove(&transfer_id);
            return Err(Box::new(e));
        },
        Err(_) => {
            eprintln!("Timeout waiting for file transfer connection");
             let _ = main_window.emit("file-transfer-error", serde_json::json!({
                "transferId": transfer_id,
                "error": "Timeout waiting for connection"
            }));
            FILE_TRANSFERS.lock().unwrap().remove(&transfer_id);
            return Err(Box::new(std::io::Error::new(std::io::ErrorKind::TimedOut, "Connection timed out")));
        }
    }
    
    FILE_TRANSFERS.lock().unwrap().remove(&transfer_id);
    println!("Cleaned up transfer registry for ID: {}", transfer_id);
    
    Ok(())
}


#[tauri::command]
fn echo_test(input: String) -> String {
    println!("Echo test received: {}", input);
    format!("Echo: {}", input)
}