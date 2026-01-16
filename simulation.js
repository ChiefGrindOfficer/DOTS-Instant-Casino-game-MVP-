// simulation.js
// Developer-only simulation logic that reuses existing game math

/**
 * Get maximum practical step for a given grid size
 * MINES model: max practical step = safe cells - 1
 * (exclude the last step with very low probability)
 * 
 * @param {number} gridSize - 3 or 4
 * @returns {number} Maximum practical step index
 */
function getMaxStepForGrid(gridSize) {
  const gridConfig = window.GameMath.CONFIG.grids[gridSize];
  
  if (!gridConfig) {
    console.error(`Unknown grid size: ${gridSize}`);
    return 0;
  }
  
  // Max practical step = safe cells - 1
  // 3x3: 8 safe cells → max step 7 (exclude step 8 with 50% probability)
  // 4x4: 14 safe cells → max step 13 (exclude step 14 with 33% probability)
  return gridConfig.total - gridConfig.stopPoints - 1;
}

/**
 * Simulates ONE round of gameplay headlessly (no UI)
 * Uses pure math model - does NOT depend on GameState
 * 
 * @param {Object} params
 * @param {number} params.gridSize - 3 or 4
 * @param {number} params.bet - Bet amount
 * @param {number} params.targetStep - Target step to cash out at
 * @returns {Object} { win: boolean, payout: number, multiplier?: number, stepsReached: number }
 */
function simulateRound({ gridSize, bet, targetStep }) {
  let stepIndex = 0;
  
  // DYNAMIC: Get max step from CONFIG multipliers (single source of truth)
  const maxStep = getMaxStepForGrid(gridSize);
  
  // Validate target step - cannot exceed game's maximum
  if (targetStep > maxStep) {
    console.warn(`Target step ${targetStep} exceeds max ${maxStep} for ${gridSize}x${gridSize}. Clamping to ${maxStep}.`);
    targetStep = maxStep;
  }
  
  while (true) {
    stepIndex++;
    
    // Check if we've exceeded max possible steps
    if (stepIndex > maxStep) {
      return { 
        win: false, 
        payout: 0, 
        stepsReached: stepIndex - 1 
      };
    }
    
    // PURE FUNCTION: Pass gridSize explicitly (no GameState dependency)
    const probability = window.GameMath.getStepProbability(stepIndex, gridSize);
    
    // Roll success using pure RNG
    const success = Math.random() < probability;
    
    if (!success) {
      // Failed step - lose entire bet
      return { 
        win: false, 
        payout: 0, 
        stepsReached: stepIndex - 1 
      };
    }
    
    // Successful step - check if we've reached target
    if (stepIndex >= targetStep) {
      const multiplier = window.GameMath.getMultiplierForStep(stepIndex, gridSize);
      return {
        win: true,
        payout: bet * multiplier,
        multiplier: multiplier,
        stepsReached: stepIndex
      };
    }
    
    // Continue to next step...
  }
}

/**
 * Runs multiple simulation rounds and aggregates statistics
 * 
 * @param {Object} params
 * @param {number} params.rounds - Number of rounds to simulate
 * @param {number} params.startBalance - Starting balance
 * @param {number} params.bet - Bet amount per round
 * @param {number} params.gridSize - 3 or 4
 * @param {number} params.targetStep - Target step to cash out at
 * @returns {Object} Statistics object
 */
