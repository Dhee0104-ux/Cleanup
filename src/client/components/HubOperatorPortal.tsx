import React, { useEffect, useState, useRef } from 'react';
import { api, getSocket } from '../api.js';
import { Hub } from '../types.js';
import {
  QrCode,
  Building2,
  Clock,
  ShieldCheck,
  RefreshCw,
  Radio,
  MapPin,
  CheckCircle2,
  Users,
  AlertCircle
} from 'lucide-react';

export const HubOperatorPortal: React.FC = () => {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrPayload, setQrPayload] = useState<string>('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(45);
  const [totalValidity, setTotalValidity] = useState<number>(45);
  const [loading, setLoading] = useState(true);
  const [incomingScans, setIncomingScans] = useState<any[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load all company hubs
  useEffect(() => {
    const fetchHubs = async () => {
      try {
        setLoading(true);
        const data = await api.getAllHubs();
        setHubs(data);
        if (data.length > 0) {
          setSelectedHub(data[0]);
        }
      } catch (err) {
        console.error('Failed to load hubs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHubs();
  }, []);

  // Fetch or generate dynamic QR code when selected hub changes
  const refreshDynamicQr = async (hub: Hub) => {
    try {
      const res = await api.generateHubQr(hub.id, 45);
      setQrDataUrl(res.qrDataUrl);
      setQrPayload(res.payloadString);
      setSecondsRemaining(res.secondsRemaining);
      setTotalValidity(res.secondsRemaining);
    } catch (err) {
      console.error('Failed to generate dynamic QR:', err);
    }
  };

  useEffect(() => {
    if (!selectedHub) return;
    refreshDynamicQr(selectedHub);

    // Socket room subscription for this hub
    const socket = getSocket();
    socket.emit('join', `hub:${selectedHub.id}`);

    const handleScanReceived = (payload: any) => {
      setIncomingScans((prev) => [payload, ...prev.slice(0, 19)]);
    };

    socket.on('hub:scan_received', handleScanReceived);

    return () => {
      socket.emit('leave', `hub:${selectedHub.id}`);
      socket.off('hub:scan_received', handleScanReceived);
    };
  }, [selectedHub]);

  // Countdown timer effect
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          if (selectedHub) {
            refreshDynamicQr(selectedHub);
          }
          return 45;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [selectedHub]);

  const percentage = Math.round((secondsRemaining / totalValidity) * 100);

  return (
    <div className="space-y-6">
      {/* Station Header */}
      <div className="bg-white p-5 rounded-lg border border-[#E1E6EC] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200 uppercase">
              Hub Station Terminal
            </span>
            <span className="text-xs text-slate-500 font-mono">Dynamic QR Attendance Kiosk</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#14243A] mt-1">
            {selectedHub ? `${selectedHub.name} (${selectedHub.hubCode})` : 'Company Hub Operator'}
          </h1>
          <p className="text-xs text-[#718096]">
            High-security short-lived dynamic QR codes generated and refreshed every 45 seconds with single-use replay prevention.
          </p>
        </div>

        {/* Hub Selector */}
        <div className="flex items-center space-x-2">
          <label className="text-xs font-semibold text-slate-600">Active Station:</label>
          <select
            value={selectedHub?.id || ''}
            onChange={(e) => {
              const h = hubs.find((hub) => hub.id === e.target.value);
              if (h) setSelectedHub(h);
            }}
            className="text-xs px-3 py-2 border border-[#E1E6EC] rounded bg-white font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#14243A]"
          >
            {hubs.map((hub) => (
              <option key={hub.id} value={hub.id}>
                {hub.hubCode} - {hub.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Terminal View: QR Generator + Live Incoming Check-In Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Dynamic QR Display Kiosk (Left 7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-lg border border-[#E1E6EC] shadow-sm p-6 flex flex-col items-center justify-center text-center">
          <div className="w-full flex items-center justify-between border-b border-slate-100 pb-3 mb-6">
            <div className="flex items-center space-x-2">
              <QrCode className="w-5 h-5 text-[#14243A]" />
              <span className="text-xs font-bold text-[#14243A] uppercase tracking-wider">
                Official Check-in QR Token
              </span>
            </div>

            {/* Countdown Badge */}
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Rotates in: {secondsRemaining}s
              </span>
            </div>
          </div>

          {/* QR Code Container */}
          <div className="relative p-6 bg-slate-50 border-2 border-dashed border-[#334B67]/30 rounded-xl max-w-sm w-full mx-auto shadow-inner">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Dynamic Hub Attendance QR"
                className="w-full h-auto max-w-[260px] mx-auto rounded shadow-sm"
              />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center text-slate-400 text-xs">
                Generating dynamic token...
              </div>
            )}

            {/* Circular Progress Bar */}
            <div className="mt-4">
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-500 mt-1 font-mono">
                <span>0s</span>
                <span className="font-semibold text-slate-700">{secondsRemaining}s remaining</span>
                <span>45s</span>
              </div>
            </div>
          </div>

          {/* Security & Cryptographic Details */}
          <div className="mt-6 w-full max-w-sm space-y-2 text-left bg-slate-50 p-3 rounded border border-slate-200 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-slate-500">Security Signature:</span>
              <span className="font-mono text-[11px] text-emerald-700 font-semibold">HMAC-SHA256 (Signed)</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-slate-500">Replay Protection:</span>
              <span className="font-mono text-[11px] text-slate-800">Single-Use Nonce Enforced</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-slate-500">Geofence Radius:</span>
              <span className="font-mono text-[11px] text-slate-800">
                {selectedHub?.geofenceRadiusM || 500} Meters
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-slate-500">Physical Coordinates:</span>
              <span className="font-mono text-[11px] text-slate-800">
                {selectedHub?.latitude.toFixed(4)}, {selectedHub?.longitude.toFixed(4)}
              </span>
            </div>
          </div>

          <button
            onClick={() => selectedHub && refreshDynamicQr(selectedHub)}
            className="mt-4 flex items-center space-x-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-semibold transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Force Token Rotation</span>
          </button>
        </div>

        {/* Live Incoming Worker Scans (Right 5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-lg border border-[#E1E6EC] shadow-sm p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
                <h3 className="text-sm font-bold text-[#14243A]">Live Incoming Check-In Feed</h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                Live Scanner
              </span>
            </div>

            <div className="space-y-3 max-h-[460px] overflow-y-auto">
              {incomingScans.length > 0 ? (
                incomingScans.map((scan, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-emerald-100 bg-emerald-50/40 flex items-start justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-bold text-xs text-slate-800">{scan.employeeName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">({scan.employeeCode})</span>
                      </div>
                      <div className="text-xs text-slate-600">
                        Lane: <strong className="font-mono">{scan.laneCode}</strong> - {scan.laneName}
                      </div>
                      <div className="text-[11px] text-emerald-700 font-medium">
                        Status: Attendance & Cleaning Verified
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {new Date(scan.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-16 text-center text-xs text-slate-400 space-y-2">
                  <Users className="w-8 h-8 mx-auto text-slate-300" />
                  <p>Awaiting incoming field worker QR check-ins...</p>
                  <p className="text-[11px] text-slate-400">
                    Workers who have completed cleaning and travelled to this hub will appear here automatically.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            Station Address: <span className="font-medium text-slate-700">{selectedHub?.physicalAddress}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
