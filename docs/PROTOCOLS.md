# WAREBOT — Network Protocols & Message Specifications

## 1. Network Topology
All devices connect to a shared local Wi-Fi network (AP or router). Default subnet: `10.116.205.0/24` (or user LAN DHCP subnet).

| Device / Component | IP Address (Default) | Port(s) | Protocol | Role |
|---|---|---|---|---|
| **Robotics Gateway (PC)** | Localhost / LAN IP | `8000` | HTTP / WebSocket | Aggregator, Safety Controller, Vision Manager |
| **Car ESP32** | `10.228.168.44` | `80` (HTTP), `5006` (UDP RX) | HTTP REST, UDP | Motors & Ultrasonic Sensor |
| **Arm ESP32** | `10.228.168.193` | `4242` (UDP RX), `5005` (UDP RX) | UDP Raw Binary, UDP ASCII | PCA9685 6-DOF Servos |
| **ESP32-CAM** | `10.116.205.188` | `80` (HTTP) | HTTP MJPEG Stream | Low-latency 160x120 QQVGA |
| **PWA Frontend** | Browser Client | `5173` (Dev) / `8000` (Prod) | HTTP, WebSocket | UI / Operator Station |

---

## 2. Car ESP32 Protocol (`car_code.ino`)

### HTTP Endpoints
- **Base URL**: `http://<CAR_IP>:80`

#### 1. Movement & Cycle Command
- **Endpoint**: `GET /command?cmd=<COMMAND>`
- **Query Parameter**: `cmd` (Case-insensitive)
- **Supported Commands**:
  - `FORWARD`:
    - Checks ultrasonic distance first.
    - If distance ≤ 25.0 cm, sets state to `STATE_PICKUP_WAIT` (if not already sent) and returns `200 OK` with text `FORWARD_BLOCKED_DISTANCE`.
    - If car is in `STATE_PICKUP_WAIT` or `STATE_REVERSE`, returns `409 Conflict` with text `PICKUP_OR_REVERSE_STILL_ACTIVE`.
    - If distance is invalid (< 0 cm), returns `503 Service Unavailable` with text `INVALID_DISTANCE`.
    - If clear (> 25.0 cm), engages IN1=LOW, IN2=HIGH, IN3=HIGH, IN4=LOW, sets `carState = STATE_FORWARD`, returns `200 OK` with text `FORWARD_ACCEPTED`.
  - `STOP`:
    - Disables movement flag `pythonAllowsMovement = false`.
    - If not in pickup or reverse sequence, sets IN1..IN4 to LOW, sets `carState = STATE_IDLE`. Returns `200 OK` with text `STOPPED`.
  - `BACKWARD`:
    - If in pickup/reverse, returns `409 Conflict` with text `SEQUENCE_ACTIVE`.
    - Otherwise engages IN1=HIGH, IN2=LOW, IN3=LOW, IN4=HIGH, sets `carState = STATE_IDLE`. Returns `200 OK` with text `BACKWARD`.
  - `RESET`:
    - Calls `resetCycle()`, halts motors, clears pickup/reverse flags, sends UDP packet `"RESET"` to `ARM_IP:5005`. Returns `200 OK` with text `RESET`.

#### 2. Status Endpoint
- **Endpoint**: `GET /status`
- **Response**: `200 OK` with plain text:
  - `READY`: Idle, ready for commands.
  - `MOVING_ALLOWED`: Currently executing forward movement.
  - `PICKUP_STARTED`: Reached stop threshold (≤ 25 cm), waiting for robotic arm.
  - `REVERSE_20_ACTIVE`: Autonomous reverse sequence active (+20 cm backoff).

#### 3. Distance Endpoint
- **Endpoint**: `GET /distance`
- **Response**:
  - `200 OK` with single-precision float string (e.g. `24.8`).
  - `503 Service Unavailable` with text `INVALID_DISTANCE` if ultrasonic timeout or out of range.

---

## 3. Arm ESP32 Protocol (`robot_arm.ino`)

### UDP Port 4242 — Joint Angles (Binary)
- **Payload Size**: Exactly 6 bytes (`uint8_t[6]`).
- **Data Structure**:
  ```
  Byte 0: Servo 0 (Base / Waist)     [0 - 180 degrees]
  Byte 1: Servo 1 (Shoulder)         [0 - 180 degrees]
  Byte 2: Servo 2 (Elbow)            [0 - 180 degrees]
  Byte 3: Servo 3 (Wrist Pitch)      [0 - 180 degrees]
  Byte 4: Servo 4 (Wrist Roll)       [0 - 180 degrees]
  Byte 5: Servo 5 (Gripper)          [0 - 180 degrees]
  ```
