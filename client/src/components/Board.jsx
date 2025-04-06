import React from 'react';
import '../styles/Board.css';

const Board = ({ board, boardWinners, lastMove, onCellClick, disabled }) => {
    const renderCell = (boardIndex, cellIndex) => {
        const value = board[boardIndex][cellIndex];
        const isLastMove = lastMove && lastMove.boardIndex === boardIndex && lastMove.cellIndex === cellIndex;
        
        return (
            <div
                key={cellIndex}
                className={`cell ${value} ${isLastMove ? 'last-move' : ''}`}
                onClick={() => !disabled && onCellClick(boardIndex, cellIndex)}
            >
                {value}
            </div>
        );
    };

    const renderSubBoard = (boardIndex) => {
        const winner = boardWinners[boardIndex];
        const isPlayable = !disabled && (!lastMove || lastMove.cellIndex === boardIndex || boardWinners[lastMove.cellIndex]);
        
        return (
            <div
                key={boardIndex}
                className={`sub-board ${winner ? 'won' : ''} ${isPlayable ? 'playable' : ''}`}
            >
                {winner ? (
                    <div className="winner-overlay">{winner}</div>
                ) : (
                    <div className="sub-board-grid">
                        {Array(9).fill(null).map((_, cellIndex) => renderCell(boardIndex, cellIndex))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="game-board">
            {Array(9).fill(null).map((_, boardIndex) => renderSubBoard(boardIndex))}
        </div>
    );
};

export default Board; 