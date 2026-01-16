// game.js

const CONFIG = {
  gridSize: 3,
  stopPointCount: 1,
  canvasSize: 600,
  padding: 60,
  dotRadius: 18,
  snapRadius: 40,
  lineWidth: 8,
  betStep: 0.5,
  minBet: 0.10,
  maxBet: 500,
  initialBalance: 100000,
  
  // MINES-BASED MODEL: House edge (RTP = 94%)
  houseEdge: 0.94,
  
  // Grid configurations
  grids: {
    3: { total: 9, stopPoints: 1 },   // Classic: 9 cells, 1 stop
    4: { total: 16, stopPoints: 2 }   // Advanced: 16 cells, 2 stops
  }
};

const RoundState = {
  IDLE: "IDLE",
  DRAGGING: "DRAGGING",
  STEP_SUCCESS: "STEP_SUCCESS",
  STEP_FAIL: "STEP_FAIL",
  CASHOUT: "CASHOUT",
  ROUND_END: "ROUND_END"
};

const GameState = {
  balance: CONFIG.initialBalance,
  bet: 1,
  roundState: RoundState.ROUND_END,
  gridSize: CONFIG.gridSize,
  nodes: [],
  startNodeId: null,
  pathNodeIds: [],
  stepIndex: 0,
  multiplier: 1.0,
  activePointerId: null,
  pointerPos: { x: 0, y: 0 },
  hasActiveRound: false,
  failedNodeId: null,
  revealedStopPoints: [],
  gameMode: "manual", // "manual" or "auto"
  targetStepIndex: 2, // Target step index for auto mode
  autoIntervalId: null, // For auto mode game loop
  numberOfBets: 0, // Number of auto bets (0 = infinite)
  currentBetCount: 0, // Current bet count in auto mode
  autoStopRequested: false, // Flag to stop auto mode after current round
  animatingLine: false, // Whether line animation is in progress
  lineAnimationProgress: 0, // Animation progress (0 to 1)
  animatingToNode: null, // Target node for current animation
  animationStartTime: 0, // Animation start timestamp
  isAnimatingFail: false, // Whether current animation is for a failed step
  floatingMultipliers: [] // Array of floating multiplier animations: {x, y, multiplier, startTime}
};

let canvas, ctx;
let balanceEl, betEl, multiplierEl, winEl, startBtn, cashoutBtn, stopBtn, statusText;
let betMinusBtn, betPlusBtn, betHalfBtn, betDoubleBtn;
let gridToggleBtns;
let modeTabBtns;
let autoSection, targetMultiplierSlider, targetMultiplierValue, targetStepLabel;
let numberOfBetsInput, numberOfBetsUp, numberOfBetsDown, numberOfBetsInfinity;

function init() {
  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");

  balanceEl = document.getElementById("balanceValue");
  betEl = document.getElementById("betValue");
  multiplierEl = document.getElementById("multiplierValue");
  winEl = document.getElementById("winValue");
  startBtn = document.getElementById("startButton");
  cashoutBtn = document.getElementById("cashoutButton");
  stopBtn = document.getElementById("stopButton");
  statusText = null; // Removed from UI
  betMinusBtn = document.getElementById("betMinus");
  betPlusBtn = document.getElementById("betPlus");
  betHalfBtn = document.getElementById("betHalf");
  betDoubleBtn = document.getElementById("betDouble");
  gridToggleBtns = document.querySelectorAll(".grid-toggle-btn");
  modeTabBtns = document.querySelectorAll(".mode-tab");
  autoSection = document.getElementById("autoSection");
  targetMultiplierSlider = document.getElementById("targetMultiplierSlider");
  targetMultiplierValue = document.getElementById("targetMultiplierValue");
  targetStepLabel = document.getElementById("targetStepLabel");
  numberOfBetsInput = document.getElementById("numberOfBetsInput");
  numberOfBetsUp = document.getElementById("numberOfBetsUp");
  numberOfBetsDown = document.getElementById("numberOfBetsDown");
  numberOfBetsInfinity = document.getElementById("numberOfBetsInfinity");

  setupCanvas();
  setupGrid();
  attachUIEvents();
  attachPointerEvents();
  updateAutoSlider(); // Initialize auto slider
  updateNumberOfBetsDisplay(); // Initialize number of bets display
  resetRound();
  render();
}

function setupCanvas() {
  const deviceRatio = window.devicePixelRatio || 1;
  const container = canvas.parentElement;
  const containerRect = container.getBoundingClientRect();
  const maxSize = Math.min(containerRect.width, containerRect.height) - 40;
  const displaySize = Math.max(CONFIG.canvasSize, Math.min(maxSize, 800));

  canvas.style.width = displaySize + "px";
  canvas.style.height = displaySize + "px";
  canvas.width = displaySize * deviceRatio;
  canvas.height = displaySize * deviceRatio;

  ctx.setTransform(deviceRatio, 0, 0, deviceRatio, 0, 0);
  
  CONFIG.canvasSize = displaySize;
  
  const scale = displaySize / 600;
  CONFIG.dotRadius = 18 * scale;
  CONFIG.snapRadius = 40 * scale;
  CONFIG.lineWidth = 8 * scale;
  CONFIG.padding = 60 * scale;
}

function setupGrid() {
  GameState.nodes = [];
  const gs = GameState.gridSize;
  const size = CONFIG.canvasSize;
  const pad = CONFIG.padding;
  const step = (size - pad * 2) / (gs - 1);

  let id = 0;
  for (let row = 0; row < gs; row++) {
    for (let col = 0; col < gs; col++) {
      const x = pad + col * step;
      const y = pad + row * step;
      GameState.nodes.push({ id, row, col, x, y });
      id++;
    }
  }
}

