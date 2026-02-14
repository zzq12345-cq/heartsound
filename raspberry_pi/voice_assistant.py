#!/usr/bin/env python3
"""
HeartSound Voice Assistant
心音智鉴语音助手 - 树莓派端语音交互（语音唤醒版）

流程: 持续监听 → 检测到说话自动录音 → 静音自动停止 → ASR → 唤醒词"小智"检测 → OpenClaw → TTS → 播放 → 继续监听
"""

import os
import sys
import json
import struct
import subprocess
import tempfile
import uuid
import wave
import time
import shutil
from vosk import Model, KaldiRecognizer

# ============================================================
# Configuration
# ============================================================
OPENCLAW_WS = os.environ.get("OPENCLAW_WS", "ws://127.0.0.1:18789")
OPENCLAW_SESSION_KEY = os.environ.get("OPENCLAW_SESSION_KEY", os.environ.get("OPENCLAW_SESSION_ID", "main"))
OPENCLAW_PROTOCOL_VERSION = 3
try:
    OPENCLAW_AGENT_TIMEOUT = int(os.environ.get("OPENCLAW_AGENT_TIMEOUT", "18"))
except ValueError:
    OPENCLAW_AGENT_TIMEOUT = 18
OPENCLAW_AGENT_TIMEOUT = max(8, min(60, OPENCLAW_AGENT_TIMEOUT))

# Audio settings
RATE = 16000
RECORD_SECONDS_MAX = 8        # 单次录音最长秒数（缩短以降低整体延迟）
CHUNK_DURATION = 0.2          # 每次检测片段长度（秒）
CHUNK_BYTES = int(RATE * 2 * CHUNK_DURATION)  # 16-bit mono

# VAD (Voice Activity Detection) settings
try:
    SILENCE_THRESHOLD = int(os.environ.get("SILENCE_THRESHOLD", "900"))  # 音量阈值（16-bit 范围 0~32767）
except ValueError:
    SILENCE_THRESHOLD = 900

try:
    VAD_MAX_THRESHOLD = int(os.environ.get("VAD_MAX_THRESHOLD", "12000"))
except ValueError:
    VAD_MAX_THRESHOLD = 12000
VAD_MAX_THRESHOLD = max(3000, min(24000, VAD_MAX_THRESHOLD))

try:
    VAD_TRIGGER_DECAY = float(os.environ.get("VAD_TRIGGER_DECAY", "0.88"))
except ValueError:
    VAD_TRIGGER_DECAY = 0.88
VAD_TRIGGER_DECAY = max(0.70, min(0.98, VAD_TRIGGER_DECAY))

SILENCE_TIMEOUT = 0.8         # 说完话后静音多久停止录音（秒）
MIN_SPEECH_DURATION = 0.35    # 最短有效语音时长（秒），过短丢弃
NOISE_CALIBRATION_SECONDS = 1.0  # 启动后先采样噪声底噪用于动态阈值

# Wake word (唤醒词)
WAKE_WORDS = ["小智", "小知", "小志", "小枝", "晓智", "筱智", "导致", "角质", "调制", "小只"]  # 加强同音容错

# Local ASR (完全免费离线)
VOSK_MODEL_PATH = os.path.expanduser(os.environ.get("VOSK_MODEL_PATH", "~/models/vosk-cn"))

# ============================================================
# ⚠️ 音频硬件参数 - 已验证稳定，禁止修改！
# 树莓派 bcm2835 板载声卡 PCM 音量必须保持 78%，
# 低于此值语音听不清，高于此值底噪过大。
# OUTPUT_DEVICE 必须为 plughw:2,0（板载3.5mm耳机口）。
# ============================================================
ALSA_PCM_VOLUME = 78  # 禁止修改！已验证最佳值
INPUT_DEVICE = os.environ.get("INPUT_DEVICE", "plughw:3,0")   # USB microphone
OUTPUT_DEVICE = os.environ.get("OUTPUT_DEVICE", "plughw:2,0")  # 板载3.5mm耳机口

# TTS tuning
TTS_ENGINE = os.environ.get("TTS_ENGINE", "edge").strip().lower()  # edge | espeak
TTS_ALLOW_FALLBACK = os.environ.get("TTS_ALLOW_FALLBACK", "1").strip().lower() not in {"0", "false", "no"}

# Edge TTS 参数（高音质在线语音）
EDGE_TTS_VOICE = os.environ.get("EDGE_TTS_VOICE", "zh-CN-XiaoxiaoNeural").strip()
EDGE_TTS_RATE = os.environ.get("EDGE_TTS_RATE", "+0%").strip()
EDGE_TTS_PITCH = os.environ.get("EDGE_TTS_PITCH", "+0Hz").strip()
EDGE_TTS_VOLUME = os.environ.get("EDGE_TTS_VOLUME", "+0%").strip()

