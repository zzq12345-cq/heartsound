# -*- coding: utf-8 -*-
"""
HeartSound Audio Utilities
心音智鉴音频工具模块
"""
import numpy as np
from typing import Optional
import logging

logger = logging.getLogger("heartsound.audio_utils")


def normalize_audio(audio_data: np.ndarray) -> np.ndarray:
    """
    Normalize audio data to [-1, 1] range.
    音频数据归一化到[-1, 1]范围
    """
    if audio_data.size == 0:
        return audio_data

    max_val = np.abs(audio_data).max()
    if max_val > 0:
        return audio_data / max_val
    return audio_data


def calculate_rms(audio_data: np.ndarray) -> float:
    """
    Calculate Root Mean Square of audio signal.
    计算音频信号的RMS值
    """
    if audio_data.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(audio_data ** 2)))


def extract_waveform_points(
    audio_data: np.ndarray,
    num_points: int = 100
) -> list[float]:
    """
    Extract waveform visualization points from audio data.
    从音频数据中提取波形可视化点

    Args:
        audio_data: Raw audio data as numpy array
        num_points: Number of points to extract for visualization

    Returns:
        List of normalized amplitude values for waveform display
    """
    if audio_data.size == 0:
        return [0.0] * num_points

    # Downsample to num_points
    chunk_size = max(1, len(audio_data) // num_points)
    points = []

    for i in range(num_points):
        start_idx = i * chunk_size
        end_idx = min((i + 1) * chunk_size, len(audio_data))
        if start_idx < len(audio_data):
            chunk = audio_data[start_idx:end_idx]
            # Use max absolute value for visual amplitude
            points.append(float(np.abs(chunk).max()))
        else:
            points.append(0.0)

    # Normalize points
    max_point = max(points) if points else 1.0
    if max_point > 0:
        points = [p / max_point for p in points]

    return points


def audio_to_base64_frame(
    audio_chunk: np.ndarray,
    sample_rate: int = 16000
) -> dict:
    """
    Convert audio chunk to a frame dict for WebSocket transmission.
    将音频块转换为WebSocket传输的帧字典

    Args:
        audio_chunk: Audio data chunk
        sample_rate: Sample rate in Hz

    Returns:
        Dict containing waveform and amplitude data
    """
    # Calculate amplitude and waveform for visualization
    amplitude = calculate_rms(audio_chunk)
    waveform = extract_waveform_points(audio_chunk, num_points=50)

    return {
        "amplitude": round(amplitude, 4),
        "waveform": [round(w, 3) for w in waveform],
        "sample_rate": sample_rate
    }


def preprocess_for_inference(
    audio_data: np.ndarray,
    target_length: int = 160000,  # 10 seconds at 16kHz
    sample_rate: int = 16000
) -> np.ndarray:
    """
    Preprocess audio data for AI model inference.
    预处理音频数据用于AI模型推理

    Args:
        audio_data: Raw audio data
        target_length: Target number of samples
        sample_rate: Sample rate

    Returns:
        Preprocessed audio data ready for model input
    """
    # Normalize
    audio = normalize_audio(audio_data.astype(np.float32))

    # Pad or trim to target length
    if len(audio) < target_length:
        # Pad with zeros
        audio = np.pad(audio, (0, target_length - len(audio)))
    elif len(audio) > target_length:
        # Take center portion
        start = (len(audio) - target_length) // 2
        audio = audio[start:start + target_length]

    # Reshape for model input [batch, samples]
    audio = audio.reshape(1, -1)

    return audio


def is_audio_valid(
    audio_data: np.ndarray,
    min_rms: float = 0.01,
    min_duration_samples: int = 8000  # 0.5 seconds at 16kHz
) -> tuple[bool, str]:
    """
    Check if audio data is valid for processing.
    检查音频数据是否有效

    Args:
        audio_data: Audio data to validate
        min_rms: Minimum RMS threshold
        min_duration_samples: Minimum number of samples required

    Returns:
        Tuple of (is_valid, reason)
    """
    if audio_data.size < min_duration_samples:
        return False, "音频时长不足"

    rms = calculate_rms(audio_data)
    if rms < min_rms:
        return False, "音频信号过弱，请检查麦克风"

    return True, "valid"
