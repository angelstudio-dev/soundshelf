const api = require('../../utils/api.js');

Page({
  data: { collections: [] },
  onLoad() {
    api.request('/collections').then((data) => this.setData({ collections: data.collections || [] }))
      .catch(() => this.setData({ collections: [] }));
  },
  toBook(e) {
    wx.navigateTo({ url: '/pages/book/book?id=' + e.currentTarget.dataset.id });
  }
});
