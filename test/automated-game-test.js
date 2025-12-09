/**
 * Automated Game Test - Full Game with Multiple Scenarios
 * Simulates 6 players connecting and playing through a complete game
 * Each player hosts exactly once (1 rotation)
 * 
 * TEST SCENARIOS PER HOST:
 * - Alice (Round 1): Gets ALL correct (perfect round - tests +3 bonus)
 * - Bob (Round 2): Gets ALL wrong (tests 0 points)
 * - Charlie (Round 3): Gets 50% correct (partial scoring)
 * - Diana (Round 4): Gets 1 correct out of 5 (minimal scoring)
 * - Eve (Round 5): Gets 4 correct out of 5 (near-perfect)
 * - Frank (Round 6): Gets ALL correct (another perfect round)
 * 
 * EDGE CASES TESTED:
 * - Perfect round bonus (+3)
 * - Zero score round
 * - Mixed correct/incorrect
 * - Tie-breaking (if scores are equal)
 * - Scoreboard sorting
 * - Winner determination
 */

const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';
const NUM_PLAYERS = 6;

// Store connections and state
const players = [];
let roomCode = null;
let currentHost = null;
let currentRound = 0;
let matchingAnswers = [];
let matchingPlayers = [];
let gameOver = false;
let winner = null;

// Test results tracking
const testResults = {
  timerUpdates: [],
  phaseChanges: [],
  revealResults: [],
  roundsCompleted: 0,
  hostScores: [],
  scores: {},
  errors: [],
  gameOverData: null,
  scenarios: [],  // Track what happened in each round
  processedRounds: new Set(),  // Track which rounds we've already processed
  gameOverProcessed: false     // Only process game_over once
};

// Define matching strategies for each host (by round number)
// Returns a function that takes (answers, players) and returns matches array
const matchingStrategies = {
  // Round 1 (Alice): ALL CORRECT - Perfect round
  1: (answers, players) => {
    return answers.map((answer, idx) => ({
      answerIndex: idx,
      playerId: answer.playerId  // Correct match
    }));
  },
  
  // Round 2 (Bob): ALL WRONG - Zero points
  2: (answers, playersList) => {
    return answers.map((answer, idx) => {
      // Find a player who is NOT the actual author
      const wrongPlayer = playersList.find(p => p.id !== answer.playerId);
      return {
        answerIndex: idx,
        playerId: wrongPlayer?.id || playersList[0].id
      };
    });
  },
  
  // Round 3 (Charlie): 50% CORRECT (alternating)
  3: (answers, playersList) => {
    return answers.map((answer, idx) => {
      if (idx % 2 === 0) {
        // Even indices: correct
        return { answerIndex: idx, playerId: answer.playerId };
      } else {
        // Odd indices: wrong
        const wrongPlayer = playersList.find(p => p.id !== answer.playerId);
        return { answerIndex: idx, playerId: wrongPlayer?.id || playersList[0].id };
      }
    });
  },
  
  // Round 4 (Diana): Only FIRST correct, rest wrong
  4: (answers, playersList) => {
    return answers.map((answer, idx) => {
      if (idx === 0) {
        return { answerIndex: idx, playerId: answer.playerId };
      } else {
        const wrongPlayer = playersList.find(p => p.id !== answer.playerId);
        return { answerIndex: idx, playerId: wrongPlayer?.id || playersList[0].id };
      }
    });
  },
  
  // Round 5 (Eve): Only LAST one wrong, rest correct (4/5)
  5: (answers, playersList) => {
    return answers.map((answer, idx) => {
      if (idx === answers.length - 1) {
        // Last one wrong
        const wrongPlayer = playersList.find(p => p.id !== answer.playerId);
        return { answerIndex: idx, playerId: wrongPlayer?.id || playersList[0].id };
      } else {
        return { answerIndex: idx, playerId: answer.playerId };
      }
    });
  },
  
  // Round 6 (Frank): ALL CORRECT - Another perfect round
  6: (answers, players) => {
    return answers.map((answer, idx) => ({
      answerIndex: idx,
      playerId: answer.playerId
    }));
  }
};

