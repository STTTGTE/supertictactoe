import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import Board from './Board';
import '../styles/Game.css';
import { 
  GameState, 
  PlayerSymbol, 
  GameStatus, 
  ConnectionStatus, 
  AIDifficulty,
  GameStartEvent,
  GameOverEvent,
  ErrorEvent
} from '../types/game';

const Game: React.FC = () => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [playerSymbol, setPlayerSymbol] = useState<PlayerSymbol | null>(null);
    const [gameId, setGameId] = useState<string | null>(null);
    const [status, setStatus] = useState<GameStatus>('idle');
    const [message, setMessage] = useState<string>('');
    const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

    useEffect(() => {
        const newSocket = io('http://localhost:3001', {
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

        newSocket.on('connect_error', (error: Error) => {
            console.error('Socket connection error:', error);
            setConnectionStatus('error');
            setMessage(`Connection error: ${error.message}`);
        });

        newSocket.on('disconnect', (reason: string) => {
            console.log('Socket disconnected:', reason);
            setConnectionStatus('disconnected');
            setMessage(`Disconnected: ${reason}`);
        });

        newSocket.on('reconnect', (attemptNumber: number) => {
            console.log('Socket reconnected after', attemptNumber, 'attempts');
            setConnectionStatus('reconnected');
            setMessage(`Reconnected after ${attemptNumber} attempts`);
            
            // Attempt to rejoin the game if we were in one
            const savedGameId = localStorage.getItem('gameId');
            if (savedGameId) {
                reconnectToGame(savedGameId);
            }
        });

        newSocket.on('reconnect_attempt', (attemptNumber: number) => {
            console.log('Reconnection attempt', attemptNumber);
            setConnectionStatus('reconnecting');
            setMessage(`Reconnecting... Attempt ${attemptNumber}`);
        });

        newSocket.on('reconnect_error', (error: Error) => {
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
        newSocket.on('gameStart', ({ gameId, symbol, opponent }: GameStartEvent) => {
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

        newSocket.on('gameState', (state: GameState) => {
            setGameState(state);
            setStatus('playing');
            setIsReconnecting(false);
            setConnectionStatus('connected');
            setMessage('Game in progress');
        });

        newSocket.on('gameOver', ({ winner }: GameOverEvent) => {
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

        newSocket.on('error', ({ message }: ErrorEvent) => {
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

    const reconnectToGame = (savedGameId: string): void => {
        if (socket) {
            socket.emit('rejoinGame', { gameId: savedGameId });
        }
    };

    const findGame = (): void => {
        setStatus('waiting');
        setMessage('Finding opponent...');
        socket?.emit('findGame');
    };

    const startAIGame = (difficulty: AIDifficulty): void => {
        setStatus('waiting');
        setMessage('Starting AI game...');
        socket?.emit('startAIGame', { difficulty });
    };

    const makeMove = (boardIndex: number, cellIndex: number): void => {
        if (!gameState || status !== 'playing') return;
        
        const isPlayerTurn = gameState.players[gameState.currentPlayer] === socket?.id;
        if (!isPlayerTurn) return;

        socket?.emit('move', { gameId, boardIndex, cellIndex });
    };

    const startNewGame = (): void => {
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
                <div className="game-controls">
                    <button onClick={findGame}>Find Game</button>
                    <button onClick={() => startAIGame('easy')}>Play vs Easy AI</button>
                    <button onClick={() => startAIGame('medium')}>Play vs Medium AI</button>
                    <button onClick={() => startAIGame('hard')}>Play vs Hard AI</button>
                </div>
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