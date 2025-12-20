// pages/game/game.js

Page({
  data: {
    gameState: 'MENU',
    score: 0,
    health: 3,
    healthDisplay: '♥♥♥',
  },

  canvas: null,
  ctx: null,
  animationFrame: 0,
  dpr: 1,

  /* ========================================
     游戏配置 - 逻辑坐标系和元素位置
     ⚠️ 重要：修改 WXSS 中的 .lcd-display 尺寸后，必须同步修改这里的 LOGICAL_WIDTH 和 LOGICAL_HEIGHT
     ======================================== */
  CONFIG: {
    /* 竹子的 X 坐标位置（3根竹子）
       - 这些值基于 LOGICAL_WIDTH
       - 建议均匀分布：[宽度*0.18, 宽度*0.5, 宽度*0.82] */
    polesX: [85, 230, 375],

    /* 熊猫距离竹子中心的偏移距离
       - 控制熊猫抱竹子时离竹子有多远 */
    pandaOffset: 30,

    /* 逻辑画布宽度 - 必须与 WXSS 中 .lcd-display 的 width 一致！
       当前值：460rpx */
    LOGICAL_WIDTH: 460,

    /* 逻辑画布高度 - 必须与 WXSS 中 .lcd-display 的 height 一致！
       当前值：400rpx */
    LOGICAL_HEIGHT: 400,
  },

  state: {
    panda: {
      laneIndex: 2,
      y: 100,
      isSliding: false,
    },
    bugs: [],
    lastTime: 0,
  },

  onReady() {
    console.log('=== onReady ===');
    setTimeout(() => {
      this.initCanvas();
    }, 100);
  },

  onUnload() {
    if (this.animationFrame && this.canvas) {
      this.canvas.cancelAnimationFrame(this.animationFrame);
    }
    // 清除方向键定时器
    if (this.dpadTimer) clearTimeout(this.dpadTimer);
    if (this.dpadInterval) clearInterval(this.dpadInterval);
  },

  initCanvas() {
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

        canvas.width = cssWidth * this.dpr;
        canvas.height = cssHeight * this.dpr;

        const ctx = canvas.getContext('2d');

        // 第一步：缩放 DPR
        ctx.scale(this.dpr, this.dpr);

        // 第二步：缩放到逻辑坐标系
        const scaleX = cssWidth / this.CONFIG.LOGICAL_WIDTH;
        const scaleY = cssHeight / this.CONFIG.LOGICAL_HEIGHT;
        ctx.scale(scaleX, scaleY);

        this.ctx = ctx;
        this.canvas = canvas;

        console.log('Canvas initialized! Logical scale:', scaleX.toFixed(2), scaleY.toFixed(2));

        this.draw();
        this.state.lastTime = Date.now();
        this.gameLoop();

        wx.showToast({ title: 'Canvas已初始化', icon: 'success', duration: 1000 });
      });
  },

  handleInput(e) {
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

  movePanda(dir) {
    if (this.state.panda.isSliding) return;

    const newIndex = this.state.panda.laneIndex + dir;
    if (newIndex >= 0 && newIndex <= 5) {
      this.state.panda.laneIndex = newIndex;
    }
  },

  movePandaY(dir) {
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

  // A 按钮按下 - 开始滑动
  handleAPress(e) {
    if (this.data.gameState === 'PLAYING' && this.state && this.state.panda) {
      wx.vibrateShort({ type: 'medium' });
      this.state.panda.isSliding = true;
      console.log('A pressed - sliding started');
    }
  },

  // A 按钮松开 - 停止滑动
  handleARelease(e) {
    if (this.data.gameState === 'PLAYING' && this.state && this.state.panda) {
      this.state.panda.isSliding = false;
      console.log('A released - sliding stopped');
    }
  },

  // 方向键按下
  handleDPadPress(e) {
    if (this.data.gameState !== 'PLAYING') return;

    const key = e.currentTarget.dataset.key;
    console.log('D-Pad pressed:', key);

    // 震动反馈
    wx.vibrateShort({ type: 'light' });

    // 立即执行一次移动
    this.executeDPadMove(key);

    // 设置持续移动标志
    this.pressedDPad = key;

    // 开始持续移动（延迟200ms后开始，避免误触）
    this.dpadTimer = setTimeout(() => {
      this.dpadInterval = setInterval(() => {
        if (this.pressedDPad === key && this.data.gameState === 'PLAYING') {
          this.executeDPadMove(key);
        }
      }, 100); // 每100ms移动一次
    }, 200);
  },

  // 方向键松开
  handleDPadRelease(e) {
    console.log('D-Pad released');
    this.pressedDPad = null;

    // 清除定时器
    if (this.dpadTimer) {
      clearTimeout(this.dpadTimer);
      this.dpadTimer = null;
    }
    if (this.dpadInterval) {
      clearInterval(this.dpadInterval);
      this.dpadInterval = null;
    }
  },

  // 执行方向键移动
  executeDPadMove(key) {
    if (!this.state || !this.state.panda) return;

    if (key === 'left') {
      this.movePanda(-1);
    } else if (key === 'right') {
      this.movePanda(1);
    } else if (key === 'up') {
      this.movePandaY(-1);
    } else if (key === 'down') {
      this.movePandaY(1);
    }
  },

  startGame() {
    console.log('Game started!');

    // 游戏开始震动
    wx.vibrateLong();

    this.setData({
      gameState: 'PLAYING',
      score: 0,
      health: 3,
      healthDisplay: '♥♥♥'
    });

    // 确保 state 对象存在
    if (!this.state) {
      this.state = {
        panda: { laneIndex: 2, y: 50, isSliding: false },
        bugs: [],
        lastTime: 0
      };
    } else {
      this.state.panda = { laneIndex: 2, y: 50, isSliding: false };
      this.state.bugs = [];
    }
  },

  gameOver() {
    // 游戏结束震动
    wx.vibrateLong();
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

  update(dt) {
    // 生成虫子
    if (Math.random() < 0.015 + (this.data.score * 0.001)) {
      if (this.state.bugs.length < 5 + Math.floor(this.data.score / 5)) {
        const lane = Math.floor(Math.random() * 6);
        // 30% 概率生成毛毛虫（不可攻击），70% 概率生成瓢虫（可攻击）
        const isInvincible = Math.random() < 0.3;
        this.state.bugs.push({
          laneIndex: lane,
          y: this.CONFIG.LOGICAL_HEIGHT + 20,
          speed: 40 + (this.data.score * 3) + Math.random() * 20,
          active: true,
          type: isInvincible ? 'caterpillar' : 'ladybug' // 毛毛虫或瓢虫
        });
      }
    }

    // 熊猫下滑
    if (this.state.panda.isSliding) {
      this.state.panda.y += 350 * dt;
      // 限制不要滑出屏幕底部
      if (this.state.panda.y > this.CONFIG.LOGICAL_HEIGHT - 30) {
        this.state.panda.y = this.CONFIG.LOGICAL_HEIGHT - 30;
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
            // 下滑攻击
            if (bug.type === 'ladybug') {
              // 瓢虫可以被攻击 - 轻微震动
              wx.vibrateShort({ type: 'light' });
              bug.active = false;
              this.state.bugs.splice(i, 1);
              this.setData({ score: this.data.score + 1 });
              continue;
            } else {
              // 毛毛虫不能被攻击，攻击它会受伤 - 强烈震动
              wx.vibrateShort({ type: 'heavy' });
              bug.active = false;
              this.state.bugs.splice(i, 1);
              this.takeDamage();
              continue;
            }
          } else {
            // 被虫子攻击（无论哪种虫子） - 强烈震动
            wx.vibrateShort({ type: 'heavy' });
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

    // 1. 天空渐变背景
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#87CEEB');
    skyGrad.addColorStop(0.7, '#B0E0E6');
    skyGrad.addColorStop(1, '#E0F6FF');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. 远景竹林（深色，营造深度）
    ctx.fillStyle = 'rgba(60, 100, 60, 0.3)';
    for (let i = 0; i < 20; i++) {
      const x = (i * 30 + Math.sin(i) * 10) % W;
      const w = 6 + Math.random() * 4;
      ctx.fillRect(x, 0, w, H - 20);
    }

    // 3. 中景竹林（中等色调）
    ctx.fillStyle = 'rgba(80, 130, 80, 0.4)';
    for (let i = 0; i < 12; i++) {
      const x = (i * 45 + 15) % W;
      const w = 8 + Math.random() * 5;
      ctx.fillRect(x, 0, w, H - 20);
      // 竹节
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      for (let y = 30; y < H; y += 50) {
        ctx.fillRect(x, y, w, 2);
      }
      ctx.fillStyle = 'rgba(80, 130, 80, 0.4)';
    }

    // 4. 地面
    const groundGrad = ctx.createLinearGradient(0, H - 20, 0, H);
    groundGrad.addColorStop(0, '#2d4a2d');
    groundGrad.addColorStop(1, '#1a2e1a');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, H - 20, W, 20);

    // 绘制竹子（前景 - 更粗更明显）
    this.CONFIG.polesX.forEach(x => {
      // 竹竿主体 - 增加宽度到30px
      const grad = ctx.createLinearGradient(x - 15, 0, x + 15, 0);
      grad.addColorStop(0, '#2d5a27');
      grad.addColorStop(0.3, '#4a8a3d');
      grad.addColorStop(0.5, '#66cc44');
      grad.addColorStop(0.7, '#4a8a3d');
      grad.addColorStop(1, '#2d5a27');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 15, 0, 30, H);

      // 竹节
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 20; y < H; y += 60) {
        ctx.fillRect(x - 15, y, 30, 3);
        // 竹节高光
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x - 15, y + 3, 30, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
      }
    });

    // 绘制熊猫（侧面视角，爬在竹子上）- 放大版
    const p = this.state.panda;
    const poleIndex = Math.floor(p.laneIndex / 2);
    const isLeft = p.laneIndex % 2 === 0;
    const poleX = this.CONFIG.polesX[poleIndex];
    const px = isLeft ? poleX - this.CONFIG.pandaOffset : poleX + this.CONFIG.pandaOffset;

    // 简单的呼吸动画
    const breathe = Math.sin(Date.now() / 300) * 0.5;
    const scale = 1.5; // 放大1.5倍

    ctx.save();
    ctx.translate(px, p.y);
    ctx.scale(scale, scale); // 整体放大
    if (isLeft) ctx.scale(-1, 1); // 左侧时翻转，让熊猫面向竹子

    // === 身体（侧面椭圆） ===
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(0, 2, 12 + breathe, 14 + breathe, 0, 0, Math.PI * 2);
    ctx.fill();

    // 黑色肚子（侧面）
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(2, 4, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // === 四肢（侧面视角，抱着竹子） ===
    ctx.fillStyle = '#000';

    // 后腿（下方）
    ctx.beginPath();
    ctx.ellipse(-8, 10, 4, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // 后手（上方）
    ctx.beginPath();
    ctx.ellipse(-8, -4, 4, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // 前腿（下方，稍微靠前）
    ctx.beginPath();
    ctx.ellipse(-2, 12, 4, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // 前手（上方，稍微靠前）
    ctx.beginPath();
    ctx.ellipse(-2, -6, 4, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // === 头部（侧面圆形） ===
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-10, -8, 9, 0, Math.PI * 2);
    ctx.fill();

    // 耳朵（侧面只看到一只）
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-12, -15, 4, 0, Math.PI * 2);
    ctx.fill();
    // 耳朵内部（粉色）
    ctx.fillStyle = '#FFB6C1';
    ctx.beginPath();
    ctx.arc(-12, -15, 2, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛（侧面只看到一只大眼睛）
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(-7, -9, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛高光
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-6, -10, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // 鼻子（侧面小圆）
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-15, -6, 2, 0, Math.PI * 2);
    ctx.fill();

    // 嘴巴（侧面微笑弧线）
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(-13, -5, 3, 0.3, 1.2);
    ctx.stroke();

    // 眼圈（熊猫特征）
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-7, -9, 5, 0, Math.PI * 2);
    ctx.stroke();

    // 尾巴（小黑球）
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(10, 8, 3, 0, Math.PI * 2);
    ctx.fill();

    // === 下滑特效（速度线） ===
    if (p.isSliding) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-8 + i * 4, -18 - i * 2);
        ctx.lineTo(-8 + i * 4, -28 - i * 2);
        ctx.stroke();
      }
    }

    ctx.restore();

    // 绘制虫子（瓢虫和毛毛虫）- 侧面爬竹子姿势，放大版
    this.state.bugs.forEach(b => {
      if (!b.active) return;
      const bPoleIndex = Math.floor(b.laneIndex / 2);
      const bIsLeft = b.laneIndex % 2 === 0;
      const bPoleX = this.CONFIG.polesX[bPoleIndex];
      const bx = bIsLeft ? bPoleX - this.CONFIG.pandaOffset : bPoleX + this.CONFIG.pandaOffset;

      const bugScale = 1.3; // 放大1.3倍

      ctx.save();
      ctx.translate(bx, b.y);
      ctx.scale(bugScale, bugScale);
      if (bIsLeft) ctx.scale(-1, 1); // 左侧时翻转

      if (b.type === 'ladybug') {
        // === 瓢虫（侧面爬竹子姿势） ===

        // 身体（侧面椭圆）
        ctx.fillStyle = '#FF4444';
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // 翅膀分界线
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 10);
        ctx.stroke();

        // 黑色斑点（侧面只看到一侧的斑点）
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-3, -5, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-3, 0, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-3, 5, 2, 0, Math.PI * 2);
        ctx.fill();

        // 头部（侧面）
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-8, -2, 4, 0, Math.PI * 2);
        ctx.fill();

        // 眼睛（侧面一只）
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-9, -3, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 触角（侧面一根）
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-10, -5);
        ctx.lineTo(-12, -8);
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-12, -8, 1, 0, Math.PI * 2);
        ctx.fill();

        // 腿（侧面，抱着竹子）
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        // 前腿
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        ctx.lineTo(-10, -8);
        ctx.stroke();
        // 中腿
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(-8, 2);
        ctx.stroke();
        // 后腿
        ctx.beginPath();
        ctx.moveTo(-2, 6);
        ctx.lineTo(-6, 8);
        ctx.stroke();

      } else {
        // === 毛毛虫（侧面爬竹子姿势） ===

        // 身体节（侧面椭圆形，连成一串）
        ctx.fillStyle = '#FF9944'; // 橘色

        // 绘制4节身体
        for (let i = 0; i < 4; i++) {
          const segX = -6 + i * 4;
          const segY = Math.sin(i * 0.8 + Date.now() / 200) * 1.5; // 轻微波动
          const segSize = i === 0 ? 6 : 5; // 头部稍大

          ctx.beginPath();
          ctx.ellipse(segX, segY, segSize, segSize + 1, 0, 0, Math.PI * 2);
          ctx.fill();

          // 身体条纹
          ctx.strokeStyle = '#DD7722'; // 深橘色
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(segX, segY, segSize - 1, segSize, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // 头部细节（第一节）
        const headX = -6;
        const headY = Math.sin(Date.now() / 200) * 1.5;

        // 眼睛（侧面一只）
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(headX - 4, headY - 2, 2, 0, Math.PI * 2);
        ctx.fill();

        // 眼睛高光
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(headX - 3.5, headY - 2.5, 1, 0, Math.PI * 2);
        ctx.fill();

        // 嘴巴
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(headX - 5, headY, 2, 0.2, 1);
        ctx.stroke();

        // 触角（侧面一根）
        ctx.strokeStyle = '#DD7722';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(headX - 3, headY - 5);
        ctx.lineTo(headX - 4, headY - 8);
        ctx.stroke();
        ctx.fillStyle = '#DD7722';
        ctx.beginPath();
        ctx.arc(headX - 4, headY - 8, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // 小腿（侧面，每节下方）
        ctx.strokeStyle = '#DD7722';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const legX = -6 + i * 4;
          const legY = Math.sin(i * 0.8 + Date.now() / 200) * 1.5;
          ctx.beginPath();
          ctx.moveTo(legX - 2, legY + 4);
          ctx.lineTo(legX - 4, legY + 7);
          ctx.stroke();
        }
      }

      ctx.restore();
    });
  }
});