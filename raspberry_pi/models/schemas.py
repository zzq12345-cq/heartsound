# -*- coding: utf-8 -*-
"""
HeartSound Pydantic Data Models
心音智鉴数据模型定义
"""
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ============================================================================
# Device Models
# ============================================================================

class DeviceInfo(BaseModel):
    """Device information response model"""
    device_id: str = Field(..., description="设备唯一标识")
    device_name: str = Field(..., description="设备名称")
    status: Literal["ready", "recording", "analyzing"] = Field(
        default="ready", description="设备状态"
    )
    ip_address: str = Field(..., description="设备IP地址")
    firmware_version: str = Field(..., description="固件版本")
    model_version: str = Field(..., description="AI模型版本")
    uptime_seconds: int = Field(..., description="运行时间(秒)")

    class Config:
        json_schema_extra = {
            "example": {
                "device_id": "RPi-HS-001",
                "device_name": "心音智鉴设备",
                "status": "ready",
                "ip_address": "192.168.1.100",
                "firmware_version": "1.0.0",
                "model_version": "v2.1",
                "uptime_seconds": 3600
            }
        }


class PingResponse(BaseModel):
    """Heartbeat ping response model"""
    status: Literal["ok"] = Field(default="ok", description="状态")
    timestamp: datetime = Field(
        default_factory=datetime.now, description="时间戳"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "status": "ok",
                "timestamp": "2024-01-15T10:30:00Z"
            }
        }


class DeviceStatus(BaseModel):
    """Device status model for internal use"""
    status: Literal["ready", "recording", "analyzing"] = "ready"
    current_session_id: Optional[str] = None
    recording_start_time: Optional[datetime] = None


# ============================================================================
# Error Models
# ============================================================================

class ErrorResponse(BaseModel):
    """Standard error response model"""
    error: str = Field(..., description="错误代码")
    message: str = Field(..., description="错误描述")

    class Config:
        json_schema_extra = {
            "example": {
                "error": "device_busy",
                "message": "设备正在录制中，请稍后重试"
            }
        }


# ============================================================================
# Detection Models (for IMPL-003)
# ============================================================================

class DetectionStartRequest(BaseModel):
    """Start detection request model"""
    user_id: Optional[str] = Field(None, description="用户ID(可选)")
    duration: int = Field(default=30, ge=10, le=60, description="录制时长(秒)")


class DetectionStartResponse(BaseModel):
    """Start detection response model"""
    session_id: str = Field(..., description="会话ID")
    websocket_url: str = Field(..., description="WebSocket URL")
    duration: int = Field(..., description="录制时长")
    started_at: datetime = Field(
        default_factory=datetime.now, description="开始时间"
    )


class HealthAdvice(BaseModel):
    """Health advice model"""
    summary: str = Field(..., description="健康总结")
    suggestions: list[str] = Field(..., description="建议列表")
    action: str = Field(..., description="行动建议")


class DetectionResult(BaseModel):
    """Detection result model"""
    category: str = Field(..., description="分类结果")
    label: str = Field(..., description="显示标签")
    confidence: float = Field(..., ge=0, le=100, description="置信度")
    risk_level: Literal["safe", "warning", "danger"] = Field(
        ..., description="风险等级"
    )
    probabilities: dict[str, float] = Field(..., description="概率分布")
    health_advice: HealthAdvice = Field(..., description="健康建议")


class DetectionResultResponse(BaseModel):
    """Detection result response model"""
    session_id: str = Field(..., description="会话ID")
    status: Literal["recording", "analyzing", "completed", "error"] = Field(
        ..., description="状态"
    )
    result: Optional[DetectionResult] = Field(None, description="检测结果")
    progress: Optional[int] = Field(None, description="进度(0-100)")
    message: Optional[str] = Field(None, description="状态消息")
    duration_seconds: Optional[int] = Field(None, description="录制时长")
    analyzed_at: Optional[datetime] = Field(None, description="分析完成时间")
