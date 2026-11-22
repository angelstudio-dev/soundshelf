const api = require('../../utils/api.js');

Page({
  data: { name: '', books: [] },
  onLoad(options) {
    const name = decodeURIComponent(options.name || '');
    this.setData({ name });
    api.request('/authors/' + encodeURIComponent(name) + '/books').then((data) => {
      this.setData({ books: data.books || [] });
    }).catch(() => this.setData({ books: [] }));
  },
  toBook(e) {
    wx.navigateTo({ url: '/pages/book/book?id=' + e.currentTarget.dataset.id });
  }
});
