import { prisma } from '../server/db.js';
import { generateTokens } from '../server/auth.js';
import CONFIG from '../config.js';

async function testTaskManagement() {
  console.log('================================================================');
  console.log('TESTING EMPLOYEE TASK ADD & REMOVE OPERATIONS');
  console.log('================================================================\n');

  const baseUrl = `http://localhost:${CONFIG.SERVER.PORT}/api`;

  // 1. Get supervisor and worker from database
  const supervisor = await prisma.user.findUnique({
    where: { email: 'supervisor1@highway.gov' },
    include: { supervisor: true },
  });
  if (!supervisor) throw new Error('Supervisor user not found');

  const worker = await prisma.user.findUnique({
    where: { email: 'worker1@highway.gov' },
    include: { employee: true },
  });
  if (!worker || !worker.employee) throw new Error('Worker user or employee not found');

  const supervisorTokens = generateTokens({
    id: supervisor.id,
    email: supervisor.email,
    name: supervisor.name,
    role: 'SUPERVISOR',
    supervisorId: supervisor.supervisor?.id,
    supervisorCode: supervisor.supervisor?.supervisorCode,
  });

  console.log(`[Step 1] Supervisor Authenticated: ${supervisor.name} (${supervisor.email})`);
  console.log(`[Step 2] Target Worker: ${worker.name} (${worker.employee.employeeCode})`);

  // Step 3: Supervisor assigns a new task to this specific employee
  console.log('\n[Step 3] Adding task for specific employee via POST /api/tasks...');
  const createRes = await fetch(`${baseUrl}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supervisorTokens.accessToken}`,
    },
    body: JSON.stringify({
      employeeId: worker.employee.id,
      title: 'Lane L01 Emergency Median Curb Litter Clearance',
      description: 'Clear shredded tire casing and loose gravel between KM 22.0 and 24.5',
      laneCode: 'L01',
      targetKmStart: 22.0,
      targetKmEnd: 24.5,
      remarks: 'High priority fast lane safety check',
    }),
  });

  const createData = await createRes.json();
  if (createRes.status !== 201) {
    throw new Error(`Failed to create task: ${JSON.stringify(createData)}`);
  }

  const createdTaskId = createData.task.id;
  console.log(`  ✓ Task successfully created! Task ID: ${createdTaskId}`);
  console.log(`  ✓ Title: "${createData.task.title}"`);
  console.log(`  ✓ Assigned Employee: ${createData.task.employee.user.name}`);
  console.log(`  ✓ Lane: ${createData.task.lane.laneCode} (${createData.task.lane.name})`);

  // Step 4: Verify task exists in database
  const dbTask = await prisma.cleaningTask.findUnique({
    where: { id: createdTaskId },
  });
  if (!dbTask) throw new Error('Task was not found in database after creation');
  console.log(`  ✓ Database confirmation: Task ${dbTask.id} verified with status ${dbTask.status}`);

  // Step 5: Remove the task via DELETE /api/tasks/:id
  console.log('\n[Step 4] Removing task via DELETE /api/tasks/:id...');
  const deleteRes = await fetch(`${baseUrl}/tasks/${createdTaskId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${supervisorTokens.accessToken}`,
    },
  });

  const deleteData = await deleteRes.json();
  if (deleteRes.status !== 200) {
    throw new Error(`Failed to remove task: ${JSON.stringify(deleteData)}`);
  }
  console.log(`  ✓ Task removal API response: ${deleteData.message}`);

  // Step 6: Verify task no longer exists in database
  const dbTaskAfter = await prisma.cleaningTask.findUnique({
    where: { id: createdTaskId },
  });
  if (dbTaskAfter) throw new Error('Task still exists in database after deletion!');
  console.log(`  ✓ Database confirmation: Task ${createdTaskId} is deleted permanently!`);

  console.log('\n================================================================');
  console.log('TASK ADD & REMOVE TEST PASSED 100%');
  console.log('================================================================\n');
}

testTaskManagement().catch((err) => {
  console.error(err);
  process.exit(1);
});
