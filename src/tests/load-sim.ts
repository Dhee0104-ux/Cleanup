/**
 * LOAD TESTING SIMULATOR
 * Measures: Average, Median, P95, P99 response times, RPS, and error rates
 * Simulates concurrent workers requesting nearest hub and dynamic QR validation.
 */

import { calculateHaversineDistance } from '../server/geo.js';
import { generateQrSignature } from '../server/qr.js';
import { prisma } from '../server/db.js';

interface BenchmarkResult {
  concurrency: number;
  totalRequests: number;
  successful: number;
  failed: number;
  totalTimeMs: number;
  rps: number;
  avgLatencyMs: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function simulateBatch(concurrency: number): Promise<BenchmarkResult> {
  const hubs = await prisma.hub.findMany({ where: { isActive: true } });
  const latBase = 28.4595;
  const lngBase = 77.0266;

  const latencies: number[] = [];
  let successful = 0;
  let failed = 0;

  const startTime = Date.now();

  const tasks = Array.from({ length: concurrency }).map(async (_, idx) => {
    const reqStart = performance.now();
    try {
      // Simulate realistic worker workload:
      // 1. Worker GPS positioning offset
      const workerLat = latBase + (Math.random() - 0.5) * 0.1;
      const workerLng = lngBase + (Math.random() - 0.5) * 0.1;

      // 2. Compute Haversine distance to all active hubs
      let nearestDist = Infinity;
      let nearestHub = hubs[0];
      for (const h of hubs) {
        const d = calculateHaversineDistance(
          { latitude: workerLat, longitude: workerLng },
          { latitude: h.latitude, longitude: h.longitude }
        );
        if (d < nearestDist) {
          nearestDist = d;
          nearestHub = h;
        }
      }

      // 3. Dynamic QR Cryptographic HMAC generation
      const nonce = `nonce-${idx}-${Date.now()}`;
      const exp = Date.now() + 45000;
      const sig = generateQrSignature(nearestHub.id, nonce, exp);

      // 4. Quick DB query
      await prisma.hub.findFirst({ where: { id: nearestHub.id } });

      const reqEnd = performance.now();
      latencies.push(reqEnd - reqStart);
      successful++;
    } catch (e) {
      failed++;
    }
  });

  await Promise.all(tasks);
  const totalTimeMs = Date.now() - startTime;

  latencies.sort((a, b) => a - b);

  const avgLatencyMs = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
  const medianLatencyMs = calculatePercentile(latencies, 50);
  const p95LatencyMs = calculatePercentile(latencies, 95);
  const p99LatencyMs = calculatePercentile(latencies, 99);
  const rps = Math.round((concurrency / (totalTimeMs / 1000)) * 10) / 10;

  return {
    concurrency,
    totalRequests: concurrency,
    successful,
    failed,
    totalTimeMs,
    rps,
    avgLatencyMs: Math.round(avgLatencyMs * 100) / 100,
    medianLatencyMs: Math.round(medianLatencyMs * 100) / 100,
    p95LatencyMs: Math.round(p95LatencyMs * 100) / 100,
    p99LatencyMs: Math.round(p99LatencyMs * 100) / 100,
  };
}

async function main() {
  console.log('================================================================');
  console.log('HIGH-CONCURRENCY WORKFORCE LOAD BENCHMARK SIMULATOR');
  console.log('Testing concurrency levels: 50, 100, 500, 1,000 simultaneous workers');
  console.log('================================================================\n');

  const concurrencyLevels = [50, 100, 500, 1000];
  const results: BenchmarkResult[] = [];

  for (const level of concurrencyLevels) {
    console.log(`Executing batch: ${level} concurrent workers...`);
    const res = await simulateBatch(level);
    results.push(res);
    console.log(
      `  -> Done in ${res.totalTimeMs}ms | RPS: ${res.rps} | Avg: ${res.avgLatencyMs}ms | Med: ${res.medianLatencyMs}ms | P95: ${res.p95LatencyMs}ms | P99: ${res.p99LatencyMs}ms | Errors: ${res.failed}`
    );
  }

  console.log('\n================================================================');
  console.log('LOAD TEST SUMMARY TABLE');
  console.log('================================================================');
  console.table(
    results.map((r) => ({
      Workers: r.concurrency,
      RPS: r.rps,
      'Avg Latency (ms)': r.avgLatencyMs,
      'Median (ms)': r.medianLatencyMs,
      'P95 (ms)': r.p95LatencyMs,
      'P99 (ms)': r.p99LatencyMs,
      Success: r.successful,
      Errors: r.failed,
    }))
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
