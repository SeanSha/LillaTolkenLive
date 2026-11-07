import {
  MAX_CLASSROOM_STUDENTS,
  generateClassroomCode,
  normalizeTargetLanguage,
  parseClientMessage,
  redactSecrets,
  tailText,
  type ServerMessage,
  type SignalPayload,
} from '@lilla/shared';
import { randomInt, randomUUID } from 'node:crypto';
import { WebSocket, type RawData } from 'ws';

type Role = 'unknown' | 'teacher' | 'student';

type Connection = {
  id: string;
  socket: WebSocket;
  role: Role;
  classroomId?: string;
};

type Classroom = {
  id: string;
  code: string;
  targetLanguage: string;
  teacher: Connection | null;
  students: Map<string, Connection>;
  transcript: string;
  phase: string;
  connectionState: string;
};

export class ClassroomManager {
  private readonly classrooms = new Map<string, Classroom>();
  private readonly codes = new Map<string, string>();
  private readonly connections = new Map<WebSocket, Connection>();

  handleConnection(socket: WebSocket): void {
    const connection: Connection = { id: randomUUID(), socket, role: 'unknown' };
    this.connections.set(socket, connection);
    this.send(socket, { type: 'welcome', participantId: connection.id });

    socket.on('message', (data) => {
      try {
        this.onMessage(connection, data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected signaling error.';
        console.error(redactSecrets(message));
        this.send(connection.socket, {
          type: 'error',
          code: 'unknown',
          message: 'Unexpected signaling error.',
        });
      }
    });
    socket.on('close', () => {
      this.onClose(connection);
    });
  }

  private onMessage(connection: Connection, data: RawData): void {
    const raw = rawDataToString(data);
    if (raw.length > 120_000) {
      this.send(connection.socket, {
        type: 'error',
        code: 'invalid_message',
        message: 'Signaling message is too large.',
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.send(connection.socket, {
        type: 'error',
        code: 'invalid_message',
        message: 'Signaling message must be JSON.',
      });
      return;
    }

    const message = parseClientMessage(parsed);
    if (!message) {
      this.send(connection.socket, {
        type: 'error',
        code: 'invalid_message',
        message: 'Signaling message was not understood.',
      });
      return;
    }

    switch (message.type) {
      case 'teacher.create':
        this.createClassroom(connection, message.targetLanguage);
        break;
      case 'teacher.end':
        this.endOwnedClassroom(connection, 'teacher_ended');
        break;
      case 'teacher.health':
        this.updateHealth(connection, message.phase, message.connectionState, message.targetLanguage);
        break;
      case 'student.join':
        this.joinClassroom(connection, message.code);
        break;
      case 'student.leave':
        this.leaveClassroom(connection);
        break;
      case 'signal':
        this.relaySignal(connection, message.to, message.payload);
        break;
      case 'transcript.snapshot':
        this.updateTranscript(connection, message.text);
        break;
      default:
        break;
    }
  }

  private createClassroom(connection: Connection, targetLanguage: string): void {
    if (connection.role !== 'unknown') {
      this.send(connection.socket, {
        type: 'error',
        code: 'invalid_message',
        message: 'This connection already belongs to a classroom.',
      });
      return;
    }

    let language: string;
    try {
      language = normalizeTargetLanguage(targetLanguage);
    } catch (error) {
      this.send(connection.socket, {
        type: 'error',
        code: 'invalid_language',
        message: error instanceof Error ? error.message : 'Invalid target language.',
      });
      return;
    }

    const classroom: Classroom = {
      id: randomUUID(),
      code: this.freshCode(),
      targetLanguage: language,
      teacher: connection,
      students: new Map(),
      transcript: '',
      phase: 'idle',
      connectionState: 'new',
    };
    connection.role = 'teacher';
    connection.classroomId = classroom.id;
    this.classrooms.set(classroom.id, classroom);
    this.codes.set(classroom.code, classroom.id);
    this.send(connection.socket, {
      type: 'classroom.created',
      classroomId: classroom.id,
      code: classroom.code,
      participantId: connection.id,
    });
    this.sendPresence(classroom);
  }

  private joinClassroom(connection: Connection, code: string): void {
    if (connection.role !== 'unknown') {
      this.send(connection.socket, {
        type: 'error',
        code: 'invalid_message',
        message: 'Leave the current classroom before joining another.',
      });
      return;
    }

    const classroom = this.classrooms.get(this.codes.get(code) ?? '');
    if (!classroom || !classroom.teacher) {
      this.send(connection.socket, {
        type: 'error',
        code: 'unknown_classroom',
        message: 'That classroom code is not active.',
      });
      return;
    }
    if (classroom.students.size >= MAX_CLASSROOM_STUDENTS) {
      this.send(connection.socket, {
        type: 'error',
        code: 'classroom_full',
        message: 'This classroom is full.',
      });
      return;
    }

    connection.role = 'student';
    connection.classroomId = classroom.id;
    classroom.students.set(connection.id, connection);
    this.send(connection.socket, {
      type: 'classroom.joined',
      classroomId: classroom.id,
      code: classroom.code,
      participantId: connection.id,
      targetLanguage: classroom.targetLanguage,
      transcript: classroom.transcript,
    });
    this.send(classroom.teacher.socket, { type: 'student.announce', studentId: connection.id });
    this.sendPresence(classroom);
  }

  private updateHealth(
    connection: Connection,
    phase: string,
    connectionState: string,
    targetLanguage?: string,
  ): void {
    const classroom = this.ownedClassroom(connection, 'teacher');
    if (!classroom) {
      return;
    }
    if (targetLanguage) {
      try {
        classroom.targetLanguage = normalizeTargetLanguage(targetLanguage);
      } catch {
        this.send(connection.socket, {
          type: 'error',
          code: 'invalid_language',
          message: 'Target language is not supported.',
        });
        return;
      }
    }
    classroom.phase = phase;
    classroom.connectionState = connectionState;
    this.sendPresence(classroom);
  }

  private updateTranscript(connection: Connection, text: string): void {
    const classroom = this.ownedClassroom(connection, 'teacher');
    if (!classroom) {
      return;
    }
    classroom.transcript = tailText(text);
    for (const student of classroom.students.values()) {
      this.send(student.socket, { type: 'transcript', text: classroom.transcript });
    }
  }

  private relaySignal(connection: Connection, to: string, payload: SignalPayload): void {
    const classroom = connection.classroomId ? this.classrooms.get(connection.classroomId) : undefined;
    if (!classroom) {
      return;
    }

    if (connection.role === 'teacher') {
      const student = classroom.students.get(to);
      if (!student) {
        return;
      }
      this.send(student.socket, { type: 'signal', from: connection.id, payload });
      return;
    }

    if (connection.role === 'student' && classroom.teacher && to === classroom.teacher.id) {
      this.send(classroom.teacher.socket, { type: 'signal', from: connection.id, payload });
    }
  }

  private leaveClassroom(connection: Connection): void {
    if (connection.role === 'teacher') {
      this.endOwnedClassroom(connection, 'teacher_ended');
      return;
    }
    this.detachStudent(connection, true);
  }

  private endOwnedClassroom(connection: Connection, reason: string): void {
    const classroom = this.ownedClassroom(connection, 'teacher');
    if (!classroom) {
      return;
    }
    this.closeClassroom(classroom, reason);
  }

  private onClose(connection: Connection): void {
    this.connections.delete(connection.socket);
    if (connection.role === 'teacher') {
      const classroom = connection.classroomId ? this.classrooms.get(connection.classroomId) : undefined;
      if (classroom) {
        this.closeClassroom(classroom, 'teacher_disconnected');
      }
      return;
    }
    this.detachStudent(connection, true);
  }

  private detachStudent(connection: Connection, notify: boolean): void {
    const classroom = connection.classroomId ? this.classrooms.get(connection.classroomId) : undefined;
    connection.role = 'unknown';
    connection.classroomId = undefined;
    if (!classroom) {
      return;
    }
    classroom.students.delete(connection.id);
    if (notify && classroom.teacher) {
      this.send(classroom.teacher.socket, { type: 'student.left', studentId: connection.id });
      this.sendPresence(classroom);
    }
  }

  private closeClassroom(classroom: Classroom, reason: string): void {
    this.classrooms.delete(classroom.id);
    this.codes.delete(classroom.code);
    const members = [classroom.teacher, ...classroom.students.values()].filter(
      (member): member is Connection => Boolean(member),
    );
    for (const member of members) {
      member.role = 'unknown';
      member.classroomId = undefined;
      this.send(member.socket, { type: 'classroom.ended', reason });
    }
    classroom.teacher = null;
    classroom.students.clear();
  }

  private ownedClassroom(connection: Connection, role: Role): Classroom | undefined {
    if (connection.role !== role || !connection.classroomId) {
      return undefined;
    }
    return this.classrooms.get(connection.classroomId);
  }

  private sendPresence(classroom: Classroom): void {
    const message: ServerMessage = {
      type: 'presence',
      studentCount: classroom.students.size,
      teacherConnected: Boolean(classroom.teacher),
      phase: classroom.phase,
      connectionState: classroom.connectionState,
      targetLanguage: classroom.targetLanguage,
    };
    if (classroom.teacher) {
      this.send(classroom.teacher.socket, message);
    }
    for (const student of classroom.students.values()) {
      this.send(student.socket, message);
    }
  }

  private freshCode(): string {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateClassroomCode((max) => randomInt(0, max));
      if (!this.codes.has(code)) {
        return code;
      }
    }
    throw new Error('Could not allocate a classroom code.');
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(message));
  }
}

function rawDataToString(data: RawData): string {
  if (typeof data === 'string') {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  return data.toString('utf8');
}
