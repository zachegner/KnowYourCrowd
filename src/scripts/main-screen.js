/**
 * Main Screen Script - TV/Display view for Know Your Crowd
 */
(function() {
  const ui = new UIController();
  let socket;
  let gameState = null;
  let serverInfo = null;
  let timerIntervals = {};
  let previousScoreboard = null; // Track previous round's scoreboard for comparison

  // Initialize
  function init() {
    // Check if running in Electron
    if (window.electronAPI) {
      initElectron();
    } else {
      // Running in browser (accessed via /display)
      initBrowser();
    }
    
    setupEventListeners();
  }

  // Initialize for Electron
  async function initElectron() {
    // Listen for future server-info updates
    window.electronAPI.onServerInfo((info) => {
      serverInfo = info;
      connectSocket(info);
      updateConnectionInfo(info);
    });

    window.electronAPI.onShowApiSetup(() => {
      showApiSetupModal();
    });

    // Also proactively request server info in case the event already fired
    try {
      const info = await window.electronAPI.getServerInfo();
      if (info && !serverInfo) {
        serverInfo = info;
        connectSocket(info);
        // Fetch QR code from server
        fetch(`http://localhost:${info.port}/qr`)
          .then(res => res.json())
          .then(data => updateConnectionInfo(data))
          .catch(err => console.error('Failed to get QR:', err));
      }
    } catch (err) {
      console.error('Failed to get server info:', err);
    }
  }

  // Initialize for browser
  function initBrowser() {
    // Connect to current host
    const host = window.location.origin;
    connectSocket({ url: host });
    
    // Fetch connection info
    fetch('/qr')
      .then(res => res.json())
      .then(data => {
        updateConnectionInfo(data);
      })
      .catch(err => console.error('Failed to get QR:', err));
  }

  // Connect to Socket.io
  function connectSocket(info) {
    const url = info.url || window.location.origin;
    socket = io(url);

    socket.on('connect', () => {
      console.log('Connected to server');
      socket.emit('join_as_display');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    // Game state updates
    socket.on('game_state', handleGameState);
    socket.on('player_joined', handlePlayerJoined);
    socket.on('player_disconnected', handlePlayerDisconnected);
    socket.on('game_started', handleGameStarted);
    socket.on('phase_changed', handlePhaseChanged);
    socket.on('themes_generated', handleThemesGenerated);
    socket.on('theme_selected', handleThemeSelected);
    socket.on('submission_progress', handleSubmissionProgress);
    socket.on('timer_update', handleTimerUpdate);
    socket.on('matching_phase_start', handleMatchingStart);
    socket.on('matches_submitted', handleMatchesSummary);
    socket.on('reveal_result', handleRevealResult);
    socket.on('round_end', handleRoundEnd);
    socket.on('sudden_death_start', handleSuddenDeathStart);
    socket.on('game_over', handleGameOver);
    socket.on('game_reset', handleGameReset);
  }

  // Update connection info display
  function updateConnectionInfo(info) {
    if (info.qr) {
      const qrImg = document.getElementById('qr-code');
      if (qrImg) {
        qrImg.src = info.qr;
        qrImg.style.display = 'block';
        document.querySelector('.qr-loading')?.classList.add('hidden');
      }
    }

    if (info.roomCode) {
      ui.setText('room-code', info.roomCode);
    }

    if (info.url) {
      ui.setText('server-url', info.url);
    }
  }

  // Setup event listeners
  function setupEventListeners() {
    // Start game button
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
      startBtn.addEventListener('click', handleStartGame);
    }

    // Fullscreen button
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', toggleFullscreen);
    }

    // Settings button
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', showSettingsModal);
    }

    // Settings modal buttons
    const saveSettingsBtn = document.getElementById('save-settings');
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', saveSettings);
    }

    const closeSettingsBtn = document.getElementById('close-settings');
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', hideSettingsModal);
    }

    // API setup modal
    const saveApiKeyBtn = document.getElementById('save-api-key');
    if (saveApiKeyBtn) {
      saveApiKeyBtn.addEventListener('click', saveApiKey);
    }

    const skipApiSetupBtn = document.getElementById('skip-api-setup');
    if (skipApiSetupBtn) {
      skipApiSetupBtn.addEventListener('click', hideApiSetupModal);
    }

    // Load settings on startup
    loadSettings();
  }

  // Toggle fullscreen
  function toggleFullscreen() {
    if (window.electronAPI) {
      window.electronAPI.toggleFullscreen();
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  // API Setup Modal
  function showApiSetupModal() {
    ui.toggleElement('api-setup-modal', true);
  }

  function hideApiSetupModal() {
    ui.toggleElement('api-setup-modal', false);
  }

  async function saveApiKey() {
    const input = document.getElementById('api-key-input');
    const apiKey = input.value.trim();

    if (!apiKey) {
      alert('Please enter an API key');
      return;
    }

    if (window.electronAPI) {
      const result = await window.electronAPI.saveApiKey(apiKey);
      if (result.success) {
        hideApiSetupModal();
      } else {
        alert('Failed to save API key: ' + result.error);
      }
    } else {
      hideApiSetupModal();
    }
  }

  // Settings Modal Functions
  function showSettingsModal() {
    ui.toggleElement('settings-modal', true);
  }

  function hideSettingsModal() {
    ui.toggleElement('settings-modal', false);
  }

  function loadSettings() {
    // Load from localStorage or use defaults
    const settings = JSON.parse(localStorage.getItem('kycSettings') || '{}');
    
    const themeTimer = document.getElementById('theme-timer-setting');
    const answerTimer = document.getElementById('answer-timer-setting');
    const matchingTimer = document.getElementById('matching-timer-setting');
    const roundsPerPlayer = document.getElementById('rounds-per-player');
    const settingsApiKey = document.getElementById('settings-api-key');

    if (themeTimer) themeTimer.value = settings.themeTimer || '15';
    if (answerTimer) answerTimer.value = settings.answerTimer || '60';
    if (matchingTimer) matchingTimer.value = settings.matchingTimer || '90';
    if (roundsPerPlayer) roundsPerPlayer.value = settings.roundsPerPlayer || '1';
    
    // Load API key if in Electron
    if (window.electronAPI && settingsApiKey) {
      window.electronAPI.getApiKey?.().then(key => {
        if (key) settingsApiKey.value = key;
      });
    }
  }

  async function saveSettings() {
    const themeTimer = document.getElementById('theme-timer-setting')?.value;
    const answerTimer = document.getElementById('answer-timer-setting')?.value;
    const matchingTimer = document.getElementById('matching-timer-setting')?.value;
    const roundsPerPlayer = document.getElementById('rounds-per-player')?.value;
    const settingsApiKey = document.getElementById('settings-api-key')?.value?.trim();

    // Save to localStorage
    const settings = {
      themeTimer: themeTimer || '15',
      answerTimer: answerTimer || '60',
      matchingTimer: matchingTimer || '90',
      roundsPerPlayer: roundsPerPlayer || '1'
    };
    localStorage.setItem('kycSettings', JSON.stringify(settings));

    // Save API key if provided (in Electron)
    if (settingsApiKey && window.electronAPI) {
      const result = await window.electronAPI.saveApiKey(settingsApiKey);
      if (!result.success) {
        alert('Failed to save API key: ' + result.error);
        return;
      }
    }

    // Notify server of settings change if connected
    if (socket && socket.connected) {
      socket.emit('update_settings', settings);
    }

    hideSettingsModal();
  }

  // Game state handler
  function handleGameState(state) {
    gameState = state;
    updateDisplay();
  }

  // Handle start game from main display
  function handleStartGame() {
    if (socket && socket.connected) {
      socket.emit('display_start_game');
    }
  }

  // Player joined handler
  function handlePlayerJoined(data) {
    if (!gameState) gameState = { players: [], phase: 'lobby' };
    gameState.players = data.players;
    
    ui.updatePlayerList('player-list', data.players);
    ui.setText('player-count', data.players.length);
    
    // Update start button and notice
    const startBtn = document.getElementById('start-game-btn');
    if (data.canStart) {
      ui.setText('min-notice', 'Ready to start!');
      if (startBtn) startBtn.disabled = false;
    } else {
      ui.setText('min-notice', `Need at least 3 players to start`);
      if (startBtn) startBtn.disabled = true;
    }
  }

  // Player disconnected handler
  function handlePlayerDisconnected(data) {
    if (gameState) {
      gameState.players = gameState.players.filter(p => p.id !== data.playerId);
      ui.updatePlayerList('player-list', gameState.players);
      ui.setText('player-count', gameState.players.length);
    }
  }

  // Game started handler
  function handleGameStarted(data) {
    gameState.totalRounds = data.totalRounds;
    gameState.currentRound = data.currentRound;
    ui.setText('round-indicator', `ROUND ${data.currentRound}/${data.totalRounds}`);
  }

  // Phase changed handler
  function handlePhaseChanged(data) {
    gameState.phase = data.phase;
    
    switch (data.phase) {
      case 'theme_select':
        showThemeSelectPhase(data);
        break;
      case 'answering':
        showAnsweringPhase(data);
        break;
      case 'matching':
        showMatchingPhase(data);
        break;
      case 'reveal':
        showRevealPhase(data);
        break;
    }
  }

  // Show theme selection phase
  function showThemeSelectPhase(data) {
    ui.showScreen('theme-select-phase');
    ui.setText('theme-host-name', data.currentHost.name);
    ui.setText('round-indicator', `ROUND ${data.currentRound}/${data.totalRounds}`);
  }

  // Themes generated handler
  function handleThemesGenerated(data) {
    // Display uses this info but the actual selection is on host phone
  }

  // Theme selected handler
  function handleThemeSelected(data) {
    gameState.selectedTheme = data.theme;
  }

  // Show answering phase
  function showAnsweringPhase(data) {
    ui.showScreen('answering-phase');
    ui.setText('current-theme', data.theme);
    
    const nonHostCount = gameState.players.filter(p => !p.isHost).length;
    ui.setText('total-to-submit', nonHostCount);
    ui.setText('submitted-count', '0');
    ui.updateSubmissionIndicators('submission-indicators', 0, nonHostCount);
  }

  // Submission progress handler
  function handleSubmissionProgress(data) {
    ui.setText('submitted-count', data.submitted);
    ui.updateSubmissionIndicators('submission-indicators', data.submitted, data.total);
  }

  // Timer update handler
  function handleTimerUpdate(data) {
    const timerMap = {
      'themeSelection': 'theme-timer',
      'answering': 'answer-timer',
      'matching': 'matching-timer',
      'roundEnd': 'round-end-timer'
    };

    const timerId = timerMap[data.phase];
    if (timerId) {
      ui.updateTimer(timerId, data.remaining, data.totalSeconds || null);
    }
  }

  // Matching phase start handler
  function handleMatchingStart(data) {
    showMatchingPhase(data);
  }

  // Show matching phase
  function showMatchingPhase(data) {
    ui.showScreen('matching-phase');
    
    const host = gameState.players.find(p => p.isHost);
    ui.setText('matching-host-name', host ? host.name : 'Host');

    // Display answers
    const answersList = document.getElementById('answers-list');
    if (answersList && data.answers) {
      answersList.innerHTML = data.answers.map(a => 
        `<div class="answer-item">"${ui.escapeHtml(a.answer)}"</div>`
      ).join('');
    }

    // Display players
    const playersList = document.getElementById('matching-players-list');
    if (playersList && data.players) {
      playersList.innerHTML = data.players.map(p => 
        `<div class="player-name-item">${ui.escapeHtml(p.name)}</div>`
      ).join('');
    }
  }

  // Matches summary colors (same as tap matching)
  const matchColors = [
    '#ff9f9f', '#ffd29f', '#ffff9f',
    '#b4ff9f', '#9ffff5', '#9fc9ff',
    '#c79fff', '#ff9fc7', '#d4a5ff', '#ffa5d4'
  ];

  // Handle matches summary (shown after host submits, before reveal)
  function handleMatchesSummary(data) {
    ui.showScreen('matches-summary-phase');
    ui.setText('summary-host-name', data.host.name);
    
    const summaryList = document.getElementById('matches-summary-list');
    if (summaryList) {
      summaryList.innerHTML = data.matches.map((m, i) => `
        <div class="match-summary-item" style="background: ${matchColors[i % matchColors.length]}; animation-delay: ${i * 0.1}s">
          <span class="match-answer">"${ui.escapeHtml(m.answer)}"</span>
          <span class="match-arrow">→</span>
          <span class="match-player">${ui.escapeHtml(m.guessedPlayer.name)}</span>
        </div>
      `).join('');
    }
  }

  // Reveal result handler
  function handleRevealResult(data) {
    ui.showScreen('reveal-phase');
    
    // Show host name in title
    const host = gameState.players.find(p => p.isHost);
    ui.setText('reveal-host-name', host ? host.name : 'Host');
    
    ui.setText('reveal-answer-text', `"${data.answer}"`);
    ui.setText('reveal-guessed', data.guessedPlayer.name);
    ui.setText('reveal-actual', data.actualPlayer.name);
    ui.setText('reveal-progress-text', `${data.index + 1} of ${data.total}`);

    // Show result indicator
    const resultEl = document.getElementById('reveal-result');
    if (resultEl) {
      resultEl.classList.remove('hidden', 'correct', 'wrong');
      resultEl.classList.add(data.isCorrect ? 'correct' : 'wrong');
      resultEl.querySelector('.result-icon').textContent = data.isCorrect ? '✓' : '✗';
    }
  }

  // Round end handler
  function handleRoundEnd(data) {
    ui.showScreen('round-end-phase');
    
    ui.setText('round-end-number', data.currentRound);
    ui.setText('round-host-name', data.currentHost.name);
    ui.setText('correct-matches', data.hostScore.correctMatches);
    ui.setText('total-matches', data.hostScore.totalMatches);
    ui.setText('host-round-score', `+${data.hostScore.score}`);
    ui.setText('next-host-name', data.nextHost.name);

    // Show perfect bonus if applicable
    if (data.hostScore.isPerfect) {
      ui.toggleElement('perfect-bonus', true);
    } else {
      ui.toggleElement('perfect-bonus', false);
    }

    // Update round context in scoreboard header
    ui.setText('scoreboard-round-info', `Round ${data.currentRound} of ${gameState.totalRounds}`);

    // Update scoreboard with enhanced options
    ui.updateScoreboard('scoreboard-list', data.scoreboard, {
      previousScores: previousScoreboard,
      currentRound: data.currentRound,
      totalRounds: gameState.totalRounds
    });

    // Store current scoreboard for next round comparison
    previousScoreboard = JSON.parse(JSON.stringify(data.scoreboard));
  }

  // Sudden death start handler
  function handleSuddenDeathStart(data) {
    ui.showScreen('sudden-death-phase');
    
    // Show announcement
    ui.setText('sudden-death-title', '⚡ SUDDEN DEATH! ⚡');
    ui.setText('sudden-death-message', data.message);
    
    // Show tied players
    const tiedPlayersList = data.tiedPlayers.map(p => p.name).join(' vs ');
    ui.setText('sudden-death-players', tiedPlayersList);
    
    console.log('Sudden death started:', data);
  }

  // Game over handler
  function handleGameOver(data) {
    ui.showScreen('game-over-phase');
    
    ui.setText('winner-name', data.winner.name);
    ui.setText('winner-score', `Score: ${data.winner.score}`);
    
    // Show sudden death indicator if applicable
    if (data.wasSuddenDeath) {
      const winnerEl = document.getElementById('winner-name');
      if (winnerEl) {
        winnerEl.innerHTML = `${data.winner.name} <span class="sudden-death-badge">⚡ SUDDEN DEATH WINNER!</span>`;
      }
    }
    
    // Update final scoreboard with enhanced options (no previous scores for final)
    ui.updateScoreboard('final-scoreboard', data.scoreboard, {
      previousScores: previousScoreboard,
      currentRound: gameState.totalRounds,
      totalRounds: gameState.totalRounds
    });
  }

  // Game reset handler
  function handleGameReset(data) {
    gameState = {
      players: data.players,
      phase: 'lobby',
      currentRound: 0,
      totalRounds: 0
    };
    
    // Clear previous scoreboard for new game
    previousScoreboard = null;
    
    ui.showScreen('lobby-phase');
    ui.updatePlayerList('player-list', data.players);
    ui.setText('player-count', data.players.length);
    ui.setText('round-indicator', 'LOBBY');
    
    // Re-enable start button
    const startBtn = document.getElementById('start-game-btn');
    const canStart = data.players.length >= 3;
    if (startBtn) startBtn.disabled = !canStart;
    ui.setText('min-notice', canStart ? 'Ready to start!' : 'Need at least 3 players to start');
  }

  // Update display based on game state
  function updateDisplay() {
    if (!gameState) return;

    // Update player list
    ui.updatePlayerList('player-list', gameState.players);
    ui.setText('player-count', gameState.players.length);

    // Update start button state in lobby
    if (gameState.phase === 'lobby') {
      const startBtn = document.getElementById('start-game-btn');
      const canStart = gameState.players.length >= 3;
      if (startBtn) startBtn.disabled = !canStart;
      ui.setText('min-notice', canStart ? 'Ready to start!' : 'Need at least 3 players to start');
    }

    // Show appropriate phase
    switch (gameState.phase) {
      case 'lobby':
        ui.showScreen('lobby-phase');
        break;
      case 'theme_select':
        ui.showScreen('theme-select-phase');
        break;
      case 'answering':
        ui.showScreen('answering-phase');
        break;
      case 'matching':
        ui.showScreen('matching-phase');
        break;
      case 'reveal':
        ui.showScreen('reveal-phase');
        break;
      case 'round_end':
        ui.showScreen('round-end-phase');
        break;
      case 'sudden_death':
        ui.showScreen('sudden-death-phase');
        break;
      case 'game_over':
        ui.showScreen('game-over-phase');
        break;
    }

    // Update round indicator
    if (gameState.currentRound > 0) {
      ui.setText('round-indicator', `ROUND ${gameState.currentRound}/${gameState.totalRounds}`);
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
