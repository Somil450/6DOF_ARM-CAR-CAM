import cv2
import numpy as np
import requests
import threading
import time
from ultralytics import YOLO

# ============================================================
# WAREBOT CONFIGURATION
# ============================================================

CAMERA_IP = "10.116.205.188"
CAR_IP = "10.116.205.44"
ARM_IP = "10.116.205.193"

CAMERA_URL = f"http://{CAMERA_IP}:80/stream"
COMMAND_URL = f"http://{CAR_IP}/command"
DISTANCE_URL = f"http://{CAR_IP}/distance"
STATUS_URL = f"http://{CAR_IP}/status"

MODEL_PATH = "yolov8n.pt"
BOTTLE_CLASS = 39

STOP_DISTANCE_CM = 33.0

# Detection settings
YOLO_CONF = 0.25
YOLO_SIZE = 416
YOLO_IOU = 0.45

# Connection and safety settings
CAMERA_STALE_SECONDS = 3.0
DISTANCE_STALE_SECONDS = 2.5
STATUS_STALE_SECONDS = 4.0

CAMERA_CONNECT_TIMEOUT = 5
CAMERA_READ_TIMEOUT = 30

DISTANCE_POLL_INTERVAL = 0.25
STATUS_POLL_INTERVAL = 0.75
FORWARD_RETRY_INTERVAL = 0.25

# Tolerate brief detection misses
DETECTION_HOLD_SECONDS = 0.7

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

JPEG_START = b"\xff\xd8"
JPEG_END = b"\xff\xd9"


# ============================================================
# HTTP SESSION HELPER
# ============================================================

def make_session():
    session = requests.Session()
    session.headers.update({"Connection": "keep-alive"})
    return session


# ============================================================
# CAR CONTROLLER
# ============================================================

class CarController:
    def __init__(self):
        self.command_session = make_session()
        self.distance_session = make_session()
        self.status_session = make_session()

        self.command_lock = threading.Lock()
        self.last_command = None
        self.last_forward_sent = 0.0

    def command(self, cmd, force=False):
        cmd = cmd.upper()
        now = time.monotonic()

        with self.command_lock:
            if (
                cmd == "FORWARD"
                and not force
                and self.last_command == "FORWARD"
                and now - self.last_forward_sent < FORWARD_RETRY_INTERVAL
            ):
                return True

            if cmd == "STOP" and not force and self.last_command == "STOP":
                return True

            if cmd == "FORWARD":
                self.last_forward_sent = now

            try:
                response = self.command_session.get(
                    COMMAND_URL,
                    params={"cmd": cmd},
                    timeout=(0.8, 1.5),
                )

                reply = response.text.strip().upper()

                if response.status_code == 409:
                    print(f"[CAR BUSY] {reply}")
                    self.last_command = None
                    return False

                response.raise_for_status()

                print(f"[CAR] {cmd} -> {reply}")

                if cmd == "FORWARD":
                    accepted = reply == "FORWARD_ACCEPTED"
                elif cmd == "STOP":
                    accepted = reply == "STOPPED"
                elif cmd == "RESET":
                    accepted = reply in {
                        "RESET",
                        "RESET_COMPLETE",
                        "CAR_RESET_DONE",
                    }
                else:
                    accepted = response.ok

                self.last_command = cmd if accepted else None

                if not accepted:
                    print(f"[CAR REJECTED] {cmd}: {reply}")

                return accepted

            except requests.RequestException as error:
                self.last_command = None
                print(f"[CAR ERROR] {error}")
                return False

    def distance(self):
        try:
            response = self.distance_session.get(
                DISTANCE_URL,
                timeout=(0.8, 1.2),
            )
            response.raise_for_status()

            value = response.text.strip()

            if value.upper() == "INVALID_DISTANCE" or not value:
                return None

            if value.startswith("{"):
                data = response.json()
                value = data.get(
                    "distance",
                    data.get("distanceCM"),
                )

            value = float(value)

            if 2 <= value <= 400:
                return value

        except (requests.RequestException, ValueError, TypeError):
            pass

        return None

    def status(self):
        try:
            response = self.status_session.get(
                STATUS_URL,
                timeout=(0.8, 1.2),
            )
            response.raise_for_status()

            value = response.text.strip()

            # Support firmware returning JSON or plain text.
            if value.startswith("{"):
                data = response.json()
                value = (
                    data.get("status")
                    or data.get("state")
                    or data.get("carStatus")
                    or "UNKNOWN"
                )

            return str(value).strip().upper() or None

        except (requests.RequestException, ValueError):
            return None

    def close(self):
        self.command_session.close()
        self.distance_session.close()
        self.status_session.close()


