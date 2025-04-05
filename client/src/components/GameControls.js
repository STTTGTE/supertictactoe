import React, { useState } from 'react';
import '../styles/GameControls.css';

const GameControls = ({ onFindGame, onStartAIGame }) => {
    const [difficulty, setDifficulty] = useState('hard');

    return (
        <div className="game-controls">
            <button
                className="control-button find-game"
                onClick={onFindGame}
            >
                Find Game
            </button>
            
            <div className="ai-controls">
                <h3>Play vs AI</h3>
                <div className="difficulty-buttons">
                    <button
                        className={`difficulty-button ${difficulty === 'easy' ? 'active' : ''}`}
                        onClick={() => setDifficulty('easy')}
                    >
                        Easy
                    </button>
                    <button
                        className={`difficulty-button ${difficulty === 'medium' ? 'active' : ''}`}
                        onClick={() => setDifficulty('medium')}
                    >
                        Medium
                    </button>
                    <button
                        className={`difficulty-button ${difficulty === 'hard' ? 'active' : ''}`}
                        onClick={() => setDifficulty('hard')}
                    >
                        Hard
                    </button>
                </div>
                <button
                    className="control-button start-ai"
                    onClick={() => onStartAIGame(difficulty)}
                >
                    Start AI Game
                </button>
            </div>
        </div>
    );
};

export default GameControls; 