# WAREBOT — System Architecture & Data Flow

```mermaid
graph TD
    subgraph Frontend [Progressive Web App - React / TypeScript / Vite]
        UI[Responsive UI Dashboard]
        WSClient[WebSocket Telemetry Client]
        HTTPClient[REST API Client]
        SW[Service Worker & Offline Cache]
        Overlay[Dynamic Detection Overlay Canvas]
    end

    subgraph Gateway [Local Python Robotics Gateway - FastAPI / Uvicorn]
        RESTRouter[FastAPI REST Router]
        WSHub[WebSocket Telemetry Hub]
        SafetyEngine[Safety Latch & Emergency Monitor]
        CarService[Car Communication Service - HTTP]
        ArmService[Arm Communication Service - UDP]
        CameraService[Camera MJPEG Proxy & Health]
        VisionService[YOLOv8 Detection Engine & Process Manager]
        MissionService[Autonomous Mission State Machine]
        LogService[Structured Event Logger]
    end

    subgraph Hardware [Physical Embedded Devices / Sensors]
        CarESP[Car ESP32 - Motors & HC-SR04]
        ArmESP[Arm ESP32 - PCA9685 6-DOF Servos]
        CamESP[ESP32-CAM - OV2640 MJPEG Stream]
    end

    UI --> WSClient
    UI --> HTTPClient
    WSClient <-->|ws://localhost:8000/ws/telemetry| WSHub
    HTTPClient -->|REST Commands| RESTRouter

    RESTRouter --> SafetyEngine
    SafetyEngine --> CarService
    SafetyEngine --> ArmService
    SafetyEngine --> MissionService

    CarService -->|HTTP GET /command| CarESP
    CarESP -->|HTTP Status / Distance| CarService
    ArmService -->|UDP 4242 6-byte angles| ArmESP
    ArmService -->|UDP 5005 ASCII commands| ArmESP
    ArmESP -.->|UDP 5006 Feedback| CarESP

    CamESP -->|MJPEG Stream :80/stream| CameraService
    CameraService --> VisionService
    VisionService -->|Detections & Bounding Boxes| MissionService
    MissionService -->|Movement Directives| CarService
    MissionService -->|Homing / Pickup Directives| ArmService

    WSHub -.->|Broadcast 10-20Hz State| WSClient
```

## Architectural Tenets
1. **Single Source of Truth**: The Gateway's `MissionService` owns autonomous execution. The browser never directly loops or sends repetitive forward commands; it issues high-level directives (`START_FOLLOWING`, `STOP_FOLLOWING`).
2. **Deterministic State Machine**:
   - `IDLE` -> `READY` -> `TARGET_SELECTED` -> `FOLLOWING` -> `STOPPED_AT_TARGET` -> `PICKUP` -> `COMPLETE`
   - Transitions respect hardware states (`MOVING_ALLOWED`, `PICKUP_STARTED`, `REVERSE_20_ACTIVE`).
3. **Decoupled Vision**: The YOLOv8 inference thread grabs frames asynchronously without blocking the camera network stream or WebSocket transmission.
4. **Safety Prioritization**: The Emergency Stop latch overrides all subsystem requests at the gateway level, instantly pushing `STOP` to the Car and halting the mission loop.
