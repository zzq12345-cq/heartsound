/**
 * Device Service
 * 设备连接服务模块
 *
 * Handles device discovery, connection, and status management.
 */

const DEFAULT_PORT = 8000;
const PING_TIMEOUT = 3000;
const CONNECT_TIMEOUT = 5000;

/**
 * Parse QR code content to extract device IP
 * 解析二维码内容获取设备IP
 *
 * @param {string} content - QR code content
 * @returns {{ ip: string, port: number } | null}
 */
function parseQRCode(content) {
  if (!content) return null;

  // Format: heartsound://connect?ip={IP}&port={PORT}&device_id={ID}
  const regex = /heartsound:\/\/connect\?ip=([^&]+)(?:&port=(\d+))?/;
  const match = content.match(regex);

  if (match) {
    return {
      ip: match[1],
      port: match[2] ? parseInt(match[2]) : DEFAULT_PORT
    };
  }

  // Fallback: check if it's a plain IP address
  const ipRegex = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;
  const ipMatch = content.match(ipRegex);

  if (ipMatch) {
    return {
      ip: ipMatch[1],
      port: DEFAULT_PORT
    };
  }

  return null;
}

/**
 * Validate IP address format
 * 验证IP地址格式
 *
 * @param {string} ip - IP address string
 * @returns {boolean}
 */
function validateIP(ip) {
  if (!ip) return false;

  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  return parts.every(part => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255;
  });
}

/**
 * Build device API URL
 * 构建设备API URL
 *
 * @param {string} ip - Device IP address
 * @param {string} path - API path
 * @param {number} port - Port number
 * @returns {string}
 */
function buildUrl(ip, path, port = DEFAULT_PORT) {
  return `http://${ip}:${port}${path}`;
}

/**
 * Ping device to check connection
 * 心跳检测设备连接
 *
 * @param {string} ip - Device IP address
 * @param {number} port - Port number
 * @returns {Promise<boolean>}
 */
function ping(ip, port = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    const url = buildUrl(ip, '/api/device/ping', port);

    wx.request({
      url,
      method: 'GET',
      timeout: PING_TIMEOUT,
      success(res) {
        if (res.statusCode === 200 && res.data.status === 'ok') {
          resolve(true);
        } else {
          reject(new Error('Invalid ping response'));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || 'Ping failed'));
      }
    });
  });
}

/**
 * Get device information
 * 获取设备信息
 *
 * @param {string} ip - Device IP address
 * @param {number} port - Port number
 * @returns {Promise<object>}
 */
function getDeviceInfo(ip, port = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    const url = buildUrl(ip, '/api/device/info', port);

    wx.request({
      url,
      method: 'GET',
      timeout: CONNECT_TIMEOUT,
      success(res) {
        if (res.statusCode === 200) {
          resolve(res.data);
        } else {
          reject(new Error(`Device returned status ${res.statusCode}`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || 'Failed to get device info'));
      }
    });
  });
}

/**
 * Connect to device
 * 连接设备
 *
 * @param {string} ip - Device IP address
 * @param {number} port - Port number
 * @returns {Promise<object>} Device info on success
 */
async function connect(ip, port = DEFAULT_PORT) {
  // Validate IP first
  if (!validateIP(ip)) {
    throw new Error('请输入有效的IP地址格式');
  }

  // Try to get device info
  try {
    const deviceInfo = await getDeviceInfo(ip, port);

    // Verify it's a HeartSound device
    if (!deviceInfo.device_id || !deviceInfo.device_id.startsWith('RPi')) {
      throw new Error('这不是心音智鉴设备');
    }

    console.log('[DeviceService] Connected to device:', deviceInfo);
    return deviceInfo;
  } catch (err) {
    console.error('[DeviceService] Connection failed:', err);

    // Provide user-friendly error messages
    if (err.message.includes('timeout')) {
      throw new Error('连接超时，请检查设备是否开机');
    } else if (err.message.includes('refused')) {
      throw new Error('连接被拒绝，请检查IP地址是否正确');
    } else if (err.message.includes('network')) {
      throw new Error('网络错误，请确保手机和设备在同一WiFi下');
    }

    throw new Error('连接失败，请检查设备状态');
  }
}

/**
 * Disconnect from device
 * 断开设备连接
 */
function disconnect() {
  const app = getApp();
  if (app) {
    app.clearDeviceConnection();
  }
  console.log('[DeviceService] Disconnected');
}

/**
 * Start detection session
 * 开始检测会话
 *
 * @param {string} ip - Device IP address
 * @param {object} options - Detection options
 * @returns {Promise<object>} Session info
 */
function startDetection(ip, options = {}) {
  return new Promise((resolve, reject) => {
    const url = buildUrl(ip, '/api/detection/start');

    wx.request({
      url,
      method: 'POST',
      data: {
        duration: options.duration || 30,
        user_id: options.userId || null
      },
      timeout: CONNECT_TIMEOUT,
      success(res) {
        if (res.statusCode === 200) {
          resolve(res.data);
        } else if (res.statusCode === 409) {
          reject(new Error('设备正在录制中，请稍后重试'));
        } else {
          reject(new Error('启动检测失败'));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || 'Failed to start detection'));
      }
    });
  });
}

/**
 * Get detection result
 * 获取检测结果
 *
 * @param {string} ip - Device IP address
 * @param {string} sessionId - Session ID
 * @returns {Promise<object>}
 */
function getDetectionResult(ip, sessionId) {
  return new Promise((resolve, reject) => {
    const url = buildUrl(ip, `/api/detection/${sessionId}/result`);

    wx.request({
      url,
      method: 'GET',
      timeout: CONNECT_TIMEOUT,
      success(res) {
        if (res.statusCode === 200) {
          resolve(res.data);
        } else if (res.statusCode === 404) {
          reject(new Error('检测会话不存在'));
        } else {
          reject(new Error('获取结果失败'));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || 'Failed to get result'));
      }
    });
  });
}

/**
 * Get WebSocket URL for audio streaming
 * 获取音频流WebSocket URL
 *
 * @param {string} ip - Device IP address
 * @param {string} sessionId - Session ID
 * @returns {string}
 */
function getWebSocketUrl(ip, sessionId, port = DEFAULT_PORT) {
  return `ws://${ip}:${port}/ws/audio/${sessionId}`;
}

module.exports = {
  parseQRCode,
  validateIP,
  buildUrl,
  ping,
  getDeviceInfo,
  connect,
  disconnect,
  startDetection,
  getDetectionResult,
  getWebSocketUrl,
  DEFAULT_PORT
};
