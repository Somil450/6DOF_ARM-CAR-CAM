"""
WAREBOT - ESP32-CAM MJPEG Stream Service & Frame Proxy
Consumes http://<CAMERA_IP>:80/stream, buffers freshest frame, proxies to clients
"""
import time
import threading
import requests
import cv2
import numpy as np
from typing import Optional, Tuple, Dict, Any, Generator
from backend.config import config
from backend.schemas import Subsystem, DeviceStatus
from backend.services.log_service import log_service

JPEG_START = b"\xff\xd8"
JPEG_END = b"\xff\xd9"

class CameraService:
    def __init__(self):
        self.latest_frame: Optional[np.ndarray] = None
        self.latest_jpeg: Optional[bytes] = None
        self.frame_id: int = 0
        self.frame_time: float = 0.0
        
        self.fps: float = 0.0
        self.online: bool = False
        self.latency_ms: Optional[float] = None
        self.last_seen: Optional[float] = None
        self.last_error: Optional[str] = None
        
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.worker_thread: Optional[threading.Thread] = None

    def start(self):
        if self.worker_thread is None or not self.worker_thread.is_alive():
            self.stop_event.clear()
            self.worker_thread = threading.Thread(target=self._run_stream, daemon=True)
            self.worker_thread.start()
            log_service.info(Subsystem.CAMERA, "STREAM_WORKER_STARTED", f"Target: http://{config.camera_ip}:{config.camera_port}{config.camera_stream_path}")

    def stop(self):
        self.stop_event.set()
        if self.worker_thread and self.worker_thread.is_alive():
            self.worker_thread.join(timeout=2.0)
        log_service.info(Subsystem.CAMERA, "STREAM_WORKER_STOPPED", "Camera receiver stopped")

    def get_status(self) -> DeviceStatus:
        if config.simulation_mode:
            return DeviceStatus(
                online=True,
                status_text="SIMULATION",
                latency_ms=2.1,
                ip=config.camera_ip,
                port=config.camera_port,
                last_seen=time.time(),
                last_error=None
            )
        return DeviceStatus(
            online=self.online,
            status_text="ONLINE" if self.online else "OFFLINE",
            latency_ms=self.latency_ms,
            ip=config.camera_ip,
            port=config.camera_port,
            last_seen=self.last_seen,
            last_error=self.last_error
        )

    def get_latest_frame(self) -> Tuple[Optional[np.ndarray], int, float]:
        with self.lock:
            if self.latest_frame is None:
                return None, -1, 0.0
            return self.latest_frame.copy(), self.frame_id, self.frame_time

    def get_latest_jpeg(self) -> Optional[bytes]:
        with self.lock:
            return self.latest_jpeg

    def get_telemetry(self) -> Dict[str, Any]:
        now = time.time()
        is_fresh = (now - self.frame_time <= config.camera_stale_seconds) if self.frame_time > 0 else False
        return {
            "online": self.online if not config.simulation_mode else True,
            "fps": round(self.fps, 1),
            "frame_fresh": is_fresh,
            "frame_id": self.frame_id,
            "stream_url": f"http://{config.camera_ip}:{config.camera_port}{config.camera_stream_path}",
            "resolution": "160x120 (QQVGA)",
        }

    def _run_stream(self):
        """Worker loop continuously pulling MJPEG from ESP32-CAM or generating simulated feed"""
        stream_url = f"http://{config.camera_ip}:{config.camera_port}{config.camera_stream_path}"
        
        while not self.stop_event.is_set():
            if config.simulation_mode:
                self._generate_simulation_frame()
                self.stop_event.wait(0.04) # ~25 FPS
                continue

            try:
                start_conn = time.perf_counter()
                with requests.get(
                    stream_url,
                    stream=True,
                    headers={"Cache-Control": "no-cache"},
                    timeout=(3.0, 10.0)
                ) as resp:
                    resp.raise_for_status()
                    conn_latency = (time.perf_counter() - start_conn) * 1000.0
                    self.online = True
                    self.latency_ms = round(conn_latency, 1)
                    self.last_error = None
                    log_service.success(Subsystem.CAMERA, "STREAM_CONNECTED", f"Connected to ESP32-CAM (HTTP {resp.status_code})")

                    buffer = bytearray()
                    frame_count = 0
                    last_fps_calc = time.monotonic()

                    for chunk in resp.iter_content(chunk_size=4096):
                        if self.stop_event.is_set():
                            break
                        if not chunk:
                            continue
                        buffer.extend(chunk)

                        # Prevent unbounded memory
                        if len(buffer) > 1_500_000:
                            s = buffer.rfind(JPEG_START)
                            if s >= 0:
                                del buffer[:s]
                            else:
                                buffer.clear()

                        while True:
                            s = buffer.find(JPEG_START)
                            if s < 0:
                                if len(buffer) > 1:
                                    del buffer[:-1]
                                break
                            if s > 0:
                                del buffer[:s]

                            e = buffer.find(JPEG_END, 2)
                            if e < 0:
                                break

                            jpeg_bytes = bytes(buffer[:e + 2])
                            del buffer[:e + 2]

                            # Decode frame
                            img = cv2.imdecode(np.frombuffer(jpeg_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
                            if img is not None:
                                now = time.time()
                                with self.lock:
                                    self.latest_frame = img
                                    self.latest_jpeg = jpeg_bytes
                                    self.frame_id += 1
                                    self.frame_time = now
                                    self.last_seen = now
                                frame_count += 1

                                now_m = time.monotonic()
                                if now_m - last_fps_calc >= 1.0:
                                    self.fps = frame_count / (now_m - last_fps_calc)
                                    frame_count = 0
                                    last_fps_calc = now_m

            except Exception as err:
                self.online = False
                self.latency_ms = None
                self.last_error = str(err)
                if not self.stop_event.is_set():
                    self.stop_event.wait(1.5)

    def _generate_simulation_frame(self):
        """Generates realistic synthetic 160x120 QQVGA frame with timestamp and simulated bottle"""
        self.online = True
        self.latency_ms = 1.8
        self.last_seen = time.time()
        self.fps = 25.0

        # Create black canvas
        img = np.zeros((120, 160, 3), dtype=np.uint8)
        img[:] = (15, 15, 15) # Dark gray background

        # Grid lines
        for y in range(0, 120, 30):
            cv2.line(img, (0, y), (160, y), (25, 25, 25), 1)
        for x in range(0, 160, 40):
            cv2.line(img, (x, 0), (x, 120), (25, 25, 25), 1)

        # Draw simulated bottle in center-right
        t = time.time()
        offset_x = int(np.sin(t * 1.5) * 15)
        bx1, by1 = 70 + offset_x, 30
        bx2, by2 = 95 + offset_x, 95
        # Bottle body
        cv2.rectangle(img, (bx1, by1 + 15), (bx2, by2), (180, 140, 50), -1)
        # Bottle neck
        cv2.rectangle(img, (bx1 + 8, by1), (bx2 - 8, by1 + 15), (200, 160, 60), -1)
        # Bottle cap
        cv2.rectangle(img, (bx1 + 7, by1 - 4), (bx2 - 7, by1), (40, 40, 220), -1)

        # Overlay text
        cv2.putText(img, "WAREBOT SIM CAM", (6, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 200, 0), 1)
        cv2.putText(img, f"160x120 {time.strftime('%H:%M:%S')}", (6, 114), cv2.FONT_HERSHEY_SIMPLEX, 0.3, (120, 120, 120), 1)

        ret, jpeg = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        if ret:
            with self.lock:
                self.latest_frame = img
                self.latest_jpeg = jpeg.tobytes()
                self.frame_id += 1
                self.frame_time = time.time()

    def generate_mjpeg_stream(self) -> Generator[bytes, None, None]:
        """Generator yielding MJPEG multipart boundaries for proxy streaming"""
        while not self.stop_event.is_set():
            jpeg = self.get_latest_jpeg()
            if jpeg is not None:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n"
                    + jpeg + b"\r\n"
                )
            time.sleep(0.04) # Yield at ~25 FPS max

# Global camera service instance
camera_service = CameraService()
