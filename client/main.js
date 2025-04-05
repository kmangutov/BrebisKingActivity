import { DiscordSDK, Events, patchUrlMappings } from "@discord/embedded-app-sdk";
import GameCanvas from './GameCanvas.js';
import DotGame from './DotGame.js';
import rocketLogo from '/rocket.png';
import { 
  logDebug, 
  setupConsoleOverrides, 
  renderParticipants, 
  createDebugConsole,
  getAblyInstance,
  isInDiscordEnvironment,
  setupXHRErrorMonitoring
} from './utils.js';
import "./style.css";

// https://discord.com/developers/docs/activities/development-guides#instance-participants

// Will eventually store the authenticated user's access_token
let auth;
// Store participants data
let participants = [];
// Store the current active game
let currentGame = null;
// Store available games
let availableGames = [];
// Store the main app container
let appContainer;

// Store WebSocket server URL for consistency
const getWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
};

const discordSdk = new DiscordSDK(import.meta.env.DISCORD_CLIENT_ID);

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
  // Set up the app container
  document.querySelector('#app').innerHTML = `
    <div id="app-content"></div>
  `;
  
  appContainer = document.getElementById('app-content');
  
  // Create debug console
  createDebugConsole(appContainer);
  
  // Setup console overrides
  setupConsoleOverrides();
  
  // Set up XHR error monitoring
  setupXHRErrorMonitoring();
  
  // Log initial info
  logDebug('Application initialized');
  logDebug(`Discord instanceId: ${discordSdk.instanceId}`);
  
  // Apply URL mappings for Discord sandbox (for Ably)
  try {
    // Check if we're in Discord's environment
    const isProd = isInDiscordEnvironment();
    
    if (isProd) {
      logDebug('Running in Discord - applying URL mappings for Ably');
      // Use the patchUrlMappings API to route Ably requests through Discord's proxy
      await patchUrlMappings([
        { prefix: '/ably', target: 'realtime.ably.io' },
        { prefix: '/ably-rest', target: 'rest.ably.io' },
        { prefix: '/ably-healthcheck', target: 'internet-up.ably-realtime.com' }
      ]);
      logDebug('URL mappings applied successfully');
    }
  } catch (error) {
    logDebug(`Failed to apply URL mappings: ${error.message}`, 'error');
  }
  
  // Initialize Ably early
  try {
    logDebug('Initializing Ably connection...', 'info');
    
    // Log environment for troubleshooting
    const envDetails = {
      isInDiscord: isInDiscordEnvironment(),
      clientId: discordSdk?.instanceId,
      protocol: window.location.protocol,
      host: window.location.host,
      userAgent: navigator.userAgent
    };
    logDebug(`Environment details: ${JSON.stringify(envDetails)}`, 'info');
    
    const ably = getAblyInstance();
    logDebug('Ably initialized successfully');
    
    // Log Ably connection state
    ably.connection.on('connected', () => {
      logDebug('Ably connected!');
      
      // Log connection details
      const connDetails = {
        id: ably.connection.id,
        key: ably.connection.key,
        recoveryKey: ably.connection.recoveryKey ? 'available' : 'not available',
        state: ably.connection.state,
        errorReason: ably.connection.errorReason ? 
                     ably.connection.errorReason.message : 'none'
      };
      logDebug(`Connection details: ${JSON.stringify(connDetails)}`, 'info');
    });
    
    // Add fallback for persistent connection issues
    let connectionAttempts = 0;
    const checkConnectionState = () => {
      connectionAttempts++;
      const state = ably.connection.state;
      
      if (state === 'connected') {
        logDebug('Ably connection verified as connected');
        return; // Success
      } else if (connectionAttempts > 3) {
        logDebug(`Ably still not connected after ${connectionAttempts} checks, state: ${state}`, 'warning');
        logDebug('Applying emergency fallback for Ably connectivity issues', 'warning');
        
        // Create a mock Ably implementation with minimal functionality
        // This allows the app to run without Ably when it's unavailable
        const mockAbly = {
          connection: {
            state: 'connected',
            id: 'mock-connection',
            on: () => {}
          },
          channels: {
            get: (channelName) => ({
              name: channelName,
              subscribe: async (eventName, callback) => {
                logDebug(`Mock subscription to ${eventName} on ${channelName}`, 'info');
                return true;
              },
              publish: async (eventName, data) => {
                logDebug(`Mock publish to ${eventName} on ${channelName}`, 'info');
                return true;
              }
            })
          },
          close: () => {}
        };
        
        // Replace the actual instance with our mock
        window.__mockAblyFallback = mockAbly;
        logDebug('Fallback mock Ably instance activated due to connection issues', 'warning');
      } else {
        // Try again after a delay
        setTimeout(checkConnectionState, 5000);
      }
    };
    
    // Check connection status after a delay
    setTimeout(checkConnectionState, 5000);
  } catch (error) {
    logDebug(`Failed to initialize Ably: ${error.message}`, 'error');
    logDebug(`Error stack: ${error.stack || 'No stack trace available'}`, 'error');
  }
  
  setupDiscordSdk().then(() => {
    logDebug("Discord SDK is authenticated");
    logDebug(`Using instance ID: ${discordSdk.instanceId}`);
    
    // Fetch initial participants
    fetchParticipants();
    
    // Fetch available games and show the lobby once they're loaded
    fetchAvailableGames()
      .then(() => {
        // Shows the lobby only after games are fetched
        showLobby();
      })
      .catch(error => {
        logDebug(`Error loading games: ${error.message}`, 'error');
        // Still show the lobby with fallback games
        showLobby();
      });
    
    // Subscribe to participant updates
    discordSdk.subscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, updateParticipants);
  }).catch(error => {
    logDebug(`Failed to setup Discord SDK: ${error.message}`, 'error');
  });
});

