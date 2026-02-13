/**
 * Detection Service
 * 检测服务模块 - WebSocket连接和检测流程管理 (Bug修复版)
 *
 * 修复记录:
 * - 修复WebSocket超时定时器导致Promise多次reject的问题
 * - 修复Mock模式定时器泄漏问题
 * - 修复stopDetection在socket关闭后发送消息的问题
 * - 改用回调数组支持多页面注册，避免单例覆盖
 */

const deviceService = require('./device');
const { DETECTION, TIMEOUT } = require('../config/constants');

// Detection states
const STATES = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  RECORDING: 'recording',
  ANALYZING: 'analyzing',
  COMPLETED: 'completed',
  ERROR: 'error'
};

// Current detection session
let currentSession = {
  sessionId: null,
  state: STATES.IDLE,
  startTime: null,
  duration: DETECTION.RECORD_DURATION,
  result: null,
  error: null
};

// WebSocket task
let socketTask = null;
let isSocketOpen = false;

// Heartbeat state
let heartbeatTimer = null;
let missedPongs = 0;

// Callbacks - 改用数组支持多个回调
let audioFrameCallbacks = [];
let statusChangeCallbacks = [];
let completeCallbacks = [];
let errorCallbacks = [];

/**
 * Start a new detection session
 * 开始新的检测会话
 */
async function startDetection(options = {}) {
  const app = getApp();
  const { deviceIP, deviceInfo } = app.globalData;

  if (!deviceIP) {
    throw new Error('请先连接设备');
  }

  const duration = options.duration || 30;

  // Reset session
  currentSession = {
    sessionId: null,
    state: STATES.CONNECTING,
    startTime: null,
    duration: duration,
    result: null,
    error: null,
    isMock: false
  };

  notifyStatusChange(STATES.CONNECTING, '正在连接设备...');

  // 检查是否是模拟设备（开发测试模式）
  // 支持两种模拟设备格式：旧格式 MOCK-* 和新格式 00000000-* (UUID格式)
  const isMockDevice = deviceInfo && (
    (deviceInfo.device_id && deviceInfo.device_id.startsWith('MOCK-')) ||
    (deviceInfo.device_id && deviceInfo.device_id.startsWith('00000000-')) ||
    (deviceInfo.device_name && deviceInfo.device_name.includes('模拟'))
  );

  if (isMockDevice) {
    console.log('[DetectionService] Mock mode detected, using simulated data');
    return startMockDetection(duration);
  }

  try {
    // Call backend to start detection
    const response = await deviceService.startDetection(deviceIP, { duration });

    currentSession.sessionId = response.session_id;
    console.log('[DetectionService] Session started:', response.session_id);

    // Connect WebSocket
    await connectWebSocket(deviceIP, response.session_id);

    return {
      sessionId: response.session_id,
      websocketUrl: response.websocket_url
    };
  } catch (err) {
    currentSession.state = STATES.ERROR;
    currentSession.error = err.message;
    notifyError(err.message);
    throw err;
  }
}

/**
 * Mock detection for development testing
 * 模拟检测（开发测试用）
 */
function startMockDetection(duration) {
  const mockSessionId = 'MOCK-SESSION-' + Date.now();

  currentSession.sessionId = mockSessionId;
  currentSession.isMock = true;
  currentSession.state = STATES.RECORDING;
  currentSession.startTime = Date.now();

  console.log('[DetectionService] Mock session started:', mockSessionId);

  // 模拟音频帧数据
  let frameCount = 0;
  const frameInterval = setInterval(() => {
    if (currentSession.state !== STATES.RECORDING) {
      clearInterval(frameInterval);
      return;
    }

    frameCount++;
    const remainingSeconds = duration - Math.floor(frameCount / 10);

    // 生成模拟波形数据
    const mockWaveform = [];
    for (let i = 0; i < 128; i++) {
      // 模拟心跳波形
      const heartbeat = Math.sin(frameCount * 0.1 + i * 0.1) * 0.3;
      const noise = (Math.random() - 0.5) * 0.1;
      mockWaveform.push(0.5 + heartbeat + noise);
    }

    // 修复：遍历回调数组
    const frameData = {
      waveform: mockWaveform,
      amplitude: 0.5 + Math.sin(frameCount * 0.2) * 0.2,
      remainingSeconds: remainingSeconds,
      timestamp: Date.now()
    };
    audioFrameCallbacks.forEach(callback => {
      try {
        callback(frameData);
      } catch (e) {
        console.error('[DetectionService] Mock audio frame callback error:', e);
      }
    });
  }, DETECTION.MOCK_FRAME_INTERVAL); // 10fps

  // 保存定时器引用以便停止
  currentSession.mockFrameInterval = frameInterval;

  notifyStatusChange(STATES.RECORDING, '录制中（模拟模式）...');

  return {
    sessionId: mockSessionId,
    websocketUrl: 'mock://localhost/ws'
  };
}

