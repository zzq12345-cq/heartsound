# -*- coding: utf-8 -*-
"""
HeartSound Raspberry Pi Configuration
心音智鉴树莓派配置模块
"""
import os
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Device Configuration
    DEVICE_ID: str = "RPi-HS-001"
    DEVICE_NAME: str = "心音智鉴设备"
    FIRMWARE_VERSION: str = "1.0.0"
    MODEL_VERSION: str = "v2.1"

    # Server Configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False

    # CORS Configuration
    CORS_ORIGINS: list[str] = ["*"]

    # Audio Configuration
    AUDIO_SAMPLE_RATE: int = 16000
    AUDIO_CHANNELS: int = 1
    AUDIO_CHUNK_SIZE: int = 1024
    DEFAULT_DURATION: int = 30  # seconds
    MIN_DURATION: int = 10
    MAX_DURATION: int = 60

    # AI Model Configuration
    MODEL_PATH: str = "models/heart_sound_model.onnx"

    # Supabase Configuration (optional, for cloud sync)
    SUPABASE_URL: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


# Global settings instance
settings = Settings()


def get_device_ip() -> str:
    """Get the device's local IP address"""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"
