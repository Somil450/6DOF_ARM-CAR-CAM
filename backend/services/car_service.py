"""
WAREBOT - Car ESP32 Communication & Telemetry Service
Preserves exact endpoints and protocol from car_code.ino
"""
import time
import requests
import asyncio
from typing import Optional, Dict, Any
from backend.config import config
from backend.schemas import Subsystem, DeviceStatus
from backend.services.log_service import log_service

class CarService:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"Connection": "keep-alive"})
        
        self.online: bool = False
        self.latency_ms: Optional[float] = None
        self.last_seen: Optional[float] = None
        self.last_error: Optional[str] = None
        
        self.current_distance: Optional[float] = None
        self.distance_updated_at: float = 0.0
        
        self.current_state: str = "UNKNOWN" # READY, MOVING_ALLOWED, PICKUP_STARTED, REVERSE_20_ACTIVE
        self.state_updated_at: float = 0.0
        
        self.last_command: Optional[str] = None
        self.last_command_time: float = 0.0
        
        # Simulation internal state
        self._sim_distance: float = 45.0
        self._sim_state: str = "READY"
        self._sim_moving: bool = False

    def get_status(self) -> DeviceStatus:
        if config.simulation_mode:
            return DeviceStatus(
                online=True,
                status_text="SIMULATION",
                latency_ms=1.2,
                ip=config.car_ip,
                port=config.car_port,
                last_seen=time.time(),
                last_error=None
            )
        return DeviceStatus(
            online=self.online,
            status_text="ONLINE" if self.online else "OFFLINE",
            latency_ms=self.latency_ms,
            ip=config.car_ip,
            port=config.car_port,
            last_seen=self.last_seen,
            last_error=self.last_error
        )

    def get_telemetry(self) -> Dict[str, Any]:
        now = time.time()
        is_fresh_distance = (
            self.current_distance is not None
            and (now - self.distance_updated_at <= config.distance_stale_seconds)
        )
        is_fresh_state = (
            self.current_state != "UNKNOWN"
            and (now - self.state_updated_at <= config.status_stale_seconds)
        )
        
        return {
            "online": self.online if not config.simulation_mode else True,
            "state": self.current_state,
            "state_fresh": is_fresh_state,
            "distance_cm": self.current_distance if is_fresh_distance else None,
            "distance_fresh": is_fresh_distance,
            "last_command": self.last_command,
            "stop_threshold_cm": config.stop_distance_cm,
            "reverse_target_cm": config.reverse_distance_cm,
        }

    async def poll_hardware(self):
        """Asynchronously polls the ESP32 for status, distance, and health"""
        if config.simulation_mode:
            self._update_simulation()
            return

        loop = asyncio.get_running_loop()
        try:
            start_t = time.perf_counter()
            # Perform status check
            status_url = f"http://{config.car_ip}:{config.car_port}/status"
            res = await loop.run_in_executor(
                None,
                lambda: self.session.get(status_url, timeout=(config.http_timeout_seconds, config.http_timeout_seconds))
            )
            round_trip = (time.perf_counter() - start_t) * 1000.0
            
            if res.status_code == 200:
                raw_status = res.text.strip().upper()
                self.current_state = raw_status
                self.state_updated_at = time.time()
                self.latency_ms = round(round_trip, 1)
                self.online = True
                self.last_seen = time.time()
                self.last_error = None
            else:
                self.online = False
                self.last_error = f"HTTP {res.status_code}"
        except Exception as e:
            self.online = False
            self.latency_ms = None
            self.last_error = str(e)

        # Distance query if online
        if self.online:
            try:
                dist_url = f"http://{config.car_ip}:{config.car_port}/distance"
                res_dist = await loop.run_in_executor(
                    None,
                    lambda: self.session.get(dist_url, timeout=(config.http_timeout_seconds, config.http_timeout_seconds))
                )
                if res_dist.status_code == 200:
                    val_str = res_dist.text.strip()
                    if val_str.upper() != "INVALID_DISTANCE":
                        d_val = float(val_str)
                        if 2.0 <= d_val <= 400.0:
                            self.current_distance = d_val
                            self.distance_updated_at = time.time()
                elif res_dist.status_code == 503:
                    self.current_distance = None
            except Exception:
                pass

    def send_command(self, cmd: str, force: bool = False) -> Dict[str, Any]:
        """Dispatches verified commands to Car ESP32"""
        cmd = cmd.strip().upper()
        if cmd not in {"FORWARD", "BACKWARD", "LEFT", "RIGHT", "STOP", "RESET"}:
            return {
                "success": False,
                "command": cmd,
                "error": f"Unsupported car command: {cmd}. Supported: FORWARD, BACKWARD, LEFT, RIGHT, STOP, RESET."
            }

        if config.simulation_mode:
            return self._execute_sim_command(cmd)

        cmd_url = f"http://{config.car_ip}:{config.car_port}/command"
        try:
            start_t = time.perf_counter()
            response = self.session.get(
                cmd_url,
                params={"cmd": cmd},
                timeout=(config.http_timeout_seconds, config.http_timeout_seconds + 0.5)
            )
            elapsed_ms = (time.perf_counter() - start_t) * 1000.0
            reply = response.text.strip().upper()

            if response.status_code == 409:
                log_service.warning(
                    Subsystem.CAR,
                    "COMMAND_BUSY",
                    f"Command {cmd} rejected by car: {reply} (active pickup/reverse)"
                )
                return {"success": False, "command": cmd, "reply": reply, "error": "Hardware busy in pickup/reverse cycle"}

            if response.status_code == 503:
                log_service.warning(
                    Subsystem.CAR,
                    "COMMAND_BLOCKED",
                    f"Command {cmd} rejected: Invalid or blocked distance"
                )
                return {"success": False, "command": cmd, "reply": reply, "error": "Invalid ultrasonic distance reading"}

            response.raise_for_status()

            accepted = False
            if cmd == "FORWARD":
                accepted = (reply == "FORWARD_ACCEPTED")
            elif cmd == "STOP":
                accepted = (reply == "STOPPED")
            elif cmd == "BACKWARD":
                accepted = reply in {"BACKWARD", "BACKWARD_ACCEPTED"}
            elif cmd == "LEFT":
                accepted = (reply == "LEFT_ACCEPTED")
            elif cmd == "RIGHT":
                accepted = (reply == "RIGHT_ACCEPTED")
            elif cmd == "RESET":
                accepted = reply in {"RESET", "RESET_COMPLETE", "CAR_RESET_DONE"}

            if accepted:
                self.online = True
                self.last_seen = time.time()
                self.last_command = cmd
                self.last_command_time = time.time()
                log_service.info(
                    Subsystem.CAR,
                    "COMMAND_ACCEPTED",
                    f"Car accepted command: {cmd} (reply={reply}, latency={elapsed_ms:.1f}ms)"
                )
            else:
                log_service.warning(
                    Subsystem.CAR,
                    "COMMAND_REJECTED",
                    f"Car rejected command {cmd}: {reply}"
                )

            return {
                "success": accepted,
                "command": cmd,
                "reply": reply,
                "latency_ms": round(elapsed_ms, 1)
            }

        except Exception as err:
            self.last_error = str(err)
            self.online = False
            log_service.error(
                Subsystem.CAR,
                "COMMAND_FAILED",
                f"Failed to communicate with Car at {config.car_ip}: {err}"
            )
            return {"success": False, "command": cmd, "error": str(err)}

    def _update_simulation(self):
        """Simulates realistic car distance and state progression"""
        self.online = True
        self.latency_ms = 1.5
        self.last_seen = time.time()
        self.last_error = None
        
        if self._sim_moving and self._sim_state == "MOVING_ALLOWED":
            self._sim_distance = max(18.0, self._sim_distance - 1.2)
            if self._sim_distance <= config.stop_distance_cm:
                self._sim_state = "PICKUP_STARTED"
                self._sim_moving = False
                log_service.info(Subsystem.CAR, "SIM_PICKUP_TRIGGERED", "Proximity threshold (25cm) reached in simulation")
        elif self._sim_state == "REVERSE_20_ACTIVE":
            self._sim_distance = min(50.0, self._sim_distance + 1.5)
            if self._sim_distance >= config.stop_distance_cm + config.reverse_distance_cm:
                self._sim_state = "READY"
                log_service.info(Subsystem.CAR, "SIM_REVERSE_DONE", "Reverse backoff completed in simulation")
                
        self.current_distance = round(self._sim_distance, 1)
        self.distance_updated_at = time.time()
        self.current_state = self._sim_state
        self.state_updated_at = time.time()

    def _execute_sim_command(self, cmd: str) -> Dict[str, Any]:
        self.last_command = cmd
        self.last_command_time = time.time()
        if cmd == "FORWARD":
            if self._sim_distance <= config.stop_distance_cm:
                return {"success": False, "command": cmd, "reply": "FORWARD_BLOCKED_DISTANCE"}
            self._sim_state = "MOVING_ALLOWED"
            self._sim_moving = True
            return {"success": True, "command": cmd, "reply": "FORWARD_ACCEPTED", "latency_ms": 1.0}
        elif cmd == "STOP":
            self._sim_moving = False
            if self._sim_state not in {"PICKUP_STARTED", "REVERSE_20_ACTIVE"}:
                self._sim_state = "READY"
            return {"success": True, "command": cmd, "reply": "STOPPED", "latency_ms": 1.0}
        elif cmd == "BACKWARD":
            self._sim_moving = True
            self._sim_state = "MOVING_BACKWARD"
            self._sim_distance = min(60.0, self._sim_distance + 2.0)
            return {"success": True, "command": cmd, "reply": "BACKWARD_ACCEPTED", "latency_ms": 1.0}
        elif cmd == "LEFT":
            self._sim_moving = True
            self._sim_state = "TURNING_LEFT"
            return {"success": True, "command": cmd, "reply": "LEFT_ACCEPTED", "latency_ms": 1.0}
        elif cmd == "RIGHT":
            self._sim_moving = True
            self._sim_state = "TURNING_RIGHT"
            return {"success": True, "command": cmd, "reply": "RIGHT_ACCEPTED", "latency_ms": 1.0}
        elif cmd == "RESET":
            self._sim_moving = False
            self._sim_state = "READY"
            self._sim_distance = 45.0
            return {"success": True, "command": cmd, "reply": "RESET_COMPLETE", "latency_ms": 1.0}
        return {"success": False, "command": cmd, "error": "Unknown command"}

# Global car service instance
car_service = CarService()