/**
 * Get mock detection result
 * 获取模拟检测结果
 */
function getMockResult() {
  // 随机生成一个结果
  const categories = [
    { category: 'normal', label: '正常心音', risk_level: 'safe' },
    { category: 'systolic_murmur', label: '轻微收缩期杂音', risk_level: 'warning' },
    { category: 'normal', label: '正常心音', risk_level: 'safe' }
  ];

  const selected = categories[Math.floor(Math.random() * categories.length)];

  return {
    status: 'completed',
    result: {
      ...selected,
      confidence: 85 + Math.random() * 10,
      probabilities: {
        normal: selected.category === 'normal' ? 85 + Math.random() * 10 : 10 + Math.random() * 5,
        systolic_murmur: selected.category === 'systolic_murmur' ? 75 + Math.random() * 15 : 5 + Math.random() * 3,
        diastolic_murmur: 2 + Math.random() * 3,
        extra_heart_sound: 1 + Math.random() * 2,
        aortic_stenosis: 0.5 + Math.random() * 1
      },
      timestamp: Date.now()
    }
  };
}

/**
 * Connect to WebSocket for audio streaming
 * 连接WebSocket接收音频流
 * 修复：避免Promise多次resolve/reject
 */
function connectWebSocket(ip, sessionId) {
  return new Promise((resolve, reject) => {
    const wsUrl = deviceService.getWebSocketUrl(ip, sessionId);
    console.log('[DetectionService] Connecting WebSocket:', wsUrl);

    let settled = false; // 防止Promise多次settle
    isSocketOpen = false;

    socketTask = wx.connectSocket({
      url: wsUrl,
      timeout: TIMEOUT.WEBSOCKET_CONNECT
    });

    const connectTimeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        closeWebSocket();
        reject(new Error('WebSocket连接超时'));
      }
    }, TIMEOUT.WEBSOCKET_CONNECT);

    socketTask.onOpen(() => {
      if (settled) return; // 已经settled就不处理了
      settled = true;
      clearTimeout(connectTimeout);
      isSocketOpen = true;
      console.log('[DetectionService] WebSocket connected');

      // Send start command
      socketTask.send({
        data: JSON.stringify({
          command: 'start',
          duration: currentSession.duration
        })
      });

      // Start heartbeat
      startHeartbeat();

      resolve();
    });

    socketTask.onMessage((res) => {
      handleWebSocketMessage(res.data);
    });

    socketTask.onClose(() => {
      console.log('[DetectionService] WebSocket closed');
      isSocketOpen = false;
      socketTask = null;
    });

    socketTask.onError((err) => {
      if (settled) return; // 已经settled就不处理了
      settled = true;
      clearTimeout(connectTimeout);
      isSocketOpen = false;
      console.error('[DetectionService] WebSocket error:', err);
      reject(new Error('WebSocket连接失败'));
    });
  });
}

/**
 * Handle incoming WebSocket messages
 * 处理WebSocket消息
 */
function handleWebSocketMessage(data) {
  try {
    const message = typeof data === 'string' ? JSON.parse(data) : data;

    switch (message.type) {
      case 'status':
        handleStatusMessage(message);
        break;

      case 'audio_frame':
        handleAudioFrame(message);
        break;

      case 'recording_complete':
        handleRecordingComplete(message);
        break;

      case 'analysis_complete':
        handleAnalysisComplete(message);
        break;

      case 'error':
        handleErrorMessage(message);
        break;

      case 'pong':
        // Heartbeat response received, reset miss counter
        missedPongs = 0;
        break;

      default:
        console.log('[DetectionService] Unknown message type:', message.type);
    }
  } catch (err) {
    console.error('[DetectionService] Failed to parse message:', err);
  }
}