function attachUIEvents() {
  startBtn.addEventListener("click", () => {
    if (GameState.roundState !== RoundState.ROUND_END) return;
    if (GameState.bet > GameState.balance) {
      setStatus("Insufficient balance");
      return;
    }
    startRound();
  });

  cashoutBtn.addEventListener("click", () => {
    handleCashout();
  });

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      stopAutoMode();
    });
  }

  betMinusBtn.addEventListener("click", () => {
    if (GameState.roundState !== RoundState.ROUND_END) return;
    const newBet = Math.max(0.10, GameState.bet - CONFIG.betStep);
    GameState.bet = +newBet.toFixed(2);
    betEl.value = GameState.bet.toFixed(2);
    updateHUD();
  });

  betPlusBtn.addEventListener("click", () => {
    if (GameState.roundState !== RoundState.ROUND_END) return;
    const newBet = Math.min(CONFIG.maxBet, GameState.bet + CONFIG.betStep);
    GameState.bet = +newBet.toFixed(2);
    betEl.value = GameState.bet.toFixed(2);
    updateHUD();
  });

  betHalfBtn.addEventListener("click", () => {
    if (GameState.roundState !== RoundState.ROUND_END) return;
    const newBet = Math.max(CONFIG.minBet, GameState.bet / 2);
    GameState.bet = +newBet.toFixed(2);
    betEl.value = GameState.bet.toFixed(2);
    updateHUD();
  });

  betDoubleBtn.addEventListener("click", () => {
    if (GameState.roundState !== RoundState.ROUND_END) return;
    const newBet = Math.min(CONFIG.maxBet, GameState.bet * 2);
    GameState.bet = +newBet.toFixed(2);
    betEl.value = GameState.bet.toFixed(2);
    updateHUD();
  });

  betEl.addEventListener("input", () => {
    if (GameState.roundState !== RoundState.ROUND_END) return;
    const value = parseFloat(betEl.value);
    if (!isNaN(value) && value >= CONFIG.minBet && value <= CONFIG.maxBet) {
      GameState.bet = +value.toFixed(2);
      updateHUD();
    }
  });

  betEl.addEventListener("blur", () => {
    if (GameState.roundState !== RoundState.ROUND_END) return;
    const value = parseFloat(betEl.value);
    if (isNaN(value) || value < CONFIG.minBet) {
      GameState.bet = CONFIG.minBet;
      betEl.value = CONFIG.minBet.toFixed(2);
    } else if (value > CONFIG.maxBet) {
      GameState.bet = CONFIG.maxBet;
      betEl.value = CONFIG.maxBet.toFixed(2);
    } else {
      GameState.bet = +value.toFixed(2);
      betEl.value = GameState.bet.toFixed(2);
    }
    updateHUD();
  });

  gridToggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (GameState.hasActiveRound) return;
      const size = parseInt(btn.dataset.gridSize);
      if (size === GameState.gridSize) return;

      gridToggleBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      GameState.gridSize = size;
      GameState.stopPointCount = size === 3 ? 1 : 2;
      
      // Update game mode name
      const gameModeNameEl = document.getElementById("gameModeName");
      if (gameModeNameEl) {
        gameModeNameEl.textContent = size === 3 ? "Classic" : "Advanced";
      }
      
      setupGrid();
      resetRound();
      if (GameState.gameMode === "auto") {
        updateAutoSlider();
      }
    });
  });

  // Mode tabs
  modeTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (GameState.hasActiveRound) return;
      const mode = btn.textContent.toLowerCase();
      if (mode === GameState.gameMode) return;

      modeTabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      GameState.gameMode = mode;
      if (mode === "auto") {
        autoSection.style.display = "block";
        updateAutoSlider();
        updateNumberOfBetsDisplay();
        // Don't change button visibility here - it will be set when round starts
      } else {
        autoSection.style.display = "none";
        if (GameState.autoIntervalId) {
          clearInterval(GameState.autoIntervalId);
          GameState.autoIntervalId = null;
        }
        GameState.currentBetCount = 0; // Reset when switching to manual
        GameState.autoStopRequested = false; // Reset stop request
        // Hide stop button, show start button when switching to manual
        if (stopBtn) {
          stopBtn.style.display = "none";
          stopBtn.disabled = true;
        }
        if (startBtn) startBtn.style.display = "block";
      }
    });
  });

  // Auto slider
  if (targetMultiplierSlider) {
    targetMultiplierSlider.addEventListener("input", () => {
      if (GameState.hasActiveRound) return;
      const stepIndex = parseInt(targetMultiplierSlider.value);
      GameState.targetStepIndex = stepIndex;
      updateAutoSlider();
    });
  }

  // Number of bets input
  if (numberOfBetsInput) {
    numberOfBetsInput.addEventListener("input", () => {
      if (GameState.hasActiveRound) return;
      const value = parseInt(numberOfBetsInput.value);
      if (!isNaN(value) && value >= 0) {
        GameState.numberOfBets = value;
        updateNumberOfBetsDisplay();
      }
    });

    numberOfBetsInput.addEventListener("blur", () => {
      if (GameState.hasActiveRound) return;
      const value = parseInt(numberOfBetsInput.value);
      if (isNaN(value) || value < 0) {
        GameState.numberOfBets = 0;
        numberOfBetsInput.value = "0";
      } else {
        GameState.numberOfBets = value;
        numberOfBetsInput.value = value.toString();
      }
      updateNumberOfBetsDisplay();
    });
  }

  // Number of bets spinner buttons
  if (numberOfBetsUp) {
    numberOfBetsUp.addEventListener("click", () => {
      if (GameState.hasActiveRound) return;
      GameState.numberOfBets = (GameState.numberOfBets || 0) + 1;
      numberOfBetsInput.value = GameState.numberOfBets.toString();
      updateNumberOfBetsDisplay();
    });
  }

  if (numberOfBetsDown) {
    numberOfBetsDown.addEventListener("click", () => {
      if (GameState.hasActiveRound) return;
      GameState.numberOfBets = Math.max(0, (GameState.numberOfBets || 0) - 1);
      numberOfBetsInput.value = GameState.numberOfBets.toString();
      updateNumberOfBetsDisplay();
    });
  }

  if (numberOfBetsInfinity) {
    numberOfBetsInfinity.addEventListener("click", () => {
      if (GameState.hasActiveRound) return;
      GameState.numberOfBets = 0;
      numberOfBetsInput.value = "0";
      updateNumberOfBetsDisplay();
    });
  }
}

function attachPointerEvents() {
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerCancel);
}

function startRound() {
  GameState.balance = +(GameState.balance - GameState.bet).toFixed(2);
  GameState.roundState = RoundState.IDLE;
  GameState.hasActiveRound = true;
  GameState.pathNodeIds = [];
  GameState.stepIndex = 0;
  GameState.multiplier = 1.0;
  GameState.activePointerId = null;
  GameState.failedNodeId = null;
  GameState.startNodeId = null;
  GameState.revealedStopPoints = [];
  GameState.floatingMultipliers = []; // Clear floating multipliers

  cashoutBtn.disabled = false;
  startBtn.disabled = true;
  
  if (GameState.gameMode === "auto") {
    // Show stop button, hide start button in auto mode
    if (stopBtn) {
      stopBtn.style.display = "block";
      stopBtn.disabled = false;
    }
    if (startBtn) startBtn.style.display = "none";
    // Lock controls during auto mode
    setAutoControlsLocked(true);
    // Increment bet count for auto mode
    GameState.currentBetCount++;
    // Auto mode: start with random first node
    const availableNodes = GameState.nodes.filter(n => !GameState.pathNodeIds.includes(n.id));
    if (availableNodes.length === 0) {
      resetRound();
      return;
    }
    const randomStartNode = availableNodes[Math.floor(Math.random() * availableNodes.length)];
    GameState.pathNodeIds.push(randomStartNode.id);
    GameState.startNodeId = randomStartNode.id;
    setStatus("Auto mode: Playing...");
    updateHUD();
    render();
    // Start auto game loop
    startAutoGameLoop();
  } else {
    // Manual mode: ensure start button is visible
    if (stopBtn) stopBtn.style.display = "none";
    if (startBtn) startBtn.style.display = "block";
    const maxSteps = GameState.gridSize === 3 ? 7 : 13;
    setStatus(`Draw to connect dots. Max ${maxSteps} steps. Cash out BEFORE failure to win.`);
    updateHUD();
    render();
  }
}

