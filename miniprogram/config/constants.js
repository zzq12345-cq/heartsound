/**
 * Constants Configuration
 * 全局常量配置 - 集中管理魔法数字
 */

/** Detection related constants */
const DETECTION = {
  /** Recording duration in seconds */
  RECORD_DURATION: 30,
  /** Max poll attempts for result */
  MAX_POLL_COUNT: 30,
  /** Poll interval in ms */
  POLL_INTERVAL: 500,
  /** Poll retry interval on error in ms */
  POLL_RETRY_INTERVAL: 1000,
  /** Auto-start delay in ms */
  AUTO_START_DELAY: 1000,
  /** Tip rotation interval in ms */
  TIP_ROTATION_INTERVAL: 5000,
  /** Mock audio frame rate interval in ms (10fps) */
  MOCK_FRAME_INTERVAL: 100,
  /** Max local history records */
  MAX_LOCAL_HISTORY: 50
};

/** Timeout constants in ms */
const TIMEOUT = {
  /** WebSocket connection timeout */
  WEBSOCKET_CONNECT: 5000,
  /** Heartbeat ping interval */
  HEARTBEAT_INTERVAL: 15000,
  /** Max missed pongs before disconnect */
  HEARTBEAT_MAX_MISS: 2
};

/** UI timing constants in ms */
const UI = {
  /** Animation show delay */
  ANIMATION_DELAY: 300,
  /** Page redirect delay after completion */
  REDIRECT_DELAY: 800,
  /** Toast display duration before navigate */
  TOAST_NAVIGATE_DELAY: 1500,
  /** Emergency call prompt delay */
  EMERGENCY_CALL_DELAY: 1000,
  /** Auto-ask detection context delay */
  AUTO_ASK_DELAY: 500,
  /** Stage durations for analyzing animation */
  STAGE_DURATIONS: [1200, 1500, 2000, 1000]
};

/** Pagination constants */
const PAGINATION = {
  /** Records page size */
  RECORDS_PAGE_SIZE: 20,
  /** Report history page size */
  REPORT_PAGE_SIZE: 20,
  /** Stats fetch page size */
  STATS_PAGE_SIZE: 100,
  /** Conversation list limit */
  CONVERSATION_LIMIT: 30
};

/** Cache timing constants in ms */
const CACHE = {
  /** Records page cache duration */
  RECORDS_CACHE_DURATION: 30000
};

module.exports = {
  DETECTION,
  TIMEOUT,
  UI,
  PAGINATION,
  CACHE
};
