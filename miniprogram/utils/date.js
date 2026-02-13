/**
 * Date Utility Functions
 * 日期格式化工具 - 统一日期处理，杜绝重复代码
 */

const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;

/**
 * Pad number with leading zero
 * @param {number} n
 * @returns {string}
 */
function padZero(n) {
  return n < 10 ? '0' + n : '' + n;
}

/**
 * Get today/yesterday date boundaries
 * @returns {{ today: Date, yesterday: Date }}
 */
function _getDateBounds() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - ONE_DAY);
  return { now, today, yesterday };
}

/**
 * Format date to "今天" / "昨天" / "MM月DD日"
 * @param {string|number|Date} dateString
 * @returns {string}
 */
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const { today, yesterday } = _getDateBounds();
  const recordDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (recordDate.getTime() === today.getTime()) {
    return '今天';
  } else if (recordDate.getTime() === yesterday.getTime()) {
    return '昨天';
  } else {
    return `${padZero(date.getMonth() + 1)}月${padZero(date.getDate())}日`;
  }
}

/**
 * Format date to HH:mm
 * @param {Date|string|number} date
 * @returns {string}
 */
function formatTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return `${padZero(d.getHours())}:${padZero(d.getMinutes())}`;
}

/**
 * Format date to "今天 HH:mm" / "昨天 HH:mm" / "MM-DD HH:mm"
 * @param {string|number|Date} dateString
 * @returns {string}
 */
function formatDateTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const { today, yesterday } = _getDateBounds();
  const recordDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const time = formatTime(date);

  if (recordDate.getTime() === today.getTime()) {
    return `今天 ${time}`;
  } else if (recordDate.getTime() === yesterday.getTime()) {
    return `昨天 ${time}`;
  } else {
    return `${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${time}`;
  }
}

/**
 * Format timestamp to relative time: 刚刚/X分钟前/X小时前/X天前/MM月DD日
 * @param {string|number|Date} timestamp
 * @returns {string}
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const diff = Date.now() - date.getTime();

  if (diff < ONE_MINUTE) return '刚刚';
  if (diff < ONE_HOUR) return `${Math.floor(diff / ONE_MINUTE)}分钟前`;
  if (diff < ONE_DAY) return `${Math.floor(diff / ONE_HOUR)}小时前`;
  if (diff < 7 * ONE_DAY) return `${Math.floor(diff / ONE_DAY)}天前`;

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * Format timestamp to label: 今天 HH:mm / 昨天 HH:mm / 周X / M/D
 * Used for conversation history display
 * @param {string|number} timestamp - Unix timestamp (seconds) or ISO string
 * @returns {string}
 */
function formatTimeLabel(timestamp) {
  if (!timestamp) return '';

  const date = new Date(
    typeof timestamp === 'number' ? timestamp * 1000 : timestamp
  );
  const now = new Date();
  const diff = now - date;

  if (diff < ONE_DAY && now.getDate() === date.getDate()) {
    return `今天 ${padZero(date.getHours())}:${padZero(date.getMinutes())}`;
  } else if (diff < 2 * ONE_DAY) {
    return `昨天 ${padZero(date.getHours())}:${padZero(date.getMinutes())}`;
  } else if (diff < 7 * ONE_DAY) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[date.getDay()];
  } else {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}

/**
 * Format to full datetime: YYYY-MM-DD HH:mm
 * @param {string|number|Date} value
 * @returns {string}
 */
function formatFullDateTime(value) {
  if (!value) return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:${padZero(date.getMinutes())}`;
}

module.exports = {
  padZero,
  formatDate,
  formatTime,
  formatDateTime,
  formatRelativeTime,
  formatTimeLabel,
  formatFullDateTime
};
