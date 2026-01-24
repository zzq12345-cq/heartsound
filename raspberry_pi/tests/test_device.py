# -*- coding: utf-8 -*-
"""
HeartSound Device API Tests
心音智鉴设备API单元测试
"""
import pytest
from fastapi.testclient import TestClient
from datetime import datetime

# Add parent directory to path for imports
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app


# Create test client
client = TestClient(app)


class TestDeviceInfo:
    """Tests for /api/device/info endpoint"""

    def test_device_info_success(self):
        """Test successful device info retrieval"""
        response = client.get("/api/device/info")

        assert response.status_code == 200

        data = response.json()
        assert "device_id" in data
        assert "device_name" in data
        assert "status" in data
        assert "ip_address" in data
        assert "firmware_version" in data
        assert "model_version" in data
        assert "uptime_seconds" in data

        # Validate status is one of expected values
        assert data["status"] in ["ready", "recording", "analyzing"]

        # Validate uptime is non-negative
        assert data["uptime_seconds"] >= 0

    def test_device_info_response_format(self):
        """Test device info response has correct data types"""
        response = client.get("/api/device/info")
        data = response.json()

        assert isinstance(data["device_id"], str)
        assert isinstance(data["device_name"], str)
        assert isinstance(data["status"], str)
        assert isinstance(data["ip_address"], str)
        assert isinstance(data["firmware_version"], str)
        assert isinstance(data["model_version"], str)
        assert isinstance(data["uptime_seconds"], int)


class TestDevicePing:
    """Tests for /api/device/ping endpoint"""

    def test_ping_success(self):
        """Test successful ping response"""
        response = client.get("/api/device/ping")

        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "ok"
        assert "timestamp" in data

    def test_ping_timestamp_format(self):
        """Test ping timestamp is valid ISO format"""
        response = client.get("/api/device/ping")
        data = response.json()

        # Should be parseable as datetime
        timestamp = data["timestamp"]
        assert timestamp is not None

        # Try to parse the timestamp
        try:
            # ISO format with timezone
            datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            pytest.fail(f"Invalid timestamp format: {timestamp}")


class TestRootEndpoints:
    """Tests for root endpoints"""

    def test_root_endpoint(self):
        """Test root endpoint returns API info"""
        response = client.get("/")

        assert response.status_code == 200

        data = response.json()
        assert "name" in data
        assert "version" in data
        assert "device_id" in data
        assert data["name"] == "HeartSound API"

    def test_health_check(self):
        """Test health check endpoint"""
        response = client.get("/health")

        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "healthy"


class TestCORS:
    """Tests for CORS configuration"""

    def test_cors_headers_present(self):
        """Test CORS headers are present in response"""
        response = client.options(
            "/api/device/info",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            }
        )

        # CORS preflight should succeed
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