async function setupDiscordSdk() {
  await discordSdk.ready();
  logDebug("Discord SDK is ready");

  // Authorize with Discord Client
  const { code } = await discordSdk.commands.authorize({
    client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: [
      "identify",
      "guilds",
      "applications.commands"
    ],
  });

  // Retrieve an access_token from your activity's server
  const response = await fetch("/.proxy/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
    }),
  });
  const { access_token } = await response.json();

  // Authenticate with Discord client (using the access_token)
  auth = await discordSdk.commands.authenticate({
    access_token,
  });

  if (auth == null) {
    throw new Error("Authenticate command failed");
  }
}

// Fetch participants in the activity
async function fetchParticipants() {
  try {
    const response = await discordSdk.commands.getInstanceConnectedParticipants();
    // Check what structure we're getting back
    logDebug(`Participants response structure: ${JSON.stringify(response)}`);
    
    // Handle different response structures
    if (Array.isArray(response)) {
      participants = response;
    } else if (response && typeof response === 'object') {
      // If it's an object, try to find the participants array
      // It might be in a property like 'users', 'participants', etc.
      if (response.users) {
        participants = response.users;
      } else if (response.participants) {
        participants = response.participants;
      } else {
        // Just log the keys we have
        const keys = Object.keys(response);
        logDebug(`Available keys in response: ${keys.join(', ')}`, 'warning');
        participants = [];
      }
    } else {
      // Fallback to empty array if we can't determine the structure
      logDebug('Unable to parse participants response', 'error');
      participants = [];
    }
    
    logDebug(`Fetched ${participants.length} participants`);
    renderParticipants(participants);
  } catch (error) {
    logDebug(`Failed to fetch participants: ${error.message}`, 'error');
    logDebug(`Error stack: ${error.stack}`, 'error');
    participants = [];
    renderParticipants(participants);
  }
}