# ============================================================
# BACKGROUND SENSOR POLLING
# ============================================================

class Poller:
    def __init__(self, function, interval):
        self.function = function
        self.interval = interval
        self.value = None
        self.updated = 0.0

        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True)

    def start(self):
        self.thread.start()

    def run(self):
        while not self.stop_event.is_set():
            result = self.function()

            if result is not None:
                with self.lock:
                    self.value = result
                    self.updated = time.monotonic()

            self.stop_event.wait(self.interval)

    def get(self, max_age):
        with self.lock:
            if self.value is None:
                return None

            if time.monotonic() - self.updated > max_age:
                return None

            return self.value

    def stop(self):
        self.stop_event.set()
        self.thread.join(timeout=2)


# ============================================================
# CAMERA RECEIVER
# ============================================================

class Camera:
    def __init__(self):
        self.frame = None
        self.frame_id = 0
        self.frame_time = 0.0
        self.connected = False

        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True)

    def start(self):
        self.thread.start()

    def get_frame(self):
        with self.lock:
            if self.frame is None:
                return None, -1, 0.0

            return self.frame.copy(), self.frame_id, self.frame_time

    def run(self):
        while not self.stop_event.is_set():
            try:
                print(f"[CAMERA] Connecting: {CAMERA_URL}")

                # Long read timeout avoids reconnecting for a brief
                # delay between JPEG chunks.
                with requests.get(
                    CAMERA_URL,
                    stream=True,
                    headers={"Cache-Control": "no-cache"},
                    timeout=(
                        CAMERA_CONNECT_TIMEOUT,
                        CAMERA_READ_TIMEOUT,
                    ),
                ) as response:

                    response.raise_for_status()
                    print(f"[CAMERA] Connected: HTTP {response.status_code}")

                    self.connected = True
                    buffer = bytearray()

                    for chunk in response.iter_content(chunk_size=4096):
                        if self.stop_event.is_set():
                            break

                        if not chunk:
                            continue

                        buffer.extend(chunk)

                        # Find the newest complete JPEG frame in the current buffer
                        last_e = buffer.rfind(JPEG_END)
                        if last_e != -1:
                            last_s = buffer.rfind(JPEG_START, 0, last_e)
                            if last_s != -1:
                                # Extract freshest complete frame, skipping any older backlog
                                jpeg_bytes = bytes(buffer[last_s:last_e + 2])
                                del buffer[:last_e + 2]

                                image = cv2.imdecode(
                                    np.frombuffer(jpeg_bytes, dtype=np.uint8),
                                    cv2.IMREAD_COLOR,
                                )

                                if image is not None:
                                    with self.lock:
                                        self.frame = image
                                        self.frame_id += 1
                                        self.frame_time = time.monotonic()
                            else:
                                del buffer[:last_e + 2]

                        # Safety cap: recover from malformed/oversized stream buffers.
                        if len(buffer) > 100_000:
                            s = buffer.rfind(JPEG_START)
                            if s != -1:
                                del buffer[:s]
                            else:
                                buffer.clear()

                    if not self.stop_event.is_set():
                        raise ConnectionError("Camera stream ended")

            except Exception as error:
                self.connected = False

                if not self.stop_event.is_set():
                    print(f"[CAMERA ERROR] {error}")
                    print("[CAMERA] Reconnecting in 1 second...")
                    self.stop_event.wait(1.0)

        self.connected = False

    def stop(self):
        self.stop_event.set()
        self.thread.join(timeout=3)


# ============================================================
# YOLO WORKER: ONLY PROCESS THE LATEST FRAME
# ============================================================