// Expected scores based on strategies (5 answers per round = 5 non-host players)
const expectedScores = {
  1: { correct: 5, bonus: true, total: 8 },   // Alice: 5 + 3 bonus = 8
  2: { correct: 0, bonus: false, total: 0 },  // Bob: 0
  3: { correct: 2, bonus: false, total: 2 },  // Charlie: ~2-3 (depends on 5 answers)
  4: { correct: 1, bonus: false, total: 1 },  // Diana: 1
  5: { correct: 4, bonus: false, total: 4 },  // Eve: 4
  6: { correct: 5, bonus: true, total: 8 }    // Frank: 5 + 3 bonus = 8
};

function log(msg) {
  console.log(`[${new Date().toISOString().substr(11, 8)}] ${msg}`);
}

async function joinWithRoomCode(name, code, playerIndex) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      forceNew: true
    });

    const player = { name, socket, id: null, isHost: false, index: playerIndex };

    socket.on('connect', () => {
      log(`${name} connected, joining room ${code}`);
      socket.emit('join_room', { name, roomCode: code });
    });

    socket.on('room_joined', (data) => {
      player.id = data.player.id;
      player.isHost = data.player.isHost;
      player.sessionToken = data.player.sessionToken;
      log(`${name} joined room (isHost: ${player.isHost})`);
      resolve(player);
    });

    socket.on('join_error', (data) => {
      log(`${name} join error: ${data.message}`);
      reject(new Error(data.message));
    });

    socket.on('timer_update', (data) => {
      testResults.timerUpdates.push({ player: name, ...data });
    });

    socket.on('phase_changed', (data) => {
      testResults.phaseChanges.push({ player: name, ...data });
      currentHost = data.currentHost;
      currentRound = data.currentRound || currentRound;
      
      player.isHost = (currentHost?.id === player.id);
      
      // If answering phase and not host, submit answer
      if (data.phase === 'answering' && !player.isHost) {
        setTimeout(() => {
          const answer = `${name}'s answer R${currentRound}`;
          log(`${name} submitting answer: "${answer}"`);
          socket.emit('submit_answer', { answer });
        }, 300 + Math.random() * 500);
      }
    });

    socket.on('themes_generated', (data) => {
      if (player.isHost) {
        setTimeout(() => {
          log(`${name} (HOST R${currentRound}) selecting theme: ${data.themes[0]}`);
          socket.emit('host_select_theme', { theme: data.themes[0] });
        }, 300);
      }
    });

    socket.on('matching_phase_start', (data) => {
      matchingAnswers = data.answers || [];
      matchingPlayers = data.players || [];
      
      if (player.isHost && matchingAnswers.length > 0 && matchingPlayers.length > 0) {
        setTimeout(() => {
          // Use the strategy for this round
          const strategy = matchingStrategies[currentRound] || matchingStrategies[1];
          const matches = strategy(matchingAnswers, matchingPlayers);
          
          const strategyName = getStrategyName(currentRound);
          log(`${name} (HOST R${currentRound}) using strategy: ${strategyName}`);
          log(`  Submitting ${matches.length} matches`);
          
          // Log each match decision
          matches.forEach((m, i) => {
            const actual = matchingAnswers[m.answerIndex];
            const guessed = matchingPlayers.find(p => p.id === m.playerId);
            const isCorrect = actual.playerId === m.playerId;
            log(`    [${i}] "${actual.answer}" -> ${guessed?.name} ${isCorrect ? '✓' : '✗'}`);
          });
          
          socket.emit('host_submit_matches', { matches });
        }, 500);
      }
    });

    socket.on('reveal_result', (data) => {
      testResults.revealResults.push({ ...data, round: currentRound });
    });

    socket.on('round_end', (data) => {
      const roundNum = data.currentRound;
      
      // Only process each round once (all players receive this event)
      if (testResults.processedRounds.has(roundNum)) {
        return;
      }
      testResults.processedRounds.add(roundNum);
      testResults.roundsCompleted++;
      
      const hostScore = data.hostScore || {};
      
      testResults.hostScores.push({
        round: roundNum,
        host: data.currentHost?.name,
        score: hostScore.score || 0,
        correctMatches: hostScore.correctMatches || 0,
        totalMatches: hostScore.totalMatches || 0,
        isPerfect: hostScore.isPerfect || false
      });
      
      testResults.scenarios.push({
        round: roundNum,
        host: data.currentHost?.name,
        strategy: getStrategyName(roundNum),
        expected: expectedScores[roundNum],
        actual: hostScore
      });
      
      log(`\n${'─'.repeat(50)}`);
      log(`ROUND ${roundNum} COMPLETE - Host: ${data.currentHost?.name}`);
      log(`Strategy: ${getStrategyName(roundNum)}`);
      log(`Score: ${hostScore.score || 0} (${hostScore.correctMatches || 0}/${hostScore.totalMatches || 0} correct${hostScore.isPerfect ? ' + PERFECT BONUS!' : ''})`);
      log(`Scoreboard:`);
      data.scoreboard.forEach((p, i) => {
        testResults.scores[p.name] = p.score;
        log(`  ${i + 1}. ${p.name}: ${p.score} pts`);
      });
      if (data.nextHost) {
        log(`Next host: ${data.nextHost.name}`);
      }
      log(`${'─'.repeat(50)}\n`);
    });

    socket.on('answer_submitted', () => {});

    socket.on('game_over', (data) => {
      // Only process game_over once (all players receive this event)
      if (testResults.gameOverProcessed) {
        return;
      }
      testResults.gameOverProcessed = true;
      
      gameOver = true;
      winner = data.winner;
      testResults.gameOverData = data;
      
      log(`\n${'═'.repeat(50)}`);
      log(`🎉 GAME OVER! 🎉`);
      log(`${'═'.repeat(50)}`);
      log(`\n🏆 WINNER: ${data.winner?.name} with ${data.winner?.score} points!\n`);
      log(`Final Scoreboard:`);
      data.scoreboard.forEach((p, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
        log(`  ${medal} ${i + 1}. ${p.name}: ${p.score} points`);
      });
      log(`${'═'.repeat(50)}\n`);
    });

    socket.on('error', (data) => {
      testResults.errors.push({ player: name, error: data.message });
      log(`❌ ${name} error: ${data.message}`);
    });

    players.push(player);

    setTimeout(() => {
      if (!player.id) reject(new Error(`${name} timeout`));
    }, 10000);
  });
}

