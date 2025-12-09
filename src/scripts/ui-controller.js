/**
 * UI Controller - Shared utilities for DOM manipulation
 */
class UIController {
  constructor() {
    this.activeScreen = null;
    this.timerInterval = null;
  }

  /**
   * Show a specific screen/phase and hide others
   */
  showScreen(screenId) {
    // Get all screens
    const screens = document.querySelectorAll('.game-phase, .phone-screen');
    
    screens.forEach(screen => {
      if (screen.id === screenId) {
        screen.classList.remove('hidden');
        screen.classList.add('active');
        this.activeScreen = screen;
      } else {
        screen.classList.remove('active');
        screen.classList.add('hidden');
      }
    });
  }

  /**
   * Update element text content
   */
  setText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = text;
    }
  }

  /**
   * Update element HTML content
   */
  setHtml(elementId, html) {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = html;
    }
  }

  /**
   * Show/hide element
   */
  toggleElement(elementId, show) {
    const element = document.getElementById(elementId);
    if (element) {
      if (show) {
        element.classList.remove('hidden');
      } else {
        element.classList.add('hidden');
      }
    }
  }

  /**
   * Add class to element
   */
  addClass(elementId, className) {
    const element = document.getElementById(elementId);
    if (element) {
      element.classList.add(className);
    }
  }

  /**
   * Remove class from element
   */
  removeClass(elementId, className) {
    const element = document.getElementById(elementId);
    if (element) {
      element.classList.remove(className);
    }
  }

  /**
   * Create player list item
   */
  createPlayerItem(player) {
    const li = document.createElement('li');
    li.className = 'player-item';
    li.dataset.playerId = player.id;
    
    let html = `<span class="player-name">${this.escapeHtml(player.name)}</span>`;
    if (player.isHost) {
      html += `<span class="host-badge">HOST</span>`;
    }
    
    li.innerHTML = html;
    return li;
  }

  /**
   * Update player list
   */
  updatePlayerList(elementId, players) {
    const list = document.getElementById(elementId);
    if (!list) return;
    
    list.innerHTML = '';
    
    if (players.length === 0) {
      list.innerHTML = `
        <div class="waiting-message">
          <div class="steam-animation"></div>
          <p>Waiting for players to join...</p>
        </div>
      `;
      return;
    }
    
    players.forEach(player => {
      list.appendChild(this.createPlayerItem(player));
    });
  }

  /**
   * Create scoreboard with enhanced UI
   * @param {string} elementId - The scoreboard list element ID
   * @param {Array} scores - Current scoreboard array
   * @param {Object} options - Additional options
   * @param {string} options.currentPlayerId - Highlight current player
   * @param {Array} options.previousScores - Previous round's scoreboard for comparison
   * @param {number} options.currentRound - Current round number
   * @param {number} options.totalRounds - Total rounds in game
   */
  updateScoreboard(elementId, scores, options = {}) {
    const list = document.getElementById(elementId);
    if (!list) return;
    
    const { currentPlayerId, previousScores, currentRound, totalRounds } = options;
    
    list.innerHTML = '';
    
    // Create a map of previous positions for rank change calculation
    const prevPositionMap = new Map();
    const prevScoreMap = new Map();
    if (previousScores && previousScores.length > 0) {
      previousScores.forEach((player, index) => {
        prevPositionMap.set(player.id, index);
        prevScoreMap.set(player.id, player.score);
      });
    }
    
    // Medal icons for top 3
    const medalIcons = ['🥇', '🥈', '🥉'];
    
    // Total items for reverse stagger animation (bottom to top reveal)
    const totalItems = scores.length;
    
    scores.forEach((player, index) => {
      const li = document.createElement('li');
      li.className = 'score-item';
      
      // Position-based styling
      if (index === 0) {
        li.classList.add('first-place');
      } else if (index === 1) {
        li.classList.add('second-place');
      } else if (index === 2) {
        li.classList.add('third-place');
      }
      
      if (player.id === currentPlayerId) {
        li.classList.add('you');
      }
      
      // Calculate rank change
      let rankChangeHtml = '';
      let movedUp = false;
      if (prevPositionMap.has(player.id)) {
        const prevPosition = prevPositionMap.get(player.id);
        const positionChange = prevPosition - index; // Positive = moved up
        
        if (positionChange > 0) {
          rankChangeHtml = `<span class="rank-change up">▲${positionChange}</span>`;
          movedUp = true;
        } else if (positionChange < 0) {
          rankChangeHtml = `<span class="rank-change down">▼${Math.abs(positionChange)}</span>`;
        } else {
          rankChangeHtml = `<span class="rank-change same">—</span>`;
        }
      }
      
      // Calculate score delta
      let scoreDeltaHtml = '';
      if (prevScoreMap.has(player.id)) {
        const prevScore = prevScoreMap.get(player.id);
        const scoreDelta = player.score - prevScore;
        if (scoreDelta > 0) {
          scoreDeltaHtml = `<span class="score-delta">+${scoreDelta}</span>`;
        }
      }
      
      // Add moved-up class for pulse animation
      if (movedUp) {
        li.classList.add('moved-up');
      }
      
      // Apply staggered animation delay (reverse order: bottom reveals first)
      const reverseIndex = totalItems - 1 - index;
      const baseDelay = 0.15; // seconds between each item
      const animationDelay = reverseIndex * baseDelay;
      li.style.animationDelay = `${animationDelay}s`;
      
      // Medal icon or rank number
      const medalIcon = index < 3 ? `<span class="medal-icon">${medalIcons[index]}</span>` : '';
      const rankDisplay = index < 3 ? medalIcon : `${index + 1}`;
      
      li.innerHTML = `
        <span class="rank">${rankDisplay}</span>
        <span class="name">${this.escapeHtml(player.name)}${rankChangeHtml}</span>
        <span class="score-section">
          ${scoreDeltaHtml}
          <span class="score">${player.score}</span>
        </span>
      `;
      
      list.appendChild(li);
    });
  }

  /**
   * Update timer display
   */
  updateTimer(elementId, seconds, totalSeconds = null) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.textContent = seconds;
    
    // Add warning/danger classes
    element.classList.remove('warning', 'danger');
    if (seconds <= 5) {
      element.classList.add('danger');
    } else if (seconds <= 15) {
      element.classList.add('warning');
    }
    
    // Update timer fill if present
    if (totalSeconds) {
      const fillId = elementId.replace('-timer', '-timer-fill');
      const fill = document.getElementById(fillId);
      if (fill) {
        const percentage = (seconds / totalSeconds) * 100;
        fill.style.width = `${percentage}%`;
      }
    }
  }

  /**
   * Create submission indicators
   */
  updateSubmissionIndicators(elementId, submitted, total) {
    const container = document.getElementById(elementId);
    if (!container) return;
    
    container.innerHTML = '';
    
    for (let i = 0; i < total; i++) {
      const indicator = document.createElement('div');
      indicator.className = 'submission-indicator';
      if (i < submitted) {
        indicator.classList.add('submitted');
        indicator.textContent = '✓';
      }
      container.appendChild(indicator);
    }
  }

  /**
   * Show error message
   */
  showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = message;
      element.classList.remove('hidden');
      
      // Add shake animation
      element.classList.add('error-shake');
      setTimeout(() => {
        element.classList.remove('error-shake');
      }, 500);
    }
  }

  /**
   * Hide error message
   */
  hideError(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.classList.add('hidden');
    }
  }

  /**
   * Show success flash
   */
  showSuccess(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.classList.add('flash-success');
      setTimeout(() => {
        element.classList.remove('flash-success');
      }, 500);
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Enable/disable button
   */
  setButtonEnabled(elementId, enabled) {
    const button = document.getElementById(elementId);
    if (button) {
      button.disabled = !enabled;
    }
  }

  /**
   * Store data in localStorage
   */
  store(key, value) {
    try {
      localStorage.setItem(`kyc_${key}`, JSON.stringify(value));
    } catch (e) {
      console.error('Failed to store data:', e);
    }
  }

  /**
   * Retrieve data from localStorage
   */
  retrieve(key) {
    try {
      const value = localStorage.getItem(`kyc_${key}`);
      return value ? JSON.parse(value) : null;
    } catch (e) {
      console.error('Failed to retrieve data:', e);
      return null;
    }
  }

  /**
   * Clear stored data
   */
  clearStore(key) {
    try {
      localStorage.removeItem(`kyc_${key}`);
    } catch (e) {
      console.error('Failed to clear data:', e);
    }
  }

  /**
   * Vibrate device (mobile)
   */
  vibrate(duration = 50) {
    if ('vibrate' in navigator) {
      navigator.vibrate(duration);
    }
  }

  /**
   * Play sound (if available)
   */
  playSound(soundName) {
    // Placeholder for sound implementation
    // Could be extended to play actual sounds
    console.log('Sound:', soundName);
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.UIController = UIController;
}
