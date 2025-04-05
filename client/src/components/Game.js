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

    useEffect(() => {
        // Initialize socket connection
        const newSocket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:3000');
        setSocket(newSocket);

        // Check for saved game
        const savedGameId = localStorage.getItem('gameId');
        if (savedGameId) {
            reconnectToGame(savedGameId);
        }

        // Socket event listeners
        newSocket.on('gameStart', ({ gameId, symbol, opponent }) => {
            setGameId(gameId);
            setPlayerSymbol(symbol);
            setStatus('playing');
            localStorage.setItem('gameId', gameId);
            setMessage(`Game started! You are ${symbol}`);
        });

        newSocket.on('waiting', () => {
            setStatus('waiting');
            setMessage('Waiting for opponent...');
        });

        newSocket.on('gameState', ({ gameState, symbol }) => {
            setGameState(gameState);
            if (symbol) setPlayerSymbol(symbol);
            setStatus('playing');
        });

        newSocket.on('gameOver', ({ winner }) => {
            setStatus('gameOver');
            setMessage(winner === 'draw' ? "It's a draw!" : `${winner} wins!`);
            localStorage.removeItem('gameId');
        });

        newSocket.on('playerLeft', () => {
            setStatus('idle');
            setMessage('Opponent left the game');
            localStorage.removeItem('gameId');
        });

        newSocket.on('gameNotFound', () => {
            setStatus('idle');
            setMessage('Game not found');
            localStorage.removeItem('gameId');
        });

        return () => {
            newSocket.disconnect();
        };
    }, []);

    const reconnectToGame = (savedGameId) => {
        socket?.emit('reconnectToGame', { gameId: savedGameId });
    };

    const findGame = () => {
        socket?.emit('findGame');
    };

    const startAIGame = (difficulty) => {
        socket?.emit('startAIGame', { difficulty });
    };

    const makeMove = (boardIndex, cellIndex) => {
        if (!gameState || status !== 'playing') return;
        
        const isPlayerTurn = gameState.players[gameState.currentPlayer] === socket.id;
        if (!isPlayerTurn) return;

        socket?.emit('move', { gameId, boardIndex, cellIndex });
    };

    return (
        <div className="game-container">
            <h1>Super Tic Tac Toe</h1>
            <div className="status-message">{message}</div>
            
            {status === 'idle' && (
                <GameControls
                    onFindGame={findGame}
                    onStartAIGame={startAIGame}
                />
            )}

            {status === 'waiting' && (
                <div className="waiting-message">
                    Waiting for opponent...
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
                    onClick={() => {
                        setStatus('idle');
                        setGameState(null);
                        setMessage('');
                    }}
                >
                    New Game
                </button>
            )}
        </div>
    );
};

export default Game; 