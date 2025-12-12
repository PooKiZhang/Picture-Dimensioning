// index.js
const app = getApp()

Page({
  data: {
    imagePath: '',
    lines: [],

    // 图片变换状态 (屏幕坐标系)
    imgX: 0,
    imgY: 0,
    imgScale: 1,
    imgAngle: 0,
    imgWidth: 0,
    imgHeight: 0,

    // UI State12
    showInput: false,
    inputText: '',
    editingLineId: null,
    hasSelection: false,

    // Editor Options
    colors: ['#ffffff', '#767676', '#92DCFF', '#FF92FA', '#FF909D', '#406992', '#0AC2FE'],

    // Canvas Size for Export
    canvasWidth: 0,

    canvasHeight: 0,

    // 放大镜状态
    showMagnifier: false,
    magX: 0, magY: 0,
    magImgScale: 1,
    magImgAngle: 0,
    magImgTx: 0, magImgTy: 0,

    // 标签编辑状态
    tagValue: '',
    tagUnit: 'mm',
    selectedLineType: 'standard' // 'standard' or 'leader'
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync()
    this.screenWidth = sysInfo.windowWidth
    this.screenHeight = sysInfo.windowHeight

    // 手势状态
    this.gesture = {
      startX: 0, startY: 0,
      startImgX: 0, startImgY: 0,
      startScale: 1,
      startAngle: 0,
      initialDistance: 0,
      initialAngle: 0,
      isImageSnapped: false, // 记录吸附状态用于震动
      isCenterSnappedX: false,
      isCenterSnappedY: false,
      isWidthSnapped: false,
      mode: 'none' // 'pan', 'pinch'
    }

    // Anchor Drag State
    this.dragState = {
      active: false,
      lineId: null,
      type: null, // 'a' or 'b'
      startX: 0, startY: 0,
      startAx: 0, startAy: 0, /* Image Coords */
      startBx: 0, startBy: 0,
      wasAligned: false
    }

    // Line Drag State (Whole Line)
    this.lineDragState = {
      active: false,
      lineId: null,
      startX: 0, startY: 0,
      startAx: 0, startAy: 0,
      startBx: 0, startBy: 0,
      isDragging: false
    }
  },

  // --- 1. Image Upload ---

  // --- 1. Image Upload ---

  onCameraTap() {
    this._chooseImage(['camera'])
  },

  onAlbumTap() {
    this._chooseImage(['album'])
  },

  _chooseImage(sourceType) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: sourceType,
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath

        // Get Image Info to center it
        wx.getImageInfo({
          src: tempFilePath,
          success: (info) => {
            // Calculate aspect fit size
            const ratio = Math.min(this.screenWidth / info.width, this.screenHeight / info.height)
            const width = info.width * ratio
            const height = info.height * ratio

            // Center on screen
            const x = (this.screenWidth - width) / 2
            const y = (this.screenHeight - height) / 2 - 50

            this.setData({
              imagePath: tempFilePath,
              imgWidth: width,
              imgHeight: height,
              imgX: x,
              imgY: y,
              imgScale: 1,
              imgAngle: 0,
              lines: [] // Reset lines
            })
          }
        })
      }
    })
  },

  onBackTap() {
    wx.showModal({
      title: '提示',
      content: '确定放弃并返回？',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            imagePath: '',
            lines: [],
            hasSelection: false
          })
        }
      }
    })
  },

  // --- 2. Gestures (Pan / Zoom / Rotate) ---

  onTouchStart(e) {
    if (e.touches.length === 1) {
      // Pan Start
      this.gesture.mode = 'pan'
      this.gesture.startX = e.touches[0].clientX
      this.gesture.startY = e.touches[0].clientY
      this.gesture.startImgX = this.data.imgX
      this.gesture.startImgY = this.data.imgY
    } else if (e.touches.length === 2) {
      // Pinch/Rotate Start
      this.gesture.mode = 'pinch'
      const x1 = e.touches[0].clientX
      const y1 = e.touches[0].clientY
      const x2 = e.touches[1].clientX
      const y2 = e.touches[1].clientY

      this.gesture.initialDistance = this._getDistance(x1, y1, x2, y2)
      this.gesture.initialAngle = this._getAngle(x1, y1, x2, y2)
      this.gesture.startScale = this.data.imgScale
      this.gesture.startAngle = this.data.imgAngle

      // Track center for pivot zoom
      const cx = (x1 + x2) / 2
      const cy = (y1 + y2) / 2
      this.gesture.startPinchX = cx
      this.gesture.startPinchY = cy
      this.gesture.startImgX = this.data.imgX
      this.gesture.startImgY = this.data.imgY
    }
  },

  onTouchMove(e) {
    if (this.gesture.mode === 'pan' && e.touches.length === 1) {
      // ----------------------------------------------------
      // 平移手势处理 (Pan)
      // ----------------------------------------------------
      const dx = e.touches[0].clientX - this.gesture.startX
      const dy = e.touches[0].clientY - this.gesture.startY
      let newImgX = this.gesture.startImgX + dx
      let newImgY = this.gesture.startImgY + dy

      // --- 中心吸附逻辑 (平移时) ---
      const rad = this.data.imgAngle * Math.PI / 180
      const w2 = this.data.imgWidth / 2
      const h2 = this.data.imgHeight / 2
      const s = this.data.imgScale

      // 计算从容器左上角(0,0)到中心点(w/2, h/2)的向量
      // 经过缩放和旋转变换
      const offsetX = s * (w2 * Math.cos(rad) - h2 * Math.sin(rad))
      const offsetY = s * (w2 * Math.sin(rad) + h2 * Math.cos(rad))

      const currentCenterX = newImgX + offsetX
      const currentCenterY = newImgY + offsetY

      const screenCenterX = this.screenWidth / 2
      const screenCenterY = this.screenHeight / 2
      const centerSnapThreshold = 6 // pixels

      // Snap X
      if (Math.abs(currentCenterX - screenCenterX) < centerSnapThreshold) {
        newImgX = screenCenterX - offsetX
        if (!this.gesture.isCenterSnappedX) {
          wx.vibrateShort({ type: 'medium' })
          this.gesture.isCenterSnappedX = true
        }
      } else {
        this.gesture.isCenterSnappedX = false
      }

      // Y轴吸附 (垂直居中)
      if (Math.abs(currentCenterY - screenCenterY) < centerSnapThreshold) {
        newImgY = screenCenterY - offsetY
        if (!this.gesture.isCenterSnappedY) {
          wx.vibrateShort({ type: 'medium' }) // 触感反馈
          this.gesture.isCenterSnappedY = true
        }
      } else {
        this.gesture.isCenterSnappedY = false
      }
      // -----------------------------------

      this.setData({
        imgX: newImgX,
        imgY: newImgY
      })
    } else if (this.gesture.mode === 'pinch' && e.touches.length === 2) {
      // ----------------------------------------------------
      // 缩放 / 旋转手势处理
      // ----------------------------------------------------
      const x1 = e.touches[0].clientX
      const y1 = e.touches[0].clientY
      const x2 = e.touches[1].clientX
      const y2 = e.touches[1].clientY

      const distance = this._getDistance(x1, y1, x2, y2)
      const angle = this._getAngle(x1, y1, x2, y2)

      // Scale
      const scaleRatio = distance / this.gesture.initialDistance
      let newScale = this.gesture.startScale * scaleRatio

      // --- 宽度吸附逻辑 ---
      const currentWidth = this.data.imgWidth * newScale
      const widthThreshold = 8 // 像素阈值

      if (Math.abs(currentWidth - this.screenWidth) < widthThreshold) {
        newScale = this.screenWidth / this.data.imgWidth
        if (!this.gesture.isWidthSnapped) {
          wx.vibrateShort({ type: 'light' })
          this.gesture.isWidthSnapped = true
        }
      } else {
        this.gesture.isWidthSnapped = false
      }
      // ----------------------------
      newScale = Math.max(0.3, Math.min(newScale, 10)) // Clamp scale

      // Rotate
      const angleDiff = angle - this.gesture.initialAngle
      let newAngle = this.gesture.startAngle + angleDiff

      // --- 旋转吸附逻辑 ---
      const snapThreshold = 1.5
      // 归一化角度便于计算 (可选)
      // 实际上取模90度检查就够了
      // 我们想要吸附到 k * 90 度

      let snappedAngle = newAngle
      let isSnapped = false

      // 计算相对于90度的余数
      // 例如 91 -> 1, 89 -> -1
      const remainder = newAngle % 90

      // Case 1: Close to 0, 90, 180... from positive side or exact (0..1.5)
      if (Math.abs(remainder) < snapThreshold) {
        snappedAngle = newAngle - remainder
        isSnapped = true
      }
      // Case 2: Close to 90 from below (e.g. 88.5 -> remainder 88.5. Wait. 89 % 90 is 89. )
      // Positive angle: 89 % 90 = 89. Distance to 90 is 1.
      // Negative angle: -89 % 90 = -89. Distance to -90 is 1.
      else if (Math.abs(remainder) > (90 - snapThreshold)) {
        const sign = remainder > 0 ? 1 : -1
        snappedAngle = newAngle + (90 * sign - remainder)
        isSnapped = true
      }

      if (isSnapped) {
        newAngle = snappedAngle
        if (!this.gesture.isImageSnapped) {
          wx.vibrateShort({ type: 'medium' })
          this.gesture.isImageSnapped = true
        }
      } else {
        this.gesture.isImageSnapped = false
      }
      // -------------------------------

      // 旋转中心逻辑
      const cx = (x1 + x2) / 2
      const cy = (y1 + y2) / 2

      // 从图片原点到捏合起始中心的向量 (在起始坐标空间)
      // vStart = PinchStart - ImgStart
      const vSx = this.gesture.startPinchX - this.gesture.startImgX
      const vSy = this.gesture.startPinchY - this.gesture.startImgY

      // 我们需要根据缩放和旋转的变化变换这个向量
      // 1. 缩放
      const scaleMultiplier = newScale / this.gesture.startScale
      // Note: newScale is calculated from startScale * scaleRatio, so scaleMultiplier IS scaleRatio

      const vScaledX = vSx * scaleMultiplier
      const vScaledY = vSy * scaleMultiplier

      // 2. Rotate (by angleDiff)
      const rad = angleDiff * Math.PI / 180
      const vRotX = vScaledX * Math.cos(rad) - vScaledY * Math.sin(rad)
      const vRotY = vScaledX * Math.sin(rad) + vScaledY * Math.cos(rad)

      // New Image Position:
      // Current Pinch Center = New Image Pos + vRot
      // => New Image Pos = Current Pinch Center - vRot
      const newImgX = cx - vRotX
      const newImgY = cy - vRotY

      this.setData({
        imgScale: newScale,
        imgAngle: newAngle,
        imgX: newImgX,
        imgY: newImgY
      })
    }
  },

  onTouchEnd(e) {
    if (e.touches.length === 0) {
      this.gesture.mode = 'none'
    }
  },

  _getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
  },

  _getAngle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
  },

  onBackgroundTap() {
    // Deselect all lines
    const lines = this.data.lines.map(l => ({ ...l, isSelected: false }))
    this.setData({ lines, hasSelection: false })
  },

  // --- 3. Line Logic ---

  onAddLine() {
    if (!this.data.imagePath) return

    // Add line to center of image (relative to image 0,0)
    // Image size is imgWidth x imgHeight
    const cx = this.data.imgWidth / 2
    const cy = this.data.imgHeight / 2

    // Create a 100px horizontal line centered
    const halfLen = 50
    const ax = cx - halfLen
    const ay = cy
    const bx = cx + halfLen
    const by = cy

    const newLine = {
      id: Date.now(),
      ax, ay, bx, by,
      text: '?',
      isSelected: true,
      strokeWidth: 2,
      color: '#ffffff',
      fontSize: 12,
      ...this._calculateVisuals(ax, ay, bx, by)
    }

    // Deselect others
    const lines = this.data.lines.map(l => ({ ...l, isSelected: false }))
    lines.push(newLine)
    this.setData({ lines, hasSelection: true }, () => {
      // Regular line always syncs
      this.syncTagState()
    })
    wx.vibrateShort({ type: 'medium' })
  },

  // --- Line Style Editing ---

  updateSelectedLine(updates) {
    const lines = this.data.lines.map(l => {
      if (l.isSelected) {
        return { ...l, ...updates }
      }
      return l
    })
    this.setData({ lines })
  },

  onIncreaseWidth() {
    const line = this.data.lines.find(l => l.isSelected)
    if (line) this.updateSelectedLine({ strokeWidth: Math.min(line.strokeWidth + 1, 10) })
  },

  onDecreaseWidth() {
    const line = this.data.lines.find(l => l.isSelected)
    if (line) this.updateSelectedLine({ strokeWidth: Math.max(line.strokeWidth - 1, 1) })
  },

  onSelectColor(e) {
    const color = e.currentTarget.dataset.color
    this.updateSelectedLine({ color })
  },

  onIncreaseFontSize() {
    const line = this.data.lines.find(l => l.isSelected)
    if (line) this.updateSelectedLine({ fontSize: Math.min(line.fontSize + 2, 40) })
  },

  onDecreaseFontSize() {
    const line = this.data.lines.find(l => l.isSelected)
    if (line) this.updateSelectedLine({ fontSize: Math.max(line.fontSize - 2, 10) })
  },

  // No longer used directly, integrated into onLineTouchEnd
  // onLineTap(e) { ... }

  onDeleteLine() {
    const lines = this.data.lines.filter(l => !l.isSelected)
    this.setData({ lines, hasSelection: false })
    wx.vibrateShort({ type: 'medium' })
  },

  onLineTouchStart(e) {
    const id = e.currentTarget.dataset.id
    const touch = e.touches[0]
    const line = this.data.lines.find(l => l.id === id)

    if (line) {
      this.lineDragState = {
        active: true,
        lineId: id,
        startX: touch.clientX,
        startY: touch.clientY,
        startAx: line.ax, startAy: line.ay,
        startBx: line.bx, startBy: line.by,
        isDragging: false
      }
    }
  },

  onLineTouchMove(e) {
    if (!this.lineDragState.active) return
    const touch = e.touches[0]

    // Check separation to detect drag vs tap
    const dx = touch.clientX - this.lineDragState.startX
    const dy = touch.clientY - this.lineDragState.startY

    if (!this.lineDragState.isDragging && (dx * dx + dy * dy > 25)) {
      this.lineDragState.isDragging = true

      // Auto-select line when starting drag if not already
      const id = this.lineDragState.lineId
      const isAlreadySelected = this.data.lines.find(l => l.id === id)?.isSelected
      if (!isAlreadySelected) {
        const lines = this.data.lines.map(l => ({ ...l, isSelected: l.id === id }))
        this.setData({ lines, hasSelection: true }, () => {
          this.syncTagState()
        })
      }
    }

    if (this.lineDragState.isDragging) {
      this._moveLine(dx, dy)
    }
  },

  onLineTouchEnd(e) {
    if (this.lineDragState.active) {
      if (!this.lineDragState.isDragging) {
        // It's a tap -> toggle selection
        const id = this.lineDragState.lineId

        // If clicking on already selected line's tag/line, do nothing? or re-select?
        // Logic: Tap selects it.
        const lines = this.data.lines.map(l => ({ ...l, isSelected: l.id === id }))
        this.setData({ lines, hasSelection: true }, () => {
          this.syncTagState()
        })
      }
      this.lineDragState.active = false
    }
  },

  _moveLine(dxScreen, dyScreen) {
    // ----------------------------------------------------
    // 移动整条线段逻辑
    // 将屏幕移动增量转换为图片坐标增量
    // 需考虑当然图片的旋转和缩放
    // ----------------------------------------------------
    // 将屏幕增量转换为图片坐标
    const rad = -this.data.imgAngle * Math.PI / 180
    const s = this.data.imgScale
    const dxImg = (dxScreen * Math.cos(rad) - dyScreen * Math.sin(rad)) / s
    const dyImg = (dxScreen * Math.sin(rad) + dyScreen * Math.cos(rad)) / s

    const lines = this.data.lines.map(l => {
      if (l.id === this.lineDragState.lineId) {
        const ax = this.lineDragState.startAx + dxImg
        const ay = this.lineDragState.startAy + dyImg
        const bx = this.lineDragState.startBx + dxImg
        const by = this.lineDragState.startBy + dyImg

        return {
          ...l,
          ax, ay, bx, by,
          ...this._calculateVisuals(ax, ay, bx, by),
          ...(l.type === 'leader' ? this._calculateLeaderVisuals(ax, ay, bx, by) : this._calculateVisuals(ax, ay, bx, by))
        }
      }
      return l
    })
    this.setData({ lines })
  },


  // --- 4. Anchor Dragging ---

  onAnchorStart(e) {
    const { id, type } = e.currentTarget.dataset
    const touch = e.touches[0]
    const line = this.data.lines.find(l => l.id === id)

    if (line) {
      this.dragState = {
        active: true,
        lineId: id,
        type: type,
        startX: touch.clientX,
        startY: touch.clientY,
        startAx: line.ax, startAy: line.ay,
        startBx: line.bx, startBy: line.by,
        wasAligned: false
      }
    }
  },

  onAnchorMove(e) {
    if (!this.dragState.active) return
    const touch = e.touches[0]

    // ----------------------------------------------------
    // 端点移动逻辑
    // 类似线段移动，将屏幕增量转换为图片增量
    // ----------------------------------------------------
    // 计算屏幕坐标增量
    const dxScreen = touch.clientX - this.dragState.startX
    const dyScreen = touch.clientY - this.dragState.startY

    // 转换为图片坐标 (逆变换)
    // 需考虑旋转和缩放
    const rad = -this.data.imgAngle * Math.PI / 180
    const s = this.data.imgScale

    // Rotate vector
    const dxImg = (dxScreen * Math.cos(rad) - dyScreen * Math.sin(rad)) / s
    const dyImg = (dxScreen * Math.sin(rad) + dyScreen * Math.cos(rad)) / s

    const lines = this.data.lines.map(l => {
      if (l.id === this.dragState.lineId) {
        // Calculate new raw positions
        let ax = l.ax
        let ay = l.ay
        let bx = l.bx
        let by = l.by

        if (l.type === 'leader') {
          // Leader Line Special Dragging Rules
          if (this.dragState.type === 'a') {
            // Dragging Anchor (A) -> Moves ENTIRE line (A and B maintain offset)
            // Calculate delta
            const dAx = (this.dragState.startAx + dxImg) - l.ax
            const dAy = (this.dragState.startAy + dyImg) - l.ay

            ax = l.ax + dAx
            ay = l.ay + dAy
            bx = l.bx + dAx
            by = l.by + dAy
          } else {
            // Dragging Text (B) -> Moves B only (Standard behavior)
            bx = this.dragState.startBx + dxImg
            by = this.dragState.startBy + dyImg
          }
        } else {
          // Standard Line Behavior
          if (this.dragState.type === 'a') {
            ax = this.dragState.startAx + dxImg
            ay = this.dragState.startAy + dyImg
          } else {
            bx = this.dragState.startBx + dxImg
            by = this.dragState.startBy + dyImg
          }
        }

        // --- 端点吸附逻辑 ---
        const dx = bx - ax
        const dy = by - ay
        const angle = Math.atan2(dy, dx) * 180 / Math.PI
        const absAngle = Math.abs(angle)
        const threshold = 1.5 // 度数

        let isSnapped = false

        // 检查水平 (0 或 180)
        if (absAngle < threshold || Math.abs(absAngle - 180) < threshold) {
          if (this.dragState.type === 'a') ay = by
          else by = ay
          isSnapped = true
        }
        // 检查垂直 (90 或 -90)
        else if (Math.abs(absAngle - 90) < threshold) {
          if (this.dragState.type === 'a') ax = bx
          else bx = ax
          isSnapped = true
        }

        // 吸附时的触感反馈
        if (isSnapped) {
          if (!this.dragState.wasAligned) {
            wx.vibrateShort({ type: 'medium' })
            this.dragState.wasAligned = true
          }
        } else {
          this.dragState.wasAligned = false
        }
        // ---------------------

        const visuals = l.type === 'leader'
          ? this._calculateLeaderVisuals(ax, ay, bx, by)
          : this._calculateVisuals(ax, ay, bx, by)

        return {
          ...l,
          ax, ay, bx, by,
          ...visuals
        }
      }
      return l
    })

    // Update Magnifier State
    this._updateMagnifier(touch.clientX, touch.clientY, this.dragState.lineId, this.dragState.type, lines)

    this.setData({ lines })
  },

  onAnchorEnd() {
    this.dragState.active = false
    this.setData({ showMagnifier: false })
  },

  _updateMagnifier(touchX, touchY, lineId, type, currentLines) {
    const line = currentLines.find(l => l.id === lineId)
    if (!line) return

    // Get current anchor position in Image Coordinates (Un-rotated, Un-scaled container space)
    let cx, cy
    if (type === 'a') { cx = line.ax; cy = line.ay }
    else { cx = line.bx; cy = line.by }

    // ----------------------------------------------------
    // 放大镜逻辑
    // 显示手指下方区域的放大视图
    // ----------------------------------------------------
    // 放大镜设置
    const scaleFactor = 1.6 // 缩放倍率
    // 我们依赖当前的 imgScale 来保持上下文，但进行放大。
    const finalScale = this.data.imgScale * scaleFactor

    // 我们希望图片的 (cx, cy) 点出现在放大镜的中心 (45, 45)
    // 图片变换: translate(tx, ty) scale(S) rotate(R)
    // 点 P(cx, cy) 转换为屏幕坐标 P(px, py):
    // R_rad = Angle * PI / 180
    // x_rot = cx * cos - cy * sin
    // y_rot = cx * sin + cy * cos
    // px = x_rot * S + tx
    // py = y_rot * S + ty
    // 我们想要 px = 45, py = 45.
    // 所以:
    // tx = 45 - (x_rot * S)
    // ty = 45 - (y_rot * S)

    const rad = this.data.imgAngle * Math.PI / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    const x_rot = cx * cos - cy * sin
    const y_rot = cx * sin + cy * cos

    const magImgTx = 45 - (x_rot * finalScale)
    const magImgTy = 45 - (y_rot * finalScale)

    this.setData({
      showMagnifier: true,
      magX: touchX,
      magY: touchY,
      magImgScale: finalScale,
      magImgAngle: this.data.imgAngle,
      magImgTx,
      magImgTy
    })
  },

  _calculateVisuals(ax, ay, bx, by) {
    const dx = bx - ax
    const dy = by - ay
    const length = Math.sqrt(dx * dx + dy * dy)
    let angle = Math.atan2(dy, dx) * 180 / Math.PI
    const centerX = (ax + bx) / 2
    const centerY = (ay + by) / 2

    // 标签方向逻辑:
    // 我们希望文字始终可读(从左到右)，即"直立"。
    // 如果线指向"左侧" (角度 > 90 或 < -90)，文字会继承并倒置。
    // 我们检测这种情况并标记翻转180度。
    const isFlipped = Math.abs(angle) > 90

    // 显式计算样式以确保正确覆盖/应用
    let tagStyle = ''
    if (isFlipped) {
      // 翻转: 旋转180度变正。将"下"(本地Y+)移动到"上"(屏幕Y-)相对于倒置的线。
      tagStyle = 'transform: translate(-50%, 0) rotate(180deg); top: 6px;'
    } else {
      // 正常: 将"上"(本地Y-)移动到线"上方"。
      tagStyle = 'transform: translate(-50%, -100%); top: -6px;'
    }

    return {
      left: ax,
      top: ay,
      length,
      angle,
      centerX,
      centerY,
      isFlipped,
      tagStyle
    }
  },

  // --- 5. Tag Editing ---

  // onTagTap replaced by onLineTouchEnd
  // onTagTap(e) { ... }

  onInputTextChange(e) {
    this.setData({ inputText: e.detail.value })
  },

  onInputConfirm() {
    const text = this.data.inputText || ' '
    const lines = this.data.lines.map(l => {
      if (l.id === this.data.editingLineId) {
        return { ...l, text }
      }
      return l
    })

    this.setData({
      lines,
      showInput: false,
      inputText: '',
      editingLineId: null
    })
  },

  onInputCancel() {
    this.setData({
      showInput: false,
      inputText: '',
      editingLineId: null
    })
  },

  // --- 5.1 New Toolbar Tag Editing ---

  syncTagState() {
    const line = this.data.lines.find(l => l.isSelected)
    if (!line) return

    const text = line.text
    // Regex to find number and unit
    const match = text.match(/^(\d+(?:\.\d+)?)(mm|cm)?$/)

    // Update global selected type state for WXML
    this.setData({ selectedLineType: line.type || 'standard' })

    if (match) {
      this.setData({
        tagValue: match[1],
        tagUnit: match[2] || 'mm'
      })
    } else {
      // If no match (e.g. random text), just show it?
      // Standard lines usually have number+unit.
      // If we want to support arbitrary text for standard lines, we should just set it.
      this.setData({
        tagValue: text,
        tagUnit: ''
      })
    }
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync()
    this.screenWidth = sysInfo.windowWidth
    this.screenHeight = sysInfo.windowHeight

    // 手势状态
    this.gesture = {
      startX: 0, startY: 0,
      startImgX: 0, startImgY: 0,
      startScale: 1,
      startAngle: 0,
      initialDistance: 0,
      initialAngle: 0,
      isImageSnapped: false, // 记录吸附状态用于震动
      isCenterSnappedX: false,
      isCenterSnappedY: false,
      isWidthSnapped: false,
      mode: 'none' // 'pan', 'pinch'
    }

    // Anchor Drag State
    this.dragState = {
      active: false,
      lineId: null,
      type: null, // 'a' or 'b'
      startX: 0, startY: 0,
      startAx: 0, startAy: 0, /* Image Coords */
      startBx: 0, startBy: 0,
      wasAligned: false
    }

    // Line Drag State (Whole Line)
    this.lineDragState = {
      active: false,
      lineId: null,
      startX: 0, startY: 0,
      startAx: 0, startAy: 0,
      startBx: 0, startBy: 0,
      isDragging: false
    }
  },

  // --- 1. Image Upload ---

  // --- 1. Image Upload ---

  onCameraTap() {
    this._chooseImage(['camera'])
  },

  onAlbumTap() {
    this._chooseImage(['album'])
  },

  _chooseImage(sourceType) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: sourceType,
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath

        // Get Image Info to center it
        wx.getImageInfo({
          src: tempFilePath,
          success: (info) => {
            // Calculate aspect fit size
            const ratio = Math.min(this.screenWidth / info.width, this.screenHeight / info.height)
            const width = info.width * ratio
            const height = info.height * ratio

            // Center on screen
            const x = (this.screenWidth - width) / 2
            const y = (this.screenHeight - height) / 2 - 50

            this.setData({
              imagePath: tempFilePath,
              imgWidth: width,
              imgHeight: height,
              imgX: x,
              imgY: y,
              imgScale: 1,
              imgAngle: 0,
              lines: [] // Reset lines
            })
          }
        })
      }
    })
  },

  onBackTap() {
    wx.showModal({
      title: '提示',
      content: '确定放弃并返回？',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            imagePath: '',
            lines: [],
            hasSelection: false
          })
        }
      }
    })
  },

  // --- 2. Gestures (Pan / Zoom / Rotate) ---

  onTouchStart(e) {
    if (e.touches.length === 1) {
      // Pan Start
      this.gesture.mode = 'pan'
      this.gesture.startX = e.touches[0].clientX
      this.gesture.startY = e.touches[0].clientY
      this.gesture.startImgX = this.data.imgX
      this.gesture.startImgY = this.data.imgY
    } else if (e.touches.length === 2) {
      // Pinch/Rotate Start
      this.gesture.mode = 'pinch'
      const x1 = e.touches[0].clientX
      const y1 = e.touches[0].clientY
      const x2 = e.touches[1].clientX
      const y2 = e.touches[1].clientY

      this.gesture.initialDistance = this._getDistance(x1, y1, x2, y2)
      this.gesture.initialAngle = this._getAngle(x1, y1, x2, y2)
      this.gesture.startScale = this.data.imgScale
      this.gesture.startAngle = this.data.imgAngle

      // Track center for pivot zoom
      const cx = (x1 + x2) / 2
      const cy = (y1 + y2) / 2
      this.gesture.startPinchX = cx
      this.gesture.startPinchY = cy
      this.gesture.startImgX = this.data.imgX
      this.gesture.startImgY = this.data.imgY
    }
  },

  onTouchMove(e) {
    if (this.gesture.mode === 'pan' && e.touches.length === 1) {
      // ----------------------------------------------------
      // 平移手势处理 (Pan)
      // ----------------------------------------------------
      const dx = e.touches[0].clientX - this.gesture.startX
      const dy = e.touches[0].clientY - this.gesture.startY
      let newImgX = this.gesture.startImgX + dx
      let newImgY = this.gesture.startImgY + dy

      // --- 中心吸附逻辑 (平移时) ---
      const rad = this.data.imgAngle * Math.PI / 180
      const w2 = this.data.imgWidth / 2
      const h2 = this.data.imgHeight / 2
      const s = this.data.imgScale

      // 计算从容器左上角(0,0)到中心点(w/2, h/2)的向量
      // 经过缩放和旋转变换
      const offsetX = s * (w2 * Math.cos(rad) - h2 * Math.sin(rad))
      const offsetY = s * (w2 * Math.sin(rad) + h2 * Math.cos(rad))

      const currentCenterX = newImgX + offsetX
      const currentCenterY = newImgY + offsetY

      const screenCenterX = this.screenWidth / 2
      const screenCenterY = this.screenHeight / 2
      const centerSnapThreshold = 6 // pixels

      // Snap X
      if (Math.abs(currentCenterX - screenCenterX) < centerSnapThreshold) {
        newImgX = screenCenterX - offsetX
        if (!this.gesture.isCenterSnappedX) {
          wx.vibrateShort({ type: 'medium' })
          this.gesture.isCenterSnappedX = true
        }
      } else {
        this.gesture.isCenterSnappedX = false
      }

      // Y轴吸附 (垂直居中)
      if (Math.abs(currentCenterY - screenCenterY) < centerSnapThreshold) {
        newImgY = screenCenterY - offsetY
        if (!this.gesture.isCenterSnappedY) {
          wx.vibrateShort({ type: 'medium' }) // 触感反馈
          this.gesture.isCenterSnappedY = true
        }
      } else {
        this.gesture.isCenterSnappedY = false
      }
      // -----------------------------------

      this.setData({
        imgX: newImgX,
        imgY: newImgY
      })
    } else if (this.gesture.mode === 'pinch' && e.touches.length === 2) {
      // ----------------------------------------------------
      // 缩放 / 旋转手势处理
      // ----------------------------------------------------
      const x1 = e.touches[0].clientX
      const y1 = e.touches[0].clientY
      const x2 = e.touches[1].clientX
      const y2 = e.touches[1].clientY

      const distance = this._getDistance(x1, y1, x2, y2)
      const angle = this._getAngle(x1, y1, x2, y2)

      // Scale
      const scaleRatio = distance / this.gesture.initialDistance
      let newScale = this.gesture.startScale * scaleRatio

      // --- 宽度吸附逻辑 ---
      const currentWidth = this.data.imgWidth * newScale
      const widthThreshold = 8 // 像素阈值

      if (Math.abs(currentWidth - this.screenWidth) < widthThreshold) {
        newScale = this.screenWidth / this.data.imgWidth
        if (!this.gesture.isWidthSnapped) {
          wx.vibrateShort({ type: 'light' })
          this.gesture.isWidthSnapped = true
        }
      } else {
        this.gesture.isWidthSnapped = false
      }
      // ----------------------------
      newScale = Math.max(0.3, Math.min(newScale, 10)) // Clamp scale

      // Rotate
      const angleDiff = angle - this.gesture.initialAngle
      let newAngle = this.gesture.startAngle + angleDiff

      // --- 旋转吸附逻辑 ---
      const snapThreshold = 1.5
      // 归一化角度便于计算 (可选)
      // 实际上取模90度检查就够了
      // 我们想要吸附到 k * 90 度

      let snappedAngle = newAngle
      let isSnapped = false

      // 计算相对于90度的余数
      // 例如 91 -> 1, 89 -> -1
      const remainder = newAngle % 90

      // Case 1: Close to 0, 90, 180... from positive side or exact (0..1.5)
      if (Math.abs(remainder) < snapThreshold) {
        snappedAngle = newAngle - remainder
        isSnapped = true
      }
      // Case 2: Close to 90 from below (e.g. 88.5 -> remainder 88.5. Wait. 89 % 90 is 89. )
      // Positive angle: 89 % 90 = 89. Distance to 90 is 1.
      // Negative angle: -89 % 90 = -89. Distance to -90 is 1.
      else if (Math.abs(remainder) > (90 - snapThreshold)) {
        const sign = remainder > 0 ? 1 : -1
        snappedAngle = newAngle + (90 * sign - remainder)
        isSnapped = true
      }

      if (isSnapped) {
        newAngle = snappedAngle
        if (!this.gesture.isImageSnapped) {
          wx.vibrateShort({ type: 'medium' })
          this.gesture.isImageSnapped = true
        }
      } else {
        this.gesture.isImageSnapped = false
      }
      // -------------------------------

      // 旋转中心逻辑
      const cx = (x1 + x2) / 2
      const cy = (y1 + y2) / 2

      // 从图片原点到捏合起始中心的向量 (在起始坐标空间)
      // vStart = PinchStart - ImgStart
      const vSx = this.gesture.startPinchX - this.gesture.startImgX
      const vSy = this.gesture.startPinchY - this.gesture.startImgY

      // 我们需要根据缩放和旋转的变化变换这个向量
      // 1. 缩放
      const scaleMultiplier = newScale / this.gesture.startScale
      // Note: newScale is calculated from startScale * scaleRatio, so scaleMultiplier IS scaleRatio

      const vScaledX = vSx * scaleMultiplier
      const vScaledY = vSy * scaleMultiplier

      // 2. Rotate (by angleDiff)
      const rad = angleDiff * Math.PI / 180
      const vRotX = vScaledX * Math.cos(rad) - vScaledY * Math.sin(rad)
      const vRotY = vScaledX * Math.sin(rad) + vScaledY * Math.cos(rad)

      // New Image Position:
      // Current Pinch Center = New Image Pos + vRot
      // => New Image Pos = Current Pinch Center - vRot
      const newImgX = cx - vRotX
      const newImgY = cy - vRotY

      this.setData({
        imgScale: newScale,
        imgAngle: newAngle,
        imgX: newImgX,
        imgY: newImgY
      })
    }
  },

  onTouchEnd(e) {
    if (e.touches.length === 0) {
      this.gesture.mode = 'none'
    }
  },

  _getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
  },

  _getAngle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
  },

  onBackgroundTap() {
    // Deselect all lines
    const lines = this.data.lines.map(l => ({ ...l, isSelected: false }))
    this.setData({ lines, hasSelection: false })
  },

  // --- 3. Line Logic ---

  onAddLine() {
    if (!this.data.imagePath) return

    // Add line to center of image (relative to image 0,0)
    // Image size is imgWidth x imgHeight
    const cx = this.data.imgWidth / 2
    const cy = this.data.imgHeight / 2

    // Create a 100px horizontal line centered
    const halfLen = 50
    const ax = cx - halfLen
    const ay = cy
    const bx = cx + halfLen
    const by = cy

    const newLine = {
      id: Date.now(),
      ax, ay, bx, by,
      text: '?',
      isSelected: true,
      strokeWidth: 2,
      color: '#ffffff',
      fontSize: 12,
      ...this._calculateVisuals(ax, ay, bx, by)
    }

    // Deselect others
    const lines = this.data.lines.map(l => ({ ...l, isSelected: false }))
    lines.push(newLine)
    this.setData({ lines, hasSelection: true }, () => {
      if (newLine.type !== 'leader') this.syncTagState()
    })
    wx.vibrateShort({ type: 'medium' })
  },

  // --- Line Style Editing ---

  updateSelectedLine(updates) {
    const lines = this.data.lines.map(l => {
      if (l.isSelected) {
        return { ...l, ...updates }
      }
      return l
    })
    this.setData({ lines })
  },

  onIncreaseWidth() {
    const line = this.data.lines.find(l => l.isSelected)
    if (line) this.updateSelectedLine({ strokeWidth: Math.min(line.strokeWidth + 1, 10) })
  },

  onDecreaseWidth() {
    const line = this.data.lines.find(l => l.isSelected)
    if (line) this.updateSelectedLine({ strokeWidth: Math.max(line.strokeWidth - 1, 1) })
  },

  onSelectColor(e) {
    const color = e.currentTarget.dataset.color
    this.updateSelectedLine({ color })
  },

  onIncreaseFontSize() {
    const line = this.data.lines.find(l => l.isSelected)
    if (line) this.updateSelectedLine({ fontSize: Math.min(line.fontSize + 2, 40) })
  },

  onDecreaseFontSize() {
    const line = this.data.lines.find(l => l.isSelected)
    if (line) this.updateSelectedLine({ fontSize: Math.max(line.fontSize - 2, 10) })
  },

  // No longer used directly, integrated into onLineTouchEnd
  // onLineTap(e) { ... }

  onDeleteLine() {
    const lines = this.data.lines.filter(l => !l.isSelected)
    this.setData({ lines, hasSelection: false })
    wx.vibrateShort({ type: 'medium' })
  },

  onLineTouchStart(e) {
    const id = e.currentTarget.dataset.id
    const touch = e.touches[0]
    const line = this.data.lines.find(l => l.id === id)

    if (line) {
      this.lineDragState = {
        active: true,
        lineId: id,
        startX: touch.clientX,
        startY: touch.clientY,
        startAx: line.ax, startAy: line.ay,
        startBx: line.bx, startBy: line.by,
        isDragging: false
      }
    }
  },

  onLineTouchMove(e) {
    if (!this.lineDragState.active) return
    const touch = e.touches[0]

    // Check separation to detect drag vs tap
    const dx = touch.clientX - this.lineDragState.startX
    const dy = touch.clientY - this.lineDragState.startY

    if (!this.lineDragState.isDragging && (dx * dx + dy * dy > 25)) {
      this.lineDragState.isDragging = true

      // Auto-select line when starting drag if not already
      const id = this.lineDragState.lineId
      const isAlreadySelected = this.data.lines.find(l => l.id === id)?.isSelected
      if (!isAlreadySelected) {
        const lines = this.data.lines.map(l => ({ ...l, isSelected: l.id === id }))
        this.setData({ lines, hasSelection: true }, () => {
          this.syncTagState()
        })
      }
    }

    if (this.lineDragState.isDragging) {
      this._moveLine(dx, dy)
    }
  },

  onLineTouchEnd(e) {
    if (this.lineDragState.active) {
      if (!this.lineDragState.isDragging) {
        // It's a tap -> toggle selection
        const id = this.lineDragState.lineId

        // If clicking on already selected line's tag/line, do nothing? or re-select?
        // Logic: Tap selects it.
        const lines = this.data.lines.map(l => ({ ...l, isSelected: l.id === id }))
        this.setData({ lines, hasSelection: true }, () => {
          this.syncTagState()
        })
      }
      this.lineDragState.active = false
    }
  },

  _moveLine(dxScreen, dyScreen) {
    // ----------------------------------------------------
    // 移动整条线段逻辑
    // 将屏幕移动增量转换为图片坐标增量
    // 需考虑当然图片的旋转和缩放
    // ----------------------------------------------------
    // 将屏幕增量转换为图片坐标
    const rad = -this.data.imgAngle * Math.PI / 180
    const s = this.data.imgScale
    const dxImg = (dxScreen * Math.cos(rad) - dyScreen * Math.sin(rad)) / s
    const dyImg = (dxScreen * Math.sin(rad) + dyScreen * Math.cos(rad)) / s

    const lines = this.data.lines.map(l => {
      if (l.id === this.lineDragState.lineId) {
        const ax = this.lineDragState.startAx + dxImg
        const ay = this.lineDragState.startAy + dyImg
        const bx = this.lineDragState.startBx + dxImg
        const by = this.lineDragState.startBy + dyImg

        return {
          ...l,
          ax, ay, bx, by,
          ...this._calculateVisuals(ax, ay, bx, by),
          ...(l.type === 'leader' ? this._calculateLeaderVisuals(ax, ay, bx, by) : this._calculateVisuals(ax, ay, bx, by))
        }
      }
      return l
    })
    this.setData({ lines })
  },


  // --- 4. Anchor Dragging ---

  onAnchorStart(e) {
    const { id, type } = e.currentTarget.dataset
    const touch = e.touches[0]
    const line = this.data.lines.find(l => l.id === id)

    if (line) {
      this.dragState = {
        active: true,
        lineId: id,
        type: type,
        startX: touch.clientX,
        startY: touch.clientY,
        startAx: line.ax, startAy: line.ay,
        startBx: line.bx, startBy: line.by,
        wasAligned: false
      }
    }
  },

  onAnchorMove(e) {
    if (!this.dragState.active) return
    const touch = e.touches[0]

    // ----------------------------------------------------
    // 端点移动逻辑
    // 类似线段移动，将屏幕增量转换为图片增量
    // ----------------------------------------------------
    // 计算屏幕坐标增量
    const dxScreen = touch.clientX - this.dragState.startX
    const dyScreen = touch.clientY - this.dragState.startY

    // 转换为图片坐标 (逆变换)
    // 需考虑旋转和缩放
    const rad = -this.data.imgAngle * Math.PI / 180
    const s = this.data.imgScale

    // Rotate vector
    const dxImg = (dxScreen * Math.cos(rad) - dyScreen * Math.sin(rad)) / s
    const dyImg = (dxScreen * Math.sin(rad) + dyScreen * Math.cos(rad)) / s

    const lines = this.data.lines.map(l => {
      if (l.id === this.dragState.lineId) {
        // Calculate new raw positions
        let ax = l.ax
        let ay = l.ay
        let bx = l.bx
        let by = l.by

        if (l.type === 'leader') {
          // Leader Line Special Dragging Rules
          if (this.dragState.type === 'a') {
            // Dragging Anchor (A) -> Moves ENTIRE line (A and B maintain offset)
            // Calculate delta
            const dAx = (this.dragState.startAx + dxImg) - l.ax
            const dAy = (this.dragState.startAy + dyImg) - l.ay

            ax = l.ax + dAx
            ay = l.ay + dAy
            bx = l.bx + dAx
            by = l.by + dAy
          } else {
            // Dragging Text (B) -> Moves B only (Standard behavior)
            bx = this.dragState.startBx + dxImg
            by = this.dragState.startBy + dyImg
          }
        } else {
          // Standard Line Behavior
          if (this.dragState.type === 'a') {
            ax = this.dragState.startAx + dxImg
            ay = this.dragState.startAy + dyImg
          } else {
            bx = this.dragState.startBx + dxImg
            by = this.dragState.startBy + dyImg
          }
        }

        // --- 端点吸附逻辑 ---
        const dx = bx - ax
        const dy = by - ay
        const angle = Math.atan2(dy, dx) * 180 / Math.PI
        const absAngle = Math.abs(angle)
        const threshold = 1.5 // 度数

        let isSnapped = false

        // 检查水平 (0 或 180)
        if (absAngle < threshold || Math.abs(absAngle - 180) < threshold) {
          if (this.dragState.type === 'a') ay = by
          else by = ay
          isSnapped = true
        }
        // 检查垂直 (90 或 -90)
        else if (Math.abs(absAngle - 90) < threshold) {
          if (this.dragState.type === 'a') ax = bx
          else bx = ax
          isSnapped = true
        }

        // 吸附时的触感反馈
        if (isSnapped) {
          if (!this.dragState.wasAligned) {
            wx.vibrateShort({ type: 'medium' })
            this.dragState.wasAligned = true
          }
        } else {
          this.dragState.wasAligned = false
        }
        // ---------------------

        const visuals = l.type === 'leader'
          ? this._calculateLeaderVisuals(ax, ay, bx, by)
          : this._calculateVisuals(ax, ay, bx, by)

        return {
          ...l,
          ax, ay, bx, by,
          ...visuals
        }
      }
      return l
    })

    // Update Magnifier State
    this._updateMagnifier(touch.clientX, touch.clientY, this.dragState.lineId, this.dragState.type, lines)

    this.setData({ lines })
  },

  onAnchorEnd() {
    this.dragState.active = false
    this.setData({ showMagnifier: false })
  },

  _updateMagnifier(touchX, touchY, lineId, type, currentLines) {
    const line = currentLines.find(l => l.id === lineId)
    if (!line) return

    // Get current anchor position in Image Coordinates (Un-rotated, Un-scaled container space)
    let cx, cy
    if (type === 'a') { cx = line.ax; cy = line.ay }
    else { cx = line.bx; cy = line.by }

    // ----------------------------------------------------
    // 放大镜逻辑
    // 显示手指下方区域的放大视图
    // ----------------------------------------------------
    // 放大镜设置
    const scaleFactor = 1.6 // 缩放倍率
    // 我们依赖当前的 imgScale 来保持上下文，但进行放大。
    const finalScale = this.data.imgScale * scaleFactor

    // 我们希望图片的 (cx, cy) 点出现在放大镜的中心 (45, 45)
    // 图片变换: translate(tx, ty) scale(S) rotate(R)
    // 点 P(cx, cy) 转换为屏幕坐标 P(px, py):
    // R_rad = Angle * PI / 180
    // x_rot = cx * cos - cy * sin
    // y_rot = cx * sin + cy * cos
    // px = x_rot * S + tx
    // py = y_rot * S + ty
    // 我们想要 px = 45, py = 45.
    // 所以:
    // tx = 45 - (x_rot * S)
    // ty = 45 - (y_rot * S)

    const rad = this.data.imgAngle * Math.PI / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    const x_rot = cx * cos - cy * sin
    const y_rot = cx * sin + cy * cos

    const magImgTx = 45 - (x_rot * finalScale)
    const magImgTy = 45 - (y_rot * finalScale)

    this.setData({
      showMagnifier: true,
      magX: touchX,
      magY: touchY,
      magImgScale: finalScale,
      magImgAngle: this.data.imgAngle,
      magImgTx,
      magImgTy
    })
  },

  _calculateVisuals(ax, ay, bx, by) {
    const dx = bx - ax
    const dy = by - ay
    const length = Math.sqrt(dx * dx + dy * dy)
    let angle = Math.atan2(dy, dx) * 180 / Math.PI
    const centerX = (ax + bx) / 2
    const centerY = (ay + by) / 2

    // 标签方向逻辑:
    // 我们希望文字始终可读(从左到右)，即"直立"。
    // 如果线指向"左侧" (角度 > 90 或 < -90)，文字会继承并倒置。
    // 我们检测这种情况并标记翻转180度。
    const isFlipped = Math.abs(angle) > 90

    // 显式计算样式以确保正确覆盖/应用
    let tagStyle = ''
    if (isFlipped) {
      // 翻转: 旋转180度变正。将"下"(本地Y+)移动到"上"(屏幕Y-)相对于倒置的线。
      tagStyle = 'transform: translate(-50%, 0) rotate(180deg); top: 6px;'
    } else {
      // 正常: 将"上"(本地Y-)移动到线"上方"。
      tagStyle = 'transform: translate(-50%, -100%); top: -6px;'
    }

    return {
      left: ax,
      top: ay,
      length,
      angle,
      centerX,
      centerY,
      isFlipped,
      tagStyle
    }
  },

  // --- 5. Tag Editing ---

  // onTagTap replaced by onLineTouchEnd
  // onTagTap(e) { ... }

  onInputTextChange(e) {
    this.setData({ inputText: e.detail.value })
  },

  onInputConfirm() {
    const text = this.data.inputText || ' '
    const lines = this.data.lines.map(l => {
      if (l.id === this.data.editingLineId) {
        return { ...l, text }
      }
      return l
    })

    this.setData({
      lines,
      showInput: false,
      inputText: '',
      editingLineId: null
    })
  },

  onInputCancel() {
    this.setData({
      showInput: false,
      inputText: '',
      editingLineId: null
    })
  },

  // --- 5.1 New Toolbar Tag Editing ---

  syncTagState() {
    const line = this.data.lines.find(l => l.isSelected)
    if (!line) return

    const text = line.text
    // Regex to find number and unit
    const match = text.match(/^(\d+(?:\.\d+)?)(mm|cm)?$/)

    if (match) {
      this.setData({
        tagValue: match[1],
        tagUnit: match[2] || 'mm'
      })
    } else {
      // If no match (e.g. random text), just show it?
      // Standard lines usually have number+unit.
      // If we want to support arbitrary text for standard lines, we should just set it.
      this.setData({
        tagValue: text,
        tagUnit: ''
      })
    }
  },

  // --- Leader Line Logic ---

  onAddLeaderLine() {
    if (!this.data.imagePath) return

    const cx = this.data.imgWidth / 2
    const cy = this.data.imgHeight / 2

    // Leader Line: Anchor at Center. Text offset by some amount.
    const ax = cx - 50
    const ay = cy
    const bx = cx + 50
    const by = cy - 50

    const newLine = {
      id: Date.now(),
      type: 'leader', // New Type
      ax, ay, bx, by,
      text: 'Text',
      isSelected: true,
      strokeWidth: 2,
      color: '#ffffff',
      fontSize: 16,
      ...this._calculateLeaderVisuals(ax, ay, bx, by)
    }

    const lines = this.data.lines.map(l => ({ ...l, isSelected: false }))
    lines.push(newLine)
    this.setData({ lines, hasSelection: true, editingLineId: newLine.id }) // Auto-focus input? No, standard selection.

    // Sync toolbar state
    this.setData({
      tagValue: 'Text',
      tagUnit: '', // Not used for leader
      selectedLineType: 'leader'
    })

    wx.vibrateShort({ type: 'medium' })
  },

  _calculateLeaderVisuals(ax, ay, bx, by) {
    // 1. Diagonal Line (Anchor -> TextPos)
    const dx = bx - ax
    const dy = by - ay
    const diagLen = Math.sqrt(dx * dx + dy * dy)
    const diagAngle = Math.atan2(dy, dx) * 180 / Math.PI

    // 2. Text/Horizontal Line Direction
    // If B is to the right of A, text extends right.
    // If B is to the left of A, text extends left?
    // User wants "Drag text to adjust text position".
    // We'll trust B as the start of the horizontal line (the corner).
    // The visual rendering will handle the horizontal line extension based on text width (CSS).

    return {
      diagLeft: ax,
      diagTop: ay,
      diagLen,
      diagAngle,
      // Pass raw coords for template to position elements
      ax, ay, bx, by
    }
  },

  onTagValueInput(e) {
    let val = e.detail.value
    // Update local state and line
    this.setData({ tagValue: val })
    this._updateLineText(val, this.data.tagUnit)
  },

  onSetUnit(e) {
    const unit = e.currentTarget.dataset.unit
    this.setData({ tagUnit: unit })
    this._updateLineText(this.data.tagValue, unit)
  },

  _updateLineText(value, unit) {
    if (!value) return // Don't update if empty? Or set to empty? 
    // If value is empty, maybe we shouldn't update the text to "mm". 
    // But the user might want to clear it.
    // Let's assume if value is present, we append unit.

    const text = value + unit
    this.updateSelectedLine({ text })
  },

  // --- 6. Export ---

  onSaveImage() {
    if (!this.data.imagePath) return

    wx.showLoading({ title: '生成中...' })

    // Move execution to after setData callback to ensure canvas has size
    this.setData({
      canvasWidth: this.data.imgWidth,
      canvasHeight: this.data.imgHeight
    }, () => {
      // Add a small delay for production to ensure DOM update is fully applied
      setTimeout(() => {
        const query = wx.createSelectorQuery()
        query.select('#exportCanvas')
          .fields({ node: true, size: true })
          .exec((res) => {
            if (!res[0] || !res[0].node) {
              wx.hideLoading()
              wx.showToast({ title: 'Canvas init failed', icon: 'none' })
              return
            }
            const canvas = res[0].node
            const ctx = canvas.getContext('2d')

            const width = this.data.imgWidth
            const height = this.data.imgHeight

            // Fixed 2x Scale for good quality
            const dpr = 2
            canvas.width = width * dpr
            canvas.height = height * dpr
            ctx.scale(dpr, dpr)

            // 1. Draw Image
            const img = canvas.createImage()
            img.src = this.data.imagePath
            img.onload = () => {
              ctx.drawImage(img, 0, 0, width, height)

              // 2. Draw Lines
              this.data.lines.forEach(line => {
                if (line.type === 'leader') {
                  // --- Leader Line Drawing ---
                  ctx.save()

                  // 1. Anchor Dot (A)
                  ctx.beginPath()
                  ctx.arc(line.ax, line.ay, (line.strokeWidth * 1.5) + 2, 0, 2 * Math.PI)
                  ctx.lineWidth = line.strokeWidth
                  ctx.strokeStyle = line.color || '#ffffff'
                  ctx.stroke()

                  // 2. Diagonal Line (A -> B)
                  ctx.beginPath()
                  ctx.moveTo(line.ax, line.ay)
                  ctx.lineTo(line.bx, line.by)
                  ctx.lineWidth = line.strokeWidth
                  ctx.strokeStyle = line.color || '#ffffff'
                  ctx.lineCap = 'round'
                  ctx.stroke()

                  // 3. Text & Platform
                  ctx.font = `bold ${line.fontSize || 16}px sans-serif`
                  ctx.fillStyle = '#ffffff'
                  ctx.textBaseline = 'bottom'
                  const textPadding = 6
                  const textWidth = ctx.measureText(line.text).width + (textPadding * 2)

                  // Direction: If bx < ax, text goes left
                  const isLeft = line.bx < line.ax
                  const textX = isLeft ? line.bx - textWidth : line.bx

                  // Platform Line (Underline)
                  ctx.beginPath()
                  ctx.moveTo(textX, line.by)
                  ctx.lineTo(textX + textWidth, line.by)
                  ctx.lineWidth = line.strokeWidth
                  ctx.strokeStyle = line.color || '#ffffff'
                  ctx.stroke()

                  // Text Background (Semi-transparent black)
                  ctx.fillStyle = 'rgba(0,0,0,0.6)'
                  // Rect above the line
                  this._roundRect(ctx, textX, line.by - line.fontSize - 4, textWidth, line.fontSize + 4, 4)
                  ctx.fill()

                  // Text
                  ctx.fillStyle = '#ffffff'
                  // Center in the box
                  ctx.textAlign = 'center'
                  ctx.fillText(line.text, textX + textWidth / 2, line.by - 2)

                  ctx.restore()
                } else {
                  // --- Standard Line Drawing ---
                  ctx.save()
                  ctx.translate(line.ax, line.ay)
                  ctx.rotate(line.angle * Math.PI / 180)

                  // Line Style
                  ctx.beginPath()
                  ctx.moveTo(0, 0)
                  ctx.lineTo(line.length, 0)
                  ctx.lineWidth = line.strokeWidth || 2
                  ctx.strokeStyle = line.color || '#ffffff'
                  ctx.lineCap = 'round'
                  ctx.stroke()

                  // Draw Arrows
                  this._drawArrow(ctx, 0, 0, true, line.color || '#ffffff', line.strokeWidth || 2)
                  this._drawArrow(ctx, line.length, 0, false, line.color || '#ffffff', line.strokeWidth || 2)

                  ctx.restore()

                  // Draw Text Tag
                  ctx.save()
                  ctx.translate(line.centerX, line.centerY)
                  // Rotate text? Standard lines rotate text if flipped.
                  if (line.isFlipped) {
                    ctx.rotate(Math.PI)
                    ctx.translate(0, 0) // No extra translate needed if centered?
                    // Original logic: transform: translate(-50%, 0) rotate(180deg); top: 6px;
                    // In canvas, we are at center.
                    // If flipped (upside down), we rotate 180.
                    // And we need to adjust offset.
                    // Let's keep it simple: Just rotate.
                  }

                  // Text background
                  const fontSize = line.fontSize || 12
                  ctx.font = `bold ${fontSize}px sans-serif`
                  const textMetrics = ctx.measureText(line.text)
                  const textWidth = textMetrics.width
                  const paddingX = 6
                  const paddingY = 2

                  // Draw Pill Shape Background
                  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
                  // Offset Y to be above line
                  // DOM: top: -6px; translate(-50%, -100%) -> Bottom of box is at -6px.
                  // So Box Y = -Height - 6.
                  const boxHeight = fontSize + paddingY * 2
                  const distFromLine = 6
                  const boxY = line.isFlipped ? distFromLine : (-boxHeight - distFromLine)

                  this._roundRect(ctx, -textWidth / 2 - paddingX, boxY, textWidth + paddingX * 2, boxHeight, 12)
                  ctx.fill()

                  // Text
                  ctx.fillStyle = '#000000'
                  ctx.textAlign = 'center'
                  ctx.textBaseline = 'middle'
                  ctx.fillText(line.text, 0, boxY + boxHeight / 2)

                  ctx.restore()
                }
              })

              // 3. Export
              wx.canvasToTempFilePath({
                canvas,
                width: width * dpr,
                height: height * dpr,
                destWidth: width * dpr,
                destHeight: height * dpr,
                fileType: 'jpg',
                quality: 0.9,
                success: (res) => {
                  wx.saveImageToPhotosAlbum({
                    filePath: res.tempFilePath,
                    success: () => {
                      wx.hideLoading()
                      wx.showToast({ title: '已保存', icon: 'success' })
                    },
                    fail: (err) => {
                      wx.hideLoading()
                      console.error('Save Album Fail:', err)
                      if (err.errMsg.includes('auth')) {
                        wx.showModal({
                          title: '提示',
                          content: '需要相册权限保存图片',
                          success: (m) => {
                            if (m.confirm) wx.openSetting()
                          }
                        })
                      } else {
                        wx.showToast({ title: '保存失败', icon: 'none' })
                      }
                    }
                  })
                },
                fail: (err) => {
                  wx.hideLoading()
                  console.error('Canvas Export Fail:', err)
                  wx.showToast({ title: '生成图片失败', icon: 'none' })
                }
              })
            }
            img.onerror = (e) => {
              wx.hideLoading()
              console.error('Image Load Fail:', e)
              wx.showToast({ title: '图片加载失败', icon: 'none' })
            }
          })
      }, 200) // Delay 200ms
    })
  },

  _drawArrow(ctx, x, y, isStart, color, width) {
    ctx.beginPath()
    const size = width * 3 // Scale arrow with line width
    if (isStart) {
      ctx.moveTo(x + size, y - size)
      ctx.lineTo(x, y)
      ctx.lineTo(x + size, y + size)
    } else {
      ctx.moveTo(x - size, y - size)
      ctx.lineTo(x, y)
      ctx.lineTo(x - size, y + size)
    }
    ctx.fillStyle = color
    ctx.fill()
  },

  _roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },
  onShareTimeline() {
    return {
      // 朋友圈展示的标题（默认是小程序名称，可自定义）
      title: '分享你个尺寸标注工具，简单好用！',
      // 朋友圈展示的图片（支持本地路径/网络图片，建议长宽比1:1）
      imageUrl: '../../img/logo.png',
      // 点击朋友圈图片进入小程序的页面路径（需带参数时拼接，如 /pages/index/index?id=123）
      path: 'pages/index/index',
      // 自定义查询参数（可选）
      query: 'from=timeline'
    }
  },
  /**
     * 用户点击右上角分享
     */
  onShareAppMessage(res) {

    return {
      title: '分享你个尺寸标注工具，简单好用！',
      path: 'pages/index/index',
      imageUrl: "../../img/生成小程序分享封面.png",
    }
  },
})
