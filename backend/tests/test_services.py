"""
WAREBOT - Backend Unit Tests for Services
"""
import pytest
from backend.config import config
from backend.services.log_service import log_service, Severity, Subsystem
from backend.services.car_service import car_service
from backend.services.arm_service import arm_service
from backend.services.vision_service import vision_service
from backend.services.mission_service import mission_service

def test_log_service():
    log_service.clear()
    entry = log_service.info(Subsystem.CAR, "TEST_EVENT", "Test log message")
    assert entry.event_type == "TEST_EVENT"
    assert entry.message == "Test log message"
    
    entries = log_service.get_entries(subsystem="CAR")
    assert len(entries) == 1
    assert entries[0].event_type == "TEST_EVENT"

def test_arm_angles_validation():
    # Valid angles (6 joints, 0-180)
    valid_angles = [146, 180, 46, 124, 119, 157]
    res = arm_service.set_angles(valid_angles)
    assert res["success"] is True
    assert arm_service.commanded_angles == valid_angles

    # Invalid: wrong length
    res_bad_len = arm_service.set_angles([10, 20])
    assert res_bad_len["success"] is False

    # Invalid: out of bounds angle
    res_bad_val = arm_service.set_angles([146, 250, 46, 124, 119, 157])
    assert res_bad_val["success"] is False

def test_gripper_control():
    # Gripper open
    res = arm_service.control_gripper("OPEN")
    assert res["success"] is True
    assert arm_service.commanded_angles[config.gripper_channel] == config.gripper_open_angle

    # Gripper close
    res = arm_service.control_gripper("CLOSE")
    assert res["success"] is True
    assert arm_service.commanded_angles[config.gripper_channel] == config.gripper_closed_angle

def test_car_command_validation():
    # Invalid command rejected
    res = car_service.send_command("FLY")
    assert res["success"] is False
    assert "Unsupported" in res["error"]

def test_vision_target_support():
    # Bottle is supported in COCO YOLO
    res_bottle = vision_service.set_target("bottle")
    assert res_bottle["supported"] is True

    # Box is unsupported in base COCO
    res_box = vision_service.set_target("box")
    assert res_box["supported"] is False

    # Handkerchief is unsupported
    res_hk = vision_service.set_target("handkerchief")
    assert res_hk["supported"] is False

def test_emergency_stop_lifecycle():
    # Engage emergency stop
    res = mission_service.trigger_emergency_stop()
    assert res["success"] is True
    assert mission_service.emergency_stop is True
    assert mission_service.state == "EMERGENCY_HALT"

    # Forward movement blocked during emergency stop
    res_car = car_service.send_command("FORWARD")
    assert mission_service.emergency_stop is True

    # Release latch
    res_reset = mission_service.clear_emergency_stop()
    assert res_reset["success"] is True
    assert mission_service.emergency_stop is False
    assert mission_service.state == "IDLE"