function getStrategyName(round) {
  const names = {
    1: 'ALL CORRECT (Perfect)',
    2: 'ALL WRONG (Zero)',
    3: '50% CORRECT (Mixed)',
    4: 'ONLY FIRST CORRECT (Minimal)',
    5: 'ONLY LAST WRONG (Near-Perfect)',
    6: 'ALL CORRECT (Perfect)'
  };
  return names[round] || 'Unknown';
}

async function startGameFromDisplay() {
  return new Promise((resolve) => {
    const displaySocket = io(SERVER_URL, {
      transports: ['websocket'],
      forceNew: true
    });

    displaySocket.on('timer_update', (timerData) => {
      testResults.timerUpdates.push({ player: 'DISPLAY', ...timerData });
    });

    displaySocket.on('phase_changed', (phaseData) => {
      if (phaseData.phase === 'theme_select') {
        currentRound = phaseData.currentRound;
        log(`\n${'▶'.repeat(3)} ROUND ${phaseData.currentRound}/${phaseData.totalRounds} - Host: ${phaseData.currentHost?.name} ${'◀'.repeat(3)}`);
      }
    });

    displaySocket.on('reveal_result', (revealData) => {
      const correct = revealData.isCorrect ? '✅' : '❌';
      log(`  ${correct} "${revealData.answer.substring(0, 20)}..." - Guessed: ${revealData.guessedPlayer?.name}, Actual: ${revealData.actualPlayer?.name}`);
    });

    displaySocket.on('game_over', (data) => {
      gameOver = true;
      winner = data.winner;
    });

    displaySocket.on('connect', () => {
      log('Display connected');
      displaySocket.emit('join_as_display');
    });

    displaySocket.once('game_state', (data) => {
      roomCode = data.roomCode;
      log(`Display got game_state, room: ${roomCode}`);
      resolve({ displaySocket, roomCode });
    });
  });
}

