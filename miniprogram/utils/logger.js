/**
 * Logger Utility
 * 日志工具 - 统一日志输出，生产环境仅输出 error
 *
 * Usage:
 *   const logger = require('../../utils/logger');
 *   logger.log('[Module] message');
 *   logger.warn('[Module] warning');
 *   logger.error('[Module] error');
 *   logger.debug('[Module] debug info');
 */

// Detect environment: WeChat devtools sets __wxConfig.envVersion
// 'develop' = devtools, 'trial' = preview, 'release' = production
function isDevEnv() {
  try {
    const accountInfo = wx.getAccountInfoSync();
    return accountInfo.miniProgram.envVersion !== 'release';
  } catch (e) {
    // Fallback: assume dev if getAccountInfoSync fails
    return true;
  }
}

const __DEV__ = isDevEnv();

const logger = {
  log(...args) {
    if (__DEV__) console.log(...args);
  },

  warn(...args) {
    if (__DEV__) console.warn(...args);
  },

  error(...args) {
    // Always output errors
    console.error(...args);
  },

  debug(...args) {
    if (__DEV__) console.debug(...args);
  }
};

module.exports = logger;