# espeak 参数
ESPEAK_VOICE = "zh"
ESPEAK_SPEED = "165"

# OpenClaw gateway client settings
GATEWAY_CLIENT_ID = "gateway-client"
GATEWAY_CLIENT_MODE = "backend"
GATEWAY_CLIENT_DISPLAY_NAME = "heartsound-voice-assistant"
GATEWAY_CLIENT_VERSION = "0.1.0"
GATEWAY_ROLE = "operator"
GATEWAY_SCOPES = ["operator.admin", "operator.approvals", "operator.pairing"]


# ============================================================
# Initialize
# ============================================================
ARECORD_BIN = shutil.which("arecord") or shutil.which("/opt/homebrew/bin/arecord")
APLAY_BIN = shutil.which("aplay") or shutil.which("/opt/homebrew/bin/aplay")
FFMPEG_BIN = shutil.which("ffmpeg") or shutil.which("/opt/homebrew/bin/ffmpeg")
EDGE_TTS_BIN = shutil.which("edge-tts") or shutil.which("/opt/homebrew/bin/edge-tts")
ESPEAK_BIN = shutil.which("espeak-ng") or shutil.which("/opt/homebrew/bin/espeak-ng")


vosk_model = None
if os.path.exists(VOSK_MODEL_PATH):
    try:
        vosk_model = Model(VOSK_MODEL_PATH)
    except Exception as e:
        print(f"❌ Vosk 模型加载失败: {e}")
else:
    print(f"⚠️ 未找到 Vosk 模型目录: {VOSK_MODEL_PATH}")
    print("   先下载中文模型并解压到该目录再运行")

# 动态阈值（启动后基于环境噪声更新）
DYNAMIC_THRESHOLD = SILENCE_THRESHOLD


def _normalize_ws_url(base: str):
    value = (base or "").strip()
    if not value:
        return "ws://127.0.0.1:18789"
    if value.startswith("http://"):
        return "ws://" + value[len("http://"):]
    if value.startswith("https://"):
        return "wss://" + value[len("https://"):]
    if value.startswith("ws://") or value.startswith("wss://"):
        return value
    return "ws://" + value


def _b64url_encode(data: bytes):
    import base64

    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _resolve_openclaw_state_dir():
    env_dir = os.environ.get("OPENCLAW_STATE_DIR", "").strip() or os.environ.get("CLAWDBOT_STATE_DIR", "").strip()
    if env_dir:
        return env_dir

    # 与 OpenClaw 默认行为对齐: ~/.openclaw
    return os.path.expanduser("~/.openclaw")


def load_or_create_device_identity():
    state_dir = _resolve_openclaw_state_dir()
    identity_path = os.path.join(state_dir, "identity", "device.json")
    os.makedirs(os.path.dirname(identity_path), exist_ok=True)

    if os.path.exists(identity_path):
        try:
            with open(identity_path, "r", encoding="utf-8") as f:
                obj = json.load(f)
            if (
                obj.get("version") == 1
                and isinstance(obj.get("deviceId"), str)
                and isinstance(obj.get("publicKeyPem"), str)
                and isinstance(obj.get("privateKeyPem"), str)
            ):
                return {
                    "deviceId": obj["deviceId"],
                    "publicKeyPem": obj["publicKeyPem"],
                    "privateKeyPem": obj["privateKeyPem"],
                }
        except Exception:
            pass

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    import hashlib

    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    public_key_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    private_key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    public_der = public_key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    # SPKI Ed25519 prefix: 302a300506032b6570032100, raw key tail 32 bytes
    raw_pub = public_der[-32:]
    device_id = hashlib.sha256(raw_pub).hexdigest()

    stored = {
        "version": 1,
        "deviceId": device_id,
        "publicKeyPem": public_key_pem,
        "privateKeyPem": private_key_pem,
        "createdAtMs": int(time.time() * 1000),
    }
    with open(identity_path, "w", encoding="utf-8") as f:
        json.dump(stored, f, ensure_ascii=False, indent=2)
        f.write("\n")

    return {
        "deviceId": device_id,
        "publicKeyPem": public_key_pem,
        "privateKeyPem": private_key_pem,
    }


def public_key_raw_base64url_from_pem(public_key_pem: str):
    from cryptography.hazmat.primitives import serialization

    public_key = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
    public_der = public_key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    raw_pub = public_der[-32:]
    return _b64url_encode(raw_pub)


