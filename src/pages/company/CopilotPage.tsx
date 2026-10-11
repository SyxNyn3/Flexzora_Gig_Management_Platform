import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useMyCompany } from '@/hooks/useMarketplace';
import { Skeleton } from '@/components/ui/skeleton';
import CopilotPanel from '@/components/copilot/CopilotPanel';
import DocsPanel from '@/components/copilot/DocsPanel';
import { CopilotService } from '@/lib/copilot/service';
import { CompanyDoc } from '@/lib/types';

const CopilotPage: React.FC = () => {
  const { profile } = useAuth();
  const { company, loading: companyLoading } = useMyCompany();
  const [docs, setDocs] = useState<CompanyDoc[]>([]);
  const [docsLoaded, setDocsLoaded] = useState(false);

  useEffect(() => {
    if (!company?.id) return;
    CopilotService.listDocs(company.id).then(({ data, error }) => {
      if (error) toast.error(error);
      setDocs(data);
      setDocsLoaded(true);
    });
  }, [company?.id]);

  const addDoc = useCallback(
    async (input: { title: string; body: string; tags: string[] }) => {
      if (!company?.id || !profile?.id) return;
      const { data, error } = await CopilotService.createDoc({ company_id: company.id, created_by: profile.id, ...input });
      if (error || !data) {
        toast.error(error ?? 'Could not save the note');
        return;
      }
      setDocs((d) => [data, ...d]);
      toast.success('Note saved');
    },
    [company?.id, profile?.id],
  );

  const deleteDoc = useCallback(async (id: string) => {
    const { error } = await CopilotService.deleteDoc(id);
    if (error) {
      toast.error(error);
      return;
    }
    setDocs((d) => d.filter((x) => x.id !== id));
  }, []);

  const onDocSaved = useCallback((doc: CompanyDoc) => {
    setDocs((d) => [doc, ...d.filter((x) => x.id !== doc.id)]);
  }, []);

  if (companyLoading || !company || !profile) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Copilot</h1>
        <p className="text-sm text-muted-foreground">
          Ask about calls, crew, certs, timesheets and budgets — answers come from your live data and every action is previewed before it happens.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border bg-card p-4">
          <CopilotPanel
            companyId={company.id}
            profileId={profile.id}
            docs={docs}
            onDocSaved={onDocSaved}
            onClearHistory={() => undefined}
          />
        </div>
        <div>
          {docsLoaded ? <DocsPanel docs={docs} onAdd={addDoc} onDelete={deleteDoc} /> : <Skeleton className="h-64 w-full" />}
        </div>
      </div>
    </div>
  );
};

export default CopilotPage;
