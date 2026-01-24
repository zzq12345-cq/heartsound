# -*- coding: utf-8 -*-
"""
HeartSound Detection API
心音智鉴检测API模块

Provides REST endpoints for detection session management.
"""
import asyncio
import uuid
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks

from models.schemas import (
    DetectionStartRequest,
    DetectionStartResponse,
    DetectionResultResponse,
    DetectionResult,
    ErrorResponse
)
from config import settings, get_device_ip
from core.inference import run_inference
from core.audio import AudioRecorder

logger = logging.getLogger("heartsound.detection")

router = APIRouter(prefix="/api/detection", tags=["Detection"])


# ============================================================================
# Session Storage
# ============================================================================

class DetectionSession:
    """Detection session data container."""

    def __init__(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        duration: int = 30
    ):
        self.session_id = session_id
        self.user_id = user_id
        self.duration = duration
        self.status = "pending"  # pending, recording, analyzing, completed, error
        self.progress = 0
        self.message = "等待开始录制"
        self.result: Optional[DetectionResult] = None
        self.started_at = datetime.now()
        self.completed_at: Optional[datetime] = None
        self._recorder: Optional[AudioRecorder] = None

    def to_response(self) -> DetectionResultResponse:
        """Convert to API response model."""
        return DetectionResultResponse(
            session_id=self.session_id,
            status=self.status,
            result=self.result,
            progress=self.progress,
            message=self.message,
            duration_seconds=self.duration,
            analyzed_at=self.completed_at
        )


# Active sessions storage (in production, use Redis or similar)
active_sessions: dict[str, DetectionSession] = {}


def generate_session_id() -> str:
    """Generate unique session ID."""
    return f"sess_{uuid.uuid4().hex[:12]}"


def get_session(session_id: str) -> Optional[DetectionSession]:
    """Get session by ID."""
    return active_sessions.get(session_id)


def cleanup_old_sessions(max_age_minutes: int = 30):
    """Clean up old completed sessions."""
    now = datetime.now()
    to_remove = []

    for session_id, session in active_sessions.items():
        if session.completed_at:
            age = (now - session.completed_at).total_seconds() / 60
            if age > max_age_minutes:
                to_remove.append(session_id)

    for session_id in to_remove:
        del active_sessions[session_id]

    if to_remove:
        logger.info(f"Cleaned up {len(to_remove)} old sessions")


# ============================================================================
# API Endpoints
# ============================================================================

@router.post(
    "/start",
    response_model=DetectionStartResponse,
    responses={
        409: {"model": ErrorResponse, "description": "设备忙碌"},
        500: {"model": ErrorResponse, "description": "服务器错误"}
    }
)
async def start_detection(
    request: DetectionStartRequest,
    background_tasks: BackgroundTasks
) -> DetectionStartResponse:
    """
    Start a new detection session.
    开始新的检测会话

    This endpoint creates a new session and returns WebSocket URL for audio streaming.
    """
    # Check if device is busy
    busy_sessions = [
        s for s in active_sessions.values()
        if s.status in ("recording", "analyzing")
    ]
    if busy_sessions:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "device_busy",
                "message": "设备正在录制中，请稍后重试"
            }
        )

    # Create new session
    session_id = generate_session_id()
    session = DetectionSession(
        session_id=session_id,
        user_id=request.user_id,
        duration=request.duration
    )
    active_sessions[session_id] = session

    # Get device IP for WebSocket URL
    device_ip = get_device_ip()
    websocket_url = f"ws://{device_ip}:{settings.PORT}/ws/audio/{session_id}"

    logger.info(f"Detection session created: {session_id}")

    # Schedule cleanup in background
    background_tasks.add_task(cleanup_old_sessions)

    return DetectionStartResponse(
        session_id=session_id,
        websocket_url=websocket_url,
        duration=request.duration,
        started_at=session.started_at
    )


@router.get(
    "/{session_id}/result",
    response_model=DetectionResultResponse,
    responses={
        404: {"model": ErrorResponse, "description": "会话不存在"}
    }
)
async def get_detection_result(session_id: str) -> DetectionResultResponse:
    """
    Get detection result by session ID.
    根据会话ID获取检测结果

    Clients can poll this endpoint to check analysis status and get results.
    """
    session = get_session(session_id)

    if session is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "session_not_found",
                "message": "会话不存在或已过期"
            }
        )

    return session.to_response()


@router.post(
    "/{session_id}/analyze",
    response_model=DetectionResultResponse,
    responses={
        404: {"model": ErrorResponse, "description": "会话不存在"},
        400: {"model": ErrorResponse, "description": "无效操作"}
    }
)
async def trigger_analysis(session_id: str) -> DetectionResultResponse:
    """
    Manually trigger analysis for a session (for testing).
    手动触发会话分析（用于测试）

    This is mainly for testing without actual audio recording.
    """
    session = get_session(session_id)

    if session is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "session_not_found",
                "message": "会话不存在或已过期"
            }
        )

    if session.status not in ("pending", "recording"):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_operation",
                "message": f"当前状态 {session.status} 无法触发分析"
            }
        )

    # Update status
    session.status = "analyzing"
    session.message = "AI正在分析心音..."
    session.progress = 70

    # Run simulated analysis
    try:
        import numpy as np
        # Generate fake audio data for testing
        fake_audio = np.random.randn(settings.AUDIO_SAMPLE_RATE * session.duration).astype(np.float32)
        result = await run_inference(fake_audio)

        session.result = result
        session.status = "completed"
        session.message = "分析完成"
        session.progress = 100
        session.completed_at = datetime.now()

        logger.info(f"Manual analysis completed for {session_id}: {result.category}")

    except Exception as e:
        logger.error(f"Analysis failed for {session_id}: {e}")
        session.status = "error"
        session.message = f"分析失败: {str(e)}"

    return session.to_response()


@router.delete(
    "/{session_id}",
    responses={
        404: {"model": ErrorResponse, "description": "会话不存在"}
    }
)
async def cancel_detection(session_id: str) -> dict:
    """
    Cancel a detection session.
    取消检测会话
    """
    session = get_session(session_id)

    if session is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "session_not_found",
                "message": "会话不存在或已过期"
            }
        )

    # Clean up recorder if exists
    if session._recorder:
        session._recorder.cleanup()

    # Remove from active sessions
    del active_sessions[session_id]

    logger.info(f"Session cancelled: {session_id}")

    return {"message": "会话已取消", "session_id": session_id}


@router.get("/sessions/active")
async def list_active_sessions() -> dict:
    """
    List all active sessions (for debugging).
    列出所有活动会话（用于调试）
    """
    sessions = []
    for session_id, session in active_sessions.items():
        sessions.append({
            "session_id": session_id,
            "status": session.status,
            "progress": session.progress,
            "started_at": session.started_at.isoformat(),
            "completed_at": session.completed_at.isoformat() if session.completed_at else None
        })

    return {
        "count": len(sessions),
        "sessions": sessions
    }


# Export for updating sessions from WebSocket handler
def update_session_status(
    session_id: str,
    status: str,
    message: str = "",
    progress: int = 0,
    result: Optional[DetectionResult] = None
):
    """Update session status from WebSocket handler."""
    session = get_session(session_id)
    if session:
        session.status = status
        if message:
            session.message = message
        session.progress = progress
        if result:
            session.result = result
            session.completed_at = datetime.now()
