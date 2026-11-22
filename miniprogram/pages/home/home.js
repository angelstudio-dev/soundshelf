const api = require('../../utils/api');
const player = require('../../utils/player');

Page({
  data: { stats: {}, continueList: [], recent: [], finished: [], loading: true },
  onShow() {
    if (!getApp().globalData.accessToken || !getApp().globalData.baseUrl) {
      wx.navigateTo({ url: '/pages/settings/settings' });
      return;
    }
    this.load();
  },
  load() {
    api.request('/home').then((data) => {
      this.setData({ stats: data.stats, continueList: data.continueListening, recent: data.recentlyAdded, finished: data.finished, loading: false });
    }).catch((error) => {
      this.setData({ loading: false });
      wx.showToast({ title: error.message, icon: 'none' });
    });
  },
  toBook(event) {
    wx.navigateTo({ url: '/pages/book/book?id=' + event.currentTarget.dataset.id });
  },
  play(event) {
    const id = event.currentTarget.dataset.id;
    const book = this.data.continueList.find((item) => item.id === id);
    if (!book) return;
    player.play(book, book.progress ? book.progress.position : 0);
    wx.navigateTo({ url: '/pages/player/player' });
  }
});
