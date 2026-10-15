"""
WAREBOT - Local YOLOv8 Vision & Target Detection Engine
Preserves detection parameters, hold buffer, and class handling from python_robot.py
"""
import os
import time
import threading
from typing import Optional, Dict, Any, List
import numpy as np
from backend.config import config
from backend.schemas import Subsystem, DeviceStatus
from backend.services.log_service import log_service
from backend.services.camera_service import camera_service

COCO_NAMES = {
    0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 4: 'airplane', 5: 'bus', 6: 'train', 7: 'truck',
    8: 'boat', 9: 'traffic light', 10: 'fire hydrant', 11: 'stop sign', 12: 'parking meter', 13: 'bench',
    14: 'bird', 15: 'cat', 16: 'dog', 17: 'horse', 18: 'sheep', 19: 'cow', 20: 'elephant', 21: 'bear',
    22: 'zebra', 23: 'giraffe', 24: 'backpack', 25: 'umbrella', 26: 'handbag', 27: 'tie', 28: 'suitcase',
    29: 'frisbee', 30: 'skis', 31: 'snowboard', 32: 'sports ball', 33: 'kite', 34: 'baseball bat',
    35: 'baseball glove', 36: 'skateboard', 37: 'surfboard', 38: 'tennis racket', 39: 'bottle',
    40: 'wine glass', 41: 'cup', 42: 'fork', 43: 'knife', 44: 'spoon', 45: 'bowl', 46: 'banana',
    47: 'apple', 48: 'sandwich', 49: 'orange', 50: 'broccoli', 51: 'carrot', 52: 'hot dog', 53: 'pizza',
    54: 'donut', 55: 'cake', 56: 'chair', 57: 'couch', 58: 'potted plant', 59: 'bed', 60: 'dining table',
    61: 'toilet', 62: 'tv', 63: 'laptop', 64: 'mouse', 65: 'remote', 66: 'keyboard', 67: 'cell phone',
    68: 'microwave', 69: 'oven', 70: 'toaster', 71: 'sink', 72: 'refrigerator', 73: 'book', 74: 'clock',
    75: 'vase', 76: 'scissors', 77: 'teddy bear', 78: 'hair drier', 79: 'toothbrush'
}

TARGET_MAP: Dict[str, Optional[List[int]]] = {
    "bottle": [39],
    "cup": [41],
    "glass": [40, 41],
    "wine glass": [40],
    "bowl": [45],
    "cell phone": [67],
    "phone": [67],
    "mobile": [67],
    "box": [28, 24, 26, 73],        # Suitcase, backpack, handbag, book (standard parcel/package shapes in COCO)
    "carton": [28, 24, 26, 73],
    "package": [28, 24, 26, 73],
    "parcel": [28, 24, 26, 73],
    "handkerchief": [26, 24, 27],      # Handbag, backpack, tie (textile/fabric proxies in COCO)
    "cloth": [26, 24, 27],
    "fabric": [26, 24, 27],
    "chair": [56],
    "laptop": [63],
    "mouse": [64],
    "keyboard": [66],
    "remote": [65],
    "book": [73],
    "person": [0],
    "any": None,                        # None means predict on all 80 COCO classes
    "*": None,
}

