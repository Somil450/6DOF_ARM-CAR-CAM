"""
WAREBOT - Central Robotics Gateway & FastAPI Server
Pair-programmed with Senior Full-Stack & Embedded Robotics Engineers
"""
import os
import time
import asyncio
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, PlainTextResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from backend.config import config
from backend.schemas import (
    CarCommandRequest,
    ArmAnglesRequest,
    ArmCommandRequest,
    GripperRequest,
    TargetSelectionRequest,
    MissionControlRequest,
    SettingsUpdateRequest,
    Severity,
    Subsystem
)
from backend.services.log_service import log_service
from backend.services.car_service import car_service
from backend.services.arm_service import arm_service
from backend.services.camera_service import camera_service
from backend.services.vision_service import vision_service
from backend.services.mission_service import mission_service
from backend.services.telemetry_service import telemetry_service

# Lifespan manager for background polling and services
@asynccontextmanager
async def lifespan(app: FastAPI):
    log_service.info(Subsystem.GATEWAY, "GATEWAY_STARTING", "WAREBOT Local Robotics Gateway starting up")
    
    # Start Camera receiver and Vision worker
    camera_service.start()
    vision_service.start()
    
    # Launch background polling task
    async def hardware_poll_loop():
        while True:
            try:
                await car_service.poll_hardware()
                arm_service.check_health()
            except Exception as e:
                log_service.error(Subsystem.GATEWAY, "POLL_ERROR", f"Error in hardware poll loop: {e}")
            await asyncio.sleep(0.25) # 4 Hz health polling

    poll_task = asyncio.create_task(hardware_poll_loop())
    broadcast_task = asyncio.create_task(telemetry_service.broadcast_loop())
    
    log_service.success(Subsystem.GATEWAY, "GATEWAY_READY", "Robotics Gateway initialized and listening")
    yield
    
    # Shutdown
    log_service.info(Subsystem.GATEWAY, "GATEWAY_SHUTDOWN", "Shutting down services safely")
    poll_task.cancel()
    broadcast_task.cancel()
    car_service.send_command("STOP", force=True)
    arm_service.send_command("STOP")
    camera_service.stop()
    vision_service.stop()

