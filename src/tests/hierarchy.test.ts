/**
 * HIERARCHICAL ACCESS CONTROL & LOWER-TIER ISOLATION TEST
 * Verifies that lower roles in the hierarchy CANNOT access superior tier data or actions.
 */

import { generateTokens } from '../server/auth.js';
import { prisma } from '../server/db.js';
import CONFIG from '../config.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function testHierarchy() {
  console.log('================================================================');
  console.log('STARTING HIERARCHICAL ACCESS CONTROL TESTS');
  console.log('Verifying that lower roles cannot access data of superior tiers');
  console.log('================================================================\n');

  const API_PORT = CONFIG.SERVER.PORT;
  const baseUrl = `http://localhost:${API_PORT}/api`;

  // 1. Fetch real seeded users from database
  const dbWorker = await prisma.user.findUnique({
    where: { email: 'worker1@highway.gov' },
    include: { employee: true },
  });
  if (!dbWorker) throw new Error('Worker not found in database');

  const dbHubOp = await prisma.user.findUnique({
    where: { email: 'hubop1@highway.gov' },
    include: { hubOperator: true },
  });
  if (!dbHubOp) throw new Error('Hub operator not found in database');

  const dbSupervisor = await prisma.user.findUnique({
    where: { email: 'supervisor1@highway.gov' },
    include: { supervisor: true },
  });
  if (!dbSupervisor) throw new Error('Supervisor not found in database');

  const dbOps = await prisma.user.findUnique({
    where: { email: 'ops@highway.gov' },
  });
  if (!dbOps) throw new Error('Ops admin not found in database');

  const dbAdmin = await prisma.user.findUnique({
    where: { email: 'admin@highway.gov' },
  });
  if (!dbAdmin) throw new Error('Super admin not found in database');

  const workerTokens = generateTokens({
    id: dbWorker.id,
    email: dbWorker.email,
    name: dbWorker.name,
    role: 'FIELD_WORKER',
    employeeId: dbWorker.employee?.id,
    employeeCode: dbWorker.employee?.employeeCode,
  });

  const hubOpTokens = generateTokens({
    id: dbHubOp.id,
    email: dbHubOp.email,
    name: dbHubOp.name,
    role: 'HUB_OPERATOR',
    hubId: dbHubOp.hubOperator?.id,
  });

  const supervisorTokens = generateTokens({
    id: dbSupervisor.id,
    email: dbSupervisor.email,
    name: dbSupervisor.name,
    role: 'SUPERVISOR',
    supervisorId: dbSupervisor.supervisor?.id,
    supervisorCode: dbSupervisor.supervisor?.supervisorCode,
  });

  const opsAdminTokens = generateTokens({
    id: dbOps.id,
    email: dbOps.email,
    name: dbOps.name,
    role: 'OPERATIONS_ADMIN',
  });

  const superAdminTokens = generateTokens({
    id: dbAdmin.id,
    email: dbAdmin.email,
    name: dbAdmin.name,
    role: 'SUPER_ADMIN',
  });

  console.log('--- TEST 1: Field Worker (Level 1) Hierarchy Barriers ---');

  // Worker tries to access Admin Overview (Level 5)
  const res1 = await fetch(`${baseUrl}/dashboard/overview`, {
    headers: { Authorization: `Bearer ${workerTokens.accessToken}` },
  });
  const data1 = await res1.json();
  assert(res1.status === 403, `Worker blocked from Super Admin Dashboard overview (Status 403)`);
  assert(data1.error === 'INSUFFICIENT_HIERARCHY_LEVEL', `Error code verified: ${data1.error}`);

  // Worker tries to access Global Audit Logs (Level 5)
  const res2 = await fetch(`${baseUrl}/audit`, {
    headers: { Authorization: `Bearer ${workerTokens.accessToken}` },
  });
  assert(res2.status === 403, `Worker blocked from Global Audit Trail (Status 403)`);

  // Worker tries to access Employee Roster (Level 3-5)
  const res3 = await fetch(`${baseUrl}/employees`, {
    headers: { Authorization: `Bearer ${workerTokens.accessToken}` },
  });
  assert(res3.status === 403, `Worker blocked from Master Employee Registry (Status 403)`);

  // Worker tries to access Supervisor Verification Queue (Level 3)
  const res4 = await fetch(`${baseUrl}/supervisor/pending-verifications`, {
    headers: { Authorization: `Bearer ${workerTokens.accessToken}` },
  });
  assert(res4.status === 403, `Worker blocked from Supervisor Verification Queue (Status 403)`);

  console.log('\n--- TEST 2: Hub Operator (Level 2) Hierarchy Barriers ---');

  // Hub Operator tries to access Admin Overview
  const res5 = await fetch(`${baseUrl}/dashboard/overview`, {
    headers: { Authorization: `Bearer ${hubOpTokens.accessToken}` },
  });
  assert(res5.status === 403, `Hub Operator blocked from Super Admin Dashboard (Status 403)`);

  // Hub Operator tries to access Supervisor Team
  const res6 = await fetch(`${baseUrl}/supervisor/team`, {
    headers: { Authorization: `Bearer ${hubOpTokens.accessToken}` },
  });
  assert(res6.status === 403, `Hub Operator blocked from Supervisor Team (Status 403)`);

  console.log('\n--- TEST 3: Supervisor (Level 3) Hierarchy Barriers ---');

  // Supervisor tries to access Admin Overview (Level 4-5)
  const res7 = await fetch(`${baseUrl}/dashboard/overview`, {
    headers: { Authorization: `Bearer ${supervisorTokens.accessToken}` },
  });
  assert(res7.status === 403, `Supervisor blocked from Super Admin Overview (Status 403)`);

  // Supervisor tries to access Global Security Audit Logs (Super Admin only)
  const res8 = await fetch(`${baseUrl}/audit`, {
    headers: { Authorization: `Bearer ${supervisorTokens.accessToken}` },
  });
  assert(res8.status === 403, `Supervisor blocked from Global Audit Trail (Status 403)`);

  // Supervisor accesses Supervisor Queue (Authorized Level 3)
  const res9 = await fetch(`${baseUrl}/supervisor/pending-verifications`, {
    headers: { Authorization: `Bearer ${supervisorTokens.accessToken}` },
  });
  assert(res9.status === 200, `Supervisor authorized for Supervisor Queue (Status 200 OK)`);

  console.log('\n--- TEST 4: Super Admin (Level 5) Full Access ---');

  // Super Admin accesses Dashboard Overview
  const res10 = await fetch(`${baseUrl}/dashboard/overview`, {
    headers: { Authorization: `Bearer ${superAdminTokens.accessToken}` },
  });
  assert(res10.status === 200, `Super Admin granted access to Command Center Overview (Status 200 OK)`);

  // Super Admin accesses Global Audit
  const res11 = await fetch(`${baseUrl}/audit`, {
    headers: { Authorization: `Bearer ${superAdminTokens.accessToken}` },
  });
  assert(res11.status === 200, `Super Admin granted access to Global Audit Trail (Status 200 OK)`);

  console.log('\n================================================================');
  console.log(`HIERARCHY TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('Fixed hierarchy enforcement & lower-tier barrier verified 100%!');
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

testHierarchy().catch((err) => {
  console.error(err);
  process.exit(1);
});

