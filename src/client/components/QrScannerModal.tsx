import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, AlertTriangle, QrCode, CheckCircle, RefreshCw } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (qrPayload: string) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualPayload, setManualPayload] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'interactive-qr-reader';

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    setIsScanning(true);

    try {
      const html5QrCode = new Html5Qrcode(scannerContainerId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          stopCamera();
          onScanSuccess(decodedText);
        },
        () => {
          // Frame error (silently ignore non-scanned frames)
        }
      );
    } catch (err: any) {
      console.warn('Camera initialization notice:', err);
      setCameraError(
        'Camera stream unavailable or permission denied. You can paste or test with a simulated hub QR payload below.'
      );
      setIsScanning(false);
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        // Ignore stop error
      }
    }
    setIsScanning(false);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPayload.trim()) return;
    onScanSuccess(manualPayload.trim());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-[#E1E6EC]">
        {/* Header */}
        <div className="bg-[#14243A] text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Camera className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm tracking-tight">Hub Dynamic QR Code Scanner</h3>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1 rounded text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Feed / Target Window */}
        <div className="p-5 space-y-4">
          <div className="relative bg-slate-900 rounded-lg overflow-hidden min-h-[260px] flex items-center justify-center">
            <div id={scannerContainerId} className="w-full h-full"></div>

            {cameraError && (
              <div className="absolute inset-0 bg-slate-900/90 p-4 flex flex-col items-center justify-center text-center text-rose-300 space-y-2">
                <AlertTriangle className="w-8 h-8 text-rose-400" />
                <p className="text-xs">{cameraError}</p>
                <button
                  onClick={startCamera}
                  className="mt-2 text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded flex items-center space-x-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Camera</span>
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-center text-slate-500">
            Hold your mobile device steadily in front of the active Hub screen.
          </p>

          {/* Fallback Manual / Simulator QR Payload Input */}
          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
              <span className="font-semibold">Simulate / Paste QR Token:</span>
              <span className="text-[11px] text-slate-400 font-mono">Dev/Fallback</span>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-2">
              <textarea
                rows={2}
                placeholder='Paste raw dynamic QR JSON payload: {"hubId": "...", "nonce": "...", ...}'
                value={manualPayload}
                onChange={(e) => setManualPayload(e.target.value)}
                className="w-full text-xs font-mono p-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-[#14243A]"
              />
              <button
                type="submit"
                disabled={!manualPayload.trim()}
                className="w-full py-2 bg-[#14243A] hover:bg-[#1E324F] disabled:opacity-50 text-white text-xs font-semibold rounded transition"
              >
                Submit QR Token for Verification
              </button>
            </form>
          </div>
        </div>

        <div className="bg-slate-50 p-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