function resetRound() {
  // Stop auto loop if running
  if (GameState.autoIntervalId) {
    clearInterval(GameState.autoIntervalId);
    GameState.autoIntervalId = null;
  }
  
  GameState.roundState = RoundState.ROUND_END;
  GameState.hasActiveRound = false;
  GameState.pathNodeIds = [];
  GameState.stepIndex = 0;
  GameState.multiplier = 1.0;
  GameState.activePointerId = null;
  GameState.startNodeId = null;
  GameState.failedNodeId = null;
  GameState.revealedStopPoints = [];
  GameState.currentBetCount = 0; // Reset bet count
  GameState.autoStopRequested = false; // Reset stop request
  GameState.floatingMultipliers = []; // Clear floating multipliers

  cashoutBtn.disabled = true;
  startBtn.disabled = false;
  
  // Only hide stop button if not in auto mode
  if (GameState.gameMode !== "auto") {
    if (stopBtn) stopBtn.style.display = "none";
    if (startBtn) startBtn.style.display = "block";
    // Unlock controls
    setAutoControlsLocked(false);
  }
  // In auto mode, stop button visibility is managed by checkAndStartNextAutoBet
  
  setStatus("Press Bet to start");
  updateHUD();
  render();
}


function onPointerDown(e) {
  if (!GameState.hasActiveRound) return;
  if (GameState.activePointerId !== null) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  GameState.pointerPos.x = x;
  GameState.pointerPos.y = y;

  const targetNode = findSnappedNode(x, y);
  
  if (GameState.pathNodeIds.length === 0) {
    if (!targetNode) return;
    GameState.pathNodeIds.push(targetNode.id);
    GameState.startNodeId = targetNode.id;
  }

  GameState.activePointerId = e.pointerId;
  GameState.roundState = RoundState.DRAGGING;
  canvas.setPointerCapture(e.pointerId);
  render();
}

function onPointerMove(e) {
  if (GameState.activePointerId !== e.pointerId) return;
  const rect = canvas.getBoundingClientRect();
  GameState.pointerPos.x = e.clientX - rect.left;
  GameState.pointerPos.y = e.clientY - rect.top;
  if (GameState.roundState === RoundState.DRAGGING) {
    render();
  }
}

function onPointerUp(e) {
  if (GameState.activePointerId !== e.pointerId) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  canvas.releasePointerCapture(e.pointerId);
  GameState.activePointerId = null;

  if (!GameState.hasActiveRound) return;
  if (GameState.roundState !== RoundState.DRAGGING) return;

  const lastNodeId = GameState.pathNodeIds[GameState.pathNodeIds.length - 1];
  const lastNode = getNodeById(lastNodeId);

  const targetNode = findSnappedNode(x, y);
  if (!targetNode) {
    GameState.roundState = RoundState.IDLE;
    render();
    return;
  }

  if (!isValidNextNode(lastNode, targetNode)) {
    GameState.roundState = RoundState.IDLE;
    render();
    return;
  }

  const stepIndex = GameState.stepIndex + 1;

  const success = rollStepSuccess(stepIndex);

  if (success) {
    GameState.roundState = RoundState.STEP_SUCCESS;
    onStepSuccess(targetNode, stepIndex);
  } else {
    GameState.roundState = RoundState.STEP_FAIL;
    // Start animation before showing fail
    GameState.animatingLine = true;
    GameState.lineAnimationProgress = 0;
    GameState.animatingToNode = targetNode;
    GameState.animationStartTime = performance.now();
    GameState.isAnimatingFail = true;
    GameState.failedNodeId = targetNode.id;
    // Don't add to pathNodeIds yet - wait for animation
    animateLineConnection();
  }
}

function onPointerCancel(e) {
  if (GameState.activePointerId !== e.pointerId) return;
  canvas.releasePointerCapture(e.pointerId);
  GameState.activePointerId = null;
  if (!GameState.hasActiveRound) return;
  if (GameState.roundState === RoundState.DRAGGING) {
    GameState.roundState = RoundState.IDLE;
    render();
  }
}

function onStepSuccess(targetNode, stepIndex) {
  GameState.stepIndex = stepIndex;
  
  // Start line animation
  GameState.animatingLine = true;
  GameState.lineAnimationProgress = 0;
  GameState.animatingToNode = targetNode;
  GameState.animationStartTime = performance.now();
  
  // Don't add to pathNodeIds yet - wait for animation to complete
  // GameState.pathNodeIds.push(targetNode.id);
  
  GameState.multiplier = getMultiplierForStep(stepIndex);
  GameState.roundState = RoundState.IDLE;

  // Start animation loop
  animateLineConnection();
}

function onStepFail() {
  // Stop auto loop if running
  if (GameState.autoIntervalId) {
    clearInterval(GameState.autoIntervalId);
    GameState.autoIntervalId = null;
  }

  GameState.hasActiveRound = false;
  GameState.roundState = RoundState.ROUND_END;
  GameState.multiplier = 1.0;
  GameState.stepIndex = 0;
  
  if (GameState.gridSize === 4) {
    revealStopPoints();
  } else {
    // Classic (3x3): гарантированно показываем 1 stop-point (точку проигрыша)
    if (GameState.failedNodeId !== null && GameState.failedNodeId !== undefined) {
      GameState.revealedStopPoints = [GameState.failedNodeId];
    } else {
      // Если по какой-то причине failedNodeId не установлен, берем последнюю точку пути
      const lastNodeId = GameState.pathNodeIds[GameState.pathNodeIds.length - 1];
      if (lastNodeId !== null && lastNodeId !== undefined) {
        GameState.failedNodeId = lastNodeId;
        GameState.revealedStopPoints = [lastNodeId];
      } else {
        GameState.revealedStopPoints = [];
      }
    }
  }
  
  cashoutBtn.disabled = true;
  startBtn.disabled = false;
  
  // Don't change button visibility here in auto mode - let checkAndStartNextAutoBet handle it
  if (GameState.gameMode !== "auto") {
    if (stopBtn) stopBtn.style.display = "none";
    if (startBtn) startBtn.style.display = "block";
  }

  setStatus("Step failed. Bet lost. Multiplier reset.");
  updateHUD();
  render();

  // Auto mode: check if we need to start next bet
  if (GameState.gameMode === "auto") {
    checkAndStartNextAutoBet();
  }
}

