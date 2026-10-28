import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRevisitBridge, readStudyQuery } from '../study/revisit';

describe('reVISit WebsiteComponent bridge', () => {
  const originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
  const postMessage = vi.fn();
  const host = { postMessage } as unknown as Window;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    postMessage.mockClear();
    history.replaceState({}, '', '/?id=trial-frame');
    Object.defineProperty(window, 'parent', { configurable: true, value: host });
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    if (originalParent) Object.defineProperty(window, 'parent', originalParent);
    history.replaceState({}, '', '/');
  });
  const sendParameters = (overrides: MessageEventInit = {}) => {
    window.dispatchEvent(
      new MessageEvent('message', {
        source: host,
        origin: window.location.origin,
        data: {
          type: '@REVISIT_COMMS/STUDY_DATA',
          iframeId: 'trial-frame',
          message: { scenario: 'conflict', technique: 'bar', assigned: true },
        },
        ...overrides,
      }),
    );
  };

  it('handshakes using the official protocol and sends only completed trials', () => {
    const onStudyData = vi.fn();
    const bridge = createRevisitBridge({ onStudyData });
    cleanup = bridge.destroy;
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: '@REVISIT_COMMS/WINDOW_READY', iframeId: 'trial-frame' }),
      window.location.origin,
    );
    expect(bridge.sendAnswer({ completion: true })).toBe(false);
    sendParameters();
    expect(onStudyData).toHaveBeenCalledWith({
      scenario: 'conflict',
      technique: 'bar',
      assigned: true,
    });
    expect(bridge.connected).toBe(true);
    expect(bridge.sendAnswer({ completion: false })).toBe(false);
    const record = { answer: 'Source A', elapsedMs: 4200, completion: true };
    expect(bridge.sendAnswer(record)).toBe(true);
    expect(postMessage).toHaveBeenLastCalledWith(
      {
        error: false,
        type: '@REVISIT_COMMS/ANSWERS',
        iframeId: 'trial-frame',
        message: { avrTrial: JSON.stringify(record) },
      },
      window.location.origin,
    );
  });

  it('ignores other origins, windows and frame IDs and detaches on destroy', () => {
    const onStudyData = vi.fn();
    const bridge = createRevisitBridge({ onStudyData });
    cleanup = bridge.destroy;
    sendParameters({ origin: 'https://unrelated.example' });
    sendParameters({ source: window });
    sendParameters({ data: { type: '@REVISIT_COMMS/STUDY_DATA', iframeId: 'another-frame' } });
    window.dispatchEvent(new MessageEvent('message', { source: host, data: null }));
    expect(onStudyData).not.toHaveBeenCalled();
    expect(bridge.connected).toBe(false);
    bridge.destroy();
    sendParameters();
    expect(onStudyData).not.toHaveBeenCalled();
    expect(bridge.sendAnswer({ completion: true })).toBe(false);
  });

  it('does not claim a standalone preview is connected', () => {
    Object.defineProperty(window, 'parent', { configurable: true, value: window });
    const bridge = createRevisitBridge({ onStudyData: vi.fn() });
    cleanup = bridge.destroy;
    expect(postMessage).not.toHaveBeenCalled();
    expect(bridge.connected).toBe(false);
    expect(bridge.sendAnswer({ completion: true })).toBe(false);
  });
});

describe('study preview query', () => {
  it('accepts known scenarios and defaults to assigned mode', () => {
    expect(readStudyQuery('').assigned).toBe(true);
    expect(readStudyQuery('?scenario=conflict&technique=bar&assigned=1')).toEqual({
      scenario: 'conflict',
      technique: 'bar',
      assigned: true,
    });
    expect(readStudyQuery('?scenario=unknown&assigned=false')).toEqual({
      scenario: undefined,
      technique: undefined,
      assigned: false,
    });
  });
});
