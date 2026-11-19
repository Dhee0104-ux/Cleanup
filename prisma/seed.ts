import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Smart Highway Cleaning Workforce Management System...');

  // Clean existing records in sequence
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.locationVerification.deleteMany();
  await prisma.attendanceEvent.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.taskVerification.deleteMany();
  await prisma.taskEvidence.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.cleaningTask.deleteMany();
  await prisma.workerAssignment.deleteMany();
  await prisma.hubQrToken.deleteMany();
  await prisma.hub.deleteMany();
  await prisma.lane.deleteMany();
  await prisma.highwaySection.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.supervisor.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Create Core Users & Roles
  // Super Admin
  const adminUser = await prisma.user.create({
    data: {
      name: 'Rajesh Sharma',
      email: 'admin@highway.gov',
      passwordHash,
      role: 'SUPER_ADMIN',
    },
  });

  // Operations Admin
  const opsAdminUser = await prisma.user.create({
    data: {
      name: 'Priya Nair',
      email: 'ops@highway.gov',
      passwordHash,
      role: 'OPERATIONS_ADMIN',
    },
  });

  // Supervisors
  const supUser1 = await prisma.user.create({
    data: {
      name: 'Vikram Singh',
      email: 'supervisor1@highway.gov',
      passwordHash,
      role: 'SUPERVISOR',
    },
  });
  const supervisor1 = await prisma.supervisor.create({
    data: {
      userId: supUser1.id,
      supervisorCode: 'SUP-2001',
      phone: '+91-9876543210',
      department: 'NH-48 Corridor Operations',
    },
  });

  const supUser2 = await prisma.user.create({
    data: {
      name: 'Anil Deshmukh',
      email: 'supervisor2@highway.gov',
      passwordHash,
      role: 'SUPERVISOR',
    },
  });
  const supervisor2 = await prisma.supervisor.create({
    data: {
      userId: supUser2.id,
      supervisorCode: 'SUP-2002',
      phone: '+91-9876543211',
      department: 'Service Road & Arterial Logistics',
    },
  });

  // Hub Operators
  const hubOpUser1 = await prisma.user.create({
    data: {
      name: 'Kavita Patel',
      email: 'hubop1@highway.gov',
      passwordHash,
      role: 'HUB_OPERATOR',
    },
  });

  const hubOpUser2 = await prisma.user.create({
    data: {
      name: 'Rohan Mehta',
      email: 'hubop2@highway.gov',
      passwordHash,
      role: 'HUB_OPERATOR',
    },
  });

  // Field Workers
  const workerDefs = [
    { name: 'Suresh Kumar', email: 'worker1@highway.gov', code: 'EMP-1001', phone: '+91-9811100001', skills: 'Left Shoulder Sweeping, Obstruction Clearing' },
    { name: 'Ramesh Verma', email: 'worker2@highway.gov', code: 'EMP-1002', phone: '+91-9811100002', skills: 'Right Barrier Sweeping, Debris Sorting' },
    { name: 'Manoj Tiwari', email: 'worker3@highway.gov', code: 'EMP-1003', phone: '+91-9811100003', skills: 'Drainage Clearout, Service Road Trench Sweep' },
    { name: 'Deepak Yadav', email: 'worker4@highway.gov', code: 'EMP-1004', phone: '+91-9811100004', skills: 'Pedestrian Walkway Sweeping, Curb Washing' },
    { name: 'Amitabh Joshi', email: 'worker5@highway.gov', code: 'EMP-1005', phone: '+91-9811100005', skills: 'Expressway Median Crew, Rapid Response' },
    { name: 'Sunil Rathore', email: 'worker6@highway.gov', code: 'EMP-1006', phone: '+91-9811100006', skills: 'Spill Cleanup, Hazard Remediation' },
  ];

  const workers = [];
  for (const w of workerDefs) {
    const user = await prisma.user.create({
      data: {
        name: w.name,
        email: w.email,
        passwordHash,
        role: 'FIELD_WORKER',
      },
    });

    const employee = await prisma.employee.create({
      data: {
        userId: user.id,
        employeeCode: w.code,
        phone: w.phone,
        skills: w.skills,
        status: 'ACTIVE',
      },
    });

    workers.push({ user, employee });
  }

  // 2. Shifts
  const shiftMorning = await prisma.shift.create({
    data: {
      name: 'Morning Shift',
      code: 'SHIFT-M',
      startTime: '06:00',
      endTime: '14:00',
    },
  });

  const shiftAfternoon = await prisma.shift.create({
    data: {
      name: 'Afternoon Shift',
      code: 'SHIFT-A',
      startTime: '14:00',
      endTime: '22:00',
    },
  });

  const shiftNight = await prisma.shift.create({
    data: {
      name: 'Night Patrol Shift',
      code: 'SHIFT-N',
      startTime: '22:00',
      endTime: '06:00',
    },
  });

  // 3. Highway Sections
  const section1 = await prisma.highwaySection.create({
    data: {
      sectionCode: 'SEC-NH48-01',
      name: 'NH-48 Express Corridor (KM 12 to KM 42)',
      startKm: 12.0,
      endKm: 42.0,
      region: 'North Sector National Highway',
    },
  });

  const section2 = await prisma.highwaySection.create({
    data: {
      sectionCode: 'SEC-BYPASS-02',
      name: 'Eastern Bypass Arterial Link (KM 0 to KM 18)',
      startKm: 0.0,
      endKm: 18.0,
      region: 'East Ring Radial Sector',
    },
  });

  // 4. Four Distinct Lanes for Section 1
  const laneL01 = await prisma.lane.create({
    data: {
      laneCode: 'L01',
      name: 'Highway Left',
      category: 'HIGHWAY_LEFT',
      highwaySectionId: section1.id,
      supervisorId: supervisor1.id,
      direction: 'Northbound',
      status: 'IN_PROGRESS',
    },
  });

  const laneL02 = await prisma.lane.create({
    data: {
      laneCode: 'L02',
      name: 'Highway Right',
      category: 'HIGHWAY_RIGHT',
      highwaySectionId: section1.id,
      supervisorId: supervisor1.id,
      direction: 'Northbound',
      status: 'IN_PROGRESS',
    },
  });

  const laneL03 = await prisma.lane.create({
    data: {
      laneCode: 'L03',
      name: 'Service Road Left',
      category: 'SERVICE_ROAD_LEFT',
      highwaySectionId: section1.id,
      supervisorId: supervisor2.id,
      direction: 'Northbound',
      status: 'IDLE',
    },
  });

  const laneL04 = await prisma.lane.create({
    data: {
      laneCode: 'L04',
      name: 'Service Road Right',
      category: 'SERVICE_ROAD_RIGHT',
      highwaySectionId: section1.id,
      supervisorId: supervisor2.id,
      direction: 'Northbound',
      status: 'COMPLETED',
    },
  });

  // 5. Hubs with GPS Coordinates
  const hub1 = await prisma.hub.create({
    data: {
      hubCode: 'HUB-01',
      name: 'North Toll Plaza Hub Station',
      physicalAddress: 'NH-48 Km 14.2 Toll Plaza Administration Wing, Gurugram',
      latitude: 28.4595,
      longitude: 77.0266,
      geofenceRadiusM: 500.0,
      highwaySectionId: section1.id,
      operatorUserId: hubOpUser1.id,
      isActive: true,
    },
  });

  const hub2 = await prisma.hub.create({
    data: {
      hubCode: 'HUB-02',
      name: 'Junction 14 Central Operations Facility',
      physicalAddress: 'NH-48 Km 22.8 Rajiv Chowk Maintenance Yard',
      latitude: 28.4211,
      longitude: 76.9982,
      geofenceRadiusM: 600.0,
      highwaySectionId: section1.id,
      operatorUserId: hubOpUser2.id,
      isActive: true,
    },
  });

  const hub3 = await prisma.hub.create({
    data: {
      hubCode: 'HUB-03',
      name: 'South Interchange Logistics Depot',
      physicalAddress: 'NH-48 Km 38.5 Manesar Industrial Interchange Base',
      latitude: 28.3742,
      longitude: 76.9415,
      geofenceRadiusM: 500.0,
      highwaySectionId: section1.id,
      isActive: true,
    },
  });

  // 6. Assignments & Tasks for Today
  const todayStr = new Date().toISOString().split('T')[0];

  // Assignment 1: Worker 1 on Lane L01 (Work in progress)
  const assign1 = await prisma.workerAssignment.create({
    data: {
      employeeId: workers[0].employee.id,
      laneId: laneL01.id,
      shiftId: shiftMorning.id,
      supervisorId: supervisor1.id,
      date: todayStr,
      status: 'ACTIVE',
    },
  });

  const task1 = await prisma.cleaningTask.create({
    data: {
      assignmentId: assign1.id,
      employeeId: workers[0].employee.id,
      laneId: laneL01.id,
      shiftId: shiftMorning.id,
      title: 'Lane L01 Highway Left Median Shoulder Sweep KM 12 - 16',
      description: 'Clear heavy vehicle tire fragments, plastic bottles, and accumulated grit along the high-speed median barrier.',
      targetKmStart: 12.0,
      targetKmEnd: 16.0,
      status: 'IN_PROGRESS',
      startTime: new Date(Date.now() - 3600000 * 2), // 2 hours ago
    },
  });

  await prisma.taskEvidence.create({
    data: {
      taskId: task1.id,
      type: 'BEFORE_PHOTO',
      imageUrl: '/uploads/sample-before-1.jpg',
      latitude: 28.4590,
      longitude: 77.0260,
      caption: 'Initial debris condition along Km 12.4 median divider.',
    },
  });

  // Assignment 2: Worker 2 on Lane L02 (Work completed, ready to travel to Hub 01 & scan QR!)
  const assign2 = await prisma.workerAssignment.create({
    data: {
      employeeId: workers[1].employee.id,
      laneId: laneL02.id,
      shiftId: shiftMorning.id,
      supervisorId: supervisor1.id,
      date: todayStr,
      status: 'ACTIVE',
    },
  });

  const task2 = await prisma.cleaningTask.create({
    data: {
      assignmentId: assign2.id,
      employeeId: workers[1].employee.id,
      laneId: laneL02.id,
      shiftId: shiftMorning.id,
      title: 'Lane L02 Highway Right Outer Drainage Trench Sweep KM 14 - 18',
      description: 'Litter removal, brush clearance and storm drain grating check on the right outer side.',
      targetKmStart: 14.0,
      targetKmEnd: 18.0,
      status: 'COMPLETED',
      startTime: new Date(Date.now() - 3600000 * 3.5),
      completionTime: new Date(Date.now() - 1800000), // 30 min ago
      remarks: 'All 4km swept clean. Storm drain covers cleared of leaves and gravel.',
    },
  });

  await prisma.taskEvidence.create({
    data: {
      taskId: task2.id,
      type: 'BEFORE_PHOTO',
      imageUrl: '/uploads/sample-before-2.jpg',
      latitude: 28.4550,
      longitude: 77.0220,
      caption: 'Trash pile and roadside discarded tires.',
    },
  });

  await prisma.taskEvidence.create({
    data: {
      taskId: task2.id,
      type: 'AFTER_PHOTO',
      imageUrl: '/uploads/sample-after-2.jpg',
      latitude: 28.4552,
      longitude: 77.0222,
      caption: 'Cleaned asphalt and clear storm drainage grates.',
    },
  });

  // Assignment 3: Worker 3 on Lane L03 (Pending start)
  const assign3 = await prisma.workerAssignment.create({
    data: {
      employeeId: workers[2].employee.id,
      laneId: laneL03.id,
      shiftId: shiftAfternoon.id,
      supervisorId: supervisor2.id,
      date: todayStr,
      status: 'ASSIGNED',
    },
  });

  await prisma.cleaningTask.create({
    data: {
      assignmentId: assign3.id,
      employeeId: workers[2].employee.id,
      laneId: laneL03.id,
      shiftId: shiftAfternoon.id,
      title: 'Lane L03 Service Road Left Commercial Sweep KM 18 - 22',
      targetKmStart: 18.0,
      targetKmEnd: 22.0,
      status: 'PENDING',
    },
  });

  // Assignment 4: Worker 4 on Lane L04 (Completed & verified attendance at Hub 01)
  const assign4 = await prisma.workerAssignment.create({
    data: {
      employeeId: workers[3].employee.id,
      laneId: laneL04.id,
      shiftId: shiftMorning.id,
      supervisorId: supervisor2.id,
      date: todayStr,
      status: 'COMPLETED',
    },
  });

  const task4 = await prisma.cleaningTask.create({
    data: {
      assignmentId: assign4.id,
      employeeId: workers[3].employee.id,
      laneId: laneL04.id,
      shiftId: shiftMorning.id,
      title: 'Lane L04 Service Road Right Walkway Wash KM 12 - 15',
      targetKmStart: 12.0,
      targetKmEnd: 15.0,
      status: 'VERIFIED',
      startTime: new Date(Date.now() - 3600000 * 5),
      completionTime: new Date(Date.now() - 3600000 * 2),
      remarks: 'Walkway washed and swept completely.',
    },
  });

  const attendanceRec4 = await prisma.attendanceRecord.create({
    data: {
      employeeId: workers[3].employee.id,
      hubId: hub1.id,
      taskId: task4.id,
      date: todayStr,
      status: 'ATTENDANCE_VERIFIED',
      verifiedAt: new Date(Date.now() - 3600000 * 1.8),
      hubDistanceMeters: 45.2,
      qrTokenUsed: 'TOKEN-SEED-VERIFIED-001',
    },
  });

  await prisma.locationVerification.create({
    data: {
      attendanceRecordId: attendanceRec4.id,
      workerLatitude: 28.4594,
      workerLongitude: 77.0267,
      hubLatitude: hub1.latitude,
      hubLongitude: hub1.longitude,
      calculatedDistanceM: 45.2,
      allowedRadiusM: 500.0,
      isWithinRadius: true,
      accuracyMeters: 8.5,
    },
  });

  await prisma.attendanceEvent.create({
    data: {
      attendanceRecordId: attendanceRec4.id,
      employeeId: workers[3].employee.id,
      hubId: hub1.id,
      eventType: 'ATTENDANCE_CONFIRMED',
      payload: JSON.stringify({ hubCode: hub1.hubCode, distanceMeters: 45.2 }),
    },
  });

  // Assignment 5: Worker 5 - Exception pending supervisor approval
  const assign5 = await prisma.workerAssignment.create({
    data: {
      employeeId: workers[4].employee.id,
      laneId: laneL01.id,
      shiftId: shiftMorning.id,
      supervisorId: supervisor1.id,
      date: todayStr,
      status: 'ACTIVE',
    },
  });

  const task5 = await prisma.cleaningTask.create({
    data: {
      assignmentId: assign5.id,
      employeeId: workers[4].employee.id,
      laneId: laneL01.id,
      shiftId: shiftMorning.id,
      title: 'Lane L01 Highway Left Median Km 22 - 25 Rapid Scrub',
      targetKmStart: 22.0,
      targetKmEnd: 25.0,
      status: 'COMPLETED',
      startTime: new Date(Date.now() - 3600000 * 4),
      completionTime: new Date(Date.now() - 3600000 * 1),
    },
  });

  await prisma.attendanceRecord.create({
    data: {
      employeeId: workers[4].employee.id,
      hubId: hub2.id,
      taskId: task5.id,
      date: todayStr,
      status: 'PENDING_SUPERVISOR_APPROVAL',
      rejectionReason: 'Worker mobile GPS hardware reported poor satellite lock (>800m offset). Supervisor physical confirmation requested.',
    },
  });

  // 7. Seed Sample Audit Logs
  await prisma.auditLog.createMany({
    data: [
      {
        userId: adminUser.id,
        action: 'SYSTEM_INITIALIZED',
        entityType: 'SYSTEM',
        details: JSON.stringify({ version: '1.0.0', lanesInitialized: 4 }),
      },
      {
        userId: opsAdminUser.id,
        action: 'SHIFT_SCHEDULE_PUBLISHED',
        entityType: 'SHIFT',
        details: JSON.stringify({ shiftCode: 'SHIFT-M', workersCount: 4 }),
      },
      {
        userId: supUser1.id,
        action: 'TASK_VERIFIED',
        entityType: 'CLEANING_TASK',
        entityId: task4.id,
        details: JSON.stringify({ laneCode: 'L04', result: 'APPROVED' }),
      },
    ],
  });

  console.log('Database seeded successfully with enterprise highway cleaning records!');
  console.log('Logins available:');
  console.log(' - Super Admin: admin@highway.gov (password: password123)');
  console.log(' - Operations Admin: ops@highway.gov (password: password123)');
  console.log(' - Supervisor: supervisor1@highway.gov (password: password123)');
  console.log(' - Hub Operator: hubop1@highway.gov (password: password123)');
  console.log(' - Field Worker (Work in Progress): worker1@highway.gov (password: password123)');
  console.log(' - Field Worker (Work Completed - Ready to Scan QR!): worker2@highway.gov (password: password123)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