app = FastAPI(
    title="WAREBOT Robotics Gateway",
    description="Unified API & WebSocket Gateway for WAREBOT Car, Arm, and Camera ESP32s",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local dev and PWA
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# WEBSOCKET TELEMETRY
# ============================================================
@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    await telemetry_service.connect(websocket)
    try:
        while True:
            # Client can send heartbeat or commands over WS
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        telemetry_service.disconnect(websocket)
    except Exception:
        telemetry_service.disconnect(websocket)

# ============================================================
# HEALTH & STATE
# ============================================================
@app.get("/api/health")
async def get_gateway_health():
    return {
        "status": "HEALTHY",
        "timestamp": time.time(),
        "simulation_mode": config.simulation_mode,
        "emergency_stop": mission_service.emergency_stop
    }

# ============================================================
# CAR CONTROLS
# ============================================================
@app.post("/api/car/command")
async def send_car_command(req: CarCommandRequest):
    cmd_upper = req.command.strip().upper()
    if cmd_upper == "RESET":
        mission_service.clear_emergency_stop()
    elif mission_service.emergency_stop and not req.force and cmd_upper != "STOP":
        raise HTTPException(status_code=423, detail="Emergency Stop is active. Reset latch before moving.")
    res = car_service.send_command(req.command, force=req.force)
    return res

@app.get("/api/car/status")
async def get_car_status():
    return car_service.get_telemetry()

@app.get("/api/car/distance")
async def get_car_distance():
    dist = car_service.current_distance
    if dist is None:
        return {"status": "INVALID_DISTANCE", "distance": None}
    return {"status": "VALID", "distance": dist}

# ============================================================
# ARM CONTROLS
# ============================================================
@app.post("/api/arm/angles")
async def set_arm_angles(req: ArmAnglesRequest):
    if mission_service.emergency_stop:
        raise HTTPException(status_code=423, detail="Emergency Stop is active.")
    res = arm_service.set_angles(req.angles)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/arm/command")
async def send_arm_command(req: ArmCommandRequest):
    if mission_service.emergency_stop and req.command.upper() != "STOP":
        raise HTTPException(status_code=423, detail="Emergency Stop is active.")
    res = arm_service.send_command(req.command)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/arm/gripper")
async def control_gripper(req: GripperRequest):
    if mission_service.emergency_stop:
        raise HTTPException(status_code=423, detail="Emergency Stop is active.")
    res = arm_service.control_gripper(req.action, req.angle)
    return res

@app.post("/api/arm/preset")
async def apply_arm_preset(preset: str = Query(...)):
    if mission_service.emergency_stop:
        raise HTTPException(status_code=423, detail="Emergency Stop is active.")
    res = arm_service.apply_preset(preset)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

# ============================================================
# CAMERA & MJPEG PROXY
# ============================================================
@app.get("/api/camera/stream")
async def get_camera_mjpeg_stream():
    """Proxies the low-latency MJPEG stream to browser clients"""
    return StreamingResponse(
        camera_service.generate_mjpeg_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )

@app.get("/api/camera/snapshot")
async def get_camera_snapshot():
    jpeg = camera_service.get_latest_jpeg()
    if jpeg is None:
        raise HTTPException(status_code=503, detail="No frame captured yet")
    return Response(content=jpeg, media_type="image/jpeg")

# ============================================================
# VISION & TARGET SELECTION
# ============================================================
@app.post("/api/vision/target")
async def set_vision_target(req: TargetSelectionRequest):
    res = vision_service.set_target(req.target_class)
    return res

@app.post("/api/vision/start")
async def start_vision():
    vision_service.start()
    return {"success": True, "status": "STARTED"}

@app.post("/api/vision/stop")
async def stop_vision():
    vision_service.stop()
    return {"success": True, "status": "STOPPED"}

# ============================================================
# MISSION & AUTONOMY
# ============================================================
@app.post("/api/mission/start")
async def start_mission(req: TargetSelectionRequest):
    res = mission_service.start_following(req.target_class)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/mission/stop")
async def stop_mission():
    return mission_service.stop_following()

@app.post("/api/mission/pickup")
async def trigger_pickup():
    return mission_service.trigger_pickup()

@app.post("/api/emergency_stop")
async def emergency_stop():
    return mission_service.trigger_emergency_stop()

@app.post("/api/emergency_reset")
async def emergency_reset():
    return mission_service.clear_emergency_stop()

# ============================================================
# SETTINGS & CALIBRATION
# ============================================================
@app.get("/api/settings")
async def get_settings():
    return config.model_dump()

@app.post("/api/settings")
async def update_settings(req: SettingsUpdateRequest):
    if req.car_ip is not None:
        config.car_ip = req.car_ip
    if req.arm_ip is not None:
        config.arm_ip = req.arm_ip
    if req.camera_ip is not None:
        config.camera_ip = req.camera_ip
    if req.stop_distance_cm is not None:
        config.stop_distance_cm = req.stop_distance_cm
    if req.reverse_distance_cm is not None:
        config.reverse_distance_cm = req.reverse_distance_cm
    if req.gripper_open_angle is not None:
        config.gripper_open_angle = req.gripper_open_angle
    if req.gripper_closed_angle is not None:
        config.gripper_closed_angle = req.gripper_closed_angle
    if req.yolo_confidence is not None:
        config.yolo_confidence = req.yolo_confidence
    if req.simulation_mode is not None:
        config.simulation_mode = req.simulation_mode
        log_service.info(
            Subsystem.GATEWAY,
            "MODE_CHANGED",
            f"Simulation Mode set to {config.simulation_mode}"
        )
    return {"success": True, "settings": config.model_dump()}

@app.post("/api/settings/test")
async def test_device_connection(device: str = Query(...)):
    dev = device.lower()
    if dev == "car":
        await car_service.poll_hardware()
        status = car_service.get_status()
        return {"device": "car", "online": status.online, "latency_ms": status.latency_ms, "error": status.last_error}
    elif dev == "arm":
        arm_service.check_health()
        status = arm_service.get_status()
        return {"device": "arm", "online": status.online, "latency_ms": status.latency_ms, "error": status.last_error}
    elif dev == "camera":
        status = camera_service.get_status()
        return {"device": "camera", "online": status.online, "latency_ms": status.latency_ms, "error": status.last_error}
    else:
        raise HTTPException(status_code=400, detail="Unknown device. Choose car, arm, or camera.")

# ============================================================
# LOGS & EVENTS
# ============================================================
@app.get("/api/logs")
async def get_logs(
    severity: Optional[str] = None,
    subsystem: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100
):
    entries = log_service.get_entries(severity, subsystem, search, limit)
    return [e.model_dump() for e in entries]

@app.get("/api/logs/export/csv")
async def export_logs_csv():
    csv_text = log_service.to_csv()
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=warebot_logs.csv"}
    )

@app.get("/api/logs/export/json")
async def export_logs_json():
    entries = log_service.get_entries(limit=500)
    return [e.model_dump() for e in entries]

@app.post("/api/logs/clear")
async def clear_logs():
    log_service.clear()
    log_service.info(Subsystem.SYSTEM, "LOGS_CLEARED", "Log history cleared by operator")
    return {"success": True}

# ============================================================
# STATIC FILES FOR BUILT FRONTEND / PWA
# ============================================================
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
