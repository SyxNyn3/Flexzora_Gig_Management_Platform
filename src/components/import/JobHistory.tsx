import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ImportJob, ImportJobStatus } from '@/lib/types';
import { importTarget } from '@/lib/import/targets';
import { formatDistanceToNow } from 'date-fns';
import { FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<ImportJobStatus, string> = {
  uploaded: 'text-muted-foreground',
  mapped: 'text-muted-foreground',
  reviewing: 'text-amber-600 dark:text-amber-400',
  committing: 'text-primary',
  committed: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-destructive',
  cancelled: 'text-muted-foreground',
};

interface Props {
  jobs: ImportJob[];
  loading: boolean;
  onOpen: (jobId: string) => void;
}

const JobHistory: React.FC<Props> = ({ jobs, loading, onOpen }) => {
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <FileUp className="w-8 h-8 mx-auto mb-2" />
          No imports yet — drop a file above to bring your spreadsheets in.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Imported as</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id} className="cursor-pointer hover:bg-accent/50" onClick={() => onOpen(job.id)}>
                <TableCell className="font-medium">{job.file_name}</TableCell>
                <TableCell>{importTarget(job.target)?.label ?? job.target}</TableCell>
                <TableCell>
                  <span className="text-emerald-600 dark:text-emerald-400">{job.stats?.imported ?? 0}✓</span>
                  {(job.stats?.error ?? 0) > 0 && <span className="text-destructive ml-2">{job.stats.error}✗</span>}
                  {(job.stats?.ready ?? 0) + (job.stats?.warning ?? 0) > 0 && job.status !== 'committed' && (
                    <span className="text-muted-foreground ml-2">{(job.stats?.ready ?? 0) + (job.stats?.warning ?? 0)} pending</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className={cn('text-xs font-medium capitalize', STATUS_TONE[job.status])}>{job.status}</span>
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default JobHistory;
