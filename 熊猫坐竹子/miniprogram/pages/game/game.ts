// pages/game/game.ts

interface Bug {
    laneIndex: number;
    y: number;
    speed: number;
    active: boolean;
}

Page({
    data: {
        gameState: 'MENU',
        score: 0,
        health: 3,
        healthDisplay: '♥♥♥',
    },

    canvas: null as any,
    ctx: null as any,
    animationFrame: 0,
    dpr: 1,

    CONFIG: {
        polesX: [80, 220, 360],
        pandaOffset: 30,
        LOGICAL_WIDTH: 440,
        LOGICAL_HEIGHT: 380,
    },

    state: {
        panda: {
            laneIndex: 2,
            y: 100,
            isSliding: false,
        },
        bugs: [] as Bug[],
        lastTime: 0,
    },

    onReady() {
        console.log('=== onReady ===');
        setTimeout(() => {
            this.initCanvas();
        }, 100); // 延迟一点，确保 DOM 渲染完成
    },

    onUnload() {
        if (this.animationFrame && this.canvas) {
            this.canvas.cancelAnimationFrame(this.animationFrame);
        }
    },

    async initCanvas() {
        console.log('=== initCanvas ===');

        const query = wx.createSelectorQuery().in(this);
        query.select('#gameCanvas')
            .fields({ node: true, size: true })
            .exec((res) => {
                console.log('Canvas query result:', res);

                if (!res || !res[0] || !res[0].node) {
                    console.error('Canvas not found!');
                    wx.showToast({ title: 'Canvas初始化失败', icon: 'none' });
                    return;
                }

                const canvas = res[0].node;
                const cssWidth = res[0].width;
                const cssHeight = res[0].height;

                console.log(`Canvas size: ${cssWidth}x${cssHeight}`);

                this.dpr = wx.getSystemInfoSync().pixelRatio;
                console.log('DPR:', this.dpr);

                // 设置物理像素大小
                canvas.width = cssWidth * this.dpr;
                canvas.height = cssHeight * this.dpr;

                const ctx = canvas.getContext('2d');

                // 缩放上下文以匹配 DPR
                ctx.scale(this.dpr, this.dpr);

                this.ctx = ctx;
                this.canvas = canvas;

                console.log('Canvas initialized!');

                // 立即绘制一帧，确保屏幕有内容
                this.draw();

                // 启动游戏循环
                this.state.lastTime = Date.now();
                this.gameLoop();

                wx.showToast({ title: 'Canvas已初始化', icon: 'success', duration: 1000 });
            });
    },

    handleInput(e: any) {
        const key = e.currentTarget.dataset.key;
        console.log('Button pressed:', key);

        if (this.data.gameState === 'MENU' || this.data.gameState === 'GAMEOVER') {
            if (key === 'start') {
                this.startGame();
            }
            return;
        }

        if (this.data.gameState === 'PLAYING') {
            if (key === 'left') {
                this.movePanda(-1);
            } else if (key === 'right') {
                this.movePanda(1);
            } else if (key === 'up') {
                this.movePandaY(-1);
            } else if (key === 'down') {
                this.movePandaY(1);
            } else if (key === 'a') {
                this.slideAttack();
            }
        }
    },

    movePanda(dir: number) {
        if (this.state.panda.isSliding) return;

        const newIndex = this.state.panda.laneIndex + dir;
        if (newIndex >= 0 && newIndex <= 5) {
            this.state.panda.laneIndex = newIndex;
        }
    },

    movePandaY(dir: number) {
        if (this.state.panda.isSliding) return;
        const speed = 15;
        this.state.panda.y += dir * speed;
        if (this.state.panda.y < 30) this.state.panda.y = 30;
        if (this.state.panda.y > 330) this.state.panda.y = 330;
    },

    slideAttack() {
        if (!this.state.panda.isSliding) {
            this.state.panda.isSliding = true;
        }
    },

    startGame() {
        console.log('Game started!');
        this.setData({
            gameState: 'PLAYING',
            score: 0,
            health: 3,
            healthDisplay: '♥♥♥'
        });

        this.state.panda = { laneIndex: 2, y: 50, isSliding: false };
        this.state.bugs = [];
    },

    gameOver() {
        this.setData({ gameState: 'GAMEOVER' });
    },

    gameLoop() {
        if (!this.ctx || !this.canvas) return;

        const now = Date.now();
        const dt = (now - this.state.lastTime) / 1000;
        this.state.lastTime = now;

        if (this.data.gameState === 'PLAYING') {
            this.update(dt);
        }

        this.draw();

        this.animationFrame = this.canvas.requestAnimationFrame(() => this.gameLoop());
    },

    update(dt: number) {
        // 生成虫子
        if (Math.random() < 0.015 + (this.data.score * 0.001)) {
            if (this.state.bugs.length < 5 + Math.floor(this.data.score / 5)) {
                const lane = Math.floor(Math.random() * 6);
                this.state.bugs.push({
                    laneIndex: lane,
                    y: this.CONFIG.LOGICAL_HEIGHT + 20,
                    speed: 40 + (this.data.score * 3) + Math.random() * 20,
                    active: true
                });
            }
        }

        // 熊猫下滑
        if (this.state.panda.isSliding) {
            this.state.panda.y += 350 * dt;
            if (this.state.panda.y > this.CONFIG.LOGICAL_HEIGHT - 30) {
                this.state.panda.y = this.CONFIG.LOGICAL_HEIGHT - 30;
                this.state.panda.isSliding = false;
            }
        }

        // 更新虫子
        for (let i = this.state.bugs.length - 1; i >= 0; i--) {
            let bug = this.state.bugs[i];
            bug.y -= bug.speed * dt;

            // 碰撞检测
            if (bug.active && bug.laneIndex === this.state.panda.laneIndex) {
                if (Math.abs(bug.y - this.state.panda.y) < 25) {
                    if (this.state.panda.isSliding) {
                        bug.active = false;
                        this.state.bugs.splice(i, 1);
                        this.setData({ score: this.data.score + 1 });
                        continue;
                    } else {
                        bug.active = false;
                        this.state.bugs.splice(i, 1);
                        this.takeDamage();
                        continue;
                    }
                }
            }

            if (bug.y < -20) {
                this.state.bugs.splice(i, 1);
            }
        }
    },

    takeDamage() {
        let hp = this.data.health - 1;
        let display = '';
        for (let i = 0; i < 3; i++) display += (i < hp ? '♥' : '♡');

        this.setData({ health: hp, healthDisplay: display });
        if (hp <= 0) {
            this.gameOver();
        }
    },

    draw() {
        if (!this.ctx) {
            console.error('ctx is null in draw()');
            return;
        }

        const ctx = this.ctx;
        const W = this.CONFIG.LOGICAL_WIDTH;
        const H = this.CONFIG.LOGICAL_HEIGHT;

        // 天空背景
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(0, 0, W, H);

        // 地面
        ctx.fillStyle = '#2d4a2d';
        ctx.fillRect(0, H - 20, W, 20);

        // 绘制竹子
        this.CONFIG.polesX.forEach(x => {
            const grad = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
            grad.addColorStop(0, '#2d5a27');
            grad.addColorStop(0.5, '#66cc44');
            grad.addColorStop(1, '#2d5a27');
            ctx.fillStyle = grad;
            ctx.fillRect(x - 10, 0, 20, H);

            // 竹节
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            for (let y = 20; y < H; y += 60) {
                ctx.fillRect(x - 10, y, 20, 2);
            }
        });

        // 绘制熊猫
        const p = this.state.panda;
        const poleIndex = Math.floor(p.laneIndex / 2);
        const isLeft = p.laneIndex % 2 === 0;
        const poleX = this.CONFIG.polesX[poleIndex];
        const px = isLeft ? poleX - this.CONFIG.pandaOffset : poleX + this.CONFIG.pandaOffset;

        ctx.save();
        ctx.translate(px, p.y);
        if (isLeft) ctx.scale(-1, 1);

        // 熊猫身体
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();

        // 黑色部分（耳朵、四肢）
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-8, -5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(5, -10, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-5, -10, 3, 0, Math.PI * 2);
        ctx.fill();

        // 下滑特效
        if (p.isSliding) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -15);
            ctx.lineTo(0, -25);
            ctx.stroke();
        }

        ctx.restore();

        // 绘制虫子
        this.state.bugs.forEach(b => {
            if (!b.active) return;
            const bPoleIndex = Math.floor(b.laneIndex / 2);
            const bIsLeft = b.laneIndex % 2 === 0;
            const bPoleX = this.CONFIG.polesX[bPoleIndex];
            const bx = bIsLeft ? bPoleX - this.CONFIG.pandaOffset : bPoleX + this.CONFIG.pandaOffset;

            ctx.fillStyle = '#8B0000';
            ctx.beginPath();
            ctx.arc(bx, b.y, 6, 0, Math.PI * 2);
            ctx.fill();

            // 虫子腿
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx - 8, b.y - 4);
            ctx.lineTo(bx + 8, b.y - 4);
            ctx.moveTo(bx - 8, b.y);
            ctx.lineTo(bx + 8, b.y);
            ctx.moveTo(bx - 8, b.y + 4);
            ctx.lineTo(bx + 8, b.y + 4);
            ctx.stroke();
        });
    }
});
