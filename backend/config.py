"""
WAREBOT - Configuration Module
Discovered defaults from car_code.ino, robot_arm.ino, camera.ino, and python_robot.py
"""
import os
from pydantic import BaseModel, Field
from typing import List

class DeviceConfig(BaseModel):
    # Network Addresses (discovered from existing firmware & Python scripts)
    car_ip: str = "10.116.205.44"
    car_port: int = 80
    
    arm_ip: str = "10.116.205.193"
    arm_slider_port: int = 4242
    arm_command_port: int = 5005
    arm_feedback_port: int = 5006
    
    camera_ip: str = "10.116.205.65"
    camera_port: int = 8080
    camera_stream_path: str = "/video"
    camera_capture_path: str = "/shot.jpg"
    
    gateway_host: str = "0.0.0.0"
    gateway_port: int = 8000
    
    # Distance & Proximity Settings
    stop_distance_cm: float = 33.0
    reverse_distance_cm: float = 20.0
    
    # Timeout & Freshness Thresholds (seconds)
    camera_stale_seconds: float = 3.0
    distance_stale_seconds: float = 2.5
    status_stale_seconds: float = 4.0
    http_timeout_seconds: float = 1.5
    
    # Arm Hardware Specs & Calibration Defaults
    servo_count: int = 6
    home_angles: List[int] = Field(default_factory=lambda: [146, 180, 46, 156, 119, 157])
    joint_min_angles: List[int] = Field(default_factory=lambda: [0, 0, 0, 0, 0, 0])
    joint_max_angles: List[int] = Field(default_factory=lambda: [180, 180, 180, 360, 180, 180])
    gripper_channel: int = 5
    gripper_open_angle: int = 170
    gripper_closed_angle: int = 90
    gripper_step: int = 5
    
    # Vision & YOLO settings
    yolo_model_path: str = "yolov8n.pt"
    yolo_confidence: float = 0.18
    yolo_iou: float = 0.45
    yolo_size: int = 320
    supported_classes: List[str] = Field(default_factory=lambda: ["bottle", "cup", "cell phone", "chair", "box", "any"])
    
    # Operating Mode: False = Real Physical Hardware, True = Clearly Labeled Simulation
    simulation_mode: bool = False

# Global configuration instance
config = DeviceConfig()
