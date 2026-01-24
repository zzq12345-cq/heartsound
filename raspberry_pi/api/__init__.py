# -*- coding: utf-8 -*-
"""
HeartSound API Package
心音智鉴API路由包

Exports all API routers for FastAPI registration.
"""

from api.device import router as device_router
from api.detection import router as detection_router
from api.websocket import router as websocket_router

__all__ = [
    "device_router",
    "detection_router",
    "websocket_router",
]
