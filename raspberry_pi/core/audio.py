# -*- coding: utf-8 -*-
"""
HeartSound Audio Capture Module
心音智鉴音频采集模块

This module handles real-time audio recording from the microphone,
with support for streaming data to WebSocket clients.
"""
import asyncio
import numpy as np
import logging
from typing import Optional, Callable, AsyncGenerator
from datetime import datetime, timedelta

from config import settings
from utils.audio_utils import (
    audio_to_base64_frame,
    extract_waveform_points,
    calculate_rms
)

logger = logging.getLogger("heartsound.audio")


class AudioRecorder:
    """
    Audio recorder class for capturing heart sounds.
    心音采集录音器类
    """

    def __init__(
        self,
        sample_rate: int = None,
        channels: int = None,
        chunk_size: int = None,
        duration: int = None
    ):
        """
        Initialize audio recorder.

        Args:
            sample_rate: Audio sample rate (Hz)
            channels: Number of audio channels
            chunk_size: Size of each audio chunk
            duration: Recording duration (seconds)
        """
        self.sample_rate = sample_rate or settings.AUDIO_SAMPLE_RATE
        self.channels = channels or settings.AUDIO_CHANNELS
        self.chunk_size = chunk_size or settings.AUDIO_CHUNK_SIZE
        self.duration = duration or settings.DEFAULT_DURATION

        self._is_recording = False
        self._audio_buffer: list[np.ndarray] = []
        self._start_time: Optional[datetime] = None
        self._pyaudio = None
        self._stream = None

        logger.info(
            f"AudioRecorder initialized: {self.sample_rate}Hz, "
            f"{self.channels}ch, {self.duration}s"
        )

    @property
    def is_recording(self) -> bool:
        """Check if currently recording."""
        return self._is_recording

    @property
    def elapsed_seconds(self) -> int:
        """Get elapsed recording time in seconds."""
        if self._start_time is None:
            return 0
        delta = datetime.now() - self._start_time
        return int(delta.total_seconds())

    @property
    def remaining_seconds(self) -> int:
        """Get remaining recording time in seconds."""
        return max(0, self.duration - self.elapsed_seconds)

    def _init_pyaudio(self):
        """Initialize PyAudio instance (lazy loading)."""
        if self._pyaudio is None:
            try:
                import pyaudio
                self._pyaudio = pyaudio.PyAudio()
                logger.info("PyAudio initialized successfully")
            except ImportError:
                logger.warning("PyAudio not available, using simulation mode")
                self._pyaudio = None

    async def start_recording(self) -> bool:
        """
        Start audio recording.
        开始录音

        Returns:
            True if recording started successfully
        """
        if self._is_recording:
            logger.warning("Recording already in progress")
            return False

        self._audio_buffer = []
        self._start_time = datetime.now()
        self._is_recording = True

        self._init_pyaudio()

        if self._pyaudio is not None:
            try:
                import pyaudio
                self._stream = self._pyaudio.open(
                    format=pyaudio.paInt16,
                    channels=self.channels,
                    rate=self.sample_rate,
                    input=True,
                    frames_per_buffer=self.chunk_size
                )
                logger.info("Audio stream opened")
            except Exception as e:
                logger.error(f"Failed to open audio stream: {e}")
                self._stream = None

        logger.info("Recording started")
        return True

    async def stop_recording(self) -> np.ndarray:
        """
        Stop audio recording and return collected data.
        停止录音并返回采集的数据

        Returns:
            Complete audio data as numpy array
        """
        self._is_recording = False

        if self._stream is not None:
            try:
                self._stream.stop_stream()
                self._stream.close()
            except Exception as e:
                logger.error(f"Error closing stream: {e}")
            self._stream = None

        logger.info(f"Recording stopped, {len(self._audio_buffer)} chunks collected")

        if not self._audio_buffer:
            return np.array([], dtype=np.float32)

        # Concatenate all chunks
        audio_data = np.concatenate(self._audio_buffer)
        return audio_data

    async def read_chunk(self) -> Optional[np.ndarray]:
        """
        Read a single audio chunk.
        读取单个音频块

        Returns:
            Audio chunk as numpy array, or None if not recording
        """
        if not self._is_recording:
            return None

        # Check if duration exceeded
        if self.elapsed_seconds >= self.duration:
            return None

        if self._stream is not None:
            try:
                # Read from actual audio stream
                raw_data = self._stream.read(
                    self.chunk_size,
                    exception_on_overflow=False
                )
                chunk = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32)
                chunk = chunk / 32768.0  # Normalize to [-1, 1]
            except Exception as e:
                logger.error(f"Error reading audio: {e}")
                chunk = self._generate_simulated_chunk()
        else:
            # Simulation mode - generate fake heart sound data
            chunk = self._generate_simulated_chunk()

        self._audio_buffer.append(chunk)
        return chunk

    def _generate_simulated_chunk(self) -> np.ndarray:
        """
        Generate simulated heart sound chunk for testing.
        生成模拟心音数据用于测试
        """
        t = np.linspace(0, self.chunk_size / self.sample_rate, self.chunk_size)

        # Simulate heartbeat pattern with multiple frequency components
        # S1 (lub) around 40-80 Hz, S2 (dub) around 50-100 Hz
        elapsed = self.elapsed_seconds
        phase = (elapsed * 1.2) % 1.0  # ~72 BPM heart rate

        # Generate heartbeat-like pattern
        s1_freq = 60  # Hz
        s2_freq = 80  # Hz

        signal = np.zeros_like(t)

        # S1 sound (first heart sound)
        if phase < 0.15:
            envelope = np.exp(-((t - 0.05) ** 2) / 0.001)
            signal += 0.7 * envelope * np.sin(2 * np.pi * s1_freq * t)

        # S2 sound (second heart sound)
        elif 0.35 < phase < 0.5:
            envelope = np.exp(-((t - 0.05) ** 2) / 0.0008)
            signal += 0.5 * envelope * np.sin(2 * np.pi * s2_freq * t)

        # Add some noise
        signal += 0.05 * np.random.randn(len(t))

        return signal.astype(np.float32)

    def get_audio_data(self) -> np.ndarray:
        """
        Get all recorded audio data.
        获取所有录制的音频数据

        Returns:
            Complete audio data as numpy array
        """
        if not self._audio_buffer:
            return np.array([], dtype=np.float32)
        return np.concatenate(self._audio_buffer)

    async def stream_frames(
        self,
        frame_interval: float = 0.033  # ~30fps
    ) -> AsyncGenerator[dict, None]:
        """
        Stream audio frames for WebSocket transmission.
        流式传输音频帧用于WebSocket

        Args:
            frame_interval: Time between frames in seconds

        Yields:
            Frame dict with waveform and amplitude data
        """
        while self._is_recording:
            chunk = await self.read_chunk()

            if chunk is None:
                break

            # Create frame for WebSocket
            frame = audio_to_base64_frame(chunk, self.sample_rate)
            frame["timestamp"] = datetime.now().isoformat()
            frame["remaining_seconds"] = self.remaining_seconds

            yield frame

            await asyncio.sleep(frame_interval)

    def cleanup(self):
        """Clean up resources."""
        if self._stream is not None:
            try:
                self._stream.stop_stream()
                self._stream.close()
            except Exception:
                pass
            self._stream = None

        if self._pyaudio is not None:
            try:
                self._pyaudio.terminate()
            except Exception:
                pass
            self._pyaudio = None

        logger.info("AudioRecorder cleaned up")

    def __del__(self):
        """Destructor to ensure cleanup."""
        self.cleanup()
