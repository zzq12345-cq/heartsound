# -*- coding: utf-8 -*-
"""
HeartSound Device API Router
心音智鉴设备API路由
"""
import time
from datetime import datetime
from fastapi import APIRouter, HTTPException

from models.schemas import DeviceInfo, PingResponse, ErrorResponse
from config import settings, get_device_ip

# Module-level state
_start_time = time.time()
_device_status = "ready"  # ready | recording | analyzing


router = APIRouter(prefix="/api/device", tags=["Device"])


@router.get(
    "/info",
    response_model=DeviceInfo,
    responses={
        200: {"description": "设备信息获取成功"},
        503: {"model": ErrorResponse, "description": "设备忙"}
    },
    summary="获取设备信息",
    description="获取心音智鉴设备的基本信息和当前状态"
)
async def get_device_info() -> DeviceInfo:
    """
    Get device information

    Returns device ID, name, status, IP address, versions and uptime.
    """
    global _device_status

    uptime = int(time.time() - _start_time)

    return DeviceInfo(
        device_id=settings.DEVICE_ID,
        device_name=settings.DEVICE_NAME,
        status=_device_status,
        ip_address=get_device_ip(),
        firmware_version=settings.FIRMWARE_VERSION,
        model_version=settings.MODEL_VERSION,
        uptime_seconds=uptime
    )


@router.get(
    "/ping",
    response_model=PingResponse,
    summary="心跳检测",
    description="检测设备是否在线，用于小程序端定时心跳检测"
)
async def ping() -> PingResponse:
    """
    Heartbeat ping endpoint

    Returns OK status with current timestamp.
    Used by mini-program for connection health check (10s interval).
    """
    return PingResponse(
        status="ok",
        timestamp=datetime.now()
    )


# ============================================================================
# Internal functions for device state management
# ============================================================================

def set_device_status(status: str) -> None:
    """Set device status (called by detection module)"""
    global _device_status
    if status in ("ready", "recording", "analyzing"):
        _device_status = status


def get_device_status() -> str:
    """Get current device status"""
    return _device_status


def is_device_busy() -> bool:
    """Check if device is busy (recording or analyzing)"""
    return _device_status != "ready"
