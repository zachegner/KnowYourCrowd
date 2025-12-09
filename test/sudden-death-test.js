/**
 * Sudden Death Test - Tests tie-breaking functionality
 * Simulates 4 players where 2 tie at the end, triggering sudden death
 * 
 * GAME PLAN:
 * - Alice hosts Round 1: Gets 5/5 correct + bonus = 8 points
 * - Bob hosts Round 2: Gets 0/5 correct = 0 points  
 * - Charlie hosts Round 3: Gets 0/5 correct = 0 points
 * - Diana hosts Round 4: Gets 5/5 correct + bonus = 8 points
 * 
 * RESULT: Alice and Diana tied at 8 points → SUDDEN DEATH
 * 
 * SUDDEN DEATH:
 * - Alice hosts Round 5 (SD Round 1): Gets 3/3 correct = 3 points (11 total)
 * - Diana hosts Round 6 (SD Round 2): Gets 0/3 correct = 0 points (8 total)
 * 
 * WINNER: Alice with 11 points
 */

const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';
const NUM_PLAYERS = 4;

// Store connections and state
const players = [];
let roomCode = null;
let currentHost = null;
let currentRound = 0;
let matchingAnswers = [];
let matchingPlayers = [];
let gameOver = false;
let suddenDeathStarted = false;
let winner = null;

// Test results tracking
const testResults = {
  roundsCompleted: 0,
  hostScores: [],
  scores: {},
  errors: [],
  gameOverData: null,
  scenarios: [],
  processedRounds: new Set(),
  gameOverProcessed: false,
  suddenDeathData: null
};

// Matching strategies for each round
const matchingStrategies = {
  // Round 1 (Alice): ALL CORRECT - 8 points
  1: (answers, players) => {
    return answers.map((answer, idx) => ({
      answerIndex: idx,
      playerId: answer.playerId
    }));
  },
  
  // Round 2 (Bob): ALL WRONG - 0 points
  2: (answers, playersList) => {
    return answers.map((answer, idx) => {
      const wrongPlayer = playersList.find(p => p.id !== answer.playerId);
      return {
        answerIndex: idx,
        playerId: wrongPlayer?.id || playersList[0].id
      };
    });
  },
  
  // Round 3 (Charlie): ALL WRONG - 0 points
  3: (answers, playersList) => {
    return answers.map((answer, idx) => {
      const wrongPlayer = playersList.find(p => p.id !== answer.playerId);
      return {
        answerIndex: idx,
        playerId: wrongPlayer?.id || playersList[0].id
      };
    });
  },
  
  // Round 4 (Diana): ALL CORRECT - 8 points (TIES WITH ALICE)
  4: (answers, players) => {
    return answers.map((answer, idx) => ({
      answerIndex: idx,
      playerId: answer.playerId
    }));
  },
  
  // Round 5 (Alice, SD Round 1): ALL CORRECT - 3 points (11 total)
  5: (answers, players) => {
    return answers.map((answer, idx) => ({
      answerIndex: idx,
      playerId: answer.playerId
    }));
  },
  
  // Round 6 (Diana, SD Round 2): ALL WRONG - 0 points (8 total)
  6: (answers, playersList) => {
    return answers.map((answer, idx) => {
      const wrongPlayer = playersList.find(p => p.id !== answer.playerId);
      return {
        answerIndex: idx,
        playerId: wrongPlayer?.id || playersList[0].id
      };
    });
  }
};

function getStrategyName(round) {
  const names = {
    1: 'ALL CORRECT (Perfect)',
    2: 'ALL WRONG (Zero)',
    3: 'ALL WRONG (Zero)',
    4: 'ALL CORRECT (Perfect - TIE!)',
    5: 'SD R1: ALL CORRECT',
    6: 'SD R2: ALL WRONG'
  };
  return names[round] || 'Unknown';
}

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

    socket.on('phase_changed', (data) => {
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
          const strategy = matchingStrategies[currentRound] || matchingStrategies[1];
          const matches = strategy(matchingAnswers, matchingPlayers);
          
          const strategyName = getStrategyName(currentRound);
          log(`${name} (HOST R${currentRound}) using strategy: ${strategyName}`);
          log(`  Submitting ${matches.length} matches`);
          
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

    socket.on('round_end', (data) => {
      const roundNum = data.currentRound;
      
      // Only process each round once
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

    socket.on('sudden_death_start', (data) => {
      if (testResults.suddenDeathData) {
        return; // Already processed
      }
      
      suddenDeathStarted = true;
      testResults.suddenDeathData = data;
      
      log(`\n${'⚡'.repeat(25)}`);
      log(`⚡⚡⚡ SUDDEN DEATH TRIGGERED! ⚡⚡⚡`);
      log(`${'⚡'.repeat(25)}`);
      log(`Message: ${data.message}`);
      log(`Tied players: ${data.tiedPlayers.map(p => `${p.name} (${p.score} pts)`).join(' vs ')}`);
      log(`${'⚡'.repeat(25)}\n`);
    });

    socket.on('game_over', (data) => {
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
      log(`\n🏆 WINNER: ${data.winner?.name} with ${data.winner?.score} points!`);
      
      if (data.wasSuddenDeath) {
        log(`\n⚡ Winner determined by SUDDEN DEATH after ${data.suddenDeathRounds} sudden death round(s)!`);
      }
      
      log(`\nFinal Scoreboard:`);
      data.scoreboard.forEach((p, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
        log(`  ${medal} ${i + 1}. ${p.name}: ${p.score} points`);
      });
      log(`${'═'.repeat(50)}\n`);
    });

    setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 10000);
  });
}

