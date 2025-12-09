const { v4: uuidv4 } = require('uuid');

/**
 * RoomManager - Handles room code generation and validation
 */
class RoomManager {
  constructor(db = null) {
    this.db = db;
    this.currentRoom = null;
    this.currentGameId = null;
    this.rooms = new Map(); // Keep in-memory for quick lookups
  }

  /**
   * Generate a unique 4-letter room code (letters only)
   */
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Letters only, excluded confusing chars: I, O
    let code;
    let attempts = 0;
    const maxAttempts = 100;
    
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      attempts++;
      
      // Check both in-memory and database
      const existsInMemory = this.rooms.has(code);
      const existsInDb = this.db ? this.db.getGameByRoomCode(code) : null;
      
      if (!existsInMemory && !existsInDb) {
        break;
      }
      
      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate unique room code');
      }
    } while (true);
    
    return code;
  }

  /**
   * Create a new room
   */
  createRoom(totalRounds = 0) {
    const roomCode = this.generateRoomCode();
    const gameId = uuidv4();
    
    this.currentRoom = {
      code: roomCode,
      createdAt: Date.now(),
      status: 'active'
    };
    
    this.currentGameId = gameId;
    this.rooms.set(roomCode, this.currentRoom);
    
    // Save to database
    if (this.db) {
      try {
        this.db.createGame(gameId, roomCode, totalRounds);
      } catch (error) {
        console.error('Failed to save game to database:', error);
      }
    }
    
    return { roomCode, gameId };
  }

  /**
   * Get current room code
   */
  getCurrentRoomCode() {
    return this.currentRoom?.code || null;
  }

  /**
   * Get current game ID
   */
  getCurrentGameId() {
    return this.currentGameId;
  }

  /**
   * Validate a room code
   */
  validateRoom(code) {
    if (!code || typeof code !== 'string') return false;
    
    const normalizedCode = code.toUpperCase().trim();
    
    // Check if it's the current active room
    if (this.currentRoom && this.currentRoom.code === normalizedCode) {
      return true;
    }
    
    // Check in-memory map
    if (this.rooms.has(normalizedCode)) {
      return true;
    }
    
    // Check database as fallback
    if (this.db) {
      const game = this.db.getGameByRoomCode(normalizedCode);
      return game && game.status !== 'completed';
    }
    
    return false;
  }

  /**
   * Close a room
   */
  closeRoom(code) {
    if (this.rooms.has(code)) {
      const room = this.rooms.get(code);
      room.status = 'closed';
      room.closedAt = Date.now();
      
      if (this.currentRoom && this.currentRoom.code === code) {
        this.currentRoom = null;
      }
      
      // Update database
      if (this.db && this.currentGameId) {
        try {
          this.db.completeGame(this.currentGameId);
        } catch (error) {
          console.error('Failed to close game in database:', error);
        }
      }
      
      return true;
    }
    return false;
  }

  /**
   * Clean up old rooms (older than 7 days) - delegates to database cleanup
   */
  cleanupOldRooms() {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    // Clean up in-memory rooms
    for (const [code, room] of this.rooms.entries()) {
      if (room.createdAt < sevenDaysAgo) {
        this.rooms.delete(code);
      }
    }
    
    // Database cleanup happens on app startup in main.js
  }

  /**
   * Get room info
   */
  getRoomInfo(code) {
    return this.rooms.get(code) || null;
  }
}

module.exports = RoomManager;
