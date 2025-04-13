import * as ui from './ui.js';

/**
 * Simple WebSocket connection manager
 */

// Define types for user info
interface UserInfo {
  userId: string;
  username: string;
  instanceId?: string;
  activityId?: string;
}

// Define types for event handlers
type MessageHandler = (userId: string, message: string) => void;
type UserJoinedHandler = (userId: string) => void;
type UserLeftHandler = (userId: string) => void;
type ConnectHandler = () => void;
type DisconnectHandler = () => void;
type ErrorHandler = (message: string) => void;

// WebSocket instance
let socket: WebSocket | null = null;
let connected: boolean = false;
let userInfo: UserInfo | null = null;
let reconnectTimer: number | null = null;
let customServerUrl: string | null = null;

// Event handlers
let onMessageHandlers: MessageHandler[] = [];
let onUserJoinedHandlers: UserJoinedHandler[] = [];
let onUserLeftHandlers: UserLeftHandler[] = [];
let onConnectHandlers: ConnectHandler[] = [];
let onDisconnectHandlers: DisconnectHandler[] = [];
let onErrorHandlers: ErrorHandler[] = [];

// Whether to show debug messages in UI
const DEBUG_MODE = true;

/**
 * Client-side debug logger
 */
function clientLog(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [WebSocket] [${level.toUpperCase()}]`;
  
  // Console logging
  if (data) {
    if (data instanceof Error) {
      // Properly serialize Error objects with non-enumerable properties
      console[level](`${prefix} ${message}`, JSON.stringify(data, ["message", "arguments", "type", "name", "stack"]));
      
      // For UI logging in debug mode
      if (DEBUG_MODE) {
        ui.displayDebugMessage(`${level.toUpperCase()}: ${message}`, {
          message: data.message,
          name: data.name,
          stack: data.stack
        });
      }
    } else {
      console[level](`${prefix} ${message}`, data);
      
      // UI logging if debug mode is enabled
      if (DEBUG_MODE) {
        ui.displayDebugMessage(`${level.toUpperCase()}: ${message}`, data);
      }
    }
  } else {
    console[level](`${prefix} ${message}`);
    
    // UI logging if debug mode is enabled
    if (DEBUG_MODE) {
      ui.displayDebugMessage(`${level.toUpperCase()}: ${message}`, '');
    }
  }
}

/**
 * Get the WebSocket URL based on environment
 * @returns WebSocket URL
 */
const getWebSocketUrl = (): string => {
  // Use custom server URL if provided
  // This is essential for connecting from a local instance to a Discord activity instance
  // Discord activities run on remote servers (like Railway) while local development runs on localhost
  // Without this override, a local client would try to connect to its own localhost server
  // instead of connecting to the remote server where the Discord activity is running
  if (customServerUrl) {
    const protocol = customServerUrl.startsWith('https') ? 'wss:' : 'ws:';
    // Ensure URL has proper format and includes /ws path
    let serverUrl = customServerUrl.replace(/^https?:\/\//, '');
    if (!serverUrl.endsWith('/ws')) {
      serverUrl = serverUrl.endsWith('/') ? `${serverUrl}ws` : `${serverUrl}/ws`;
    }
    return `${protocol}//${serverUrl}`;
  }

  // Check if we're in a Discord environment
  const isDiscordHost = window.location.host.includes('discordsays.com');
  
  if (isDiscordHost) {
    // Parse Discord client ID from the hostname
    // Format: <CLIENT_ID>.discordsays.com
    const hostParts = window.location.host.split('.');
    const clientId = hostParts[0]; // This is the Discord client ID
    
    // Construct WebSocket URL following Discord proxy pattern
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${clientId}.discordsays.com/.proxy/ws`;
  } else {
    // Default URL for local development
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_HOST || window.location.host;
    return `${protocol}//${host}/ws`;
  }
};

/**
 * Get current connection info
 * @returns Current connection info
 */
export function getConnectionInfo(): { 
  connected: boolean;
  userInfo: UserInfo | null;
  url: string;
  isDiscordHost: boolean;
  customServer: string | null;
} {
  const isDiscordHost = window.location.host.includes('discordsays.com');
  
  return {
    connected,
    userInfo,
    url: getWebSocketUrl(),
    isDiscordHost,
    customServer: customServerUrl
  };
}

/**
 * Join a specific Discord instance
 * @param instanceId - Instance ID to join
 * @param activityId - Optional activity ID
 * @param userId - User ID
 * @param username - Username
 * @param serverUrl - Optional server URL for cross-environment connections
 * @returns - Whether join was successful
 */
