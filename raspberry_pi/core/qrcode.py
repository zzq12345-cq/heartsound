# -*- coding: utf-8 -*-
"""
HeartSound QR Code Generation Module
心音智鉴二维码生成模块

Generates QR codes for device connection.
"""
import io
import base64
import logging
from typing import Optional

from config import settings, get_device_ip

logger = logging.getLogger("heartsound.qrcode")


# QR Code connection protocol format
CONNECT_PROTOCOL = "heartsound://connect?ip={ip}&port={port}&device_id={device_id}"


def generate_connect_url(
    ip: Optional[str] = None,
    port: Optional[int] = None,
    device_id: Optional[str] = None
) -> str:
    """
    Generate connection URL for QR code.
    生成二维码连接URL

    Args:
        ip: Device IP address (auto-detect if None)
        port: Server port (use settings if None)
        device_id: Device ID (use settings if None)

    Returns:
        Connection URL string
    """
    ip = ip or get_device_ip()
    port = port or settings.PORT
    device_id = device_id or settings.DEVICE_ID

    url = CONNECT_PROTOCOL.format(
        ip=ip,
        port=port,
        device_id=device_id
    )

    logger.debug(f"Generated connect URL: {url}")
    return url


def generate_qr_base64(
    content: str,
    size: int = 200,
    border: int = 2
) -> Optional[str]:
    """
    Generate QR code as base64 encoded PNG.
    生成Base64编码的PNG二维码

    Args:
        content: Content to encode in QR code
        size: Image size in pixels
        border: QR code border width

    Returns:
        Base64 encoded PNG image string, or None if qrcode not available
    """
    try:
        import qrcode
        from PIL import Image

        # Create QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=border
        )
        qr.add_data(content)
        qr.make(fit=True)

        # Generate image
        img = qr.make_image(fill_color="black", back_color="white")

        # Resize to target size
        img = img.resize((size, size), Image.Resampling.LANCZOS)

        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        base64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")

        logger.info(f"QR code generated, size: {size}x{size}")
        return f"data:image/png;base64,{base64_str}"

    except ImportError:
        logger.warning("qrcode or PIL not installed, QR generation disabled")
        return None
    except Exception as e:
        logger.error(f"Failed to generate QR code: {e}")
        return None


def generate_connect_qr(size: int = 200) -> dict:
    """
    Generate device connection QR code.
    生成设备连接二维码

    Args:
        size: QR code image size

    Returns:
        Dict with QR code data and metadata
    """
    ip = get_device_ip()
    url = generate_connect_url(ip=ip)
    qr_base64 = generate_qr_base64(url, size=size)

    return {
        "url": url,
        "qr_image": qr_base64,
        "ip": ip,
        "port": settings.PORT,
        "device_id": settings.DEVICE_ID,
        "device_name": settings.DEVICE_NAME
    }


def get_connection_info() -> dict:
    """
    Get device connection information without QR code.
    获取设备连接信息（不含二维码）

    Returns:
        Dict with connection details
    """
    ip = get_device_ip()
    return {
        "ip": ip,
        "port": settings.PORT,
        "device_id": settings.DEVICE_ID,
        "device_name": settings.DEVICE_NAME,
        "connect_url": generate_connect_url(ip=ip),
        "api_base_url": f"http://{ip}:{settings.PORT}",
        "websocket_url": f"ws://{ip}:{settings.PORT}/ws/audio"
    }
