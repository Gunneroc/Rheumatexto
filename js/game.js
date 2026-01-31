// ==================== WORD DATA ====================
let targetWords = [];
let wordRankings = {};
let commonWords = [];

// ==================== GAME STATE ====================
let gameState = {
    targetWord: '',
    targetIndex: 0,
    guesses: [],
    bestRank: Infinity,
    gameOver: false,
    gameWon: false,
    hardMode: false,
    hintsUsed: 0,
    maxHints: 3
};

let stats = {
    played: 0,
    won: 0,
    totalGuesses: 0,
    bestWin: Infinity,
    currentStreak: 0,
    maxStreak: 0
};

// ==================== LOAD WORD DATA ====================
async function loadWordData() {
    try {
        const response = await fetch('data/words.json');
        const data = await response.json();
        targetWords = data.targetWords;
        wordRankings = data.wordRankings;
        commonWords = data.commonWords;
        return true;
    } catch (error) {
        console.error('Failed to load word data:', error);
        return false;
    }
}

// ==================== AUTOCORRECT ====================
// Normalize words to handle plurals and common variations
function normalizeWord(word) {
    const originalWord = word.toLowerCase().trim();

    // Check if the exact word exists first
    const rankings = wordRankings[gameState.targetWord];
    if (rankings && rankings[originalWord] !== undefined) {
        return { normalized: originalWord, wasAutocorrected: false };
    }

    // Check all target word rankings for the exact word
    for (const target of targetWords) {
        if (wordRankings[target][originalWord] !== undefined) {
            return { normalized: originalWord, wasAutocorrected: false };
        }
    }

    // Try to find the base form
    let candidates = [];

    // Remove common plural endings
    if (originalWord.endsWith('ies') && originalWord.length > 3) {
        candidates.push(originalWord.slice(0, -3) + 'y'); // candies -> candy
    }
    if (originalWord.endsWith('es') && originalWord.length > 2) {
        candidates.push(originalWord.slice(0, -2)); // boxes -> box
        candidates.push(originalWord.slice(0, -1)); // cases -> case
    }
    if (originalWord.endsWith('s') && originalWord.length > 1) {
        candidates.push(originalWord.slice(0, -1)); // joints -> joint
    }

    // Remove common verb endings
    if (originalWord.endsWith('ing') && originalWord.length > 4) {
        candidates.push(originalWord.slice(0, -3)); // charting -> chart (but we have charting)
        candidates.push(originalWord.slice(0, -3) + 'e'); // typing -> type
    }
    if (originalWord.endsWith('ed') && originalWord.length > 3) {
        candidates.push(originalWord.slice(0, -2)); // inflamed -> inflam (not useful)
        candidates.push(originalWord.slice(0, -1)); // tired is base form
        candidates.push(originalWord.slice(0, -2) + 'e'); // diagnosed -> diagnose
    }

    // Handle -tion -> -te variations
    if (originalWord.endsWith('tion') && originalWord.length > 4) {
        candidates.push(originalWord.slice(0, -4) + 'te'); // inflammation stays, but inflame
    }

    // Common misspellings/variations
    const commonVariations = {
        'joints': 'joint',
        'bones': 'bone',
        'tendons': 'tendon',
        'steroids': 'steroid',
        'antibodies': 'antibody',
        'biopsies': 'biopsy',
        'diagnoses': 'diagnosis',
        'infusions': 'infusion',
        'clinics': 'clinic',
        'pagers': 'pager',
        'coffees': 'coffee',
        'flares': 'flare',
        'rashes': 'rash',
        'ulcers': 'ulcer',
        'symptoms': 'symptom',
        'treatments': 'treatment',
        'medications': 'medication',
        'injections': 'injection',
        'patients': 'patient',
        'doctors': 'doctor',
        'hospitals': 'hospital',
        'diseases': 'disease',
        'conditions': 'condition',
        'autoimmunity': 'autoimmune',
        'inflammatory': 'inflammation',
        'arthritic': 'arthritis',
        'inflamed': 'inflammation',
        'swells': 'swollen',
        'swell': 'swollen',
        'swelling': 'swollen',
        'fatigued': 'fatigue',
        'tiredness': 'tired',
        'exhausted': 'tired',
        'sleepy': 'tired',
        'diagnosed': 'diagnosis',
        'diagnosing': 'diagnosis',
        'treating': 'treatment',
        'treated': 'treatment'
    };

    if (commonVariations[originalWord]) {
        candidates.unshift(commonVariations[originalWord]); // Prioritize known variations
    }

    // Check each candidate
    for (const candidate of candidates) {
        // Check current target word rankings
        if (rankings && rankings[candidate] !== undefined) {
            return { normalized: candidate, wasAutocorrected: true, original: originalWord };
        }

        // Check all target word rankings
        for (const target of targetWords) {
            if (wordRankings[target][candidate] !== undefined) {
                return { normalized: candidate, wasAutocorrected: true, original: originalWord };
            }
        }
    }

    // Check if it's in common words
    if (commonWords.includes(originalWord)) {
        return { normalized: originalWord, wasAutocorrected: false };
    }

    // Check candidates against common words
    for (const candidate of candidates) {
        if (commonWords.includes(candidate)) {
            return { normalized: candidate, wasAutocorrected: true, original: originalWord };
        }
    }

    // No match found
    return { normalized: originalWord, wasAutocorrected: false };
}

