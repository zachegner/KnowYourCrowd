/**
 * ScoreCalculator - Handles all scoring logic for the game
 */
class ScoreCalculator {
  constructor(config) {
    this.config = config;
  }

  /**
   * Calculate results for a round
   * @param {Array} matches - Host's guesses [{playerId, answerIndex}]
   * @param {Array} shuffledAnswers - The shuffled answers array shown to host [{index, answer, playerId}]
   * @param {Array} players - All players
   * @returns {Array} Results for each match
   */
  calculateRoundResults(matches, shuffledAnswers, players) {
    const results = [];
    
    // The answers array is already the shuffled version that was shown to the host
    // Each item has: { index, answer, playerId }
    // The host's matches use answerIndex which corresponds to the shuffled array position
    
    matches.forEach(match => {
      const guessedPlayer = players.find(p => p.id === match.playerId);
      const actualAnswer = shuffledAnswers[match.answerIndex];
      
      if (actualAnswer && guessedPlayer) {
        const actualPlayer = players.find(p => p.id === actualAnswer.playerId);
        
        results.push({
          guessedPlayerId: match.playerId,
          guessedPlayer: guessedPlayer ? { id: guessedPlayer.id, name: guessedPlayer.name } : null,
          actualPlayerId: actualAnswer.playerId,
          actualPlayer: actualPlayer ? { id: actualPlayer.id, name: actualPlayer.name } : null,
          answer: actualAnswer.answer,
          isCorrect: match.playerId === actualAnswer.playerId
        });
      }
    });
    
    return results;
  }

  /**
   * Calculate host's score for the round
   * @param {Array} results - Round results
   * @param {number} perfectBonus - Bonus for perfect round
   * @returns {Object} {score, correctMatches, isPerfect}
   */
  calculateHostScore(results, perfectBonus = 3) {
    const correctMatches = results.filter(r => r.isCorrect).length;
    const totalMatches = results.length;
    const isPerfect = correctMatches === totalMatches && totalMatches > 0;
    
    let score = correctMatches;
    if (isPerfect) {
      score += perfectBonus;
    }
    
    return {
      score,
      correctMatches,
      totalMatches,
      isPerfect
    };
  }

  /**
   * Calculate score breakdown for display
   * @param {Array} players - All players with scores
   * @returns {Array} Sorted scoreboard
   */
  getScoreboard(players) {
    return players
      .map(p => ({
        id: p.id,
        name: p.name,
        score: p.score
      }))
      .sort((a, b) => b.score - a.score)
      .map((player, index) => ({
        ...player,
        rank: index + 1
      }));
  }

  /**
   * Determine winner(s)
   * @param {Array} players - All players with final scores
   * @returns {Object} {winner, isTie, tiedPlayers}
   */
  determineWinner(players) {
    const scoreboard = this.getScoreboard(players);
    
    if (scoreboard.length === 0) {
      return { winner: null, isTie: false, tiedPlayers: [] };
    }
    
    const topScore = scoreboard[0].score;
    const tiedPlayers = scoreboard.filter(p => p.score === topScore);
    
    return {
      winner: scoreboard[0],
      isTie: tiedPlayers.length > 1,
      tiedPlayers
    };
  }
}

module.exports = ScoreCalculator;