- **Safety Rule**: If packet size != 6 bytes or any byte > 180, the packet is rejected. When homing is in progress, incoming slider packets are silently ignored.

### UDP Port 5005 — Text Commands (ASCII)
- **Payload Format**: String encoded in UTF-8/ASCII (e.g. `"HOME"`).
- **Supported Commands**:
  - `HOME`: Starts sequential non-blocking return to `HOME_ANGLES` [146, 180, 46, 124, 119, 157].
  - `PICKUP`: Transmits `PICKUP_STARTED` to Car feedback port `5006`, unlocks manual control.
  - `PICKUP_COMPLETE`: Begins homing, then emits `PICKUP_COMPLETE_DONE` to Car `5006` upon reaching home (which commands Car to back off by 20 cm).
  - `STOP`: Halts homing; servos maintain current angle.
  - `RESET`: Stops homing and clears state.

### UDP Port 5006 — Inter-Device Feedback (Car & Arm)
- Arm transmits state updates to `CAR_IP:5006`:
  - `PICKUP_STARTED`
  - `PICKUP_COMPLETE_START`
  - `PICKUP_COMPLETE_DONE`
  - `HOME_START`
  - `HOME_DONE`

---

## 4. ESP32-CAM Protocol (`camera.ino`)

### HTTP Endpoints
- **Stream URL**: `http://<CAMERA_IP>:80/stream`
  - `Content-Type`: `multipart/x-mixed-replace; boundary=frame`
  - Chunk Header: `Content-Type: image/jpeg\r\nContent-Length: <len>\r\n\r\n`
  - CORS Header: `Access-Control-Allow-Origin: *`
- **Snapshot URL**: `http://<CAMERA_IP>:80/capture`
  - `Content-Type`: `image/jpeg`
  - Cache Control: `no-store, no-cache, must-revalidate`

---

## 5. Gateway WebSocket & REST API Contract (PC Gateway)

The Robotics Gateway acts as a central asynchronous mediator between the browser PWA and the physical ESP32 devices.

### WebSocket Protocol
- **Endpoint**: `ws://<GATEWAY_IP>:8000/ws/telemetry`
- **Direction**: Gateway -> Client (Broadcast)
- **JSON Payload Structure**:
  ```json
  {
    "timestamp": 1728920000.123,
    "system_mode": "MANUAL",
    "emergency_stop": false,
    "devices": {
      "gateway": { "online": true, "latency_ms": 0 },
      "car": { "online": true, "latency_ms": 12.4, "ip": "10.116.205.44", "last_seen": 1728920000.1 },
      "arm": { "online": true, "latency_ms": 8.1, "ip": "10.116.205.193", "last_seen": 1728920000.0 },
      "camera": { "online": true, "latency_ms": 15.2, "ip": "10.116.205.188", "last_seen": 1728920000.05 },
      "vision": { "online": true, "process_running": true, "fps": 24.5 }
    },
    "telemetry": {
      "distance_cm": 34.2,
      "distance_fresh": true,
      "car_state": "READY",
      "servo_angles": [146, 180, 46, 124, 119, 157],
      "gripper_state": "OPEN",
      "camera_fps": 18.2,
      "camera_fresh": true
    },
    "detection": {
      "target_class": "bottle",
      "target_supported": true,
      "detected": true,
      "confidence": 0.88,
      "box": [120, 45, 210, 180],
      "label": "bottle 88%"
    },
    "mission": {
      "state": "IDLE",
      "current_step": "Awaiting target selection",
      "timeline": []
    }
  }
  ```

### HTTP Control Endpoints
- `POST /api/car/command`: `{"command": "FORWARD" | "BACKWARD" | "STOP" | "RESET"}`
- `POST /api/arm/angles`: `{"angles": [146, 180, 46, 124, 119, 157]}`
- `POST /api/arm/command`: `{"command": "HOME" | "STOP" | "PICKUP" | "PICKUP_COMPLETE" | "RESET"}`
- `POST /api/arm/gripper`: `{"action": "OPEN" | "CLOSE", "angle": 170}`
- `POST /api/emergency_stop`: Immediate halt of all actuators and loops.
- `POST /api/emergency_reset`: Clear latch after operator verification.
- `POST /api/mission/start`: `{"target_class": "bottle"}`
- `POST /api/mission/stop`: Abort autonomous loop.
- `GET /api/camera/frame`: Gateway forwarded MJPEG frame or proxy.
- `GET /api/logs`: Fetch filtered event history.
- `POST /api/settings`: Update IP addresses, ports, thresholds, calibration.
