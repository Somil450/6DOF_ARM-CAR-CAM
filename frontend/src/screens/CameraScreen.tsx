import React, { useState, useRef, useEffect } from 'react';
import { useRobotStore } from '../store/useRobotStore';
import {
  Camera,
  Maximize2,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  Play,
  Square,
  Activity,
  Layers
} from 'lucide-react';

export const CameraScreen: React.FC = () => {
  const { telemetry, gatewayHost } = useRobotStore();
  const [isPlaying, setIsPlaying] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const [streamKey, setStreamKey] = useState(Date.now());
  const [isImgLoaded, setIsImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const camInfo = telemetry?.camera;
  const devCamera = telemetry?.devices.camera;
  const detection = telemetry?.detection;

  const streamUrl = `http://${gatewayHost}:8000/api/camera/stream?t=${streamKey}`;

  const handleReconnect = () => {
    setIsImgLoaded(false);
    setImgError(false);
    setStreamKey(Date.now());
  };

  const handleToggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch(err => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-surface-primary border border-surface-border">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-surface-secondary text-accent-blue border border-surface-border">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center space-x-2">
              <span>ESP32-CAM LIVE MJPEG STREAM</span>
              {camInfo?.frame_fresh ? (
                <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-accent-red" />
              )}
            </h1>
            <p className="text-xs text-text-muted font-mono">
              Hardware: AI-Thinker OV2640 • Resolution: {camInfo?.resolution || '640x480 VGA'} • Zero-Lag Real-Time Stream
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Overlay Toggle */}
          <button
            onClick={() => setShowOverlay(!showOverlay)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
              showOverlay
                ? 'bg-accent-blue/15 border-accent-blue/40 text-accent-blue'
                : 'bg-surface-secondary border-surface-border text-text-muted hover:text-white'
            }`}
          >
            {showOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>OVERLAY</span>
          </button>

          {/* Play/Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-xs text-white transition-colors"
          >
            {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-accent-green" />}
            <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </button>

          {/* Reconnect */}
          <button
            onClick={handleReconnect}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-xs text-text-secondary hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>RECONNECT</span>
          </button>

          {/* Fullscreen */}
          <button
            onClick={handleToggleFullscreen}
            className="p-1.5 rounded bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-text-secondary hover:text-white transition-colors"
            title="Toggle Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Video Display Area */}
      <div
        ref={videoContainerRef}
        className="relative w-full aspect-[4/3] max-h-[70vh] bg-surface-primary border border-surface-border rounded-xl overflow-hidden flex items-center justify-center select-none"
      >
        {isPlaying ? (
          <>
            <img
              key={streamKey}
              src={streamUrl}
              alt="ESP32-CAM Live Stream"
              className="w-full h-full object-contain pointer-events-none"
              onLoad={() => {
                setIsImgLoaded(true);
                setImgError(false);
              }}
              onError={() => {
                setIsImgLoaded(false);
                setImgError(true);
              }}
            />

            {/* Loading / Error States */}
            {!isImgLoaded && !imgError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 space-y-2">
                <RefreshCw className="w-6 h-6 text-accent-blue animate-spin" />
                <span className="text-xs font-mono text-text-secondary">CONNECTING TO STREAM PROXY...</span>
              </div>
            )}

            {imgError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-6 text-center space-y-3">
                <AlertTriangle className="w-10 h-10 text-accent-red" />
                <div className="text-sm font-bold text-white">STREAM UNAVAILABLE OR CAMERA OFFLINE</div>
                <p className="text-xs text-text-muted max-w-md font-mono">
                  Could not receive frames from ESP32-CAM at {devCamera?.ip || 'configured IP'}.
                  Ensure the camera is powered (5V 2A) and connected to Wi-Fi.
                </p>
                <button
                  onClick={handleReconnect}
                  className="px-4 py-2 rounded bg-surface-elevated hover:bg-surface-border border border-surface-border text-xs font-semibold text-white transition-colors"
                >
                  RETRY STREAM CONNECTION
                </button>
              </div>
            )}

            {/* SVG Dynamic Detection Overlay (Adaptive coordinate space) */}
            {showOverlay && isImgLoaded && detection?.target_visible && detection.detection && (() => {
              const [x1, y1, x2, y2] = detection.detection.box;
              const vbW = Math.max(x2, 160) > 160 ? 640 : 160;
              const vbH = vbW === 640 ? 480 : 120;
              const width = Math.max(1, x2 - x1);
              const height = Math.max(1, y2 - y1);
              const confPercent = (detection.detection.confidence * 100).toFixed(0);
              const strokeW = vbW === 640 ? 3 : 1.5;
              const fontSz = vbW === 640 ? 14 : 6;
              const badgeH = vbW === 640 ? 20 : 9;
              const badgeW = Math.max(vbW === 640 ? 120 : 48, detection.detection.class_name.length * (vbW === 640 ? 10 : 6) + 32);

              return (
                <svg
                  viewBox={`0 0 ${vbW} ${vbH}`}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <g>
                    {/* Box border */}
                    <rect
                      x={x1}
                      y={y1}
                      width={width}
                      height={height}
                      fill="none"
                      stroke="#22C55E"
                      strokeWidth={strokeW}
                      strokeDasharray="6 3"
                    />
                    {/* Label badge */}
                    <rect
                      x={x1}
                      y={Math.max(2, y1 - badgeH - 2)}
                      width={badgeW}
                      height={badgeH}
                      fill="#22C55E"
                      rx={vbW === 640 ? 3 : 1.5}
                    />
                    <text
                      x={x1 + (vbW === 640 ? 6 : 2)}
                      y={Math.max(fontSz + 2, y1 - (vbW === 640 ? 6 : 3))}
                      fill="#000000"
                      fontSize={fontSz}
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {detection.detection.class_name.toUpperCase()} {confPercent}%
                    </text>
                    {/* Center reticle */}
                    <circle
                      cx={detection.detection.center[0]}
                      cy={detection.detection.center[1]}
                      r={vbW === 640 ? 5 : 2.5}
                      fill="none"
                      stroke="#22C55E"
                      strokeWidth={strokeW}
                    />
                    <line
                      x1={detection.detection.center[0] - (vbW === 640 ? 10 : 4)}
                      y1={detection.detection.center[1]}
                      x2={detection.detection.center[0] + (vbW === 640 ? 10 : 4)}
                      y2={detection.detection.center[1]}
                      stroke="#22C55E"
                      strokeWidth={strokeW * 0.8}
                    />
                    <line
                      x1={detection.detection.center[0]}
                      y1={detection.detection.center[1] - (vbW === 640 ? 10 : 4)}
                      x2={detection.detection.center[0]}
                      y2={detection.detection.center[1] + (vbW === 640 ? 10 : 4)}
                      stroke="#22C55E"
                      strokeWidth={strokeW * 0.8}
                    />
                  </g>
                </svg>
              );
            })()}

            {/* Stale Frame Warning Banner */}
            {!camInfo?.frame_fresh && isImgLoaded && (
              <div className="absolute top-3 left-3 bg-accent-red/90 text-white text-[10px] font-mono font-bold px-2.5 py-1 rounded shadow">
                FEED STALE (&gt; 3.0s)
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center text-text-muted space-y-2">
            <Square className="w-8 h-8" />
            <span className="text-xs font-mono">STREAM PAUSED BY OPERATOR</span>
          </div>
        )}

        {/* Live HUD Telemetry Badge */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none text-[11px] font-mono text-white/90">
          <div className="bg-black/75 backdrop-blur-sm px-2.5 py-1 rounded border border-surface-border/50 flex items-center space-x-3">
            <span>FPS: {camInfo?.fps || 0}</span>
            <span>FRAME: #{camInfo?.frame_id || 0}</span>
            <span>TARGET: {detection?.selected_target?.toUpperCase() || 'BOTTLE'}</span>
          </div>
          <div className="bg-black/75 backdrop-blur-sm px-2.5 py-1 rounded border border-surface-border/50">
            DIST: {telemetry?.car.distance_cm ? `${telemetry.car.distance_cm.toFixed(1)} cm` : 'N/A'}
          </div>
        </div>
      </div>

      {/* Stream Diagnostic Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        <div className="p-3 rounded-lg bg-surface-primary border border-surface-border">
          <div className="text-text-muted">CAMERA HARDWARE</div>
          <div className="text-white font-semibold mt-1">AI-Thinker ESP32-CAM</div>
        </div>
        <div className="p-3 rounded-lg bg-surface-primary border border-surface-border">
          <div className="text-text-muted">STREAM PROTOCOL</div>
          <div className="text-white font-semibold mt-1">MJPEG / HTTP Chunked</div>
        </div>
        <div className="p-3 rounded-lg bg-surface-primary border border-surface-border">
          <div className="text-text-muted">CAMERA LATENCY</div>
          <div className="text-white font-semibold mt-1">
            {devCamera?.latency_ms ? `${devCamera.latency_ms} ms` : 'OFFLINE'}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-surface-primary border border-surface-border">
          <div className="text-text-muted">DETECTION PIPELINE</div>
          <div className="text-white font-semibold mt-1">
            {detection?.running ? `YOLOv8 (${detection.fps} FPS)` : 'OFFLINE'}
          </div>
        </div>
      </div>
    </div>
  );
};