function runSimulation({ rounds, startBalance, bet, gridSize, targetStep }) {
  let balance = startBalance;
  let peakBalance = balance;
  let maxDrawdown = 0;
  
  let totalWagered = 0;
  let totalWon = 0;
  let wins = 0;
  let losses = 0;
  let maxWin = 0;
  let currentLosingStreak = 0;
  let longestLosingStreak = 0;
  
  let roundsCompleted = 0;
  
  for (let i = 0; i < rounds; i++) {
    // Stop if insufficient balance
    if (balance < bet) {
      console.warn(`Simulation stopped at round ${i + 1}/${rounds} - insufficient balance`);
      break;
    }
    
    // Deduct bet
    balance -= bet;
    totalWagered += bet;
    
    // Simulate round using REAL game logic
    const result = simulateRound({ gridSize, bet, targetStep });
    
    if (result.win) {
      // Win: add payout to balance
      balance += result.payout;
      totalWon += result.payout;
      wins++;
      maxWin = Math.max(maxWin, result.payout);
      currentLosingStreak = 0;
    } else {
      // Loss: bet is already deducted, no payout
      losses++;
      currentLosingStreak++;
      longestLosingStreak = Math.max(longestLosingStreak, currentLosingStreak);
    }
    
    // Track drawdown
    peakBalance = Math.max(peakBalance, balance);
    if (peakBalance > 0) {
      const drawdown = (peakBalance - balance) / peakBalance;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    roundsCompleted++;
  }
  
  // Calculate final statistics
  const netPnL = balance - startBalance;
  const netPnLPercent = (netPnL / startBalance) * 100;
  const rtp = totalWagered > 0 ? (totalWon / totalWagered) : 0;
  const winRate = roundsCompleted > 0 ? (wins / roundsCompleted) : 0;
  
  return {
    startBalance,
    endBalance: balance,
    netPnL,
    netPnLPercent,
    totalWagered,
    totalWon,
    rtp,
    rtpPercent: rtp * 100,
    totalRounds: roundsCompleted,
    wins,
    losses,
    winRate,
    winRatePercent: winRate * 100,
    maxWin,
    maxDrawdown,
    maxDrawdownPercent: maxDrawdown * 100,
    longestLosingStreak
  };
}

/**
 * Formats currency values (with safe fallback for undefined)
 */
function formatCurrency(value) {
  return '$' + (value ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Formats percentage values (with safe fallback for undefined)
 */
function formatPercent(value, decimals = 2) {
  return (value ?? 0).toFixed(decimals) + '%';
}

/**
 * Updates the UI with simulation results
 */
function displayResults(results) {
  document.getElementById('statStartBalance').textContent = formatCurrency(results.startBalance);
  document.getElementById('statEndBalance').textContent = formatCurrency(results.endBalance);
  
  const pnlEl = document.getElementById('statPnL');
  pnlEl.textContent = formatCurrency(results.netPnL) + ' (' + formatPercent(results.netPnLPercent) + ')';
  pnlEl.className = 'stat-value ' + ((results.netPnL ?? 0) >= 0 ? 'positive' : 'negative');
  
  document.getElementById('statTotalWagered').textContent = formatCurrency(results.totalWagered);
  
  const rtpEl = document.getElementById('statRTP');
  rtpEl.textContent = formatPercent(results.rtpPercent);
  rtpEl.className = 'stat-value ' + ((results.rtp ?? 0) >= 0.95 ? 'positive' : 'negative');
  
  document.getElementById('statWinRate').textContent = formatPercent(results.winRatePercent);
  document.getElementById('statMaxDrawdown').textContent = formatPercent(results.maxDrawdownPercent);
  document.getElementById('statMaxWin').textContent = formatCurrency(results.maxWin);
  document.getElementById('statLongestStreak').textContent = (results.longestLosingStreak ?? 0);
  document.getElementById('statTotalRounds').textContent = (results.totalRounds ?? 0).toLocaleString();
  
  // Show results panel
  document.getElementById('resultsPanel').style.display = 'block';
}

/**
 * UI Event Handlers
 */
document.addEventListener('DOMContentLoaded', () => {
  const gridModeEl = document.getElementById('gridMode');
  const targetStepEl = document.getElementById('targetStep');
  const runBtn = document.getElementById('runBtn');
  const progressEl = document.getElementById('progress');
  
  /**
   * Populate target step dropdown with step numbers and multipliers
   * MINES model: Calculate multipliers dynamically
   */
  function populateTargetStepOptions(gridSize) {
    // DYNAMIC: Calculate max step from grid config
    const maxStep = getMaxStepForGrid(gridSize);
    
    // Clear existing options
    targetStepEl.innerHTML = '';
    
    // Add options for each step (calculate multipliers dynamically)
    for (let step = 1; step <= maxStep; step++) {
      const multiplier = window.GameMath.getMultiplierForStep(step, gridSize);
      const option = document.createElement('option');
      option.value = step;
      option.textContent = `Step ${step} — ${multiplier.toFixed(2)}x`;
      targetStepEl.appendChild(option);
    }
    
    // Set default to step 3
    targetStepEl.value = '3';
  }
  
  // Initialize dropdown on page load
  if (window.GameMath) {
    populateTargetStepOptions(parseInt(gridModeEl.value));
  }
  
  // Update target step dropdown when grid mode changes
  gridModeEl.addEventListener('change', () => {
    const gridSize = parseInt(gridModeEl.value);
    populateTargetStepOptions(gridSize);
  });
  
  // Run simulation
  runBtn.addEventListener('click', async () => {
    // Validate GameMath API is available
    if (!window.GameMath) {
      alert('ERROR: GameMath API not available. Make sure game.js is loaded.');
      return;
    }
    
    // Get parameters
    const gridSize = parseInt(gridModeEl.value);
    const bet = parseFloat(document.getElementById('betAmount').value);
    const targetStep = parseInt(targetStepEl.value);
    const rounds = parseInt(document.getElementById('numRounds').value);
    const startBalance = parseFloat(document.getElementById('startBalance').value);
    
    // Validate bet and balance only (target step is always valid from dropdown)
    if (bet < 0.10) {
      alert('Bet amount must be at least $0.10');
      return;
    }
    
    if (startBalance < bet) {
      alert('Starting balance must be at least equal to bet amount');
      return;
    }
    
    // Disable button and show progress
    runBtn.disabled = true;
    progressEl.classList.remove('hidden');
    progressEl.textContent = `Running ${rounds.toLocaleString()} rounds...`;
    
    // Run simulation asynchronously to allow UI update
    setTimeout(() => {
      try {
        const startTime = performance.now();
        
        const results = runSimulation({
          rounds,
          startBalance,
          bet,
          gridSize,
          targetStep
        });
        
        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log('Simulation completed in', duration, 'seconds');
        console.log('Results:', results);
        
        // Display results
        displayResults(results);
        
        // Update progress
        progressEl.textContent = `✓ Completed in ${duration}s`;
        
      } catch (error) {
        console.error('Simulation error:', error);
        alert('Simulation failed: ' + error.message);
        progressEl.textContent = '✗ Error occurred';
      } finally {
        runBtn.disabled = false;
      }
    }, 50);
  });
});

// Export functions for use in other pages (e.g., dev.html)
window.SimulationEngine = {
  runSimulation: runSimulation,
  getMaxStepForGrid: getMaxStepForGrid
};
