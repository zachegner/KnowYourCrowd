/**
 * RoomManager - Handles room code generation and validation
 */
class RoomManager {
  constructor() {
    this.currentRoom = null;
    this.rooms = new Map();
  }

  /**
   * Generate a unique 4-letter room code (letters only)
   */
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Letters only, excluded confusing chars: I, O
    let code;
    
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    
    return code;
  }

  /**
   * Create a new room
   */
  createRoom() {
    const roomCode = this.generateRoomCode();
    
    this.currentRoom = {
      code: roomCode,
      createdAt: Date.now(),
      status: 'active'
    };
    
    this.rooms.set(roomCode, this.currentRoom);
    
    return roomCode;
  }

  /**
   * Get current room code
   */
  getCurrentRoomCode() {
    return this.currentRoom?.code || null;
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
    
    // Check in rooms map
    return this.rooms.has(normalizedCode);
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
      
      return true;
    }
    return false;
  }

  /**
   * Clean up old rooms (older than 24 hours)
   */
  cleanupOldRooms() {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    for (const [code, room] of this.rooms.entries()) {
      if (room.createdAt < oneDayAgo) {
        this.rooms.delete(code);
      }
    }
  }

  /**
   * Get room info
   */
  getRoomInfo(code) {
    return this.rooms.get(code) || null;
  }
}

module.exports = RoomManager;
