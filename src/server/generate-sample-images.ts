import fs from 'fs';
import path from 'path';
import CONFIG from '../config.js';

export function ensureSampleImagesExist() {
  const uploadDir = CONFIG.STORAGE.UPLOAD_DIR;
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  function createHighwaySvg(
    title: string,
    type: 'BEFORE' | 'AFTER' | 'OBSTRUCTION',
    lane: string,
    km: string,
    statusText: string,
    color: string,
    accentColor: string
  ) {
    const isBefore = type === 'BEFORE';
    const isAfter = type === 'AFTER';
    const isObstruction = type === 'OBSTRUCTION';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="60%" stop-color="#BAE6FD"/>
      <stop offset="100%" stop-color="#E0F2FE"/>
    </linearGradient>
    <linearGradient id="asphalt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Sky -->
  <rect x="0" y="0" width="800" height="220" fill="url(#sky)"/>
  
  <!-- Distant Hills -->
  <polygon points="0,220 180,195 380,210 580,190 800,220" fill="#65A30D" opacity="0.6"/>
  <polygon points="0,220 140,205 320,215 520,200 700,215 800,220" fill="#4D7C0F"/>

  <!-- Highway Roadway Perspective -->
  <polygon points="320,220 480,220 800,500 0,500" fill="url(#asphalt)"/>

  <!-- Concrete Barrier Left -->
  <polygon points="315,220 325,220 120,500 90,500" fill="#64748B"/>
  <polygon points="325,220 330,220 140,500 120,500" fill="#94A3B8"/>

  <!-- Right Shoulder / Curb -->
  <polygon points="475,220 480,220 720,500 700,500" fill="#94A3B8"/>
  <polygon points="480,220 490,220 790,500 720,500" fill="#3F6212"/>

  <!-- Lane Markings (Dashed Center Lines) -->
  <polygon points="398,230 402,230 404,260 396,260" fill="#FFFFFF" opacity="0.9"/>
  <polygon points="396,280 404,280 407,320 393,320" fill="#FFFFFF" opacity="0.9"/>
  <polygon points="392,350 408,350 412,410 388,410" fill="#FFFFFF" opacity="0.9"/>
  <polygon points="386,450 414,450 420,500 380,500" fill="#FFFFFF" opacity="0.9"/>

  <!-- Left Shoulder Solid White Line -->
  <polygon points="340,220 344,220 180,500 170,500" fill="#FFFFFF" opacity="0.85"/>
  <!-- Right Shoulder Solid Yellow Line -->
  <polygon points="460,220 464,220 670,500 660,500" fill="#EAB308" opacity="0.9"/>

  ${
    isBefore
      ? `
  <!-- BEFORE CLEANING: Debris, Dirt, Scattered Litter -->
  <ellipse cx="210" cy="440" rx="55" ry="18" fill="#78350F" opacity="0.75"/>
  <ellipse cx="250" cy="460" rx="40" ry="12" fill="#92400E" opacity="0.8"/>
  <path d="M 190 430 Q 200 420 215 428 Q 225 438 210 442 Z" fill="#0284C7" opacity="0.85"/>
  <path d="M 230 450 Q 240 440 255 448 Q 260 460 245 462 Z" fill="#DC2626" opacity="0.85"/>
  <path d="M 270 420 L 290 418 L 295 425 L 275 428 Z" fill="#0F172A"/>
  <path d="M 255 432 L 268 430 L 265 438 L 252 436 Z" fill="#1E293B"/>
  
  <rect x="150" y="390" width="170" height="85" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-dasharray="6 4" rx="4"/>
  <rect x="150" y="368" width="145" height="22" fill="#EF4444" rx="3"/>
  <text x="156" y="383" fill="#FFFFFF" font-family="sans-serif" font-size="11" font-weight="bold">LITTER / DEBRIS PRESENT</text>
  `
      : ''
  }

  ${
    isAfter
      ? `
  <!-- AFTER CLEANING: Spotless Roadway, High Reflective Curb -->
  <ellipse cx="220" cy="450" rx="70" ry="16" fill="#38BDF8" opacity="0.1"/>
  <path d="M 180 430 L 185 420 L 190 430 L 200 435 L 190 440 L 185 450 L 180 440 L 170 435 Z" fill="#FFFFFF" opacity="0.85"/>
  <path d="M 260 410 L 263 403 L 266 410 L 273 413 L 266 416 L 263 423 L 260 416 L 253 413 Z" fill="#FFFFFF" opacity="0.95"/>
  
  <rect x="150" y="390" width="180" height="80" fill="none" stroke="#10B981" stroke-width="2.5" rx="4"/>
  <rect x="150" y="368" width="145" height="22" fill="#10B981" rx="3"/>
  <text x="156" y="383" fill="#FFFFFF" font-family="sans-serif" font-size="11" font-weight="bold">CLEARED &amp; SWEPT CLEAN</text>
  `
      : ''
  }

  ${
    isObstruction
      ? `
  <!-- ROAD HAZARD: Safety Cones & Blown Tyre Block -->
  <polygon points="240,400 246,400 252,450 234,450" fill="#EA580C"/>
  <polygon points="237,422 249,422 250,432 236,432" fill="#FFFFFF"/>
  <ellipse cx="243" cy="450" rx="14" ry="4" fill="#C2410C"/>
  
  <polygon points="290,410 295,410 300,455 285,455" fill="#EA580C"/>
  <polygon points="288,430 297,430 298,438 287,438" fill="#FFFFFF"/>
  <ellipse cx="292" cy="455" rx="12" ry="3" fill="#C2410C"/>
  
  <ellipse cx="265" cy="440" rx="22" ry="10" fill="#0F172A"/>
  <ellipse cx="265" cy="440" rx="10" ry="5" fill="#334155"/>

  <rect x="200" y="365" width="135" height="22" fill="#E11D48" rx="3"/>
  <text x="206" y="380" fill="#FFFFFF" font-family="sans-serif" font-size="11" font-weight="bold">ROAD HAZARD ALERT</text>
  `
      : ''
  }

  <!-- Telemetry Header Overlay -->
  <rect x="15" y="15" width="770" height="52" rx="6" fill="#0F172A" fill-opacity="0.9" filter="url(#shadow)"/>
  
  <rect x="25" y="25" width="90" height="32" rx="4" fill="${accentColor}"/>
  <text x="70" y="46" fill="#FFFFFF" font-family="monospace" font-size="13" font-weight="bold" text-anchor="middle">${lane}</text>
  
  <text x="128" y="38" fill="#FFFFFF" font-family="sans-serif" font-size="13" font-weight="bold">${title}</text>
  <text x="128" y="54" fill="#94A3B8" font-family="monospace" font-size="11">${km} • NH-48 EXPRESS HIGHWAY CORRIDOR</text>

  <!-- Status Pill in Top Right -->
  <rect x="605" y="26" width="170" height="30" rx="15" fill="${color}"/>
  <text x="690" y="46" fill="#FFFFFF" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">${statusText}</text>

  <!-- Telemetry Footer Overlay -->
  <rect x="15" y="440" width="770" height="45" rx="6" fill="#0F172A" fill-opacity="0.9" filter="url(#shadow)"/>
  
  <text x="30" y="462" fill="#38BDF8" font-family="monospace" font-size="11" font-weight="bold">GPS: 28.4595° N, 77.0266° E (±4.2m)</text>
  <text x="30" y="477" fill="#94A3B8" font-family="monospace" font-size="10">EVIDENCE REF: HWY-EVD-948102 • TAMPER-PROTECTED TELEMETRY</text>

  <text x="765" y="468" fill="#F8FAFC" font-family="monospace" font-size="12" font-weight="bold" text-anchor="end">LIVE TELEMETRY VERIFIED</text>
</svg>`;
  }

  const files = [
    {
      name: 'sample-before-1.jpg',
      content: createHighwaySvg(
        'L01 Highway Left Median Curb Clean',
        'BEFORE',
        'LANE L01',
        'KM 12.0 - 16.0',
        'BEFORE CLEANING',
        '#D97706',
        '#1E324F'
      ),
    },
    {
      name: 'sample-before-2.jpg',
      content: createHighwaySvg(
        'L02 Highway Right Outer Drainage Sweep',
        'BEFORE',
        'LANE L02',
        'KM 14.0 - 18.0',
        'BEFORE CLEANING',
        '#D97706',
        '#1E324F'
      ),
    },
    {
      name: 'sample-after-2.jpg',
      content: createHighwaySvg(
        'L02 Highway Right Outer Drainage Sweep',
        'AFTER',
        'LANE L02',
        'KM 14.0 - 18.0',
        'VERIFIED CLEAN',
        '#059669',
        '#16845B'
      ),
    },
    {
      name: 'sample-clean-lane.jpg',
      content: createHighwaySvg(
        'L03 Service Road Left Arterial Debris Clear',
        'AFTER',
        'LANE L03',
        'KM 12.0 - 15.0',
        'VERIFIED CLEAN',
        '#059669',
        '#16845B'
      ),
    },
    {
      name: 'sample-obstruction.jpg',
      content: createHighwaySvg(
        'L04 Service Road Right Hazard Demarcation',
        'OBSTRUCTION',
        'LANE L04',
        'KM 16.5',
        'HAZARD OBSTRUCTION',
        '#E11D48',
        '#881337'
      ),
    },
  ];

  for (const f of files) {
    const dest = path.join(uploadDir, f.name);
    fs.writeFileSync(dest, f.content, 'utf8');
  }

  console.log(`[Uploads] Verified and wrote ${files.length} highway evidence assets in ${uploadDir}`);
}

// Allow direct CLI execution
if (process.argv[1]?.includes('generate-sample-images')) {
  ensureSampleImagesExist();
}
