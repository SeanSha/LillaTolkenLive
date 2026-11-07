import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import { sessionMachine } from './sessionMachine';

describe('classroom session machine', () => {
  it('moves from permission to streaming and releases on stop', () => {
    const actor = createActor(sessionMachine);
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PERMISSION_GRANTED' });
    actor.send({ type: 'CONNECTED' });
    expect(actor.getSnapshot().value).toBe('streaming');
    actor.send({ type: 'STOP' });
    expect(actor.getSnapshot().value).toBe('stopping');
    actor.send({ type: 'STOPPED' });
    expect(actor.getSnapshot().value).toBe('stopped');
    actor.stop();
  });

  it('allows two reconnects and then fails closed', () => {
    const actor = createActor(sessionMachine);
    actor.start();
    reachStreaming(actor);
    actor.send({ type: 'INTERRUPT' });
    expect(actor.getSnapshot().value).toBe('reconnecting');
    expect(actor.getSnapshot().context.reconnectionAttempts).toBe(1);
    actor.send({ type: 'CONNECTED' });
    actor.send({ type: 'INTERRUPT' });
    actor.send({ type: 'CONNECTED' });
    actor.send({ type: 'INTERRUPT' });
    expect(actor.getSnapshot().value).toBe('error');
    expect(actor.getSnapshot().context.errorCode).toBe('reconnect_failed');
    actor.stop();
  });

  it('records a permission failure and can retry', () => {
    const actor = createActor(sessionMachine);
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'FAIL', code: 'mic_denied', message: 'denied' });
    expect(actor.getSnapshot().context.errorCode).toBe('mic_denied');
    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('requestingPermission');
    expect(actor.getSnapshot().context.errorCode).toBeNull();
    actor.stop();
  });
});

function reachStreaming(actor: ReturnType<typeof createActor<typeof sessionMachine>>) {
  actor.send({ type: 'START' });
  actor.send({ type: 'PERMISSION_GRANTED' });
  actor.send({ type: 'CONNECTED' });
}