export function joinInstance(
  instanceId: string, 
  activityId: string | undefined, 
  userId: string, 
  username: string,
  serverUrl?: string
): boolean {
  // Disconnect from any existing connection
  disconnect();
  
  // Set custom server URL if provided
  customServerUrl = serverUrl || null;
  
  // Create new user info
  const newUserInfo: UserInfo = {
    userId,
    username,
    instanceId
  };
  
  // Only add activityId if it exists and is not null
  if (activityId) {
    newUserInfo.activityId = activityId;
  }
  
  // Connect with new instance info
  connect(newUserInfo);
  
  return true;
}

/**
 * Test if WebSocket connection options are valid
 * This helps diagnose issues with Discord hosting
 */
export function testConnection(): void {
  // Try different WebSocket URLs to diagnose connection issues
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const currentUrl = getWebSocketUrl();
  const isDiscordHost = host.includes('discordsays.com');
  
  clientLog('info', 'Testing WebSocket connections...', {
    windowUrl: window.location.href,
    currentHost: host,
    currentWsUrl: currentUrl,
    isDiscordEnvironment: isDiscordHost
  });
  
  // For discord domains, explain the proxy URL pattern
  if (isDiscordHost) {
    const hostParts = host.split('.');
    const clientId = hostParts[0];
    const correctProxyUrl = `${protocol}//${clientId}.discordsays.com/.proxy/ws`;
    
    ui.displaySystemMessage("Discord hosting detected. Using the proxy URL pattern:");
    ui.displaySystemMessage(`${correctProxyUrl}`);
    
    // Test Discord proxy URL
    const proxyWs = new WebSocket(correctProxyUrl);
    
    proxyWs.onopen = () => {
      clientLog('info', '✅ Discord proxy WebSocket connection successful', { url: correctProxyUrl });
      proxyWs.close();
      ui.displaySystemMessage("Discord proxy WebSocket test: SUCCESS! The connection works.");
    };
    
    proxyWs.onerror = () => {
      clientLog('error', '❌ Discord proxy WebSocket connection failed', { url: correctProxyUrl });
      ui.displaySystemMessage("Discord proxy WebSocket test: FAILED. Make sure your server endpoints match the proxy pattern.");
      ui.displaySystemMessage("Check that your Discord Activity manifest has WebSocket permissions.");
    };
  }
  
  // Test 1: Try connecting to same host (fallback)
  const simpleUrl = `${protocol}//${host}`;
  ui.displaySystemMessage(`Testing direct connection to: ${simpleUrl}`);
  const localWs = new WebSocket(simpleUrl);
  
  localWs.onopen = () => {
    clientLog('info', '✅ Direct WebSocket connection successful', { url: simpleUrl });
    localWs.close();
    ui.displaySystemMessage("Direct WebSocket test: SUCCESS. This connection works but may not be accessible from Discord.");
  };
  
  localWs.onerror = () => {
    clientLog('error', '❌ Direct WebSocket connection failed', { url: simpleUrl });
    ui.displaySystemMessage("Direct WebSocket test: FAILED. Server might not support WebSockets.");
  };
  
  // Display environment info
  ui.displaySystemMessage(`Debug info: ${navigator.userAgent}`);
  ui.displaySystemMessage(`URL: ${window.location.href}`);
}

/**
 * Initialize WebSocket connection
 * @param user - User information to send on connection
 */
