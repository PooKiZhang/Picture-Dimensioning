// pages/game/game.js

Page({
  data: {
    gameState: 'MENU',
    score: 0,
    health: 3,
    healthDisplay: '♥♥♥',
    statusBarHeight: 20, // 默认状态栏高度
    selectedAnimal: 'panda', // 当前选中的动物
    selectedIndex: 0 // 当前选中的索引（0-3）
  },

  canvas: null,
  ctx: null,
  animationFrame: 0,
  dpr: 1,

  // 动物列表
  ANIMALS: ['panda', 'kangaroo', 'sloth', 'monkey'],

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
    poops: [], // 粪便数组
    lastTime: 0,
  },

  onLoad() {
    // 获取系统状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 20
    });
  },

  onBackTap() {
    // 返回上一页
    wx.navigateBack({
      delta: 1
    });
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

    // 暂停状态
    if (this.data.gameState === 'PAUSED') {
      if (key === 'left') {
        this.moveSelection(-1);
      } else if (key === 'right') {
        this.moveSelection(1);
      } else if (key === 'a') {
        this.confirmAnimal();
      } else if (key === 'start') {
        this.resumeGame();
      }
      return;
    }

    // 游戏进行中
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
      } else if (key === 'b') {
        this.handleBPress();
      } else if (key === 'select') {
        this.pauseGame();
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

  // A 按钮按下 - 开始滑动 / 确认选择动物
  handleAPress(e) {
    // 暂停状态下，A按钮用于确认选择动物
    if (this.data.gameState === 'PAUSED') {
      this.confirmAnimal();
      return;
    }

    // 游戏进行中，A按钮用于下滑攻击
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
    const key = e.currentTarget.dataset.key;
    console.log('D-Pad pressed:', key);

    // 暂停状态下只响应左右键
    if (this.data.gameState === 'PAUSED') {
      if (key === 'left') {
        this.moveSelection(-1);
      } else if (key === 'right') {
        this.moveSelection(1);
      }
      return;
    }

    // 游戏进行中才允许移动
    if (this.data.gameState !== 'PLAYING') return;

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

  // SELECT按钮 - 暂停游戏
  pauseGame() {
    if (this.data.gameState !== 'PLAYING') return;
    wx.vibrateShort({ type: 'light' });
    this.setData({ gameState: 'PAUSED' });
    console.log('Game paused');
  },

  // START按钮 - 恢复游戏
  resumeGame() {
    if (this.data.gameState !== 'PAUSED') return;
    wx.vibrateShort({ type: 'medium' });
    this.setData({ gameState: 'PLAYING' });
    this.state.lastTime = Date.now();
    console.log('Game resumed with animal:', this.data.selectedAnimal);
  },

  // 左右键 - 移动选择框
  moveSelection(dir) {
    let newIndex = this.data.selectedIndex + dir;
    if (newIndex < 0) newIndex = 3;
    if (newIndex > 3) newIndex = 0;
    wx.vibrateShort({ type: 'light' });
    this.setData({ selectedIndex: newIndex });
  },

  // A按钮 - 确认选择动物
  confirmAnimal() {
    const animal = this.ANIMALS[this.data.selectedIndex];
    wx.vibrateShort({ type: 'medium' });
    this.setData({ selectedAnimal: animal });
    console.log('Animal selected:', animal);
  },

  // B 按钮 - 拉屎攻击
  handleBPress() {
    if (this.data.gameState !== 'PLAYING' || !this.state || !this.state.panda) return;

    // 检查是否有足够的积分（需要5分）
    if (this.data.score < 5) {
      wx.vibrateShort({ type: 'heavy' });
      wx.showToast({ title: '积分不足！需要5分', icon: 'none', duration: 1000 });
      return;
    }

    // 扣除5分
    this.setData({ score: this.data.score - 5 });

    // 震动反馈
    wx.vibrateShort({ type: 'medium' });

    // 生成3粒粪便
    const p = this.state.panda;
    const poleIndex = Math.floor(p.laneIndex / 2);
    const isLeft = p.laneIndex % 2 === 0;
    const poleX = this.CONFIG.polesX[poleIndex];
    const px = isLeft ? poleX - this.CONFIG.pandaOffset : poleX + this.CONFIG.pandaOffset;

    for (let i = 0; i < 3; i++) {
      this.state.poops.push({
        x: px + (i - 1) * 8, // 3粒粪便稍微分散
        y: p.y + 15, // 从熊猫屁股位置开始
        vy: 0, // 初始垂直速度
        vx: (i - 1) * 20, // 水平速度（向外扩散）
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 10,
        active: true
      });
    }

    console.log('B pressed - poop attack!');
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
        poops: [],
        lastTime: 0
      };
    } else {
      this.state.panda = { laneIndex: 2, y: 50, isSliding: false };
      this.state.bugs = [];
      this.state.poops = [];
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
        // 30% 概率生成地雷（不可攻击），70% 概率生成瓢虫（可攻击）
        const isMine = Math.random() < 0.3;
        this.state.bugs.push({
          laneIndex: lane,
          y: this.CONFIG.LOGICAL_HEIGHT + 20,
          speed: 40 + (this.data.score * 3) + Math.random() * 20,
          active: true,
          type: isMine ? 'mine' : 'ladybug', // 地雷或瓢虫
          falling: false,  // 是否正在掉落
          exploding: false, // 是否正在爆炸
          explosionTime: 0  // 爆炸动画时间
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

      // 处理掉落状态
      if (bug.falling) {
        bug.y += 200 * dt; // 掉落速度
        bug.laneIndex += 0.5 * dt; // 稍微向外飘
        if (bug.y > this.CONFIG.LOGICAL_HEIGHT + 50) {
          this.state.bugs.splice(i, 1);
        }
        continue;
      }

      // 处理爆炸状态
      if (bug.exploding) {
        bug.explosionTime += dt;
        if (bug.explosionTime > 0.5) { // 爆炸动画持续0.5秒
          this.state.bugs.splice(i, 1);
        }
        continue;
      }

      bug.y -= bug.speed * dt;

      // 碰撞检测
      if (bug.active && bug.laneIndex === this.state.panda.laneIndex) {
        if (Math.abs(bug.y - this.state.panda.y) < 25) {
          if (this.state.panda.isSliding) {
            // 下滑攻击
            if (bug.type === 'ladybug') {
              // 瓢虫可以被攻击 - 轻微震动，开始掉落
              wx.vibrateShort({ type: 'light' });
              bug.active = false;
              bug.falling = true; // 设置为掉落状态
              this.setData({ score: this.data.score + 1 });
              continue;
            } else {
              // 地雷不能被攻击，攻击它会爆炸并受伤 - 强烈震动
              wx.vibrateShort({ type: 'heavy' });
              bug.active = false;
              bug.exploding = true; // 设置为爆炸状态
              bug.explosionTime = 0;
              this.takeDamage();
              continue;
            }
          } else {
            // 被虫子攻击
            wx.vibrateShort({ type: 'heavy' });
            bug.active = false;
            if (bug.type === 'mine') {
              bug.exploding = true; // 地雷爆炸
              bug.explosionTime = 0;
            } else {
              this.state.bugs.splice(i, 1);
            }
            this.takeDamage();
            continue;
          }
        }
      }

      if (bug.y < -20) {
        this.state.bugs.splice(i, 1);
      }
    }

    // 更新粪便
    for (let i = this.state.poops.length - 1; i >= 0; i--) {
      let poop = this.state.poops[i];

      if (!poop.active) {
        this.state.poops.splice(i, 1);
        continue;
      }

      // 重力加速度
      poop.vy += 500 * dt;
      poop.y += poop.vy * dt;
      poop.x += poop.vx * dt;
      poop.rotation += poop.rotationSpeed * dt;

      // 检测粪便与虫子的碰撞
      for (let j = this.state.bugs.length - 1; j >= 0; j--) {
        let bug = this.state.bugs[j];
        if (!bug.active || bug.falling || bug.exploding) continue;

        // 计算虫子的实际位置
        const bPoleIndex = Math.floor(bug.laneIndex / 2);
        const bIsLeft = bug.laneIndex % 2 === 0;
        const bPoleX = this.CONFIG.polesX[bPoleIndex];
        const bx = bIsLeft ? bPoleX - this.CONFIG.pandaOffset : bPoleX + this.CONFIG.pandaOffset;

        // 碰撞检测（圆形碰撞）
        const dx = poop.x - bx;
        const dy = poop.y - bug.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 15) { // 碰撞半径
          // 粪便击中虫子
          poop.active = false;
          bug.active = false;

          if (bug.type === 'ladybug') {
            // 击中瓢虫 - 掉落
            bug.falling = true;
            this.setData({ score: this.data.score + 2 }); // 粪便击杀奖励2分
            wx.vibrateShort({ type: 'light' });
          } else if (bug.type === 'mine') {
            // 击中地雷 - 爆炸（但不扣血）
            bug.exploding = true;
            bug.explosionTime = 0;
            this.setData({ score: this.data.score + 3 }); // 粪便摧毁地雷奖励3分
            wx.vibrateShort({ type: 'medium' });
          }
          break;
        }
      }

      // 粪便掉出屏幕底部
      if (poop.y > this.CONFIG.LOGICAL_HEIGHT + 20) {
        this.state.poops.splice(i, 1);
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

  // 绘制动物（根据selectedAnimal绘制不同的动物）
  drawAnimal(ctx, x, y, isLeft, isSliding) {
    const breathe = Math.sin(Date.now() / 300) * 0.5;
    const scale = 1.5;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (isLeft) ctx.scale(-1, 1);

    const animal = this.data.selectedAnimal;

    if (animal === 'panda') {
      // === 熊猫 ===
      // 身体
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(0, 2, 12 + breathe, 14 + breathe, 0, 0, Math.PI * 2);
      ctx.fill();

      // 黑色肚子
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(2, 4, 8, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // 四肢
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(-8, 10, 4, 5, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-8, -4, 4, 5, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-2, 12, 4, 5, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-2, -6, 4, 5, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // 头部
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-10, -8, 9, 0, Math.PI * 2);
      ctx.fill();

      // 耳朵
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-12, -15, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFB6C1';
      ctx.beginPath();
      ctx.arc(-12, -15, 2, 0, Math.PI * 2);
      ctx.fill();

      // 眼睛
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(-7, -9, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-6, -10, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // 鼻子
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-15, -6, 2, 0, Math.PI * 2);
      ctx.fill();

      // 嘴巴
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(-13, -5, 3, 0.3, 1.2);
      ctx.stroke();

      // 眼圈
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-7, -9, 5, 0, Math.PI * 2);
      ctx.stroke();

      // 尾巴
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(10, 8, 3, 0, Math.PI * 2);
      ctx.fill();

    } else if (animal === 'kangaroo') {
      // === 袋鼠 ===
      // 身体（棕色）
      ctx.fillStyle = '#D2691E';
      ctx.beginPath();
      ctx.ellipse(0, 2, 12 + breathe, 16 + breathe, 0, 0, Math.PI * 2);
      ctx.fill();

      // 肚子（浅色）
      ctx.fillStyle = '#F4A460';
      ctx.beginPath();
      ctx.ellipse(2, 4, 8, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // 后腿（强壮）
      ctx.fillStyle = '#A0522D';
      ctx.beginPath();
      ctx.ellipse(-6, 12, 5, 7, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // 前爪（小）
      ctx.fillStyle = '#A0522D';
      ctx.beginPath();
      ctx.ellipse(-8, -4, 3, 4, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-2, -6, 3, 4, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // 头部
      ctx.fillStyle = '#D2691E';
      ctx.beginPath();
      ctx.ellipse(-10, -8, 8, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // 长耳朵
      ctx.fillStyle = '#A0522D';
      ctx.beginPath();
      ctx.ellipse(-10, -18, 3, 8, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFB6C1';
      ctx.beginPath();
      ctx.ellipse(-10, -18, 1.5, 6, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // 眼睛
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-8, -9, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-7, -10, 1, 0, Math.PI * 2);
      ctx.fill();

      // 鼻子
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-16, -6, 2, 0, Math.PI * 2);
      ctx.fill();

      // 嘴巴
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(-14, -5, 3, 0.3, 1.2);
      ctx.stroke();

      // 尾巴（粗长）
      ctx.strokeStyle = '#A0522D';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(10, 8);
      ctx.quadraticCurveTo(15, 10, 18, 5);
      ctx.stroke();

    } else if (animal === 'sloth') {
      // === 树懒 ===
      // 身体（灰褐色）
      ctx.fillStyle = '#8B7355';
      ctx.beginPath();
      ctx.ellipse(0, 2, 12 + breathe, 14 + breathe, 0, 0, Math.PI * 2);
      ctx.fill();

      // 肚子（浅色）
      ctx.fillStyle = '#C4A582';
      ctx.beginPath();
      ctx.ellipse(2, 4, 8, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // 长爪子（树懒特征）
      ctx.strokeStyle = '#654321';
      ctx.lineWidth = 2;
      // 后爪
      ctx.beginPath();
      ctx.moveTo(-8, 10);
      ctx.lineTo(-12, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8, 10);
      ctx.lineTo(-12, 12);
      ctx.stroke();
      // 前爪
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-12, -6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-12, -2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2, -6);
      ctx.lineTo(-4, -10);
      ctx.stroke();

      // 头部（圆形）
      ctx.fillStyle = '#8B7355';
      ctx.beginPath();
      ctx.arc(-10, -8, 9, 0, Math.PI * 2);
      ctx.fill();

      // 脸部（浅色）
      ctx.fillStyle = '#C4A582';
      ctx.beginPath();
      ctx.ellipse(-12, -8, 6, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // 小耳朵
      ctx.fillStyle = '#654321';
      ctx.beginPath();
      ctx.arc(-10, -15, 2, 0, Math.PI * 2);
      ctx.fill();

      // 眼睛（小而困倦）
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(-9, -9, 2, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-8, -9, 0.8, 0, Math.PI * 2);
      ctx.fill();

      // 鼻子
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-15, -7, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // 微笑
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(-13, -6, 2, 0.2, 1);
      ctx.stroke();

    } else if (animal === 'monkey') {
      // === 猴子 ===
      // 身体（棕色）
      ctx.fillStyle = '#8B4513';
      ctx.beginPath();
      ctx.ellipse(0, 2, 11 + breathe, 13 + breathe, 0, 0, Math.PI * 2);
      ctx.fill();

      // 肚子（浅色）
      ctx.fillStyle = '#D2B48C';
      ctx.beginPath();
      ctx.ellipse(2, 4, 7, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // 四肢（细长）
      ctx.fillStyle = '#654321';
      ctx.beginPath();
      ctx.ellipse(-8, 10, 3, 6, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-8, -4, 3, 6, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-2, 12, 3, 5, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-2, -6, 3, 5, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // 头部
      ctx.fillStyle = '#8B4513';
      ctx.beginPath();
      ctx.arc(-10, -8, 9, 0, Math.PI * 2);
      ctx.fill();

      // 脸部（浅色）
      ctx.fillStyle = '#F5DEB3';
      ctx.beginPath();
      ctx.ellipse(-12, -7, 6, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // 耳朵（大）
      ctx.fillStyle = '#D2B48C';
      ctx.beginPath();
      ctx.arc(-8, -14, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#654321';
      ctx.beginPath();
      ctx.arc(-8, -14, 2, 0, Math.PI * 2);
      ctx.fill();

      // 眼睛（大而圆）
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-9, -9, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-9, -9, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-8, -10, 1, 0, Math.PI * 2);
      ctx.fill();

      // 鼻子（扁平）
      ctx.fillStyle = '#654321';
      ctx.beginPath();
      ctx.ellipse(-15, -6, 2, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // 嘴巴（调皮）
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(-13, -4, 3, 0.2, 1.3);
      ctx.stroke();

      // 尾巴（卷曲）
      ctx.strokeStyle = '#654321';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(10, 8);
      ctx.quadraticCurveTo(14, 6, 16, 10);
      ctx.quadraticCurveTo(18, 14, 15, 16);
      ctx.stroke();
    }

    // 下滑特效（所有动物通用）
    if (isSliding) {
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

    // 绘制动物（侧面视角，爬在竹子上）- 放大版
    const p = this.state.panda;
    const poleIndex = Math.floor(p.laneIndex / 2);
    const isLeft = p.laneIndex % 2 === 0;
    const poleX = this.CONFIG.polesX[poleIndex];
    const px = isLeft ? poleX - this.CONFIG.pandaOffset : poleX + this.CONFIG.pandaOffset;

    // 绘制选中的动物
    this.drawAnimal(ctx, px, p.y, isLeft, p.isSliding);

    // 绘制虫子（瓢虫和地雷）- 侧面爬竹子姿势，放大版
    this.state.bugs.forEach(b => {
      const bPoleIndex = Math.floor(b.laneIndex / 2);
      const bIsLeft = b.laneIndex % 2 === 0;
      const bPoleX = this.CONFIG.polesX[bPoleIndex];
      const bx = bIsLeft ? bPoleX - this.CONFIG.pandaOffset : bPoleX + this.CONFIG.pandaOffset;

      const bugScale = 1.3; // 放大1.3倍

      ctx.save();
      ctx.translate(bx, b.y);
      ctx.scale(bugScale, bugScale);

      // 掉落效果：旋转和透明度
      if (b.falling) {
        const fallRotation = (b.y / 50) * Math.PI; // 根据掉落距离旋转
        ctx.rotate(fallRotation);
        ctx.globalAlpha = Math.max(0.3, 1 - (b.y - this.CONFIG.LOGICAL_HEIGHT) / 100);
      }

      if (bIsLeft && !b.falling) ctx.scale(-1, 1); // 左侧时翻转（掉落时不翻转）

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
        if (!b.falling) {
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
        }

      } else if (b.type === 'mine') {
        // === 地雷（圆形炸弹） ===

        if (b.exploding) {
          // 爆炸效果
          const explosionProgress = b.explosionTime / 0.5;
          const explosionRadius = 15 * explosionProgress;

          // 外圈爆炸波
          for (let i = 0; i < 3; i++) {
            ctx.strokeStyle = `rgba(255, 100, 0, ${1 - explosionProgress - i * 0.2})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, explosionRadius + i * 8, 0, Math.PI * 2);
            ctx.stroke();
          }

          // 中心火焰
          const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, explosionRadius * 0.6);
          gradient.addColorStop(0, `rgba(255, 255, 100, ${1 - explosionProgress})`);
          gradient.addColorStop(0.5, `rgba(255, 150, 0, ${0.8 - explosionProgress})`);
          gradient.addColorStop(1, `rgba(255, 50, 0, ${0.3 - explosionProgress})`);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(0, 0, explosionRadius * 0.6, 0, Math.PI * 2);
          ctx.fill();

        } else {
          // 正常地雷外观

          // 主体（黑色圆球）
          const gradient = ctx.createRadialGradient(-2, -2, 0, 0, 0, 10);
          gradient.addColorStop(0, '#444');
          gradient.addColorStop(0.7, '#222');
          gradient.addColorStop(1, '#000');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fill();

          // 金属光泽
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.beginPath();
          ctx.arc(-3, -3, 3, 0, Math.PI * 2);
          ctx.fill();

          // 尖刺（8个方向）
          ctx.fillStyle = '#333';
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const x = Math.cos(angle) * 10;
            const y = Math.sin(angle) * 10;

            ctx.beginPath();
            ctx.moveTo(x * 0.7, y * 0.7);
            ctx.lineTo(x * 1.5, y * 1.5);
            ctx.lineTo(x * 0.9, y * 0.9);
            ctx.closePath();
            ctx.fill();
          }

          // 警告标志（红色感叹号）
          ctx.fillStyle = '#FF0000';
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', 0, 0);
        }
      }

      ctx.restore();
    });

    // 绘制粪便
    this.state.poops.forEach(poop => {
      if (!poop.active) return;

      ctx.save();
      ctx.translate(poop.x, poop.y);
      ctx.rotate(poop.rotation);

      // 粪便外形（棕色小球）
      const poopGrad = ctx.createRadialGradient(-1, -1, 0, 0, 0, 5);
      poopGrad.addColorStop(0, '#8B4513');
      poopGrad.addColorStop(0.6, '#654321');
      poopGrad.addColorStop(1, '#3E2723');
      ctx.fillStyle = poopGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();

      // 高光
      ctx.fillStyle = 'rgba(139, 90, 43, 0.6)';
      ctx.beginPath();
      ctx.arc(-1.5, -1.5, 2, 0, Math.PI * 2);
      ctx.fill();

      // 臭气线条（简单的波浪线）
      ctx.strokeStyle = 'rgba(100, 150, 50, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-3, -8);
      ctx.quadraticCurveTo(-1, -10, 1, -8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1, -8);
      ctx.quadraticCurveTo(3, -6, 5, -8);
      ctx.stroke();

      ctx.restore();
    });
  }
});