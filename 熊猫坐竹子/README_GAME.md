# 熊猫爬竹子 - 微信小程序游戏

一个仿真 GameBoy Color 游戏机的微信小程序游戏，熊猫需要在竹子上攀爬并躲避虫子。

## 项目结构

```
miniprogram/
├── pages/
│   └── game/
│       ├── game.wxml    # 游戏界面
│       ├── game.wxss    # 样式文件
│       ├── game.ts      # 游戏逻辑
│       └── game.json    # 页面配置
└── app.json             # 小程序配置
```

## 游戏特性

### 1. GameBoy 仿真界面
- 逼真的 GameBoy Color 外壳设计
- 带扫描线效果的彩色 LCD 屏幕
- 完整的按钮布局（方向键、A/B 按钮、SELECT/START）
- 电源指示灯动画

### 2. 游戏玩法
- **三根竹子系统**：每根竹子有左右两侧，共 6 个位置
- **移动控制**：
  - ⬆️⬇️：熊猫上下移动
  - ⬅️➡️：熊猫在竹子之间切换（左侧↔右侧↔下一根竹子）
  - A 按钮：下滑攻击
  - START：开始/重新开始游戏

### 3. 游戏机制
- **虫子**：从下方爬上来，需要躲避
- **攻击**：按 A 按钮快速下滑可以消灭虫子得分
- **生命值**：3 颗心，被虫子碰到会减少
- **难度递增**：分数越高，虫子越多越快

## 技术实现

### Canvas 2D 渲染
- 使用小程序 Canvas 2D API
- 60 FPS 游戏循环
- 渐变和阴影效果

### 触摸控制
- 完整的触摸事件处理
- 按钮按下视觉反馈
- 支持多点触控

### 响应式设计
- 使用 rpx 单位适配不同屏幕
- 保持 GameBoy 经典比例

## 核心代码说明

### 熊猫位置系统
```typescript
// laneIndex: 0-5
// 0 = 竹子1左侧
// 1 = 竹子1右侧
// 2 = 竹子2左侧
// 3 = 竹子2右侧
// 4 = 竹子3左侧
// 5 = 竹子3右侧

getPandaPoleIndex(): number {
  return Math.floor(this.panda.laneIndex / 2);
}

getPandaSide(): string {
  return this.panda.laneIndex % 2 === 0 ? 'left' : 'right';
}
```

### 碰撞检测
- 检查虫子和熊猫是否在同一 lane
- 计算 Y 轴距离判断碰撞
- 区分攻击和受伤状态

### 难度系统
```typescript
// 虫子生成频率随分数增加
if (Math.random() < dt * (1 + this.data.score * 0.1)) {
  if (this.bugs.length < 5 + this.data.score) {
    this.spawnBug();
  }
}

// 虫子速度随分数增加
speed: this.CONFIG.bugBaseSpeed + (this.data.score * 5) + (Math.random() * 20)
```

## 如何运行

1. 在微信开发者工具中打开项目
2. 项目根目录：`d:\aiADE\熊猫坐竹子`
3. 编译并预览
4. 游戏页面会自动作为首页打开

## 优化建议

- 可以添加音效（使用 wx.createInnerAudioContext）
- 可以添加排行榜（使用云开发）
- 可以添加更多虫子类型
- 可以添加道具系统

## 注意事项

- 确保在真机上测试触摸控制
- Canvas 性能在不同机型上可能有差异
- 建议在基础库 2.9.0 以上运行
