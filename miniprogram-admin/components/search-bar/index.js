/**
 * Search Bar Component
 * 搜索栏组件 - 支持搜索输入和筛选下拉
 */

Component({
  properties: {
    // 搜索框占位符
    placeholder: {
      type: String,
      value: '搜索...'
    },
    // 筛选选项
    filters: {
      type: Array,
      value: [] // [{label: '全部', value: 'all'}, ...]
    },
    // 当前筛选值
    filterValue: {
      type: String,
      value: 'all'
    },
    // 防抖延迟（毫秒）
    debounce: {
      type: Number,
      value: 300
    }
  },

  data: {
    keyword: '',
    showFilter: false,
    debounceTimer: null,
    currentFilterLabel: '筛选'
  },

  observers: {
    'filters, filterValue': function(filters, filterValue) {
      // 计算当前筛选项的label
      if (filters && filters.length > 0) {
        const found = filters.find(f => f.value === filterValue);
        this.setData({
          currentFilterLabel: found ? found.label : '筛选'
        });
      }
    }
  },

  methods: {
    /**
     * 输入关键词
     */
    onInput(e) {
      const keyword = e.detail.value;
      this.setData({ keyword });

      // 防抖处理
      if (this.data.debounceTimer) {
        clearTimeout(this.data.debounceTimer);
      }

      this.data.debounceTimer = setTimeout(() => {
        this.triggerSearch();
      }, this.properties.debounce);
    },

    /**
     * 点击搜索按钮
     */
    onSearch() {
      if (this.data.debounceTimer) {
        clearTimeout(this.data.debounceTimer);
      }
      this.triggerSearch();
    },

    /**
     * 触发搜索事件
     */
    triggerSearch() {
      this.triggerEvent('search', {
        keyword: this.data.keyword,
        filter: this.properties.filterValue
      });
    },

    /**
     * 清空搜索
     */
    onClear() {
      this.setData({ keyword: '' });
      this.triggerSearch();
    },

    /**
     * 显示/隐藏筛选下拉
     */
    toggleFilter() {
      this.setData({
        showFilter: !this.data.showFilter
      });
    },

    /**
     * 选择筛选项
     */
    onSelectFilter(e) {
      const value = e.currentTarget.dataset.value;
      this.setData({ showFilter: false });

      this.triggerEvent('filterChange', { value });

      // 切换筛选后触发搜索
      setTimeout(() => {
        this.triggerSearch();
      }, 50);
    },

    /**
     * 点击遮罩关闭筛选
     */
    hideFilter() {
      this.setData({ showFilter: false });
    }
  }
});
