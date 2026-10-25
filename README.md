# WAREBOT — Unified Robotics Web Dashboard & Installable PWA

**WAREBOT** is a complete, production-grade robotics control and monitoring platform engineered for controlling a mobile robotic car and a 6-DOF robotic arm. It features a local Python FastAPI robotics gateway, asynchronous WebSockets, a dark-themed React + TypeScript web application, and an installable Progressive Web App (PWA) for Android, tablets, and desktops.

---

## 1. System Overview & Discovered Architecture

Inspection of the physical firmware (`car_code.ino`, `robot_arm.ino`, `camera.ino`) and Python scripts (`arm_slider_control.py`, `python_robot.py`) identified the following hardware bindings:

### Hardware Device Map
| Device | Role | Microcontroller / Driver | Default IP | Protocol & Ports |
|---|---|---|---|---|
| **Robotics Gateway** | Central safety mediator & API hub | PC (FastAPI + Uvicorn) | `0.0.0.0` / LAN | HTTP `:8000`, WS `/ws/telemetry` |
| **Car Controller** | L298N motors & HC-SR04 ultrasonic | ESP32 Dev Module | `10.228.168.44` | HTTP Port `80`, UDP `5006` (RX) |
| **Robotic Arm** | PCA9685 6-DOF Servos | ESP32 Dev Module | `10.228.168.193` | UDP `4242` (Sliders), UDP `5005` (Cmd) |
| **ESP32-CAM** | Low-latency MJPEG video | AI-Thinker OV2640 | `10.116.205.188` | HTTP Port `80` (`/stream`, `/capture`) |

### Car Hardware Pinout & Endpoints (`car_code.ino`)
- **L298N Motors**: `IN1=25`, `IN2=26`, `IN3=27`, `IN4=14`
  - Forward: `IN1=LOW, IN2=HIGH, IN3=HIGH, IN4=LOW`
  - Backward: `IN1=HIGH, IN2=LOW, IN3=LOW, IN4=HIGH`
  - Stop: All `LOW`
  - *Firmware Note*: The firmware supports only linear Forward and Backward commands. Directional steering (Left/Right) is omitted to strictly match firmware implementation.
- **Ultrasonic Sensor**: `TRIG=32`, `ECHO=33`
  - Stop threshold: `25.0 cm` (triggers `PICKUP_WAIT` and halts motors)
  - Post-pickup reverse target: `+20.0 cm`
- **Firmware States**: `READY`, `MOVING_ALLOWED`, `PICKUP_STARTED`, `REVERSE_20_ACTIVE`

### Robotic Arm Mapping (`robot_arm.ino`)
- **PCA9685 I2C**: `SDA=21`, `SCL=22`, Address: `0x40`, PWM Frequency: `50 Hz`
- **Servo Channels & Home Angles**:
  - CH0: Base Joint (`146°`)
  - CH1: Shoulder Joint (`180°`)
  - CH2: Elbow Joint (`46°`)
  - CH3: Wrist Pitch (`124°`)
  - CH4: Wrist Roll (`119°`)
  - CH5: Gripper (`157°`, Calibrated Open: `170°`, Calibrated Closed: `90°`)
- **UDP Ports**:
  - `4242`: Expects exactly 6 raw bytes (`uint8_t[6]`, values 0-180).
  - `5005`: ASCII text commands (`"HOME"`, `"STOP"`, `"PICKUP"`, `"PICKUP_COMPLETE"`, `"RESET"`).

### ESP32-CAM Stream (`camera.ino`)
- Resolution: QQVGA (`160 x 120`) for ultra-low latency.
- Endpoint: `http://<CAMERA_IP>:80/stream` (MJPEG multipart with CORS).

---

## 2. Quick Start on Windows

### Prerequisites
- Python 3.10+ (installed on machine)
- Node.js & pnpm or npm

### Step 1: Launch the Robotics Gateway
Double-click `start_gateway.bat` or run in terminal:
```powershell
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
- The Gateway automatically hosts the compiled PWA web dashboard at **`http://localhost:8000`** and on your local Wi-Fi IP (e.g. `http://192.168.1.xxx:8000`).
- Background workers connect to the ESP32s and broadcast live telemetry via WebSockets.

### Step 2: (Optional) Frontend Development with Live Reload
If modifying the UI:
Double-click `start_frontend_dev.bat` or run:
```powershell
cd frontend
pnpm run dev
```
Open **`http://localhost:5173`**.

---

## 3. PWA Installation on Android & Mobile

1. Connect your Android phone to the same Wi-Fi network as your PC and ESP32s.
2. In Chrome on Android, navigate to `http://<YOUR_PC_IP>:8000`.
3. Chrome will prompt **"Install WAREBOT"** or tap the menu (`⋮`) -> **"Add to Home screen"** / **"Install App"**.
4. WAREBOT runs full-screen with pure black styling, offline asset caching, and touch-optimized controls.

---

## 4. Autonomous Mission & Vision Operations

1. **Target Selection**:
   - In the **Object Detection** tab, select **Bottle** (supported by COCO class 39).
   - *Note*: Deformable items (handkerchiefs) and generic cardboard boxes require custom YOLO training weights and are safely marked as **UNSUPPORTED** to prevent erratic robot motion.
2. **Autonomous Following**:
   - Navigate to the **Autonomous Mission** tab.
   - Click **START FOLLOWING (BOTTLE)**.
   - The car moves forward only when the target is confirmed visible, distance > 25.0 cm, and camera/ultrasonic data is fresh.
   - Upon reaching 25.0 cm, the car automatically stops and signals the arm to begin pickup.
   - When the arm finishes, the car backs off by 20.0 cm and enters `READY` for the next bottle.
3. **Emergency Stop (E-STOP)**:
   - Always visible in the top header. Pressing immediately commands `STOP` across car motors and halts all arm routines.

---

## 5. Simulation / Test Mode

If the physical robot is offline or you are testing in an office:
1. Open the **Settings & Calibration** tab in the dashboard.
2. Toggle **SIMULATION / MOCK HARDWARE** to **ON**.
3. The dashboard generates synthetic camera feeds with an animated target bottle, simulated ultrasonic distances, and responsive virtual servos.
4. Real hardware mode never substitutes zero for missing sensor values.

---

## 6. Running Automated Tests

To verify both backend and frontend test suites, double-click `run_tests.bat` or run:
```powershell
# Backend unit & integration tests (11 tests)
python -m pytest backend/tests -v

# Frontend & PWA verification tests (22 tests)
node frontend/test_pwa_and_frontend.js
```

---

## 7. Documentation Index
- Detailed Analysis: `docs/EXISTING_SYSTEM_ANALYSIS.md`
- System Architecture: `docs/ARCHITECTURE.md`
- Protocols & Message Formats: `docs/PROTOCOLS.md`
- Safety & Hazard Mitigation: `docs/SAFETY.md`
- PWA Deployment Guide: `docs/PWA_INSTALLATION.md`
- Troubleshooting Diagnostics: `docs/TROUBLESHOOTING.md`
