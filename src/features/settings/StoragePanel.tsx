import { useEffect, useState } from 'react';
import { Database, HardDrive, ShieldAlert, ShieldCheck } from 'lucide-react';
import { describeUsage } from './format';
import { StorageCard, StorageSection } from './StorageSection';
import { useStorageStatus } from './storageStatus';

export function StoragePanel() {
  const status = useStorageStatus((s) => s.status);
  const refresh = useStorageStatus((s) => s.refresh);
  const protect = useStorageStatus((s) => s.protect);
  const [protecting, setProtecting] = useState(false);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requestProtection = async () => {
    setProtecting(true);
    setDeclined(false);
    const granted = await protect();
    setDeclined(!granted);
    setProtecting(false);
  };

  const usage = describeUsage(status?.usage);
  const detail = (
    <>
      {usage && <span>{usage}</span>}
      {declined && (
        <span>
          Your browser didn’t allow it this time. A linked folder or backup still keeps your notes safe.
        </span>
      )}
    </>
  );

  const card = () => {
    if (!status) return <StorageCard busy icon={<Database />} title="Checking storage…" />;
    if (status.persisted === true) {
      return <StorageCard icon={<ShieldCheck />} title="Protected from automatic clean-up" detail={detail} />;
    }
    if (status.persisted === false) {
      return (
        <StorageCard
          icon={<ShieldAlert />}
          title="The browser may clear this data when space runs low"
          detail={detail}
        >
          <button
            type="button"
            className="btn"
            disabled={protecting}
            onClick={() => void requestProtection()}
          >
            <ShieldCheck aria-hidden="true" />
            Protect my library
          </button>
        </StorageCard>
      );
    }
    return <StorageCard icon={<Database />} title="Stored in this browser" detail={detail} />;
  };

  return (
    <StorageSection icon={<HardDrive />} title="Storage">
      {card()}
      <p className="storage-note">
        Clearing this site’s data in your browser removes books you imported here. Books in a linked folder —
        and their notes — are safe in the folder.
      </p>
    </StorageSection>
  );
}
