import { assign, setup } from 'xstate';

export const MAX_RECONNECTS = 2;

export type SessionPhase =
  | 'idle'
  | 'requestingPermission'
  | 'connecting'
  | 'streaming'
  | 'reconnecting'
  | 'stopping'
  | 'stopped'
  | 'error';

export type SessionMachineEvent =
  | { type: 'START' }
  | { type: 'PERMISSION_GRANTED' }
  | { type: 'CONNECTED' }
  | { type: 'INTERRUPT' }
  | { type: 'STOP' }
  | { type: 'STOPPED' }
  | { type: 'RETRY' }
  | { type: 'RESET' }
  | { type: 'FAIL'; code: string; message: string };

export type SessionMachineContext = {
  errorCode: string | null;
  errorMessage: string | null;
  reconnectionAttempts: number;
};

export const sessionMachine = setup({
  types: {
    context: {} as SessionMachineContext,
    events: {} as SessionMachineEvent,
  },
  guards: {
    canReconnect: ({ context }) => context.reconnectionAttempts < MAX_RECONNECTS,
  },
  actions: {
    clearError: assign({ errorCode: null, errorMessage: null }),
    resetReconnects: assign({ reconnectionAttempts: 0 }),
    countReconnect: assign({
      reconnectionAttempts: ({ context }) => context.reconnectionAttempts + 1,
    }),
    assignFailure: assign({
      errorCode: ({ event }) => (event.type === 'FAIL' ? event.code : 'unknown'),
      errorMessage: ({ event }) => (event.type === 'FAIL' ? event.message : 'Unknown error'),
    }),
    assignReconnectExhausted: assign({
      errorCode: 'reconnect_failed',
      errorMessage: 'The translation connection could not be restored.',
    }),
  },
}).createMachine({
  id: 'classroomSession',
  initial: 'idle',
  context: {
    errorCode: null,
    errorMessage: null,
    reconnectionAttempts: 0,
  },
  states: {
    idle: {
      on: {
        START: { target: 'requestingPermission', actions: ['clearError', 'resetReconnects'] },
      },
    },
    requestingPermission: {
      on: {
        PERMISSION_GRANTED: 'connecting',
        FAIL: { target: 'error', actions: 'assignFailure' },
        STOP: 'stopping',
      },
    },
    connecting: {
      on: {
        CONNECTED: 'streaming',
        FAIL: { target: 'error', actions: 'assignFailure' },
        STOP: 'stopping',
      },
    },
    streaming: {
      on: {
        INTERRUPT: [
          { guard: 'canReconnect', target: 'reconnecting' },
          { target: 'error', actions: 'assignReconnectExhausted' },
        ],
        FAIL: { target: 'error', actions: 'assignFailure' },
        STOP: 'stopping',
      },
    },
    reconnecting: {
      entry: 'countReconnect',
      on: {
        CONNECTED: 'streaming',
        FAIL: { target: 'error', actions: 'assignFailure' },
        STOP: 'stopping',
      },
    },
    stopping: {
      on: { STOPPED: 'stopped' },
    },
    stopped: {
      on: {
        START: { target: 'requestingPermission', actions: ['clearError', 'resetReconnects'] },
        RESET: 'idle',
      },
    },
    error: {
      on: {
        RETRY: { target: 'requestingPermission', actions: ['clearError', 'resetReconnects'] },
        RESET: { target: 'idle', actions: 'clearError' },
      },
    },
  },
});
