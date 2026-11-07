import { isClassroomCode, normalizeClassroomCode } from './classroomCode.js';
import type { InputProfile } from './languages.js';

export type SignalPayload =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: Record<string, unknown> | null };

export type ClientMessage =
  | { type: 'teacher.create'; targetLanguage: string; inputProfile?: InputProfile }
  | { type: 'teacher.end' }
  | { type: 'teacher.health'; phase: string; connectionState: string; targetLanguage?: string }
  | { type: 'student.join'; code: string }
  | { type: 'student.leave' }
  | { type: 'signal'; to: string; payload: SignalPayload }
  | { type: 'transcript.snapshot'; text: string };

export type ServerMessage =
  | { type: 'welcome'; participantId: string }
  | { type: 'classroom.created'; classroomId: string; code: string; participantId: string }
  | {
      type: 'classroom.joined';
      classroomId: string;
      code: string;
      participantId: string;
      targetLanguage: string;
      transcript: string;
    }
  | {
      type: 'presence';
      studentCount: number;
      teacherConnected: boolean;
      phase: string;
      connectionState: string;
      targetLanguage: string;
    }
  | { type: 'student.announce'; studentId: string }
  | { type: 'student.left'; studentId: string }
  | { type: 'signal'; from: string; payload: SignalPayload }
  | { type: 'transcript'; text: string }
  | { type: 'classroom.ended'; reason: string }
  | { type: 'error'; code: string; message: string };

const MAX_SDP_CHARS = 20_000;
const MAX_PHASE_CHARS = 40;

export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  switch (value.type) {
    case 'teacher.create': {
      if (typeof value.targetLanguage !== 'string') {
        return null;
      }
      const inputProfile = value.inputProfile;
      if (inputProfile !== undefined && inputProfile !== 'microphone' && inputProfile !== 'tab') {
        return null;
      }
      return {
        type: 'teacher.create',
        targetLanguage: value.targetLanguage,
        inputProfile,
      };
    }
    case 'teacher.end':
      return { type: 'teacher.end' };
    case 'teacher.health': {
      if (typeof value.phase !== 'string' || typeof value.connectionState !== 'string') {
        return null;
      }
      if (value.targetLanguage !== undefined && typeof value.targetLanguage !== 'string') {
        return null;
      }
      return {
        type: 'teacher.health',
        phase: value.phase.slice(0, MAX_PHASE_CHARS),
        connectionState: value.connectionState.slice(0, MAX_PHASE_CHARS),
        targetLanguage: typeof value.targetLanguage === 'string' ? value.targetLanguage : undefined,
      };
    }
    case 'student.join': {
      if (typeof value.code !== 'string') {
        return null;
      }
      const code = normalizeClassroomCode(value.code);
      if (!isClassroomCode(code)) {
        return null;
      }
      return { type: 'student.join', code };
    }
    case 'student.leave':
      return { type: 'student.leave' };
    case 'signal': {
      if (typeof value.to !== 'string' || value.to.length < 8 || value.to.length > 80) {
        return null;
      }
      const payload = parseSignal(value.payload);
      if (!payload) {
        return null;
      }
      return { type: 'signal', to: value.to, payload };
    }
    case 'transcript.snapshot':
      if (typeof value.text !== 'string') {
        return null;
      }
      return { type: 'transcript.snapshot', text: value.text };
    default:
      return null;
  }
}

export function parseServerMessage(value: unknown): ServerMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  switch (value.type) {
    case 'welcome':
      return typeof value.participantId === 'string'
        ? { type: 'welcome', participantId: value.participantId }
        : null;
    case 'classroom.created':
      return typeof value.classroomId === 'string' &&
        typeof value.code === 'string' &&
        typeof value.participantId === 'string'
        ? {
            type: 'classroom.created',
            classroomId: value.classroomId,
            code: value.code,
            participantId: value.participantId,
          }
        : null;
    case 'classroom.joined':
      return typeof value.classroomId === 'string' &&
        typeof value.code === 'string' &&
        typeof value.participantId === 'string' &&
        typeof value.targetLanguage === 'string' &&
        typeof value.transcript === 'string'
        ? {
            type: 'classroom.joined',
            classroomId: value.classroomId,
            code: value.code,
            participantId: value.participantId,
            targetLanguage: value.targetLanguage,
            transcript: value.transcript,
          }
        : null;
    case 'presence':
      return typeof value.studentCount === 'number' &&
        typeof value.teacherConnected === 'boolean' &&
        typeof value.phase === 'string' &&
        typeof value.connectionState === 'string' &&
        typeof value.targetLanguage === 'string'
        ? {
            type: 'presence',
            studentCount: value.studentCount,
            teacherConnected: value.teacherConnected,
            phase: value.phase,
            connectionState: value.connectionState,
            targetLanguage: value.targetLanguage,
          }
        : null;
    case 'student.announce':
      return typeof value.studentId === 'string'
        ? { type: 'student.announce', studentId: value.studentId }
        : null;
    case 'student.left':
      return typeof value.studentId === 'string'
        ? { type: 'student.left', studentId: value.studentId }
        : null;
    case 'signal': {
      const payload = parseSignal(value.payload);
      return typeof value.from === 'string' && payload
        ? { type: 'signal', from: value.from, payload }
        : null;
    }
    case 'transcript':
      return typeof value.text === 'string' ? { type: 'transcript', text: value.text } : null;
    case 'classroom.ended':
      return typeof value.reason === 'string' ? { type: 'classroom.ended', reason: value.reason } : null;
    case 'error':
      return typeof value.code === 'string' && typeof value.message === 'string'
        ? { type: 'error', code: value.code, message: value.message }
        : null;
    default:
      return null;
  }
}

function parseSignal(value: unknown): SignalPayload | null {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return null;
  }
  if ((value.kind === 'offer' || value.kind === 'answer') && typeof value.sdp === 'string') {
    if (value.sdp.length === 0 || value.sdp.length > MAX_SDP_CHARS) {
      return null;
    }
    return value.kind === 'offer'
      ? { kind: 'offer', sdp: value.sdp }
      : { kind: 'answer', sdp: value.sdp };
  }
  if (value.kind === 'ice') {
    if (value.candidate === null) {
      return { kind: 'ice', candidate: null };
    }
    if (isRecord(value.candidate)) {
      return { kind: 'ice', candidate: value.candidate };
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
