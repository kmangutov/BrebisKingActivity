import * as discord from './js/discord.ts';
import * as websocket from './js/websocket.ts';
import * as ui from './js/ui.ts';
import { getOrCreateLocalUserId } from './js/utils.ts';

// Define types
interface AppParams {
  instanceId: string;
  activityId: string | null;
  guildId: string | null;
  channelId: string | null;
}

// Application state
let userId: string | null = null;
let username: string | null = null;
let params: AppParams | null = null;

/**
 * Initialize the application
 */
async function initApp(): Promise<void> {
  // Initialize UI
  ui.initialize();
  
  // Add form submit handler
  ui.onSubmit(handleMessageSubmit);
  
  // Show debug welcome message
  ui.displayDebugMessage('Application started', {
    timestamp: new Date().toISOString(),
    environment: import.meta.env.MODE,
    version: '1.0.0'
  });
  
  // Get URL parameters
  params = discord.getUrlParams();
  
  // Check if running in Discord
  if (discord.isDiscordActivity()) {
    await initDiscord();
  } else {
    initLocal();
  }
  
  // Set up WebSocket event handlers
  setupWebSocketHandlers();
}

/**
 * Initialize Discord mode
 */
async function initDiscord(): Promise<void> {
  ui.updateStatus('connecting', 'Initializing Discord...');
  
  try {
    // Authenticate with Discord
    const user = await discord.authenticate(import.meta.env.VITE_DISCORD_CLIENT_ID || '');
    
    // Store user info
    userId = user.userId;
    username = user.username;
    
    // Connect to WebSocket
    connectWebSocket();
  } catch (error) {
    // Properly log the error with all properties
    if (error instanceof Error) {
      console.error('Discord initialization error:', 
        JSON.stringify(error, ["message", "arguments", "type", "name", "stack"]));
    } else {
      console.error('Discord initialization error:', error);
    }
    ui.updateStatus('disconnected', 'Discord initialization failed');
  }
}

/**
 * Initialize local mode
 */
function initLocal(): void {
  // Generate or get local user ID
  userId = getOrCreateLocalUserId();
  if (userId) {
    username = `User-${userId.substring(0, 6)}`;
    
    // Connect to WebSocket
    connectWebSocket();
  }
}

/**
 * Connect to WebSocket
 */
function connectWebSocket(): void {
  ui.updateStatus('connecting', 'Connecting to server...');
  
  if (userId && username && params) {
    // Connect with user info
    websocket.connect({
      userId,
      username,
      instanceId: params.instanceId,
      activityId: params.activityId || undefined
    });
  }
}

/**
 * Set up WebSocket event handlers
 */
function setupWebSocketHandlers(): void {
  // Message handler
  websocket.on('message', (senderId: string, message: string) => {
    ui.displayMessage(senderId, message, senderId === userId);
  });
  
  // User joined handler
  websocket.on('userJoined', (joinedUserId: string) => {
    ui.displaySystemMessage(`User ${joinedUserId} joined the chat`);
  });
  
  // User left handler
  websocket.on('userLeft', (leftUserId: string) => {
    ui.displaySystemMessage(`User ${leftUserId} left the chat`);
  });
  
  // Connect handler
  websocket.on('connect', () => {
    ui.updateStatus('connected', 'Connected');
  });
  
  // Disconnect handler
  websocket.on('disconnect', () => {
    ui.updateStatus('disconnected', 'Disconnected');
  });
  
  // Error handler
  websocket.on('error', (message: string) => {
    ui.updateStatus('disconnected', 'Connection error');
    ui.displaySystemMessage(`Error: ${message}`);
  });
}

/**
 * Handle message form submission
 * @param message - Message text
 */
function handleMessageSubmit(message: string): void {
  // Special debug command
  if (message === '__DEBUG_TEST_CONNECTION__') {
    ui.displaySystemMessage('Running WebSocket connection tests...');
    websocket.testConnection();
    ui.clearInput();
    return;
  }
  
  // Send message via WebSocket
  if (websocket.isConnected()) {
    websocket.sendMessage(message);
    
    // Display own message immediately
    if (userId) {
      ui.displayMessage(userId, message, true);
    }
    
    // Clear input
    ui.clearInput();
  } else {
    // Not connected, show error
    ui.displaySystemMessage('Cannot send message: Not connected to server');
    ui.updateStatus('disconnected', 'Not connected');
    
    // Try to reconnect
    if (params) {
      connectWebSocket();
    }
  }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp); 