"""
WAREBOT - Robotic Arm Communication Service
Preserves exact UDP protocols from robot_arm.ino and arm_slider_control.py
"""
import time
import socket
from typing import List, Optional, Dict, Any
from backend.config import config
from backend.schemas import Subsystem, DeviceStatus
from backend.services.log_service import log_service

class ArmService:
    def __init__(self):
        self.slider_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.command_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        
        # Non-blocking sockets
        self.slider_socket.setblocking(False)
        self.command_socket.setblocking(False)
        
        self.commanded_angles: List[int] = list(config.home_angles)
        self.last_sent_angles: List[int] = list(config.home_angles)
        self.last_sent_time: float = 0.0
        
        self.gripper_state: str = "OPEN" if config.home_angles[5] >= config.gripper_open_angle - 20 else "CLOSED"
        self.homing_active: bool = False
        
        self.online: bool = False
        self.latency_ms: Optional[float] = None
        self.last_seen: Optional[float] = None
        self.last_error: Optional[str] = None
        
        # Verified Presets (CH3 in 0°-360° UI coordinates)
        self.presets = {
            "HOME": list(config.home_angles),
            "READY": [146, 150, 70, 220, 119, config.gripper_open_angle],
            "PICKUP": [146, 120, 100, 180, 119, config.gripper_open_angle],
            "DROP_OFF": [80, 140, 80, 200, 119, config.gripper_open_angle],
        }

    def get_status(self) -> DeviceStatus:
        if config.simulation_mode:
            return DeviceStatus(
                online=True,
                status_text="SIMULATION",
                latency_ms=0.8,
                ip=config.arm_ip,
                port=config.arm_slider_port,
                last_seen=time.time(),
                last_error=None
            )
        return DeviceStatus(
            online=self.online,
            status_text="ONLINE" if self.online else "OFFLINE",
            latency_ms=self.latency_ms,
            ip=config.arm_ip,
            port=config.arm_slider_port,
            last_seen=self.last_seen,
            last_error=self.last_error
        )

    def get_telemetry(self) -> Dict[str, Any]:
        return {
            "online": self.online if not config.simulation_mode else True,
            "commanded_angles": list(self.commanded_angles),
            "measured_angles": None, # Physical servos do not provide feedback
            "homing_active": self.homing_active,
            "joint_min_angles": list(config.joint_min_angles),
            "joint_max_angles": list(config.joint_max_angles),
            "gripper_channel": config.gripper_channel,
            "gripper_state": self.gripper_state,
            "gripper_angle": self.commanded_angles[config.gripper_channel],
            "gripper_open_angle": config.gripper_open_angle,
            "gripper_closed_angle": config.gripper_closed_angle,
            "presets": list(self.presets.keys()),
            "joint_names": [
                "Base (CH0)",
                "Shoulder (CH1)",
                "Elbow (CH2)",
                "Wrist Pitch (CH3)",
                "Wrist Roll (CH4)",
                "Gripper (CH5)"
            ]
        }

    def check_health(self):
        """Validates network route to Arm ESP32 using socket probe"""
        if config.simulation_mode:
            self.online = True
            self.latency_ms = 1.0
            self.last_seen = time.time()
            return

        try:
            # We perform a lightweight ping / connect test to port
            start_t = time.perf_counter()
            test_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            test_sock.settimeout(0.5)
            # UDP connect verifies route in OS kernel
            test_sock.connect((config.arm_ip, config.arm_slider_port))
            round_trip = (time.perf_counter() - start_t) * 1000.0
            test_sock.close()
            
            self.online = True
            self.latency_ms = round(round_trip, 1)
            self.last_seen = time.time()
            self.last_error = None
        except Exception as err:
            self.online = False
            self.latency_ms = None
            self.last_error = str(err)

    def set_angles(self, angles: List[int]) -> Dict[str, Any]:
        """Transmits 6-byte raw angle packet to UDP port 4242"""
        if len(angles) != 6:
            return {"success": False, "error": "Exactly 6 joint angles required"}
        
        limits = config.joint_max_angles
        mins = config.joint_min_angles
        for i, a in enumerate(angles):
            max_val = limits[i] if i < len(limits) else 180
            min_val = mins[i] if i < len(mins) else 0
            if not (min_val <= a <= max_val):
                return {"success": False, "error": f"Servo {i} angle {a} out of bounds ({min_val}-{max_val})"}

        self.commanded_angles = list(angles)
        if angles[config.gripper_channel] >= config.gripper_open_angle - 15:
            self.gripper_state = "OPEN"
        elif angles[config.gripper_channel] <= config.gripper_closed_angle + 15:
            self.gripper_state = "CLOSED"
        else:
            self.gripper_state = "PARTIAL"

        if config.simulation_mode:
            self.last_sent_angles = list(angles)
            return {"success": True, "angles": self.commanded_angles, "mode": "SIMULATION"}

        try:
            # Wire protocol: ESP32 expects 6 uint8_t bytes (0-180 for standard servos).
            # Joint 3 (Wrist Pitch) UI range is 0-360°, mapped to 0-180 wire byte.
            wire_angles = list(angles)
            wire_angles[3] = int(round(angles[3] * 180.0 / 360.0))
            wire_angles[3] = max(0, min(180, wire_angles[3]))
            
            packet = bytes(wire_angles)
            self.slider_socket.sendto(packet, (config.arm_ip, config.arm_slider_port))
            self.last_sent_angles = list(angles)
            self.last_sent_time = time.time()
            return {"success": True, "angles": self.commanded_angles}
        except Exception as err:
            log_service.error(Subsystem.ARM, "ANGLE_PACKET_FAILED", f"UDP slider send error: {err}")
            return {"success": False, "error": str(err)}

    def send_command(self, cmd: str) -> Dict[str, Any]:
        """Sends ASCII command to UDP port 5005 (HOME, STOP, PICKUP, PICKUP_COMPLETE, RESET)"""
        cmd = cmd.strip().upper()
        if cmd not in {"HOME", "STOP", "PICKUP", "PICKUP_COMPLETE", "RESET"}:
            return {"success": False, "error": f"Unknown arm command: {cmd}"}

        if cmd == "HOME":
            self.homing_active = True
            self.commanded_angles = list(config.home_angles)
        elif cmd in {"STOP", "RESET"}:
            self.homing_active = False

        log_service.info(Subsystem.ARM, "COMMAND_DISPATCH", f"Sending command {cmd} to Arm {config.arm_ip}:{config.arm_command_port}")

        if config.simulation_mode:
            return {"success": True, "command": cmd, "mode": "SIMULATION"}

        try:
            payload = cmd.encode("utf-8")
            self.command_socket.sendto(payload, (config.arm_ip, config.arm_command_port))
            return {"success": True, "command": cmd}
        except Exception as err:
            log_service.error(Subsystem.ARM, "COMMAND_FAILED", f"UDP arm command error: {err}")
            return {"success": False, "error": str(err)}

    def control_gripper(self, action: str, angle: Optional[int] = None) -> Dict[str, Any]:
        action = action.upper()
        current_gripper_angle = self.commanded_angles[config.gripper_channel]
        
        target_angle = current_gripper_angle
        if action == "OPEN":
            target_angle = config.gripper_open_angle
        elif action == "CLOSE":
            target_angle = config.gripper_closed_angle
        elif action == "STEP_UP":
            target_angle = min(180, current_gripper_angle + config.gripper_step)
        elif action == "STEP_DOWN":
            target_angle = max(0, current_gripper_angle - config.gripper_step)
        elif action == "SET_ANGLE" and angle is not None:
            target_angle = max(0, min(180, angle))
            
        new_angles = list(self.commanded_angles)
        new_angles[config.gripper_channel] = target_angle
        res = self.set_angles(new_angles)
        if res.get("success"):
            log_service.info(
                Subsystem.ARM,
                "GRIPPER_MOVED",
                f"Gripper action {action} -> {target_angle}°"
            )
        return res

    def apply_preset(self, preset_name: str) -> Dict[str, Any]:
        name_upper = preset_name.upper()
        if name_upper not in self.presets:
            return {"success": False, "error": f"Preset '{preset_name}' not configured"}
        angles = self.presets[name_upper]
        res = self.set_angles(angles)
        if res.get("success"):
            log_service.info(Subsystem.ARM, "PRESET_APPLIED", f"Applied arm preset {name_upper}: {angles}")
        return res

# Global arm service instance
arm_service = ArmService()
