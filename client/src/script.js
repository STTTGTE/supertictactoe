// Add connection status element
const connectionStatus = document.createElement('div');
connectionStatus.className = 'connection-status';
document.querySelector('.game-container').insertBefore(connectionStatus, document.querySelector('.status-message'));

// Socket.IO connection handling
socket.on('connect', () => {
    console.log('Connected to server');
    connectionStatus.textContent = 'Connected';
    connectionStatus.style.backgroundColor = '#d4edda';
    connectionStatus.style.color = '#155724';
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    connectionStatus.textContent = 'Disconnected - Attempting to reconnect...';
    connectionStatus.style.backgroundColor = '#fff3cd';
    connectionStatus.style.color = '#856404';
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    connectionStatus.textContent = 'Connection error - Retrying...';
    connectionStatus.style.backgroundColor = '#f8d7da';
    connectionStatus.style.color = '#721c24';
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
    connectionStatus.textContent = 'Reconnected';
    connectionStatus.style.backgroundColor = '#cce5ff';
    connectionStatus.style.color = '#004085';
    
    // Attempt to rejoin the game if we were in one
    if (gameState && gameState.gameId) {
        socket.emit('rejoinGame', { gameId: gameState.gameId });
    }
});

socket.on('reconnect_attempt', (attemptNumber) => {
    console.log('Reconnection attempt', attemptNumber);
    connectionStatus.textContent = `Reconnecting... Attempt ${attemptNumber}`;
});

socket.on('reconnect_error', (error) => {
    console.error('Reconnection error:', error);
});

socket.on('reconnect_failed', () => {
    console.error('Failed to reconnect');
    connectionStatus.textContent = 'Failed to reconnect - Please refresh the page';
    connectionStatus.style.backgroundColor = '#f8d7da';
    connectionStatus.style.color = '#721c24';
});

// Update the rejoinGame handler
socket.on('gameState', (state) => {
    console.log('Received game state:', state);
    gameState = state;
    updateUI();
    
    // Clear any error messages when we successfully receive game state
    connectionStatus.textContent = 'Connected';
    connectionStatus.style.backgroundColor = '#d4edda';
    connectionStatus.style.color = '#155724';
}); 