async function connectDisplay() {
  return new Promise((resolve, reject) => {
    const displaySocket = io(SERVER_URL, {
      transports: ['websocket'],
      forceNew: true
    });

    displaySocket.on('phase_changed', (phaseData) => {
      if (phaseData.phase === 'theme_select') {
        currentRound = phaseData.currentRound;
        log(`\n${'▶'.repeat(3)} ROUND ${phaseData.currentRound}/${phaseData.totalRounds} - Host: ${phaseData.currentHost?.name} ${'◀'.repeat(3)}`);
      }
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

async function runTest() {
  log('═'.repeat(50));
  log('  SUDDEN DEATH TEST - TIE BREAKER');
  log('═'.repeat(50));
  log('\nTesting with 4 players - 2 will tie at 6 points:');
  log('  Round 1 (Alice):   ALL CORRECT → 6 points (3/3 + bonus)');
  log('  Round 2 (Bob):     ALL WRONG   → 0 points');
  log('  Round 3 (Charlie): ALL WRONG   → 0 points');
  log('  Round 4 (Diana):   ALL CORRECT → 6 points (3/3 + bonus, TIE!)');
  log('\nExpected: Alice & Diana tied at 6 → SUDDEN DEATH');
  log('  SD Round 1A (Alice hosts, Bob/Charlie/Diana answer):');
  log('    - Alice gets 3/3 correct + bonus = 6 pts → 12 total');
  log('  SD Round 1B (Diana hosts, Bob/Charlie/Alice answer):');
  log('    - Diana gets 0/3 correct = 0 pts → 6 total');
  log('  After full SD Round 1: Alice 12, Diana 6 → Alice wins!');
  log('\nExpected winner: Alice with 12 points after 1 full SD round (2 sub-rounds)\n');

  try {
    // Step 1: Connect display
    log('Step 1: Connecting display...');
    const { displaySocket, roomCode: rc } = await connectDisplay();
    roomCode = rc;
    log(`Room code: ${roomCode}\n`);

    // Step 2: Connect players
    log(`Step 2: Connecting ${NUM_PLAYERS} players...`);
    const names = ['Alice', 'Bob', 'Charlie', 'Diana'];
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const player = await joinWithRoomCode(names[i], roomCode, i);
      players.push(player);
      await new Promise(r => setTimeout(r, 500));
    }
    log(`\nAll ${NUM_PLAYERS} players joined. First host: ${names[0]}\n`);

    // Step 3: Start game
    log('Step 3: Starting game...\n');
    await new Promise(r => setTimeout(r, 1000));
    players[0].socket.emit('start_game', { rotations: 1 });

    // Step 4: Wait for game over
    log('Step 4: Playing through regular rounds + sudden death...\n');
    const completed = await waitForGameOver();

    if (!completed) {
      throw new Error('Game did not complete within timeout');
    }

    // Step 5: Verify results
    log('\n═'.repeat(50));
    log('TEST VERIFICATION');
    log('═'.repeat(50));

    let allPassed = true;

    // Check if sudden death triggered
    if (!suddenDeathStarted) {
      log('❌ FAILED: Sudden death did not trigger');
      allPassed = false;
    } else {
      log('✅ Sudden death triggered');
    }

    // Check sudden death data
    if (testResults.suddenDeathData) {
      const sd = testResults.suddenDeathData;
      log(`✅ Tied players: ${sd.tiedPlayers.map(p => p.name).join(', ')}`);
      
      if (sd.tiedPlayers.length === 2) {
        log('✅ Exactly 2 players tied');
      } else {
        log(`❌ Expected 2 tied players, got ${sd.tiedPlayers.length}`);
        allPassed = false;
      }
    } else {
      log('❌ No sudden death data received');
      allPassed = false;
    }

    // Check winner
    if (testResults.gameOverData) {
      const winnerName = testResults.gameOverData.winner.name;
      const winnerScore = testResults.gameOverData.winner.score;
      
      log(`✅ Winner: ${winnerName} with ${winnerScore} points`);
      
      if (winnerName === 'Alice' && winnerScore === 12) {
        log('✅ Winner is Alice with 12 points (expected)');
      } else {
        log(`❌ Expected Alice with 12 points, got ${winnerName} with ${winnerScore}`);
        allPassed = false;
      }
      
      if (testResults.gameOverData.wasSuddenDeath) {
        log('✅ Game marked as sudden death victory');
      } else {
        log('❌ Game not marked as sudden death victory');
        allPassed = false;
      }
    }

    // Check rounds played
    log(`\nRounds completed: ${testResults.roundsCompleted}`);
    if (testResults.roundsCompleted === 6) {
      log('✅ Played 6 total rounds: 4 regular + 2 SD sub-rounds (Alice hosts, Diana hosts)');
    } else {
      log(`❌ Expected 6 rounds total, got ${testResults.roundsCompleted}`);
      allPassed = false;
    }

    log('\n═'.repeat(50));
    log('OVERALL TEST STATUS');
    log('═'.repeat(50));
    
    const checks = [
      suddenDeathStarted,
      testResults.suddenDeathData !== null,
      testResults.gameOverData !== null,
      testResults.gameOverData?.wasSuddenDeath === true,
      testResults.gameOverData?.winner.name === 'Alice',
      testResults.gameOverData?.winner.score === 12,
      testResults.roundsCompleted === 6
    ];
    
    const passedChecks = checks.filter(c => c).length;
    log(`  ${allPassed ? '✅' : '❌'} Test ${allPassed ? 'PASSED' : 'FAILED'}`);
    log(`  Passed ${passedChecks}/${checks.length} checks\n`);

    log('Cleaning up connections...\n');
    displaySocket.disconnect();
    players.forEach(p => p.socket.disconnect());

    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    log(`\n❌ TEST ERROR: ${error.message}`);
    log(error.stack);
    process.exit(1);
  }
}

runTest();
