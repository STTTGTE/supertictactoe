const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const supabase = require('./supabase');
require('dotenv').config();

app.use(express.static('./'));

const games = new Map();
const waitingPlayers = new Map();

// Function to save game state to Supabase
async function saveGameState(gameId, gameState) {
  try {
    const { data, error } = await supabase
      .from('games')
      .upsert({
        id: gameId,
        state: gameState,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error saving game state:', error);
    }
  } catch (error) {
    console.error('Error in saveGameState:', error);
  }
}

// Function to load game state from Supabase
async function loadGameState(gameId) {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('state')
      .eq('id', gameId)
      .single();

    if (error) {
      console.error('Error loading game state:', error);
      return null;
    }

    return data?.state || null;
  } catch (error) {
    console.error('Error in loadGameState:', error);
    return null;
  }
}

class AIPlayer {
    constructor(difficulty = 'hard') {
        this.difficulty = difficulty;
    }

    getMove(game, boardIndex) {
        const validMoves = this.getValidMoves(game, boardIndex);
        if (validMoves.length === 0) return null;

        if (this.difficulty === 'expert') {
            return this.getExpertMove(game, validMoves);
        }
        return this.getHardMove(game, validMoves);
    }

    getValidMoves(game, forcedBoardIndex) {
        const moves = [];
        const validBoards = forcedBoardIndex === null || game.boardWinners[forcedBoardIndex] 
            ? Array.from({ length: 9 }, (_, i) => i).filter(i => !game.boardWinners[i])
            : [forcedBoardIndex];

        for (const boardIndex of validBoards) {
            for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
                if (!game.board[boardIndex][cellIndex]) {
                    moves.push({ boardIndex, cellIndex });
                }
            }
        }
        return moves;
    }

    getHardMove(game, validMoves) {
        // Prioritize winning moves in local boards
        for (const move of validMoves) {
            const { boardIndex, cellIndex } = move;
            if (this.willWinLocalBoard(game.board[boardIndex], cellIndex, 'O')) {
                return move;
            }
        }

        // Block opponent's winning moves
        for (const move of validMoves) {
            const { boardIndex, cellIndex } = move;
            if (this.willWinLocalBoard(game.board[boardIndex], cellIndex, 'X')) {
                return move;
            }
        }

        // Prioritize center and corners of available boards
        const strategicPositions = [4, 0, 2, 6, 8, 1, 3, 5, 7];
        for (const pos of strategicPositions) {
            const move = validMoves.find(m => m.cellIndex === pos);
            if (move) return move;
        }

        return validMoves[Math.floor(Math.random() * validMoves.length)];
    }

    getExpertMove(game, validMoves) {
        // First, try to find a move that leads to winning the entire game
        for (const move of validMoves) {
            if (this.willLeadToSuperWin(game, move, 'O')) {
                return move;
            }
        }

        // Block opponent's potential super win
        for (const move of validMoves) {
            if (this.willLeadToSuperWin(game, move, 'X')) {
                return move;
            }
        }

        // Use hard strategy as fallback
        return this.getHardMove(game, validMoves);
    }

    willWinLocalBoard(board, position, symbol) {
        const tempBoard = [...board];
        tempBoard[position] = symbol;
        
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];

        return winPatterns.some(pattern => 
            pattern.every(pos => tempBoard[pos] === symbol)
        );
    }

    willLeadToSuperWin(game, move, symbol) {
        // Create a deep copy of the game state
        const tempGame = {
            board: game.board.map(board => [...board]),
            boardWinners: [...game.boardWinners]
        };

        // Apply the move
        tempGame.board[move.boardIndex][move.cellIndex] = symbol;

        // Check if this creates a win in the local board
        if (this.willWinLocalBoard(tempGame.board[move.boardIndex], move.cellIndex, symbol)) {
            tempGame.boardWinners[move.boardIndex] = symbol;

            // Check if this leads to winning the super board
            const winPatterns = [
                [0, 1, 2], [3, 4, 5], [6, 7, 8],
                [0, 3, 6], [1, 4, 7], [2, 5, 8],
                [0, 4, 8], [2, 4, 6]
            ];

            return winPatterns.some(pattern =>
                pattern.every(pos => tempGame.boardWinners[pos] === symbol)
            );
        }

        return false;
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('reconnectToGame', async ({ gameId }) => {
        try {
            // Try to load game state from Supabase
            const savedState = await loadGameState(gameId);
            
            if (!savedState) {
                socket.emit('gameNotFound');
                return;
            }
            
            // Check if the game is already over
            if (savedState.gameOver) {
                socket.emit('gameNotFound');
                return;
            }
            
            // Reconstruct the game state with AI player if needed
            if (savedState.players[1] === 'AI') {
                savedState.ai = new AIPlayer(savedState.ai?.difficulty || 'hard');
            }
            
            // Add the game to the in-memory map
            games.set(gameId, savedState);
            
            // Join the socket room
            socket.join(gameId);
            
            // Determine the player's symbol
            const playerIndex = savedState.players.indexOf(socket.id);
            if (playerIndex === -1) {
                // If the player is not in the game, they might be a spectator
                socket.emit('gameState', { 
                    gameState: savedState,
                    symbol: null
                });
            } else {
                // Send the game state to the player
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
            
            // Save game state to Supabase
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
        
        // Save game state to Supabase
        await saveGameState(gameId, gameState);

        socket.join(gameId);
        socket.emit('gameStart', { gameId, symbol: 'X', opponent: 'AI' });
    });

    socket.on('move', async ({ gameId, boardIndex, cellIndex }) => {
        // Try to load game state from Supabase if not in memory
        if (!games.has(gameId)) {
            const savedState = await loadGameState(gameId);
            if (savedState) {
                // Reconstruct the game state with AI player if needed
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

        // Handle AI move after the player's move has been processed
        if (game.players[1] === 'AI' && !game.gameOver) {
            // Use a more reliable approach for AI moves
            const aiMove = game.ai.getMove(game, game.lastMove);
            if (aiMove) {
                // Make the AI move directly instead of using setTimeout
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
                
                // Save final game state before removing from memory
                await saveGameState(gameId, game);
                
                games.delete(gameId);
            }
        }
    });
});

async function makeMove(game, boardIndex, cellIndex) {
    const symbol = game.currentPlayer === 0 ? 'X' : 'O';
    game.board[boardIndex][cellIndex] = symbol;
    game.lastMove = cellIndex;

    checkLocalWin(game, boardIndex);
    const gameWon = checkSuperWin(game);
    
    // Check for draw condition - all boards are completed
    const isDraw = game.boardWinners.every(winner => winner !== '');

    if (!gameWon && !isDraw) {
        game.currentPlayer = 1 - game.currentPlayer;
    } else {
        game.gameOver = true;
    }

    // Save game state to Supabase
    await saveGameState(game.gameId, game);

    // Send moveUpdate to both players
    game.players.forEach(playerId => {
        if (playerId !== 'AI') {
            io.to(playerId).emit('moveUpdate', {
                boardIndex,
                cellIndex,
                symbol,
                boardWinners: game.boardWinners,
                nextPlayer: game.players[game.currentPlayer],
                gameWon: gameWon ? gameWon : (isDraw ? 'T' : null)
            });
        }
    });
}

function isValidMove(game, boardIndex, cellIndex) {
    if (game.board[boardIndex][cellIndex] || game.boardWinners[boardIndex]) {
        return false;
    }

    if (game.lastMove === null) {
        return true;
    }

    if (game.boardWinners[game.lastMove]) {
        return true;
    }

    return boardIndex === game.lastMove;
}

function checkLocalWin(game, boardIndex) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    const board = game.board[boardIndex];
    for (const pattern of winPatterns) {
        if (board[pattern[0]] &&
            board[pattern[0]] === board[pattern[1]] &&
            board[pattern[0]] === board[pattern[2]]) {
            game.boardWinners[boardIndex] = board[pattern[0]];
            return true;
        }
    }

    if (board.every(cell => cell !== '')) {
        game.boardWinners[boardIndex] = 'T';
    }

    return false;
}

function checkSuperWin(game) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    for (const pattern of winPatterns) {
        if (game.boardWinners[pattern[0]] &&
            game.boardWinners[pattern[0]] !== 'T' &&
            game.boardWinners[pattern[0]] === game.boardWinners[pattern[1]] &&
            game.boardWinners[pattern[0]] === game.boardWinners[pattern[2]]) {
            return game.boardWinners[pattern[0]];
        }
    }

    return null;
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