function revealStopPoints() {
  const failedNode = GameState.failedNodeId;
  const available = GameState.nodes
    .map((n) => n.id)
    .filter((id) => !GameState.pathNodeIds.includes(id) && id !== failedNode);
  
  shuffleArray(available);
  // В режиме 4x4 теперь всего 2 стоп-точки (вместо 3)
  // При попадании на одну, показываем еще 1 дополнительную
  const additionalCount = 1;
  const additional = available.slice(0, additionalCount);
  
  GameState.revealedStopPoints = [failedNode, ...additional];
}

function handleCashout() {
  if (!GameState.hasActiveRound) return;
  if (GameState.stepIndex === 0) {
    setStatus("Make at least one step before cashing out");
    return;
  }
  
  // Stop auto loop if running
  if (GameState.autoIntervalId) {
    clearInterval(GameState.autoIntervalId);
    GameState.autoIntervalId = null;
  }

  GameState.roundState = RoundState.CASHOUT;
  const cashedMultiplier = GameState.multiplier;
  const winAmount = GameState.bet * cashedMultiplier;
  GameState.balance = +(GameState.balance + winAmount).toFixed(2);

  GameState.hasActiveRound = false;
  GameState.roundState = RoundState.ROUND_END;
  GameState.multiplier = 1.0;
  GameState.stepIndex = 0;
  cashoutBtn.disabled = true;
  startBtn.disabled = false;
  
  // Don't change button visibility here in auto mode - let checkAndStartNextAutoBet handle it
  if (GameState.gameMode !== "auto") {
    if (stopBtn) stopBtn.style.display = "none";
    if (startBtn) startBtn.style.display = "block";
  }

  setStatus(`Cashed out: $${winAmount.toFixed(2)} (×${cashedMultiplier.toFixed(2)})`);
  updateHUD();
  render();

  // Auto mode: check if we need to start next bet
  if (GameState.gameMode === "auto") {
    checkAndStartNextAutoBet();
  }
}

// ============================================================================
// MINES-BASED MODEL: Dynamic probability and progressive multiplier
// ============================================================================

/**
 * Calculate step success probability dynamically (MINES model)
 * Formula: safeRemaining / totalRemaining
 * 
 * @param {number} stepIndex - Current step (1-based)
 * @param {number} gridSize - Grid size (3 or 4), optional
 * @returns {number} - Probability of success for this step
 */
function getStepProbability(stepIndex, gridSize = null) {
  const size = gridSize !== null ? gridSize : (GameState ? GameState.gridSize : 3);
  const gridConfig = CONFIG.grids[size];
  
  if (!gridConfig) {
    console.error(`Unknown grid size: ${size}`);
    return 0;
  }
  
  const totalCells = gridConfig.total;
  const stopPoints = gridConfig.stopPoints;
  const safeCells = totalCells - stopPoints;
  
  // Calculate remaining cells after (stepIndex - 1) steps
  const totalRemaining = totalCells - (stepIndex - 1);
  const safeRemaining = safeCells - (stepIndex - 1);
  
  // Mines formula: probability = safeRemaining / totalRemaining
  if (totalRemaining <= 0 || safeRemaining <= 0) {
    return 0;
  }
  
  return safeRemaining / totalRemaining;
}

/**
 * Calculate progressive multiplier for given step (MINES model)
 * Formula: product of (1 / stepProbability) for each step, then * houseEdge
 * 
 * @param {number} stepIndex - Target step (1-based)
 * @param {number} gridSize - Grid size (3 or 4), optional
 * @returns {number} - Cumulative multiplier at this step
 */
function getMultiplierForStep(stepIndex, gridSize = null) {
  if (stepIndex === 0) return 0;
  
  const size = gridSize !== null ? gridSize : (GameState ? GameState.gridSize : 3);
  let multiplier = 1.0;
  
  // Progressive multiplier calculation (step-by-step)
  for (let step = 1; step <= stepIndex; step++) {
    const stepProb = getStepProbability(step, size);
    if (stepProb === 0) {
      console.error(`Invalid probability at step ${step}`);
      return 0;
    }
    
    // Multiply by inverse probability
    multiplier *= (1 / stepProb);
  }
  
  // Apply house edge ONCE at the end
  multiplier *= CONFIG.houseEdge;
  
  return multiplier;
}

/**
 * Roll for step success using dynamic probability
 * @param {number} stepIndex - Current step (1-based)
 * @returns {boolean} - True if step succeeds, false if hits stop point
 */
function rollStepSuccess(stepIndex) {
  const prob = getStepProbability(stepIndex);
  return Math.random() < prob;
}

function findSnappedNode(x, y) {
  let closest = null;
  let closestDist = Infinity;
  for (const node of GameState.nodes) {
    const d = distance(x, y, node.x, node.y);
    if (d <= CONFIG.snapRadius && d < closestDist) {
      closest = node;
      closestDist = d;
    }
  }
  return closest;
}

function isValidNextNode(lastNode, nextNode) {
  if (!lastNode || !nextNode) return false;
  if (lastNode.id === nextNode.id) return false;
  if (GameState.pathNodeIds.includes(nextNode.id)) return false;
  return true;
}

// Auto mode functions
function getRandomNextNode() {
  const lastNodeId = GameState.pathNodeIds[GameState.pathNodeIds.length - 1];
  const lastNode = getNodeById(lastNodeId);
  
  if (!lastNode) return null;
  
  // Get all available (unvisited) nodes
  const availableNodes = GameState.nodes.filter(
    (n) => !GameState.pathNodeIds.includes(n.id)
  );
  
  if (availableNodes.length === 0) return null;
  
  // Randomly select one
  const randomIndex = Math.floor(Math.random() * availableNodes.length);
  return availableNodes[randomIndex];
}

function startAutoGameLoop() {
  if (GameState.autoIntervalId) {
    clearInterval(GameState.autoIntervalId);
  }
  
  const stepDelay = 500; // 500ms delay between steps
  
  GameState.autoIntervalId = setInterval(() => {
    if (!GameState.hasActiveRound) {
      if (GameState.autoIntervalId) {
        clearInterval(GameState.autoIntervalId);
        GameState.autoIntervalId = null;
      }
      return;
    }
    
    // Wait for animation to complete before next step
    if (GameState.animatingLine) {
      return;
    }
    
    const nextNode = getRandomNextNode();
    if (!nextNode) {
      // No more nodes available, should not happen but handle gracefully
      if (GameState.autoIntervalId) {
        clearInterval(GameState.autoIntervalId);
        GameState.autoIntervalId = null;
      }
      return;
    }
    
    const lastNodeId = GameState.pathNodeIds[GameState.pathNodeIds.length - 1];
    const lastNode = getNodeById(lastNodeId);
    
    if (!isValidNextNode(lastNode, nextNode)) {
      if (GameState.autoIntervalId) {
        clearInterval(GameState.autoIntervalId);
        GameState.autoIntervalId = null;
      }
      return;
    }
    
    const stepIndex = GameState.stepIndex + 1;
    const success = rollStepSuccess(stepIndex);
    
    if (success) {
      onStepSuccess(nextNode, stepIndex);
      // Continue loop if not cashed out
      if (GameState.hasActiveRound && GameState.autoIntervalId) {
        // Loop will continue on next iteration
      }
    } else {
      // Start animation before showing fail
      GameState.animatingLine = true;
      GameState.lineAnimationProgress = 0;
      GameState.animatingToNode = nextNode;
      GameState.animationStartTime = performance.now();
      GameState.isAnimatingFail = true;
      GameState.failedNodeId = nextNode.id;
      // Don't add to pathNodeIds yet - wait for animation
      animateLineConnection();
    }
  }, stepDelay);
}

