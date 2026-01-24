# -*- coding: utf-8 -*-
"""
HeartSound WebSocket Audio Streaming
心音智鉴WebSocket音频流模块

Handles real-time audio streaming between device and client.
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.audio import AudioRecorder
from core.inference import run_inference

logger = logging.getLogger("heartsound.websocket")

router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    """
    WebSocket connection manager for multiple clients.
    WebSocket连接管理器，支持多客户端
    """

    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
        self._recorders: dict[str, AudioRecorder] = {}
        self._tasks: dict[str, asyncio.Task] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> bool:
        """Accept new WebSocket connection."""
        try:
            await websocket.accept()
            self.active_connections[session_id] = websocket
            logger.info(f"Client connected: {session_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to accept connection: {e}")
            return False

    def disconnect(self, session_id: str):
        """Handle client disconnect."""
        if session_id in self.active_connections:
            del self.active_connections[session_id]
            logger.info(f"Client disconnected: {session_id}")

        # Clean up recorder
        if session_id in self._recorders:
            self._recorders[session_id].cleanup()
            del self._recorders[session_id]

        # Cancel any running tasks
        if session_id in self._tasks:
            self._tasks[session_id].cancel()
            del self._tasks[session_id]

    async def send_message(self, session_id: str, message: dict):
        """Send JSON message to specific client."""
        if session_id in self.active_connections:
            try:
                await self.active_connections[session_id].send_json(message)
            except Exception as e:
                logger.error(f"Failed to send message to {session_id}: {e}")
                self.disconnect(session_id)

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients."""
        for session_id in list(self.active_connections.keys()):
            await self.send_message(session_id, message)

    def get_recorder(self, session_id: str, duration: int = 30) -> AudioRecorder:
        """Get or create audio recorder for session."""
        if session_id not in self._recorders:
            self._recorders[session_id] = AudioRecorder(duration=duration)
        return self._recorders[session_id]

    def is_connected(self, session_id: str) -> bool:
        """Check if session is connected."""
        return session_id in self.active_connections


# Global connection manager
manager = ConnectionManager()


@router.websocket("/ws/audio/{session_id}")
async def websocket_audio_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for audio streaming.
    音频流WebSocket端点

    Protocol Messages:
    - audio_frame: Real-time waveform data for visualization
    - status: Recording status updates
    - recording_complete: Recording finished, analysis starting
    - analysis_complete: AI analysis finished with results
    """
    # Accept connection
    if not await manager.connect(session_id, websocket):
        return

    try:
        # Wait for start command from client
        logger.info(f"Waiting for start command from {session_id}")

        # Send connected status
        await manager.send_message(session_id, {
            "type": "status",
            "status": "connected",
            "session_id": session_id,
            "message": "设备连接成功，等待开始录制"
        })

        # Main message loop
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=60.0
                )

                command = data.get("command", "")

                if command == "start":
                    # Start recording
                    duration = data.get("duration", 30)
                    await handle_recording(session_id, duration)

                elif command == "stop":
                    # Manual stop
                    logger.info(f"Manual stop requested for {session_id}")
                    break

                elif command == "ping":
                    # Keep-alive ping
                    await manager.send_message(session_id, {
                        "type": "pong",
                        "timestamp": datetime.now().isoformat()
                    })

            except asyncio.TimeoutError:
                # Check if still connected
                if not manager.is_connected(session_id):
                    break
                continue

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error for {session_id}: {e}")
        await manager.send_message(session_id, {
            "type": "error",
            "error": "connection_error",
            "message": str(e)
        })
    finally:
        manager.disconnect(session_id)


async def handle_recording(session_id: str, duration: int = 30):
    """
    Handle audio recording session.
    处理音频录制会话
    """
    recorder = manager.get_recorder(session_id, duration=duration)

    # Start recording
    await recorder.start_recording()
    logger.info(f"Recording started for {session_id}, duration: {duration}s")

    # Send recording started status
    await manager.send_message(session_id, {
        "type": "status",
        "status": "recording",
        "remaining_seconds": duration,
        "message": "开始录制心音"
    })

    # Stream audio frames
    frame_count = 0
    async for frame in recorder.stream_frames(frame_interval=0.033):
        if not manager.is_connected(session_id):
            logger.warning(f"Client disconnected during recording: {session_id}")
            await recorder.stop_recording()
            return

        # Send audio frame
        await manager.send_message(session_id, {
            "type": "audio_frame",
            "timestamp": frame["timestamp"],
            "data": frame["waveform"],
            "amplitude": frame["amplitude"],
            "remaining_seconds": frame["remaining_seconds"]
        })

        frame_count += 1

        # Send status update every 5 seconds
        if frame_count % 150 == 0:  # ~5 seconds at 30fps
            await manager.send_message(session_id, {
                "type": "status",
                "status": "recording",
                "remaining_seconds": recorder.remaining_seconds,
                "progress": int((1 - recorder.remaining_seconds / duration) * 100)
            })

    # Stop recording
    audio_data = await recorder.stop_recording()
    logger.info(f"Recording completed for {session_id}, {len(audio_data)} samples")

    # Send recording complete message
    await manager.send_message(session_id, {
        "type": "recording_complete",
        "session_id": session_id,
        "message": "录制完成，开始AI分析"
    })

    # Run AI analysis
    await manager.send_message(session_id, {
        "type": "status",
        "status": "analyzing",
        "message": "AI正在分析心音..."
    })

    try:
        result = await run_inference(audio_data)

        # Send analysis complete with results
        await manager.send_message(session_id, {
            "type": "analysis_complete",
            "session_id": session_id,
            "result": {
                "category": result.category,
                "label": result.label,
                "confidence": result.confidence,
                "risk_level": result.risk_level,
                "probabilities": result.probabilities,
                "health_advice": {
                    "summary": result.health_advice.summary,
                    "suggestions": result.health_advice.suggestions,
                    "action": result.health_advice.action
                }
            }
        })

        logger.info(f"Analysis complete for {session_id}: {result.category}")

    except Exception as e:
        logger.error(f"Analysis failed for {session_id}: {e}")
        await manager.send_message(session_id, {
            "type": "error",
            "error": "analysis_failed",
            "message": "AI分析失败，请重试"
        })


# Export connection manager for use by detection API
def get_connection_manager() -> ConnectionManager:
    """Get the global connection manager."""
    return manager
