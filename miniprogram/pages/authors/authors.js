const api = require('../../utils/api.js');

Page({
  data: { authors: [], search: '' },
  onLoad() { this.load(); },
  load() {
    api.request('/authors').then((data) => {
      const authors = (data.authors || []).map((a) => ({ ...a, initial: this.initial(a.name) }));
      authors.sort((a, b) => a.initial.localeCompare(b.initial) || a.name.localeCompare(b.name, 'zh'));
      this.setData({ authors });
    }).catch(() => this.setData({ authors: [] }));
  },
  initial(name) {
    if (!name) return '#';
    const c = name[0];
    if (/[a-zA-Z]/.test(c)) return c.toUpperCase();
    if (/[0-9]/.test(c)) return '#';
    return '#';
  },
  onSearch(e) {
    const q = e.detail.value.toLowerCase();
    api.request('/authors').then((data) => {
      this.setData({ authors: (data.authors || []).filter((a) => a.name.toLowerCase().includes(q)) });
    }).catch(() => undefined);
  },
  toAuthor(e) {
    wx.navigateTo({ url: '/pages/author/author?name=' + encodeURIComponent(e.currentTarget.dataset.name) });
  }
});