function updateAutoSlider() {
  if (!targetMultiplierSlider || !targetMultiplierValue || !targetStepLabel) return;
  
  const maxStep = GameState.gridSize === 3 ? 7 : 13;
  targetMultiplierSlider.min = 1;
  targetMultiplierSlider.max = maxStep;
  
  if (GameState.targetStepIndex > maxStep) {
    GameState.targetStepIndex = maxStep;
  }
  
  targetMultiplierSlider.value = GameState.targetStepIndex;
  
  const targetMultiplier = getMultiplierForStep(GameState.targetStepIndex);
  targetMultiplierValue.textContent = `${targetMultiplier.toFixed(2)}×`;
  targetStepLabel.textContent = `≈ Step ${GameState.targetStepIndex}`;
}

function updateNumberOfBetsDisplay() {
  if (!numberOfBetsInput) return;
  
  const spinner = document.getElementById("numberOfBetsSpinner");
  const infinityBtn = document.getElementById("numberOfBetsInfinity");
  
  // Display "∞" or the number
  if (GameState.numberOfBets === 0) {
    numberOfBetsInput.value = "0";
    // Show infinity button, spinner stays in left position
    if (infinityBtn) infinityBtn.style.display = "flex";
    if (spinner) {
      spinner.style.display = "flex";
      spinner.classList.remove("spinner-right");
      spinner.classList.add("spinner-left");
    }
  } else {
    numberOfBetsInput.value = GameState.numberOfBets.toString();
    // Hide infinity button, move spinner to right position
    if (infinityBtn) infinityBtn.style.display = "none";
    if (spinner) {
      spinner.style.display = "flex";
      spinner.classList.remove("spinner-left");
      spinner.classList.add("spinner-right");
    }
  }
}

function checkAndStartNextAutoBet() {
  // Check if stop was requested
  if (GameState.autoStopRequested) {
    // Stop auto mode
    GameState.autoStopRequested = false;
    GameState.currentBetCount = 0;
    
    // Stop auto loop if running
    if (GameState.autoIntervalId) {
      clearInterval(GameState.autoIntervalId);
      GameState.autoIntervalId = null;
    }
    
    // Hide stop button, show start button
    if (stopBtn) {
      stopBtn.style.display = "none";
      stopBtn.disabled = true;
    }
    if (startBtn) startBtn.style.display = "block";
    
    // Unlock controls when auto mode is stopped
    setAutoControlsLocked(false);
    
    setStatus("Auto mode stopped");
    return;
  }
  
  // Check if we should continue auto betting
  const shouldContinue = GameState.numberOfBets === 0 || GameState.currentBetCount < GameState.numberOfBets;
  
  if (shouldContinue && GameState.balance >= GameState.bet) {
    // Keep stop button visible between bets
    if (stopBtn) {
      stopBtn.style.display = "block";
      stopBtn.disabled = false;
    }
    if (startBtn) startBtn.style.display = "none";
    
    // Small delay before next bet
    setTimeout(() => {
      if (GameState.gameMode === "auto" && !GameState.hasActiveRound && !GameState.autoStopRequested) {
        startRound();
      }
    }, 1000);
  } else {
    // Reset bet count when done
    GameState.currentBetCount = 0;
    if (GameState.numberOfBets > 0 && GameState.currentBetCount >= GameState.numberOfBets) {
      setStatus(`Auto mode: Completed ${GameState.numberOfBets} bet(s)`);
    }
    // Hide stop button when auto mode is done, show start button
    if (stopBtn) {
      stopBtn.style.display = "none";
      stopBtn.disabled = true;
    }
    if (startBtn) startBtn.style.display = "block";
    // Unlock controls when auto mode is done
    setAutoControlsLocked(false);
  }
}

function stopAutoMode() {
  // Set flag to stop auto mode after current round completes
  GameState.autoStopRequested = true;
  
  // Disable stop button to prevent multiple clicks
  if (stopBtn) {
    stopBtn.disabled = true;
  }
  
  setStatus("Auto mode will stop after current round");
}

function setAutoControlsLocked(locked) {
  // Lock/unlock target multiplier slider
  if (targetMultiplierSlider) {
    targetMultiplierSlider.disabled = locked;
  }
  
  // Lock/unlock number of bets input and controls
  if (numberOfBetsInput) {
    numberOfBetsInput.disabled = locked;
  }
  if (numberOfBetsUp) {
    numberOfBetsUp.disabled = locked;
  }
  if (numberOfBetsDown) {
    numberOfBetsDown.disabled = locked;
  }
  if (numberOfBetsInfinity) {
    numberOfBetsInfinity.disabled = locked;
  }
  
  // Lock/unlock grid size toggle buttons
  if (gridToggleBtns) {
    gridToggleBtns.forEach(btn => {
      btn.disabled = locked;
      if (locked) {
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      } else {
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      }
    });
  }
}

function getNodeById(id) {
  return GameState.nodes.find((n) => n.id === id);
}

function updateHUD() {
  balanceEl.textContent = `$${GameState.balance.toFixed(2)}`;
  
  if (GameState.roundState === RoundState.ROUND_END) {
    betEl.value = GameState.bet.toFixed(2);
  }
  
  if (GameState.stepIndex === 0) {
    multiplierEl.textContent = `0.00×`;
  } else {
    multiplierEl.textContent = `${GameState.multiplier.toFixed(2)}×`;
  }
  
  const winAmount =
    GameState.stepIndex > 0 ? GameState.bet * GameState.multiplier : 0;
  winEl.textContent = `$${winAmount.toFixed(2)}`;
}

function setStatus(text) {
  // Status text element was removed from UI
  if (statusText) {
    statusText.textContent = text || "";
  }
}

function render() {
  const size = CONFIG.canvasSize;
  ctx.clearRect(0, 0, size, size);

  drawBackground();
  drawBackgroundGrid(); // Fine background grid for visual depth
  drawGridLines();
  drawPath();
  drawAnimatedLine();
  drawPreviewLine();
  drawNodes();
  drawFloatingMultipliers();
}

