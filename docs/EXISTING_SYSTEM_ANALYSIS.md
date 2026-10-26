# WAREBOT — Existing System Analysis & Reverse Engineering Report

## Executive Summary
This document provides a comprehensive technical audit of the five core source files provided in `arm_final`:
1. `car_code.ino` (ESP32 Car Controller)
2. `robot_arm.ino` (ESP32 Robotic Arm Controller with PCA9685)
3. `camera.ino` (ESP32-CAM AI Thinker Module)
4. `arm_slider_control.py` (Desktop Tkinter Calibration & Slider GUI)
5. `python_robot.py` (Vision, YOLO Detection & Autonomous Loop)

---

## 1. Car Controller (`car_code.ino`)

### Hardware Interfaces
- **Microcontroller**: ESP32 Dev Module
- **Motor Driver**: L298N Dual H-Bridge
  - `IN1`: GPIO 25
  - `IN2`: GPIO 26
  - `IN3`: GPIO 27
  - `IN4`: GPIO 14
- **Ultrasonic Sensor**: HC-SR04
  - `TRIG_PIN`: GPIO 32
  - `ECHO_PIN`: GPIO 33
  - Pulse width timeout: 25,000 µs (max ~4.2m)
  - Distance calculation: `duration * 0.0343 / 2`
  - Median filtering: 3 samples sampled with 3µs trigger pulse and 3ms delay, median taken.
  - Valid range: 2.0 cm to 400.0 cm.

### Network Configuration
- **Wi-Fi Mode**: Station (`WIFI_STA`), Sleep disabled (`setSleep(false)`), Auto-reconnect enabled.
- **SSID / Password**: Configured as `"Yash"` / `"Leum9932"`.
- **IP Assignment**: DHCP. Default tested IP: `10.172.189.44`.
- **Target Arm IP**: `10.172.189.193` (hardcoded in firmware).
- **Ports**:
  - HTTP Server: Port 80
  - Arm Command UDP Port: `5005` (transmits commands to Arm)
  - Car Feedback UDP Port: `5006` (receives feedback from Arm)

### Implemented Endpoints & Command Responses
| Method | Route | Parameter | Firmware Action | Response |
|---|---|---|---|---|
| `GET` | `/command` | `cmd=FORWARD` | Checks distance (>25cm). If safe and not in pickup/reverse, activates motors forward. | `FORWARD_ACCEPTED` (200), `FORWARD_BLOCKED_DISTANCE` (200), `PICKUP_OR_REVERSE_STILL_ACTIVE` (409), or `INVALID_DISTANCE` (503) |
| `GET` | `/command` | `cmd=STOP` | Sets `pythonAllowsMovement = false`. If not in pickup/reverse, stops motors and sets `carState = STATE_IDLE`. | `STOPPED` (200) |
| `GET` | `/command` | `cmd=BACKWARD` | If not in pickup/reverse, sets motors backward and `carState = STATE_IDLE`. | `BACKWARD` (200), or `SEQUENCE_ACTIVE` (409) |
| `GET` | `/command` | `cmd=RESET` | Calls `resetCycle()`, sends `"RESET"` via UDP to Arm:5005. | `RESET` (200) |
| `GET` | `/status` | *None* | Returns active state string. | `READY`, `MOVING_ALLOWED`, `PICKUP_STARTED`, or `REVERSE_20_ACTIVE` |
| `GET` | `/distance` | *None* | Returns last median ultrasonic distance in cm formatted to 1 decimal place. | `<distance_cm>` (200), or `INVALID_DISTANCE` (503) |
| `GET` | `/reset` | *None* | Resets car cycle and sends `"RESET"` to Arm. | `RESET_COMPLETE` (200) |

### Critical Firmware Limitations
1. **No Directional Turning (Left/Right)**: The firmware contains ONLY `moveForward()` and `moveBackward()`. There are NO left/right steering commands or differential turn routines in `car_code.ino`.
2. **Reverse Sequence Lockout**: When Arm finishes pickup, the car automatically enters `STATE_REVERSE` and reverses until distance increases by 20 cm (`currentDistance >= reverseTargetDistance`). During this time, HTTP manual commands are rejected with `409 Conflict`.

---

## 2. Robotic Arm Controller (`robot_arm.ino`)

