# WAREBOT — Troubleshooting & Diagnostics Guide

## 1. Device Communication Diagnostics

### Symptom: Car ESP32 is reported as "OFFLINE"
- **Diagnostic Steps**:
  1. Verify the Car ESP32 is powered and the blue LED indicates Wi-Fi connection.
  2. In your router or mobile hotspot, check the assigned IP address for the Car ESP32.
  3. In WAREBOT **Settings & Calibration**, verify that the Car IP matches the assigned IP.
  4. Test connectivity in terminal:
     ```powershell
     curl -m 2 http://<CAR_IP>/status
     ```
  5. Check if the Car is stuck in a loop: open Arduino Serial Monitor at `115200` baud.

### Symptom: Arm Servos do not respond to slider movements
- **Diagnostic Steps**:
  1. Check the Arm ESP32 Serial Monitor (`115200` baud) for:
     - `[I2C] PCA9685 detected at 0x40`
     - If `[I2C ERROR] PCA9685 not detected`, check SDA (GPIO 21) and SCL (GPIO 22) wiring.
  2. Confirm Arm IP in Settings.
  3. Note that the Arm firmware ignores UDP port 4242 slider packets if a `HOME` routine is active (`homing == true`). If homing hung, send a `STOP` or `RESET` command.
  4. Verify the 5V-6V external power supply for servos has adequate current (>3A recommended).

### Symptom: ESP32-CAM stream is black or showing "Stream Stale"
- **Diagnostic Steps**:
  1. Open `http://<CAMERA_IP>/capture` directly in a browser tab to test single-frame capture.
  2. If capture fails with `Camera capture failed`, the ESP32-CAM brownout detector may have tripped. Use a stable 5V 2A power supply.
  3. Verify `camera.ino` was flashed with `FRAMESIZE_QQVGA` and AI-Thinker board definitions.
  4. If browser blocks the stream due to mixed content (HTTP stream inside HTTPS PWA), use the Gateway's built-in MJPEG proxy endpoint: `http://localhost:8000/api/camera/stream`.

### Symptom: YOLO Detection is slow or unavailable
- **Diagnostic Steps**:
  1. Check if `yolov8n.pt` is in the workspace root or backend folder.
  2. If running on CPU, expect 15-30 FPS on modern Intel/AMD processors with QQVGA frames.
  3. Ensure OpenCV and PyTorch are installed:
     ```powershell
     python -c "import cv2, torch, ultralytics; print('All CV dependencies OK')"
     ```
  4. Toggle Simulation Mode in Gateway if physical camera is offline for testing.

### Symptom: Autonomous mode does not move towards object
- **Diagnostic Steps**:
  1. Check Object Detection tab: Ensure **Bottle** is selected (Boxes and Handkerchiefs require custom models and are intentionally disabled).
  2. Ensure ultrasonic distance reading is valid (> 25 cm and < 400 cm).
  3. Check Car state: must be `READY` or `MOVING_ALLOWED`.
