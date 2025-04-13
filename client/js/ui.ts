/**
 * UI handler for chat interface
 */

// Define a type for connection status
type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

// Define a type for the return value of initialize
interface UIElements {
  statusEl: HTMLElement | null;
  messagesEl: HTMLElement | null;
  messageForm: HTMLFormElement | null;
  messageInput: HTMLInputElement | null;
}

// DOM elements
let statusEl: HTMLElement | null;
let messagesEl: HTMLElement | null;
let messageForm: HTMLFormElement | null;
let messageInput: HTMLInputElement | null;

/**
 * Initialize UI elements
 * @returns UI elements
 */
export function initialize(): UIElements {
  statusEl = document.getElementById('status');
  messagesEl = document.getElementById('messages');
  messageForm = document.getElementById('message-form') as HTMLFormElement | null;
  messageInput = document.getElementById('message-input') as HTMLInputElement | null;
  
  return {
    statusEl,
    messagesEl,
    messageForm,
    messageInput
  };
}

/**
 * Display chat message
 * @param userId - User ID
 * @param message - Message text
 * @param isMe - Whether the message is from the current user
 */
export function displayMessage(userId: string, message: string, isMe: boolean = false): void {
  if (!messagesEl) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isMe ? 'own-message' : ''}`;
  
  const authorDiv = document.createElement('div');
  authorDiv.className = 'author';
  authorDiv.textContent = isMe ? 'You' : `User-${userId.substring(0, 6)}`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'content';
  contentDiv.textContent = message;
  
  messageDiv.appendChild(authorDiv);
  messageDiv.appendChild(contentDiv);
  
  messagesEl.appendChild(messageDiv);
  scrollToBottom();
}

/**
 * Display system message
 * @param message - Message text
 */
export function displaySystemMessage(message: string): void {
  if (!messagesEl) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message system-message';
  messageDiv.textContent = message;
  
  messagesEl.appendChild(messageDiv);
  scrollToBottom();
}

/**
 * Update connection status
 * @param status - Status type (connected, disconnected, connecting)
 * @param message - Status message
 */
export function updateStatus(status: ConnectionStatus, message: string): void {
  if (!statusEl) return;
  
  statusEl.className = status;
  statusEl.textContent = message;
}

/**
 * Clear message input
 */
export function clearInput(): void {
  if (messageInput) {
    messageInput.value = '';
  }
}

/**
 * Scroll messages to bottom
 */
export function scrollToBottom(): void {
  if (messagesEl) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

/**
 * Display a modal dialog to join a remote Discord instance
 * @param onJoin - Callback when join is confirmed
 */
export function showJoinModal(onJoin: (instanceId: string, activityId?: string, serverUrl?: string) => void): void {
  // Create modal container
  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal-container';
  modalContainer.style.position = 'fixed';
  modalContainer.style.top = '0';
  modalContainer.style.left = '0';
  modalContainer.style.width = '100%';
  modalContainer.style.height = '100%';
  modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  modalContainer.style.display = 'flex';
  modalContainer.style.justifyContent = 'center';
  modalContainer.style.alignItems = 'center';
  modalContainer.style.zIndex = '1000';
  
  // Create modal content
  const modal = document.createElement('div');
  modal.className = 'join-modal';
  modal.style.backgroundColor = '#ffffff';
  modal.style.borderRadius = '8px';
  modal.style.padding = '20px';
  modal.style.minWidth = '300px';
  modal.style.maxWidth = '500px';
  modal.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
  
  // Modal header
  const header = document.createElement('h3');
  header.textContent = 'Join Discord Activity Instance';
  header.style.marginTop = '0';
  
  // Instance ID input
  const instanceIdLabel = document.createElement('label');
  instanceIdLabel.textContent = 'Instance ID:';
  instanceIdLabel.style.display = 'block';
  instanceIdLabel.style.marginTop = '10px';
  
  const instanceIdInput = document.createElement('input');
  instanceIdInput.type = 'text';
  instanceIdInput.placeholder = 'Enter instance ID';
  instanceIdInput.style.width = '100%';
  instanceIdInput.style.padding = '8px';
  instanceIdInput.style.marginTop = '5px';
  instanceIdInput.style.boxSizing = 'border-box';
  instanceIdInput.required = true;
  
  // Activity ID input (optional)
  const activityIdLabel = document.createElement('label');
  activityIdLabel.textContent = 'Activity ID (optional):';
  activityIdLabel.style.display = 'block';
  activityIdLabel.style.marginTop = '10px';
  
  const activityIdInput = document.createElement('input');
  activityIdInput.type = 'text';
  activityIdInput.placeholder = 'Enter activity ID (optional)';
  activityIdInput.style.width = '100%';
  activityIdInput.style.padding = '8px';
  activityIdInput.style.marginTop = '5px';
  activityIdInput.style.boxSizing = 'border-box';
  
  // Server URL input (optional)
  const serverUrlLabel = document.createElement('label');
  serverUrlLabel.textContent = 'Server URL (required for cross-environment):';
  serverUrlLabel.style.display = 'block';
  serverUrlLabel.style.marginTop = '10px';
  
  const serverUrlInput = document.createElement('input');
  serverUrlInput.type = 'text';
  serverUrlInput.placeholder = 'e.g., my-app.railway.app or server-domain.com';
  serverUrlInput.style.width = '100%';
  serverUrlInput.style.padding = '8px';
  serverUrlInput.style.marginTop = '5px';
  serverUrlInput.style.boxSizing = 'border-box';
  
  // Helper text
  const helperText = document.createElement('div');
  helperText.textContent = 'Use the server URL when connecting from local to Discord activity';
  helperText.style.fontSize = '12px';
  helperText.style.color = '#666';
  helperText.style.marginTop = '5px';
  
  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.justifyContent = 'flex-end';
  buttonContainer.style.gap = '10px';
  buttonContainer.style.marginTop = '20px';
  
  // Cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.style.padding = '8px 16px';
  cancelButton.style.border = '1px solid #ddd';
  cancelButton.style.borderRadius = '4px';
  cancelButton.style.backgroundColor = '#f0f0f0';
  
  // Join button
  const joinButton = document.createElement('button');
  joinButton.textContent = 'Join';
  joinButton.style.padding = '8px 16px';
  joinButton.style.border = '1px solid #4caf50';
  joinButton.style.borderRadius = '4px';
  joinButton.style.backgroundColor = '#4caf50';
  joinButton.style.color = 'white';
  
  // Add elements to modal
  modal.appendChild(header);
  modal.appendChild(instanceIdLabel);
  modal.appendChild(instanceIdInput);
  modal.appendChild(activityIdLabel);
  modal.appendChild(activityIdInput);
  modal.appendChild(serverUrlLabel);
  modal.appendChild(serverUrlInput);
  modal.appendChild(helperText);
  buttonContainer.appendChild(cancelButton);
  buttonContainer.appendChild(joinButton);
  modal.appendChild(buttonContainer);
  modalContainer.appendChild(modal);
  
  // Add modal to document
  document.body.appendChild(modalContainer);
  
  // Focus the input
  instanceIdInput.focus();
  
  // Event handlers
  cancelButton.addEventListener('click', () => {
    document.body.removeChild(modalContainer);
  });
  
  joinButton.addEventListener('click', () => {
    const instanceId = instanceIdInput.value.trim();
    const activityId = activityIdInput.value.trim() || undefined;
    const serverUrl = serverUrlInput.value.trim() || undefined;
    
    if (instanceId) {
      onJoin(instanceId, activityId, serverUrl);
      document.body.removeChild(modalContainer);
    } else {
      instanceIdInput.style.border = '1px solid red';
    }
  });
  
  // Close on escape
  document.addEventListener('keydown', function closeOnEsc(e) {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', closeOnEsc);
      if (document.body.contains(modalContainer)) {
        document.body.removeChild(modalContainer);
      }
    }
  });
}

/**
 * Add submit handler to message form
 * @param callback - Submit callback function
 */
export function onSubmit(callback: (message: string) => void): void {
  if (messageForm && messageInput) {
    messageForm.addEventListener('submit', (event) => {
      event.preventDefault();
      
      if (messageInput) {
        const message = messageInput.value.trim();
        if (message) {
          // Check for debug commands
          if (message === '/debug' || message === '/test') {
            displaySystemMessage('Running connection diagnostics...');
            // This is handled in main.ts with a special handler
            callback('__DEBUG_TEST_CONNECTION__');
          } else if (message === '/info') {
            // Display connection info
            callback('__INFO_COMMAND__');
          } else if (message === '/join') {
            // Show join modal
            callback('__JOIN_COMMAND__');
          } else {
            callback(message);
          }
        }
      }
    });
  }
}

/**
 * Display debug message with raw data
 * @param title - Debug message title
 * @param data - Raw data to display
 */
export function displayDebugMessage(title: string, data: any): void {
  if (!messagesEl) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message debug-message';
  
  const titleDiv = document.createElement('div');
  titleDiv.className = 'debug-title';
  titleDiv.textContent = `🐞 ${title}`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'debug-content';
  
  let content = '';
  if (typeof data === 'object') {
    try {
      content = JSON.stringify(data, null, 2);
    } catch (e) {
      content = String(data);
    }
  } else {
    content = String(data);
  }
  
  // Create a pre element for formatted display
  const pre = document.createElement('pre');
  pre.textContent = content;
  contentDiv.appendChild(pre);
  
  messageDiv.appendChild(titleDiv);
  messageDiv.appendChild(contentDiv);
  
  messagesEl.appendChild(messageDiv);
  scrollToBottom();
} 