class YoloWorker:
    def __init__(self, model):
        self.model = model

        self.lock = threading.Lock()
        self.input_frame = None
        self.input_id = -1

        self.result = None
        self.result_id = -1
        self.inference_fps = 0.0

        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True)

    def start(self):
        self.thread.start()

    def submit(self, frame, frame_id):
        with self.lock:
            self.input_frame = frame.copy()
            self.input_id = frame_id

    def get(self):
        with self.lock:
            return self.result, self.result_id, self.inference_fps

    def run(self):
        processed_id = -1
        last_inference = time.monotonic()

        while not self.stop_event.is_set():
            with self.lock:
                frame = self.input_frame
                frame_id = self.input_id

            if frame is None or frame_id == processed_id:
                self.stop_event.wait(0.003)
                continue

            processed_id = frame_id

            try:
                results = self.model.predict(
                    source=frame,
                    imgsz=YOLO_SIZE,
                    conf=YOLO_CONF,
                    iou=YOLO_IOU,
                    classes=[BOTTLE_CLASS],
                    device="cpu",
                    max_det=10,
                    verbose=False,
                )

                best = None

                if results and results[0].boxes is not None:
                    for box in results[0].boxes:
                        confidence = float(box.conf[0])
                        x1, y1, x2, y2 = map(
                            int, box.xyxy[0].tolist()
                        )

                        print(
                            f"[YOLO] bottle confidence={confidence:.3f}"
                        )

                        candidate = {
                            "x1": x1,
                            "y1": y1,
                            "x2": x2,
                            "y2": y2,
                            "confidence": confidence,
                        }

                        if (
                            best is None
                            or confidence > best["confidence"]
                        ):
                            best = candidate

                now = time.monotonic()
                elapsed = now - last_inference
                last_inference = now

                fps = 1.0 / elapsed if elapsed > 0 else 0.0

                with self.lock:
                    self.result = best
                    self.result_id = frame_id
                    self.inference_fps = fps

            except Exception as error:
                print(f"[YOLO ERROR] {error}")

                with self.lock:
                    self.result = None
                    self.result_id = frame_id

    def stop(self):
        self.stop_event.set()
        self.thread.join(timeout=3)


# ============================================================
# DISPLAY OVERLAY
# ============================================================

def draw_display(frame, detection, distance, status, movement, fps):
    height = frame.shape[0]

    distance_text = (
        "Distance: unavailable"
        if distance is None
        else f"Distance: {distance:.1f} cm"
    )

    cv2.putText(
        frame, distance_text, (10, 25),
        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2,
    )

    if detection is not None:
        x1 = detection["x1"]
        y1 = detection["y1"]
        x2 = detection["x2"]
        y2 = detection["y2"]

        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

        cv2.putText(
            frame,
            f"BOTTLE {detection['confidence']:.2f}",
            (x1, max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2,
        )
    else:
        cv2.putText(
            frame, "NO BOTTLE", (10, 55),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2,
        )

    cv2.putText(
        frame, f"MOVE: {movement}", (10, 85),
        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 0), 2,
    )

    cv2.putText(
        frame, f"CAR: {status or 'UNKNOWN'}", (10, 115),
        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1,
    )

    cv2.putText(
        frame, f"YOLO FPS: {fps:.1f}", (10, height - 12),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1,
    )

    return frame


# ============================================================
# MAIN CONTROL LOOP
# ============================================================