export function connect(user: UserInfo): void {
  // Store user info for reconnect
  userInfo = user;
  
  clientLog('info', 'Connecting to WebSocket server', { url: getWebSocketUrl(), user });
  
  // Clear any existing reconnect timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  // Create WebSocket connection
  socket = new WebSocket(getWebSocketUrl());
  
  // Set up event handlers
  socket.onopen = () => {
    clientLog('info', 'WebSocket connected');
    connected = true;
    
    // Send join message with user info
    if (userInfo) {
      clientLog('info', 'Sending join message', userInfo);
      send('join', userInfo);
    }
    
    // Notify connect handlers
    onConnectHandlers.forEach(handler => handler());
  };
  
  socket.onmessage = (event: MessageEvent) => {
    try {
      const rawData = event.data;
      clientLog('info', 'Message received', rawData);
      
      const data = JSON.parse(rawData);
      
      switch (data.type) {
        case 'message':
          onMessageHandlers.forEach(handler => handler(data.userId, data.message));
          break;
        case 'user_joined':
          onUserJoinedHandlers.forEach(handler => handler(data.userId));
          break;
        case 'user_left':
          onUserLeftHandlers.forEach(handler => handler(data.userId));
          break;
        case 'error':
          clientLog('error', 'Error from server', data);
          onErrorHandlers.forEach(handler => handler(data.message));
          break;
      }
    } catch (error) {
      clientLog('error', 'Error processing message', error);
    }
  };
  
  socket.onclose = () => {
    clientLog('info', 'WebSocket disconnected');
    connected = false;
    socket = null;
    
    // Notify disconnect handlers
    onDisconnectHandlers.forEach(handler => handler());
    
    // Reconnect after delay
    if (userInfo) {
      clientLog('info', 'Scheduling reconnect attempt in 5 seconds');
      reconnectTimer = window.setTimeout(() => {
        clientLog('info', 'Attempting to reconnect');
        if (userInfo) {
          connect(userInfo);
        }
      }, 5000);
    }
  };
  
  socket.onerror = (error: Event) => {
    // Browser security restrictions limit error details, so add connection context
    const wsUrl = getWebSocketUrl();
    const connectionInfo = {
      url: wsUrl,
      readyState: socket ? socket.readyState : 'unknown',
      secure: wsUrl.startsWith('wss:'),
      timestamp: new Date().toISOString(),
      browser: navigator.userAgent,
      // Include user info without sensitive data
      user: userInfo ? { 
        instanceId: userInfo.instanceId,
        hasUserId: !!userInfo.userId
      } : null
    };
    
    clientLog('error', 'WebSocket connection failed', connectionInfo);
    clientLog('error', 'WebSocket error object', error);
    
    // For user feedback, provide a more descriptive error message
    let errorMessage = 'Connection error';
    
    // Add possible diagnosis based on URL
    if (wsUrl.includes('discordsays.com')) {
      errorMessage += '. Discord host may be blocking WebSocket connections.';
    }
    
    // Add guidance for common issues
    errorMessage += ' Try refreshing the page or checking your network connection.';
    
    onErrorHandlers.forEach(handler => handler(errorMessage));
  };
}

/**
 * Disconnect WebSocket
 */
export function disconnect(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    socket.close();
  }
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  socket = null;
  connected = false;
}

/**
 * Register event callback
 * @param event - Event name
 * @param callback - Callback function
 */
export function on(
  event: 'message' | 'userJoined' | 'userLeft' | 'connect' | 'disconnect' | 'error', 
  callback: MessageHandler | UserJoinedHandler | UserLeftHandler | ConnectHandler | DisconnectHandler | ErrorHandler
): void {
  switch (event) {
    case 'message':
      onMessageHandlers.push(callback as MessageHandler);
      break;
    case 'userJoined':
      onUserJoinedHandlers.push(callback as UserJoinedHandler);
      break;
    case 'userLeft':
      onUserLeftHandlers.push(callback as UserLeftHandler);
      break;
    case 'connect':
      onConnectHandlers.push(callback as ConnectHandler);
      break;
    case 'disconnect':
      onDisconnectHandlers.push(callback as DisconnectHandler);
      break;
    case 'error':
      onErrorHandlers.push(callback as ErrorHandler);
      break;
  }
}

/**
 * Remove event callback
 * @param event - Event name
 * @param callback - Callback function
 */
export function off(
  event: 'message' | 'userJoined' | 'userLeft' | 'connect' | 'disconnect' | 'error', 
  callback: MessageHandler | UserJoinedHandler | UserLeftHandler | ConnectHandler | DisconnectHandler | ErrorHandler
): void {
  switch (event) {
    case 'message':
      onMessageHandlers = onMessageHandlers.filter(handler => handler !== callback);
      break;
    case 'userJoined':
      onUserJoinedHandlers = onUserJoinedHandlers.filter(handler => handler !== callback);
      break;
    case 'userLeft':
      onUserLeftHandlers = onUserLeftHandlers.filter(handler => handler !== callback);
      break;
    case 'connect':
      onConnectHandlers = onConnectHandlers.filter(handler => handler !== callback);
      break;
    case 'disconnect':
      onDisconnectHandlers = onDisconnectHandlers.filter(handler => handler !== callback);
      break;
    case 'error':
      onErrorHandlers = onErrorHandlers.filter(handler => handler !== callback);
      break;
  }
}

/**
 * Send message to server
 * @param type - Message type
 * @param data - Message data
 * @returns Whether message was sent
 */
export function send(type: string, data: Record<string, any> = {}): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    clientLog('error', 'Cannot send message - not connected');
    return false;
  }
  
  const message = JSON.stringify({
    type,
    ...data
  });
  
  clientLog('info', `Sending ${type} message`, data);
  socket.send(message);
  
  return true;
}

/**
 * Send chat message
 * @param message - Message text
 * @returns Whether message was sent
 */
export function sendMessage(message: string): boolean {
  return send('message', { message });
}

/**
 * Check if connected to WebSocket
 * @returns Connection status
 */
export function isConnected(): boolean {
  return connected;
} 