// ==================== INITIALIZATION ====================
async function init() {
    const loaded = await loadWordData();
    if (!loaded) {
        document.getElementById('errorMsg').textContent = 'Failed to load game data. Please refresh the page.';
        return;
    }
    loadStats();
    loadSettings();
    startNewGame();
    setupEventListeners();
}

function startNewGame() {
    // Pick random target word
    gameState.targetIndex = Math.floor(Math.random() * targetWords.length);
    gameState.targetWord = targetWords[gameState.targetIndex];
    gameState.guesses = [];
    gameState.bestRank = Infinity;
    gameState.gameOver = false;
    gameState.gameWon = false;
    gameState.hintsUsed = 0;

    // Reset UI
    document.getElementById('historyList').innerHTML = '';
    document.getElementById('guessCount').textContent = 'Guesses: 0';
    document.getElementById('bestRank').textContent = 'Best: -';
    document.getElementById('meterValue').textContent = '-';
    document.getElementById('meterHint').textContent = 'Enter a word to begin';
    document.getElementById('meterIndicator').classList.remove('active');
    document.getElementById('guessInput').value = '';
    document.getElementById('guessInput').disabled = false;
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('giveUpBtn').style.display = 'inline-block';
    document.getElementById('errorMsg').textContent = '';
    document.getElementById('autocorrectMsg').textContent = '';

    // Reset hint UI
    document.getElementById('hintBtn').disabled = false;
    document.getElementById('hintBtn').style.display = 'inline-block';
    updateHintCount();

    // Reset joint diagram
    updateJointDiagram(Infinity);

    // Close any open modals
    closeAllModals();
}

function loadStats() {
    const saved = localStorage.getItem('rheumatexto_stats');
    if (saved) {
        stats = JSON.parse(saved);
    }
    updateStatsDisplay();
}

function saveStats() {
    localStorage.setItem('rheumatexto_stats', JSON.stringify(stats));
    updateStatsDisplay();
}

function loadSettings() {
    const lightMode = localStorage.getItem('rheumatexto_lightMode') === 'true';
    const hardMode = localStorage.getItem('rheumatexto_hardMode') === 'true';

    document.getElementById('lightModeToggle').checked = lightMode;
    document.getElementById('hardModeToggle').checked = hardMode;

    if (lightMode) {
        document.body.classList.add('light-mode');
    }
    gameState.hardMode = hardMode;
}

function saveSettings() {
    localStorage.setItem('rheumatexto_lightMode', document.getElementById('lightModeToggle').checked);
    localStorage.setItem('rheumatexto_hardMode', document.getElementById('hardModeToggle').checked);
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Submit guess
    document.getElementById('submitBtn').addEventListener('click', submitGuess);
    document.getElementById('guessInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitGuess();
    });

    // Modal buttons
    document.getElementById('helpBtn').addEventListener('click', () => openModal('helpModal'));
    document.getElementById('statsBtn').addEventListener('click', () => openModal('statsModal'));
    document.getElementById('settingsBtn').addEventListener('click', () => openModal('settingsModal'));

    // Settings toggles
    document.getElementById('lightModeToggle').addEventListener('change', (e) => {
        document.body.classList.toggle('light-mode', e.target.checked);
        saveSettings();
    });
    document.getElementById('hardModeToggle').addEventListener('change', (e) => {
        gameState.hardMode = e.target.checked;
        saveSettings();
    });

    // Give up
    document.getElementById('giveUpBtn').addEventListener('click', giveUp);

    // Hint button
    document.getElementById('hintBtn').addEventListener('click', useHint);

    // New game buttons
    document.getElementById('newGameBtn').addEventListener('click', () => {
        closeModal('winModal');
        startNewGame();
    });
    document.getElementById('newGameAfterGiveUp').addEventListener('click', () => {
        closeModal('giveUpModal');
        startNewGame();
    });

    // Share button
    document.getElementById('shareBtn').addEventListener('click', shareResult);

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });
}

