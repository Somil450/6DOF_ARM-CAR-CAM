"""
WAREBOT - Pydantic Data Schemas
"""
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class Severity(str, Enum):
    INFO = "INFO"
    SUCCESS = "SUCCESS"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"

class Subsystem(str, Enum):
    SYSTEM = "SYSTEM"
    GATEWAY = "GATEWAY"
    CAR = "CAR"
    ARM = "ARM"
    CAMERA = "CAMERA"
    VISION = "VISION"
    MISSION = "MISSION"

class DeviceStatus(BaseModel):
    online: bool = False
    status_text: str = "OFFLINE" # ONLINE, OFFLINE, CONNECTING, DEGRADED, SIMULATION
    latency_ms: Optional[float] = None
    ip: str = ""
    port: int = 0
    last_seen: Optional[float] = None
    last_error: Optional[str] = None

class LogEntry(BaseModel):
    id: str
    timestamp: float
    iso_time: str
    severity: Severity
    subsystem: Subsystem
    event_type: str
    message: str
    details: Optional[Dict[str, Any]] = None

class CarCommandRequest(BaseModel):
    command: str # FORWARD, BACKWARD, STOP, RESET
    force: bool = False

class ArmAnglesRequest(BaseModel):
    angles: List[int] = Field(..., min_length=6, max_length=6)

class ArmCommandRequest(BaseModel):
    command: str # HOME, STOP, PICKUP, PICKUP_COMPLETE, RESET

class GripperRequest(BaseModel):
    action: str # OPEN, CLOSE, STEP_UP, STEP_DOWN, SET_ANGLE
    angle: Optional[int] = None

class TargetSelectionRequest(BaseModel):
    target_class: str # "bottle", "box", "handkerchief", "any"

class MissionControlRequest(BaseModel):
    action: str # START_FOLLOWING, STOP_FOLLOWING, PICKUP, CANCEL, RESET

class SettingsUpdateRequest(BaseModel):
    car_ip: Optional[str] = None
    arm_ip: Optional[str] = None
    camera_ip: Optional[str] = None
    stop_distance_cm: Optional[float] = None
    reverse_distance_cm: Optional[float] = None
    gripper_open_angle: Optional[int] = None
    gripper_closed_angle: Optional[int] = None
    yolo_confidence: Optional[float] = None
    simulation_mode: Optional[bool] = None

class TelemetryPayload(BaseModel):
    timestamp: float
    system_mode: str # MANUAL, AUTONOMOUS, EMERGENCY_STOP
    simulation_mode: bool
    emergency_stop: bool
    devices: Dict[str, DeviceStatus]
    car: Dict[str, Any]
    arm: Dict[str, Any]
    camera: Dict[str, Any]
    detection: Dict[str, Any]
    mission: Dict[str, Any]
