/**
 * Host Phone Script - Controller view for the current round's host
 */
(function() {
  const ui = new UIController();
  let socket;
  let player = null;
  let gameState = null;
  
  // ============================================
  // SIMPLE TAP MATCHING
  // ============================================
  let selectedAnswer = null;
  let matches = {};
  let colorIndex = 0;
  let answersData = [];
  let playersData = [];
  
  const colors = [
    '#ff9f9f', '#ffd29f', '#ffff9f',
    '#b4ff9f', '#9ffff5', '#9fc9ff',
    '#c79fff', '#ff9fc7', '#d4a5ff', '#ffa5d4'
  ];

  // Initialize matching screen with data
  function initializeMatching(data) {
    console.log('[Matching] Initializing with data:', data);
    
    // Validate data
    if (!data || !Array.isArray(data.answers) || !Array.isArray(data.players)) {
      console.error('[Matching] Invalid data received:', data);
      return false;
    }
    
    if (data.answers.length === 0 || data.players.length === 0) {
      console.error('[Matching] Empty answers or players:', data);
      return false;
    }
    
    // Store data
    answersData = data.answers;
    playersData = data.players;
    
    // Reset state
    selectedAnswer = null;
    matches = {};
    colorIndex = 0;
    
    // Build UI
    buildMatchingUI();
    
    console.log('[Matching] Initialization complete. Answers:', answersData.length, 'Players:', playersData.length);
    return true;
  }

  // Build the matching UI
  function buildMatchingUI() {
    // Update progress indicator
    ui.setText('matches-total', playersData.length);
    ui.setText('matches-count', '0');
    
    // Build answers list
    const answersList = document.getElementById('answers-list');
    if (answersList) {
      answersList.innerHTML = answersData.map((a, idx) => {
        const answerIndex = a.index !== undefined ? a.index : idx;
        return `<div class="item answer" data-id="${answerIndex}">"${ui.escapeHtml(a.answer)}"</div>`;
      }).join('');
      
      // Add tap listeners to answers
      answersList.querySelectorAll('.answer').forEach(ans => {
        ans.addEventListener('click', () => handleAnswerTap(ans));
      });
    }
    
    // Build players list
    const playersList = document.getElementById('players-list');
    if (playersList) {
      playersList.innerHTML = playersData.map(p => 
        `<div class="item player" data-id="${p.id}">${ui.escapeHtml(p.name)}</div>`
      ).join('');
      
      // Add tap listeners to players
      playersList.querySelectorAll('.player').forEach(player => {
        player.addEventListener('click', () => handlePlayerTap(player));
      });
    }
    
    updateSubmitButton();
  }

  // Handle answer tap
  function handleAnswerTap(answerElement) {
    // If already matched, ignore
    if (answerElement.classList.contains('matched')) return;
    
    // If tapping the same answer, deselect it
    if (selectedAnswer === answerElement) {
      answerElement.classList.remove('selected');
      selectedAnswer = null;
      ui.vibrate(25);
      return;
    }
    
    // Clear previous selection
    clearSelection();
    
    // Select this answer
    selectedAnswer = answerElement;
    answerElement.classList.add('selected');
    
    ui.vibrate(25);
  }

  // Handle player tap
  function handlePlayerTap(playerElement) {
    // If already matched, ignore
    if (playerElement.classList.contains('matched')) return;
    
    // If no answer selected, do nothing
    if (!selectedAnswer) return;
    
    const answerId = selectedAnswer.dataset.id;
    const playerId = playerElement.dataset.id;
    
    // Assign next color
    const color = colors[colorIndex % colors.length];
    colorIndex++;
    
    // Store match
    matches[answerId] = playerId;
    
    // Visually lock both with same color
    selectedAnswer.style.background = color;
    selectedAnswer.classList.remove('selected');
    selectedAnswer.classList.add('matched');
    
    playerElement.style.background = color;
    playerElement.classList.add('matched');
    
    // Clear selection
    selectedAnswer = null;
    
    // Update progress
    ui.setText('matches-count', Object.keys(matches).length);
    updateSubmitButton();
    
    ui.vibrate(50);
    console.log('[Matching] Match created:', answerId, '→', playerId);
  }

  // Clear selected state
  function clearSelection() {
    document.querySelectorAll('.item.selected').forEach(el => {
      el.classList.remove('selected');
    });
    selectedAnswer = null;
  }

  // Reset all matches
  function resetAllMatches() {
    matches = {};
    selectedAnswer = null;
    colorIndex = 0;
    
    document.querySelectorAll('.item').forEach(el => {
      el.style.background = '';
      el.classList.remove('selected', 'matched');
    });
    
    ui.setText('matches-count', '0');
    updateSubmitButton();
    ui.vibrate(100);
    console.log('[Matching] All matches reset');
  }

  // Update submit button state
  function updateSubmitButton() {
    const totalPlayers = playersData.length;
    const matchedCount = Object.keys(matches).length;
    ui.setButtonEnabled('submit-matches', matchedCount === totalPlayers && totalPlayers > 0);
  }

  // Get matches for server submission
  function getMatchesForSubmission() {
    return Object.entries(matches).map(([answerIndex, playerId]) => ({
      answerIndex: parseInt(answerIndex),
      playerId
    }));
  }

  // ============================================
  // SOCKET & GAME LOGIC
  // ============================================

  // Initialize
  function init() {
    // Check for stored session
    const storedSession = ui.retrieve('session');
    if (storedSession) {
      attemptReconnect(storedSession);
    }

    connectSocket();
    setupEventListeners();
  }

  // Connect to Socket.io
  function connectSocket() {
    socket = io();

    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    // Join events
    socket.on('room_joined', handleRoomJoined);
    socket.on('join_error', handleJoinError);
    socket.on('reconnected', handleReconnected);
    socket.on('reconnect_failed', handleReconnectFailed);

    // Game events
    socket.on('player_joined', handlePlayerJoined);
    socket.on('game_started', handleGameStarted);
    socket.on('phase_changed', handlePhaseChanged);
    socket.on('themes_generated', handleThemesGenerated);
    socket.on('theme_selected', handleThemeSelected);
    socket.on('submission_progress', handleSubmissionProgress);
    socket.on('timer_update', handleTimerUpdate);
    socket.on('matching_phase_start', handleMatchingStart);
    socket.on('round_end', handleRoundEnd);
    socket.on('game_over', handleGameOver);
    socket.on('game_reset', handleGameReset);
    socket.on('error', handleError);
  }

  // Attempt reconnection
  function attemptReconnect(session) {
    socket.emit('reconnect_player', {
      playerId: session.playerId,
      sessionToken: session.sessionToken
    });
  }

  // Setup event listeners
  function setupEventListeners() {
    // Join form
    const joinForm = document.getElementById('host-join-form');
    if (joinForm) {
      joinForm.addEventListener('submit', handleJoinSubmit);
    }

    // Start game button
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
      startBtn.addEventListener('click', handleStartGame);
    }

    // Matching controls
    const resetBtn = document.getElementById('reset-matches');
    if (resetBtn) {
      resetBtn.addEventListener('click', resetAllMatches);
    }

    const submitMatchesBtn = document.getElementById('submit-matches');
    if (submitMatchesBtn) {
      submitMatchesBtn.addEventListener('click', submitMatches);
    }

    // Play again button
    const playAgainBtn = document.getElementById('play-again-btn');
    if (playAgainBtn) {
      playAgainBtn.addEventListener('click', handlePlayAgain);
    }
  }

  // Handle join submit
  function handleJoinSubmit(e) {
    e.preventDefault();
    
    const roomCode = document.getElementById('room-code').value.trim().toUpperCase();
    const name = document.getElementById('player-name').value.trim();

    if (!roomCode || !name) {
      ui.showError('join-error', 'Please enter room code and name');
      return;
    }

    socket.emit('join_room', { roomCode, name });
  }

  // Handle room joined
  function handleRoomJoined(data) {
    player = data.player;
    gameState = { players: data.players, phase: 'lobby' };

    // Store session for reconnection
    ui.store('session', {
      playerId: player.id,
      sessionToken: player.sessionToken,
      name: player.name,
      roomCode: data.roomCode
    });

    ui.hideError('join-error');
    ui.showScreen('lobby-screen');
    updateLobbyDisplay();
  }

  // Handle join error
  function handleJoinError(data) {
    ui.showError('join-error', data.message);
  }

  // Handle reconnection
  function handleReconnected(data) {
    player = data.player;
    gameState = data.gameState;
    
    // Store themes if provided (for theme selection phase)
    if (data.themes) {
      gameState.themes = data.themes;
    }
    
    updateDisplayForCurrentPhase();
  }

  // Handle reconnect failed
  function handleReconnectFailed(data) {
    ui.clearStore('session');
    ui.showScreen('connect-screen');
  }

  // Handle player joined
  function handlePlayerJoined(data) {
    if (!gameState) gameState = { players: [] };
    gameState.players = data.players;
    updateLobbyDisplay();
  }

  // Update lobby display
  function updateLobbyDisplay() {
    ui.updatePlayerList('player-list', gameState.players);
    ui.setText('player-count', gameState.players.length);

    // Update start button
    const canStart = gameState.players.length >= 3;
    ui.setButtonEnabled('start-game-btn', canStart);
    ui.setText('start-notice', canStart ? 'Ready to start!' : `Need at least 3 players (${gameState.players.length} joined)`);

    // Check if this player is host
    const currentPlayer = gameState.players.find(p => p.id === player?.id);
    if (currentPlayer) {
      const hostIndex = gameState.players.findIndex(p => p.isHost);
      ui.setText('hosting-round', hostIndex + 1);
    }
  }

  // Handle start game
  function handleStartGame() {
    socket.emit('start_game');
  }

  // Handle game started
  function handleGameStarted(data) {
    gameState.totalRounds = data.totalRounds;
    gameState.currentRound = data.currentRound;
  }

  // Handle phase changed
  function handlePhaseChanged(data) {
    gameState.phase = data.phase;
    
    switch (data.phase) {
      case 'theme_select':
        showThemeSelectScreen(data);
        break;
      case 'answering':
        showWaitingAnswersScreen(data);
        break;
      case 'matching':
        // Show the matching screen - data will arrive via matching_phase_start event
        ui.showScreen('matching-screen');
        break;
      case 'reveal':
        // Host views results with everyone else
        break;
    }
  }

  // Show theme selection screen
  function showThemeSelectScreen(data) {
    ui.showScreen('theme-select-screen');
    ui.toggleElement('themes-loading', true);
    ui.toggleElement('themes-container', false);
    
    // Request themes
    socket.emit('request_themes');
  }

  // Handle themes generated
  function handleThemesGenerated(data) {
    ui.toggleElement('themes-loading', false);
    ui.toggleElement('themes-container', false);
    
    const container = document.getElementById('themes-container');
    if (!container) return;

    container.innerHTML = '';
    
    data.themes.forEach((theme, index) => {
      const card = document.createElement('div');
      card.className = 'theme-card';
      card.dataset.index = index;
      card.innerHTML = `<p>${ui.escapeHtml(theme)}</p>`;
      card.addEventListener('click', () => selectTheme(theme, card));
      container.appendChild(card);
    });

    ui.toggleElement('themes-container', true);
  }

  // Select theme
  function selectTheme(theme, cardElement) {
    // Remove selected class from all cards
    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('selected'));
    
    // Add selected class to clicked card
    cardElement.classList.add('selected');
    
    // Vibrate
    ui.vibrate();
    
    // Send selection to server
    socket.emit('host_select_theme', { theme });
  }

  // Handle theme selected
  function handleThemeSelected(data) {
    gameState.selectedTheme = data.theme;
  }

  // Show waiting for answers screen
  function showWaitingAnswersScreen(data) {
    ui.showScreen('waiting-answers-screen');
    ui.setText('selected-theme-text', data.theme || gameState.selectedTheme);
    
    const nonHostPlayers = gameState.players.filter(p => !p.isHost);
    ui.setText('answers-total', nonHostPlayers.length);
    ui.setText('answers-submitted', '0');

    // Show submission status
    const statusList = document.getElementById('submission-status');
    if (statusList) {
      statusList.innerHTML = nonHostPlayers.map(p => `
        <li>
          <span>${ui.escapeHtml(p.name)}</span>
          <span class="status-icon pending">⏳</span>
        </li>
      `).join('');
    }
  }

  // Handle submission progress
  function handleSubmissionProgress(data) {
    ui.setText('answers-submitted', data.submitted);
    
    // Update progress on screen
    const statusList = document.getElementById('submission-status');
    if (statusList) {
      const icons = statusList.querySelectorAll('.status-icon');
      icons.forEach((icon, index) => {
        if (index < data.submitted) {
          icon.classList.remove('pending');
          icon.classList.add('done');
          icon.textContent = '✓';
        }
      });
    }
  }

  // Handle timer update
  function handleTimerUpdate(data) {
    const timerMap = {
      'themeSelection': 'theme-timer',
      'answering': 'answer-timer',
      'matching': 'matching-timer'
    };

    const timerId = timerMap[data.phase];
    if (timerId) {
      ui.updateTimer(timerId, data.remaining);
    }
  }

  // Handle matching phase start
  function handleMatchingStart(data) {
    console.log('[Host] Received matching_phase_start event:', data);
    
    // Ensure we're on the matching screen
    ui.showScreen('matching-screen');
    
    // Initialize matching with data
    const success = initializeMatching(data);
    
    if (!success) {
      console.error('[Host] Failed to initialize matching screen');
    }
  }

  // Submit matches
  function submitMatches() {
    const matchesArray = getMatchesForSubmission();
    
    console.log('[Host] Submitting matches:', matchesArray);
    socket.emit('host_submit_matches', { matches: matchesArray });
    ui.vibrate(100);
  }

  // Handle round end
  function handleRoundEnd(data) {
    ui.showScreen('results-screen');
    
    ui.setText('round-score', data.hostScore.score);
    ui.setText('next-host', data.nextHost.name);
    
    if (data.hostScore.isPerfect) {
      ui.toggleElement('perfect-bonus', true);
    } else {
      ui.toggleElement('perfect-bonus', false);
    }
    
    ui.updateScoreboard('scoreboard-list', data.scoreboard, player?.id);
  }

  // Handle game over
  function handleGameOver(data) {
    ui.showScreen('game-over-screen');
    
    ui.setText('winner-name', data.winner.name);
    ui.setText('winner-score', data.winner.score);
    
    ui.updateScoreboard('final-scoreboard', data.scoreboard, player?.id);
  }

  // Handle play again
  function handlePlayAgain() {
    socket.emit('play_again');
  }

  // Handle game reset
  function handleGameReset(data) {
    gameState = { players: data.players, phase: 'lobby' };
    ui.showScreen('lobby-screen');
    updateLobbyDisplay();
  }

  // Handle error
  function handleError(data) {
    alert(data.message);
  }

  // Update display for current phase
  function updateDisplayForCurrentPhase() {
    if (!gameState) {
      ui.showScreen('connect-screen');
      return;
    }

    switch (gameState.phase) {
      case 'lobby':
        ui.showScreen('lobby-screen');
        updateLobbyDisplay();
        break;
      case 'theme_select':
        showThemeSelectScreen({});
        // If we have themes from reconnection, show them immediately
        if (gameState.themes && gameState.themes.length > 0) {
          handleThemesGenerated({ themes: gameState.themes });
        }
        break;
      case 'answering':
        showWaitingAnswersScreen({ theme: gameState.selectedTheme });
        break;
      case 'matching':
        ui.showScreen('matching-screen');
        // Request matching data
        socket.emit('request_matching_data');
        break;
      case 'reveal':
        // Host views results with everyone else
        ui.showScreen('results-screen');
        break;
      case 'round_end':
        ui.showScreen('results-screen');
        break;
      case 'game_over':
        ui.showScreen('game-over-screen');
        break;
      default:
        ui.showScreen('lobby-screen');
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
