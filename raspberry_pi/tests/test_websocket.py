# -*- coding: utf-8 -*-
"""
HeartSound WebSocket Tests
心音智鉴WebSocket测试用例
"""
import pytest
from fastapi.testclient import TestClient
from starlette.testclient import TestClient as StarletteTestClient
from fastapi.websockets import WebSocket

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app


class TestDetectionAPI:
    """Tests for Detection REST API."""

    def setup_method(self):
        """Set up test client."""
        self.client = TestClient(app)

    def test_start_detection_success(self):
        """Test starting a new detection session."""
        response = self.client.post(
            "/api/detection/start",
            json={"duration": 30}
        )
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert "websocket_url" in data
        assert data["session_id"].startswith("sess_")
        assert "ws://" in data["websocket_url"]
        assert data["duration"] == 30

    def test_start_detection_with_user_id(self):
        """Test starting detection with user ID."""
        response = self.client.post(
            "/api/detection/start",
            json={"user_id": "test_user_123", "duration": 20}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["duration"] == 20

    def test_start_detection_invalid_duration(self):
        """Test starting detection with invalid duration."""
        # Duration too short
        response = self.client.post(
            "/api/detection/start",
            json={"duration": 5}
        )
        assert response.status_code == 422  # Validation error

        # Duration too long
        response = self.client.post(
            "/api/detection/start",
            json={"duration": 120}
        )
        assert response.status_code == 422

    def test_get_detection_result_not_found(self):
        """Test getting result for non-existent session."""
        response = self.client.get("/api/detection/fake_session/result")
        assert response.status_code == 404
        data = response.json()
        assert data["detail"]["error"] == "session_not_found"

    def test_get_detection_result_pending(self):
        """Test getting result for pending session."""
        # Create session first
        start_response = self.client.post(
            "/api/detection/start",
            json={"duration": 30}
        )
        session_id = start_response.json()["session_id"]

        # Get result
        response = self.client.get(f"/api/detection/{session_id}/result")
        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == session_id
        assert data["status"] == "pending"

    def test_trigger_analysis(self):
        """Test manually triggering analysis."""
        # Create session
        start_response = self.client.post(
            "/api/detection/start",
            json={"duration": 10}
        )
        session_id = start_response.json()["session_id"]

        # Trigger analysis
        response = self.client.post(f"/api/detection/{session_id}/analyze")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["result"] is not None
        assert "category" in data["result"]
        assert "confidence" in data["result"]
        assert "health_advice" in data["result"]

    def test_cancel_detection(self):
        """Test cancelling a detection session."""
        # Create session
        start_response = self.client.post(
            "/api/detection/start",
            json={"duration": 30}
        )
        session_id = start_response.json()["session_id"]

        # Cancel
        response = self.client.delete(f"/api/detection/{session_id}")
        assert response.status_code == 200
        assert response.json()["session_id"] == session_id

        # Verify cancelled
        result_response = self.client.get(f"/api/detection/{session_id}/result")
        assert result_response.status_code == 404

    def test_list_active_sessions(self):
        """Test listing active sessions."""
        # Create a few sessions
        for _ in range(3):
            self.client.post("/api/detection/start", json={"duration": 30})

        response = self.client.get("/api/detection/sessions/active")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] >= 3
        assert len(data["sessions"]) >= 3


class TestWebSocketConnection:
    """Tests for WebSocket audio streaming."""

    def test_websocket_connect(self):
        """Test WebSocket connection."""
        client = TestClient(app)

        with client.websocket_connect("/ws/audio/test_session_001") as websocket:
            # Should receive connected status
            data = websocket.receive_json()
            assert data["type"] == "status"
            assert data["status"] == "connected"
            assert "session_id" in data

    def test_websocket_ping_pong(self):
        """Test WebSocket ping/pong."""
        client = TestClient(app)

        with client.websocket_connect("/ws/audio/test_session_002") as websocket:
            # Skip connected message
            websocket.receive_json()

            # Send ping
            websocket.send_json({"command": "ping"})
            data = websocket.receive_json()
            assert data["type"] == "pong"
            assert "timestamp" in data

    def test_websocket_start_recording(self):
        """Test starting recording via WebSocket."""
        client = TestClient(app)

        with client.websocket_connect("/ws/audio/test_session_003") as websocket:
            # Skip connected message
            websocket.receive_json()

            # Start recording
            websocket.send_json({"command": "start", "duration": 2})

            # Should receive recording status
            data = websocket.receive_json()
            assert data["type"] == "status"
            assert data["status"] == "recording"


class TestCoreModules:
    """Tests for core module imports."""

    def test_audio_module_import(self):
        """Test audio module import."""
        from core.audio import AudioRecorder
        recorder = AudioRecorder(duration=5)
        assert recorder.duration == 5
        assert not recorder.is_recording

    def test_inference_module_import(self):
        """Test inference module import."""
        from core.inference import (
            HeartSoundClassifier,
            CATEGORIES,
            RISK_LEVELS
        )
        assert len(CATEGORIES) == 5
        assert "normal" in CATEGORIES
        assert RISK_LEVELS["normal"] == "safe"

    def test_qrcode_module_import(self):
        """Test QR code module import."""
        from core.qrcode import (
            generate_connect_url,
            get_connection_info
        )
        url = generate_connect_url(ip="192.168.1.100")
        assert "heartsound://" in url
        assert "192.168.1.100" in url

        info = get_connection_info()
        assert "ip" in info
        assert "websocket_url" in info

    def test_audio_utils_import(self):
        """Test audio utils import."""
        import numpy as np
        from utils.audio_utils import (
            normalize_audio,
            calculate_rms,
            extract_waveform_points,
            preprocess_for_inference
        )

        # Test normalize
        data = np.array([0.5, -1.0, 0.5], dtype=np.float32)
        normalized = normalize_audio(data)
        assert normalized.max() <= 1.0

        # Test RMS
        rms = calculate_rms(data)
        assert rms > 0

        # Test waveform extraction
        points = extract_waveform_points(data, num_points=10)
        assert len(points) == 10


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
