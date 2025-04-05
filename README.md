# Super Tic Tac Toe Online

A multiplayer Super Tic Tac Toe game with AI opponents, built with Node.js, Socket.IO, and Supabase.

## Features

- Play against other players online
- Play against AI with different difficulty levels
- Persistent game state with Supabase
- Streak tracking
- Responsive design

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- A Supabase account

## Setup

1. Clone the repository:
   ```
   git clone <repository-url>
   cd super-tic-tac-toe
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a Supabase project:
   - Go to [Supabase](https://supabase.com/) and create a new project
   - Create a table called `games` with the following schema:
     ```sql
     CREATE TABLE games (
       id TEXT PRIMARY KEY,
       state JSONB NOT NULL,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
     );
     ```

4. Create a `.env` file in the root directory with the following variables:
   ```
   SUPABASE_URL=your-supabase-url
   SUPABASE_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_KEY=your-supabase-service-key
   PORT=3000
   NODE_ENV=development
   ```

5. Start the development server:
   ```
   npm run dev
   ```

## Deployment to Vercel

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket).

2. Go to [Vercel](https://vercel.com/) and create a new project.

3. Connect your repository and configure the project:
   - Framework Preset: Other
   - Build Command: `npm run vercel-build`
   - Output Directory: `.`
   - Install Command: `npm install`

4. Add the following environment variables in the Vercel project settings:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `SUPABASE_SERVICE_KEY`
   - `NODE_ENV=production`

5. Deploy the project.

## How to Play

1. Choose between "Play Online" or "Play vs AI".
2. If playing against AI, select a difficulty level.
3. The game board consists of 9 smaller Tic Tac Toe boards arranged in a 3x3 grid.
4. Your first move can be in any board.
5. After your move, your opponent must play in the board corresponding to the cell you just played in.
6. If that board is already completed, your opponent can choose any available board.
7. Win three boards in a row (horizontally, vertically, or diagonally) to win the game.

## License

MIT 