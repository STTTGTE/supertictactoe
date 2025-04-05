require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const supabase = require('./supabase');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middleware
app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true
}));
app.use(helmet());
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseKey);

// Game state management
const games = new Map();
const waitingPlayers = new Map();

// AI Player class
class AIPlayer {
    constructor(difficulty = 'hard') {
        this.difficulty = difficulty;
    }

    getMove(game, lastMove) {
        if (this.difficulty === 'easy') {
            return this.getRandomMove(game);
        } else if (this.difficulty === 'medium') {
            return Math.random() < 0.7 ? this.getBestMove(game) : this.getRandomMove(game);
        } else {
            return this.getBestMove(game);
        }
    }

    getRandomMove(game) {
        const availableMoves = [];
        
        if (game.lastMove && !game.boardWinners[game.lastMove.cellIndex]) {
            for (let i = 0; i < 9; i++) {
                if (game.board[game.lastMove.cellIndex][i] === '') {
                    availableMoves.push({ boardIndex: game.lastMove.cellIndex, cellIndex: i });
                }
            }
        } else {
            for (let boardIndex = 0; boardIndex < 9; boardIndex++) {
                if (!game.boardWinners[boardIndex]) {
                    for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
                        if (game.board[boardIndex][cellIndex] === '') {
                            availableMoves.push({ boardIndex, cellIndex });
                        }
                    }
                }
            }
        }
        
        if (availableMoves.length === 0) return null;
        return availableMoves[Math.floor(Math.random() * availableMoves.length)];
    }

    getBestMove(game) {
        if (game.lastMove && !game.boardWinners[game.lastMove.cellIndex]) {
            const winningMove = this.findWinningMove(game, game.lastMove.cellIndex, 'O');
            if (winningMove) return winningMove;
            
            const blockingMove = this.findWinningMove(game, game.lastMove.cellIndex, 'X');
            if (blockingMove) return blockingMove;
            
            const strategicMove = this.getStrategicMove(game);
            if (strategicMove) return strategicMove;
        }
        
        return this.getRandomMove(game);
    }

    findWinningMove(game, boardIndex, symbol) {
        const board = game.board[boardIndex];
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];
        
        for (const line of lines) {
            const [a, b, c] = line;
            const count = [board[a], board[b], board[c]].filter(cell => cell === symbol).length;
            const empty = [board[a], board[b], board[c]].filter(cell => cell === '').length;
            
            if (count === 2 && empty === 1) {
                const emptyIndex = line[board[a] === '' ? 0 : board[b] === '' ? 1 : 2];
                return { boardIndex, cellIndex: emptyIndex };
            }
        }
        
        return null;
    }

    getStrategicMove(game) {
        if (game.lastMove && !game.boardWinners[game.lastMove.cellIndex]) {
            const board = game.board[game.lastMove.cellIndex];
            
            if (board[4] === '') {
                return { boardIndex: game.lastMove.cellIndex, cellIndex: 4 };
            }
            
            const corners = [0, 2, 6, 8];
            for (const corner of corners) {
                if (board[corner] === '') {
                    return { boardIndex: game.lastMove.cellIndex, cellIndex: corner };
                }
            }
            
            const edges = [1, 3, 5, 7];
            for (const edge of edges) {
                if (board[edge] === '') {
                    return { boardIndex: game.lastMove.cellIndex, cellIndex: edge };
                }
            }
        }
        
        return null;
    }
}

// Helper functions
function isValidMove(game, boardIndex, cellIndex) {
    if (game.gameOver) return false;
    if (game.boardWinners[boardIndex]) return false;
    if (game.board[boardIndex][cellIndex] !== '') return false;
    
    if (game.lastMove) {
        if (game.boardWinners[game.lastMove.cellIndex]) {
            return true;
        }
        return boardIndex === game.lastMove.cellIndex;
    }
    
    return true;
}

async function makeMove(game, boardIndex, cellIndex) {
    const playerIndex = game.currentPlayer;
    const symbol = playerIndex === 0 ? 'X' : 'O';
    
    game.board[boardIndex][cellIndex] = symbol;
    game.lastMove = { boardIndex, cellIndex };
    
    // Check if the current board is won
    if (checkBoardWin(game.board[boardIndex], symbol)) {
        game.boardWinners[boardIndex] = symbol;
        
        // Check if the game is won
        if (checkBoardWin(game.boardWinners, symbol)) {
            game.gameOver = true;
            game.winner = symbol;
            io.to(game.id).emit('gameOver', { winner: symbol });
            return;
        }
    }
    
    // Check for draw in the current board
    if (game.board[boardIndex].every(cell => cell !== '')) {
        game.boardWinners[boardIndex] = 'draw';
        
        // Check for overall game draw
        if (game.boardWinners.every(board => board !== '')) {
            game.gameOver = true;
            game.winner = 'draw';
            io.to(game.id).emit('gameOver', { winner: 'draw' });
            return;
        }
    }
    
    game.currentPlayer = (playerIndex + 1) % 2;
    io.to(game.id).emit('gameState', game);
    
    // Save game state to Supabase
    await saveGameState(game.id, game);
}

function checkBoardWin(board, symbol) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
        [0, 4, 8], [2, 4, 6] // diagonals
    ];
    
    return lines.some(line => 
        line.every(index => board[index] === symbol)
    );
}

