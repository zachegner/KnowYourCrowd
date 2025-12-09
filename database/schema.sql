-- Know Your Crowd - SQLite Database Schema

-- Game sessions table
CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    room_code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'lobby' CHECK(status IN ('lobby', 'in_progress', 'completed')),
    current_round INTEGER DEFAULT 0,
    total_rounds INTEGER DEFAULT 0,
    current_host_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    name TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    is_host INTEGER DEFAULT 0,
    is_connected INTEGER DEFAULT 1,
    session_token TEXT,
    join_order INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Rounds table
CREATE TABLE IF NOT EXISTS rounds (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    host_id TEXT NOT NULL,
    theme TEXT,
    phase TEXT DEFAULT 'theme_select' CHECK(phase IN ('theme_select', 'answering', 'matching', 'reveal', 'complete')),
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (host_id) REFERENCES players(id)
);

-- Answers table
CREATE TABLE IF NOT EXISTS answers (
    id TEXT PRIMARY KEY,
    round_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    answer TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    penalty_applied INTEGER DEFAULT 0,
    FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Matches table (host's guesses)
CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    round_id TEXT NOT NULL,
    answer_id TEXT NOT NULL,
    guessed_player_id TEXT NOT NULL,
    is_correct INTEGER DEFAULT 0,
    FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
    FOREIGN KEY (answer_id) REFERENCES answers(id),
    FOREIGN KEY (guessed_player_id) REFERENCES players(id)
);

-- Game history table (for stats tracking)
CREATE TABLE IF NOT EXISTS game_history (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    winner_id TEXT,
    winner_name TEXT,
    winner_score INTEGER,
    player_count INTEGER,
    rounds_played INTEGER,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Theme cache table (for AI-generated themes)
CREATE TABLE IF NOT EXISTS theme_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme TEXT NOT NULL UNIQUE,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_rounds_game_id ON rounds(game_id);
CREATE INDEX IF NOT EXISTS idx_answers_round_id ON answers(round_id);
CREATE INDEX IF NOT EXISTS idx_matches_round_id ON matches(round_id);
CREATE INDEX IF NOT EXISTS idx_games_room_code ON games(room_code);
