const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Database Service - SQLite persistence for Know Your Crowd
 * Handles all database operations for games, players, rounds, answers, matches, and history
 */
class DatabaseService {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  /**
   * Initialize database connection and create tables from schema
   */
  initialize() {
    try {
      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Open database connection
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
      this.db.pragma('foreign_keys = ON'); // Enable foreign key constraints

      // Execute schema
      this.executeSchema();

      console.log(`Database initialized at: ${this.dbPath}`);
      return true;
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Execute schema.sql to create all tables
   */
  executeSchema() {
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    // Execute schema (split by semicolons and execute each statement)
    this.db.exec(schema);
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ==================== GAME OPERATIONS ====================

  /**
   * Create a new game session
   */
  createGame(gameId, roomCode, totalRounds) {
    const stmt = this.db.prepare(`
      INSERT INTO games (id, room_code, status, current_round, total_rounds, created_at, updated_at)
      VALUES (?, ?, 'lobby', 0, ?, datetime('now'), datetime('now'))
    `);
    
    stmt.run(gameId, roomCode, totalRounds);
    return gameId;
  }

  /**
   * Update game status and current round
   */
  updateGame(gameId, updates) {
    const allowedFields = ['status', 'current_round', 'current_host_id'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return;

    fields.push('updated_at = datetime(\'now\')');
    values.push(gameId);

    const stmt = this.db.prepare(`
      UPDATE games
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
  }

  /**
   * Mark game as completed
   */
  completeGame(gameId) {
    const stmt = this.db.prepare(`
      UPDATE games
      SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `);
    
    stmt.run(gameId);
  }

  /**
   * Get game by room code
   */
  getGameByRoomCode(roomCode) {
    const stmt = this.db.prepare('SELECT * FROM games WHERE room_code = ?');
    return stmt.get(roomCode);
  }

  /**
   * Get game by ID
   */
  getGameById(gameId) {
    const stmt = this.db.prepare('SELECT * FROM games WHERE id = ?');
    return stmt.get(gameId);
  }

  /**
   * Delete old games (older than specified days)
   */
  cleanupOldGames(daysOld = 7) {
    const stmt = this.db.prepare(`
      DELETE FROM games
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `);
    
    const result = stmt.run(daysOld);
    return result.changes;
  }

  // ==================== PLAYER OPERATIONS ====================

  /**
   * Add a player to a game
   */
  addPlayer(gameId, player) {
    const stmt = this.db.prepare(`
      INSERT INTO players (id, game_id, name, score, is_host, is_connected, session_token, join_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      player.id,
      gameId,
      player.name,
      player.score || 0,
      player.isHost ? 1 : 0,
      player.isConnected ? 1 : 0,
      player.sessionToken,
      player.joinOrder
    );
  }

  /**
   * Update player data
   */
  updatePlayer(playerId, updates) {
    const allowedFields = ['name', 'score', 'is_host', 'is_connected'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        // Convert boolean to integer for SQLite
        values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
      }
    }

    if (fields.length === 0) return;

    values.push(playerId);

    const stmt = this.db.prepare(`
      UPDATE players
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
  }

  /**
   * Get all players for a game
   */
  getPlayers(gameId) {
    const stmt = this.db.prepare(`
      SELECT * FROM players
      WHERE game_id = ?
      ORDER BY join_order ASC
    `);
    
    return stmt.all(gameId);
  }

  /**
   * Bulk update all player scores
   */
  updatePlayerScores(players) {
    const stmt = this.db.prepare('UPDATE players SET score = ? WHERE id = ?');
    
    const updateMany = this.db.transaction((playerList) => {
      for (const player of playerList) {
        stmt.run(player.score, player.id);
      }
    });

    updateMany(players);
  }

  // ==================== ROUND OPERATIONS ====================

  /**
   * Create a new round
   */
  createRound(gameId, roundNumber, hostId, theme = null) {
    const roundId = uuidv4();
    
    const stmt = this.db.prepare(`
      INSERT INTO rounds (id, game_id, round_number, host_id, theme, phase, started_at)
      VALUES (?, ?, ?, ?, ?, 'theme_select', datetime('now'))
    `);
    
    stmt.run(roundId, gameId, roundNumber, hostId, theme);
    return roundId;
  }

  /**
   * Update round data
   */
  updateRound(roundId, updates) {
    const allowedFields = ['theme', 'phase'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return;

    values.push(roundId);

    const stmt = this.db.prepare(`
      UPDATE rounds
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
  }

  /**
   * Complete a round
   */
  completeRound(roundId) {
    const stmt = this.db.prepare(`
      UPDATE rounds
      SET phase = 'complete', completed_at = datetime('now')
      WHERE id = ?
    `);
    
    stmt.run(roundId);
  }

  /**
   * Get current round for a game
   */
  getCurrentRound(gameId, roundNumber) {
    const stmt = this.db.prepare(`
      SELECT * FROM rounds
      WHERE game_id = ? AND round_number = ?
    `);
    
    return stmt.get(gameId, roundNumber);
  }

  /**
   * Get all rounds for a game
   */
  getRounds(gameId) {
    const stmt = this.db.prepare(`
      SELECT * FROM rounds
      WHERE game_id = ?
      ORDER BY round_number ASC
    `);
    
    return stmt.all(gameId);
  }

  // ==================== ANSWER OPERATIONS ====================

  /**
   * Save a player's answer
   */
  saveAnswer(roundId, playerId, answer, penaltyApplied = false) {
    const answerId = uuidv4();
    
    const stmt = this.db.prepare(`
      INSERT INTO answers (id, round_id, player_id, answer, penalty_applied, submitted_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);
    
    stmt.run(answerId, roundId, playerId, answer, penaltyApplied ? 1 : 0);
    return answerId;
  }

  /**
   * Get all answers for a round
   */
  getAnswers(roundId) {
    const stmt = this.db.prepare(`
      SELECT a.*, p.name as player_name
      FROM answers a
      JOIN players p ON a.player_id = p.id
      WHERE a.round_id = ?
      ORDER BY a.submitted_at ASC
    `);
    
    return stmt.all(roundId);
  }

  /**
   * Bulk save answers for a round
   */
  saveAnswers(roundId, answers) {
    const stmt = this.db.prepare(`
      INSERT INTO answers (id, round_id, player_id, answer, penalty_applied, submitted_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);
    
    const insertMany = this.db.transaction((answerList) => {
      for (const answer of answerList) {
        const answerId = uuidv4();
        stmt.run(
          answerId,
          roundId,
          answer.playerId,
          answer.answer,
          answer.penalty ? 1 : 0
        );
      }
    });

    insertMany(answers);
  }

  // ==================== MATCH OPERATIONS ====================

  /**
   * Save a host's match (guess)
   */
  saveMatch(roundId, answerIndex, guessedPlayerId, isCorrect) {
    const matchId = uuidv4();
    
    // We need to get the actual answer_id from the round's answers
    // For now, we'll use a simple approach: get answers and use index
    const answers = this.getAnswers(roundId);
    const answerId = answers[answerIndex]?.id;

    if (!answerId) {
      throw new Error(`No answer found at index ${answerIndex} for round ${roundId}`);
    }
    
    const stmt = this.db.prepare(`
      INSERT INTO matches (id, round_id, answer_id, guessed_player_id, is_correct)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(matchId, roundId, answerId, guessedPlayerId, isCorrect ? 1 : 0);
    return matchId;
  }

  /**
   * Get all matches for a round
   */
  getMatches(roundId) {
    const stmt = this.db.prepare(`
      SELECT m.*, a.answer, a.player_id as actual_player_id, p.name as guessed_player_name
      FROM matches m
      JOIN answers a ON m.answer_id = a.id
      JOIN players p ON m.guessed_player_id = p.id
      WHERE m.round_id = ?
    `);
    
    return stmt.all(roundId);
  }

  /**
   * Bulk save matches for a round
   */
  saveMatches(roundId, matches) {
    // Get all answers for this round first
    const answers = this.getAnswers(roundId);
    
    const stmt = this.db.prepare(`
      INSERT INTO matches (id, round_id, answer_id, guessed_player_id, is_correct)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const insertMany = this.db.transaction((matchList) => {
      for (const match of matchList) {
        const matchId = uuidv4();
        // Find the answer_id based on the answer index
        const answerId = answers[match.answerIndex]?.id;
        
        if (answerId) {
          stmt.run(
            matchId,
            roundId,
            answerId,
            match.guessedPlayerId,
            match.isCorrect ? 1 : 0
          );
        }
      }
    });

    insertMany(matches);
  }

  // ==================== GAME HISTORY OPERATIONS ====================

  /**
   * Save completed game to history
   */
  saveGameHistory(gameId, winnerData, playerCount, roundsPlayed) {
    const historyId = uuidv4();
    
    const stmt = this.db.prepare(`
      INSERT INTO game_history (id, game_id, winner_id, winner_name, winner_score, player_count, rounds_played, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    
    stmt.run(
      historyId,
      gameId,
      winnerData?.id || null,
      winnerData?.name || null,
      winnerData?.score || null,
      playerCount,
      roundsPlayed
    );
    
    return historyId;
  }

  /**
   * Get game history (recent games)
   */
  getGameHistory(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM game_history
      ORDER BY completed_at DESC
      LIMIT ?
    `);
    
    return stmt.all(limit);
  }

  /**
   * Get stats for a specific player name (across all games)
   */
  getPlayerStats(playerName) {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as games_won,
        AVG(winner_score) as avg_winning_score,
        MAX(winner_score) as highest_score
      FROM game_history
      WHERE winner_name = ?
    `);
    
    return stmt.get(playerName);
  }

  // ==================== UTILITY OPERATIONS ====================

  /**
   * Get database statistics
   */
  getStats() {
    const stats = {
      totalGames: this.db.prepare('SELECT COUNT(*) as count FROM games').get().count,
      activeGames: this.db.prepare('SELECT COUNT(*) as count FROM games WHERE status = "in_progress"').get().count,
      completedGames: this.db.prepare('SELECT COUNT(*) as count FROM games WHERE status = "completed"').get().count,
      totalPlayers: this.db.prepare('SELECT COUNT(*) as count FROM players').get().count,
      totalRounds: this.db.prepare('SELECT COUNT(*) as count FROM rounds').get().count,
      totalAnswers: this.db.prepare('SELECT COUNT(*) as count FROM answers').get().count,
      totalMatches: this.db.prepare('SELECT COUNT(*) as count FROM matches').get().count
    };
    
    return stats;
  }

  /**
   * Execute raw SQL (for debugging/testing)
   */
  raw(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }
}

module.exports = DatabaseService;
