export type PlayerSymbol = 'X' | 'O';
export type CellValue = PlayerSymbol | null;
export type BoardState = CellValue[][];
export type BoardWinners = (PlayerSymbol | null)[];
export type GameStatus = 'idle' | 'waiting' | 'playing' | 'gameOver';
export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'reconnecting' | 'reconnected';
export type AIDifficulty = 'easy' | 'medium' | 'hard';

export interface Move {
  boardIndex: number;
  cellIndex: number;
}

export interface GameState {
  id: string;
  board: BoardState;
  boardWinners: BoardWinners;
  currentPlayer: PlayerSymbol;
  players: Record<PlayerSymbol, string>;
  status: GameStatus;
  winner: PlayerSymbol | 'draw' | null;
  lastMove: Move | null;
}

export interface GameStartEvent {
  gameId: string;
  symbol: PlayerSymbol;
  opponent: string;
}

export interface GameOverEvent {
  winner: PlayerSymbol | 'draw';
}

export interface ErrorEvent {
  message: string;
}

export interface RejoinGameEvent {
  gameId: string;
}

export interface StartAIGameEvent {
  difficulty: AIDifficulty;
}

export interface MakeMoveEvent {
  gameId: string;
  boardIndex: number;
  cellIndex: number;
} 