const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State
const STATE = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    GAMEOVER: 'GAMEOVER'
};

let currentState = STATE.MENU;
let score = 0;
let health = 3;
let lastTime = 0;
let difficultyTimer = 0;

// Game Config
const CONFIG = {
    poles: [60, 160, 260], // X coordinates of the 3 bamboos
    laneWidth: 30, // Distance from pole center to panda center
    pandaSpeed: 200, // Pixels per second (vertical)
    slideSpeed: 600, // Pixels per second (slide attack)
    slideDuration: 500, // ms
    bugSpawnRate: 2000, // ms initial spawn rate
    bugBaseSpeed: 50, // Pixels per second
};

// Entities
const panda = {
    laneIndex: 2, // 0 to 5. 0=P1-L, 1=P1-R, 2=P2-L, 3=P2-R, 4=P3-L, 5=P3-R
    y: 100, // Y position
    width: 24,
    height: 24,
    isSliding: false,
    slideCooldown: 0,
    color: '#fff',

    // Get logical position
    getPoleIndex() { return Math.floor(this.laneIndex / 2); },
    getSide() { return this.laneIndex % 2 === 0 ? 'left' : 'right'; },

    // Get render X
    getX() {
        const poleX = CONFIG.poles[this.getPoleIndex()];
        return this.getSide() === 'left' ? poleX - CONFIG.laneWidth : poleX + CONFIG.laneWidth;
    }
};

let bugs = [];

// Input State
const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    Action: false // Slide
};

// Event Listeners for Keyboard
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.code) || e.code === 'KeyX' || e.code === 'KeyZ' || e.key === 'Enter') {
        if (e.code === 'KeyX') keys.Action = true;
        if (keys.hasOwnProperty(e.code)) keys[e.code] = true;

        handleGlobalInput(e.code);
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyX') keys.Action = false;
    if (keys.hasOwnProperty(e.code)) keys[e.code] = false;
});

// Touch/Click Listeners for On-Screen Buttons
const setupTouchControls = () => {
    const bindBtn = (selector, code) => {
        const el = document.querySelector(selector);

        const press = (e) => {
            e.preventDefault();
            el.classList.add('active');
            if (code === 'Action') keys.Action = true;
            else if (keys.hasOwnProperty(code)) keys[code] = true;
            else handleGlobalInput(code); // For Enter/Start
        };

        const release = (e) => {
            e.preventDefault();
            el.classList.remove('active');
            if (code === 'Action') keys.Action = false;
            else if (keys.hasOwnProperty(code)) keys[code] = false;
        };

        el.addEventListener('mousedown', press);
        el.addEventListener('touchstart', press);
        el.addEventListener('mouseup', release);
        el.addEventListener('touchend', release);
        el.addEventListener('mouseleave', release);
    };

    bindBtn('.d-pad-up', 'ArrowUp');
    bindBtn('.d-pad-down', 'ArrowDown');
    bindBtn('.d-pad-left', 'ArrowLeft');
    bindBtn('.d-pad-right', 'ArrowRight');
    bindBtn('.button-a', 'Action'); // A is Slide
    bindBtn('.btn-start', 'Enter');
};

function handleGlobalInput(code) {
    if (code === 'Enter') {
        if (currentState === STATE.MENU || currentState === STATE.GAMEOVER) {
            startGame();
        }
    }

    if (currentState === STATE.PLAYING) {
        if (code === 'ArrowLeft') {
            movePandaHorizontal(-1);
        } else if (code === 'ArrowRight') {
            movePandaHorizontal(1);
        } else if (code === 'KeyX' || code === 'Action') {
            startSlide();
        }
    }
}

function movePandaHorizontal(dir) {
    if (panda.isSliding) return; // Cannot switch lanes while sliding

    const newIndex = panda.laneIndex + dir;
    if (newIndex >= 0 && newIndex <= 5) {
        panda.laneIndex = newIndex;
    }
}

