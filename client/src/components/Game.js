import React, { useState, useEffect } from 'react';
import Board from './Board';
import GameControls from './GameControls';
import '../styles/Game.css';

const Game = () => {
    const [socket, setSocket] = useState(null);
    const [gameState, setGameState] = useState(null);
    const [playerSymbol, setPlayerSymbol] = useState(null);
    const [gameId, setGameId] = useState(null);
    const [status, setStatus] = useState('idle'); // idle, waiting, playing, gameOver
    const [message, setMessage] = useState('');
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('disconnected');

    useEffect(() => {
        console.log('Connecting to server:', process.env.REACT_APP_SERVER_URL);
        const newSocket = io(process.env.REACT_APP_SERVER_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 10000
        });
        
        setSocket(newSocket);

        // Connection event handlers
        newSocket.on('connect', () => {
            console.log('Socket connected successfully');
            setConnectionStatus('connected');
            setMessage('Connected to server');
            
            // Check for saved game on initial connection
            const savedGameId = localStorage.getItem('gameId');
            if (savedGameId) {
                setIsReconnecting(true);
                reconnectToGame(savedGameId);
            }
        });

        newSocket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            setConnectionStatus('error');
            setMessage(`Connection error: ${error.message}`);
        });

        newSocket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            setConnectionStatus('disconnected');
            setMessage(`Disconnected: ${reason}`);
        });

        newSocket.on('reconnect', (attemptNumber) => {
            console.log('Socket reconnected after', attemptNumber, 'attempts');
            setConnectionStatus('reconnected');
            setMessage(`Reconnected after ${attemptNumber} attempts`);
            
            // Attempt to rejoin the game if we were in one
            const savedGameId = localStorage.getItem('gameId');
            if (savedGameId) {
                reconnectToGame(savedGameId);
            }
        });

        newSocket.on('reconnect_attempt', (attemptNumber) => {
            console.log('Reconnection attempt', attemptNumber);
            setConnectionStatus('reconnecting');
            setMessage(`Reconnecting... Attempt ${attemptNumber}`);
        });

        newSocket.on('reconnect_error', (error) => {
            console.error('Reconnection error:', error);
            setConnectionStatus('error');
            setMessage(`Reconnection error: ${error.message}`);
        });

        newSocket.on('reconnect_failed', () => {
            console.error('Failed to reconnect');
            setConnectionStatus('error');
            setMessage('Failed to reconnect - Please refresh the page');
        });

        // Game event handlers
        newSocket.on('gameStart', ({ gameId, symbol, opponent }) => {
            setGameId(gameId);
            setPlayerSymbol(symbol);
            setStatus('playing');
            localStorage.setItem('gameId', gameId);
            setMessage(`Game started! You are ${symbol}`);
            setIsReconnecting(false);
        });

        newSocket.on('waiting', () => {
            setStatus('waiting');
            setMessage('Waiting for opponent...');
            setIsReconnecting(false);
        });

        newSocket.on('gameState', (state) => {
            setGameState(state);
            setStatus('playing');
            setIsReconnecting(false);
            setConnectionStatus('connected');
            setMessage('Game in progress');
        });

        newSocket.on('gameOver', ({ winner }) => {
            setStatus('gameOver');
            setMessage(winner === 'draw' ? "It's a draw!" : `${winner} wins!`);
            localStorage.removeItem('gameId');
            setIsReconnecting(false);
        });

        newSocket.on('playerLeft', () => {
            setStatus('idle');
            setMessage('Opponent left the game');
            localStorage.removeItem('gameId');
            setIsReconnecting(false);
        });

        newSocket.on('error', ({ message }) => {
            setMessage(message);
            if (message.includes('not found') || message.includes('no longer active')) {
                localStorage.removeItem('gameId');
                setIsReconnecting(false);
                setStatus('idle');
            }
        });

        return () => {
            newSocket.disconnect();
        };
    }, []);

    const reconnectToGame = (savedGameId) => {
        if (socket) {
            socket.emit('rejoinGame', { gameId: savedGameId });
        }
    };

    const findGame = () => {
        setStatus('waiting');
        setMessage('Finding opponent...');
        socket?.emit('findGame');
    };

    const startAIGame = (difficulty) => {
        setStatus('waiting');
        setMessage('Starting AI game...');
        socket?.emit('startAIGame', { difficulty });
    };

    const makeMove = (boardIndex, cellIndex) => {
        if (!gameState || status !== 'playing') return;
        
        const isPlayerTurn = gameState.players[gameState.currentPlayer] === socket.id;
        if (!isPlayerTurn) return;

        socket?.emit('move', { gameId, boardIndex, cellIndex });
    };

    const startNewGame = () => {
        setStatus('idle');
        setGameState(null);
        setMessage('');
        setGameId(null);
        setPlayerSymbol(null);
        localStorage.removeItem('gameId');
    };

    return (
        <div className="game-container">
            <h1>Super Tic Tac Toe</h1>
            <div className={`connection-status ${connectionStatus}`}>
                {connectionStatus === 'connected' && 'Connected'}
                {connectionStatus === 'disconnected' && 'Disconnected'}
                {connectionStatus === 'error' && 'Connection Error'}
                {connectionStatus === 'reconnecting' && 'Reconnecting...'}
                {connectionStatus === 'reconnected' && 'Reconnected'}
            </div>
            <div className="status-message">{message}</div>
            
            {status === 'idle' && (
                <GameControls
                    onFindGame={findGame}
                    onStartAIGame={startAIGame}
                />
            )}

            {status === 'waiting' && (
                <div className="waiting-message">
                    {isReconnecting ? 'Reconnecting to game...' : 'Waiting for opponent...'}
                </div>
            )}

            {gameState && (
                <Board
                    board={gameState.board}
                    boardWinners={gameState.boardWinners}
                    lastMove={gameState.lastMove}
                    onCellClick={makeMove}
                    disabled={status !== 'playing' || gameState.players[gameState.currentPlayer] !== socket?.id}
                />
            )}

            {status === 'gameOver' && (
                <button
                    className="new-game-button"
                    onClick={startNewGame}
                >
                    New Game
                </button>
            )}
        </div>
    );
};

export default Game; 