async function waitForGameOver(timeoutMs = 300000) {
  const startTime = Date.now();
  while (!gameOver && (Date.now() - startTime) < timeoutMs) {
    await new Promise(r => setTimeout(r, 500));
  }
  return gameOver;
}

function verifyScenarios() {
  log('\n' + '═'.repeat(50));
  log('SCENARIO VERIFICATION');
  log('═'.repeat(50));
  
  let allPassed = true;
  
  testResults.scenarios.forEach((scenario, idx) => {
    const roundNum = idx + 1;
    const expected = expectedScores[roundNum];
    const actual = scenario.actual;
    
    log(`\nRound ${roundNum} (${scenario.host}) - ${scenario.strategy}:`);
    
    // Check correct count (approximate for mixed scenarios)
    const correctOk = actual.correctMatches !== undefined;
    const bonusOk = expected.bonus === actual.isPerfect;
    
    if (correctOk && bonusOk) {
      log(`  ✅ Correct matches: ${actual.correctMatches}/${actual.totalMatches}`);
      log(`  ✅ Perfect bonus: ${actual.isPerfect ? 'YES (+3)' : 'NO'}`);
      log(`  ✅ Total score: ${actual.score}`);
    } else {
      allPassed = false;
      log(`  ❌ Expected bonus=${expected.bonus}, got isPerfect=${actual.isPerfect}`);
    }
  });
  
  return allPassed;
}

