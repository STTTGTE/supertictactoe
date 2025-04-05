class SuperTicTacToe {
    constructor() {
        this.socket = io();
        this.gameId = null;
        this.playerSymbol = null;
        this.isMyTurn = false;
        this.isAIGame = false;
        this.setupSocketListeners();
        this.setupUIListeners();
        this.initializeBoard();

        // Hide AI options initially
        document.querySelector('.ai-options').style.display = 'none';

        // Add streak counter functionality
        let streak = localStorage.getItem('streak') || 0;
        let lastPlayDate = localStorage.getItem('lastPlayDate');
        const today = new Date().toDateString();

        // Update streak counter
        function updateStreak(won) {
            const streakElement = document.getElementById('streak-count');
            
            if (won) {
                if (lastPlayDate !== today) {
                    streak++;
                    localStorage.setItem('streak', streak);
                    localStorage.setItem('lastPlayDate', today);
                }
            } else {
                streak = 0;
                localStorage.setItem('streak', streak);
            }
            
            streakElement.textContent = streak;
        }

        // Initialize streak counter
        document.getElementById('streak-count').textContent = streak;
        
        // Check for game in progress in localStorage
        const savedGameId = localStorage.getItem('currentGameId');
        if (savedGameId) {
            this.reconnectToGame(savedGameId);
        }
    }
    
    reconnectToGame(gameId) {
        this.socket.emit('reconnectToGame', { gameId });
    }

    toggleGameSection(show) {
        const gameSection = document.querySelector('.game-section');
        const heroSection = document.querySelector('.hero');
        const aiLevelsSection = document.querySelector('.ai-levels-section');
        
        if (show) {
            gameSection.classList.remove('hidden');
            heroSection.style.display = 'none';
            aiLevelsSection.style.display = 'none';
        } else {
            gameSection.classList.add('hidden');
            heroSection.style.display = 'block';
            aiLevelsSection.style.display = 'block';
        }
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            document.getElementById('game-status').textContent = 'Choose game mode';
            document.getElementById('find-game').disabled = false;
            document.getElementById('play-ai').disabled = false;
        });

        this.socket.on('disconnect', () => {
            document.getElementById('game-status').textContent = 'Disconnected from server...';
            // Don't reset the game on disconnect to allow reconnection
        });

        this.socket.on('waiting', () => {
            document.getElementById('game-status').textContent = 'Waiting for opponent...';
        });

        this.socket.on('gameStart', ({ gameId, symbol, opponent }) => {
            this.gameId = gameId;
            this.playerSymbol = symbol;
            this.isAIGame = opponent === 'AI';
            document.getElementById('player-symbol').textContent = symbol;
            document.getElementById('game-status').textContent = symbol === 'X' ? 'Your turn' : "Opponent's turn";
            document.getElementById('game-container').classList.add('active');
            document.getElementById('menu').style.display = 'none';
            document.querySelector('.ai-options').style.display = 'none';
            this.isMyTurn = symbol === 'X';
            
            // Save game ID to localStorage for reconnection
            localStorage.setItem('currentGameId', gameId);
        });
        
        this.socket.on('gameNotFound', () => {
            document.getElementById('game-status').textContent = 'Game not found or already completed';
            localStorage.removeItem('currentGameId');
            this.resetGame();
        });
        
        this.socket.on('gameState', ({ gameState, symbol }) => {
            this.gameId = gameState.id;
            this.playerSymbol = symbol;
            this.isAIGame = gameState.players[1] === 'AI';
            
            // Update the UI with the game state
            this.updateUIFromGameState(gameState, symbol);
            
            // Save game ID to localStorage for reconnection
            localStorage.setItem('currentGameId', gameState.id);
        });

        this.socket.on('moveUpdate', ({ boardIndex, cellIndex, symbol, boardWinners, nextPlayer, gameWon }) => {
            const cell = this.getCellElement(boardIndex, cellIndex);
            cell.textContent = symbol;
            cell.classList.add(symbol.toLowerCase());

            this.updateBoardWinners(boardWinners);
            
            if (gameWon) {
                if (gameWon === 'T') {
                    document.getElementById('game-status').textContent = "It's a draw!";
                    this.endGame(false);
                } else {
                    document.getElementById('game-status').textContent = 
                        gameWon === this.playerSymbol ? 'You won!' : 
                        (this.isAIGame ? 'AI won!' : 'Opponent won!');
                    this.endGame(gameWon === this.playerSymbol);
                }
            } else {
                // Fix the turn handling logic
                this.isMyTurn = this.isAIGame ? 
                    nextPlayer === this.socket.id :
                    nextPlayer === this.socket.id;
                document.getElementById('game-status').textContent = 
                    this.isMyTurn ? 'Your turn' : 
                    (this.isAIGame ? "AI's turn..." : "Opponent's turn");
            }

            this.updateBoardState(boardWinners, cellIndex);
        });

        this.socket.on('playerLeft', () => {
            if (!this.isAIGame) {
                document.getElementById('game-status').textContent = 'Opponent left the game';
                localStorage.removeItem('currentGameId');
                this.resetGame();
            }
        });
    }
    
    updateUIFromGameState(gameState, symbol) {
        // Update player info
        document.getElementById('player-symbol').textContent = symbol;
        
        // Update game status
        const isMyTurn = gameState.currentPlayer === gameState.players.indexOf(this.socket.id);
        document.getElementById('game-status').textContent = isMyTurn ? 'Your turn' : 
            (this.isAIGame ? "AI's turn..." : "Opponent's turn");
        
        // Show game container
        document.getElementById('game-container').classList.add('active');
        document.getElementById('menu').style.display = 'none';
        document.querySelector('.ai-options').style.display = 'none';
        
        // Update board state
        this.isMyTurn = isMyTurn;
        
        // Update the board with the current state
        for (let boardIndex = 0; boardIndex < 9; boardIndex++) {
            for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
                const cellValue = gameState.board[boardIndex][cellIndex];
                if (cellValue) {
                    const cell = this.getCellElement(boardIndex, cellIndex);
                    cell.textContent = cellValue;
                    cell.classList.add(cellValue.toLowerCase());
                }
            }
        }
        
        // Update board winners
        this.updateBoardWinners(gameState.boardWinners);
        
        // Update active board
        this.updateBoardState(gameState.boardWinners, gameState.lastMove);
        
        // Show game section
        this.toggleGameSection(true);
    }

    setupUIListeners() {
        // Show/hide AI options when switching between modes
        document.getElementById('play-ai').addEventListener('mouseenter', () => {
            document.querySelector('.ai-options').style.display = 'flex';
        });

        document.getElementById('find-game').addEventListener('mouseenter', () => {
            document.querySelector('.ai-options').style.display = 'none';
        });

        document.getElementById('find-game').addEventListener('click', () => {
            this.toggleGameSection(true);
            this.socket.emit('findGame');
            document.getElementById('find-game').disabled = true;
            document.getElementById('play-ai').disabled = true;
            document.querySelector('.ai-options').style.display = 'none';
        });

        document.getElementById('play-ai').addEventListener('click', () => {
            this.toggleGameSection(true);
            const difficulty = document.getElementById('ai-difficulty').value;
            this.socket.emit('startAIGame', { difficulty });
            document.getElementById('find-game').disabled = true;
            document.getElementById('play-ai').disabled = true;
        });

        document.getElementById('super-board').addEventListener('click', (e) => {
            if (!this.isMyTurn) return;
            
            const cell = e.target;
            if (cell.classList.contains('cell') && !cell.textContent) {
                const boardIndex = parseInt(cell.dataset.boardIndex);
                const cellIndex = parseInt(cell.dataset.cellIndex);
                
                this.socket.emit('move', {
                    gameId: this.gameId,
                    boardIndex,
                    cellIndex
                });
            }
        });
    }

    initializeBoard() {
        const superBoardElement = document.getElementById('super-board');
        superBoardElement.innerHTML = '';

        for (let i = 0; i < 9; i++) {
            const localBoard = document.createElement('div');
            localBoard.className = 'local-board';
            localBoard.dataset.boardIndex = i;

            for (let j = 0; j < 9; j++) {
                const cell = document.createElement('button');
                cell.className = 'cell';
                cell.dataset.boardIndex = i;
                cell.dataset.cellIndex = j;
                localBoard.appendChild(cell);
            }

            superBoardElement.appendChild(localBoard);
        }
    }

    getCellElement(boardIndex, cellIndex) {
        return document.querySelector(
            `.cell[data-board-index="${boardIndex}"][data-cell-index="${cellIndex}"]`
        );
    }

    updateBoardWinners(boardWinners) {
        boardWinners.forEach((winner, index) => {
            if (winner) {
                const board = document.querySelector(`.local-board[data-board-index="${index}"]`);
                board.classList.add('completed');
                if (winner !== 'T') {
                    board.classList.add(`won-${winner.toLowerCase()}`);
                }
            }
        });
    }

    updateBoardState(boardWinners, lastMove) {
        const boards = document.querySelectorAll('.local-board');
        boards.forEach(board => board.classList.remove('active'));

        if (lastMove === null || boardWinners[lastMove]) {
            boards.forEach((board, index) => {
                if (!boardWinners[index]) {
                    board.classList.add('active');
                }
            });
        } else if (!boardWinners[lastMove]) {
            const targetBoard = document.querySelector(`.local-board[data-board-index="${lastMove}"]`);
            targetBoard.classList.add('active');
        }
    }

    resetGame() {
        this.gameId = null;
        this.playerSymbol = null;
        this.isMyTurn = false;
        this.isAIGame = false;
        document.getElementById('game-container').classList.remove('active');
        document.getElementById('menu').style.display = 'block';
        document.getElementById('find-game').disabled = false;
        document.getElementById('play-ai').disabled = false;
        document.querySelector('.ai-options').style.display = 'none';
        this.initializeBoard();
        this.toggleGameSection(false);
        
        // Remove game ID from localStorage
        localStorage.removeItem('currentGameId');
    }

    endGame(won) {
        this.isMyTurn = false;
        updateStreak(won);
        
        // Remove game ID from localStorage
        localStorage.removeItem('currentGameId');
        
        setTimeout(() => {
            if (confirm('Play another game?')) {
                this.resetGame();
            }
        }, 1000);
    }
}

// Start the game when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new SuperTicTacToe();
});
