import React from 'react';
import '../styles/Board.css';
import { BoardState, BoardWinners, Move } from '../types/game';

interface BoardProps {
    board: BoardState;
    boardWinners: BoardWinners;
    lastMove: Move | null;
    onCellClick: (boardIndex: number, cellIndex: number) => void;
    disabled: boolean;
}

const Board: React.FC<BoardProps> = ({ board, boardWinners, lastMove, onCellClick, disabled }) => {
    const renderCell = (boardIndex: number, cellIndex: number) => {
        const value = board[boardIndex][cellIndex];
        const isLastMove = lastMove?.boardIndex === boardIndex && lastMove?.cellIndex === cellIndex;
        
        return (
            <button
                key={`${boardIndex}-${cellIndex}`}
                className={`cell ${value} ${isLastMove ? 'last-move' : ''}`}
                onClick={() => onCellClick(boardIndex, cellIndex)}
                disabled={disabled || value !== null}
            >
                {value}
            </button>
        );
    };

    const renderSmallBoard = (boardIndex: number) => {
        const winner = boardWinners[boardIndex];
        const isActive = lastMove ? lastMove.cellIndex === boardIndex : true;
        const isWon = winner !== null;

        return (
            <div
                key={boardIndex}
                className={`small-board ${isActive ? 'active' : ''} ${isWon ? 'won' : ''}`}
            >
                {isWon ? (
                    <div className="winner-overlay">{winner}</div>
                ) : (
                    <div className="grid">
                        {board[boardIndex].map((_, cellIndex) => renderCell(boardIndex, cellIndex))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="board">
            {board.map((_, boardIndex) => renderSmallBoard(boardIndex))}
        </div>
    );
};

export default Board; 