def build_device_auth_payload(
    *,
    device_id: str,
    client_id: str,
    client_mode: str,
    role: str,
    scopes,
    signed_at_ms: int,
    token=None,
    nonce=None,
):
    scopes_text = ",".join(scopes or [])
    token_text = token or ""
    version = "v2" if nonce else "v1"
    base = [
        version,
        device_id,
        client_id,
        client_mode,
        role,
        scopes_text,
        str(signed_at_ms),
        token_text,
    ]
    if version == "v2":
        base.append(nonce or "")
    return "|".join(base)


def sign_device_payload(private_key_pem: str, payload: str):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    private_key = serialization.load_pem_private_key(private_key_pem.encode("utf-8"), password=None)
    if not isinstance(private_key, Ed25519PrivateKey):
        raise RuntimeError("device private key is not Ed25519")
    signature = private_key.sign(payload.encode("utf-8"))
    return _b64url_encode(signature)


def _read_device_auth_store():
    state_dir = _resolve_openclaw_state_dir()
    path = os.path.join(state_dir, "identity", "device-auth.json")
    if not os.path.exists(path):
        return None, path
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f), path
    except Exception:
        return None, path


def load_device_auth_token(device_id: str, role: str):
    store, _ = _read_device_auth_store()
    if not store:
        return None
    if store.get("version") != 1:
        return None
    if store.get("deviceId") != device_id:
        return None
    tokens = store.get("tokens") or {}
    entry = tokens.get(role)
    if isinstance(entry, dict) and isinstance(entry.get("token"), str):
        return entry.get("token")
    return None


def store_device_auth_token(device_id: str, role: str, token: str, scopes=None):
    store, path = _read_device_auth_store()
    if not isinstance(store, dict) or store.get("version") != 1 or store.get("deviceId") != device_id:
        store = {"version": 1, "deviceId": device_id, "tokens": {}}

    scopes_arr = sorted(list(set([s.strip() for s in (scopes or []) if isinstance(s, str) and s.strip()])))
    if "tokens" not in store or not isinstance(store.get("tokens"), dict):
        store["tokens"] = {}

    store["tokens"][role] = {
        "token": token,
        "role": role,
        "scopes": scopes_arr,
        "updatedAtMs": int(time.time() * 1000),
    }

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
        f.write("\n")


def clear_device_auth_token(device_id: str, role: str):
    store, path = _read_device_auth_store()
    if not isinstance(store, dict):
        return
    if store.get("version") != 1 or store.get("deviceId") != device_id:
        return
    tokens = store.get("tokens")
    if not isinstance(tokens, dict):
        return
    if role not in tokens:
        return

    del tokens[role]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
        f.write("\n")


def _resolve_openclaw_config_path():
    explicit = os.environ.get("OPENCLAW_CONFIG_PATH", "").strip() or os.environ.get("CLAWDBOT_CONFIG_PATH", "").strip()
    if explicit:
        return os.path.expanduser(explicit)

    state_dir = _resolve_openclaw_state_dir()
    candidates = ["openclaw.json", "clawdbot.json", "moltbot.json", "moldbot.json"]
    for name in candidates:
        path = os.path.join(state_dir, name)
        if os.path.exists(path):
            return path
    return os.path.join(state_dir, "openclaw.json")


def get_openclaw_token():
    """Read OpenClaw auth token from config"""
    config_path = _resolve_openclaw_config_path()
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
        return config.get("gateway", {}).get("auth", {}).get("token", "")
    except Exception:
        return ""


def get_amplitude(raw_data):
    """Calculate max amplitude from raw PCM S16_LE data"""
    n_samples = len(raw_data) // 2
    if n_samples == 0:
        return 0
    samples = struct.unpack(f"<{n_samples}h", raw_data[:n_samples * 2])
    return max(abs(s) for s in samples)