// ==================== GAME LOGIC ====================
function submitGuess() {
    if (gameState.gameOver) return;

    const input = document.getElementById('guessInput');
    const rawGuess = input.value.trim().toLowerCase();

    if (!rawGuess) return;

    // Apply autocorrect
    const { normalized: guess, wasAutocorrected, original } = normalizeWord(rawGuess);

    // Check if already guessed (check both original and normalized)
    if (gameState.guesses.find(g => g.word === guess || g.word === rawGuess)) {
        showError('Already guessed!');
        showAutocorrect('');
        input.value = '';
        return;
    }

    // Get rank for this guess
    const rank = getWordRank(guess);

    if (rank === -1) {
        showError('Word not recognized');
        showAutocorrect('');
        return;
    }

    // Clear error and input
    showError('');
    input.value = '';

    // Show autocorrect message if applicable
    if (wasAutocorrected) {
        showAutocorrect(`"${original}" → "${guess}"`);
    } else {
        showAutocorrect('');
    }

    // Add guess
    const guessData = { word: guess, rank: rank };
    gameState.guesses.push(guessData);

    // Check if new best
    const isNewBest = rank < gameState.bestRank;
    if (isNewBest) {
        gameState.bestRank = rank;
    }

    // Update UI
    updateGuessDisplay(guessData, isNewBest);
    updateMeter(rank);
    updateJointDiagram(rank);
    updateGuessCount();

    // Check for win
    if (rank === 1) {
        handleWin();
    }
}

function getWordRank(word) {
    const rankings = wordRankings[gameState.targetWord];

    if (rankings[word] !== undefined) {
        return rankings[word];
    }

    // Check if it's a common word (give it a high rank)
    if (commonWords.includes(word)) {
        return 1500 + Math.floor(Math.random() * 500);
    }

    // Check if it's in any other target word's rankings
    for (const target of targetWords) {
        if (wordRankings[target][word] !== undefined) {
            // Give it a modified rank based on semantic distance
            return Math.min(2000, wordRankings[target][word] + 500);
        }
    }

    return -1; // Word not recognized
}

function updateGuessDisplay(guessData, isNewBest) {
    const historyList = document.getElementById('historyList');

    // Create new item
    const item = document.createElement('li');
    item.className = `history-item ${getRankClass(guessData.rank)}`;
    if (isNewBest && gameState.guesses.length > 1) {
        item.classList.add('new-best');
    }
    const hintClass = guessData.isHint ? 'hint-word' : '';
    item.innerHTML = `
        <span class="history-word ${hintClass}">${guessData.word}</span>
        <span class="history-rank">${guessData.rank}</span>
    `;

    // Sort guesses by rank
    const sortedGuesses = [...gameState.guesses].sort((a, b) => a.rank - b.rank);

    // Find position
    const position = sortedGuesses.findIndex(g => g.word === guessData.word);

    // Insert at correct position
    const existingItems = historyList.querySelectorAll('.history-item');
    if (position >= existingItems.length) {
        historyList.appendChild(item);
    } else {
        historyList.insertBefore(item, existingItems[position]);
    }

    // Update best rank display
    document.getElementById('bestRank').textContent = `Best: ${gameState.bestRank}`;
}

function getRankClass(rank) {
    if (rank <= 10) return 'rank-hot';
    if (rank <= 100) return 'rank-warm';
    if (rank <= 500) return 'rank-mild';
    if (rank <= 1000) return 'rank-cool';
    return 'rank-cold';
}

function updateMeter(rank) {
    const indicator = document.getElementById('meterIndicator');
    const valueEl = document.getElementById('meterValue');
    const hintEl = document.getElementById('meterHint');

    // Calculate position (inverse - lower rank = higher position)
    const maxRank = 2000;
    const position = Math.max(0, Math.min(100, (1 - rank / maxRank) * 100));

    indicator.style.left = `${position}%`;
    indicator.classList.add('active');

    // Update value with color
    valueEl.textContent = rank;
    valueEl.style.color = getRankColor(rank);

    // Update hint (unless hard mode)
    if (!gameState.hardMode) {
        hintEl.textContent = getHint(rank);
    } else {
        hintEl.textContent = '';
    }
}

function getRankColor(rank) {
    if (rank <= 10) return 'var(--accent-red)';
    if (rank <= 100) return 'var(--accent-orange)';
    if (rank <= 500) return 'var(--accent-yellow)';
    if (rank <= 1000) return 'var(--accent-blue)';
    return 'var(--accent-cold)';
}

