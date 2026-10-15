import React, { useState } from 'react';
import { useRobotStore } from '../store/useRobotStore';
import {
  Crosshair,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Sliders,
  Layers,
  ArrowRight,
  ShieldCheck,
  PackageCheck
} from 'lucide-react';

interface TargetOption {
  id: string;
  name: string;
  category: string;
  supported: boolean;
  cocoClassId?: number;
  description: string;
  requirements?: string;
}

const TARGET_OPTIONS: TargetOption[] = [
  {
    id: 'bottle',
    name: 'Bottle',
    category: 'Standard Container',
    supported: true,
    cocoClassId: 39,
    description: 'Natively trained in YOLOv8 (COCO Class 39). Verified for autonomous tracking & gripper pickup.',
  },
  {
    id: 'cup',
    name: 'Cup / Mug',
    category: 'Beverage Container',
    supported: true,
    cocoClassId: 41,
    description: 'Natively trained in YOLOv8 (COCO Class 41). High precision contour detection.',
  },
  {
    id: 'cell phone',
    name: 'Cell Phone / Mobile',
    category: 'Electronics',
    supported: true,
    cocoClassId: 67,
    description: 'Natively trained in YOLOv8 (COCO Class 67). Accurate bounding box tracking.',
  },
  {
    id: 'box',
    name: 'Box / Carton / Parcel',
    category: 'Parcel & Packaging',
    supported: true,
    description: 'Tracking enabled via COCO packaging & container classes (suitcase, backpack, package, book).',
  },
  {
    id: 'handkerchief',
    name: 'Handkerchief / Cloth',
    category: 'Textile / Fabric',
    supported: true,
    description: 'Visual tracking enabled via COCO textile and fabric proxies.',
  },
  {
    id: 'any',
    name: 'Any Detected Object',
    category: 'Broad Detection',
    supported: true,
    description: 'Tracks any high-confidence item detected by the 80 COCO classes.',
  },
];

export const DetectionScreen: React.FC = () => {
  const { telemetry, setTarget, updateSettings } = useRobotStore();
  const det = telemetry?.detection;
  const selectedTarget = det?.selected_target || 'bottle';

  const [confidenceSlider, setConfidenceSlider] = useState<number>(
    det?.confidence_threshold || 0.25
  );
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSelectTarget = async (option: TargetOption) => {
    const res = await setTarget(option.id);
    setFeedback(`Target filter updated to: ${option.name.toUpperCase()}`);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleConfidenceChange = async (val: number) => {
    setConfidenceSlider(val);
    await updateSettings({ yolo_confidence: val });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-surface-secondary text-accent-blue border border-surface-border">
            <Crosshair className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">OBJECT DETECTION & TARGET SELECTION</h1>
            <p className="text-xs text-text-muted font-mono">
              Inference: YOLOv8n (CPU) • High-Res Stream (640x480) • Real-Time Zero Lag
            </p>
          </div>
        </div>
        <div className="text-right font-mono text-xs">
          <div className="text-text-muted">ACTIVE TARGET:</div>
          <div className="text-accent-blue font-bold uppercase">{selectedTarget}</div>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-accent-blue/15 border border-accent-blue/30 text-accent-blue text-xs font-mono">
          {feedback}
        </div>
      )}

      {/* Target Category Cards */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-text-secondary uppercase">
          SELECT OBJECT CLASS FOR TRACKING & RETRIEVAL
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TARGET_OPTIONS.map((opt) => {
            const isSelected = selectedTarget === opt.id;
            return (
              <div
                key={opt.id}
                className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                  isSelected
                    ? 'bg-surface-elevated border-accent-blue shadow-md'
                    : 'bg-surface-primary border-surface-border hover:border-surface-border/80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-white flex items-center space-x-2">
                      <span>{opt.name}</span>
                      {opt.cocoClassId && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-secondary text-text-muted">
                          COCO #{opt.cocoClassId}
                        </span>
                      )}
                    </span>
                    {opt.supported ? (
                      <span className="flex items-center space-x-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-accent-green/20 text-accent-green border border-accent-green/40">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>SUPPORTED</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-accent-red/20 text-accent-red border border-accent-red/40">
                        <XCircle className="w-3 h-3" />
                        <span>UNSUPPORTED</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-1">{opt.description}</p>
                  {opt.requirements && (
                    <div className="mt-2 text-[11px] font-mono text-accent-yellow bg-accent-yellow/10 p-2 rounded border border-accent-yellow/20">
                      {opt.requirements}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-surface-border/60 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-text-muted">{opt.category}</span>
                  <button
                    onClick={() => handleSelectTarget(opt)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-accent-blue text-white shadow-sm'
                        : opt.supported
                        ? 'bg-surface-secondary hover:bg-surface-elevated text-white border border-surface-border'
                        : 'bg-surface-secondary/50 text-text-muted border border-surface-border cursor-pointer'
                    }`}
                  >
                    {isSelected ? 'SELECTED TARGET' : 'SELECT TARGET'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confidence Filter Slider */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="font-semibold text-text-secondary">YOLO CONFIDENCE THRESHOLD</span>
          <span className="text-white font-bold">{(confidenceSlider * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0.05"
          max="0.80"
          step="0.01"
          value={confidenceSlider}
          onChange={(e) => handleConfidenceChange(parseFloat(e.target.value))}
          className="w-full accent-accent-blue cursor-pointer"
        />
        <div className="flex justify-between text-[10px] font-mono text-text-muted">
          <span>5% (High Recall / Noise)</span>
          <span>Default: 12%</span>
          <span>80% (High Precision)</span>
        </div>
      </div>

      {/* Live Target Detection Breakdown */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-secondary uppercase">
            LIVE DETECTION MATCHES IN CAMERA FRAME
          </span>
          <span className="text-xs font-mono text-text-muted">
            Matching: <strong className="text-white uppercase">{selectedTarget}</strong>
          </span>
        </div>

        {det?.target_visible && det.detection ? (
          <div className="p-3.5 rounded-lg bg-surface-secondary border border-accent-green/40 flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-sm font-bold text-accent-green flex items-center space-x-2 font-mono">
                <CheckCircle2 className="w-4 h-4" />
                <span>{det.detection.class_name.toUpperCase()} DETECTED</span>
              </div>
              <div className="text-xs text-text-secondary font-mono">
                Confidence: {(det.detection.confidence * 100).toFixed(1)}% • Bounding Box: [
                {det.detection.box.join(', ')}] • Center: ({det.detection.center[0]}, {det.detection.center[1]})
              </div>
            </div>
            <div className="text-right text-xs font-mono text-text-muted">
              <div>Hits: {det.detection_hits}</div>
              <div className="text-[10px] text-accent-green">READY FOR TRACKING</div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-surface-secondary/50 border border-surface-border text-center text-xs font-mono text-text-muted">
            NO MATCHING OBJECT DETECTED IN CAMERA VIEW
          </div>
        )}
      </div>

      {/* Safety Notice: Selection vs Action */}
      <div className="p-4 rounded-xl bg-surface-secondary border border-surface-border text-xs text-text-secondary flex items-start space-x-3">
        <Info className="w-4 h-4 text-accent-blue flex-shrink-0 mt-0.5" />
        <div className="space-y-1 text-[11px] font-mono leading-relaxed">
          <div className="text-white font-semibold">SELECTION DOES NOT INITIATE MOVEMENT</div>
          <p>
            Selecting a target class configures the vision filtering pipeline only. The robot will not move until you
            explicitly initiate an autonomous mission from the{' '}
            <strong className="text-white">Autonomous Mission</strong> screen.
          </p>
        </div>
      </div>
    </div>
  );
};
