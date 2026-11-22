const api = require('../../utils/api');
const player = require('../../utils/player');

const speeds = [0.75, 1, 1.25, 1.5, 1.75, 2];

Page({
  data: { book: null, position: 0, duration: 0, playing: false, chapterTitle: '', speed: 1, sleepText: '关闭' },
  onShow() {
    const book = player.currentBook();
    if (!book) { wx.navigateBack(); return; }
    this.setData({ book, duration: book.duration });
    const bg = player.bg;
    if (!bg) return;
    bg.onTimeUpdate(() => {
      const global = this.globalPosition();
      const chapter = book.chapters.find((item) => global >= item.start && global < item.start + item.duration);
      this.setData({ position: global, chapterTitle: chapter ? chapter.title : '' });
    });
    bg.onPlay(() => this.setData({ playing: true }));
    bg.onPause(() => {
      this.setData({ playing: false });
      player.syncProgress(this.data.position);
    });
    bg.onCanplay(() => {
      const pending = getApp().globalData.pendingSeek;
      if (pending !== undefined) { bg.seek(pending); delete getApp().globalData.pendingSeek; }
    });
    bg.onEnded(() => player.syncProgress(this.data.duration));
  },
  globalPosition() {
    const bg = player.bg;
    return (getApp().globalData.chapterStart || 0) + (bg ? bg.currentTime : 0);
  },
  toggle() {
    const bg = player.bg;
    if (!bg) return;
    if (this.data.playing) bg.pause(); else bg.play();
  },
  skip(event) {
    player.seek(this.globalPosition() + Number(event.currentTarget.dataset.delta));
  },
  onSlider(event) { player.seek(Number(event.detail.value)); },
  toChapter(event) {
    const book = this.data.book;
    player.seek(book.chapters[event.currentTarget.dataset.index].start);
  },
  changeSpeed() {
    wx.showActionSheet({
      itemList: speeds.map((value) => value + '×'),
      success: (res) => {
        const speed = speeds[res.tapIndex];
        this.setData({ speed });
        try { if (player.bg) player.bg.playbackRate = speed; } catch (error) { /* 低版本基础库忽略 */ }
      }
    });
  },
  setSleep() {
    wx.showActionSheet({
      itemList: ['关闭', '5 分钟', '10 分钟', '15 分钟', '30 分钟', '60 分钟'],
      success: (res) => {
        const minutes = [0, 5, 10, 15, 30, 60][res.tapIndex];
        if (this.sleepTimer) clearTimeout(this.sleepTimer);
        if (!minutes) { this.setData({ sleepText: '关闭' }); return; }
        this.sleepTimer = setTimeout(() => player.bg && player.bg.pause(), minutes * 60000);
        this.setData({ sleepText: minutes + ' 分钟' });
      }
    });
  },
  addBookmark() {
    const book = this.data.book;
    const position = this.globalPosition();
    const chapter = book.chapters.find((item) => position >= item.start && position < item.start + item.duration);
    api.request('/bookmarks', 'POST', { bookId: book.id, chapterId: chapter ? chapter.id : '', position, title: chapter ? chapter.title : '书签' })
      .then(() => wx.showToast({ title: '已添加书签' }))
      .catch((error) => wx.showToast({ title: error.message, icon: 'none' }));
  },
  onUnload() { player.syncProgress(this.globalPosition()); }
});