function startSlide() {
    if (!panda.isSliding) {
        panda.isSliding = true;
        // Slide logic is handled in update
    }
}

function startGame() {
    currentState = STATE.PLAYING;
    score = 0;
    health = 3;
    bugs = [];
    panda.laneIndex = 2; // Middle Pole Left
    panda.y = 100;
    panda.isSliding = false;

    document.getElementById('start-screen').classList.remove('active');
    document.getElementById('game-over-screen').classList.remove('active');
    updateUI();

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function gameOver() {
    currentState = STATE.GAMEOVER;
    document.getElementById('final-score').innerText = score;
    document.getElementById('game-over-screen').classList.add('active');
}

function spawnBug() {
    const lane = Math.floor(Math.random() * 6);
    const poleIndex = Math.floor(lane / 2);
    const side = lane % 2 === 0 ? 'left' : 'right';
    const poleX = CONFIG.poles[poleIndex];
    const x = side === 'left' ? poleX - CONFIG.laneWidth : poleX + CONFIG.laneWidth;

    bugs.push({
        laneIndex: lane,
        x: x,
        y: canvas.height + 20, // Start below screen
        speed: CONFIG.bugBaseSpeed + (score * 5) + (Math.random() * 20),
        active: true
    });
}

function update(dt) {
    if (currentState !== STATE.PLAYING) return;

    // Spawner
    difficultyTimer += dt;
    let currentSpawnRate = Math.max(500, CONFIG.bugSpawnRate - (score * 50));
    if (Math.random() * 1000 < (dt * 1000 / currentSpawnRate) * 100) { // Rough probabilistic spawner
        // Normalize spawner
    }
    // Simple timer based spawner would be better
    if (Math.random() < dt * (1 + score * 0.1)) {
        // 1 spawn per sec approx at start
        if (bugs.length < 5 + score) spawnBug();
    }

    // Panda Movement (Vertical)
    if (panda.isSliding) {
        panda.y += CONFIG.slideSpeed * dt;
        if (panda.y > canvas.height - 40) {
            panda.y = canvas.height - 40;
            panda.isSliding = false; // Stop sliding at bottom
        }
    } else {
        if (keys.ArrowUp) {
            panda.y -= CONFIG.pandaSpeed * dt;
        }
        if (keys.ArrowDown) {
            panda.y += CONFIG.pandaSpeed * dt;
        }
        // Clamp Panda Y
        if (panda.y < 40) panda.y = 40;
        if (panda.y > canvas.height - 40) panda.y = canvas.height - 40;
    }

    // Update Bugs
    for (let i = bugs.length - 1; i >= 0; i--) {
        let b = bugs[i];
        b.y -= b.speed * dt;

        // Collision Logic
        // Check if on same lane
        if (b.active && b.laneIndex === panda.laneIndex) {
            // Simple 1D collision since X is aligned
            const distY = Math.abs(b.y - panda.y);
            if (distY < 30) { // Hit
                if (panda.isSliding) {
                    // Attack Success!
                    b.active = false;
                    score++;
                    bugs.splice(i, 1);
                    continue;
                } else {
                    // Ouch
                    b.active = false;
                    health--;
                    bugs.splice(i, 1);
                    // Knockback or invuln?
                    if (health <= 0) {
                        gameOver();
                    }
                    continue;
                }
            }
        }

        // Remove if off screen top
        if (b.y < -20) {
            bugs.splice(i, 1);
        }
    }

    updateUI();
}

function updateUI() {
    document.getElementById('score-display').innerText = `SCORE: ${score}`;
    let hearts = '';
    for (let i = 0; i < 3; i++) hearts += i < health ? '♥' : '♡';
    document.getElementById('health-display').innerText = hearts;
}

function draw() {
    // Clear with Sky Gradient
    let skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGrad.addColorStop(0, '#4aa3df');
    skyGrad.addColorStop(1, '#87CEEB');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Background Scene (Bamboo Forest Depth)
    // Distant background bamboo
    ctx.fillStyle = 'rgba(50, 90, 50, 0.4)';
    for (let i = 0; i < 15; i++) {
        let bx = i * 30 + 10;
        let w = 8 + Math.random() * 6;
        ctx.fillRect(bx, 0, w, canvas.height);
    }

    // Draw Ground
    ctx.fillStyle = '#2d4a2d';
    ctx.fillRect(0, canvas.height - 20, canvas.width, 20);

    // Draw Main Bamboo Poles (Interactive)
    CONFIG.poles.forEach(px => {
        // 3D Gradient for Pole
        let grd = ctx.createLinearGradient(px - 12, 0, px + 12, 0);
        grd.addColorStop(0, '#1a3315');
        grd.addColorStop(0.2, '#38662f');
        grd.addColorStop(0.5, '#5c9e50'); // Highlight
        grd.addColorStop(0.8, '#38662f');
        grd.addColorStop(1, '#1a3315');

        ctx.fillStyle = grd;
        ctx.fillRect(px - 12, 0, 24, canvas.height);

        // Segments (Knots)
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        for (let y = 20; y < canvas.height; y += 60) {
            ctx.fillRect(px - 12, y, 24, 2);
            // Highlight below knot
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(px - 12, y + 2, 24, 1);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
        }
    });

    // Draw Bugs
    bugs.forEach(b => {
        if (!b.active) return;
        drawBug(b.x, b.y);
    });

    // Draw Panda
    drawPanda(panda.getX(), panda.y, panda.getSide(), panda.isSliding);
}

function drawBug(x, y) {
    ctx.save();
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#ff0000';
    ctx.fillStyle = '#8B0000'; // Dark Red Bug
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Legs
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 5); ctx.lineTo(x + 12, y - 5);
    ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y);
    ctx.moveTo(x - 12, y + 5); ctx.lineTo(x + 12, y + 5);
    ctx.stroke();
}