async function saveGameState(gameId, gameState) {
    try {
        const { error } = await supabaseClient
            .from('games')
            .upsert({
                id: gameId,
                state: gameState,
                updated_at: new Date().toISOString()
            });
            
        if (error) throw error;
    } catch (error) {
        console.error('Error saving game state:', error);
    }
}

async function loadGameState(gameId) {
    try {
        const { data, error } = await supabaseClient
            .from('games')
            .select('state')
            .eq('id', gameId)
            .single();
            
        if (error) throw error;
        return data?.state || null;
    } catch (error) {
        console.error('Error loading game state:', error);
        return null;
    }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('reconnectToGame', async ({ gameId }) => {
        try {
            const savedState = await loadGameState(gameId);
            
            if (!savedState) {
                socket.emit('gameNotFound');
                return;
            }
            
            if (savedState.gameOver) {
                socket.emit('gameNotFound');
                return;
            }
            
            if (savedState.players[1] === 'AI') {
                savedState.ai = new AIPlayer(savedState.ai?.difficulty || 'hard');
            }
            
            games.set(gameId, savedState);
            socket.join(gameId);
            
            const playerIndex = savedState.players.indexOf(socket.id);
            if (playerIndex === -1) {
                socket.emit('gameState', { 
                    gameState: savedState,
                    symbol: null
                });
            } else {
                socket.emit('gameState', { 
                    gameState: savedState,
                    symbol: playerIndex === 0 ? 'X' : 'O'
                });
            }
        } catch (error) {
            console.error('Error in reconnectToGame:', error);
            socket.emit('gameNotFound');
        }
    });

    socket.on('findGame', async () => {
        const waitingPlayer = Array.from(waitingPlayers.entries())[0];
        
        if (waitingPlayer) {
            const [waitingId, waitingSocket] = waitingPlayer;
            waitingPlayers.delete(waitingId);
            
            const gameId = Math.random().toString(36).substring(2, 15);
            const gameState = {
                id: gameId,
                players: [waitingId, socket.id],
                currentPlayer: 0,
                board: Array(9).fill().map(() => Array(9).fill('')),
                boardWinners: Array(9).fill(''),
                lastMove: null
            };
            
            games.set(gameId, gameState);
            await saveGameState(gameId, gameState);

            waitingSocket.join(gameId);
            socket.join(gameId);

            io.to(waitingId).emit('gameStart', { gameId, symbol: 'X', opponent: socket.id });
            io.to(socket.id).emit('gameStart', { gameId, symbol: 'O', opponent: waitingId });
        } else {
            waitingPlayers.set(socket.id, socket);
            socket.emit('waiting');
        }
    });

    socket.on('startAIGame', async ({ difficulty }) => {
        const gameId = Math.random().toString(36).substring(2, 15);
        const gameState = {
            id: gameId,
            players: [socket.id, 'AI'],
            currentPlayer: 0,
            board: Array(9).fill().map(() => Array(9).fill('')),
            boardWinners: Array(9).fill(''),
            lastMove: null,
            ai: new AIPlayer(difficulty)
        };
        
        games.set(gameId, gameState);
        await saveGameState(gameId, gameState);

        socket.join(gameId);
        socket.emit('gameStart', { gameId, symbol: 'X', opponent: 'AI' });
    });

    socket.on('move', async ({ gameId, boardIndex, cellIndex }) => {
        if (!games.has(gameId)) {
            const savedState = await loadGameState(gameId);
            if (savedState) {
                if (savedState.players[1] === 'AI') {
                    savedState.ai = new AIPlayer(savedState.ai?.difficulty || 'hard');
                }
                games.set(gameId, savedState);
            }
        }
        
        const game = games.get(gameId);
        if (!game) return;

        const playerIndex = game.players.indexOf(socket.id);
        if (playerIndex === -1 || playerIndex !== game.currentPlayer) return;

        if (!isValidMove(game, boardIndex, cellIndex)) return;

        await makeMove(game, boardIndex, cellIndex);

        if (game.players[1] === 'AI' && !game.gameOver) {
            const aiMove = game.ai.getMove(game, game.lastMove);
            if (aiMove) {
                await makeMove(game, aiMove.boardIndex, aiMove.cellIndex);
            }
        }
    });

    socket.on('disconnect', async () => {
        if (waitingPlayers.has(socket.id)) {
            waitingPlayers.delete(socket.id);
        }
        
        for (const [gameId, game] of games.entries()) {
            if (game.players.includes(socket.id)) {
                io.to(gameId).emit('playerLeft');
                await saveGameState(gameId, game);
                games.delete(gameId);
            }
        }
    });

    // Handle rejoin game request
    socket.on('rejoinGame', ({ gameId }) => {
        console.log(`Player attempting to rejoin game ${gameId}`);
        
        // Find the game in the games map
        const game = games.get(gameId);
        if (!game) {
            console.log(`Game ${gameId} not found`);
            socket.emit('error', { message: 'Game not found' });
            return;
        }

        // Check if the game is still active
        if (game.status !== 'active') {
            console.log(`Game ${gameId} is no longer active`);
            socket.emit('error', { message: 'Game is no longer active' });
            return;
        }

        // Add the socket to the game room
        socket.join(gameId);
        
        // Send the current game state to the player
        socket.emit('gameState', {
            gameId: game.id,
            board: game.board,
            currentPlayer: game.currentPlayer,
            status: game.status,
            winner: game.winner,
            lastMove: game.lastMove
        });

        console.log(`Player successfully rejoined game ${gameId}`);
    });
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
