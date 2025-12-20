// index.js
const app = getApp()

Page({
  data: {
  },

  onLoad() {
  },

  onCameraTap() {
    this._chooseImage(['camera'])
  },

  onAlbumTap() {
    this._chooseImage(['album'])
  },

  onGameTap() {
    wx.navigateTo({
      url: '/pages/game/game'
    })
  },

  _chooseImage(sourceType) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: sourceType,
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        wx.navigateTo({
          url: `/pages/editor/editor?imagePath=${encodeURIComponent(tempFilePath)}`
        })
      }
    })
  },

  onShareTimeline() {
    return {
      title: '分享你个尺寸标注工具，简单好用！',
      imageUrl: '../../img/logo.png',
      path: 'pages/index/index',
      query: 'from=timeline'
    }
  },

  onShareAppMessage(res) {
    return {
      title: '分享你个尺寸标注工具，简单好用！',
      path: 'pages/index/index',
      imageUrl: "../../img/生成小程序分享封面.png",
    }
  },
})