class VisionService:
    def __init__(self):
        self.model = None
        self.model_loaded = False
        self.model_load_error: Optional[str] = None
        
        self.selected_target: str = "bottle"
        self.selected_target_classes: Optional[List[int]] = [39]
        self.target_supported: bool = True
        
        self.latest_detection: Optional[Dict[str, Any]] = None
        self.all_detections: List[Dict[str, Any]] = []
        self.detection_hits: int = 0
        self.last_detection_time: float = 0.0
        self.inference_fps: float = 0.0
        
        self.running: bool = False
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.worker_thread: Optional[threading.Thread] = None

    def start(self):
        if self.worker_thread is None or not self.worker_thread.is_alive():
            self.stop_event.clear()
            self.running = True
            self.worker_thread = threading.Thread(target=self._run_inference_loop, daemon=True)
            self.worker_thread.start()
            log_service.info(Subsystem.VISION, "ENGINE_STARTED", f"Target Class: {self.selected_target}")

    def stop(self):
        self.stop_event.set()
        self.running = False
        if self.worker_thread and self.worker_thread.is_alive():
            self.worker_thread.join(timeout=2.0)
        log_service.info(Subsystem.VISION, "ENGINE_STOPPED", "Vision engine stopped")

    def get_status(self) -> DeviceStatus:
        if config.simulation_mode:
            return DeviceStatus(
                online=True,
                status_text="SIMULATION",
                latency_ms=12.0,
                ip="Localhost",
                port=0,
                last_seen=time.time(),
                last_error=None
            )
        status_txt = "ONLINE" if (self.running and self.model_loaded) else ("ERROR" if self.model_load_error else "OFFLINE")
        return DeviceStatus(
            online=self.running and self.model_loaded,
            status_text=status_txt,
            latency_ms=round(1000.0 / self.inference_fps, 1) if self.inference_fps > 0 else None,
            ip="Localhost",
            port=0,
            last_seen=time.time() if self.running else None,
            last_error=self.model_load_error
        )

    def set_target(self, target_class: str) -> Dict[str, Any]:
        target = target_class.strip().lower()
        self.selected_target = target
        
        if target in TARGET_MAP:
            self.selected_target_classes = TARGET_MAP[target]
            self.target_supported = True
            if target in ("any", "*"):
                msg = "Target set to ANY OBJECT - Tracking all detectable items"
            elif target in ("box", "carton", "package", "parcel"):
                msg = f"Target set to {target.upper()} (Parcel/Carton proxies: suitcase, backpack, package)"
            elif target in ("handkerchief", "cloth", "fabric"):
                msg = f"Target set to {target.upper()} (Textile/Cloth proxies: handbag, fabric)"
            else:
                msg = f"Target set to {target.upper()} (COCO class: {self.selected_target_classes})"
        else:
            # Check against COCO-80 dictionary
            matched_id = None
            for cid, cname in COCO_NAMES.items():
                if cname.lower() == target:
                    matched_id = cid
                    break
            
            if matched_id is not None:
                self.selected_target_classes = [matched_id]
                self.target_supported = True
                msg = f"Target set to {target.upper()} (COCO Class {matched_id})"
            else:
                self.selected_target_classes = None
                self.target_supported = False
                msg = f"Target '{target}' is not recognized in object detector model."
                log_service.warning(Subsystem.VISION, "UNSUPPORTED_TARGET_CLASS", msg)
                return {
                    "success": True,
                    "target_class": target,
                    "supported": False,
                    "message": msg
                }
            
        log_service.info(Subsystem.VISION, "TARGET_UPDATED", msg)
        return {
            "success": True,
            "target_class": target,
            "supported": True,
            "message": msg
        }

    def get_telemetry(self) -> Dict[str, Any]:
        now = time.time()
        # Hold detection for 0.7s to tolerate brief frame misses (from python_robot.py)
        is_active = (
            self.latest_detection is not None
            and (now - self.last_detection_time <= 0.7)
            and self.detection_hits >= 1
        )
        
        return {
            "running": self.running,
            "model_loaded": self.model_loaded,
            "model_path": config.yolo_model_path,
            "selected_target": self.selected_target,
            "target_supported": self.target_supported,
            "supported_classes": [
                "bottle", "box", "cup", "cell phone", "handkerchief",
                "chair", "laptop", "mouse", "book", "person", "any"
            ],
            "unsupported_classes": [],
            "fps": round(self.inference_fps, 1),
            "target_visible": is_active,
            "detection": self.latest_detection if is_active else None,
            "all_detections": self.all_detections if is_active else [],
            "detection_hits": self.detection_hits if is_active else 0,
            "confidence_threshold": config.yolo_confidence,
        }

    def _load_model(self):
        try:
            from ultralytics import YOLO
            # Look in arm_final or local workspace
            weights_path = config.yolo_model_path
            if not os.path.isabs(weights_path):
                weights_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), weights_path)
            
            log_service.info(Subsystem.VISION, "LOADING_YOLO", f"Loading weights from {weights_path}")
            self.model = YOLO(weights_path)
            self.model_loaded = True
            self.model_load_error = None
            log_service.success(Subsystem.VISION, "YOLO_LOADED", "YOLOv8n neural weights ready")
        except Exception as e:
            self.model_loaded = False
            self.model_load_error = str(e)
            log_service.error(Subsystem.VISION, "YOLO_LOAD_FAILED", f"Could not load YOLO model: {e}")

    def _run_inference_loop(self):
        """Processes only the newest frame with zero queue backlog"""
        if not config.simulation_mode:
            self._load_model()
            
        last_frame_id = -1
        last_t = time.monotonic()

        while not self.stop_event.is_set():
            if config.simulation_mode or not self.model_loaded:
                self._run_simulated_detection()
                self.stop_event.wait(0.06)
                continue

            frame, frame_id, frame_time = camera_service.get_latest_frame()
            if frame is None or frame_id == last_frame_id:
                self.stop_event.wait(0.005)
                continue

            last_frame_id = frame_id
            now = time.time()

            try:
                # Class filter: dynamic classes based on selected target
                classes_arg = self.selected_target_classes
                
                results = self.model.predict(
                    source=frame,
                    imgsz=config.yolo_size,
                    conf=config.yolo_confidence,
                    iou=config.yolo_iou,
                    classes=classes_arg,
                    device="cpu",
                    max_det=5,
                    verbose=False
                )

                best_detection = None
                detections_list = []

                if results and len(results) > 0 and results[0].boxes is not None:
                    boxes = results[0].boxes
                    for box in boxes:
                        conf = float(box.conf[0])
                        cls_id = int(box.cls[0])
                        cls_name = self.model.names.get(cls_id, f"cls_{cls_id}")
                        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

                        det = {
                            "class_id": cls_id,
                            "class_name": cls_name,
                            "confidence": round(conf, 3),
                            "box": [x1, y1, x2, y2],
                            "center": [(x1 + x2) // 2, (y1 + y2) // 2],
                            "area": (x2 - x1) * (y2 - y1),
                        }
                        detections_list.append(det)

                        if best_detection is None or conf > best_detection["confidence"]:
                            best_detection = det

                elapsed = time.monotonic() - last_t
                last_t = time.monotonic()
                if elapsed > 0:
                    self.inference_fps = 0.8 * self.inference_fps + 0.2 * (1.0 / elapsed)

                with self.lock:
                    if best_detection is not None:
                        self.detection_hits += 1
                        self.latest_detection = best_detection
                        self.all_detections = detections_list
                        self.last_detection_time = now
                    else:
                        if now - self.last_detection_time > 0.7:
                            self.detection_hits = 0
                            self.latest_detection = None
                            self.all_detections = []

            except Exception as err:
                log_service.error(Subsystem.VISION, "INFERENCE_ERROR", f"YOLO prediction error: {err}")
                self.stop_event.wait(0.05)

    def _run_simulated_detection(self):
        """Provides simulated bounding box matching camera frame dimensions"""
        now = time.time()
        self.inference_fps = 20.0
        
        if self.target_supported:
            t = now
            offset_x = int(np.sin(t * 1.5) * 20)
            bx1, by1 = 280 + offset_x, 180
            bx2, by2 = 360 + offset_x, 340
            
            sim_det = {
                "class_id": 39 if self.selected_target == "bottle" else 28,
                "class_name": self.selected_target if self.selected_target != "any" else "bottle",
                "confidence": 0.89,
                "box": [bx1, by1, bx2, by2],
                "center": [(bx1 + bx2) // 2, (by1 + by2) // 2],
                "area": (bx2 - bx1) * (by2 - by1),
            }
            with self.lock:
                self.detection_hits += 1
                self.latest_detection = sim_det
                self.all_detections = [sim_det]
                self.last_detection_time = now
        else:
            with self.lock:
                self.detection_hits = 0
                self.latest_detection = None
                self.all_detections = []

# Global vision service instance
vision_service = VisionService()
