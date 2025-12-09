const { v4: uuidv4 } = require('uuid');

/**
 * GameLogic - Core game state management
 * Handles all game phases, player interactions, and state transitions
 */
class GameLogic {
  constructor(io, roomManager, claudeService, scoreCalculator, config, db = null) {
    this.io = io;
    this.roomManager = roomManager;
    this.claudeService = claudeService;
    this.scoreCalculator = scoreCalculator;
    this.config = config;
    this.db = db;
    
    // Game state
    this.gameState = this.createInitialState();
    this.currentRoundId = null; // Track current round ID in database
    this.timers = {};
    this.displaySocket = null;
    this.hostPhoneSocket = null;
    
    // Track pending disconnects (for reconnection grace period)
    this.disconnectTimers = {};
    this.RECONNECT_GRACE_PERIOD = 15000; // 15 seconds to reconnect
  }

  createInitialState() {
    return {
      roomCode: null,
      players: [],
      currentRound: 0,
      totalRounds: 0,
      phase: 'lobby', // lobby, theme_select, answering, matching, reveal, round_end, game_over, sudden_death
      currentHostIndex: 0,
      currentHost: null,
      selectedTheme: null,
      themes: [],
      answers: [],
      matches: [],
      roundResults: [],
      revealIndex: 0,
      hostRotationCount: 0,
      isSuddenDeath: false,
      suddenDeathPlayers: [],
      suddenDeathRound: 0,
      tiedPlayerIds: [],
      tiedPlayerHostIndex: 0
    };
  }

