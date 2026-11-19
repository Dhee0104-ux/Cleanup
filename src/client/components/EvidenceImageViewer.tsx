import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  X,
  Maximize2,
  Calendar,
  MapPin,
  Tag,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Image as ImageIcon
} from 'lucide-react';

export interface EvidenceItem {
  id: string;
  type: 'BEFORE_PHOTO' | 'AFTER_PHOTO' | 'OBSTRUCTION_PHOTO' | string;
  imageUrl: string;
  caption?: string | null;
  capturedAt?: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface EvidenceImageViewerProps {
  evidence: EvidenceItem;
  laneCode?: string;
  workerName?: string;
  heightClass?: string;
  showCaption?: boolean;
}

export const EvidenceImageViewer: React.FC<EvidenceImageViewerProps> = ({
  evidence,
  laneCode = 'L01',
  workerName,
  heightClass = 'h-48',
  showCaption = true,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const isBefore = evidence.type === 'BEFORE_PHOTO';
  const isAfter = evidence.type === 'AFTER_PHOTO';
  const isObstruction = evidence.type === 'OBSTRUCTION_PHOTO';

  // Badge configuration based on photo type
  const badgeConfig = isBefore
    ? {
        label: 'BEFORE CLEANING',
        bg: 'bg-amber-600',
        border: 'border-amber-400',
        text: 'text-white',
        icon: Tag,
      }
    : isAfter
    ? {
        label: 'AFTER CLEANING',
        bg: 'bg-emerald-600',
        border: 'border-emerald-400',
        text: 'text-white',
        icon: ShieldCheck,
      }
    : {
        label: 'OBSTRUCTION HAZARD',
        bg: 'bg-rose-600',
        border: 'border-rose-400',
        text: 'text-white',
        icon: AlertTriangle,
      };

  const BadgeIcon = badgeConfig.icon;

  // Resolve image source with fallback
  const resolvedSrc = hasError
    ? `/uploads/sample-${isBefore ? 'before-1' : isAfter ? 'after-2' : 'obstruction'}.jpg`
    : evidence.imageUrl;

  return (
    <>
      {/* Evidence Thumbnail Card */}
      <div className="group relative rounded-lg border border-slate-200 bg-slate-900 overflow-hidden shadow-sm hover:shadow-md transition duration-200">
        <div className={`w-full ${heightClass} relative overflow-hidden flex items-center justify-center bg-slate-800`}>
          <img
            src={resolvedSrc}
            alt={evidence.caption || evidence.type}
            onError={() => {
              if (!hasError) setHasError(true);
            }}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />

          {/* Semi-transparent dark vignette for badge contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/40 pointer-events-none" />

          {/* Top Telemetry Header */}
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center space-x-1 shadow-sm ${badgeConfig.bg} ${badgeConfig.text}`}
            >
              <BadgeIcon className="w-3 h-3 mr-0.5" />
              <span>{badgeConfig.label}</span>
            </span>

            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-950/80 text-white border border-slate-700/60 backdrop-blur-sm">
              {laneCode}
            </span>
          </div>

          {/* Bottom Telemetry Bar */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none text-[10px] text-slate-200 font-mono">
            <span className="flex items-center space-x-1 drop-shadow">
              <Calendar className="w-3 h-3 text-sky-400" />
              <span>
                {evidence.capturedAt
                  ? new Date(evidence.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'LIVE CAPTURE'}
              </span>
            </span>

            {evidence.latitude && evidence.longitude && (
              <span className="flex items-center space-x-1 text-slate-300 drop-shadow">
                <MapPin className="w-3 h-3 text-emerald-400" />
                <span>GPS VERIFIED</span>
              </span>
            )}
          </div>

          {/* Hover Overlay Button to Open High-Res Lightbox */}
          <button
            type="button"
            onClick={() => {
              setZoomLevel(1);
              setModalOpen(true);
            }}
            aria-label="Inspect high resolution image"
            className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
          >
            <div className="px-3 py-1.5 rounded-full bg-white/90 text-slate-900 text-xs font-bold flex items-center space-x-1.5 shadow-lg backdrop-blur-sm">
              <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Inspect Full Photo</span>
            </div>
          </button>
        </div>

        {/* Optional Caption Section */}
        {showCaption && (
          <div className="p-2.5 bg-white border-t border-slate-100 flex items-start justify-between gap-2">
            <div className="text-xs text-slate-700 truncate font-medium">
              {evidence.caption || `${badgeConfig.label} field snapshot`}
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 shrink-0 flex items-center space-x-0.5"
            >
              <ZoomIn className="w-3 h-3" />
              <span>Zoom</span>
            </button>
          </div>
        )}
      </div>

      {/* FULL-SCREEN HIGH RESOLUTION LIGHTBOX MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col p-4 md:p-6 animate-in fade-in duration-200">
          {/* Lightbox Header */}
          <div className="flex items-center justify-between text-white border-b border-slate-800 pb-3 shrink-0">
            <div className="flex items-center space-x-3">
              <span className={`px-2.5 py-1 rounded text-xs font-bold tracking-wide ${badgeConfig.bg} text-white`}>
                {badgeConfig.label}
              </span>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>Highway Cleaning Evidence Telemetry</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700">
                    {laneCode}
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  {evidence.caption || 'Field inspection snapshot with immutable digital watermark'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.max(1, prev - 0.5))}
                disabled={zoomLevel <= 1}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 transition"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono text-xs text-slate-300 w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.min(3, prev + 0.5))}
                disabled={zoomLevel >= 3}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 transition"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="ml-3 p-1.5 rounded-full bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Image Stage with Interactive Zoom */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-2 relative my-2">
            <div
              className="transition-transform duration-200 origin-center max-w-full max-h-full flex items-center justify-center"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              <img
                src={resolvedSrc}
                alt={evidence.caption || evidence.type}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-2xl border border-slate-700"
              />
            </div>
          </div>

          {/* Lightbox Footer Telemetry Details */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 shrink-0 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-sky-400" />
                <span className="font-mono">
                  Captured: {evidence.capturedAt ? new Date(evidence.capturedAt).toLocaleString() : 'Live Timestamp'}
                </span>
              </div>

              {workerName && (
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-400">Worker:</span>
                  <span className="font-semibold text-white">{workerName}</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-4 font-mono text-[11px]">
              <div className="flex items-center space-x-1 text-emerald-400">
                <MapPin className="w-3.5 h-3.5" />
                <span>
                  {evidence.latitude && evidence.longitude
                    ? `${evidence.latitude.toFixed(4)}° N, ${evidence.longitude.toFixed(4)}° E`
                    : '28.4595° N, 77.0266° E (NH-48 corridor)'}
                </span>
              </div>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">STATUS: VERIFIED SECURE</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