// Update participants when they change
function updateParticipants(newParticipants) {
  logDebug(`Participants update received: ${JSON.stringify(newParticipants)}`);
  
  // Similar handling as in fetchParticipants
  if (Array.isArray(newParticipants)) {
    participants = newParticipants;
  } else if (newParticipants && typeof newParticipants === 'object') {
    if (newParticipants.users) {
      participants = newParticipants.users;
    } else if (newParticipants.participants) {
      participants = newParticipants.participants;
    } else {
      const keys = Object.keys(newParticipants);
      logDebug(`Available keys in update: ${keys.join(', ')}`, 'warning');
      // Don't update participants if we can't determine the structure
      return;
    }
  } else {
    logDebug('Unable to parse participants update', 'error');
    return;
  }
  
  logDebug(`Participants updated: ${participants.length} users in activity`);
  renderParticipants(participants);
}

// Fetch available games from the server
async function fetchAvailableGames() {
  try {
    const response = await fetch('/.proxy/api/games');
    availableGames = await response.json();
    logDebug(`Fetched ${availableGames.length} available games`);
  } catch (error) {
    logDebug(`Failed to fetch available games: ${error.message}`, 'error');
    // Set default available games if fetch fails
    availableGames = [
      { id: 'canvas', name: 'Simple Canvas', description: 'A collaborative drawing canvas' },
      { id: 'dotgame', name: 'Dot Game', description: 'Simple multiplayer dot visualization' },
      { id: 'lobby', name: 'Lobby', description: 'The default lobby' }
    ];
    // Log what we're using as fallback
    logDebug(`Using ${availableGames.length} fallback games instead`);
  }
  
  // Return available games for promise chaining
  return availableGames;
}

// Show the lobby UI
function showLobby() {
  // Clean up any existing game
  if (currentGame && currentGame.destroy) {
    currentGame.destroy();
    currentGame = null;
  }
  
  // Clear the app container and preserve the debug console
  const debugConsole = document.getElementById('debug-console');
  appContainer.innerHTML = '';
  if (debugConsole) {
    appContainer.appendChild(debugConsole);
  }
  
  // Create lobby header
  const header = document.createElement('div');
  header.className = 'lobby-header';
  
  const title = document.createElement('h1');
  title.textContent = 'Discord Activity Lobby';
  header.appendChild(title);
  
  const subtitle = document.createElement('p');
  subtitle.textContent = 'Select a game to play:';
  header.appendChild(subtitle);
  
  appContainer.appendChild(header);
  
  // Create game selection
  const gameSelector = document.createElement('div');
  gameSelector.className = 'game-selector';
  
  // Log what games are available before rendering
  logDebug(`Rendering ${availableGames.length} games in the lobby`);
  logDebug(`Available games: ${JSON.stringify(availableGames)}`);
  
  // Check if we have any displayable games
  const displayableGames = availableGames.filter(game => game.id !== 'lobby');
  
  // Display message if no games are available to select
  if (displayableGames.length === 0) {
    const noGamesMessage = document.createElement('div');
    noGamesMessage.className = 'no-games-message';
    noGamesMessage.textContent = 'No games are currently available to play.';
    gameSelector.appendChild(noGamesMessage);
    
    // Add retry button
    const retryButton = document.createElement('button');
    retryButton.textContent = 'Retry Loading Games';
    retryButton.className = 'canvas-button';
    retryButton.addEventListener('click', () => {
      fetchAvailableGames()
        .then(() => {
          showLobby();
        });
    });
    gameSelector.appendChild(retryButton);
  } else {
    // Render game cards for each game
    displayableGames.forEach(game => {
      const gameCard = document.createElement('div');
      gameCard.className = 'game-card';
      gameCard.addEventListener('click', () => startGame(game.id));
      
      const gameTitle = document.createElement('h2');
      gameTitle.textContent = game.name;
      gameCard.appendChild(gameTitle);
      
      const gameDescription = document.createElement('p');
      gameDescription.textContent = game.description;
      gameCard.appendChild(gameDescription);
      
      gameSelector.appendChild(gameCard);
    });
  }
  
  appContainer.appendChild(gameSelector);
  
  // Create the participants sidebar
  const sidebarContainer = document.createElement('div');
  sidebarContainer.className = 'sidebar-container';
  
  const participantsHeader = document.createElement('h2');
  participantsHeader.textContent = 'Participants';
  sidebarContainer.appendChild(participantsHeader);
  
  const participantsList = document.createElement('div');
  participantsList.id = 'participants-list';
  participantsList.className = 'participants-list';
  sidebarContainer.appendChild(participantsList);
  
  appContainer.appendChild(sidebarContainer);
  
  // Render participants in the sidebar
  renderParticipants(participants);
}

