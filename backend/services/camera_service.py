"""
WAREBOT - ESP32-CAM MJPEG Stream Service & Frame Proxy
Consumes http://<CAMERA_IP>:80/stream, buffers freshest frame, proxies to clients
"""
import time
import threading
import asyncio
import requests
import cv2
import numpy as np
from typing import Optional, Tuple, Dict, Any, Generator, AsyncGenerator
from backend.config import config
from backend.schemas import Subsystem, DeviceStatus
from backend.services.log_service import log_service

JPEG_START = b"\xff\xd8"
JPEG_END = b"\xff\xd9"

class CameraService:
    def __init__(self):
        self.latest_frame: Optional[np.ndarray] = None
        self.latest_jpeg: Optional[bytes] = None
        self.latest_annotated_jpeg: Optional[bytes] = None
        self.annotated_time: float = 0.0
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
        res_str = "640x480 (VGA)"
        with self.lock:
            if self.latest_frame is not None:
                h, w = self.latest_frame.shape[:2]
                res_str = f"{w}x{h}"
        return {
            "online": self.online if not config.simulation_mode else True,
            "fps": round(self.fps, 1),
            "frame_fresh": is_fresh,
            "frame_id": self.frame_id,
            "stream_url": f"http://{config.camera_ip}:{config.camera_port}{config.camera_stream_path}",
            "resolution": res_str,
        }

    def _run_stream(self):
        """Worker loop continuously pulling MJPEG from Mobile DroidCam/IP Webcam/ESP32-CAM with zero queue latency"""
        while not self.stop_event.is_set():
            if config.simulation_mode:
                self._generate_simulation_frame()
                self.stop_event.wait(0.04)
                continue

            # Candidate stream URLs in priority order:
            candidate_urls = [
                f"http://{config.camera_ip}:{config.camera_port}{config.camera_stream_path}",
                "http://127.0.0.1:4747/video",                           # DroidCam via USB (ADB forward)
                f"http://{config.camera_ip}:8080/video",                  # IP Webcam (Play Store)
                f"http://{config.camera_ip}:4747/mjpegfeed?640x480",     # DroidCam alternative path
                "http://10.172.189.233:4747/video"                      # DroidCam mobile fallback
            ]

            connected = False
            for stream_url in candidate_urls:
                if self.stop_event.is_set():
                    break
                try:
                    start_conn = time.perf_counter()
                    with requests.get(
                        stream_url,
                        stream=True,
                        headers={"Cache-Control": "no-cache", "User-Agent": "WAREBOT/1.0"},
                        timeout=(1.5, 2.5)
                    ) as resp:
                        resp.raise_for_status()
                        conn_latency = (time.perf_counter() - start_conn) * 1000.0
                        self.online = True
                        self.latency_ms = round(conn_latency, 1)
                        self.last_error = None
                        connected = True
                        log_service.success(Subsystem.CAMERA, "STREAM_CONNECTED", f"Connected to camera stream at {stream_url} (HTTP {resp.status_code})")

                        buffer = bytearray()
                        frame_count = 0
                        last_fps_calc = time.monotonic()

                        for chunk in resp.iter_content(chunk_size=4096):
                            if self.stop_event.is_set():
                                break
                            if not chunk:
                                continue
                            buffer.extend(chunk)

                            # Find newest complete JPEG frame
                            last_e = buffer.rfind(JPEG_END)
                            if last_e != -1:
                                last_s = buffer.rfind(JPEG_START, 0, last_e)
                                if last_s != -1:
                                    jpeg_bytes = bytes(buffer[last_s:last_e + 2])
                                    del buffer[:last_e + 2]

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
                                else:
                                    del buffer[:last_e + 2]

                            if len(buffer) > 100_000:
                                s = buffer.rfind(JPEG_START)
                                if s != -1:
                                    del buffer[:s]
                                else:
                                    buffer.clear()
                        # If loop exited cleanly, break out of candidate loop
                        break
                except Exception as err:
                    continue  # Try next candidate

            if not connected and not self.stop_event.is_set():
                self.online = False
                self.latency_ms = None
                self.last_error = f"Cannot reach camera at {config.camera_ip}:{config.camera_port}"
                self.stop_event.wait(0.8)

    def _generate_simulation_frame(self):
        """Generates realistic synthetic 640x480 frame with timestamp and simulated bottle"""
        self.online = True
        self.latency_ms = 1.8
        self.last_seen = time.time()
        self.fps = 25.0

        # Create 640x480 canvas
        img = np.zeros((480, 640, 3), dtype=np.uint8)
        img[:] = (20, 20, 20)

        # Draw grid
        for y in range(0, 480, 60):
            cv2.line(img, (0, y), (640, y), (35, 35, 35), 1)
        for x in range(0, 640, 80):
            cv2.line(img, (x, 0), (x, 480), (35, 35, 35), 1)

        # Draw simulated bottle in center
        t = time.time()
        offset_x = int(np.sin(t * 1.5) * 40)
        bx1, by1 = 280 + offset_x, 140
        bx2, by2 = 360 + offset_x, 380
        # Bottle body
        cv2.rectangle(img, (bx1, by1 + 50), (bx2, by2), (180, 140, 50), -1)
        # Bottle neck
        cv2.rectangle(img, (bx1 + 25, by1), (bx2 - 25, by1 + 50), (200, 160, 60), -1)
        # Bottle cap
        cv2.rectangle(img, (bx1 + 22, by1 - 12), (bx2 - 22, by1), (40, 40, 220), -1)

        cv2.putText(img, "WAREBOT CAMERA FEED", (15, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 120), 2)
        cv2.putText(img, f"640x480 {time.strftime('%H:%M:%S')}", (15, 465), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (160, 160, 160), 1)

        ret, jpeg = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if ret:
            with self.lock:
                self.latest_frame = img
                self.latest_jpeg = jpeg.tobytes()
                self.frame_id += 1
                self.frame_time = time.time()

    def set_annotated_jpeg(self, jpeg: Optional[bytes]):
        with self.lock:
            self.latest_annotated_jpeg = jpeg
            self.annotated_time = time.time()

    async def generate_mjpeg_stream(self) -> AsyncGenerator[bytes, None]:
        """Async generator yielding MJPEG multipart boundaries with direct in-frame YOLO box overlay"""
        last_yielded_id = -1
        last_yield_time = time.monotonic()
        while not self.stop_event.is_set():
            with self.lock:
                current_id = self.frame_id
                now_t = time.time()
                # Yield annotated frame with green YOLO box if fresh (< 1.2s), else raw frame
                if self.latest_annotated_jpeg is not None and (now_t - self.annotated_time <= 1.2):
                    jpeg = self.latest_annotated_jpeg
                else:
                    jpeg = self.latest_jpeg
            now_m = time.monotonic()
            # Yield when new frame arrives, OR keep-alive every 0.3s so Chrome <img> parser never dies
            if jpeg is not None and (current_id != last_yielded_id or (now_m - last_yield_time >= 0.3)):
                last_yielded_id = current_id
                last_yield_time = now_m
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n"
                    + jpeg + b"\r\n"
                )
            await asyncio.sleep(0.015)

# Global camera service instance
camera_service = CameraService()