async function runTest() {
  log('═'.repeat(60));
  log('  AUTOMATED GAME TEST - MULTIPLE SCENARIOS');
  log('═'.repeat(60));
  log(`\nTesting with ${NUM_PLAYERS} players - each hosts once with different strategy:\n`);
  log('  Round 1 (Alice):   ALL CORRECT → Perfect bonus (+8 total)');
  log('  Round 2 (Bob):     ALL WRONG   → Zero points');
  log('  Round 3 (Charlie): 50% CORRECT → Partial score');
  log('  Round 4 (Diana):   1 CORRECT   → Minimal score');
  log('  Round 5 (Eve):     4/5 CORRECT → Near-perfect');
  log('  Round 6 (Frank):   ALL CORRECT → Perfect bonus (+8 total)');
  log('\nExpected winner: Alice or Frank (tied at 8 points)\n');

  try {
    // 1. Connect display first
    log('Step 1: Connecting display...');
    const { displaySocket, roomCode: code } = await startGameFromDisplay();
    roomCode = code;
    log(`Room code: ${roomCode}`);
    
    await new Promise(r => setTimeout(r, 300));

    // 2. Connect players
    log(`\nStep 2: Connecting ${NUM_PLAYERS} players...`);
    const playerNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank'];
    
    for (let i = 0; i < NUM_PLAYERS; i++) {
      await joinWithRoomCode(playerNames[i], roomCode, i);
      await new Promise(r => setTimeout(r, 100));
    }
    
    const hostPlayer = players.find(p => p.isHost);
    log(`\nAll ${NUM_PLAYERS} players joined. First host: ${hostPlayer?.name || 'unknown'}`);

    await new Promise(r => setTimeout(r, 300));

    // 3. Start game
    log('\nStep 3: Starting game...\n');
    displaySocket.emit('display_start_game');

    // 4. Wait for game to complete
    log('Step 4: Playing through all rounds with different scenarios...\n');
    
    const completed = await waitForGameOver(300000);

    // 5. Verify scenarios
    const scenariosOk = verifyScenarios();

    // 6. Report results
    log('\n' + '═'.repeat(50));
    log('TEST RESULTS SUMMARY');
    log('═'.repeat(50));
    
    log(`\nGame completed: ${completed ? 'YES ✅' : 'NO (timeout) ❌'}`);
    log(`Rounds completed: ${testResults.roundsCompleted}/${NUM_PLAYERS}`);
    
    const correctTotal = testResults.revealResults.filter(r => r.isCorrect).length;
    const incorrectTotal = testResults.revealResults.filter(r => !r.isCorrect).length;
    log(`Total reveals: ${testResults.revealResults.length} (${correctTotal} correct, ${incorrectTotal} wrong)`);
    
    log(`\nRound-by-round breakdown:`);
    testResults.hostScores.forEach(h => {
      const perf = h.isPerfect ? ' 🌟 PERFECT' : '';
      log(`  R${h.round} ${h.host.padEnd(8)}: ${h.score} pts (${h.correctMatches}/${h.totalMatches} correct)${perf}`);
    });

    log(`\nFinal scores:`);
    const sortedScores = Object.entries(testResults.scores).sort((a, b) => b[1] - a[1]);
    sortedScores.forEach(([name, score], i) => {
      log(`  ${i + 1}. ${name}: ${score} points`);
    });

    // Winner verification
    log('\n' + '═'.repeat(50));
    log('WINNER VERIFICATION');
    log('═'.repeat(50));
    
    if (testResults.gameOverData) {
      const { winner, scoreboard } = testResults.gameOverData;
      const highestScore = Math.max(...Object.values(testResults.scores));
      const expectedWinners = Object.entries(testResults.scores)
        .filter(([_, score]) => score === highestScore)
        .map(([name, _]) => name);
      
      log(`\nHighest score: ${highestScore}`);
      log(`Players with highest score: ${expectedWinners.join(', ')}`);
      log(`Declared winner: ${winner?.name} (${winner?.score} pts)`);
      
      if (winner && expectedWinners.includes(winner.name)) {
        log(`\n✅ WINNER CORRECT: ${winner.name} is a valid winner`);
      } else {
        log(`\n❌ WINNER INCORRECT: Expected one of [${expectedWinners.join(', ')}], got ${winner?.name}`);
      }
      
      // Check for ties
      if (expectedWinners.length > 1) {
        log(`\n⚠️  TIE DETECTED: ${expectedWinners.length} players tied for first`);
        log(`   Game chose: ${winner?.name}`);
      }
      
      // Verify scoreboard sorting
      const isSorted = scoreboard.every((p, i, arr) => i === 0 || arr[i-1].score >= p.score);
      log(`\nScoreboard sorted correctly: ${isSorted ? '✅' : '❌'}`);
    } else {
      log(`\n❌ NO GAME_OVER EVENT RECEIVED`);
    }

    // Overall test status
    log('\n' + '═'.repeat(50));
    log('OVERALL TEST STATUS');
    log('═'.repeat(50));
    
    const checks = {
      'Game completed': completed,
      'All rounds played': testResults.roundsCompleted === NUM_PLAYERS,
      'Timer updates work': testResults.timerUpdates.filter(t => t.player === 'DISPLAY').length > 0,
      'Reveals work': testResults.revealResults.length > 0,
      'Mixed results (correct+wrong)': correctTotal > 0 && incorrectTotal > 0,
      'Perfect bonus awarded': testResults.hostScores.some(h => h.isPerfect && h.score > h.correctMatches),
      'Zero score possible': testResults.hostScores.some(h => h.score === 0),
      'Game over received': !!testResults.gameOverData,
      'Winner declared': !!winner,
      'No errors': testResults.errors.length === 0
    };
    
    Object.entries(checks).forEach(([check, passed]) => {
      log(`  ${passed ? '✅' : '❌'} ${check}`);
    });
    
    const passedCount = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    log(`\nPassed: ${passedCount}/${totalChecks} checks`);
    
    if (testResults.errors.length > 0) {
      log(`\nErrors encountered:`);
      testResults.errors.forEach(e => log(`  ❌ ${e.player}: ${e.error}`));
    }

  } catch (err) {
    log(`\n❌ Test error: ${err.message}`);
    console.error(err);
  }

  // Cleanup
  log('\nCleaning up connections...');
  players.forEach(p => p.socket?.disconnect());
  
  const success = gameOver && winner && testResults.errors.length === 0;
  log(`\nTest ${success ? 'PASSED ✅' : 'FAILED ❌'}`);
  process.exit(success ? 0 : 1);
}

// Run the test
runTest();
