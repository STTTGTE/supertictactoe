import React from 'react';
import '../styles/Board.css';

const Board = ({ board, boardWinners, lastMove, onCellClick, disabled }) => {
    const isBoardActive = (boardIndex) => {
        if (!lastMove) return true;
        if (boardWinners[lastMove.cellIndex]) return true;
        return boardIndex === lastMove.cellIndex;
    };

    return (
        <div className="super-board">
            {board.map((smallBoard, boardIndex) => (
                <div
                    key={boardIndex}
                    className={`small-board ${isBoardActive(boardIndex) ? 'active' : 'inactive'}`}
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
                                    className={`cell ${cell ? `cell-${cell.toLowerCase()}` : ''}`}
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