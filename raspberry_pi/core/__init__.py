# -*- coding: utf-8 -*-
"""
HeartSound Core Package
心音智鉴核心模块包

Exports:
- AudioRecorder: Audio capture class
- HeartSoundClassifier: AI inference class
- run_inference: Async inference function
- generate_connect_qr: QR code generation
"""

from core.audio import AudioRecorder
from core.inference import (
    HeartSoundClassifier,
    get_classifier,
    run_inference,
    CATEGORIES,
    RISK_LEVELS
)
from core.qrcode import (
    generate_connect_qr,
    generate_connect_url,
    get_connection_info
)

__all__ = [
    # Audio
    "AudioRecorder",
    # Inference
    "HeartSoundClassifier",
    "get_classifier",
    "run_inference",
    "CATEGORIES",
    "RISK_LEVELS",
    # QR Code
    "generate_connect_qr",
    "generate_connect_url",
    "get_connection_info",
]