/**
 * Handle status message
 */
function handleStatusMessage(message) {
  console.log('[DetectionService] Status:', message.status);

  if (message.status === 'recording') {
    if (currentSession.state !== STATES.RECORDING) {
      currentSession.state = STATES.RECORDING;
      currentSession.startTime = Date.now();
    }
    notifyStatusChange(STATES.RECORDING, message.message || '录制中...', {
      remainingSeconds: message.remaining_seconds,
      progress: message.progress
    });
  } else if (message.status === 'analyzing') {
    currentSession.state = STATES.ANALYZING;
    notifyStatusChange(STATES.ANALYZING, message.message || '分析中...');
  } else if (message.status === 'connected') {
    notifyStatusChange(STATES.CONNECTING, '设备已连接');
  }
}

/**
 * Handle audio frame for waveform display
 * 修复：遍历回调数组，支持多页面
 */
function handleAudioFrame(message) {
  audioFrameCallbacks.forEach(callback => {
    try {
      callback({
        waveform: message.data,
        amplitude: message.amplitude,
        remainingSeconds: message.remaining_seconds,
        timestamp: message.timestamp
      });
    } catch (e) {
      console.error('[DetectionService] Audio frame callback error:', e);
    }
  });
}

/**
 * Handle recording complete
 */
function handleRecordingComplete(message) {
  console.log('[DetectionService] Recording complete');
  currentSession.state = STATES.ANALYZING;
  notifyStatusChange(STATES.ANALYZING, '录制完成，正在分析...');
}

/**
 * Handle analysis complete with results
 * 修复：遍历回调数组
 */
function handleAnalysisComplete(message) {
  console.log('[DetectionService] Analysis complete:', message.result);

  currentSession.state = STATES.COMPLETED;
  currentSession.result = message.result;

  // Close WebSocket
  closeWebSocket();

  // Notify completion - 遍历所有回调
  completeCallbacks.forEach(callback => {
    try {
      callback(message.result);
    } catch (e) {
      console.error('[DetectionService] Complete callback error:', e);
    }
  });

  notifyStatusChange(STATES.COMPLETED, '分析完成');
}

/**
 * Handle error message
 */
function handleErrorMessage(message) {
  console.error('[DetectionService] Error:', message.error, message.message);
  currentSession.state = STATES.ERROR;
  currentSession.error = message.message;
  notifyError(message.message);
}

/**
 * Stop detection
 * 停止检测
 * 修复：检查socket状态再发送消息
 */
function stopDetection() {
  console.log('[DetectionService] Stopping detection');

  // 清除模拟模式的定时器
  if (currentSession.mockFrameInterval) {
    clearInterval(currentSession.mockFrameInterval);
    currentSession.mockFrameInterval = null;
  }

  // 只有socket打开时才发送停止命令
  if (socketTask && isSocketOpen) {
    try {
      socketTask.send({
        data: JSON.stringify({ command: 'stop' })
      });
    } catch (e) {
      console.warn('[DetectionService] Failed to send stop command:', e);
    }
  }

  closeWebSocket();
  resetSession();
}

/**
 * Close WebSocket connection
 * 修复：更新isSocketOpen状态
 */
function closeWebSocket() {
  stopHeartbeat();
  isSocketOpen = false;
  if (socketTask) {
    try {
      socketTask.close();
    } catch (e) {
      // Ignore close errors
    }
    socketTask = null;
  }
}

/**
 * Reset session state
 */
function resetSession() {
  currentSession = {
    sessionId: null,
    state: STATES.IDLE,
    startTime: null,
    duration: DETECTION.RECORD_DURATION,
    result: null,
    error: null
  };
}

/**
 * Get detection result by polling
 * 轮询获取检测结果
 */
async function pollResult(sessionId) {
  const app = getApp();
  const { deviceIP } = app.globalData;

  // 模拟模式 - 直接返回模拟结果
  if (currentSession.isMock) {
    console.log('[DetectionService] Returning mock result');
    return getMockResult();
  }

  if (!currentSession.sessionId && !sessionId) {
    throw new Error('没有活动的检测会话');
  }

  const sid = sessionId || currentSession.sessionId;

  try {
    const result = await deviceService.getDetectionResult(deviceIP, sid);

    if (result.status === 'completed') {
      currentSession.result = result.result;
      currentSession.state = STATES.COMPLETED;
      return result;
    } else if (result.status === 'error') {
      throw new Error(result.message || '分析失败');
    }

    // Still processing
    return { status: 'processing' };
  } catch (err) {
    throw err;
  }
}