  getGameState() {
    // Build shuffled answers for matching phase (consistent order)
    const shuffledAnswers = this.gameState.phase === 'matching' || this.gameState.matchingAnswers
      ? (this.gameState.matchingAnswers || this.gameState.answers.map((a, index) => ({
          index,
          answer: a.answer
        })))
      : [];

    return {
      ...this.gameState,
      players: this.gameState.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        isHost: p.isHost,
        isConnected: p.isConnected,
        hasSubmitted: this.gameState.answers.some(a => a.playerId === p.id)
      })),
      // Include phase-specific data for reconnection
      themes: this.gameState.themes,
      selectedTheme: this.gameState.selectedTheme,
      shuffledAnswers: shuffledAnswers,
      matchingPlayers: this.gameState.players
        .filter(p => !p.isHost)
        .map(p => ({ id: p.id, name: p.name }))
    };
  }

  // Get current host player
  getCurrentHost() {
    if (this.gameState.players.length === 0) return null;
    const hostIndex = this.gameState.currentHostIndex % this.gameState.players.length;
    return this.gameState.players[hostIndex];
  }

  // Handle display (TV/main screen) connection
  handleDisplayJoin(socket) {
    this.displaySocket = socket;
    socket.join('display');
    
    const roomCode = this.roomManager.getCurrentRoomCode();
    this.gameState.roomCode = roomCode;
    
    // Join the room so display receives all room broadcasts (timer_update, phase_changed, etc.)
    if (roomCode) {
      socket.join(roomCode);
    }
    
    socket.emit('game_state', this.getGameState());
  }

  // Handle host phone connection
  handleHostPhoneJoin(socket, data) {
    const { playerId } = data;
    const player = this.gameState.players.find(p => p.id === playerId);
    
    if (player && player.isHost) {
      this.hostPhoneSocket = socket;
      socket.join('host_phone');
      socket.emit('host_confirmed', { player, gameState: this.getGameState() });
    } else {
      socket.emit('error', { message: 'You are not the current host' });
    }
  }

  // Handle player joining
  handlePlayerJoin(socket, data) {
    const { name, roomCode } = data;
    
    // Validate room code
    if (!this.roomManager.validateRoom(roomCode)) {
      socket.emit('join_error', { message: 'Invalid room code' });
      return;
    }
    
    // Check if game already in progress
    if (this.gameState.phase !== 'lobby') {
      socket.emit('join_error', { message: 'Game already in progress' });
      return;
    }
    
    // Check max players
    if (this.gameState.players.length >= this.config.maxPlayers) {
      socket.emit('join_error', { message: 'Room is full' });
      return;
    }
    
    // Check for duplicate names and append number if needed
    let playerName = name.trim().substring(0, 20);
    const existingNames = this.gameState.players.map(p => p.name.toLowerCase());
    let nameCounter = 1;
    let baseName = playerName;
    
    while (existingNames.includes(playerName.toLowerCase())) {
      nameCounter++;
      playerName = `${baseName}(${nameCounter})`;
    }
    
    // Create player
    const player = {
      id: uuidv4(),
      socketId: socket.id,
      name: playerName,
      score: 0,
      isHost: this.gameState.players.length === 0, // First player is initial host
      isConnected: true,
      joinOrder: this.gameState.players.length,
      sessionToken: uuidv4()
    };
    
    this.gameState.players.push(player);
    
    if (player.isHost) {
      this.gameState.currentHost = player;
    }
    
    // Join socket room
    socket.join(this.gameState.roomCode);
    socket.playerId = player.id;
    
    // Save player to database
    this.savePlayerToDb(player);
    
    // Send confirmation to player
    socket.emit('room_joined', {
      player,
      players: this.gameState.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
      roomCode: this.gameState.roomCode
    });
    
    // Notify all clients
    this.io.to(this.gameState.roomCode).emit('player_joined', {
      player: { id: player.id, name: player.name, isHost: player.isHost },
      players: this.gameState.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
      canStart: this.gameState.players.length >= this.config.minPlayers
    });
    
    // Update display
    if (this.displaySocket) {
      this.displaySocket.emit('game_state', this.getGameState());
    }
  }

  // Handle start game from display (main screen)
  handleDisplayStartGame(socket) {
    // Only the display can start the game this way
    if (socket !== this.displaySocket) {
      socket.emit('error', { message: 'Only the main display can start the game' });
      return;
    }
    
    // Check minimum players
    if (this.gameState.players.length < this.config.minPlayers) {
      socket.emit('error', { message: `Need at least ${this.config.minPlayers} players to start` });
      return;
    }
    
    // Ensure display socket is in the room (in case it connected before room was created)
    if (this.gameState.roomCode && this.displaySocket) {
      this.displaySocket.join(this.gameState.roomCode);
    }
    
    // Initialize game
    this.gameState.totalRounds = this.gameState.players.length * this.config.rotations;
    this.gameState.currentRound = 1;
    this.gameState.hostRotationCount = 0;
    
    // Update game in database
    this.updateGameInDb({
      status: 'in_progress',
      total_rounds: this.gameState.totalRounds,
      current_round: 1
    });
    
    // Notify all
    this.io.to(this.gameState.roomCode).emit('game_started', {
      totalRounds: this.gameState.totalRounds,
      currentRound: this.gameState.currentRound
    });
    
    // Start first round
    this.startThemeSelection();
  }

  // Handle start game
  handleStartGame(socket) {
    const playerId = socket.playerId;
    const player = this.gameState.players.find(p => p.id === playerId);
    
    // Only host can start
    if (!player || !player.isHost) {
      socket.emit('error', { message: 'Only the host can start the game' });
      return;
    }
    
    // Check minimum players
    if (this.gameState.players.length < this.config.minPlayers) {
      socket.emit('error', { message: `Need at least ${this.config.minPlayers} players to start` });
      return;
    }
    
    // Initialize game
    this.gameState.totalRounds = this.gameState.players.length * this.config.rotations;
    this.gameState.currentRound = 1;
    this.gameState.hostRotationCount = 0;
    
    // Update game in database
    this.updateGameInDb({
      status: 'in_progress',
      total_rounds: this.gameState.totalRounds,
      current_round: 1
    });
    
    // Notify all
    this.io.to(this.gameState.roomCode).emit('game_started', {
      totalRounds: this.gameState.totalRounds,
      currentRound: this.gameState.currentRound
    });
    
    // Start first round
    this.startThemeSelection();
  }

  // Start theme selection phase
  async startThemeSelection() {
    this.gameState.phase = 'theme_select';
    this.gameState.selectedTheme = null;
    this.gameState.answers = [];
    this.gameState.matches = [];
    this.gameState.roundResults = [];
    
    // Update current host
    const host = this.getCurrentHost();
    this.gameState.currentHost = host;
    
    // Create round in database
    this.createRoundInDb(this.gameState.currentRound, host.id);
    
    // Update game current_round and current_host_id
    this.updateGameInDb({
      current_round: this.gameState.currentRound,
      current_host_id: host.id
    });
    
    // Mark host status
    this.gameState.players.forEach(p => {
      p.isHost = p.id === host.id;
    });
    
    // Notify all about phase change
    this.io.to(this.gameState.roomCode).emit('phase_changed', {
      phase: 'theme_select',
      currentHost: { id: host.id, name: host.name },
      currentRound: this.gameState.currentRound,
      totalRounds: this.gameState.totalRounds
    });
    
    // Update display
    if (this.displaySocket) {
      this.displaySocket.emit('game_state', this.getGameState());
    }
    
    // Generate themes
    try {
      this.gameState.themes = await this.claudeService.generateThemes();
    } catch (err) {
      console.error('Failed to generate themes:', err);
      this.gameState.themes = this.claudeService.getFallbackThemes();
    }
    
    // Send themes to host
    const hostSocket = this.getPlayerSocket(host.id);
    if (hostSocket) {
      hostSocket.emit('themes_generated', { themes: this.gameState.themes });
    }
    
    // Start timer
    this.startTimer('themeSelection', () => {
      // Auto-select first theme if host doesn't pick
      if (!this.gameState.selectedTheme && this.gameState.themes.length > 0) {
        this.selectTheme(this.gameState.themes[0]);
      }
    });
  }

  // Handle theme request
  async handleRequestThemes(socket) {
    if (this.gameState.themes.length > 0) {
      socket.emit('themes_generated', { themes: this.gameState.themes });
    }
  }

  // Handle theme selection
  handleThemeSelect(socket, data) {
    const playerId = socket.playerId;
    const player = this.gameState.players.find(p => p.id === playerId);
    
    if (!player || !player.isHost) {
      socket.emit('error', { message: 'Only the host can select a theme' });
      return;
    }
    
    if (this.gameState.phase !== 'theme_select') {
      socket.emit('error', { message: 'Not in theme selection phase' });
      return;
    }
    
    this.selectTheme(data.theme);
  }

  selectTheme(theme) {
    this.clearTimer('themeSelection');
    this.gameState.selectedTheme = theme;
    
    // Update round in database
    this.updateRoundInDb({ theme });
    
    // Notify all
    this.io.to(this.gameState.roomCode).emit('theme_selected', {
      theme,
      hostName: this.gameState.currentHost.name
    });
    
    // Start answering phase
    this.startAnsweringPhase();
  }

  // Start answering phase
  startAnsweringPhase() {
    this.gameState.phase = 'answering';
    this.gameState.answers = [];
    
    // Update round phase in database
    this.updateRoundInDb({ phase: 'answering' });
    
    const host = this.getCurrentHost();
    
    // Notify all about phase change
    this.io.to(this.gameState.roomCode).emit('phase_changed', {
      phase: 'answering',
      theme: this.gameState.selectedTheme,
      timeLimit: this.config.timers.answering,
      currentHost: { id: host.id, name: host.name }
    });
    
    // Update display
    if (this.displaySocket) {
      this.displaySocket.emit('game_state', this.getGameState());
    }
    
    // Start timer
    this.startTimer('answering', () => {
      this.endAnsweringPhase();
    });
  }

  // Handle answer submission
  handleAnswerSubmit(socket, data) {
    const playerId = socket.playerId;
    const player = this.gameState.players.find(p => p.id === playerId);
    
    if (!player) {
      socket.emit('error', { message: 'Player not found' });
      return;
    }
    
    if (this.gameState.phase !== 'answering') {
      socket.emit('error', { message: 'Not in answering phase' });
      return;
    }
    
    // Host doesn't answer
    if (player.isHost) {
      socket.emit('error', { message: 'Host does not submit an answer' });
      return;
    }
    
    // Check if already submitted
    if (this.gameState.answers.some(a => a.playerId === playerId)) {
      socket.emit('error', { message: 'Already submitted' });
      return;
    }
    
    // Validate answer
    const answer = data.answer.trim().substring(0, 100);
    
    if (!answer) {
      socket.emit('error', { message: 'Answer cannot be empty' });
      return;
    }
    
    // Store answer
    this.gameState.answers.push({
      playerId,
      playerName: player.name,
      answer,
      timestamp: Date.now()
    });
    
    // Confirm submission
    socket.emit('answer_submitted', { answer });
    
    // Notify about submission progress
    const nonHostPlayers = this.gameState.players.filter(p => !p.isHost);
    const submittedCount = this.gameState.answers.length;
    const totalToSubmit = nonHostPlayers.length;
    
    this.io.to(this.gameState.roomCode).emit('submission_progress', {
      submitted: submittedCount,
      total: totalToSubmit
    });
    
    // Update display
    if (this.displaySocket) {
      this.displaySocket.emit('game_state', this.getGameState());
    }
    
    // Check if all have submitted
    if (submittedCount >= totalToSubmit) {
      this.clearTimer('answering');
      this.endAnsweringPhase();
    }
  }

  // End answering phase
  endAnsweringPhase() {
    // Apply penalty to players who didn't submit
    const nonHostPlayers = this.gameState.players.filter(p => !p.isHost);
    
    nonHostPlayers.forEach(player => {
      const hasSubmitted = this.gameState.answers.some(a => a.playerId === player.id);
      
      if (!hasSubmitted) {
        // Apply penalty
        player.score += this.config.penalties.noSubmission;
        
        // Add empty answer for matching
        this.gameState.answers.push({
          playerId: player.id,
          playerName: player.name,
          answer: '[No Answer]',
          timestamp: Date.now(),
          penalty: true
        });
        
        // Notify player
        const socket = this.getPlayerSocket(player.id);
        if (socket) {
          socket.emit('penalty_applied', {
            penalty: this.config.penalties.noSubmission,
            reason: 'No answer submitted'
          });
        }
      }
    });
    
    // Save all answers and penalty scores to database
    this.saveAnswersToDb();
    this.saveScoresToDb();
    
    // Start matching phase
    this.startMatchingPhase();
  }

  // Start matching phase
  startMatchingPhase() {
    this.gameState.phase = 'matching';
    
    // Update round phase in database
    this.updateRoundInDb({ phase: 'matching' });
    
    const host = this.getCurrentHost();
    
    // Shuffle answers for display and store for reconnection
    const shuffledAnswers = [...this.gameState.answers]
      .sort(() => Math.random() - 0.5)
      .map((a, index) => ({
        index,
        answer: a.answer,
        playerId: a.playerId // Store for result calculation
      }));
    
    // Store shuffled answers for reconnecting players
    this.gameState.matchingAnswers = shuffledAnswers;
    
    // Prepare matching data payload
    const matchingData = {
      answers: shuffledAnswers,
      players: this.gameState.players
        .filter(p => !p.isHost)
        .map(p => ({ id: p.id, name: p.name }))
    };
    
    // Notify all about phase change
    this.io.to(this.gameState.roomCode).emit('phase_changed', {
      phase: 'matching',
      answers: shuffledAnswers,
      players: matchingData.players,
      timeLimit: this.config.timers.matching,
      currentHost: { id: host.id, name: host.name }
    });
    
    // Update display
    if (this.displaySocket) {
      this.displaySocket.emit('matching_phase_start', matchingData);
    }
    
    // Send matching data to host player - with fallback broadcast
    const hostSocket = this.getPlayerSocket(host.id);
    if (hostSocket) {
      console.log(`[GameLogic] Sending matching_phase_start to host ${host.name} via direct socket`);
      hostSocket.emit('matching_phase_start', matchingData);
    } else {
      // Fallback: broadcast to room and let client-side filter
      console.warn(`[GameLogic] Host socket not found for ${host.name}, broadcasting matching_phase_start to room`);
      this.io.to(this.gameState.roomCode).emit('matching_phase_start', matchingData);
    }
    
    // Start timer
    this.startTimer('matching', () => {
      // Auto-submit random matches if host doesn't submit
      this.autoSubmitMatches();
    });
  }

  // Handle request for matching data (fallback for missed events)
  handleRequestMatchingData(socket) {
    const playerId = socket.playerId;
    const player = this.gameState.players.find(p => p.id === playerId);
    
    console.log(`[GameLogic] Matching data requested by ${player?.name || 'unknown'}`);
    
    // Only respond if in matching phase
    if (this.gameState.phase !== 'matching') {
      console.log('[GameLogic] Not in matching phase, ignoring request');
      socket.emit('error', { message: 'Not in matching phase' });
      return;
    }
    
    // Only send to host
    if (!player || !player.isHost) {
      console.log('[GameLogic] Requester is not host, ignoring');
      socket.emit('error', { message: 'Only the host can request matching data' });
      return;
    }
    
    // Send the matching data
    const matchingData = {
      answers: this.gameState.matchingAnswers || [],
      players: this.gameState.players
        .filter(p => !p.isHost)
        .map(p => ({ id: p.id, name: p.name }))
    };
    
    console.log(`[GameLogic] Sending matching data to ${player.name}: ${matchingData.answers.length} answers, ${matchingData.players.length} players`);
    socket.emit('matching_phase_start', matchingData);
  }

  // Handle matches submission from host
  handleMatchesSubmit(socket, data) {
    const playerId = socket.playerId;
    const player = this.gameState.players.find(p => p.id === playerId);
    
    if (!player || !player.isHost) {
      socket.emit('error', { message: 'Only the host can submit matches' });
      return;
    }
    
    if (this.gameState.phase !== 'matching') {
      socket.emit('error', { message: 'Not in matching phase' });
      return;
    }
    
    this.clearTimer('matching');
    this.gameState.matches = data.matches;
    
    // Save matches to database
    this.saveMatchesToDb();
    
    // Start reveal phase
    this.startRevealPhase();
  }

  // Auto-submit random matches if host times out
  autoSubmitMatches() {
    const shuffledAnswers = [...this.gameState.answers].sort(() => Math.random() - 0.5);
    const players = this.gameState.players.filter(p => !p.isHost);
    
    this.gameState.matches = players.map((player, index) => ({
      playerId: player.id,
      answerIndex: index % shuffledAnswers.length
    }));
    
    // Save auto-generated matches to database
    this.saveMatchesToDb();
    
    this.startRevealPhase();
  }

  // Start reveal phase
  startRevealPhase() {
    this.gameState.phase = 'reveal';
    this.gameState.revealIndex = 0;
    
    // Update round phase in database
    this.updateRoundInDb({ phase: 'reveal' });
    
    // Calculate results using matchingAnswers (shuffled) so index lookup is correct
    // The host matched against shuffled indices, so we need to use the shuffled array
    this.gameState.roundResults = this.scoreCalculator.calculateRoundResults(
      this.gameState.matches,
      this.gameState.matchingAnswers || this.gameState.answers,
      this.gameState.players
    );
    
    // Update host score
    const hostScoreResult = this.scoreCalculator.calculateHostScore(
      this.gameState.roundResults,
      this.config.bonuses.perfectRound
    );
    
    const host = this.getCurrentHost();
    host.score += hostScoreResult.score;
    
    // Save updated scores to database
    this.saveScoresToDb();
    
    // Emit matches summary for display before revealing
    this.io.to(this.gameState.roomCode).emit('matches_submitted', {
      matches: this.gameState.roundResults.map(r => ({
        answer: r.answer,
        guessedPlayer: r.guessedPlayer,
        actualPlayer: r.actualPlayer
      })),
      host: { name: host.name }
    });
    
    // Notify about reveal phase starting
    this.io.to(this.gameState.roomCode).emit('phase_changed', {
      phase: 'reveal',
      totalReveals: this.gameState.roundResults.length,
      currentHost: { id: host.id, name: host.name }
    });
    
    // Delay before starting reveals (show matches summary for 5 seconds)
    setTimeout(() => {
      this.revealNextMatch();
    }, 5000);
  }

  // Reveal next match
  revealNextMatch() {
    if (this.gameState.revealIndex >= this.gameState.roundResults.length) {
      // All revealed, move to round end
      this.startRoundEnd();
      return;
    }
    
    const result = this.gameState.roundResults[this.gameState.revealIndex];
    
    // Emit reveal
    this.io.to(this.gameState.roomCode).emit('reveal_result', {
      index: this.gameState.revealIndex,
      total: this.gameState.roundResults.length,
      guessedPlayer: result.guessedPlayer,
      actualPlayer: result.actualPlayer,
      answer: result.answer,
      isCorrect: result.isCorrect
    });
    
    this.gameState.revealIndex++;
    
    // Schedule next reveal
    setTimeout(() => {
      this.revealNextMatch();
    }, this.config.timers.reveal * 1000);
  }

  // Start round end phase
  startRoundEnd() {
    this.gameState.phase = 'round_end';
    
    // Get scoreboard
    const scoreboard = this.gameState.players
      .map(p => ({ id: p.id, name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score);
    
    // Calculate next host
    const nextHostIndex = (this.gameState.currentHostIndex + 1) % this.gameState.players.length;
    const nextHost = this.gameState.players[nextHostIndex];
    
    const hostScoreResult = this.scoreCalculator.calculateHostScore(
      this.gameState.roundResults,
      this.config.bonuses.perfectRound
    );
    
    // Emit round end
    this.io.to(this.gameState.roomCode).emit('round_end', {
      scoreboard,
      currentHost: { id: this.gameState.currentHost.id, name: this.gameState.currentHost.name },
      hostScore: hostScoreResult,
      nextHost: { id: nextHost.id, name: nextHost.name },
      currentRound: this.gameState.currentRound,
      totalRounds: this.gameState.totalRounds
    });
    
    // Update display
    if (this.displaySocket) {
      this.displaySocket.emit('game_state', this.getGameState());
    }
    
    // Start timer for next round
    this.startTimer('roundEnd', () => {
      this.handleNextRound();
    });
  }

  // Handle next round
  handleNextRound(socket = null) {
    this.clearTimer('roundEnd');
    
    // If in sudden death, check for winner after each round
    if (this.gameState.isSuddenDeath) {
      // Move to next tied player for hosting
      this.gameState.tiedPlayerHostIndex++;
      
      // Check if all tied players have hosted once (completed a full SD round)
      const tiedPlayersList = this.gameState.players.filter(p => p.isTiedPlayer);
      if (this.gameState.tiedPlayerHostIndex >= tiedPlayersList.length) {
        // All tied players have hosted - increment SD round counter and check for winner
        this.gameState.suddenDeathRound++;
        this.gameState.tiedPlayerHostIndex = 0;
        
        // Get current scores of tied players only
        const tiedScores = this.gameState.players
          .filter(p => p.isTiedPlayer)
          .map(p => ({ id: p.id, name: p.name, score: p.score }))
          .sort((a, b) => b.score - a.score);
        
        const highestScore = tiedScores[0].score;
        const stillTied = tiedScores.filter(p => p.score === highestScore);
        
        // If we have a single winner among tied players, end the game
        if (stillTied.length === 1) {
          this.endGame();
          return;
        }
        
        // Still tied - continue to next SD round
        log(`Sudden Death Round ${this.gameState.suddenDeathRound}: Still tied - ${stillTied.map(p => p.name).join(', ')}`);
      }
      
      // Find next tied player to host
      const nextTiedPlayer = tiedPlayersList[this.gameState.tiedPlayerHostIndex];
      this.gameState.currentHostIndex = this.gameState.players.findIndex(p => p.id === nextTiedPlayer.id);
      
      this.gameState.currentRound++;
      this.startThemeSelection();
      return;
    }
    
    // Regular game flow: Check if game over
    if (this.gameState.currentRound >= this.gameState.totalRounds) {
      this.endGame();
      return;
    }
    
    // Rotate host
    this.gameState.currentHostIndex = (this.gameState.currentHostIndex + 1) % this.gameState.players.length;
    
    // Check if completed a full rotation
    if (this.gameState.currentHostIndex === 0) {
      this.gameState.hostRotationCount++;
    }
    
    this.gameState.currentRound++;
    
    // Start next theme selection
    this.startThemeSelection();
  }

  // End game
  endGame() {
    // Get final scoreboard
    const scoreboard = this.gameState.players
      .map(p => ({ id: p.id, name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score);
    
    const highestScore = scoreboard[0].score;
    const tiedPlayers = scoreboard.filter(p => p.score === highestScore);
    
    // Check for tie - start sudden death if not already in sudden death
    if (tiedPlayers.length > 1 && !this.gameState.isSuddenDeath) {
      this.startSuddenDeath(tiedPlayers);
      return;
    }
    
    // We have a winner (either outright or after sudden death)
    this.gameState.phase = 'game_over';
    const winner = scoreboard[0];
    
    // Complete game in database and save to history
    this.updateGameInDb({ status: 'completed' });
    this.saveGameHistoryToDb(winner);
    
    // Emit game over
    this.io.to(this.gameState.roomCode).emit('game_over', {
      winner,
      scoreboard,
      wasSuddenDeath: this.gameState.isSuddenDeath,
      suddenDeathRounds: this.gameState.suddenDeathRound
    });
    
    // Update display
    if (this.displaySocket) {
      this.displaySocket.emit('game_state', this.getGameState());
    }
  }

  // Start sudden death round
  startSuddenDeath(tiedPlayers) {
    this.gameState.isSuddenDeath = true;
    this.gameState.suddenDeathRound = 0; // Will increment when first tied player finishes hosting
    this.gameState.phase = 'sudden_death';
    
    // Store tied player IDs for host rotation
    const tiedPlayerIds = tiedPlayers.map(p => p.id);
    this.gameState.suddenDeathPlayers = tiedPlayers;
    this.gameState.tiedPlayerIds = tiedPlayerIds;
    
    // Keep ALL players in the game (non-tied players still answer)
    // But mark who is tied for host rotation logic
    this.gameState.players.forEach(p => {
      p.isTiedPlayer = tiedPlayerIds.includes(p.id);
    });
    
    // Find index of first tied player to start hosting
    this.gameState.currentHostIndex = this.gameState.players.findIndex(p => p.isTiedPlayer);
    this.gameState.tiedPlayerHostIndex = 0; // Track which tied player is hosting
    
    // Emit sudden death start event
    this.io.to(this.gameState.roomCode).emit('sudden_death_start', {
      tiedPlayers: this.gameState.suddenDeathPlayers,
      message: `${tiedPlayers.length} players tied at ${tiedPlayers[0].score} points!`,
      round: this.gameState.suddenDeathRound
    });
    
    // Update display
    if (this.displaySocket) {
      this.displaySocket.emit('game_state', this.getGameState());
    }
    
    // Start sudden death with first tied player as host
    setTimeout(() => {
      this.startThemeSelection();
    }, 5000); // 5 second delay to show sudden death announcement
  }

  // Handle play again
  handlePlayAgain(socket) {
    // Reset game state but keep players
    const players = this.gameState.players.map(p => ({
      ...p,
      score: 0,
      isHost: p.joinOrder === 0
    }));
    
    this.gameState = this.createInitialState();
    this.gameState.players = players;
    this.gameState.roomCode = this.roomManager.getCurrentRoomCode();
    this.gameState.currentHost = players[0];
    
    // Reset Claude service session to clear used theme tracking
    this.claudeService.resetSession();
    
    // Notify all
    this.io.to(this.gameState.roomCode).emit('game_reset', {
      players: players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
    });
    
    // Update display
    if (this.displaySocket) {
      this.displaySocket.emit('game_state', this.getGameState());
    }
  }

  // Handle disconnect
  handleDisconnect(socket) {
    const player = this.gameState.players.find(p => p.socketId === socket.id);
    
    if (player) {
      player.isConnected = false;
      
      // Notify others (but indicate it may be temporary)
      this.io.to(this.gameState.roomCode).emit('player_disconnected', {
        playerId: player.id,
        playerName: player.name,
        mayReconnect: true
      });
      
      // If host disconnected during their turn, start grace period timer
      // Don't auto-progress immediately - give them time to reconnect (e.g., page refresh)
      if (player.isHost && ['theme_select', 'matching'].includes(this.gameState.phase)) {
        // Clear any existing grace period timer for this player
        if (this.disconnectTimers[player.id]) {
          clearTimeout(this.disconnectTimers[player.id]);
        }
        
        // Set grace period timer - only auto-progress if they don't reconnect
        this.disconnectTimers[player.id] = setTimeout(() => {
          // Check if still disconnected
          const currentPlayer = this.gameState.players.find(p => p.id === player.id);
          if (currentPlayer && !currentPlayer.isConnected) {
            console.log(`Host ${player.name} did not reconnect within grace period, auto-progressing`);
            
            // Auto-progress the phase
            if (this.gameState.phase === 'theme_select') {
              this.selectTheme(this.gameState.themes[0] || this.claudeService.getFallbackThemes()[0]);
            } else if (this.gameState.phase === 'matching') {
              this.autoSubmitMatches();
            }
          }
          delete this.disconnectTimers[player.id];
        }, this.RECONNECT_GRACE_PERIOD);
      }
      
      // Update display
      if (this.displaySocket) {
        this.displaySocket.emit('game_state', this.getGameState());
      }
    }
  }

  // Handle reconnection
  handleReconnect(socket, data) {
    const { sessionToken, playerId } = data;
    const player = this.gameState.players.find(p => 
      p.id === playerId && p.sessionToken === sessionToken
    );
    
    if (player) {
      // Clear any pending disconnect timer
      if (this.disconnectTimers[player.id]) {
        clearTimeout(this.disconnectTimers[player.id]);
        delete this.disconnectTimers[player.id];
        console.log(`Player ${player.name} reconnected within grace period`);
      }
      
      player.isConnected = true;
      player.socketId = socket.id;
      socket.playerId = player.id;
      socket.join(this.gameState.roomCode);
      
      // Get player's submitted answer if any
      const playerAnswer = this.gameState.answers.find(a => a.playerId === player.id);
      
      // Build reconnection data with phase-specific information
      const reconnectData = {
        player,
        gameState: this.getGameState(),
        // Include player's own submitted answer
        submittedAnswer: playerAnswer ? playerAnswer.answer : null,
        // Include themes for host during theme selection
        themes: player.isHost ? this.gameState.themes : null
      };
      
      socket.emit('reconnected', reconnectData);
      
      // If host reconnected during matching phase, send matching data
      if (player.isHost && this.gameState.phase === 'matching') {
        socket.emit('matching_phase_start', {
          answers: this.gameState.matchingAnswers || [],
          players: this.gameState.players.filter(p => !p.isHost).map(p => ({ id: p.id, name: p.name }))
        });
      }
      
      // Notify others
      this.io.to(this.gameState.roomCode).emit('player_reconnected', {
        playerId: player.id,
        playerName: player.name
      });
      
      // Update display
      if (this.displaySocket) {
        this.displaySocket.emit('game_state', this.getGameState());
      }
    } else {
      socket.emit('reconnect_failed', { message: 'Session expired' });
    }
  }

  // ==================== DATABASE PERSISTENCE METHODS ====================

  /**
   * Save player to database
   */
  savePlayerToDb(player) {
    if (!this.db) return;
    
    const gameId = this.roomManager.getCurrentGameId();
    if (!gameId) return;
    
    try {
      this.db.addPlayer(gameId, player);
    } catch (error) {
      console.error('Failed to save player to database:', error);
    }
  }

  /**
   * Update player in database
   */
  updatePlayerInDb(playerId, updates) {
    if (!this.db) return;
    
    try {
      this.db.updatePlayer(playerId, updates);
    } catch (error) {
      console.error('Failed to update player in database:', error);
    }
  }

  /**
   * Update game status in database
   */
  updateGameInDb(updates) {
    if (!this.db) return;
    
    const gameId = this.roomManager.getCurrentGameId();
    if (!gameId) return;
    
    try {
      this.db.updateGame(gameId, updates);
    } catch (error) {
      console.error('Failed to update game in database:', error);
    }
  }

  /**
   * Create a new round in database
   */
  createRoundInDb(roundNumber, hostId, theme = null) {
    if (!this.db) return null;
    
    const gameId = this.roomManager.getCurrentGameId();
    if (!gameId) return null;
    
    try {
      this.currentRoundId = this.db.createRound(gameId, roundNumber, hostId, theme);
      return this.currentRoundId;
    } catch (error) {
      console.error('Failed to create round in database:', error);
      return null;
    }
  }

  /**
   * Update round in database
   */
  updateRoundInDb(updates) {
    if (!this.db || !this.currentRoundId) return;
    
    try {
      this.db.updateRound(this.currentRoundId, updates);
    } catch (error) {
      console.error('Failed to update round in database:', error);
    }
  }

  /**
   * Save all answers for current round
   */
  saveAnswersToDb() {
    if (!this.db || !this.currentRoundId) return;
    
    try {
      this.db.saveAnswers(this.currentRoundId, this.gameState.answers);
    } catch (error) {
      console.error('Failed to save answers to database:', error);
    }
  }

  /**
   * Save all matches for current round
   */
  saveMatchesToDb() {
    if (!this.db || !this.currentRoundId) return;
    
    try {
      this.db.saveMatches(this.currentRoundId, this.gameState.matches);
    } catch (error) {
      console.error('Failed to save matches to database:', error);
    }
  }

  /**
   * Save player scores to database
   */
  saveScoresToDb() {
    if (!this.db) return;
    
    try {
      this.db.updatePlayerScores(this.gameState.players);
    } catch (error) {
      console.error('Failed to save scores to database:', error);
    }
  }

  /**
   * Complete current round in database
   */
  completeRoundInDb() {
    if (!this.db || !this.currentRoundId) return;
    
    try {
      this.db.completeRound(this.currentRoundId);
    } catch (error) {
      console.error('Failed to complete round in database:', error);
    }
  }

  /**
   * Save game to history
   */
  saveGameHistoryToDb(winner) {
    if (!this.db) return;
    
    const gameId = this.roomManager.getCurrentGameId();
    if (!gameId) return;
    
    try {
      this.db.saveGameHistory(
        gameId,
        winner,
        this.gameState.players.length,
        this.gameState.currentRound
      );
    } catch (error) {
      console.error('Failed to save game history:', error);
    }
  }

  // ==================== END DATABASE METHODS ====================

  // Helper: Get socket for player
  getPlayerSocket(playerId) {
    const player = this.gameState.players.find(p => p.id === playerId);
    if (!player) return null;
    
    return this.io.sockets.sockets.get(player.socketId);
  }

  // Timer management
  startTimer(timerName, callback) {
    this.clearTimer(timerName);
    
    const duration = this.config.timers[timerName] * 1000;
    const startTime = Date.now();
    
    const totalSeconds = this.config.timers[timerName];

    // Broadcast timer updates
    this.timers[`${timerName}_interval`] = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
      
      this.io.to(this.gameState.roomCode).emit('timer_update', {
        phase: timerName,
        remaining,
        totalSeconds
      });
    }, 1000);
    
    // Main timer
    this.timers[timerName] = setTimeout(() => {
      this.clearTimer(timerName);
      callback();
    }, duration);
  }

  clearTimer(timerName) {
    if (this.timers[timerName]) {
      clearTimeout(this.timers[timerName]);
      delete this.timers[timerName];
    }
    if (this.timers[`${timerName}_interval`]) {
      clearInterval(this.timers[`${timerName}_interval`]);
      delete this.timers[`${timerName}_interval`];
    }
  }
}

module.exports = GameLogic;
