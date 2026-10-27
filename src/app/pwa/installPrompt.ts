interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let promptEvent: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function updatePrompt(event: InstallPromptEvent | null): void {
  promptEvent = event;
  listeners.forEach((listener) => listener());
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  updatePrompt(event as InstallPromptEvent);
});
window.addEventListener('appinstalled', () => updatePrompt(null));

export function subscribeToInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isInstallable(): boolean {
  return promptEvent !== null;
}

export async function promptInstall(): Promise<void> {
  const event = promptEvent;
  if (!event) return;
  updatePrompt(null);
  try {
    await event.prompt();
    await event.userChoice;
  } catch {
    // The browser may withdraw the prompt before it is shown.
  }
}