function getHint(rank) {
    if (rank === 1) return '🎉 DIAGNOSIS COMPLETE!';
    if (rank <= 5) return '🔥 ON FIRE! Almost there!';
    if (rank <= 10) return '🔥 Flaring! So close!';
    if (rank <= 20) return '😰 You\'re close! Keep going!';
    if (rank <= 50) return '🌡️ Getting warmer!';
    if (rank <= 100) return '👀 Interesting... think related!';
    if (rank <= 300) return '🤔 Lukewarm... try another angle';
    if (rank <= 500) return '😐 Meh... keep thinking';
    if (rank <= 1000) return '❄️ Getting cold...';
    return '🥶 Ice cold! Try something medical';
}

function updateJointDiagram(rank) {
    const joint = document.getElementById('jointDiagram');
    joint.classList.remove('inflamed-1', 'inflamed-2', 'inflamed-3', 'inflamed-4');

    if (rank <= 10) {
        joint.classList.add('inflamed-1');
    } else if (rank <= 100) {
        joint.classList.add('inflamed-2');
    } else if (rank <= 500) {
        joint.classList.add('inflamed-3');
    } else if (rank <= 1000) {
        joint.classList.add('inflamed-4');
    }
}

function updateGuessCount() {
    document.getElementById('guessCount').textContent = `Guesses: ${gameState.guesses.length}`;
}

function showError(msg) {
    document.getElementById('errorMsg').textContent = msg;
}

function showAutocorrect(msg) {
    document.getElementById('autocorrectMsg').textContent = msg;
}

// ==================== HINT SYSTEM ====================
function getHintWord() {
    if (gameState.hintsUsed >= gameState.maxHints) return null;
    if (gameState.gameOver) return null;

    const rankings = wordRankings[gameState.targetWord];
    const guessedWords = new Set(gameState.guesses.map(g => g.word));

    // Get all words sorted by rank
    const sortedWords = Object.entries(rankings)
        .filter(([word, rank]) => !guessedWords.has(word) && word !== gameState.targetWord)
        .sort((a, b) => a[1] - b[1]);

    if (sortedWords.length === 0) return null;

    // Strategy: Give a word that's roughly halfway between current best and the answer
    // Or if no guesses yet, give something around rank 50-100
    let targetRank;

    if (gameState.bestRank === Infinity) {
        // No guesses yet - give a word around rank 50-100
        targetRank = 50 + Math.floor(Math.random() * 50);
    } else if (gameState.bestRank <= 10) {
        // Very close - give something just a bit closer (rank 2-5)
        targetRank = 2 + Math.floor(Math.random() * 4);
    } else if (gameState.bestRank <= 50) {
        // Close - give something halfway
        targetRank = Math.floor(gameState.bestRank / 2);
    } else {
        // Far away - give something roughly halfway to the answer
        targetRank = Math.floor(gameState.bestRank / 2);
    }

    // Find the word closest to our target rank
    let bestWord = null;
    let bestDiff = Infinity;

    for (const [word, rank] of sortedWords) {
        const diff = Math.abs(rank - targetRank);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestWord = { word, rank };
        }
    }

    return bestWord;
}

function useHint() {
    if (gameState.gameOver) return;
    if (gameState.hintsUsed >= gameState.maxHints) {
        showError('No hints remaining!');
        return;
    }

    const hintWord = getHintWord();
    if (!hintWord) {
        showError('No hint available');
        return;
    }

    gameState.hintsUsed++;
    updateHintCount();

    // Add the hint word as a guess (marked as hint)
    const guessData = { word: hintWord.word, rank: hintWord.rank, isHint: true };
    gameState.guesses.push(guessData);

    // Check if new best
    const isNewBest = hintWord.rank < gameState.bestRank;
    if (isNewBest) {
        gameState.bestRank = hintWord.rank;
    }

    // Update UI
    showError('');
    showAutocorrect(`💡 Hint: "${hintWord.word.toUpperCase()}"`);
    updateGuessDisplay(guessData, isNewBest);
    updateMeter(hintWord.rank);
    updateJointDiagram(hintWord.rank);
    updateGuessCount();

    // Check for win (unlikely but possible)
    if (hintWord.rank === 1) {
        handleWin();
    }

    // Disable hint button if no hints left
    if (gameState.hintsUsed >= gameState.maxHints) {
        document.getElementById('hintBtn').disabled = true;
    }
}