function drawBackground() {
  const size = CONFIG.canvasSize;
  // Dark base gradient
  const gradient = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    0,
    size * 0.5,
    size * 0.5,
    size * 0.7
  );
  gradient.addColorStop(0, "#0f1525");
  gradient.addColorStop(0.5, "#0a0f1a");
  gradient.addColorStop(1, "#050810");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  
  // Add subtle purple glow accents
  const glow1 = ctx.createRadialGradient(
    size * 0.2,
    size * 0.3,
    0,
    size * 0.2,
    size * 0.3,
    size * 0.4
  );
  glow1.addColorStop(0, "rgba(168, 85, 247, 0.15)");
  glow1.addColorStop(1, "rgba(168, 85, 247, 0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, size, size);
  
  const glow2 = ctx.createRadialGradient(
    size * 0.8,
    size * 0.7,
    0,
    size * 0.8,
    size * 0.7,
    size * 0.4
  );
  glow2.addColorStop(0, "rgba(236, 72, 153, 0.1)");
  glow2.addColorStop(1, "rgba(236, 72, 153, 0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, size, size);
}

function drawBackgroundGrid() {
  const size = CONFIG.canvasSize;
  const gridSpacing = 40; // Grid spacing for background texture
  
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = "rgba(168, 85, 247, 0.08)";
  ctx.lineCap = "butt";
  
  // Draw vertical lines
  for (let x = 0; x <= size; x += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  
  // Draw horizontal lines
  for (let y = 0; y <= size; y += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
}

function drawGridLines() {
  const nodes = GameState.nodes;
  const gs = GameState.gridSize;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(168, 85, 247, 0.25)";
  ctx.shadowColor = "rgba(168, 85, 247, 0.3)";
  ctx.shadowBlur = 8;
  ctx.lineCap = "round";

  for (let r = 0; r < gs; r++) {
    ctx.beginPath();
    for (let c = 0; c < gs; c++) {
      const n = nodes[r * gs + c];
      if (c === 0) {
        ctx.moveTo(n.x, n.y);
      } else {
        ctx.lineTo(n.x, n.y);
      }
    }
    ctx.stroke();
  }

  for (let c = 0; c < gs; c++) {
    ctx.beginPath();
    for (let r = 0; r < gs; r++) {
      const n = nodes[r * gs + c];
      if (r === 0) {
        ctx.moveTo(n.x, n.y);
      } else {
        ctx.lineTo(n.x, n.y);
      }
    }
    ctx.stroke();
  }
  
  ctx.shadowBlur = 0;
}

function drawPath() {
  const ids = GameState.pathNodeIds;
  if (ids.length < 2) return;

  ctx.lineWidth = CONFIG.lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowBlur = 9;

  // Check if the last node is a failed node (stop-point)
  const lastNodeId = ids[ids.length - 1];
  const isLastNodeFailed = GameState.failedNodeId !== null && lastNodeId === GameState.failedNodeId;

  if (isLastNodeFailed && ids.length >= 2) {
    // Draw all segments except the last one in purple
    ctx.strokeStyle = "#a855f7";
    ctx.shadowColor = "rgba(168, 85, 247, 0.8)";
    ctx.beginPath();
    const first = getNodeById(ids[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < ids.length - 1; i++) {
      const node = getNodeById(ids[i]);
      ctx.lineTo(node.x, node.y);
    }
    ctx.stroke();
    
    // Draw the last segment (to failed node) with gradient from purple to red
    const secondToLast = getNodeById(ids[ids.length - 2]);
    const lastNode = getNodeById(ids[ids.length - 1]);
    
    // Create linear gradient from second-to-last node to last node
    const gradient = ctx.createLinearGradient(
      secondToLast.x, secondToLast.y,
      lastNode.x, lastNode.y
    );
    gradient.addColorStop(0, "#a855f7"); // Purple at start
    gradient.addColorStop(1, "#ef4444"); // Red at end
    
    ctx.strokeStyle = gradient;
    ctx.shadowColor = "rgba(239, 68, 68, 0.8)";
    ctx.beginPath();
    ctx.moveTo(secondToLast.x, secondToLast.y);
    ctx.lineTo(lastNode.x, lastNode.y);
    ctx.stroke();
  } else {
    // Draw all segments in purple
    ctx.strokeStyle = "#a855f7";
    ctx.shadowColor = "rgba(168, 85, 247, 0.8)";
    ctx.beginPath();
    const first = getNodeById(ids[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < ids.length; i++) {
      const node = getNodeById(ids[i]);
      ctx.lineTo(node.x, node.y);
    }
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
}

function drawAnimatedLine() {
  if (!GameState.animatingLine || !GameState.animatingToNode) return;
  
  const ids = GameState.pathNodeIds;
  if (ids.length === 0) return;
  
  const lastNode = getNodeById(ids[ids.length - 1]);
  const targetNode = GameState.animatingToNode;
  
  if (!lastNode || !targetNode) return;
  
  // Calculate current position based on animation progress
  const currentX = lastNode.x + (targetNode.x - lastNode.x) * GameState.lineAnimationProgress;
  const currentY = lastNode.y + (targetNode.y - lastNode.y) * GameState.lineAnimationProgress;
  
  // Draw the animated line (always purple during animation)
  ctx.lineWidth = CONFIG.lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#a855f7";
  ctx.shadowColor = "rgba(168, 85, 247, 0.8)";
  ctx.shadowBlur = 12;
  
  ctx.beginPath();
  ctx.moveTo(lastNode.x, lastNode.y);
  ctx.lineTo(currentX, currentY);
  ctx.stroke();
  
  // Draw flame effect at the end of the line
  drawFlameEffect(currentX, currentY, targetNode.x, targetNode.y);
  
  ctx.shadowBlur = 0;
}

function drawFlameEffect(x, y, targetX, targetY) {
  // Calculate direction to target
  const dx = targetX - x;
  const dy = targetY - y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  
  // Always use yellow/orange flame during animation (same for success and fail)
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, 15);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.3, "rgba(255, 200, 100, 0.9)");
  gradient.addColorStop(0.6, "rgba(255, 150, 50, 0.7)");
  gradient.addColorStop(1, "rgba(255, 100, 0, 0)");
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw small flame particles
  const time = performance.now() * 0.005;
  for (let i = 0; i < 3; i++) {
    const offsetX = Math.cos(angle + Math.PI / 2 + time + i * 2) * 8;
    const offsetY = Math.sin(angle + Math.PI / 2 + time + i * 2) * 8;
    const particleX = x + offsetX;
    const particleY = y + offsetY;
    
    const particleGradient = ctx.createRadialGradient(particleX, particleY, 0, particleX, particleY, 6);
    particleGradient.addColorStop(0, `rgba(255, ${200 + i * 20}, ${100 + i * 30}, 0.8)`);
    particleGradient.addColorStop(1, "rgba(255, 100, 0, 0)");
    
    ctx.fillStyle = particleGradient;
    ctx.beginPath();
    ctx.arc(particleX, particleY, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function animateLineConnection() {
  if (!GameState.animatingLine) return;
  
  const animationDuration = 400; // milliseconds
  const currentTime = performance.now();
  const elapsed = currentTime - GameState.animationStartTime;
  
  GameState.lineAnimationProgress = Math.min(elapsed / animationDuration, 1);
  
  render();
  
  if (GameState.lineAnimationProgress >= 1) {
    // Animation complete
    GameState.animatingLine = false;
    GameState.pathNodeIds.push(GameState.animatingToNode.id);
    const wasFail = GameState.isAnimatingFail;
    GameState.animatingToNode = null;
    GameState.lineAnimationProgress = 0;
    GameState.isAnimatingFail = false;
    
    if (wasFail) {
      // Handle fail after animation
      onStepFail();
    } else {
      // Handle success after animation
      // Add floating multiplier animation
      const lastNode = getNodeById(GameState.pathNodeIds[GameState.pathNodeIds.length - 1]);
      if (lastNode) {
        GameState.floatingMultipliers.push({
          x: lastNode.x,
          y: lastNode.y,
          multiplier: GameState.multiplier,
          startTime: performance.now()
        });
      }
      
      // Auto mode: check if target multiplier reached
      if (GameState.gameMode === "auto") {
        const targetMultiplier = getMultiplierForStep(GameState.targetStepIndex);
        if (GameState.multiplier >= targetMultiplier) {
          // Auto cash out
          handleCashout();
          return;
        }
      }
      
      setStatus(`Step ${GameState.stepIndex} success. Multiplier: ${GameState.multiplier.toFixed(2)}×`);
      updateHUD();
      render();
      
      // Start animation loop for floating multipliers
      animateFloatingMultipliers();
    }
  } else {
    // Continue animation
    requestAnimationFrame(animateLineConnection);
  }
}

function animateFloatingMultipliers() {
  // Update and render floating multipliers
  const currentTime = performance.now();
  const hasActiveMultipliers = GameState.floatingMultipliers.some(fm => {
    const elapsed = currentTime - fm.startTime;
    return elapsed < 1500; // animationDuration
  });
  
  if (hasActiveMultipliers) {
    render();
    requestAnimationFrame(animateFloatingMultipliers);
  }
}

function drawPreviewLine() {
  if (GameState.roundState !== RoundState.DRAGGING) return;
  const ids = GameState.pathNodeIds;
  if (ids.length === 0) return;

  const lastNode = getNodeById(ids[ids.length - 1]);
  ctx.lineWidth = CONFIG.lineWidth * 0.9;
  ctx.strokeStyle = "rgba(168, 85, 247, 0.5)";
  ctx.shadowColor = "rgba(168, 85, 247, 0.4)";
  ctx.shadowBlur = 8;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(lastNode.x, lastNode.y);
  ctx.lineTo(GameState.pointerPos.x, GameState.pointerPos.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
}

function drawNodes() {
  const size = CONFIG.dotRadius;
  for (const node of GameState.nodes) {
    const isStart = node.id === GameState.startNodeId;
    const inPath = GameState.pathNodeIds.includes(node.id);
    const isStopPoint = GameState.revealedStopPoints && GameState.revealedStopPoints.includes(node.id);

    if (isStopPoint) {
      drawFailedNode(node.x, node.y, size);
    } else {
      drawRegularNode(node.x, node.y, size, isStart, inPath);
    }
  }
}

function drawRegularNode(x, y, radius, isStart, inPath) {
  const outerR = radius + 4;

  let baseColor = "#d8b4fe";
  let centerColor = "#a855f7";
  let glowColor = "#7c3aed";
  let borderColor = "rgba(168, 85, 247, 0.3)";

  if (inPath) {
    // Connected nodes: brighter with white border and stronger glow
    baseColor = "#f3e8ff";
    centerColor = "#c084fc";
    glowColor = "#a855f7";
    borderColor = "rgba(255, 255, 255, 0.8)";
  }

  if (isStart && inPath) {
    centerColor = "#10b981";
    glowColor = "#059669";
    borderColor = "rgba(16, 185, 129, 0.8)";
  }

  // Draw shadow
  ctx.beginPath();
  ctx.fillStyle = "rgba(5, 8, 16, 0.9)";
  ctx.arc(x, y, outerR + 2, 0, Math.PI * 2);
  ctx.fill();

  if (inPath) {
    ctx.shadowColor = isStart ? "rgba(16, 185, 129, 0.9)" : "rgba(168, 85, 247, 0.9)";
    ctx.shadowBlur = 20;
  } else {
    ctx.shadowColor = "rgba(168, 85, 247, 0.2)";
    ctx.shadowBlur = 8;
  }

  // Draw outer glow ring
  const grad = ctx.createRadialGradient(x - 3, y - 4, 2, x, y, outerR);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.35, baseColor);
  grad.addColorStop(1, glowColor);

  ctx.beginPath();
  ctx.fillStyle = grad;
  ctx.arc(x, y, outerR, 0, Math.PI * 2);
  ctx.fill();

  // Draw center
  ctx.beginPath();
  ctx.fillStyle = centerColor;
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Add white border for connected nodes
  if (inPath) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = borderColor;
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, radius + 1, 0, Math.PI * 2);
    ctx.stroke();
    
    // Add bright highlight for connected nodes
    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.35, 0, Math.PI * 2);
    ctx.fill();
    
    // Add outer glow ring for connected nodes
    ctx.beginPath();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.arc(x, y, outerR - 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
}

function drawFloatingMultipliers() {
  const currentTime = performance.now();
  const animationDuration = 1500; // 1.5 seconds
  const maxOffsetY = 60; // Maximum upward movement
  
  // Update and filter out expired multipliers
  GameState.floatingMultipliers = GameState.floatingMultipliers.filter(fm => {
    const elapsed = currentTime - fm.startTime;
    return elapsed < animationDuration;
  });
  
  // Draw each floating multiplier
  GameState.floatingMultipliers.forEach(fm => {
    const elapsed = currentTime - fm.startTime;
    const progress = elapsed / animationDuration; // 0 to 1
    
    // Calculate position (moves upward)
    const offsetY = -maxOffsetY * progress;
    const x = fm.x;
    const y = fm.y + offsetY;
    
    // Calculate opacity (fades out)
    const opacity = 1 - progress;
    
    // Calculate scale (slightly grows then shrinks)
    const scale = 1 + Math.sin(progress * Math.PI) * 0.3;
    
    // Draw multiplier text
    ctx.save();
    ctx.globalAlpha = opacity;
    
    const fontSize = 24 * scale;
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // Text shadow for better visibility
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    
    // Draw text with gradient (greenish tones)
    const gradient = ctx.createLinearGradient(x - 30, y, x + 30, y);
    gradient.addColorStop(0, "#a8ffa8");
    gradient.addColorStop(0.5, "#7fff7f");
    gradient.addColorStop(1, "#5aff5a");
    
    ctx.fillStyle = gradient;
    const multiplierText = `${fm.multiplier.toFixed(2)}×`;
    ctx.fillText(multiplierText, x, y);
    
    ctx.restore();
  });
}

function drawFailedNode(x, y, radius) {
  const outerR = radius + 6;
  const bombRadius = radius * 0.75;
  const spikeLength = radius * 0.6;
  const spikeCount = 10;

  // Draw outer glow/halo (reddish-orange atmospheric glow)
  const haloGradient = ctx.createRadialGradient(x, y, bombRadius, x, y, outerR + 8);
  haloGradient.addColorStop(0, "rgba(255, 100, 0, 0.6)");
  haloGradient.addColorStop(0.5, "rgba(255, 50, 0, 0.3)");
  haloGradient.addColorStop(1, "rgba(255, 0, 0, 0)");
  
  ctx.beginPath();
  ctx.fillStyle = haloGradient;
  ctx.arc(x, y, outerR + 8, 0, Math.PI * 2);
  ctx.fill();

  // Draw dark shadow background
  ctx.beginPath();
  ctx.fillStyle = "rgba(10, 4, 14, 0.9)";
  ctx.arc(x, y, outerR + 2, 0, Math.PI * 2);
  ctx.fill();

  // Draw spikes first (so they appear behind the glow)
  ctx.save();
  for (let i = 0; i < spikeCount; i++) {
    const angle = (Math.PI * 2 * i) / spikeCount;
    const spikeBaseX = x + Math.cos(angle) * bombRadius;
    const spikeBaseY = y + Math.sin(angle) * bombRadius;
    const spikeTipX = x + Math.cos(angle) * (bombRadius + spikeLength);
    const spikeTipY = y + Math.sin(angle) * (bombRadius + spikeLength);
    
    // Create conical spike shape
    const spikeBaseWidth = bombRadius * 0.15;
    const perpAngle = angle + Math.PI / 2;
    const baseLeftX = spikeBaseX + Math.cos(perpAngle) * spikeBaseWidth;
    const baseLeftY = spikeBaseY + Math.sin(perpAngle) * spikeBaseWidth;
    const baseRightX = spikeBaseX - Math.cos(perpAngle) * spikeBaseWidth;
    const baseRightY = spikeBaseY - Math.sin(perpAngle) * spikeBaseWidth;
    
    // Draw spike with gradient (dark at base, slightly lit at tip from glow)
    const spikeGradient = ctx.createLinearGradient(
      spikeBaseX, spikeBaseY,
      spikeTipX, spikeTipY
    );
    spikeGradient.addColorStop(0, "#1a1a1a");
    spikeGradient.addColorStop(0.7, "#2a2a2a");
    spikeGradient.addColorStop(1, "#4a2a1a"); // Slight reddish tint at tip
    
    ctx.beginPath();
    ctx.moveTo(baseLeftX, baseLeftY);
    ctx.lineTo(spikeTipX, spikeTipY);
    ctx.lineTo(baseRightX, baseRightY);
    ctx.closePath();
    
    ctx.fillStyle = spikeGradient;
    ctx.fill();
    
    // Add subtle edge highlight on spikes
    ctx.strokeStyle = "rgba(100, 50, 0, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();

  // Draw bomb body (dark sphere with intense inner glow)
  // Outer dark shell
  const bombOuterGradient = ctx.createRadialGradient(
    x - bombRadius * 0.2, y - bombRadius * 0.2, 0,
    x, y, bombRadius
  );
  bombOuterGradient.addColorStop(0, "#2a1a1a");
  bombOuterGradient.addColorStop(0.4, "#1a0a0a");
  bombOuterGradient.addColorStop(1, "#0a0000");
  
  ctx.beginPath();
  ctx.fillStyle = bombOuterGradient;
  ctx.arc(x, y, bombRadius, 0, Math.PI * 2);
  ctx.fill();

  // Intense orange-red core glow (strongest at center)
  const coreGlowGradient = ctx.createRadialGradient(
    x, y, 0,
    x, y, bombRadius * 0.8
  );
  coreGlowGradient.addColorStop(0, "rgba(255, 150, 50, 1)");
  coreGlowGradient.addColorStop(0.3, "rgba(255, 100, 0, 0.8)");
  coreGlowGradient.addColorStop(0.6, "rgba(255, 50, 0, 0.4)");
  coreGlowGradient.addColorStop(1, "rgba(255, 0, 0, 0)");
  
  ctx.beginPath();
  ctx.fillStyle = coreGlowGradient;
  ctx.arc(x, y, bombRadius * 0.8, 0, Math.PI * 2);
  ctx.fill();

  // Bright center core
  ctx.beginPath();
  ctx.fillStyle = "rgba(255, 200, 100, 0.9)";
  ctx.arc(x, y, bombRadius * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Add shadow blur effect
  ctx.shadowColor = "rgba(255, 100, 0, 0.8)";
  ctx.shadowBlur = 20;
  
  // Redraw spikes tips with glow illumination
  for (let i = 0; i < spikeCount; i++) {
    const angle = (Math.PI * 2 * i) / spikeCount;
    const spikeTipX = x + Math.cos(angle) * (bombRadius + spikeLength);
    const spikeTipY = y + Math.sin(angle) * (bombRadius + spikeLength);
    
    // Glow on spike tips from the core
    const tipGlow = ctx.createRadialGradient(
      spikeTipX, spikeTipY, 0,
      spikeTipX, spikeTipY, spikeLength * 0.3
    );
    tipGlow.addColorStop(0, "rgba(255, 150, 50, 0.6)");
    tipGlow.addColorStop(1, "rgba(255, 50, 0, 0)");
    
    ctx.beginPath();
    ctx.fillStyle = tipGlow;
    ctx.arc(spikeTipX, spikeTipY, spikeLength * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.shadowBlur = 0;
}

function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

window.addEventListener("load", () => {
  init();
  setTimeout(() => {
    setupCanvas();
    setupGrid();
    render();
  }, 100);
});

window.addEventListener("resize", () => {
  if (canvas && ctx) {
    setupCanvas();
    setupGrid();
    render();
  }
});

// ⚠️ DEVELOPER-ONLY API: Expose math functions for simulation
// DO NOT use this in production UI code
// Note: rollStepSuccess is NOT exposed because it depends on GameState
// Simulations should use getStepProbability() directly for stateless RNG
window.GameMath = {
  getStepProbability,
  getMultiplierForStep,
  CONFIG
};

