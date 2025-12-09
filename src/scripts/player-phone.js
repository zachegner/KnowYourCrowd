/**
 * Player Phone Script - Player view for Know Your Crowd
 * Also handles host functionality when player becomes host
 */
(function() {
  const ui = new UIController();
  let socket;
  let player = null;
  let gameState = null;
  let submittedAnswer = null;
  
  // Host mode variables - simple tap matching
  let isInHostMode = false;
  let selectedAnswer = null;
  let matches = {};
  let colorIndex = 0;
  let answersData = [];
  let playersData = [];
  
  // UX Enhancement variables
  let previousScoreboard = null;
  let submissionPosition = 0;
  let tipRotationInterval = null;
  
  const colors = [
    '#ff9f9f', '#ffd29f', '#ffff9f',
    '#b4ff9f', '#9ffff5', '#9fc9ff',
    '#c79fff', '#ff9fc7', '#d4a5ff', '#ffa5d4'
  ];
  
  // Encouraging messages for submission
  const encouragingMessages = [
    "Great answer! 🎯",
    "Nice one! ✨",
    "Love it! 💫",
    "Perfect! 🌟",
    "Awesome! 🔥",
    "Brilliant! 💡"
  ];
  
  // Tips for waiting states
  const waitingTips = [
    "💡 Think about what makes you unique!",
    "🎯 Be specific - generic answers are easy to guess!",
    "🤔 What would surprise everyone?",
    "✨ Your personality shines through your answers!",
    "🎭 Channel your inner comedian!",
    "💭 What's something only you would say?"
  ];

  // Initialize
  function init() {
    connectSocket();
    setupEventListeners();
    checkUrlParameters();
  }

  // Check URL parameters for auto-fill room code from QR scan
  function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    
    if (roomCode) {
      const roomCodeInput = document.getElementById('room-code');
      if (roomCodeInput) {
        roomCodeInput.value = roomCode.toUpperCase();
        // Focus the name input so player can start typing immediately
        const nameInput = document.getElementById('player-name');
        if (nameInput) {
          nameInput.focus();
        }
      }
    }
  }

  // Connect to Socket.io
  function connectSocket() {
    socket = io();

    socket.on('connect', () => {
      console.log('Connected to server');
      updateConnectionStatus(true);
      
      // Check for stored session after socket is connected
      const storedSession = ui.retrieve('session');
      if (storedSession) {
        attemptReconnect(storedSession);
      }
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      updateConnectionStatus(false);
    });

    // Join events
    socket.on('room_joined', handleRoomJoined);
    socket.on('join_error', handleJoinError);
    socket.on('reconnected', handleReconnected);
    socket.on('reconnect_failed', handleReconnectFailed);

    // Game events
    socket.on('player_joined', handlePlayerJoined);
    socket.on('player_disconnected', handlePlayerDisconnected);
    socket.on('game_started', handleGameStarted);
    socket.on('phase_changed', handlePhaseChanged);
    socket.on('theme_selected', handleThemeSelected);
    socket.on('answer_submitted', handleAnswerSubmitted);
    socket.on('submission_progress', handleSubmissionProgress);
    socket.on('timer_update', handleTimerUpdate);
    socket.on('penalty_applied', handlePenaltyApplied);
    socket.on('reveal_result', handleRevealResult);
    socket.on('round_end', handleRoundEnd);
    socket.on('sudden_death_start', handleSuddenDeathStart);
    socket.on('game_over', handleGameOver);
    socket.on('game_reset', handleGameReset);
    socket.on('error', handleError);
    
    // Host-specific events
    socket.on('themes_generated', handleThemesGenerated);
    socket.on('matching_phase_start', handleMatchingStart);
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
    const joinForm = document.getElementById('join-form');
    if (joinForm) {
      joinForm.addEventListener('submit', handleJoinSubmit);
    }

    // Answer form
    const answerForm = document.getElementById('answer-form');
    if (answerForm) {
      answerForm.addEventListener('submit', handleAnswerSubmit);
    }

    // Answer input character counter and styling
    const answerInput = document.getElementById('answer-input');
    if (answerInput) {
      answerInput.addEventListener('input', () => {
        const length = answerInput.value.length;
        ui.setText('char-count', length);
        
        // Add visual feedback for content
        if (length > 0) {
          answerInput.classList.add('has-content');
        } else {
          answerInput.classList.remove('has-content');
        }
        
        // Update encouragement text based on length
        updateEncouragementText(length);
      });
    }

    // Room code auto-uppercase and auto-advance
    const roomCodeInput = document.getElementById('room-code');
    if (roomCodeInput) {
      roomCodeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
        
        // Update validation styling
        const group = document.getElementById('room-code-group');
        if (e.target.value.length === 4) {
          group?.classList.add('valid');
          // Auto-advance to name field
          const nameInput = document.getElementById('player-name');
          if (nameInput && !nameInput.value) {
            nameInput.focus();
          }
        } else {
          group?.classList.remove('valid');
        }
      });
    }
    
    // Player name input validation
    const playerNameInput = document.getElementById('player-name');
    if (playerNameInput) {
      playerNameInput.addEventListener('input', (e) => {
        const group = document.getElementById('player-name-group');
        if (e.target.value.trim().length >= 2) {
          group?.classList.add('valid');
        } else {
          group?.classList.remove('valid');
        }
      });
    }
    
    // Host mode button - switch to host view
    const switchToHostBtn = document.getElementById('switch-to-host-btn');
    if (switchToHostBtn) {
      switchToHostBtn.addEventListener('click', switchToHostMode);
    }
    
    // Reset matches button
    const resetBtn = document.getElementById('reset-matches');
    if (resetBtn) {
      resetBtn.addEventListener('click', resetAllMatches);
    }

    // Submit matches button
    const submitMatchesBtn = document.getElementById('submit-matches');
    if (submitMatchesBtn) {
      submitMatchesBtn.addEventListener('click', submitMatches);
    }
    
    // Start tip rotation for lobby
    startTipRotation();
  }
  
  // Update connection status indicator
  function updateConnectionStatus(connected) {
    const dot = document.getElementById('connection-dot');
    const text = document.getElementById('connection-text');
    
    if (dot) {
      dot.classList.toggle('disconnected', !connected);
    }
    if (text) {
      text.textContent = connected ? 'Connected' : 'Reconnecting...';
    }
  }
  
  // Update encouragement text based on input length
  function updateEncouragementText(length) {
    const el = document.getElementById('encouragement-text');
    if (!el) return;
    
    if (length === 0) {
      el.textContent = "Think creatively! Be specific and unique.";
    } else if (length < 20) {
      el.textContent = "Keep going... add more detail!";
    } else if (length < 50) {
      el.textContent = "Nice! That's getting interesting.";
    } else {
      el.textContent = "Great answer! Ready to submit?";
    }
  }
  
  // Start rotating tips
  function startTipRotation() {
    let tipIndex = 0;
    
    tipRotationInterval = setInterval(() => {
      tipIndex = (tipIndex + 1) % waitingTips.length;
      
      const lobbyTip = document.getElementById('lobby-tip');
      const waitingTip = document.getElementById('waiting-tip');
      
      if (lobbyTip) lobbyTip.textContent = waitingTips[tipIndex];
      if (waitingTip) waitingTip.textContent = waitingTips[(tipIndex + 2) % waitingTips.length];
    }, 5000);
  }
  
  // Trigger confetti celebration
  function triggerConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const colors = ['#FFD700', '#E63946', '#00B4D8', '#00D26A', '#FF6B35', '#FFEE00'];
    
    for (let i = 0; i < 30; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.left = `${Math.random() * 100}%`;
      confetti.style.top = `${Math.random() * 30}%`;
      confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
      confetti.style.animationDelay = `${Math.random() * 0.5}s`;
      confetti.style.animationDuration = `${1.5 + Math.random()}s`;
      container.appendChild(confetti);
      
      // Trigger animation
      setTimeout(() => confetti.classList.add('animate'), 10);
    }
    
    // Clean up after animation
    setTimeout(() => {
      container.innerHTML = '';
    }, 3000);
  }

  // Handle join submit
  function handleJoinSubmit(e) {
    e.preventDefault();
    
    const roomCode = document.getElementById('room-code').value.trim().toUpperCase();
    const name = document.getElementById('player-name').value.trim();

    if (!roomCode || !name) {
      ui.showError('join-error', 'Please enter room code and name');
      // Shake the form
      const form = document.getElementById('join-form');
      form?.classList.add('input-shake');
      setTimeout(() => form?.classList.remove('input-shake'), 600);
      return;
    }

    // Show loading state on button
    const joinBtn = document.getElementById('join-btn');
    if (joinBtn) {
      joinBtn.classList.add('loading');
      joinBtn.textContent = 'Joining...';
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

    // Reset join button
    const joinBtn = document.getElementById('join-btn');
    if (joinBtn) {
      joinBtn.classList.remove('loading');
      joinBtn.textContent = 'Join Game';
    }

    ui.hideError('join-error');
    ui.showScreen('lobby-screen');
    ui.setText('your-name', player.name);
    updateLobbyDisplay();
    ui.vibrate(50);
  }

  // Handle join error
  function handleJoinError(data) {
    ui.showError('join-error', data.message);
    
    // Reset join button
    const joinBtn = document.getElementById('join-btn');
    if (joinBtn) {
      joinBtn.classList.remove('loading');
      joinBtn.textContent = 'Join Game';
    }
    
    // Shake the form
    const form = document.getElementById('join-form');
    form?.classList.add('input-shake');
    setTimeout(() => form?.classList.remove('input-shake'), 600);
  }

  // Handle reconnection
  function handleReconnected(data) {
    player = data.player;
    gameState = data.gameState;
    
    // Restore submitted answer if any
    if (data.submittedAnswer) {
      submittedAnswer = data.submittedAnswer;
    }
    
    // Store themes for host if provided
    if (data.themes && player.isHost) {
      gameState.themes = data.themes;
    }
    
    ui.setText('your-name', player.name);
    updateDisplayForCurrentPhase();
  }

  // Handle reconnect failed
  function handleReconnectFailed(data) {
    ui.clearStore('session');
    ui.showScreen('join-screen');
  }

  // Handle player joined
  function handlePlayerJoined(data) {
    if (!gameState) gameState = { players: [] };
    gameState.players = data.players;
    updateLobbyDisplay();
  }

  // Handle player disconnected
  function handlePlayerDisconnected(data) {
    if (gameState) {
      gameState.players = gameState.players.filter(p => p.id !== data.playerId);
      updateLobbyDisplay();
    }
  }

  // Update lobby display
  function updateLobbyDisplay() {
    ui.updatePlayerList('player-list', gameState.players);
    ui.setText('player-count', gameState.players.length);
  }

  // Handle game started
  function handleGameStarted(data) {
    gameState.totalRounds = data.totalRounds;
    gameState.currentRound = data.currentRound;
  }

  // Handle phase changed
  function handlePhaseChanged(data) {
    gameState.phase = data.phase;
    
    // Check if this player is the host
    const isHost = data.currentHost && data.currentHost.id === player?.id;
    
    if (isHost) {
      isInHostMode = true;
      
      switch (data.phase) {
        case 'theme_select':
          showHostThemeSelectScreen(data);
          socket.emit('request_themes');
          break;
        case 'answering':
          showHostWaitingAnswersScreen(data);
          break;
        case 'matching':
          if (data.answers && data.players) {
            showHostMatchingScreen(data);
          }
          break;
        case 'reveal':
          showRevealScreen();
          break;
      }
      return;
    }
    
    // Not the host - show regular player screens
    isInHostMode = false;
    
    switch (data.phase) {
      case 'theme_select':
        showThemeWaitScreen(data);
        break;
      case 'answering':
        showAnswerScreen(data);
        break;
      case 'matching':
        showMatchingWaitScreen(data);
        break;
      case 'reveal':
        showRevealScreen();
        break;
    }
  }

  // Show theme wait screen
  function showThemeWaitScreen(data) {
    ui.showScreen('theme-wait-screen');
    ui.setText('current-round', data.currentRound || gameState.currentRound);
    ui.setText('theme-host-name', data.currentHost?.name || 'Host');
  }

  // Handle theme selected
  function handleThemeSelected(data) {
    gameState.selectedTheme = data.theme;
  }

  // Show answer screen
  function showAnswerScreen(data) {
    const currentPlayer = gameState.players.find(p => p.id === player?.id);
    if (currentPlayer?.isHost) {
      return;
    }

    submittedAnswer = null;
    submissionPosition = 0;
    ui.showScreen('answer-screen');
    ui.setText('theme-text', data.theme || gameState.selectedTheme);
    
    const answerInput = document.getElementById('answer-input');
    if (answerInput) {
      answerInput.value = '';
      answerInput.disabled = false;
      answerInput.classList.remove('has-content');
      // Auto-focus the input after a brief delay for screen transition
      setTimeout(() => answerInput.focus(), 300);
    }
    ui.setText('char-count', '0');
    ui.setButtonEnabled('answer-form', true);
    
    // Reset encouragement text
    const encouragementEl = document.getElementById('encouragement-text');
    if (encouragementEl) {
      encouragementEl.textContent = "Think creatively! Be specific and unique.";
    }
  }

  // Handle answer submit
  function handleAnswerSubmit(e) {
    e.preventDefault();
    
    const answerInput = document.getElementById('answer-input');
    const answer = answerInput.value.trim();

    if (!answer) {
      // Shake the input and show feedback
      answerInput.classList.add('input-shake');
      setTimeout(() => answerInput.classList.remove('input-shake'), 600);
      ui.vibrate(100);
      return;
    }

    // Show loading state on button
    const submitBtn = document.getElementById('submit-answer-btn');
    if (submitBtn) {
      submitBtn.classList.add('loading');
      submitBtn.textContent = 'Submitting...';
    }

    socket.emit('submit_answer', { answer });
    answerInput.disabled = true;
    ui.vibrate(50);
  }

  // Handle answer submitted confirmation
  function handleAnswerSubmitted(data) {
    submittedAnswer = data.answer;
    
    // Track submission position from progress data
    submissionPosition = data.position || (submissionPosition + 1);
    
    ui.showScreen('answer-submitted-screen');
    ui.setText('submitted-answer', `"${data.answer}"`);
    
    // Show random encouraging message
    const message = encouragingMessages[Math.floor(Math.random() * encouragingMessages.length)];
    ui.setText('submission-message', message);
    
    // Show submission position
    const positionEl = document.getElementById('submission-position');
    if (positionEl && submissionPosition > 0) {
      const suffix = getOrdinalSuffix(submissionPosition);
      positionEl.textContent = `You were ${submissionPosition}${suffix} to submit!`;
      positionEl.style.display = 'inline-block';
    }
    
    // Reset submit button
    const submitBtn = document.getElementById('submit-answer-btn');
    if (submitBtn) {
      submitBtn.classList.remove('loading');
      submitBtn.textContent = 'Submit Answer';
    }
    
    // Trigger confetti celebration
    triggerConfetti();
    ui.vibrate([50, 30, 50]);
  }
  
  // Get ordinal suffix (1st, 2nd, 3rd, etc)
  function getOrdinalSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  // Handle submission progress
  function handleSubmissionProgress(data) {
    ui.setText('submissions-count', data.submitted);
    ui.setText('submissions-total', data.total);
    
    // Track submission position for celebration message
    if (!submittedAnswer && submissionPosition === 0) {
      submissionPosition = data.submitted + 1;
    }
    
    const progressFill = document.getElementById('submission-progress');
    if (progressFill) {
      const percentage = (data.submitted / data.total) * 100;
      progressFill.style.width = `${percentage}%`;
    }
    
    if (isInHostMode) {
      ui.setText('host-answers-submitted', data.submitted);
      
      const statusList = document.getElementById('host-submission-status');
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
  }

  // Handle timer update
  function handleTimerUpdate(data) {
    const timerMap = {
      'themeSelection': 'theme-timer',
      'answering': 'answer-timer',
      'matching': 'matching-timer',
      'roundEnd': 'round-end-timer'
    };

    const timerId = timerMap[data.phase];
    if (timerId) {
      ui.updateTimer(timerId, data.remaining);
    }
    
    if (isInHostMode) {
      const hostTimerMap = {
        'themeSelection': 'host-theme-timer',
        'answering': 'host-answer-timer',
        'matching': 'host-matching-timer'
      };
      const hostTimerId = hostTimerMap[data.phase];
      if (hostTimerId) {
        ui.updateTimer(hostTimerId, data.remaining);
      }
    }
  }

  // Handle penalty applied
  function handlePenaltyApplied(data) {
    ui.showScreen('penalty-screen');
    ui.vibrate(200);
    
    setTimeout(() => {
      showMatchingWaitScreen({});
    }, 2000);
  }

  // Show matching wait screen
  function showMatchingWaitScreen(data) {
    ui.showScreen('matching-wait-screen');
    
    const host = gameState.players.find(p => p.isHost);
    ui.setText('matching-host-name', host?.name || 'Host');
    
    if (submittedAnswer) {
      ui.setText('your-answer-reminder', `"${submittedAnswer}"`);
    } else {
      ui.setText('your-answer-reminder', '"[No Answer]"');
    }
  }

  // Show reveal screen
  function showRevealScreen() {
    ui.showScreen('reveal-screen');
  }

  // Handle reveal result
  function handleRevealResult(data) {
    ui.showScreen('reveal-screen');
    
    ui.setText('reveal-answer-text', `"${data.answer}"`);
    ui.setText('reveal-guessed', data.guessedPlayer.name);
    ui.setText('reveal-actual', data.actualPlayer.name);
    ui.setText('reveal-progress', `${data.index + 1}/${data.total}`);
    
    const resultIcon = document.getElementById('reveal-result-icon');
    if (resultIcon) {
      resultIcon.classList.remove('correct', 'wrong');
      resultIcon.classList.add(data.isCorrect ? 'correct' : 'wrong');
    }
    
    if (data.actualPlayer.id === player?.id) {
      ui.vibrate(100);
    }
  }

  // Handle round end
  function handleRoundEnd(data) {
    if (isInHostMode && data.hostScore) {
      ui.showScreen('host-results-screen');
      ui.setText('host-round-score', data.hostScore.score);
      ui.setText('host-next-host', data.nextHost.name);
      
      if (data.hostScore.isPerfect) {
        ui.toggleElement('perfect-bonus', true);
      } else {
        ui.toggleElement('perfect-bonus', false);
      }
      
      // Reset host mode state
      isInHostMode = false;
      resetMatchingState();
      
      setTimeout(() => {
        showRoundEndScreen(data);
      }, 3000);
      return;
    }
    
    isInHostMode = false;
    showRoundEndScreen(data);
  }
  
  // Show round end screen
  function showRoundEndScreen(data) {
    ui.showScreen('round-end-screen');
    
    ui.setText('round-number', data.currentRound);
    ui.setText('next-host', data.nextHost.name);
    
    // Use enhanced scoreboard with previous scores for comparison
    ui.updateScoreboard('scoreboard-list', data.scoreboard, {
      currentPlayerId: player?.id,
      previousScores: previousScoreboard,
      currentRound: data.currentRound,
      totalRounds: gameState?.totalRounds
    });
    
    // Store current scoreboard for next round comparison
    previousScoreboard = JSON.parse(JSON.stringify(data.scoreboard));
    
    const playerRank = data.scoreboard.findIndex(p => p.id === player?.id) + 1;
    const playerScore = data.scoreboard.find(p => p.id === player?.id)?.score || 0;
    
    ui.setText('your-rank', `#${playerRank}`);
    ui.setText('your-score', playerScore);

    if (data.nextHost.id === player?.id) {
      setTimeout(() => {
        ui.showScreen('host-turn-screen');
      }, 3000);
    }
  }

  // ============ HOST MODE FUNCTIONS - SIMPLE TAP MATCHING ============
  
  // Reset matching state
  function resetMatchingState() {
    selectedAnswer = null;
    matches = {};
    colorIndex = 0;
    answersData = [];
    playersData = [];
  }
  
  // Switch to host mode
  function switchToHostMode() {
    isInHostMode = true;
    showHostThemeSelectScreen({});
    socket.emit('request_themes');
  }
  
  // Show host theme selection screen
  function showHostThemeSelectScreen(data) {
    ui.showScreen('host-theme-select-screen');
    ui.toggleElement('themes-loading', true);
    ui.toggleElement('themes-container', false);
  }
  
  // Handle themes generated
  function handleThemesGenerated(data) {
    if (!isInHostMode) return;
    
    ui.toggleElement('themes-loading', false);
    
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
  
  // Select theme (host)
  function selectTheme(theme, cardElement) {
    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('selected'));
    cardElement.classList.add('selected');
    ui.vibrate();
    socket.emit('host_select_theme', { theme });
  }
  
  // Show host waiting for answers screen
  function showHostWaitingAnswersScreen(data) {
    ui.showScreen('host-waiting-answers-screen');
    ui.setText('host-selected-theme-text', data.theme || gameState.selectedTheme);
    
    const nonHostPlayers = gameState.players.filter(p => !p.isHost);
    ui.setText('host-answers-total', nonHostPlayers.length);
    ui.setText('host-answers-submitted', '0');

    const statusList = document.getElementById('host-submission-status');
    if (statusList) {
      statusList.innerHTML = nonHostPlayers.map(p => `
        <li>
          <span>${ui.escapeHtml(p.name)}</span>
          <span class="status-icon pending">⏳</span>
        </li>
      `).join('');
    }
  }
  
  // Handle matching phase start (host)
  function handleMatchingStart(data) {
    if (!isInHostMode) return;
    showHostMatchingScreen(data);
  }
  
  // Show host matching screen - simple tap system
  function showHostMatchingScreen(data) {
    ui.showScreen('host-matching-screen');
    
    // Reset state
    selectedAnswer = null;
    matches = {};
    colorIndex = 0;
    answersData = data.answers || [];
    playersData = data.players || [];
    
    // Update progress
    ui.setText('matches-total', playersData.length);
    ui.setText('matches-count', '0');

    // Build answers list
    const answersList = document.getElementById('answers-list');
    if (answersList) {
      answersList.innerHTML = answersData.map((a, index) => 
        `<div class="item answer" data-id="${index}">"${ui.escapeHtml(a.answer)}"</div>`
      ).join('');

      // Add tap listeners
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

      // Add tap listeners
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
  
  // Submit matches
  function submitMatches() {
    const matchesArray = Object.entries(matches).map(([answerIndex, playerId]) => ({
      answerIndex: parseInt(answerIndex),
      playerId
    }));

    console.log('[Host] Submitting matches:', matchesArray);
    socket.emit('host_submit_matches', { matches: matchesArray });
    ui.vibrate(100);
  }
  
  // ============ END HOST MODE FUNCTIONS ============

  // Handle sudden death start
  function handleSuddenDeathStart(data) {
    ui.showScreen('sudden-death-screen');
    
    const tiedPlayerNames = data.tiedPlayers.map(p => p.name).join(' vs ');
    ui.setText('sudden-death-players', tiedPlayerNames);
    ui.setText('sudden-death-message', data.message);
    
    // Check if we're one of the tied players
    const iAmTied = data.tiedPlayers.some(p => p.id === player?.id);
    
    if (iAmTied) {
      ui.setText('sudden-death-status', "You're in SUDDEN DEATH! Time to prove yourself!");
      ui.vibrate([200, 100, 200, 100, 200]);
    } else {
      ui.setText('sudden-death-status', "You're spectating - watch the tied players battle it out!");
    }
    
    console.log('Sudden death started:', data);
  }

  // Handle game over
  function handleGameOver(data) {
    ui.showScreen('game-over-screen');
    
    ui.setText('winner-name', data.winner.name);
    ui.setText('winner-score', data.winner.score);
    
    // Use enhanced scoreboard
    ui.updateScoreboard('final-scoreboard', data.scoreboard, {
      currentPlayerId: player?.id,
      previousScores: previousScoreboard
    });
    
    const playerRank = data.scoreboard.findIndex(p => p.id === player?.id) + 1;
    ui.setText('your-final-rank', `#${playerRank}`);
    
    if (data.winner.id === player?.id) {
      ui.vibrate([100, 50, 100, 50, 200]);
      triggerConfetti();
    }
  }

  // Handle game reset
  function handleGameReset(data) {
    gameState = { players: data.players, phase: 'lobby' };
    submittedAnswer = null;
    isInHostMode = false;
    previousScoreboard = null;
    submissionPosition = 0;
    resetMatchingState();
    ui.showScreen('lobby-screen');
    updateLobbyDisplay();
  }

  // Handle error
  function handleError(data) {
    console.error('Error:', data.message);
  }

  // Update display for current phase
  function updateDisplayForCurrentPhase() {
    if (!gameState) {
      ui.showScreen('join-screen');
      return;
    }

    const currentPlayer = gameState.players.find(p => p.id === player?.id);
    const isHost = currentPlayer?.isHost;
    
    if (isHost && gameState.phase !== 'lobby') {
      isInHostMode = true;
      
      switch (gameState.phase) {
        case 'theme_select':
          showHostThemeSelectScreen({});
          if (gameState.themes && gameState.themes.length > 0) {
            handleThemesGenerated({ themes: gameState.themes });
          } else {
            socket.emit('request_themes');
          }
          return;
        case 'answering':
          showHostWaitingAnswersScreen({ theme: gameState.selectedTheme });
          return;
        case 'matching':
          ui.showScreen('host-matching-screen');
          return;
        case 'reveal':
          showRevealScreen();
          return;
        case 'round_end':
          ui.showScreen('round-end-screen');
          return;
        case 'game_over':
          ui.showScreen('game-over-screen');
          return;
      }
    }
    
    isInHostMode = false;

    switch (gameState.phase) {
      case 'lobby':
        ui.showScreen('lobby-screen');
        updateLobbyDisplay();
        break;
      case 'theme_select':
        showThemeWaitScreen({ currentRound: gameState.currentRound });
        break;
      case 'answering':
        const playerHasSubmitted = gameState.players.find(p => p.id === player?.id)?.hasSubmitted;
        if (submittedAnswer || playerHasSubmitted) {
          ui.showScreen('answer-submitted-screen');
          ui.setText('submitted-answer', submittedAnswer ? `"${submittedAnswer}"` : '"[Answer Submitted]"');
        } else {
          showAnswerScreen({ theme: gameState.selectedTheme });
        }
        break;
      case 'matching':
        showMatchingWaitScreen({});
        break;
      case 'reveal':
        showRevealScreen();
        break;
      case 'round_end':
        ui.showScreen('round-end-screen');
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
