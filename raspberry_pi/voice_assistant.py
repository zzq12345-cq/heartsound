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
import wave
import time
import requests
from vosk import Model, KaldiRecognizer

# ============================================================
# Configuration
# ============================================================
OPENCLAW_HTTP = "http://127.0.0.1:18789"

# Audio settings
RATE = 16000
RECORD_SECONDS_MAX = 15       # 单次录音最长秒数
CHUNK_DURATION = 0.3          # 每次检测片段长度（秒）
CHUNK_BYTES = int(RATE * 2 * CHUNK_DURATION)  # 16-bit mono

# VAD (Voice Activity Detection) settings
SILENCE_THRESHOLD = 500       # 音量阈值（16-bit 范围 0~32767）
SILENCE_TIMEOUT = 1.5         # 说完话后静音多久停止录音（秒）
MIN_SPEECH_DURATION = 0.5     # 最短有效语音时长（秒），过短丢弃

# Wake word (唤醒词)
WAKE_WORDS = ["小智", "小知", "小志", "小枝"]  # 包含同音容错

# Local ASR/TTS (完全免费离线)
VOSK_MODEL_PATH = os.path.expanduser("~/models/vosk-cn")
ESPEAK_VOICE = "zh"
ESPEAK_SPEED = "165"

# Audio devices (from arecord -l / aplay -l)
INPUT_DEVICE = "plughw:3,0"   # USB microphone
OUTPUT_DEVICE = "plughw:2,0"  # 3.5mm headphone jack

# ============================================================
# Initialize
# ============================================================
vosk_model = None
if os.path.exists(VOSK_MODEL_PATH):
    try:
        vosk_model = Model(VOSK_MODEL_PATH)
    except Exception as e:
        print(f"❌ Vosk 模型加载失败: {e}")
else:
    print(f"⚠️ 未找到 Vosk 模型目录: {VOSK_MODEL_PATH}")
    print("   先下载中文模型并解压到该目录再运行")


def get_openclaw_token():
    """Read OpenClaw auth token from config"""
    config_path = os.path.expanduser("~/.openclaw/openclaw.json")
    try:
        with open(config_path, "r") as f:
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
    print("👂 正在监听... (说话即开始录音)")

    # 用 arecord 持续录制原始 PCM 流到 stdout
    proc = subprocess.Popen(
        [
            "arecord",
            "-D", INPUT_DEVICE,
            "-f", "S16_LE",
            "-r", str(RATE),
            "-c", "1",
            "-t", "raw",        # 输出原始 PCM
            "-q",               # 安静模式
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )

    frames = []
    is_recording = False
    silent_time = 0.0
    speech_time = 0.0
    max_chunks = int(RECORD_SECONDS_MAX / CHUNK_DURATION)

    try:
        for _ in range(max_chunks * 10):  # 监听阶段可以等很久
            data = proc.stdout.read(CHUNK_BYTES)
            if not data or len(data) < CHUNK_BYTES:
                break

            amplitude = get_amplitude(data)

            if not is_recording:
                # 等待语音触发
                if amplitude > SILENCE_THRESHOLD:
                    is_recording = True
                    speech_time = CHUNK_DURATION
                    silent_time = 0.0
                    frames = [data]
                    print("🎤 检测到语音，开始录音...")
            else:
                # 正在录音
                frames.append(data)
                speech_time += CHUNK_DURATION

                if amplitude > SILENCE_THRESHOLD:
                    silent_time = 0.0
                else:
                    silent_time += CHUNK_DURATION

                # 静音超时 → 停止
                if silent_time >= SILENCE_TIMEOUT:
                    print(f"🔇 静音检测，停止录音")
                    break

                # 超过最大时长 → 停止
                if speech_time >= RECORD_SECONDS_MAX:
                    print(f"⏱️ 达到最大录音时长")
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


def chat_with_openclaw(message):
    """Send message to OpenClaw and get response"""
    print("🤖 思考中...")
    token = get_openclaw_token()

    try:
        # Use OpenClaw HTTP API
        headers = {
            "Content-Type": "application/json",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        response = requests.post(
            f"{OPENCLAW_HTTP}/api/agent/message",
            headers=headers,
            json={
                "message": message,
                "sessionId": "main",
            },
            timeout=30,
        )

        if response.status_code == 200:
            data = response.json()
            reply = data.get("reply", data.get("content", data.get("text", "")))
            if reply:
                print(f"💬 回复: {reply}")
                return reply

        # Fallback: use CLI
        print("  HTTP API 未响应，使用 CLI 模式...")
        result = subprocess.run(
            ["openclaw", "agent", "--message", message, "--session-id", "main"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        reply = result.stdout.strip()
        if reply:
            # Clean up CLI output (remove header lines)
            lines = reply.split("\n")
            content_lines = []
            for line in lines:
                if line.startswith("🦞") or line.startswith("│") or line.startswith("◇"):
                    continue
                content_lines.append(line)
            reply = "\n".join(content_lines).strip()
            if reply:
                print(f"💬 回复: {reply}")
                return reply

        print("❌ 未获取到回复")
        return None

    except Exception as e:
        print(f"❌ 对话失败: {e}")
        return None


def text_to_speech(text):
    """Offline text-to-speech using espeak-ng (免费本地离线)"""
    print("🔊 本地语音合成中...")
    try:
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp.close()

        # 先生成 wav，再按指定输出设备播放
        subprocess.run(
            [
                "espeak-ng",
                "-v", ESPEAK_VOICE,
                "-s", ESPEAK_SPEED,
                "-w", tmp.name,
                text,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        subprocess.run(
            ["aplay", "-D", OUTPUT_DEVICE, tmp.name],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        os.unlink(tmp.name)
        print("✅ 播放完成")
    except Exception as e:
        print(f"❌ 语音合成失败: {e}")
        print(f"📢 (文字输出): {text}")


def main():
    """Main loop - 唤醒词模式，说"小智"激活"""
    print("=" * 50)
    print("  🫀 心音智鉴 - 语音助手")
    print('  说 "小智" 唤醒，Ctrl+C 退出')
    print("=" * 50)

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
                print(f"💤 未检测到唤醒词，忽略")
                continue

            if command == "":
                # 只说了"小智"，提示并继续录音等待指令
                print("✨ 我在，请说...")
                text_to_speech("我在，请说")
                time.sleep(0.3)

                # 录第二段：等待具体指令
                audio_path2 = record_audio()
                if not audio_path2:
                    continue
                command = speech_to_text(audio_path2)
                if not command:
                    continue

            print(f"🎯 指令: {command}")

            # 4. Chat
            reply = chat_with_openclaw(command)
            if not reply:
                continue

            # 5. TTS + Play
            text_to_speech(reply)

            # 播放完毕后短暂等待，避免 TTS 尾音被当作新输入
            time.sleep(0.5)

        except KeyboardInterrupt:
            print("\n👋 再见！")
            break
        except Exception as e:
            print(f"❌ 错误: {e}")
            time.sleep(1)


if __name__ == "__main__":
    main()
