"""
WAREBOT - Autonomous Mission Controller & State Machine
Deterministic state machine orchestrating Car, Arm, and Vision services
"""
import time
import asyncio
from typing import Dict, Any, List, Optional
from backend.config import config
from backend.schemas import Subsystem, Severity
from backend.services.log_service import log_service
from backend.services.car_service import car_service
from backend.services.arm_service import arm_service
from backend.services.camera_service import camera_service
from backend.services.vision_service import vision_service

PICKUP_STATES = {
    "PICKUP_STARTED",
    "PICKUP_FINISHED",
    "PICKUP_COMPLETE",
    "PICKUP_COMPLETE_DONE",
    "REVERSE_20_ACTIVE",
    "PICKUP_OR_REVERSE_STILL_ACTIVE",
    "SEQUENCE_ACTIVE_OR_FINISHED",
    "SEQUENCE_ACTIVE",
}

class MissionService:
    def __init__(self):
        self.state: str = "IDLE"
        self.active_target: str = "bottle"
        self.emergency_stop: bool = False
        
        self.timeline: List[Dict[str, Any]] = []
        self.last_transition_time: float = time.time()
        self.current_step: str = "Idle. Select target and press Start Following."
        
        self.running_task: Optional[asyncio.Task] = None
        self._add_timeline_event("INITIALIZED", "Mission controller ready in IDLE state")

    def _add_timeline_event(self, event_type: str, description: str):
        self.timeline.append({
            "timestamp": time.time(),
            "time_str": time.strftime("%H:%M:%S"),
            "event": event_type,
            "description": description
        })
        if len(self.timeline) > 30:
            self.timeline.pop(0)

    def transition_to(self, new_state: str, step_desc: str):
        old_state = self.state
        self.state = new_state
        self.current_step = step_desc
        self.last_transition_time = time.time()
        self._add_timeline_event(new_state, step_desc)
        log_service.info(
            Subsystem.MISSION,
            "STATE_TRANSITION",
            f"{old_state} -> {new_state}: {step_desc}"
        )

    def get_telemetry(self) -> Dict[str, Any]:
        return {
            "state": self.state,
            "current_step": self.current_step,
            "active_target": self.active_target,
            "emergency_stop": self.emergency_stop,
            "last_transition_time": self.last_transition_time,
            "timeline": list(self.timeline),
        }

    def trigger_emergency_stop(self) -> Dict[str, Any]:
        """Global Emergency Stop latch overriding all systems"""
        self.emergency_stop = True
        self.transition_to("EMERGENCY_HALT", "EMERGENCY STOP TRIGGERED. All motion halted.")
        
        # Halt car immediately with force=True
        car_service.send_command("STOP", force=True)
        # Halt arm homing
        arm_service.send_command("STOP")
        
        log_service.critical(
            Subsystem.SYSTEM,
            "EMERGENCY_STOP_ENGAGED",
            "Emergency Stop activated. Motion aborted across Car and Arm."
        )
        return {"success": True, "emergency_stop": True}

    def clear_emergency_stop(self) -> Dict[str, Any]:
        """Explicit operator latch release"""
        self.emergency_stop = False
        self.transition_to("IDLE", "Emergency stop cleared. System in safe IDLE state.")
        log_service.info(Subsystem.SYSTEM, "EMERGENCY_STOP_CLEARED", "Operator cleared emergency stop latch.")
        return {"success": True, "emergency_stop": False}

    def start_following(self, target_class: str = "bottle") -> Dict[str, Any]:
        if self.emergency_stop:
            return {"success": False, "error": "Cannot start mission: Emergency stop is active."}

        # Check target support via vision service
        target_res = vision_service.set_target(target_class)
        if not target_res.get("supported"):
            return {
                "success": False,
                "error": target_res.get("message", f"Target '{target_class}' is unsupported by the current model.")
            }

        self.active_target = target_class
        self.transition_to("FOLLOWING", f"Autonomous tracking of '{target_class}' active.")
        
        # Start background async loop
        if self.running_task is None or self.running_task.done():
            self.running_task = asyncio.create_task(self._mission_loop())
            
        return {"success": True, "state": self.state}

    def stop_following(self) -> Dict[str, Any]:
        car_service.send_command("STOP")
        self.transition_to("IDLE", "Autonomous following stopped by operator.")
        if self.running_task and not self.running_task.done():
            self.running_task.cancel()
        return {"success": True, "state": self.state}

    def trigger_pickup(self) -> Dict[str, Any]:
        if self.emergency_stop:
            return {"success": False, "error": "Emergency stop is active."}

        car_service.send_command("STOP")
        self.transition_to("PICKUP", "Commanding Robotic Arm PICKUP routine...")
        
        # 1. Send PICKUP command to arm
        arm_service.send_command("PICKUP")
        # 2. Lower arm to pickup preset
        arm_service.apply_preset("PICKUP")
        
        # Note: Gripper can be closed via arm_service
        return {"success": True, "state": self.state}

    async def _mission_loop(self):
        """Asynchronous mission monitor loop running at ~12Hz with visual servoing"""
        log_service.info(Subsystem.MISSION, "LOOP_STARTED", "Autonomous mission worker started")
        
        last_cmd_sent = 0.0
        last_active_cmd = "STOP"
        
        while self.state in {"FOLLOWING", "STOPPED_AT_TARGET"} and not self.emergency_stop:
            await asyncio.sleep(0.06)
            now = time.time()
            
            # Check camera freshness
            cam_telem = camera_service.get_telemetry()
            if not cam_telem.get("online") or not cam_telem.get("frame_fresh"):
                if last_active_cmd != "STOP":
                    await asyncio.to_thread(car_service.send_command, "STOP", force=True)
                    last_active_cmd = "STOP"
                self.current_step = "Camera stream lost or stale. Car paused."
                continue

            # Check vision detection
            vis_telem = vision_service.get_telemetry()
            target_visible = vis_telem.get("target_visible")
            detection = vis_telem.get("detection")

            if not target_visible or detection is None:
                # Target not visible: car pauses and searches
                if last_active_cmd != "STOP":
                    await asyncio.to_thread(car_service.send_command, "STOP", force=True)
                    last_active_cmd = "STOP"
                self.current_step = f"Searching for {self.active_target}... (Waiting for detection)"
                continue

            # Target IS visible! Check ultrasonic proximity with real-time direct polling
            live_dist = await asyncio.to_thread(car_service.poll_distance_sync)
            car_telem = car_service.get_telemetry()
            distance = live_dist if live_dist is not None else car_telem.get("distance_cm")
            car_state = car_telem.get("state")

            # Check if threshold reached (strictly <= stop_distance_cm, e.g. 33.0 cm)
            if distance is not None and 0.0 < distance <= config.stop_distance_cm:
                if last_active_cmd != "STOP":
                    await asyncio.to_thread(car_service.send_command, "STOP", force=True)
                    last_active_cmd = "STOP"
                if self.state != "STOPPED_AT_TARGET":
                    self.transition_to(
                        "STOPPED_AT_TARGET",
                        f"At target threshold ({distance:.1f} cm <= {config.stop_distance_cm:.0f} cm). Ready for pickup."
                    )
                self.current_step = f"Holding position at {distance:.1f} cm (threshold <= {config.stop_distance_cm:.0f} cm). Ready for gripper pickup."
                continue

            # If we were STOPPED_AT_TARGET and target moved further away or path opened:
            if self.state == "STOPPED_AT_TARGET":
                self.transition_to("FOLLOWING", f"Target moved. Resuming autonomous pursuit.")

            # Target is visible and path is clear (distance is None/open or > stop_distance_cm)
            # Perform visual steering towards target using normalized horizontal coordinate (0.0=left, 0.5=center, 1.0=right)
            norm_cx = 0.5
            if "norm_center" in detection:
                norm_cx = float(detection["norm_center"][0])
            elif "center" in detection:
                cx = detection["center"][0]
                fw = detection.get("frame_width", 1280)
                norm_cx = cx / max(1, fw)

            # Central forward deadband (32% to 68%): drive straight FORWARD with all 4 wheels
            desired_cmd = "FORWARD"
            if norm_cx < 0.32:
                desired_cmd = "LEFT"
                action_text = f"Steering LEFT towards {self.active_target} (pos: {norm_cx:.2f})"
            elif norm_cx > 0.68:
                desired_cmd = "RIGHT"
                action_text = f"Steering RIGHT towards {self.active_target} (pos: {norm_cx:.2f})"
            else:
                desired_cmd = "FORWARD"
                dist_str = f"{distance:.1f} cm" if distance is not None else "clear path"
                action_text = f"Moving FORWARD towards {self.active_target} ({dist_str}, center: {norm_cx:.2f})"

            # Send command with keep-alive interval (every 0.35s to keep motor watchdog active without overwhelming ESP32)
            if desired_cmd != last_active_cmd or (now - last_cmd_sent >= 0.35):
                res = await asyncio.to_thread(car_service.send_command, desired_cmd, force=True)
                last_cmd_sent = now
                last_active_cmd = desired_cmd

                reply = res.get("reply", "")
                if "BLOCKED" in reply:
                    if last_active_cmd != "STOP":
                        await asyncio.to_thread(car_service.send_command, "STOP", force=True)
                        last_active_cmd = "STOP"
                    if self.state != "STOPPED_AT_TARGET":
                        self.transition_to(
                            "STOPPED_AT_TARGET",
                            f"Car firmware halted at target threshold ({config.stop_distance_cm:.0f} cm). Ready for pickup."
                        )
                    self.current_step = f"Holding position at {config.stop_distance_cm:.0f} cm. Ready for gripper pickup."
                    continue

                if res.get("success"):
                    self.current_step = action_text
                else:
                    self.current_step = f"{desired_cmd} active: {res.get('reply') or res.get('error')}"

        log_service.info(Subsystem.MISSION, "LOOP_EXITED", f"Mission loop ended in state: {self.state}")

# Global mission service instance
mission_service = MissionService()
