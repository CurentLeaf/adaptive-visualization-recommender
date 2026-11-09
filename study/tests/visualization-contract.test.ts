import { describe, expect, it, vi } from 'vitest';
import { createVisualizationHandshake, parseVisualizationParams } from '../src/visualizationContract';

const validParams = {
  contractVersion: 1, trialId: 'conflict-A-recommended', scenarioFamily: 'conflict',
  taskVariant: 'A', condition: 'recommended', stimulusSeed: 271828,
};

describe('visualization iframe contract', () => {
  it('accepts only contract version 1 and the fixed synthetic seed', () => {
    expect(parseVisualizationParams(validParams)).toEqual(validParams);
    expect(parseVisualizationParams({ ...validParams, contractVersion: '2' })).toBeNull();
    expect(parseVisualizationParams({ ...validParams, contractVersion: '1' })).toBeNull();
    expect(parseVisualizationParams({ ...validParams, stimulusSeed: 1 })).toBeNull();
    expect(parseVisualizationParams({ ...validParams, unexpected: true })).toBeNull();
  });

  it('requires trusted origin/source and iframe correlation, then posts exact VIEW_READY host correlation', () => {
    const listener = vi.fn();
    const parent = { postMessage: vi.fn() };
    const target = {
      parent,
      addEventListener: vi.fn((_type: string, callback: (event: MessageEvent) => void) => listener.mockImplementation(callback)),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const ready = vi.fn();
    const bridge = createVisualizationHandshake(
      { search: '?id=widget&trialid=host-component-07&parentOrigin=https%3A%2F%2Fhost.example' } as Location,
      target, 'https://host.example/page', ['https://host.example'],
    );
    bridge.start(ready);
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: '@REVISIT_COMMS/WINDOW_READY', iframeId: 'widget' }), 'https://host.example');
    bridge.viewReady();
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    const send = (origin: string, source: Window, message: unknown) => listener({ origin, source, data: { error: false, iframeId: 'widget', type: '@REVISIT_COMMS/STUDY_DATA', message } } as MessageEvent);
    send('https://attacker.example', parent as unknown as Window, validParams);
    send('https://host.example', {} as Window, validParams);
    expect(ready).not.toHaveBeenCalled();
    send('https://host.example', parent as unknown as Window, validParams);
    expect(ready).toHaveBeenCalledWith(validParams);
    bridge.viewReady();
    expect(parent.postMessage).toHaveBeenLastCalledWith({
      error: false,
      type: '@REVISIT_COMMS/VIEW_READY',
      iframeId: 'widget',
      message: { contractVersion: 1, trialId: 'host-component-07' },
    }, 'https://host.example');
    bridge.viewReady();
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
    send('https://host.example', parent as unknown as Window, validParams);
    expect(ready).toHaveBeenCalledTimes(2);
    expect(parent.postMessage).toHaveBeenLastCalledWith({
      error: false,
      type: '@REVISIT_COMMS/VIEW_READY',
      iframeId: 'widget',
      message: { contractVersion: 1, trialId: 'host-component-07' },
    }, 'https://host.example');
    expect(parent.postMessage).toHaveBeenCalledTimes(3);
    bridge.viewNotReady();
    expect(parent.postMessage).toHaveBeenLastCalledWith({
      error: false,
      type: '@REVISIT_COMMS/VIEW_NOT_READY',
      iframeId: 'widget',
      message: { contractVersion: 1, trialId: 'host-component-07' },
    }, 'https://host.example');
    bridge.viewReady();
    expect(parent.postMessage).toHaveBeenLastCalledWith({
      error: false,
      type: '@REVISIT_COMMS/VIEW_READY',
      iframeId: 'widget',
      message: { contractVersion: 1, trialId: 'host-component-07' },
    }, 'https://host.example');
    bridge.dispose();
  });

  it('reports a trusted but invalid or mismatched payload for visible failure handling', () => {
    const listener = vi.fn();
    const parent = { postMessage: vi.fn() };
    const target = {
      parent,
      addEventListener: vi.fn((_type: string, callback: (event: MessageEvent) => void) => listener.mockImplementation(callback)),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const received = vi.fn();
    const bridge = createVisualizationHandshake(
      { search: '?id=widget&trialid=host-component-07&parentOrigin=https%3A%2F%2Fhost.example' } as Location,
      target, 'https://host.example/page', ['https://host.example'],
    );
    bridge.start(received);
    listener({ origin: 'https://host.example', source: parent as unknown as Window, data: {
      error: false, iframeId: 'widget', type: '@REVISIT_COMMS/STUDY_DATA', message: { ...validParams, trialId: 'conflict-B-recommended' },
    } } as MessageEvent);
    expect(received).toHaveBeenCalledWith(null);
    bridge.dispose();
  });
});