// Start a game
function startGame(gameId) {
  logDebug(`Starting game: ${gameId}`);
  
  // Clean up any existing game
  if (currentGame && currentGame.destroy) {
    currentGame.destroy();
    currentGame = null;
  }
  
  // Clear the app container and preserve the debug console
  const debugConsole = document.getElementById('debug-console');
  appContainer.innerHTML = '';
  if (debugConsole) {
    appContainer.appendChild(debugConsole);
  }
  
  // Create game container
  const gameContainer = document.createElement('div');
  gameContainer.className = 'game-container';
  appContainer.appendChild(gameContainer);
  
  // Create sidebar (will include participants)
  const sidebarContainer = document.createElement('div');
  sidebarContainer.className = 'sidebar-container game-sidebar';
  
  const participantsHeader = document.createElement('h2');
  participantsHeader.textContent = 'Participants';
  sidebarContainer.appendChild(participantsHeader);
  
  const participantsList = document.createElement('div');
  participantsList.id = 'participants-list';
  participantsList.className = 'participants-list';
  sidebarContainer.appendChild(participantsList);
  
  appContainer.appendChild(sidebarContainer);
  
  // Get current user ID from auth
  const userId = auth?.user?.id || 'anonymous';
  
  // Log important information for multiplayer
  logDebug(`Starting ${gameId} for user ${userId} in instance ${discordSdk.instanceId}`);
  
  // Initialize the appropriate game
  if (gameId === 'canvas') {
    try {
      // Create the GameCanvas instance
      currentGame = new GameCanvas(
        gameContainer, 
        discordSdk.instanceId, 
        userId, 
        () => showLobby() // Callback to return to lobby
      );
    } catch (error) {
      logDebug(`Error initializing Canvas game: ${error.message}`, 'error');
      showGameError(gameContainer, error, gameId);
    }
  } else if (gameId === 'dotgame') {
    try {
      // Initialize the dot game using our new DotGame class
      currentGame = new DotGame(
        gameContainer,
        discordSdk.instanceId,
        userId,
        () => showLobby() // Callback to return to lobby
      );
    } catch (error) {
      logDebug(`Error initializing Dot game: ${error.message}`, 'error');
      showGameError(gameContainer, error, gameId);
    }
  } else {
    // Handle unknown game type
    showGameError(gameContainer, new Error(`Unknown game type: ${gameId}`), gameId);
  }
  
  // Render participants in the sidebar
  renderParticipants(participants);
}

// Helper function to show game errors
function showGameError(container, error, gameId) {
  container.innerHTML = `
    <div class="error-message">
      <h3>Error starting ${gameId}</h3>
      <p>${error.message}</p>
      <div class="error-details">
        <p>Please check the following:</p>
        <ul>
          <li>Your network connection is working</li>
          <li>The WebSocket server is running at ${getWebSocketUrl()}</li>
          <li>You have permissions to access this activity</li>
        </ul>
      </div>
    </div>
  `;
  
  // Add a button to return to lobby
  const backButton = document.createElement('button');
  backButton.textContent = 'Back to Lobby';
  backButton.className = 'canvas-button';
  backButton.addEventListener('click', showLobby);
  container.appendChild(backButton);
  
  // Add a retry button
  const retryButton = document.createElement('button');
  retryButton.textContent = 'Retry';
  retryButton.className = 'canvas-button';
  retryButton.addEventListener('click', () => startGame(gameId));
  container.appendChild(retryButton);
}