### Hardware Interfaces
- **Microcontroller**: ESP32
- **PWM Servo Driver**: PCA9685 via I2C
  - `SDA`: GPIO 21
  - `SCL`: GPIO 22
  - I2C Address: `0x40`
  - Clock frequency: 27 MHz oscillator, PWM frequency: 50 Hz
  - Pulse width range: 500 µs (0°) to 2500 µs (180°)
- **Servo Channels & Mapping**:
  - Channel 0: Base Joint (Home: 146°)
  - Channel 1: Shoulder Joint (Home: 180°)
  - Channel 2: Elbow Joint (Home: 46°)
  - Channel 3: Wrist Pitch (Home: 124°)
  - Channel 4: Wrist Roll (Home: 119°)
  - Channel 5: Gripper (Home: 157°, Calibrated Open: 170°, Calibrated Closed: 90°)

### Communication Protocols
- **UDP Slider Port `4242`**:
  - Expects exactly 6 raw bytes: `uint8_t angles[6]`.
  - Values must be between 0 and 180.
  - If `homing == true`, slider packets are ignored to prevent mechanical collisions.
- **UDP Command Port `5005`**:
  - ASCII text commands:
    - `"HOME"`: Non-blocking sequential homing (1° per 20 ms, 500 ms pause between joints). Emits `"HOME_START"` and `"HOME_DONE"` to Car:5006.
    - `"PICKUP"`: Emits `"PICKUP_STARTED"` to Car:5006; unlocks manual slider control.
    - `"PICKUP_COMPLETE"`: Starts homing, emits `"PICKUP_COMPLETE_START"`, and when finished emits `"PICKUP_COMPLETE_DONE"` to Car:5006 (which commands car to reverse 20 cm).
    - `"STOP"`: Immediately halts homing routine; servos maintain current position.
    - `"RESET"`: Halts homing and clears pickup flags.
- **UDP Feedback Port `5006`**:
  - Sends status packets to `CAR_IP:5006`.

---

## 3. Camera Module (`camera.ino`)

### Hardware & Configuration
- **Module**: AI Thinker ESP32-CAM (OV2640 sensor)
- **Image Resolution**: `FRAMESIZE_QQVGA` (160 x 120 pixels) for lowest latency
- **JPEG Quality**: 12 (lower number is higher quality, 12 provides rapid compression)
- **Frame Buffer**: 2 buffers in PSRAM (`CAMERA_GRAB_LATEST`)
- **HTTP Server**: Port 80
  - `GET /stream`: Continuous MJPEG multipart stream (`multipart/x-mixed-replace; boundary=frame`) with `Access-Control-Allow-Origin: *`.
  - `GET /capture`: Single JPEG frame snapshot (`image/jpeg`).
  - `GET /`: HTML viewer page embedding `/stream`.

---

## 4. Slider Control & Calibration Tool (`arm_slider_control.py`)

### Architecture
- Desktop Tkinter GUI communicating via raw UDP sockets to `ARM_IP:4242` (slider packet) and `ARM_IP:5005` (commands).
- Slider changes trigger `send_angles()` sending a 6-byte payload.
- Gripper channel is hardcoded to Channel 5.
- Calibration helpers adjust Channel 5 in increments of 5° and allow setting current position as Open or Closed angle.

---

## 5. Vision & Autonomous Loop (`python_robot.py`)

### Architecture & Operation
- Uses OpenCV (`cv2`) and Ultralytics YOLOv8 (`yolov8n.pt`).
- Frame grabber thread connects to `http://CAMERA_IP:80/stream` using chunked MJPEG stream parser searching for `\xff\xd8` (JPEG start) and `\xff\xd9` (JPEG end).
- YoloWorker thread processes only the freshest frame (skips queue backlog).
- Target Class: COCO class 39 (`bottle`).
- Safe stopping distance: 25.0 cm.
- Car movement rule:
  - If bottle visible (`confidence >= 0.12`, held for 0.7s) AND distance > 25.0 cm AND car state is `"READY"` or `"MOVING_ALLOWED"`, issue `GET /command?cmd=FORWARD`.
  - If distance <= 25.0 cm, car stops, and car firmware initiates pickup sequence.
  - If car state is in `PICKUP_STATES`, Python loop relinquishes control to ESP32 state machine.