def record_audio():
    """Voice-activated recording using arecord + VAD

    持续监听麦克风，检测到人声自动开始录音，
    静音超过 SILENCE_TIMEOUT 秒自动停止。
    无需按任何键。
    """
    global DYNAMIC_THRESHOLD
    if not ARECORD_BIN:
        raise RuntimeError("缺少 arecord，请先安装 alsa-utils")

    trigger_threshold = min(DYNAMIC_THRESHOLD, VAD_MAX_THRESHOLD)
    if trigger_threshold < DYNAMIC_THRESHOLD:
        print(f"⚠️ 触发阈值已限制: {DYNAMIC_THRESHOLD} -> {trigger_threshold}")

    print(f"👂 正在监听... (说话即开始录音, 阈值={trigger_threshold})")

    # 用 arecord 持续录制原始 PCM 流到 stdout
    proc = subprocess.Popen(
        [
            ARECORD_BIN,
            "-D", INPUT_DEVICE,
            "-f", "S16_LE",
            "-r", str(RATE),
            "-c", "1",
            "-t", "raw",        # 输出原始 PCM
            "-q",                 # 安静模式
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )

    frames = []
    is_recording = False
    silent_time = 0.0
    speech_time = 0.0
    max_record_chunks = int(RECORD_SECONDS_MAX / CHUNK_DURATION)
    max_listen_chunks = int(8 / CHUNK_DURATION)  # 等待触发最多8秒，避免死等

    try:
        # 阶段1：等待触发
        triggered = False
        for _ in range(max_listen_chunks):
            data = proc.stdout.read(CHUNK_BYTES)
            if not data or len(data) < CHUNK_BYTES:
                break
            amplitude = get_amplitude(data)
            if amplitude > trigger_threshold:
                triggered = True
                is_recording = True
                speech_time = CHUNK_DURATION
                silent_time = 0.0
                frames = [data]
                print(f"🎤 检测到语音，开始录音... (amp={amplitude})")
                break

        if not triggered:
            return None

        # 阶段2：录音直到静音或超时
        for _ in range(max_record_chunks):
            data = proc.stdout.read(CHUNK_BYTES)
            if not data or len(data) < CHUNK_BYTES:
                break

            amplitude = get_amplitude(data)
            frames.append(data)
            speech_time += CHUNK_DURATION

            if amplitude > trigger_threshold:
                silent_time = 0.0
            else:
                silent_time += CHUNK_DURATION

            # 静音超时 → 停止
            if silent_time >= SILENCE_TIMEOUT:
                print("🔇 静音检测，停止录音")
                break

            # 超过最大时长 → 停止
            if speech_time >= RECORD_SECONDS_MAX:
                print("⏱️ 达到最大录音时长")
                break
    finally:
        proc.terminate()
        proc.wait()

    if not frames or speech_time < MIN_SPEECH_DURATION:
        print("❌ 语音太短，已忽略")
        return None

    # 保存为 WAV 文件
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    with wave.open(tmp.name, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(RATE)
        wf.writeframes(b"".join(frames))

    duration = speech_time
    size_kb = os.path.getsize(tmp.name) / 1024
    print(f"✅ 录音完成 ({duration:.1f}秒, {size_kb:.0f}KB)")
    return tmp.name


def speech_to_text(audio_path):
    """Offline speech-to-text using Vosk (免费本地离线)"""
    print("🔄 本地语音识别中...")

    if vosk_model is None:
        print("❌ Vosk 模型未加载，无法识别")
        try:
            os.unlink(audio_path)
        except OSError:
            pass
        return None

    try:
        with wave.open(audio_path, "rb") as wf:
            # 录音函数已保证 16k/mono/16bit，这里做一次保护性检查
            if wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getframerate() != RATE:
                print("❌ 音频格式不匹配，需要 16kHz/单声道/16bit")
                return None

            rec = KaldiRecognizer(vosk_model, RATE)
            while True:
                data = wf.readframes(4000)
                if len(data) == 0:
                    break
                rec.AcceptWaveform(data)

            result = json.loads(rec.FinalResult())
            text = result.get("text", "").strip()

        if text:
            print(f"📝 识别结果: {text}")
            return text

        print("❌ 未识别到文字")
        return None
    except Exception as e:
        print(f"❌ 语音识别失败: {e}")
        return None
    finally:
        try:
            os.unlink(audio_path)
        except OSError:
            pass


def calibrate_noise_threshold():
    """启动时采样环境噪声，自动更新触发阈值"""
    global DYNAMIC_THRESHOLD

    if not ARECORD_BIN:
        print(f"⚠️ 未找到 arecord，跳过噪声校准，使用默认阈值 {SILENCE_THRESHOLD}")
        DYNAMIC_THRESHOLD = SILENCE_THRESHOLD
        return

    sample_bytes = int(RATE * 2 * NOISE_CALIBRATION_SECONDS)
    try:
        proc = subprocess.run(
            [
                ARECORD_BIN,
                "-D", INPUT_DEVICE,
                "-f", "S16_LE",
                "-r", str(RATE),
                "-c", "1",
                "-d", str(max(1, int(NOISE_CALIBRATION_SECONDS))),
                "-t", "raw",
                "-q",
            ],
            capture_output=True,
            timeout=5,
        )
        data = proc.stdout[:sample_bytes]
        noise_amp = get_amplitude(data) if data else 0

        # 动态阈值 = max(默认阈值, 噪声幅度*2.2 + 安全余量)
        auto_threshold = int(noise_amp * 2.2 + 120)
        DYNAMIC_THRESHOLD = max(SILENCE_THRESHOLD, auto_threshold)

        # 阈值过高会导致“永远触发不了”，做上限保护并给出提示
        if DYNAMIC_THRESHOLD > VAD_MAX_THRESHOLD:
            print(f"⚠️ 校准阈值过高({DYNAMIC_THRESHOLD})，已钳制到 {VAD_MAX_THRESHOLD}")
            DYNAMIC_THRESHOLD = VAD_MAX_THRESHOLD

        print(f"🔧 噪声校准: noise={noise_amp}, threshold={DYNAMIC_THRESHOLD}")
    except Exception as e:
        print(f"⚠️ 噪声校准失败，使用默认阈值 {SILENCE_THRESHOLD}: {e}")
        DYNAMIC_THRESHOLD = SILENCE_THRESHOLD


def check_wake_word(text):
    """检查文本是否包含唤醒词，返回唤醒词后面的指令内容

    支持两种用法：
    1. "小智，今天天气怎么样" → 直接提取指令 "今天天气怎么样"
    2. "小智" (只说唤醒词) → 返回空字符串，表示已唤醒但需要继续听指令
    """
    for word in WAKE_WORDS:
        pos = text.find(word)
        if pos != -1:
            # 提取唤醒词后面的内容
            after = text[pos + len(word):]
            # 去掉开头的标点和空格
            after = after.lstrip("，,。. 、：:！!？?")
            return after  # 可能是空字符串（只说了唤醒词）
    return None  # 没有检测到唤醒词

class OpenClawGatewayClient:
    """OpenClaw WebSocket 长连接客户端（握手+请求复用）"""

    def __init__(self, ws_url: str):
        self.ws_url = _normalize_ws_url(ws_url)
        self.identity = load_or_create_device_identity()
        self._conn = None
        self._connected = False
        self._hello = None

    def close(self):
        conn = self._conn
        self._conn = None
        self._connected = False
        self._hello = None
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    def _ensure_lib(self):
        try:
            import websockets  # noqa: F401
        except Exception as e:
            raise RuntimeError(
                "缺少 websockets 依赖，请在树莓派执行: pip3 install websockets"
            ) from e

    def _connect_ws(self, timeout_s: float = 6.0):
        self._ensure_lib()
        from websockets.sync.client import connect

        return connect(
            self.ws_url,
            open_timeout=timeout_s,
            close_timeout=2,
            ping_interval=20,
            ping_timeout=20,
            max_size=5 * 1024 * 1024,
        )

    def _send_json(self, obj):
        self._conn.send(json.dumps(obj, ensure_ascii=False))

    def _recv_json(self, timeout_s: float):
        raw = self._conn.recv(timeout=timeout_s)
        return json.loads(raw)

    def _wait_until(self, target_id: str, timeout_s: float, expect_final: bool = False):
        deadline = time.time() + max(0.1, timeout_s)
        while True:
            remain = deadline - time.time()
            if remain <= 0:
                raise TimeoutError(f"gateway request timeout: {target_id}")

            frame = self._recv_json(remain)
            f_type = frame.get("type")

            if f_type == "event":
                # connect.challenge / tick 等事件，非阻塞处理
                continue

            if f_type != "res":
                continue

            if frame.get("id") != target_id:
                continue

            if not frame.get("ok", False):
                err = frame.get("error") or {}
                msg = err.get("message") or "unknown gateway error"
                raise RuntimeError(msg)

            payload = frame.get("payload")
            if expect_final and isinstance(payload, dict) and payload.get("status") == "accepted":
                # agent 先返回 accepted，再返回 final
                continue

            return payload

    def _build_connect_params(self, auth_token=None, nonce=None):
        role = GATEWAY_ROLE
        scopes = list(GATEWAY_SCOPES)

        signed_at_ms = int(time.time() * 1000)
        payload = build_device_auth_payload(
            device_id=self.identity["deviceId"],
            client_id=GATEWAY_CLIENT_ID,
            client_mode=GATEWAY_CLIENT_MODE,
            role=role,
            scopes=scopes,
            signed_at_ms=signed_at_ms,
            token=auth_token,
            nonce=nonce,
        )
        signature = sign_device_payload(self.identity["privateKeyPem"], payload)

        return {
            "minProtocol": OPENCLAW_PROTOCOL_VERSION,
            "maxProtocol": OPENCLAW_PROTOCOL_VERSION,
            "client": {
                "id": GATEWAY_CLIENT_ID,
                "displayName": GATEWAY_CLIENT_DISPLAY_NAME,
                "version": GATEWAY_CLIENT_VERSION,
                "platform": sys.platform,
                "mode": GATEWAY_CLIENT_MODE,
                "instanceId": str(uuid.uuid4()),
            },
            "caps": [],
            "role": role,
            "scopes": scopes,
            "auth": {"token": auth_token} if auth_token else None,
            "device": {
                "id": self.identity["deviceId"],
                "publicKey": public_key_raw_base64url_from_pem(self.identity["publicKeyPem"]),
                "signature": signature,
                "signedAt": signed_at_ms,
                "nonce": nonce,
            },
        }

    def connect(self, timeout_s: float = 8.0):
        if self._connected and self._conn is not None:
            return

        role = GATEWAY_ROLE
        shared_token = get_openclaw_token() or None
        device_token = load_device_auth_token(self.identity["deviceId"], role)

        token_candidates = []
        for token in (shared_token, device_token, None):
            if token not in token_candidates:
                token_candidates.append(token)

        last_error = None
        for auth_token in token_candidates:
            try:
                self.close()
                self._conn = self._connect_ws(timeout_s=timeout_s)

                connect_nonce = None
                # 先等 connect.challenge
                challenge_deadline = time.time() + timeout_s
                while True:
                    remain = challenge_deadline - time.time()
                    if remain <= 0:
                        raise TimeoutError("gateway connect challenge timeout")
                    frame = self._recv_json(remain)
                    if frame.get("type") != "event":
                        continue
                    if frame.get("event") != "connect.challenge":
                        continue
                    payload = frame.get("payload") or {}
                    nonce = payload.get("nonce")
                    if isinstance(nonce, str) and nonce.strip():
                        connect_nonce = nonce.strip()
                        break

                req_id = "c1"
                params = self._build_connect_params(auth_token=auth_token, nonce=connect_nonce)
                # 清理 None，保持 schema 干净
                params = {k: v for k, v in params.items() if v is not None}

                self._send_json({
                    "type": "req",
                    "id": req_id,
                    "method": "connect",
                    "params": params,
                })

                hello = self._wait_until(req_id, timeout_s=timeout_s, expect_final=False)
                self._hello = hello
                self._connected = True

                # 连接成功后，若下发 deviceToken，存下来
                auth_obj = hello.get("auth") if isinstance(hello, dict) else None
                if isinstance(auth_obj, dict) and isinstance(auth_obj.get("deviceToken"), str):
                    store_device_auth_token(
                        device_id=self.identity["deviceId"],
                        role=auth_obj.get("role") or GATEWAY_ROLE,
                        token=auth_obj.get("deviceToken"),
                        scopes=auth_obj.get("scopes") or [],
                    )
                return
            except Exception as e:
                message = str(e)
                if (
                    auth_token is not None
                    and device_token is not None
                    and auth_token == device_token
                    and "device token mismatch" in message.lower()
                ):
                    clear_device_auth_token(self.identity["deviceId"], role)
                last_error = e
                self.close()

        if last_error:
            raise last_error
        raise RuntimeError("gateway connect failed")

    def request(self, method: str, params, timeout_s: float = 12.0, expect_final: bool = False):
        if not self._connected or self._conn is None:
            self.connect(timeout_s=min(8.0, timeout_s))

        req_id = str(uuid.uuid4())
        self._send_json({
            "type": "req",
            "id": req_id,
            "method": method,
            "params": params,
        })
        return self._wait_until(req_id, timeout_s=timeout_s, expect_final=expect_final)


openclaw_client = OpenClawGatewayClient(OPENCLAW_WS)


def _normalize_reply_text(text):
    if not isinstance(text, str):
        return None

    value = text.strip()
    if not value:
        return None

    # 过滤网关/CLI常见占位态结果，避免读出“completed”这种无效内容
    placeholders = {
        "accepted",
        "queued",
        "running",
        "completed",
        "complete",
        "done",
        "ok",
        "success",
        "true",
    }
    if value.lower() in placeholders:
        return None

    return value


def _chat_with_openclaw_gateway(message):
    """通过 OpenClaw Gateway 长连接调用 agent（优先路径）"""
    idempotency_key = str(uuid.uuid4())
    params = {
        "message": message,
        "sessionKey": OPENCLAW_SESSION_KEY,
        "idempotencyKey": idempotency_key,
        "timeout": OPENCLAW_AGENT_TIMEOUT,
    }

    payload = openclaw_client.request(
        "agent",
        params,
        timeout_s=float(OPENCLAW_AGENT_TIMEOUT + 10),
        expect_final=True,
    )

    # 兼容 agent 返回结构: {result:{payloads:[{text, mediaUrl, mediaUrls}]}}
    if not isinstance(payload, dict):
        return None

    result = payload.get("result") if isinstance(payload.get("result"), dict) else None
    payloads = result.get("payloads") if isinstance(result, dict) else None
    if isinstance(payloads, list) and payloads:
        texts = []
        for item in payloads:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    texts.append(text.strip())
        if texts:
            normalized = _normalize_reply_text("\n".join(texts))
            if normalized:
                return normalized

    # 回退 summary
    summary = _normalize_reply_text(payload.get("summary"))
    if summary:
        return summary

    # 兼容部分返回结构 result.outputText / result.text
    if isinstance(result, dict):
        output_text = _normalize_reply_text(result.get("outputText"))
        if output_text:
            return output_text

        result_text = _normalize_reply_text(result.get("text"))
        if result_text:
            return result_text

    # 最后兜底：遍历 payload 所有 string 值，找最长的非占位内容
    best = None
    for k, v in payload.items():
        if isinstance(v, str):
            normalized = _normalize_reply_text(v)
            if normalized and (best is None or len(normalized) > len(best)):
                best = normalized

    if best:
        return best

    return None


def _chat_with_openclaw_cli(message):
    """CLI 回退路径，保证兜底可用"""
    result = subprocess.run(
        ["openclaw", "agent", "--message", message, "--session-id", OPENCLAW_SESSION_KEY],
        capture_output=True,
        text=True,
        timeout=OPENCLAW_AGENT_TIMEOUT,
    )

    raw_reply = (result.stdout or "").strip() or (result.stderr or "").strip()
    if not raw_reply:
        return None

    lines = raw_reply.split("\n")
    content_lines = []
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if s.startswith("🦞") or s.startswith("│") or s.startswith("◇"):
            continue
        if s.startswith("Session") or s.startswith("Model"):
            continue
        content_lines.append(s)

    reply = _normalize_reply_text("\n".join(content_lines))
    return reply


def chat_with_openclaw(message):
    """Send message to OpenClaw and get response (WS长连接优先，CLI兜底)"""
    print("🤖 思考中...")

    # 优先长连接
    gw_failed_with_timeout = False
    try:
        t_gw = time.time()
        reply = _chat_with_openclaw_gateway(message)
        dt_gw = time.time() - t_gw
        if reply:
            print(f"💬 回复(GW {dt_gw:.1f}s): {reply}")
            return reply
        print(f"⚠️ Gateway 返回空内容({dt_gw:.1f}s)，回退 CLI")
    except TimeoutError as e:
        gw_failed_with_timeout = True
        print(f"⚠️ Gateway 长连接超时，回退 CLI: {e}")
    except Exception as e:
        print(f"⚠️ Gateway 长连接失败，回退 CLI: {type(e).__name__}: {e}")

    # 如果 WS 已经超时，说明后端本身就慢，CLI 大概率也超时，跳过
    if gw_failed_with_timeout:
        text_to_speech("抱歉，网络有点慢，请稍后再试")
        return None

    # 回退 CLI
    try:
        reply = _chat_with_openclaw_cli(message)
        if reply:
            print(f"💬 回复: {reply}")
            return reply
        print("❌ 未获取到有效回复")
        return None
    except subprocess.TimeoutExpired:
        print(f"❌ 对话超时: OpenClaw 响应超过 {OPENCLAW_AGENT_TIMEOUT} 秒")
        return None
    except Exception as e:
        print(f"❌ 对话失败: {e}")
        return None


def _sanitize_for_tts(text):
    """清理 markdown/符号，避免把 *、#、emoji 生硬念出来"""
    cleaned = text
    cleaned = cleaned.replace("**", "")
    cleaned = cleaned.replace("*", "")
    cleaned = cleaned.replace("#", "")
    cleaned = cleaned.replace("`", "")
    cleaned = cleaned.replace("☁️", "多云")
    cleaned = cleaned.replace("🌤️", "晴间多云")
    cleaned = cleaned.replace("°C", "度")
    cleaned = cleaned.replace("- ", "")
    return cleaned.strip()


def _play_wav_with_aplay(wav_path: str):
    # 让 aplay 自动读取 wav 文件头参数，不强制覆盖采样率/格式
    subprocess.run(
        [
            APLAY_BIN,
            "-q",
            "-D",
            OUTPUT_DEVICE,
            wav_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=20,
    )


def _ffmpeg_convert_wav(input_path: str, output_path: str):
    """mp3/wav → 48k/mono/s16le wav，匹配树莓派声卡原生采样率"""
    subprocess.run(
        [
            FFMPEG_BIN,
            "-y",
            "-i",
            input_path,
            "-ar",
            "48000",
            "-ac",
            "1",
            "-acodec",
            "pcm_s16le",
            output_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=20,
    )


def text_to_speech(text):
    """Offline text-to-speech using edge-tts (优先) / espeak-ng (回退)"""
    print("🔊 本地语音合成中...")
    speak_text = _sanitize_for_tts(text)

    if not APLAY_BIN:
        print("⚠️ 未找到 aplay，请先安装 alsa-utils")
        print(f"📢 (文字输出): {speak_text}")
        return

    prefer_espeak = (TTS_ENGINE == "espeak")

    # 优先方案：edge-tts（自然度高）
    if not prefer_espeak:
        try:
            if not EDGE_TTS_BIN or not FFMPEG_BIN:
                raise RuntimeError("edge-tts 或 ffmpeg 缺失")

            tmp_mp3 = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
            tmp_mp3.close()
            tmp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            tmp_wav.close()

            # 使用中文女声
            subprocess.run(
                [
                    EDGE_TTS_BIN,
                    "--voice", EDGE_TTS_VOICE,
                    "--rate", EDGE_TTS_RATE,
                    "--pitch", EDGE_TTS_PITCH,
                    "--volume", EDGE_TTS_VOLUME,
                    "--text", speak_text,
                    "--write-media", tmp_mp3.name,
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=20,
            )

            # mp3 转 wav，匹配声卡原生采样率
            _ffmpeg_convert_wav(tmp_mp3.name, tmp_wav.name)

            _play_wav_with_aplay(tmp_wav.name)

            os.unlink(tmp_mp3.name)
            os.unlink(tmp_wav.name)
            print("✅ 播放完成")
            return
        except Exception:
            # edge-tts 不可用时，自动回退 espeak-ng
            pass

    if not TTS_ALLOW_FALLBACK:
        print("⚠️ edge-tts 失败且已禁用回退语音")
        print(f"📢 (文字输出): {speak_text}")
        return

    # 回退方案：espeak-ng（完全离线）
    try:
        if not ESPEAK_BIN:
            raise RuntimeError("缺少 espeak-ng")

        tmp_raw = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp_raw.close()

        subprocess.run(
            [
                ESPEAK_BIN,
                "-v", ESPEAK_VOICE,
                "-s", ESPEAK_SPEED,
                "-w", tmp_raw.name,
                speak_text,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        play_wav_path = tmp_raw.name
        if FFMPEG_BIN:
            # espeak 输出统一转 48k wav
            tmp_fixed = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            tmp_fixed.close()
            _ffmpeg_convert_wav(play_wav_path, tmp_fixed.name)
            os.unlink(play_wav_path)
            play_wav_path = tmp_fixed.name

        _play_wav_with_aplay(play_wav_path)

        os.unlink(play_wav_path)
        print("✅ 播放完成(回退语音)")
    except Exception as e:
        print(f"❌ 语音合成失败: {e}")
        print(f"📢 (文字输出): {speak_text}")


def main():
    """Main loop - 唤醒词模式，说"小智"激活"""
    print("=" * 50)
    print("  🫀 心音智鉴 - 语音助手")
    print('  说 "小智" 唤醒，Ctrl+C 退出')
    print("=" * 50)

    print(f"🔌 OpenClaw Gateway: {_normalize_ws_url(OPENCLAW_WS)}")
    print(f"🧠 Session: {OPENCLAW_SESSION_KEY}")

    if not ARECORD_BIN:
        print("❌ 缺少 arecord（alsa-utils），无法录音。先安装: sudo apt install -y alsa-utils")
        return

    # 锁定声卡音量为已验证最佳值，禁止其他地方修改
    try:
        subprocess.run(
            ["amixer", "-c", "2", "set", "PCM", f"{ALSA_PCM_VOLUME}%"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print(f"🔊 声卡音量已锁定: PCM={ALSA_PCM_VOLUME}%")
    except Exception as e:
        print(f"⚠️ 设置声卡音量失败: {e}")

    calibrate_noise_threshold()

    while True:
        try:
            # 1. 语音唤醒 + 录音（自动检测开始/结束）
            audio_path = record_audio()
            if not audio_path:
                continue

            # 2. ASR
            text = speech_to_text(audio_path)
            if not text:
                continue

            # 3. 唤醒词检测
            command = check_wake_word(text)
            if command is None:
                # 没说唤醒词，忽略
                print("💤 未检测到唤醒词，忽略")
                continue

            if command == "":
                # 只说了唤醒词，不调用大模型，避免无意义超时
                print("✨ 我在，请说...")
                text_to_speech("我在，请说")
                continue

            print(f"🎯 指令: {command}")

            # 4. Chat
            t0 = time.time()
            reply = chat_with_openclaw(command)
            if not reply:
                dt = time.time() - t0
                print(f"⏱️ 对话耗时: {dt:.2f}s")
                text_to_speech("我现在网络有点慢，你可以再说一遍")
                continue

            dt = time.time() - t0
            print(f"⏱️ 对话耗时: {dt:.2f}s")

            # 5. TTS + Play
            text_to_speech(reply)

            # 播放完毕后短暂等待，避免 TTS 尾音被当作新输入
            time.sleep(0.3)

        except KeyboardInterrupt:
            openclaw_client.close()
            print("\n👋 再见！")
            break
        except Exception as e:
            print(f"❌ 错误: {e}")
            time.sleep(0.6)


if __name__ == "__main__":
    main()
