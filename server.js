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
const userSockets = new Map(); // Map to track user IDs to socket IDs

// AI Player class
class AIPlayer {
    constructor(difficulty = 'hard') {
        this.difficulty = difficulty;
    }

    getMove(game, lastMove) {
        if (this.difficulty === 'easy') {
            return this.getRandomMove(game);
        } else if (this.difficulty === 'medium') {
            return Math.random() < 0.7 ? this.getBestMove(game, lastMove) : this.getRandomMove(game);
        } else {
            return this.getBestMove(game, lastMove);
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

    getBestMove(game, lastMove) {
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

// Socket.io connection handling
io.on('connection', async (socket) => {
    console.log('New client connected:', socket.id);
    
    // Extract user information from socket auth
    const userId = socket.handshake.auth.userId || 'guest';
    const username = socket.handshake.auth.username || 'Guest';
    
    // Store the socket ID for this user
    userSockets.set(userId, socket.id);
    
    // If this is a returning user, check if they have any active games
    if (userId !== 'guest') {
        try {
            // Check if user has any active games in the database
            const { data: activeGames, error } = await supabaseClient
                .from('games')
                .select('id, state')
                .eq('state->>status', 'playing')
                .eq('state->>players->>X', userId)
                .or(`state->>players->>O.eq.${userId}`);
            
            if (error) {
                console.error('Error fetching active games:', error);
            } else if (activeGames && activeGames.length > 0) {
                // Notify the client about active games
                socket.emit('activeGames', activeGames);
            }
        } catch (error) {
            console.error('Error checking for active games:', error);
        }
    }

    // Handle finding a game
    socket.on('findGame', () => {
        console.log(`Player ${username} (${userId}) is looking for a game`);
        
        // Check if there's a waiting player
        if (waitingPlayers.size > 0) {
            const [waitingPlayerId, waitingPlayerData] = waitingPlayers.entries().next().value;
            waitingPlayers.delete(waitingPlayerId);
            
            // Create a new game
            const gameId = createGame(waitingPlayerId, socket.id, waitingPlayerData.username, username);
            
            // Notify both players
            io.to(waitingPlayerId).emit('gameStart', { 
                gameId, 
                symbol: 'X',
                opponent: username
            });
            
            io.to(socket.id).emit('gameStart', { 
                gameId, 
                symbol: 'O',
                opponent: waitingPlayerData.username
            });
        } else {
            // Add this player to the waiting list
            waitingPlayers.set(socket.id, { username, userId });
            socket.emit('waiting');
        }
    });

    // Handle starting an AI game
    socket.on('startAIGame', ({ difficulty }) => {
        console.log(`Player ${username} (${userId}) is starting an AI game with difficulty: ${difficulty}`);
        
        // Create a new game with AI
        const gameId = createGameWithAI(socket.id, username, difficulty);
        
        // Notify the player
        socket.emit('gameStart', { 
            gameId, 
            symbol: 'X',
            opponent: 'AI'
        });
    });

    // Handle making a move
    socket.on('move', ({ gameId, boardIndex, cellIndex }) => {
        const game = games.get(gameId);
        if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        
        // Check if it's the player's turn
        const currentPlayer = game.state.currentPlayer;
        const playerSymbol = game.state.players[currentPlayer] === socket.id ? currentPlayer : null;
        
        if (!playerSymbol) {
            socket.emit('error', { message: 'Not your turn' });
            return;
        }
        
        // Make the move
        const moveResult = makeMove(game, boardIndex, cellIndex);
        
        if (moveResult.error) {
            socket.emit('error', { message: moveResult.error });
            return;
        }
        
        // Update the game state
        games.set(gameId, game);
        
        // Save the game state to the database
        saveGameToDatabase(gameId, game.state);
        
        // Notify all players in the game
        io.to(gameId).emit('gameState', game.state);
        
        // Check if the game is over
        if (moveResult.gameOver) {
            io.to(gameId).emit('gameOver', { winner: moveResult.winner });
            
            // Remove the game from memory
            games.delete(gameId);
        } else if (game.state.isAI && game.state.currentPlayer === 'O') {
            // If it's an AI game and it's the AI's turn, make the AI move
            setTimeout(() => {
                const aiMove = game.aiPlayer.getMove(game.state, { boardIndex, cellIndex });
                const aiMoveResult = makeMove(game, aiMove.boardIndex, aiMove.cellIndex);
                
                if (!aiMoveResult.error) {
                    // Update the game state
                    games.set(gameId, game);
                    
                    // Save the game state to the database
                    saveGameToDatabase(gameId, game.state);
                    
                    // Notify all players in the game
                    io.to(gameId).emit('gameState', game.state);
                    
                    // Check if the game is over
                    if (aiMoveResult.gameOver) {
                        io.to(gameId).emit('gameOver', { winner: aiMoveResult.winner });
                        
                        // Remove the game from memory
                        games.delete(gameId);
                    }
                }
            }, 1000); // Add a delay to make the AI move feel more natural
        }
    });

    // Handle rejoining a game
    socket.on('rejoinGame', ({ gameId }) => {
        console.log(`Player ${username} (${userId}) is trying to rejoin game: ${gameId}`);
        
        // Check if the game exists
        const game = games.get(gameId);
        if (!game) {
            // Check if the game exists in the database
            supabaseClient
                .from('games')
                .select('state')
                .eq('id', gameId)
                .single()
                .then(({ data, error }) => {
                    if (error) {
                        console.error('Error fetching game from database:', error);
                        socket.emit('error', { message: 'Game not found' });
                        return;
                    }
                    
                    if (!data) {
                        socket.emit('error', { message: 'Game not found' });
                        return;
                    }
                    
                    // Add the game back to memory
                    games.set(gameId, { state: data.state });
                    
                    // Join the game room
                    socket.join(gameId);
                    
                    // Send the game state to the player
                    socket.emit('gameState', data.state);
                    
                    // Check if the game is over
                    if (data.state.status === 'gameOver') {
                        socket.emit('gameOver', { winner: data.state.winner });
                    }
                });
            return;
        }
        
        // Join the game room
        socket.join(gameId);
        
        // Send the game state to the player
        socket.emit('gameState', game.state);
        
        // Check if the game is over
        if (game.state.status === 'gameOver') {
            socket.emit('gameOver', { winner: game.state.winner });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        // Remove the user from the waiting list if they were waiting
        if (waitingPlayers.has(socket.id)) {
            waitingPlayers.delete(socket.id);
        }
        
        // Remove the user from the userSockets map
        for (const [userId, socketId] of userSockets.entries()) {
            if (socketId === socket.id) {
                userSockets.delete(userId);
                break;
            }
        }
        
        // Check if the user was in a game
        for (const [gameId, game] of games.entries()) {
            const playerX = game.state.players.X;
            const playerO = game.state.players.O;
            
            if (playerX === socket.id || playerO === socket.id) {
                // Notify the other player
                const otherPlayerId = playerX === socket.id ? playerO : playerX;
                io.to(otherPlayerId).emit('playerLeft');
                
                // Update the game state
                game.state.status = 'gameOver';
                game.state.winner = playerX === socket.id ? 'O' : 'X';
                
                // Save the game state to the database
                saveGameToDatabase(gameId, game.state);
                
                // Remove the game from memory
                games.delete(gameId);
                break;
            }
        }
    });
});

// Helper function to create a new game
function createGame(playerXId, playerOId, playerXName, playerOName) {
    const gameId = generateGameId();
    const game = {
        state: {
            board: Array(9).fill().map(() => Array(9).fill(null)),
            boardWinners: Array(9).fill(null),
            currentPlayer: 'X',
            lastMove: null,
            players: {
                X: playerXId,
                O: playerOId
            },
            playerNames: {
                X: playerXName,
                O: playerOName
            },
            status: 'playing',
            winner: null
        }
    };
    
    games.set(gameId, game);
    
    // Join both players to the game room
    io.sockets.sockets.get(playerXId)?.join(gameId);
    io.sockets.sockets.get(playerOId)?.join(gameId);
    
    // Save the game to the database
    saveGameToDatabase(gameId, game.state);
    
    return gameId;
}

// Helper function to create a new game with AI
function createGameWithAI(playerId, playerName, difficulty) {
    const gameId = generateGameId();
    const game = {
        state: {
            board: Array(9).fill().map(() => Array(9).fill(null)),
            boardWinners: Array(9).fill(null),
            currentPlayer: 'X',
            lastMove: null,
            players: {
                X: playerId,
                O: 'AI'
            },
            playerNames: {
                X: playerName,
                O: 'AI'
            },
            status: 'playing',
            winner: null
        },
        isAI: true,
        aiPlayer: new AIPlayer(difficulty)
    };
    
    games.set(gameId, game);
    
    // Join the player to the game room
    io.sockets.sockets.get(playerId)?.join(gameId);
    
    // Save the game to the database
    saveGameToDatabase(gameId, game.state);
    
    return gameId;
}

// Helper function to make a move
function makeMove(game, boardIndex, cellIndex) {
    // Check if the move is valid
    if (boardIndex < 0 || boardIndex > 8 || cellIndex < 0 || cellIndex > 8) {
        return { error: 'Invalid move' };
    }
    
    // Check if the cell is already occupied
    if (game.state.board[boardIndex][cellIndex] !== null) {
        return { error: 'Cell already occupied' };
    }
    
    // Check if the board is already won
    if (game.state.boardWinners[boardIndex] !== null) {
        return { error: 'Board already won' };
    }
    
    // Check if the player is forced to play in a specific board
    if (game.state.lastMove !== null) {
        const lastCellIndex = game.state.lastMove.cellIndex;
        const forcedBoardIndex = lastCellIndex;
        
        if (game.state.boardWinners[forcedBoardIndex] === null && boardIndex !== forcedBoardIndex) {
            return { error: 'You must play in the board indicated by the last move' };
        }
    }
    
    // Make the move
    const currentPlayer = game.state.currentPlayer;
    game.state.board[boardIndex][cellIndex] = currentPlayer;
    game.state.lastMove = { boardIndex, cellIndex };
    
    // Check if the board is won
    const boardWinner = checkBoardWinner(game.state.board[boardIndex]);
    if (boardWinner) {
        game.state.boardWinners[boardIndex] = boardWinner;
    }
    
    // Check if the game is won
    const gameWinner = checkBoardWinner(game.state.boardWinners);
    if (gameWinner) {
        game.state.status = 'gameOver';
        game.state.winner = gameWinner;
        return { gameOver: true, winner: gameWinner };
    }
    
    // Check if the game is a draw
    if (isGameDraw(game.state)) {
        game.state.status = 'gameOver';
        game.state.winner = 'draw';
        return { gameOver: true, winner: 'draw' };
    }
    
    // Switch players
    game.state.currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    
    return { gameOver: false };
}

// Helper function to check if a board is won
function checkBoardWinner(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
        [0, 4, 8], [2, 4, 6] // diagonals
    ];
    
    for (const line of lines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    
    return null;
}

// Helper function to check if the game is a draw
function isGameDraw(gameState) {
    // Check if all boards are filled or won
    for (let i = 0; i < 9; i++) {
        if (gameState.boardWinners[i] === null && !gameState.board[i].includes(null)) {
            return false;
        }
    }
    
    return true;
}

// Helper function to generate a game ID
function generateGameId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Helper function to save a game to the database
async function saveGameToDatabase(gameId, gameState) {
    try {
        const { error } = await supabaseClient
            .from('games')
            .upsert({ id: gameId, state: gameState });
        
        if (error) {
            console.error('Error saving game to database:', error);
        }
    } catch (error) {
        console.error('Error saving game to database:', error);
    }
}

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'client/build')));
    
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
    });
}

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