/**
 * Get current session state
 */
function getSessionState() {
  return { ...currentSession };
}

/**
 * Get result from current session
 */
function getResult() {
  return currentSession.result;
}

// ============================================================================
// Event Handlers - 修复：支持多回调注册/注销
// ============================================================================

/**
 * 注册音频帧回调
 * @param {Function} callback
 * @returns {Function} 返回注销函数，调用即可移除回调
 */
function onAudioFrame(callback) {
  if (typeof callback === 'function') {
    audioFrameCallbacks.push(callback);
  }
  // 返回注销函数
  return () => {
    const index = audioFrameCallbacks.indexOf(callback);
    if (index > -1) {
      audioFrameCallbacks.splice(index, 1);
    }
  };
}

/**
 * 注册状态变化回调
 * @param {Function} callback
 * @returns {Function} 返回注销函数
 */
function onStatusChange(callback) {
  if (typeof callback === 'function') {
    statusChangeCallbacks.push(callback);
  }
  return () => {
    const index = statusChangeCallbacks.indexOf(callback);
    if (index > -1) {
      statusChangeCallbacks.splice(index, 1);
    }
  };
}

/**
 * 注册完成回调
 * @param {Function} callback
 * @returns {Function} 返回注销函数
 */
function onComplete(callback) {
  if (typeof callback === 'function') {
    completeCallbacks.push(callback);
  }
  return () => {
    const index = completeCallbacks.indexOf(callback);
    if (index > -1) {
      completeCallbacks.splice(index, 1);
    }
  };
}

/**
 * 注册错误回调
 * @param {Function} callback
 * @returns {Function} 返回注销函数
 */
function onError(callback) {
  if (typeof callback === 'function') {
    errorCallbacks.push(callback);
  }
  return () => {
    const index = errorCallbacks.indexOf(callback);
    if (index > -1) {
      errorCallbacks.splice(index, 1);
    }
  };
}

/**
 * 通知状态变化 - 遍历所有回调
 */
function notifyStatusChange(state, message, extra = {}) {
  statusChangeCallbacks.forEach(callback => {
    try {
      callback({ state, message, ...extra });
    } catch (e) {
      console.error('[DetectionService] Status change callback error:', e);
    }
  });
}

/**
 * 通知错误 - 遍历所有回调
 */
function notifyError(message) {
  const error = new Error(message);
  errorCallbacks.forEach(callback => {
    try {
      callback(error);
    } catch (e) {
      console.error('[DetectionService] Error callback error:', e);
    }
  });
}

// ============================================================================
// Heartbeat
// ============================================================================

/**
 * Start WebSocket heartbeat ping
 * Sends ping every HEARTBEAT_INTERVAL, disconnects after HEARTBEAT_MAX_MISS missed pongs
 */
function startHeartbeat() {
  stopHeartbeat();
  missedPongs = 0;

  heartbeatTimer = setInterval(() => {
    if (!socketTask || !isSocketOpen) {
      stopHeartbeat();
      return;
    }

    missedPongs++;

    if (missedPongs > TIMEOUT.HEARTBEAT_MAX_MISS) {
      console.warn('[DetectionService] Heartbeat timeout, connection lost');
      stopHeartbeat();
      // Notify disconnect but don't auto-reconnect
      notifyError('设备连接已断开，请重试');
      closeWebSocket();
      return;
    }

    try {
      socketTask.send({
        data: JSON.stringify({ type: 'ping' })
      });
    } catch (e) {
      console.warn('[DetectionService] Heartbeat send failed:', e);
    }
  }, TIMEOUT.HEARTBEAT_INTERVAL);
}

/**
 * Stop heartbeat timer
 */
function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  missedPongs = 0;
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  STATES,
  startDetection,
  stopDetection,
  pollResult,
  getSessionState,
  getResult,
  onAudioFrame,
  onStatusChange,
  onComplete,
  onError,
  resetSession
};
