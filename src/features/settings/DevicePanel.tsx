import { useEffect, useId, useState } from 'react';
import { Laptop } from 'lucide-react';
import { getDevice, renameDevice } from '@/lib/sync/device';
import { StorageSection } from './StorageSection';

const MAX_NAME_LENGTH = 40;

export function DevicePanel() {
  const inputId = useId();
  const hintId = useId();
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let active = true;
    getDevice()
      .then((device) => {
        if (!active) return;
        setName(device.name);
        setSavedName(device.name);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const commit = async () => {
    if (savedName === null || name.trim() === savedName) {
      setName(savedName ?? name);
      return;
    }
    try {
      const device = await renameDevice(name);
      setName(device.name);
      setSavedName(device.name);
      setJustSaved(true);
    } catch {
      setName(savedName);
    }
  };

  return (
    <StorageSection icon={<Laptop />} title="This device">
      <div className="storage-field">
        <label htmlFor={inputId}>Device name</label>
        <input
          id={inputId}
          className="input"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          disabled={savedName === null}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={hintId}
          onChange={(event) => {
            setName(event.target.value);
            setJustSaved(false);
          }}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <p className="storage-field__hint" id={hintId}>
          Other devices use this name to say where you left off.
          <span className="storage-field__saved" role="status">
            {justSaved ? ' Saved.' : ''}
          </span>
        </p>
      </div>
    </StorageSection>
  );
}
