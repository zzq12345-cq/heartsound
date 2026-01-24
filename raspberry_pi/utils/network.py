# -*- coding: utf-8 -*-
"""
HeartSound Network Utilities
心音智鉴网络工具模块
"""
import socket
import io
from typing import Optional

import qrcode
from qrcode.constants import ERROR_CORRECT_M


def get_local_ip() -> str:
    """
    Get the device's local IP address

    Returns:
        str: Local IP address or 127.0.0.1 if unable to determine
    """
    try:
        # Create a dummy socket to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def generate_qr_code(
    data: str,
    size: int = 200,
    border: int = 2
) -> bytes:
    """
    Generate QR code image as PNG bytes

    Args:
        data: Data to encode in QR code
        size: Image size in pixels (width = height)
        border: Border size in boxes

    Returns:
        bytes: PNG image data
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=ERROR_CORRECT_M,
        box_size=10,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    # Resize if needed
    img = img.resize((size, size))

    # Convert to bytes
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def generate_connect_url(ip: Optional[str] = None, port: int = 8000) -> str:
    """
    Generate HeartSound connection URL for QR code

    Format: heartsound://connect?ip={IP}&port={PORT}

    Args:
        ip: Device IP address (auto-detect if None)
        port: API port number

    Returns:
        str: Connection URL
    """
    if ip is None:
        ip = get_local_ip()
    return f"heartsound://connect?ip={ip}&port={port}"


def generate_connect_qr(
    ip: Optional[str] = None,
    port: int = 8000,
    size: int = 200
) -> bytes:
    """
    Generate connection QR code for mini-program scanning

    Args:
        ip: Device IP address (auto-detect if None)
        port: API port number
        size: QR code image size

    Returns:
        bytes: PNG image data
    """
    url = generate_connect_url(ip, port)
    return generate_qr_code(url, size)
