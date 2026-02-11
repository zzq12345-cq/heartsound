/**
 * Knowledge Detail Page
 * 文章详情页
 */

const knowledgeService = require('../../../services/knowledge');

Page({
  data: {
    article: null,
    categoryName: '',
    categoryColor: '#4A90D9',
    htmlContent: '',
    loading: true,
    error: false
  },

  onLoad(options) {
    if (options.id) {
      this.loadArticle(options.id);
    } else {
      this.setData({ loading: false, error: true });
    }
  },

  /**
   * Load article detail and increment view count
   */
  async loadArticle(articleId) {
    this.setData({ loading: true, error: false });

    try {
      const article = await knowledgeService.getArticleDetail(articleId);

      if (!article) {
        this.setData({ loading: false, error: true });
        return;
      }

      // Get category info
      const categories = await knowledgeService.getCategories();
      const category = categories.find(c => c.id === article.category_id);

      // Convert markdown to simple HTML for rich-text
      const htmlContent = this.markdownToHtml(article.content);

      this.setData({
        article,
        categoryName: category ? category.name : '',
        categoryColor: category ? category.color : '#4A90D9',
        htmlContent,
        loading: false
      });

      // Set navigation bar title
      wx.setNavigationBarTitle({ title: article.title });

      // Async increment view count
      knowledgeService.incrementViewCount(articleId);

    } catch (err) {
      console.error('[KnowledgeDetail] Failed to load article:', err);
      this.setData({ loading: false, error: true });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /**
   * Simple Markdown to HTML converter
   * Handles: headings, bold, lists, tables, paragraphs
   */
  markdownToHtml(markdown) {
    if (!markdown) return '';

    let html = markdown;

    // Escape HTML entities first
    html = html.replace(/&/g, '&amp;');

    // Headings: ## Title
    html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:600;color:#2C2E33;margin:20px 0 8px;">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:17px;font-weight:600;color:#2C2E33;margin:24px 0 12px;">$1</h2>');

    // Bold: **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:#2C2E33;">$1</strong>');

    // Unordered lists: - item
    html = html.replace(/^- (.+)$/gm, '<div style="display:flex;margin:4px 0;padding-left:8px;"><span style="color:#4A90D9;margin-right:8px;">•</span><span style="color:#5A5D66;font-size:14px;line-height:1.7;">$1</span></div>');

    // Ordered lists: 1. item
    html = html.replace(/^(\d+)\. (.+)$/gm, '<div style="display:flex;margin:4px 0;padding-left:8px;"><span style="color:#4A90D9;margin-right:8px;font-weight:500;">$1.</span><span style="color:#5A5D66;font-size:14px;line-height:1.7;">$2</span></div>');

    // Simple tables: | col | col |
    html = html.replace(/^\|(.+)\|$/gm, function(match, content) {
      // Skip separator rows (|---|---|)
      if (/^[\s\-|]+$/.test(content)) return '';
      const cells = content.split('|').map(c => c.trim()).filter(c => c);
      const cellHtml = cells.map(c =>
        `<span style="flex:1;padding:6px 8px;font-size:13px;color:#5A5D66;border-bottom:1px solid #F0F0F0;">${c}</span>`
      ).join('');
      return `<div style="display:flex;background:#FAFAFA;border-radius:4px;margin:2px 0;">${cellHtml}</div>`;
    });

    // Warning blocks: ⚠️ text
    html = html.replace(/^(⚠️.+)$/gm, '<div style="background:#FFF8E6;border-left:3px solid #D4A24C;padding:10px 14px;margin:16px 0;border-radius:4px;font-size:13px;color:#8B7230;line-height:1.6;">$1</div>');

    // Paragraphs: double newlines
    html = html.replace(/\n\n/g, '</p><p style="margin:8px 0;font-size:14px;color:#5A5D66;line-height:1.8;">');

    // Single newlines within paragraphs
    html = html.replace(/\n/g, '<br/>');

    // Wrap in paragraph
    html = '<p style="margin:8px 0;font-size:14px;color:#5A5D66;line-height:1.8;">' + html + '</p>';

    // Clean up empty paragraphs
    html = html.replace(/<p[^>]*><\/p>/g, '');
    html = html.replace(/<p[^>]*><br\/><\/p>/g, '');

    return html;
  },

  /**
   * Navigate to AI assistant with article context
   */
  onAskAI() {
    const { article } = this.data;
    if (!article) return;

    wx.switchTab({
      url: '/pages/ai-assistant/chat/index',
      success: () => {
        // Pass context via global data
        const app = getApp();
        app.globalData = app.globalData || {};
        app.globalData.aiContext = {
          type: 'knowledge_article',
          title: article.title,
          content: article.content.substring(0, 500)
        };
      }
    });
  },

  /**
   * Share article
   */
  onShareAppMessage() {
    const { article } = this.data;
    return {
      title: article ? article.title : '心脏健康科普',
      path: `/pages/knowledge/detail/index?id=${article ? article.id : ''}`
    };
  }
});
