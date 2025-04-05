import React from 'react';
import '../styles/Board.css';

const Board = ({ board, boardWinners, lastMove, onCellClick, disabled }) => {
    const isBoardActive = (boardIndex) => {
        if (!lastMove) return true;
        if (boardWinners[lastMove.cellIndex]) return true;
        return boardIndex === lastMove.cellIndex;
    };

    const getBoardClass = (boardIndex) => {
        const baseClass = 'small-board';
        const activeClass = isBoardActive(boardIndex) ? 'active' : 'inactive';
        const winnerClass = boardWinners[boardIndex] ? `winner-${boardWinners[boardIndex].toLowerCase()}` : '';
        return `${baseClass} ${activeClass} ${winnerClass}`.trim();
    };

    const getCellClass = (cell, boardIndex, cellIndex) => {
        const baseClass = 'cell';
        const symbolClass = cell ? `cell-${cell.toLowerCase()}` : '';
        const lastMoveClass = lastMove && lastMove.boardIndex === boardIndex && lastMove.cellIndex === cellIndex ? 'last-move' : '';
        return `${baseClass} ${symbolClass} ${lastMoveClass}`.trim();
    };

    return (
        <div className="super-board">
            {board.map((smallBoard, boardIndex) => (
                <div
                    key={boardIndex}
                    className={getBoardClass(boardIndex)}
                >
                    {boardWinners[boardIndex] ? (
                        <div className="board-winner">
                            {boardWinners[boardIndex]}
                        </div>
                    ) : (
                        <div className="board-grid">
                            {smallBoard.map((cell, cellIndex) => (
                                <button
                                    key={cellIndex}
                                    className={getCellClass(cell, boardIndex, cellIndex)}
                                    onClick={() => onCellClick(boardIndex, cellIndex)}
                                    disabled={disabled || !isBoardActive(boardIndex) || cell !== ''}
                                >
                                    {cell}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default Board; 