function drawPanda(x, y, side, isAttacking) {
    ctx.save();
    ctx.translate(x, y);
    if (side === 'left') ctx.scale(-1, 1); // Flip if on left

    // Values relative to center (x,y)

    // Body
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'white';
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(6, 0, 14, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; // Reset
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Arms/Legs (Black) holding bamboo
    ctx.fillStyle = '#000';

    // Arm (wrapping around pole which is at local x -16 approx if right side)
    // Actually we are shifting rendering.
    // Let's just draw simple sprite

    // Ears
    ctx.beginPath();
    ctx.arc(0, -18, 5, 0, Math.PI * 2); // Left ear (relative)
    ctx.arc(14, -16, 5, 0, Math.PI * 2); // Right ear
    ctx.fill();

    // Eye Patches
    ctx.beginPath();
    ctx.ellipse(4, -6, 4, 3, Math.PI / 4, 0, Math.PI * 2);
    ctx.ellipse(12, -6, 4, 3, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(4, -6, 1.5, 0, Math.PI * 2);
    ctx.arc(12, -6, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Limbs
    ctx.fillStyle = '#000';
    // Arm
    ctx.beginPath();
    ctx.ellipse(-6, -2, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Leg
    ctx.beginPath();
    ctx.ellipse(-6, 12, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Attack Effect
    if (isAttacking) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, -25);
        ctx.lineTo(-10, -40);
        ctx.moveTo(0, -25);
        ctx.lineTo(0, -45);
        ctx.moveTo(10, -25);
        ctx.lineTo(10, -40);
        ctx.stroke();
    }

    ctx.restore();
}

function gameLoop(timestamp) {
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    update(dt);
    draw();

    requestAnimationFrame(gameLoop);
}

// Init
setupTouchControls();
updateUI();

// Start loop for menu rendering (if we want animated menu, but currently static overlay)
// We will run loop anyway to draw background
requestAnimationFrame(gameLoop);
