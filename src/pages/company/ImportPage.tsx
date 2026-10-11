import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useMyCompany } from '@/hooks/useMarketplace';
import { ImportService } from '@/lib/import/service';
import { ImportJob } from '@/lib/types';
import UploadWizard from '@/components/import/UploadWizard';
import JobHistory from '@/components/import/JobHistory';

const ImportPage: React.FC = () => {
  const { company } = useMyCompany();
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [openJobId, setOpenJobId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!company?.id) {
      setLoading(false);
      return;
    }
    const { data, error } = await ImportService.listJobs(company.id);
    if (error) toast.error(error);
    setJobs(data);
    setLoading(false);
  }, [company?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import</h1>
        <p className="text-sm text-muted-foreground">
          Drop the spreadsheets you already run on — venue lists, call sheets, crew rosters. We parse, you review once, it imports.
        </p>
      </div>
      <UploadWizard
        openJobId={openJobId}
        onCloseJob={() => {
          setOpenJobId(null);
          refresh();
        }}
        onJobsChanged={refresh}
      />
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">Import history</h2>
        <JobHistory jobs={jobs} loading={loading} onOpen={setOpenJobId} />
      </div>
    </div>
  );
};

export default ImportPage;
