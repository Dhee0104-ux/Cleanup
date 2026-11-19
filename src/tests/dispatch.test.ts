import { PrismaClient } from '@prisma/client';

const BASE_URL = 'http://localhost:4001/api';

async function runDispatchTests() {
  console.log('===============================================================');
  console.log('🧪 HIGHWAY DISPATCH & WORKFORCE SCHEDULING VERIFICATION SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      if (detail) console.error(`     Reason: ${detail}`);
      failed++;
    }
  }

  // Helper login
  async function login(email: string, role: string) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Login failed for ${email}: ${data.message}`);
    return data.tokens.accessToken;
  }

  try {
    // 1. Login as Operations Admin
    const opsToken = await login('ops@highway.gov', 'OPERATIONS_ADMIN');
    assert(!!opsToken, 'Operations Admin login successful');

    // 2. Fetch Dispatch Meta
    const metaRes = await fetch(`${BASE_URL}/assignments/meta`, {
      headers: { Authorization: `Bearer ${opsToken}` },
    });
    const meta = await metaRes.json();
    assert(
      metaRes.ok && meta.success && meta.shifts?.length > 0 && meta.lanes?.length >= 4,
      'Dispatch Meta API returns valid shifts, lanes, and active workers',
      `Shifts count: ${meta.shifts?.length}, Lanes count: ${meta.lanes?.length}`
    );

    // 3. Fetch Shifts
    const shiftRes = await fetch(`${BASE_URL}/shifts`, {
      headers: { Authorization: `Bearer ${opsToken}` },
    });
    const shiftData = await shiftRes.json();
    assert(
      shiftRes.ok && shiftData.success && shiftData.shifts?.length >= 3,
      'GET /api/shifts returns highway operational shifts',
      `Found ${shiftData.shifts?.length} shifts`
    );

    // 4. Dispatch Worker to Lane L01
    const testWorker = meta.employees[0];
    const testLane = meta.lanes.find((l: any) => l.laneCode === 'L01') || meta.lanes[0];
    const testShift = meta.shifts[0];

    const dispatch1Res = await fetch(`${BASE_URL}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({
        employeeId: testWorker.id,
        laneId: testLane.id,
        shiftId: testShift.id,
        taskTitle: 'Primary Sweep Highway Left KM 12-25',
        startKm: 12.0,
        endKm: 25.0,
      }),
    });
    const dispatch1 = await dispatch1Res.json();
    assert(
      dispatch1Res.ok && dispatch1.success && dispatch1.assignment?.id,
      'Dispatch worker to Lane L01 succeeds (Status 201)',
      dispatch1.message
    );
    assert(
      dispatch1.task?.title === 'Primary Sweep Highway Left KM 12-25',
      'Initial cleaning task is automatically created for worker upon dispatch'
    );

    const assignmentId = dispatch1.assignment?.id;

    // 5. Test Re-dispatch / Upsert Handling (Worker already assigned today to this shift)
    const redispatchRes = await fetch(`${BASE_URL}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({
        employeeId: testWorker.id,
        laneId: meta.lanes.find((l: any) => l.laneCode === 'L02')?.id || meta.lanes[1].id,
        shiftId: testShift.id,
        taskTitle: 'Reassigned Sweep Highway Right KM 25-35',
      }),
    });
    const redispatch = await redispatchRes.json();
    assert(
      redispatchRes.ok && redispatch.success && redispatch.wasUpdated === true,
      'Re-dispatching worker on same day updates lane without unique constraint crash',
      redispatch.message
    );

    // 6. Test Human-Readable Codes Dispatch (using employeeCode "EMP-1002", laneCode "L03", shiftCode "SHIFT-M")
    const codeDispatchRes = await fetch(`${BASE_URL}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({
        employeeId: 'EMP-1002',
        laneId: 'L03',
        shiftId: 'SHIFT-M',
        taskTitle: 'Service Road Left Drain Inspection',
      }),
    });
    const codeDispatch = await codeDispatchRes.json();
    assert(
      codeDispatchRes.ok && codeDispatch.success,
      'Dispatch accepts human codes (EMP-1002, L03, SHIFT-M) and resolves UUIDs automatically',
      codeDispatch.message
    );
    const codeAssignmentId = codeDispatch.assignment?.id;

    // 7. Verify Active Dispatches List
    const listRes = await fetch(`${BASE_URL}/assignments`, {
      headers: { Authorization: `Bearer ${opsToken}` },
    });
    const listData = await listRes.json();
    assert(
      listRes.ok && listData.success && Array.isArray(listData.assignments),
      'GET /api/assignments returns active dispatches list with full relational data'
    );

    // 8. Test Update / Reassign via PUT /api/assignments/:id
    const putRes = await fetch(`${BASE_URL}/assignments/${assignmentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({
        laneId: 'L04',
        status: 'ACTIVE',
      }),
    });
    const putData = await putRes.json();
    assert(
      putRes.ok && putData.success && putData.assignment?.lane?.laneCode === 'L04',
      'PUT /api/assignments/:id transfers worker to Lane L04 with ACTIVE status'
    );

    // 9. Test Revoke / Cancel Dispatch via DELETE /api/assignments/:id
    const deleteRes = await fetch(`${BASE_URL}/assignments/${codeAssignmentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${opsToken}` },
    });
    const deleteData = await deleteRes.json();
    assert(
      deleteRes.ok && deleteData.success,
      'DELETE /api/assignments/:id cleanly cancels / revokes worker dispatch',
      deleteData.message
    );

    // 10. RBAC: Verify Field Worker is FORBIDDEN from dispatching
    const workerToken = await login('worker1@highway.gov', 'FIELD_WORKER');
    const workerDispatchRes = await fetch(`${BASE_URL}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
      body: JSON.stringify({
        employeeId: testWorker.id,
        laneId: testLane.id,
        shiftId: testShift.id,
      }),
    });
    assert(
      workerDispatchRes.status === 403,
      'RBAC Security: Field Worker is blocked from creating dispatches (403 Forbidden)'
    );

    console.log('\n===============================================================');
    console.log(`📊 DISPATCH SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================\n');

    if (failed > 0) process.exit(1);
    process.exit(0);
  } catch (err: any) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runDispatchTests();
