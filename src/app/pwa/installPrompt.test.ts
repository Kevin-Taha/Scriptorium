import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isInstallable, promptInstall, subscribeToInstallPrompt } from './installPrompt';

function installEvent(prompt = vi.fn().mockResolvedValue(undefined)) {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
  });
  return { event, prompt };
}

beforeEach(() => {
  window.dispatchEvent(new Event('appinstalled'));
});

describe('install prompt', () => {
  it('captures an early prompt, notifies subscribers, and consumes it on request', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToInstallPrompt(listener);
    const { event, prompt } = installEvent();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(isInstallable()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    await promptInstall();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(isInstallable()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('hides the prompt after installation and tolerates a withdrawn prompt', async () => {
    const { event } = installEvent(vi.fn().mockRejectedValue(new Error('withdrawn')));
    window.dispatchEvent(event);
    await expect(promptInstall()).resolves.toBeUndefined();
    expect(isInstallable()).toBe(false);
    window.dispatchEvent(installEvent().event);
    window.dispatchEvent(new Event('appinstalled'));
    expect(isInstallable()).toBe(false);
  });
});
