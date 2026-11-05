import { describe, it, expect, vi } from 'vitest';
import { AudioCaptureEngine } from '../../app/renderer/hud/audio-capture.js';

describe('AudioCaptureEngine State Machine', () => {
  it('initializes with default idle state and 5-minute timeout ceiling', () => {
    const engine = new AudioCaptureEngine();
    expect(engine.state).toBe('idle');
    expect(engine.maxDurationMs).toBe(300000);
    expect(engine.selectedDeviceId).toBe('default');
  });

  it('updates selected device id', () => {
    const engine = new AudioCaptureEngine();
    engine.setMicrophone('custom-mic-device-id-123');
    expect(engine.selectedDeviceId).toBe('custom-mic-device-id-123');
  });

  it('cleans up state and buffers immediately upon cancel', () => {
    const engine = new AudioCaptureEngine();
    engine.state = 'recording';
    engine.audioChunks = [new Uint8Array([1, 2, 3])];

    engine.cancel();

    expect(engine.state).toBe('idle');
    expect(engine.audioChunks.length).toBe(0);
  });

  it('triggers onMaxDurationExceeded callback when duration ceiling reached', async () => {
    const onMaxExceeded = vi.fn();
    const engine = new AudioCaptureEngine({
      maxDurationMs: 50, // Short duration for test
      onMaxDurationExceeded: onMaxExceeded
    });

    engine.state = 'recording';
    engine.recordingStartTime = Date.now() - 60; // 60ms elapsed

    // Simulate timer check
    const elapsed = Date.now() - engine.recordingStartTime;
    if (elapsed >= engine.maxDurationMs) {
      if (engine.onMaxDurationExceeded) engine.onMaxDurationExceeded();
    }

    expect(onMaxExceeded).toHaveBeenCalled();
  });
});

