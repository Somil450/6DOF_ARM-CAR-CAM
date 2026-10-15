"""
WAREBOT - Backend API Integration Tests
"""
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.config import config

client = TestClient(app)

def test_api_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "HEALTHY"

def test_settings_api():
    # Fetch settings
    res = client.get("/api/settings")
    assert res.status_code == 200
    data = res.json()
    assert "car_ip" in data
    assert "arm_ip" in data
    assert "camera_ip" in data

    # Update settings
    update_res = client.post("/api/settings", json={"stop_distance_cm": 28.0})
    assert update_res.status_code == 200
    assert update_res.json()["settings"]["stop_distance_cm"] == 28.0

def test_arm_api_endpoints():
    # Valid angles
    res = client.post("/api/arm/angles", json={"angles": [146, 180, 46, 124, 119, 157]})
    assert res.status_code == 200

    # Invalid angles
    res_bad = client.post("/api/arm/angles", json={"angles": [146, 999, 46, 124, 119, 157]})
    assert res_bad.status_code == 400

def test_emergency_stop_endpoints():
    # Engage emergency stop
    res_stop = client.post("/api/emergency_stop")
    assert res_stop.status_code == 200
    assert res_stop.json()["emergency_stop"] is True

    # Moving car while E-STOP is active must be rejected with 423 Locked
    res_fwd = client.post("/api/car/command", json={"command": "FORWARD"})
    assert res_fwd.status_code == 423

    # Reset emergency latch
    res_reset = client.post("/api/emergency_reset")
    assert res_reset.status_code == 200
    assert res_reset.json()["emergency_stop"] is False

def test_logs_api():
    res = client.get("/api/logs")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    res_csv = client.get("/api/logs/export/csv")
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
