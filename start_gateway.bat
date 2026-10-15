@echo off
title WAREBOT Robotics Gateway
echo ============================================================
echo           WAREBOT LOCAL ROBOTICS GATEWAY
echo ============================================================
echo Starting FastAPI Uvicorn Server on http://0.0.0.0:8000 ...
echo WebSocket Telemetry listening on ws://0.0.0.0:8000/ws/telemetry
echo PWA Web Dashboard available at http://localhost:8000
echo.
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --log-level info
pause
