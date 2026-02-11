/**
 * Knowledge Service
 * 健康知识科普服务模块
 *
 * Handles article categories, article listing, detail and view tracking.
 */

const { supabase } = require('../utils/supabase');

/**
 * Get all active categories
 * 获取所有启用的文章分类
 *
 * @returns {Promise<array>} Category list
 */
async function getCategories() {
  const { data, error } = await supabase
    .from('article_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[KnowledgeService] Failed to get categories:', error);
    return [];
  }

  return data || [];
}

/**
 * Get articles by category with pagination
 * 根据分类获取文章列表（分页）
 *
 * @param {number|null} categoryId - Category ID, null for all
 * @param {object} options - Query options
 * @param {number} options.page - Page number (1-based)
 * @param {number} options.pageSize - Records per page
 * @returns {Promise<object>} { data, hasMore, total }
 */
async function getArticlesByCategory(categoryId, options = {}) {
  const { page = 1, pageSize = 10 } = options;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('articles')
    .select('id,category_id,title,summary,cover_image,author,read_time,tags,view_count,is_featured,published_at', { count: 'exact' })
    .eq('is_published', true);

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  const { data, error, count } = await query
    .order('sort_order', { ascending: true })
    .order('published_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error('[KnowledgeService] Failed to get articles:', error);
    throw new Error('获取文章列表失败');
  }

  const articles = data || [];
  const total = count || 0;
  const hasMore = offset + articles.length < total;

  return {
    data: articles,
    hasMore,
    total,
    page,
    pageSize
  };
}

/**
 * Get featured articles
 * 获取精选文章
 *
 * @param {number} limit - Maximum number of articles
 * @returns {Promise<array>}
 */
async function getFeaturedArticles(limit = 5) {
  const { data, error } = await supabase
    .from('articles')
    .select('id,category_id,title,summary,cover_image,author,read_time,tags,view_count,published_at')
    .eq('is_published', true)
    .eq('is_featured', true)
    .order('sort_order', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[KnowledgeService] Failed to get featured articles:', error);
    return [];
  }

  return data || [];
}

/**
 * Get article detail by ID
 * 根据ID获取文章详情
 *
 * @param {string} articleId - Article UUID
 * @returns {Promise<object|null>}
 */
async function getArticleDetail(articleId) {
  if (!articleId) {
    throw new Error('Article ID is required');
  }

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('id', articleId)
    .eq('is_published', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      console.warn('[KnowledgeService] Article not found:', articleId);
      return null;
    }
    console.error('[KnowledgeService] Failed to get article:', error);
    throw new Error('获取文章详情失败');
  }

  return data;
}

/**
 * Increment article view count
 * 增加文章阅读计数
 *
 * @param {string} articleId - Article UUID
 * @returns {Promise<void>}
 */
async function incrementViewCount(articleId) {
  if (!articleId) return;

  try {
    // Fetch current count then update (supabase-js lite doesn't support rpc)
    const { data } = await supabase
      .from('articles')
      .select('view_count')
      .eq('id', articleId)
      .single();

    if (data) {
      await supabase
        .from('articles')
        .update({ view_count: (data.view_count || 0) + 1 })
        .eq('id', articleId);
    }
  } catch (err) {
    // Non-critical, just log
    console.warn('[KnowledgeService] Failed to increment view count:', err);
  }
}

module.exports = {
  getCategories,
  getArticlesByCategory,
  getFeaturedArticles,
  getArticleDetail,
  incrementViewCount
};