def main():
    cv2.setNumThreads(1)

    print("\n========== WAREBOT ==========")
    print("[SYSTEM] Loading YOLO model...")

    model = YOLO(MODEL_PATH)
    print("[YOLO] Loaded:", model.names.get(BOTTLE_CLASS, "unknown"))

    car = CarController()
    camera = Camera()

    distance_monitor = Poller(
        car.distance, DISTANCE_POLL_INTERVAL
    )
    status_monitor = Poller(
        car.status, STATUS_POLL_INTERVAL
    )

    yolo = YoloWorker(model)

    emergency_stop = False

    last_frame_id = -1
    last_result_id = -1
    last_frame_time = 0.0

    last_detection = None
    last_detection_time = 0.0
    detection_hits = 0

    movement = "STARTING"

    try:
        print("[SYSTEM] Resetting car...")
        car.command("RESET", force=True)
        time.sleep(0.4)

        camera.start()
        distance_monitor.start()
        status_monitor.start()
        yolo.start()

        while True:
            now = time.monotonic()

            frame, frame_id, frame_time = camera.get_frame()

            distance = distance_monitor.get(
                DISTANCE_STALE_SECONDS
            )
            status = status_monitor.get(STATUS_STALE_SECONDS)

            if frame is None:
                movement = "WAIT CAMERA"
                car.command("STOP")

                key = cv2.waitKey(1) & 0xFF
                if key == ord("q"):
                    break

                time.sleep(0.01)
                continue

            if frame_id != last_frame_id:
                yolo.submit(frame, frame_id)
                last_frame_id = frame_id
                last_frame_time = frame_time

            detection, result_id, fps = yolo.get()

            if result_id >= 0 and result_id != last_result_id:
                last_result_id = result_id

                if detection is not None:
                    detection_hits += 1
                    last_detection = detection
                    last_detection_time = now
                else:
                    detection_hits = 0

            bottle_visible = (
                last_detection is not None
                and detection_hits >= 1
                and now - last_detection_time <= DETECTION_HOLD_SECONDS
            )

            if not bottle_visible:
                last_detection = None

            camera_ok = (
                camera.connected
                and now - last_frame_time <= CAMERA_STALE_SECONDS
            )

            # ------------------------------------------------
            # SAFETY AND MOVEMENT
            # ------------------------------------------------

            if not camera_ok:
                movement = "CAMERA LOST"
                car.command("STOP")

            elif emergency_stop:
                movement = "EMERGENCY STOP"
                car.command("STOP")

            elif status is None:
                movement = "WAIT CAR STATUS"
                car.command("STOP")

            elif status in PICKUP_STATES:
                movement = "PICKUP / REVERSE"
                # Leave pickup and reverse logic to the ESP32.

            elif bottle_visible:
                # Target detected! If confirmed at or below stop threshold, halt car
                if distance is not None and 0.0 < distance <= STOP_DISTANCE_CM:
                    movement = f"STOPPED AT TARGET ({distance:.1f} CM)"
                    car.command("STOP")
                elif status in ("READY", "MOVING_ALLOWED", "MOVING", "MOVING_FORWARD", "TURNING_LEFT", "TURNING_RIGHT"):
                    # Visual servoing: steer towards bottle center
                    frame_w = frame.shape[1] if hasattr(frame, "shape") else 640
                    cx = (last_detection["x1"] + last_detection["x2"]) // 2 if last_detection else frame_w // 2
                    left_bound = frame_w * 0.38
                    right_bound = frame_w * 0.62

                    if cx < left_bound:
                        desired_cmd = "LEFT"
                    elif cx > right_bound:
                        desired_cmd = "RIGHT"
                    else:
                        desired_cmd = "FORWARD"

                    accepted = car.command(desired_cmd)
                    dist_txt = f"{distance:.1f}cm" if distance is not None else "clear"
                    movement = f"{desired_cmd} ({dist_txt})" if accepted else f"{desired_cmd} REJECTED: {status}"
                else:
                    movement = f"CAR NOT READY: {status}"
                    car.command("STOP")

            else:
                movement = "NO BOTTLE - STOP"
                car.command("STOP")

            display_detection = (
                last_detection if bottle_visible else None
            )

            display = draw_display(
                frame.copy(),
                display_detection,
                distance,
                status,
                movement,
                fps,
            )

            cv2.imshow("WAREBOT Bottle Following", display)

            key = cv2.waitKey(1) & 0xFF

            if key == ord("q"):
                break

            elif key == ord("s"):
                emergency_stop = True
                car.command("STOP", force=True)
                print("[SYSTEM] Emergency stop enabled. Press R to reset.")

            elif key == ord("r"):
                emergency_stop = False
                last_detection = None
                last_detection_time = 0.0
                detection_hits = 0

                car.command("RESET", force=True)
                print("[SYSTEM] Reset requested.")

    except KeyboardInterrupt:
        print("\n[SYSTEM] Interrupted")

    finally:
        print("[SYSTEM] Stopping car and closing connections...")

        try:
            car.command("STOP", force=True)
        finally:
            distance_monitor.stop()
            status_monitor.stop()
            yolo.stop()
            camera.stop()
            car.close()
            cv2.destroyAllWindows()

        print("[SYSTEM] Shutdown complete")


if __name__ == "__main__":
    main()
