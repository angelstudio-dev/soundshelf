const api = require('../../utils/api');

const filters = [
  { key: 'all', label: '全部' },
  { key: 'in-progress', label: '收听中' },
  { key: 'unfinished', label: '未听完' },
  { key: 'finished', label: '已听完' },
  { key: 'series', label: '系列' }
];

Page({
  data: { books: [], filters, filter: 'all', search: '' },
  onShow() { if (getApp().globalData.accessToken) this.load(); },
  load() {
    api.request('/books?filter=' + this.data.filter + '&limit=100' + (this.data.search ? '&search=' + encodeURIComponent(this.data.search) : ''))
      .then((data) => this.setData({ books: data.books }))
      .catch((error) => wx.showToast({ title: error.message, icon: 'none' }));
  },
  setFilter(event) { this.setData({ filter: event.currentTarget.dataset.key }, () => this.load()); },
  onSearch(event) { this.setData({ search: event.detail.value }, () => this.load()); },
  toBook(event) { wx.navigateTo({ url: '/pages/book/book?id=' + event.currentTarget.dataset.id }); }
});