function updateHintCount() {
    const remaining = gameState.maxHints - gameState.hintsUsed;
    document.getElementById('hintCount').textContent = `Hints used: ${gameState.hintsUsed}/${gameState.maxHints}`;
}

// ==================== WIN/LOSE ====================
function handleWin() {
    gameState.gameOver = true;
    gameState.gameWon = true;

    // Update stats
    stats.played++;
    stats.won++;
    stats.totalGuesses += gameState.guesses.length;
    if (gameState.guesses.length < stats.bestWin) {
        stats.bestWin = gameState.guesses.length;
    }
    stats.currentStreak++;
    if (stats.currentStreak > stats.maxStreak) {
        stats.maxStreak = stats.currentStreak;
    }
    saveStats();

    // Disable input
    document.getElementById('guessInput').disabled = true;
    document.getElementById('submitBtn').disabled = true;
    document.getElementById('giveUpBtn').style.display = 'none';
    document.getElementById('hintBtn').style.display = 'none';

    // Show confetti
    createConfetti();

    // Show win modal after delay
    setTimeout(() => {
        document.getElementById('winWord').textContent = gameState.targetWord.toUpperCase();
        document.getElementById('winGuesses').textContent = gameState.guesses.length;
        createGuessVisualization();
        openModal('winModal');
    }, 1000);
}

function giveUp() {
    gameState.gameOver = true;
    gameState.gameWon = false;

    // Update stats
    stats.played++;
    stats.currentStreak = 0;
    saveStats();

    // Disable input
    document.getElementById('guessInput').disabled = true;
    document.getElementById('submitBtn').disabled = true;
    document.getElementById('giveUpBtn').style.display = 'none';
    document.getElementById('hintBtn').style.display = 'none';

    // Show reveal modal
    document.getElementById('revealWord').textContent = gameState.targetWord.toUpperCase();
    openModal('giveUpModal');
}

function createConfetti() {
    const colors = ['#e94560', '#ff6b35', '#f0c808', '#4da8da', '#7ec8e3', '#4caf50'];

    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = `${Math.random() * 100}vw`;
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDuration = `${2 + Math.random() * 2}s`;
            document.body.appendChild(confetti);

            setTimeout(() => confetti.remove(), 4000);
        }, i * 50);
    }
}

function createGuessVisualization() {
    const container = document.getElementById('guessVisualization');
    container.innerHTML = '';

    // Show last 20 guesses or all if fewer
    const recentGuesses = gameState.guesses.slice(-20);

    recentGuesses.forEach(guess => {
        const block = document.createElement('div');
        block.className = 'guess-block';

        if (guess.rank <= 10) {
            block.style.backgroundColor = 'var(--accent-red)';
        } else if (guess.rank <= 100) {
            block.style.backgroundColor = 'var(--accent-orange)';
        } else if (guess.rank <= 500) {
            block.style.backgroundColor = 'var(--accent-yellow)';
        } else if (guess.rank <= 1000) {
            block.style.backgroundColor = 'var(--accent-blue)';
        } else {
            block.style.backgroundColor = 'var(--accent-cold)';
        }

        container.appendChild(block);
    });
}

function shareResult() {
    const guessBlocks = gameState.guesses.slice(-10).map(g => {
        if (g.rank <= 10) return '🟥';
        if (g.rank <= 100) return '🟧';
        if (g.rank <= 500) return '🟨';
        if (g.rank <= 1000) return '🟦';
        return '⬜';
    }).join('');

    const text = `Rheumatexto 🔬
Found: ${gameState.targetWord.toUpperCase()}
Guesses: ${gameState.guesses.length}
${guessBlocks}

Play at: https://gunneroc.github.io/Rheumatexto/`;

    if (navigator.share) {
        navigator.share({ text });
    } else {
        navigator.clipboard.writeText(text).then(() => {
            alert('Result copied to clipboard!');
        });
    }
}

// ==================== STATS ====================
function updateStatsDisplay() {
    document.getElementById('statPlayed').textContent = stats.played;
    document.getElementById('statWon').textContent = stats.won;
    document.getElementById('statAvg').textContent = stats.won > 0
        ? Math.round(stats.totalGuesses / stats.won)
        : '-';
    document.getElementById('statBest').textContent = stats.bestWin === Infinity
        ? '-'
        : stats.bestWin;
    document.getElementById('statStreak').textContent = stats.currentStreak;
    document.getElementById('statMaxStreak').textContent = stats.maxStreak;
}

// ==================== MODALS ====================
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

// Global close function for onclick handlers
window.closeModal = closeModal;

// ==================== START ====================
init();
