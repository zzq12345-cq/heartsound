/**
 * Knowledge List Page
 * 健康科普列表页
 */

const knowledgeService = require('../../services/knowledge');

Page({
  data: {
    // Categories
    categories: [],
    activeCategoryId: null, // null = all

    // Featured articles
    featuredArticles: [],
    currentSwiperIndex: 0,

    // Article list
    articles: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    total: 0,

    // UI state
    loading: true,
    loadingMore: false,
    refreshing: false
  },

  onLoad() {
    this.loadInitialData();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
  },

  /**
   * Load categories + featured + first page of articles
   */
  async loadInitialData() {
    this.setData({ loading: true });

    try {
      const [categories, featuredArticles] = await Promise.all([
        knowledgeService.getCategories(),
        knowledgeService.getFeaturedArticles(5)
      ]);

      this.setData({ categories, featuredArticles });

      await this.loadArticles(true);
    } catch (err) {
      console.error('[Knowledge] Failed to load initial data:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * Load article list
   */
  async loadArticles(reset = false) {
    if (reset) {
      this.setData({ page: 1, articles: [], hasMore: true });
    }

    const { activeCategoryId, page, pageSize } = this.data;

    try {
      this.setData({ loadingMore: !reset });

      const result = await knowledgeService.getArticlesByCategory(
        activeCategoryId,
        { page, pageSize }
      );

      const articles = reset ? result.data : [...this.data.articles, ...result.data];

      this.setData({
        articles,
        hasMore: result.hasMore,
        total: result.total,
        loadingMore: false
      });
    } catch (err) {
      console.error('[Knowledge] Failed to load articles:', err);
      this.setData({ loadingMore: false });
    }
  },

  /**
   * Category tab tap
   */
  onCategoryTap(e) {
    const categoryId = e.currentTarget.dataset.id || null;
    if (categoryId === this.data.activeCategoryId) return;

    this.setData({ activeCategoryId: categoryId });
    this.loadArticles(true);
  },

  /**
   * Article card tap - navigate to detail
   */
  onArticleTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/knowledge/detail/index?id=${id}`
    });
  },

  /**
   * Featured swiper change
   */
  onSwiperChange(e) {
    this.setData({ currentSwiperIndex: e.detail.current });
  },

  /**
   * Featured article tap
   */
  onFeaturedTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/knowledge/detail/index?id=${id}`
    });
  },

  /**
   * Pull down refresh
   */
  async onPullDownRefresh() {
    this.setData({ refreshing: true });
    await this.loadInitialData();
    this.setData({ refreshing: false });
    wx.stopPullDownRefresh();
  },

  /**
   * Reach bottom - load more
   */
  async onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) return;

    this.setData({ page: this.data.page + 1 });
    await this.loadArticles(false);
  },

  /**
   * Share
   */
  onShareAppMessage() {
    return {
      title: '心音智鉴 - 心脏健康科普知识',
      path: '/pages/knowledge/index'
    };
  }
});
