import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Pencil, Plus, Upload, UserRound } from 'lucide-react';
import { useMyCompany } from '@/hooks/useMarketplace';
import { StaffService, StaffMemberInput } from '@/lib/staff/service';
import { StaffEmploymentType, StaffMember } from '@/lib/types';

const EMPLOYMENT_LABELS: Record<StaffEmploymentType, string> = {
  salaried: 'Salaried',
  day_rate: 'Day rate',
  hourly: 'Hourly',
};

const EMPTY_FORM: StaffMemberInput = {
  full_name: '',
  email: '',
  phone: '',
  title: '',
  department: '',
  employment_type: 'day_rate',
  day_rate: null,
  notes: '',
};

const StaffPage: React.FC = () => {
  const { company } = useMyCompany();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; editing?: StaffMember }>({ open: false });
  const [form, setForm] = useState<StaffMemberInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!company?.id) {
      setLoading(false);
      return;
    }
    const { data, error } = await StaffService.listMembers(company.id, showInactive);
    if (error) toast.error(error);
    setMembers(data);
    setLoading(false);
  }, [company?.id, showInactive]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openEdit = (m?: StaffMember) => {
    setForm(
      m
        ? {
            full_name: m.full_name,
            email: m.email ?? '',
            phone: m.phone ?? '',
            title: m.title ?? '',
            department: m.department ?? '',
            employment_type: m.employment_type,
            day_rate: m.day_rate ?? null,
            notes: m.notes ?? '',
          }
        : EMPTY_FORM,
    );
    setDialog({ open: true, editing: m });
  };

  const save = async () => {
    if (!company?.id || !form.full_name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    const payload: StaffMemberInput = {
      ...form,
      full_name: form.full_name.trim(),
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      title: form.title?.trim() || null,
      department: form.department?.trim() || null,
      day_rate: form.day_rate || null,
      notes: form.notes?.trim() || null,
    };
    const res = dialog.editing
      ? await StaffService.updateMember(dialog.editing.id, payload)
      : await StaffService.createMember(company.id, payload);
    setSaving(false);
    if (res.error) return toast.error(res.error);
    toast.success(dialog.editing ? 'Staff member updated' : 'Staff member added');
    setDialog({ open: false });
    refresh();
  };

  const setActive = async (m: StaffMember, active: boolean) => {
    const { error } = await StaffService.updateMember(m.id, { is_active: active });
    if (error) return toast.error(error);
    setMembers((ms) => (showInactive ? ms.map((x) => (x.id === m.id ? { ...x, is_active: active } : x)) : ms.filter((x) => x.id !== m.id)));
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Staff</h1>
          <p className="text-sm text-muted-foreground">
            Your internal team — PMs, coordinators, crew leads. Assign them to events alongside marketplace crew, or bulk-import a staff sheet via{' '}
            <Link to="/import" className="text-primary inline-flex items-center gap-1 hover:underline">
              <Upload className="w-3.5 h-3.5" /> Import
            </Link>
            .
          </p>
        </div>
        <Button onClick={() => openEdit()} className="bg-gradient-to-r from-blue-600 to-green-500">
          <Plus className="w-4 h-4 mr-1" /> Add staff
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm text-muted-foreground">{members.length} member{members.length === 1 ? '' : 's'}</span>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Show inactive
            </label>
          </div>
          {loading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : members.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <UserRound className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No staff yet — add your PMs and coordinators, or drop a staff spreadsheet on Import.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Day rate</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id} className={m.is_active ? '' : 'opacity-50'}>
                    <TableCell className="font-medium">{m.full_name}</TableCell>
                    <TableCell>{m.title ?? '—'}</TableCell>
                    <TableCell>{m.department ?? '—'}</TableCell>
                    <TableCell className="text-xs">
                      {m.email && <div>{m.email}</div>}
                      {m.phone && <div className="text-muted-foreground">{m.phone}</div>}
                      {!m.email && !m.phone && '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{EMPLOYMENT_LABELS[m.employment_type]}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{m.day_rate ? `$${m.day_rate}` : '—'}</TableCell>
                    <TableCell>
                      <Switch checked={m.is_active} onCheckedChange={(v) => setActive(m, v)} />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(m)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ open: o })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog.editing ? `Edit ${dialog.editing.full_name}` : 'Add staff member'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="sf-name">Full name</Label>
              <Input id="sf-name" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sf-title">Title</Label>
              <Input id="sf-title" placeholder="Production Manager" value={form.title ?? ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sf-dept">Department</Label>
              <Input id="sf-dept" placeholder="Production" value={form.department ?? ''} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sf-email">Email</Label>
              <Input id="sf-email" type="email" value={form.email ?? ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sf-phone">Phone</Label>
              <Input id="sf-phone" value={form.phone ?? ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Employment type</Label>
              <Select value={form.employment_type} onValueChange={(v) => setForm((f) => ({ ...f, employment_type: v as StaffEmploymentType }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day_rate">Day rate</SelectItem>
                  <SelectItem value="salaried">Salaried</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sf-rate">Day rate ($)</Label>
              <Input
                id="sf-rate"
                type="number"
                min={0}
                value={form.day_rate ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, day_rate: e.target.value ? Number(e.target.value) : null }))}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="sf-notes">Notes</Label>
              <Textarea id="sf-notes" rows={2} value={form.notes ?? ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDialog({ open: false })}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : dialog.editing ? 'Save changes' : 'Add staff'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffPage;
