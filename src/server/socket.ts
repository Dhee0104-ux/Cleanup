import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import CONFIG from '../config.js';

let io: SocketIOServer | null = null;

export function initSocketIO(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*', // Allow client connections
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    // Client joins role-based or entity-based channels
    socket.on('join', (room: string) => {
      socket.join(room);
    });

    socket.on('leave', (room: string) => {
      socket.leave(room);
    });

    socket.on('disconnect', () => {
      // Disconnection handled cleanly
    });
  });

  return io;
}

export function getSocketIO(): SocketIOServer | null {
  return io;
}

/**
 * Real-time event broadcasting helpers
 */
export const realTime = {
  // Broadcast check-in event to dashboard and the target hub room
  emitAttendanceCheckIn(payload: {
    recordId: string;
    employeeName: string;
    employeeCode: string;
    hubId: string;
    hubName: string;
    laneCode: string;
    laneName: string;
    status: string;
    timestamp: string;
  }) {
    if (!io) return;
    io.to('dashboard').emit('attendance:new', payload);
    io.to(`hub:${payload.hubId}`).emit('hub:scan_received', payload);
  },

  // Broadcast task progress changes to supervisor and admin dashboard
  emitTaskUpdate(payload: {
    taskId: string;
    employeeId: string;
    employeeName: string;
    laneCode: string;
    laneName: string;
    status: string;
    hasObstruction?: boolean;
    updatedAt: string;
  }) {
    if (!io) return;
    io.to('dashboard').emit('task:updated', payload);
    io.to('supervisors').emit('task:updated', payload);
    io.to(`worker:${payload.employeeId}`).emit('task:status_changed', payload);
  },

  // Broadcast lane status changes
  emitLaneStatusChange(payload: {
    laneId: string;
    laneCode: string;
    status: string;
    activeWorkersCount: number;
  }) {
    if (!io) return;
    io.to('dashboard').emit('lane:status_changed', payload);
  },

  // Broadcast supervisor review decision to worker
  emitVerificationDecision(payload: {
    taskId: string;
    employeeId: string;
    status: string;
    isApproved: boolean;
    reviewNotes?: string;
  }) {
    if (!io) return;
    io.to(`worker:${payload.employeeId}`).emit('task:verified', payload);
    io.to('dashboard').emit('task:verified', payload);
  },

  // Broadcast dispatch / assignment update to dashboard, supervisors, and worker
  emitAssignmentUpdate(payload: {
    assignmentId: string;
    employeeId: string;
    laneCode: string;
    shiftCode: string;
    status: string;
    action: 'DISPATCHED' | 'REASSIGNED' | 'CANCELLED';
    timestamp: string;
  }) {
    if (!io) return;
    io.to('dashboard').emit('assignment:updated', payload);
    io.to('supervisors').emit('assignment:updated', payload);
    io.to(`worker:${payload.employeeId}`).emit('assignment:updated', payload);
  },

  // Broadcast dynamic QR rotation tick to hub operator screen
  emitQrRefresh(hubId: string, payload: {
    expiresAt: string;
    secondsRemaining: number;
    tokenString: string;
  }) {
    if (!io) return;
    io.to(`hub:${hubId}`).emit('hub:qr_rotated', payload);
  }
};
