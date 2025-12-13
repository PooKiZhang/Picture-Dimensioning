// pages/editor/editor.js
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

        // UI State
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
        selectedLineType: 'standard', // 'standard', 'leader', or 'text-tag'

        // 文本tag专用配置
        bgColors: ['#ffffff', '#767676', '#92DCFF', '#FF92FA', '#FF909D', '#406992', '#0AC2FE'],
        bgOpacity: 0.9,
        textAlign: 'center', // 'left', 'center', 'right'

        // 字体大小配置
        // 默认字体大小（等级0）
        defaultFontSize: 12,
        // 字体大小等级数组：[-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]
        // 每个等级相差2px
        fontSizeStep: 2,

        // Layer Status
        canMoveUp: false,
        canMoveDown: false
    },

    onLoad(options) {
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

        // Initialize Image
        if (options.imagePath) {
            const imagePath = decodeURIComponent(options.imagePath)
            this.initImage(imagePath)
        }

        // Alert before unload (does not work with swipe back in all scenarios but good practice)
        wx.enableAlertBeforeUnload({
            message: '确定离开当前页面吗？未保存的更改将丢失。',
        })
    },

    initImage(tempFilePath) {
        wx.getImageInfo({
            src: tempFilePath,
            success: (info) => {
                // Calculate aspect fit size
                const ratio = Math.min(this.screenWidth / info.width, (this.screenHeight - 88) / info.height) // Subtract nav height approx logic or just use screenHeight
                // Note: screenHeight includes navbar if default? No, windowHeight excludes it?
                // sysInfo.windowHeight is usable window height.

                const width = info.width * ratio
                const height = info.height * ratio

                // Center on screen
                const x = (this.screenWidth - width) / 2
                const y = (this.screenHeight - height) / 2 - 20 // Adjust for visuals

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
            },
            fail: () => {
                wx.showToast({ title: '图片加载失败', icon: 'none' })
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
        this.setData({ lines, hasSelection: false, canMoveUp: false, canMoveDown: false })
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
            fontSize: this.data.defaultFontSize,  // 使用默认字体大小
            fontSizeLevel: 0,  // 初始等级为0
            fontWeight: 'bold',  // 加粗文本
            ...this._calculateVisuals(ax, ay, bx, by)
        }

        // Deselect others
        const lines = this.data.lines.map(l => ({ ...l, isSelected: false }))
        lines.push(newLine)
        this.setData({ lines, hasSelection: true }, () => {
            // Regular line always syncs
            this.syncTagState()
            this._updateLayerStatus()
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
        if (line) {
            const currentLevel = line.fontSizeLevel || 0
            // 最多放大5个等级
            if (currentLevel < 5) {
                const newLevel = currentLevel + 1
                const newFontSize = this.data.defaultFontSize + (newLevel * this.data.fontSizeStep)
                this.updateSelectedLine({
                    fontSize: newFontSize,
                    fontSizeLevel: newLevel
                })
            }
        }
    },

    onDecreaseFontSize() {
        const line = this.data.lines.find(l => l.isSelected)
        if (line) {
            const currentLevel = line.fontSizeLevel || 0
            // 最多缩小5个等级
            if (currentLevel > -5) {
                const newLevel = currentLevel - 1
                const newFontSize = this.data.defaultFontSize + (newLevel * this.data.fontSizeStep)
                this.updateSelectedLine({
                    fontSize: newFontSize,
                    fontSizeLevel: newLevel
                })
            }
        }
    },

    onLayerUp() {
        const lines = [...this.data.lines]
        const index = lines.findIndex(l => l.isSelected)
        if (index !== -1 && index < lines.length - 1) {
            // Swap with next
            const temp = lines[index]
            lines[index] = lines[index + 1]
            lines[index + 1] = temp
            this.setData({ lines }, () => this._updateLayerStatus())
            wx.vibrateShort({ type: 'light' })
        }
    },

    onLayerDown() {
        const lines = [...this.data.lines]
        const index = lines.findIndex(l => l.isSelected)
        if (index > 0) {
            // Swap with prev
            const temp = lines[index]
            lines[index] = lines[index - 1]
            lines[index - 1] = temp
            this.setData({ lines }, () => this._updateLayerStatus())
            wx.vibrateShort({ type: 'light' })
        }
    },

    onDeleteLine() {
        const lines = this.data.lines.filter(l => !l.isSelected)
        this.setData({ lines, hasSelection: false, canMoveUp: false, canMoveDown: false })
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
                    this._updateLayerStatus()
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

                const lines = this.data.lines.map(l => ({ ...l, isSelected: l.id === id }))
                this.setData({ lines, hasSelection: true }, () => {
                    this.syncTagState()
                    this._updateLayerStatus()
                })
            }
            this.lineDragState.active = false
        }
    },

    _moveLine(dxScreen, dyScreen) {
        // ----------------------------------------------------
        // 移动整条线段逻辑
        // ----------------------------------------------------
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

                let visuals = {}
                if (l.type === 'leader') {
                    visuals = this._calculateLeaderVisuals(ax, ay, bx, by)
                } else if (l.type === 'text-tag') {
                    visuals = this._calculateTextTagVisuals(ax, ay, bx, by)
                } else {
                    visuals = this._calculateVisuals(ax, ay, bx, by)
                }

                return {
                    ...l,
                    ax, ay, bx, by,
                    ...visuals
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

        const dxScreen = touch.clientX - this.dragState.startX
        const dyScreen = touch.clientY - this.dragState.startY

        const rad = -this.data.imgAngle * Math.PI / 180
        const s = this.data.imgScale

        const dxImg = (dxScreen * Math.cos(rad) - dyScreen * Math.sin(rad)) / s
        const dyImg = (dxScreen * Math.sin(rad) + dyScreen * Math.cos(rad)) / s

        const lines = this.data.lines.map(l => {
            if (l.id === this.dragState.lineId) {
                let ax = l.ax
                let ay = l.ay
                let bx = l.bx
                let by = l.by

                if (l.type === 'text-tag') {
                    // 文本tag特殊处理
                    if (this.dragState.type === 'a') {
                        // A锚点：移动整体位置
                        const dAx = (this.dragState.startAx + dxImg) - l.ax
                        const dAy = (this.dragState.startAy + dyImg) - l.ay

                        ax = l.ax + dAx
                        ay = l.ay + dAy
                        bx = l.bx + dAx
                        by = l.by + dAy
                    } else {
                        // B锚点：控制大小
                        bx = this.dragState.startBx + dxImg
                        by = this.dragState.startBy + dyImg

                        // 确保B锚点在A锚点的右下方
                        // 水平方向：B必须在A右侧，且至少相距40px
                        if (bx < ax + 40) {
                            bx = ax + 40
                        }

                        // 垂直方向：B必须在A下方，且至少相距20px
                        if (by < ay + 20) {
                            by = ay + 20
                        }
                    }
                } else if (l.type === 'leader') {
                    if (this.dragState.type === 'a') {
                        const dAx = (this.dragState.startAx + dxImg) - l.ax
                        const dAy = (this.dragState.startAy + dyImg) - l.ay

                        ax = l.ax + dAx
                        ay = l.ay + dAy
                        bx = l.bx + dAx
                        by = l.by + dAy
                    } else {
                        bx = this.dragState.startBx + dxImg
                        by = this.dragState.startBy + dyImg
                    }
                } else {
                    if (this.dragState.type === 'a') {
                        ax = this.dragState.startAx + dxImg
                        ay = this.dragState.startAy + dyImg
                    } else {
                        bx = this.dragState.startBx + dxImg
                        by = this.dragState.startBy + dyImg
                    }
                }

                // --- 端点吸附逻辑 (不适用于text-tag) ---
                if (l.type !== 'text-tag') {
                    const dx = bx - ax
                    const dy = by - ay
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI
                    const absAngle = Math.abs(angle)
                    const threshold = 1.5

                    let isSnapped = false

                    if (absAngle < threshold || Math.abs(absAngle - 180) < threshold) {
                        if (this.dragState.type === 'a') ay = by
                        else by = ay
                        isSnapped = true
                    }
                    else if (Math.abs(absAngle - 90) < threshold) {
                        if (this.dragState.type === 'a') ax = bx
                        else bx = ax
                        isSnapped = true
                    }

                    if (isSnapped) {
                        if (!this.dragState.wasAligned) {
                            wx.vibrateShort({ type: 'medium' })
                            this.dragState.wasAligned = true
                        }
                    } else {
                        this.dragState.wasAligned = false
                    }
                }

                let visuals = {}
                if (l.type === 'leader') {
                    visuals = this._calculateLeaderVisuals(ax, ay, bx, by)
                } else if (l.type === 'text-tag') {
                    visuals = this._calculateTextTagVisuals(ax, ay, bx, by)
                } else {
                    visuals = this._calculateVisuals(ax, ay, bx, by)
                }

                return {
                    ...l,
                    ax, ay, bx, by,
                    ...visuals
                }
            }
            return l
        })

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

        let cx, cy
        if (type === 'a') { cx = line.ax; cy = line.ay }
        else { cx = line.bx; cy = line.by }

        const scaleFactor = 1.6
        const finalScale = this.data.imgScale * scaleFactor

        const rad = this.data.imgAngle * Math.PI / 180

        const x_rot = cx * Math.cos(rad) - cy * Math.sin(rad)
        const y_rot = cx * Math.sin(rad) + cy * Math.cos(rad)

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

        const isFlipped = Math.abs(angle) > 90

        let tagStyle = ''
        if (isFlipped) {
            tagStyle = 'transform: translate(-50%, 0) rotate(180deg); top: 6px;'
        } else {
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

    onInputTextChange(e) {
        let val = e.detail.value
        // Max length check for auto-tag
        if (this.data.selectedLineType === 'auto-tag') {
            if (val.length > 25) {
                val = val.substring(0, 25)
                // Optionally show toast
            }
        }
        this.setData({ inputText: val })
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

    syncTagState() {
        const line = this.data.lines.find(l => l.isSelected)
        if (!line) return

        const text = line.text
        const match = text.match(/^(\d+(?:\.\d+)?)(mm|cm)?$/)

        this.setData({ selectedLineType: line.type || 'standard' })

        // 如果是文本tag或auto-tag，同步额外的状态
        if (line.type === 'text-tag' || line.type === 'auto-tag') {
            this.setData({
                tagValue: text,
                tagUnit: '',
                bgOpacity: line.bgOpacity !== undefined ? line.bgOpacity : 0.9,
                textAlign: line.textAlign || 'center'
            })
        } else if (match) {
            this.setData({
                tagValue: match[1],
                tagUnit: match[2] || 'mm'
            })
        } else {
            this.setData({
                tagValue: text,
                tagUnit: ''
            })
        }
    },


    _updateLayerStatus() {
        const lines = this.data.lines
        const index = lines.findIndex(l => l.isSelected)
        const hasSelection = index !== -1
        this.setData({
            canMoveUp: hasSelection && index < lines.length - 1,
            canMoveDown: hasSelection && index > 0
        })
    },

    // --- Leader Line Logic ---

    onAddLeaderLine() {
        if (!this.data.imagePath) return

        const cx = this.data.imgWidth / 2
        const cy = this.data.imgHeight / 2

        const ax = cx - 50
        const ay = cy
        const bx = cx + 50
        const by = cy - 50

        const newLine = {
            id: Date.now(),
            type: 'leader',
            ax, ay, bx, by,
            text: '请输入',
            isSelected: true,
            strokeWidth: 2,
            color: '#ffffff',
            fontSize: this.data.defaultFontSize,  // 使用默认字体大小
            fontSizeLevel: 0,  // 初始等级为0
            fontWeight: 'bold',  // 加粗文本
            ...this._calculateLeaderVisuals(ax, ay, bx, by)
        }

        const lines = this.data.lines.map(l => ({ ...l, isSelected: false }))
        lines.push(newLine)
        this.setData({ lines, hasSelection: true, editingLineId: newLine.id }, () => this._updateLayerStatus())

        this.setData({
            tagValue: '请输入',
            tagUnit: '',
            selectedLineType: 'leader'
        })

        wx.vibrateShort({ type: 'medium' })
    },

    _calculateLeaderVisuals(ax, ay, bx, by) {
        const dx = bx - ax
        const dy = by - ay
        const diagLen = Math.sqrt(dx * dx + dy * dy)
        const diagAngle = Math.atan2(dy, dx) * 180 / Math.PI

        // Determine relative position
        // Screen coords: Y increases down.
        // isAbove: B is physically higher (smaller Y) than A
        const isAbove = by <= ay
        const isRight = bx >= ax

        return {
            diagLeft: ax,
            diagTop: ay,
            diagLen,
            diagAngle,
            ax, ay, bx, by,

            // Dynamic Styling Props
            textTranslateX: isRight ? '0' : '-100%',
            textTranslateY: isAbove ? '-100%' : '0',
            textBorderSide: isAbove ? 'border-bottom' : 'border-top'
        }
    },

    onTagValueInput(e) {
        let val = e.detail.value
        this.setData({ tagValue: val })
        this._updateLineText(val, this.data.tagUnit)
    },

    onSetUnit(e) {
        const unit = e.currentTarget.dataset.unit
        this.setData({ tagUnit: unit })
        this._updateLineText(this.data.tagValue, unit)
    },

    _updateLineText(value, unit) {
        if (!value) return
        // 对于引出线和文本tag，直接使用输入值作为文本，不添加单位
        // 对于普通标注线，拼接数值和单位
        const selectedLine = this.data.lines.find(l => l.isSelected)
        const text = (selectedLine && (selectedLine.type === 'leader' || selectedLine.type === 'text-tag')) ? value : (value + unit)
        this.updateSelectedLine({ text })
    },

    // --- 6. Export ---

    onSaveImage() {
        if (!this.data.imagePath) return

        wx.showLoading({ title: '生成中...' })

        this.setData({
            canvasWidth: this.data.imgWidth,
            canvasHeight: this.data.imgHeight
        }, () => {
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

                        const dpr = 2
                        canvas.width = width * dpr
                        canvas.height = height * dpr
                        ctx.scale(dpr, dpr)

                        const img = canvas.createImage()
                        img.src = this.data.imagePath
                        img.onload = () => {
                            ctx.drawImage(img, 0, 0, width, height)

                            this.data.lines.forEach(line => {
                                if (line.type === 'text-tag') {
                                    ctx.save()

                                    // 绘制文本tag背景框
                                    const boxWidth = line.boxWidth || 120
                                    const boxHeight = line.boxHeight || 40
                                    const bgColor = line.bgColor || '#000000'
                                    const bgOpacity = line.bgOpacity !== undefined ? line.bgOpacity : 0.9

                                    // 设置背景颜色和透明度
                                    const r = parseInt(bgColor.slice(1, 3), 16)
                                    const g = parseInt(bgColor.slice(3, 5), 16)
                                    const b = parseInt(bgColor.slice(5, 7), 16)
                                    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`

                                    // 绘制圆角矩形背景
                                    this._roundRect(ctx, line.ax, line.ay, boxWidth, boxHeight, 4)
                                    ctx.fill()

                                    // 绘制文字
                                    const fontSize = line.fontSize || 16
                                    ctx.font = `bold ${fontSize}px sans-serif`
                                    ctx.fillStyle = line.color || '#ffffff'

                                    // 文字对齐
                                    const textAlign = line.textAlign || 'center'
                                    ctx.textAlign = textAlign
                                    ctx.textBaseline = 'middle'

                                    let textX
                                    const paddingX = 4  // 左右padding
                                    if (textAlign === 'left') {
                                        textX = line.ax + paddingX
                                    } else if (textAlign === 'right') {
                                        textX = line.ax + boxWidth - paddingX
                                    } else {
                                        textX = line.ax + boxWidth / 2
                                    }

                                    const textY = line.ay + boxHeight / 2

                                    // 处理多行文本
                                    const maxWidth = boxWidth - (paddingX * 2)
                                    this._wrapText(ctx, line.text, textX, textY, maxWidth, fontSize * 1.2)

                                    ctx.restore()
                                } else if (line.type === 'auto-tag') {
                                    ctx.save()

                                    // Auto-tag has no fixed boxWidth/Height in data (or it's dummy).
                                    // We must measure text to draw background.
                                    const fontSize = line.fontSize || 16
                                    ctx.font = `bold ${fontSize}px sans-serif`
                                    ctx.fillStyle = line.color || '#ffffff'
                                    ctx.textAlign = 'left' // Measure/draw from left for wrapping simplicity
                                    ctx.textBaseline = 'top'

                                    const maxW = 200
                                    const padding = 8
                                    // Measure and wrap to determine height
                                    const lines = this._measureWrap(ctx, line.text, maxW - padding * 2)
                                    const lineHeight = fontSize * 1.2
                                    const contentHeight = lines.length * lineHeight
                                    const boxWidth = lines.length > 1 ? maxW : (ctx.measureText(line.text).width + padding * 2)
                                    // Actually if 1 line, width is text width.
                                    // Let's refine width calc.
                                    let calcW = 0
                                    lines.forEach(l => {
                                        const w = ctx.measureText(l).width
                                        if (w > calcW) calcW = w
                                    })
                                    const finalW = Math.min(calcW + padding * 2, maxW)
                                    const finalH = contentHeight + padding * 2

                                    // Draw background
                                    const bgColor = line.bgColor || '#000000'
                                    const bgOpacity = line.bgOpacity !== undefined ? line.bgOpacity : 0.9
                                    const r = parseInt(bgColor.slice(1, 3), 16)
                                    const g = parseInt(bgColor.slice(3, 5), 16)
                                    const b = parseInt(bgColor.slice(5, 7), 16)
                                    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`

                                    // Centered on ax, ay
                                    const startX = line.ax - finalW / 2
                                    const startY = line.ay - finalH / 2

                                    this._roundRect(ctx, startX, startY, finalW, finalH, 4)
                                    ctx.fill()

                                    // Draw Dot
                                    // Visual Specs: 5px content + 3px stroke = 11px diameter.
                                    // Stroke is centered on path in Canvas.
                                    // Target Visual Dia: 11px.
                                    // Outer Radius: 5.5px. Stroke: 3px. Path Radius: 5.5 - 1.5 = 4px.
                                    // Position: Left of box (startX), Gap 4px.
                                    // Center X = startX - 4 - 5.5 = startX - 9.5.
                                    // Center Y = line.ay.

                                    ctx.beginPath()
                                    ctx.arc(startX - 9.5, line.ay, 4, 0, 2 * Math.PI)
                                    ctx.fillStyle = '#ffffff' // White fill
                                    ctx.fill()
                                    ctx.lineWidth = 3
                                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)' // Black 80% stroke
                                    ctx.stroke()

                                    // Draw Text
                                    ctx.fillStyle = line.color || '#ffffff'
                                    lines.forEach((l, i) => {
                                        // Center text in box or left align? User didn't specify alignment for auto-tag, existing tools support it.
                                        // Let's support align if stored, default center.
                                        // For now, simple center.
                                        const lw = ctx.measureText(l).width
                                        const lx = startX + (finalW - lw) / 2
                                        const ly = startY + padding + i * lineHeight
                                        ctx.fillText(l, lx, ly)
                                    })

                                    ctx.restore()
                                } else if (line.type === 'leader') {
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

                                    const isLeft = line.bx < line.ax
                                    const textX = isLeft ? line.bx - textWidth : line.bx

                                    ctx.beginPath()
                                    ctx.moveTo(textX, line.by)
                                    ctx.lineTo(textX + textWidth, line.by)
                                    ctx.lineWidth = line.strokeWidth
                                    ctx.strokeStyle = line.color || '#ffffff'
                                    ctx.stroke()

                                    ctx.fillStyle = 'rgba(0,0,0,0.6)'
                                    this._roundRect(ctx, textX, line.by - line.fontSize - 4, textWidth, line.fontSize + 4, 4)
                                    ctx.fill()

                                    ctx.fillStyle = '#ffffff'
                                    ctx.textAlign = 'center'
                                    ctx.fillText(line.text, textX + textWidth / 2, line.by - 2)

                                    ctx.restore()
                                } else {
                                    ctx.save()
                                    ctx.translate(line.ax, line.ay)
                                    ctx.rotate(line.angle * Math.PI / 180)

                                    ctx.beginPath()
                                    ctx.moveTo(0, 0)
                                    ctx.lineTo(line.length, 0)
                                    ctx.lineWidth = line.strokeWidth || 2
                                    ctx.strokeStyle = line.color || '#ffffff'
                                    ctx.lineCap = 'round'
                                    ctx.stroke()

                                    this._drawArrow(ctx, 0, 0, true, line.color || '#ffffff', line.strokeWidth || 2)
                                    this._drawArrow(ctx, line.length, 0, false, line.color || '#ffffff', line.strokeWidth || 2)

                                    ctx.restore()

                                    ctx.save()
                                    ctx.translate(line.centerX, line.centerY)
                                    if (line.isFlipped) {
                                        ctx.rotate(Math.PI)
                                    }

                                    const fontSize = line.fontSize || 12
                                    ctx.font = `bold ${fontSize}px sans-serif`
                                    const textMetrics = ctx.measureText(line.text)
                                    const textWidth = textMetrics.width
                                    const paddingX = 6
                                    const paddingY = 2

                                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
                                    const boxHeight = fontSize + paddingY * 2
                                    const distFromLine = 6
                                    const boxY = line.isFlipped ? distFromLine : (-boxHeight - distFromLine)

                                    this._roundRect(ctx, -textWidth / 2 - paddingX, boxY, textWidth + paddingX * 2, boxHeight, 4)
                                    ctx.fill()

                                    ctx.fillStyle = '#000000'
                                    ctx.textAlign = 'center'
                                    ctx.textBaseline = 'middle'
                                    ctx.fillText(line.text, 0, boxY + boxHeight / 2)

                                    ctx.restore()
                                }
                            })

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
            }, 200)
        })
    },

    _drawArrow(ctx, x, y, isStart, color, width) {
        ctx.beginPath()
        const size = width * 3
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

    // --- Text Tag Methods ---

    onAddTextTag() {
        if (!this.data.imagePath) return

        const cx = this.data.imgWidth / 2
        const cy = this.data.imgHeight / 2

        // 初始位置和大小
        const ax = cx - 60
        const ay = cy - 20
        const bx = cx + 60
        const by = cy + 20

        const newLine = {
            id: Date.now(),
            type: 'text-tag',
            ax, ay, bx, by,
            text: '请输入',
            isSelected: true,
            color: '#000000',  // 黑色文字
            fontSize: this.data.defaultFontSize,  // 使用默认字体大小
            fontSizeLevel: 0,  // 初始等级为0
            fontWeight: 'bold',  // 加粗文本
            bgColor: '#ffffff',  // 白色背景
            bgOpacity: 1,  // 完全不透明
            textAlign: 'center',
            ...this._calculateTextTagVisuals(ax, ay, bx, by)
        }

        const lines = this.data.lines.map(l => ({ ...l, isSelected: false }))
        lines.push(newLine)
        this.setData({
            lines,
            hasSelection: true,
            tagValue: '请输入',
            tagUnit: '',
            selectedLineType: 'text-tag',
            bgOpacity: 1,  // 更新UI状态
            textAlign: 'center'
        }, () => this._updateLayerStatus())

        wx.vibrateShort({ type: 'medium' })
    },

    onAddAutoTag() {
        if (!this.data.imagePath) return

        const cx = this.data.imgWidth / 2
        const cy = this.data.imgHeight / 2

        const newLine = {
            id: Date.now(),
            type: 'auto-tag',
            ax: cx, ay: cy, // Center point
            bx: cx + 1, by: cy + 1, // Dummy B point
            text: '标签',
            isSelected: true,
            color: '#ffffff', // Fixed White Text
            fontSize: this.data.defaultFontSize,
            fontSizeLevel: 0,
            fontWeight: 'bold',
            bgColor: '#000000', // Fixed Black BG
            bgOpacity: 0.8,     // Fixed 80% Opacity
            textAlign: 'left'   // Fixed Left Align
        }

        const lines = this.data.lines.map(l => ({ ...l, isSelected: false }))
        lines.push(newLine)
        this.setData({
            lines,
            hasSelection: true,
            tagValue: '标签',
            tagUnit: '',
            selectedLineType: 'auto-tag',
            bgOpacity: 0.8,
            textAlign: 'left'
        }, () => this._updateLayerStatus())

        wx.vibrateShort({ type: 'medium' })
    },

    _calculateTextTagVisuals(ax, ay, bx, by) {
        const boxWidth = Math.abs(bx - ax)
        const boxHeight = Math.abs(by - ay)

        return {
            boxWidth,
            boxHeight
        }
    },

    onSelectBgColor(e) {
        const color = e.currentTarget.dataset.color
        this.updateSelectedLine({ bgColor: color })
    },

    onIncreaseBgOpacity() {
        const line = this.data.lines.find(l => l.isSelected)
        if (line) {
            const newOpacity = Math.min((line.bgOpacity || 0.9) + 0.1, 1)
            this.updateSelectedLine({ bgOpacity: newOpacity })
            this.setData({ bgOpacity: newOpacity })
        }
    },

    onDecreaseBgOpacity() {
        const line = this.data.lines.find(l => l.isSelected)
        if (line) {
            const newOpacity = Math.max((line.bgOpacity || 0.9) - 0.1, 0)
            this.updateSelectedLine({ bgOpacity: newOpacity })
            this.setData({ bgOpacity: newOpacity })
        }
    },

    onSetTextAlign(e) {
        const align = e.currentTarget.dataset.align
        this.updateSelectedLine({ textAlign: align })
        this.setData({ textAlign: align })
    },

    _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        // 简单的文本换行处理
        const words = text.split('')
        let line = ''
        let testLine = ''
        let lineY = y

        for (let n = 0; n < words.length; n++) {
            testLine = line + words[n]
            const metrics = ctx.measureText(testLine)
            const testWidth = metrics.width

            if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, lineY)
                line = words[n]
                lineY += lineHeight
            } else {
                line = testLine
            }
        }
        ctx.fillText(line, x, lineY)
    },

    _measureWrap(ctx, text, maxWidth) {
        const words = text.split('')
        let line = ''
        let lines = []

        for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n]
            let metrics = ctx.measureText(testLine)
            let testWidth = metrics.width

            if (testWidth > maxWidth && n > 0) {
                lines.push(line)
                line = words[n]
            } else {
                line = testLine
            }
        }
        lines.push(line)
        return lines
    }
})
