"""
WAREBOT - Telemetry Aggregator & WebSocket Broadcaster
"""
import time
import asyncio
import json
from typing import Set, Dict, Any, Optional
from fastapi import WebSocket
from backend.config import config
from backend.schemas import DeviceStatus
from backend.services.car_service import car_service
from backend.services.arm_service import arm_service
from backend.services.camera_service import camera_service
from backend.services.vision_service import vision_service
from backend.services.mission_service import mission_service

class TelemetryService:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.broadcast_task: Optional[asyncio.Task] = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        # Send immediate initial snapshot
        await websocket.send_text(json.dumps(self.compile_payload()))

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    def compile_payload(self) -> Dict[str, Any]:
        """Gathers synchronized telemetry across all subsystems"""
        now = time.time()
        
        # Gateway device status
        gateway_status = DeviceStatus(
            online=True,
            status_text="ONLINE",
            latency_ms=0.0,
            ip=config.gateway_host,
            port=config.gateway_port,
            last_seen=now,
            last_error=None
        )

        devices = {
            "gateway": gateway_status.model_dump(),
            "car": car_service.get_status().model_dump(),
            "arm": arm_service.get_status().model_dump(),
            "camera": camera_service.get_status().model_dump(),
            "vision": vision_service.get_status().model_dump(),
        }

        mission_telem = mission_service.get_telemetry()

        return {
            "timestamp": now,
            "iso_time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "system_mode": "EMERGENCY_STOP" if mission_service.emergency_stop else ("AUTONOMOUS" if mission_service.state == "FOLLOWING" else "MANUAL"),
            "simulation_mode": config.simulation_mode,
            "emergency_stop": mission_service.emergency_stop,
            "devices": devices,
            "car": car_service.get_telemetry(),
            "arm": arm_service.get_telemetry(),
            "camera": camera_service.get_telemetry(),
            "detection": vision_service.get_telemetry(),
            "mission": mission_telem,
        }

    async def broadcast_loop(self):
        """Broadcasts telemetry payload to all active WebSocket clients at 10Hz"""
        while True:
            await asyncio.sleep(0.1) # 10 Hz broadcast
            if not self.active_connections:
                continue

            payload_json = json.dumps(self.compile_payload())
            disconnected = []
            for ws in self.active_connections:
                try:
                    await ws.send_text(payload_json)
                except Exception:
                    disconnected.append(ws)
            for ws in disconnected:
                self.active_connections.discard(ws)

# Global telemetry service instance
telemetry_service = TelemetryService()
