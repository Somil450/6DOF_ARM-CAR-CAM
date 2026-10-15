# WAREBOT — Safety Architecture & Hazard Mitigation

## 1. Safety Principles & Real-World Constraints

> [!WARNING]
> Software emergency-stop features running in a web browser or local PC gateway **cannot guarantee** physical safety under network disconnection, power supply collapse, or hardware lockup. Software emergency stops are **not** certified SIL/PL safety functions. Operators must always maintain line-of-sight and physical access to robot power switches.

### Actuator Capabilities & Limits
1. **L298N Drive Motors**:
   - The car operates without encoder feedback.
   - Movement speed is fixed full duty cycle in current firmware.
   - Forward movement is gated by ultrasonic proximity: if distance measured is ≤ 25.0 cm, forward movement is physically blocked at the firmware level.
2. **PCA9685 Robotic Arm**:
   - 6 standard PWM servos (0° to 180°).
   - No potentiometric or torque feedback exists on the physical servos; all position values are **commanded angles**, not measured angles.
   - Sequential homing is enforced in firmware (1° per 20 ms with 500 ms inter-servo dwell) to avoid current surges that brown out the ESP32.

---

## 2. Software Safety Interlocks

### A. Emergency Stop (E-STOP) Latch
- When pressed from anywhere in the UI:
  1. The Gateway sets `emergency_stop = True`.
  2. Gateway immediately dispatches `GET /command?cmd=STOP` to Car ESP32 with `force=True`.
  3. Gateway dispatches UDP command `"STOP"` to Arm ESP32 on port `5005` to abort homing.
  4. Gateway terminates active mission loops and resets state to `EMERGENCY_HALT`.
  5. The UI shows a modal warning banner.
  6. Resumption requires an explicit two-step operator action: `CLEAR EMERGENCY LATCH`.

### B. Proximity & Stale Data Safeguards
| Condition | Threshold | System Action |
|---|---|---|
| Ultrasonic Proximity | ≤ 25.0 cm | Firmware immediately cuts forward motors; Gateway enters `STOPPED_AT_TARGET`. |
| Camera Stream Stale | > 3.0 s without frame | Vision halts forward movement commands; Car stops. |
| Distance Reading Stale | > 2.5 s without update | Autonomous follow aborts; Car stops. |
| Car Status Stale | > 4.0 s without response | Gateway marks Car `OFFLINE` and halts commands. |
| Target Lost | > 0.7 s without detection | Follow loop stops Car movement immediately. |
| Network Disconnect | WebSocket or Wi-Fi drop | Browser disables all motion controls; offline banner displayed. |

### C. Conflicting Command Prevention
- During firmware `PICKUP_WAIT` or `REVERSE_20_ACTIVE`, all manual drive requests are rejected with status 409.
- Autonomous mission loop locks drive commands so operator manual clicks do not interleave or create erratic motor behavior.
- Only supported object categories (Bottle via COCO class 39) are allowed for autonomous missions. Boxes and handkerchiefs are marked `UNSUPPORTED (CUSTOM DATASET REQUIRED)` and cannot trigger motion.
