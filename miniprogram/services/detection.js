/**
 * Detection Service
 * 检测服务模块 - WebSocket连接和检测流程管理
 */

const deviceService = require('./device');

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
  duration: 30,
  result: null,
  error: null
};

// WebSocket task
let socketTask = null;

// Callbacks
let onAudioFrameCallback = null;
let onStatusChangeCallback = null;
let onCompleteCallback = null;
let onErrorCallback = null;

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
  const isMockDevice = deviceInfo && deviceInfo.device_id && deviceInfo.device_id.startsWith('MOCK-');

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

    if (onAudioFrameCallback) {
      onAudioFrameCallback({
        waveform: mockWaveform,
        amplitude: 0.5 + Math.sin(frameCount * 0.2) * 0.2,
        remainingSeconds: remainingSeconds,
        timestamp: Date.now()
      });
    }
  }, 100); // 10fps

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
 */
function connectWebSocket(ip, sessionId) {
  return new Promise((resolve, reject) => {
    const wsUrl = deviceService.getWebSocketUrl(ip, sessionId);
    console.log('[DetectionService] Connecting WebSocket:', wsUrl);

    socketTask = wx.connectSocket({
      url: wsUrl,
      timeout: 5000
    });

    const connectTimeout = setTimeout(() => {
      reject(new Error('WebSocket连接超时'));
    }, 5000);

    socketTask.onOpen(() => {
      clearTimeout(connectTimeout);
      console.log('[DetectionService] WebSocket connected');

      // Send start command
      socketTask.send({
        data: JSON.stringify({
          command: 'start',
          duration: currentSession.duration
        })
      });

      resolve();
    });

    socketTask.onMessage((res) => {
      handleWebSocketMessage(res.data);
    });

    socketTask.onClose(() => {
      console.log('[DetectionService] WebSocket closed');
      socketTask = null;
    });

    socketTask.onError((err) => {
      clearTimeout(connectTimeout);
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
        // Keep-alive response, ignore
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
 */
function handleAudioFrame(message) {
  if (onAudioFrameCallback) {
    onAudioFrameCallback({
      waveform: message.data,
      amplitude: message.amplitude,
      remainingSeconds: message.remaining_seconds,
      timestamp: message.timestamp
    });
  }
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
 */
function handleAnalysisComplete(message) {
  console.log('[DetectionService] Analysis complete:', message.result);

  currentSession.state = STATES.COMPLETED;
  currentSession.result = message.result;

  // Close WebSocket
  closeWebSocket();

  // Notify completion
  if (onCompleteCallback) {
    onCompleteCallback(message.result);
  }

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
 */
function stopDetection() {
  console.log('[DetectionService] Stopping detection');

  // 清除模拟模式的定时器
  if (currentSession.mockFrameInterval) {
    clearInterval(currentSession.mockFrameInterval);
    currentSession.mockFrameInterval = null;
  }

  if (socketTask) {
    try {
      socketTask.send({
        data: JSON.stringify({ command: 'stop' })
      });
    } catch (e) {
      // Ignore send errors
    }
  }

  closeWebSocket();
  resetSession();
}

/**
 * Close WebSocket connection
 */
function closeWebSocket() {
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
    duration: 30,
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
// Event Handlers
// ============================================================================

function onAudioFrame(callback) {
  onAudioFrameCallback = callback;
}

function onStatusChange(callback) {
  onStatusChangeCallback = callback;
}

function onComplete(callback) {
  onCompleteCallback = callback;
}

function onError(callback) {
  onErrorCallback = callback;
}

function notifyStatusChange(state, message, extra = {}) {
  if (onStatusChangeCallback) {
    onStatusChangeCallback({ state, message, ...extra });
  }
}

function notifyError(message) {
  if (onErrorCallback) {
    onErrorCallback(new Error(message));
  }
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
