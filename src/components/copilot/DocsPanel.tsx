// Company knowledge docs — the unstructured context the copilot cites.
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { CompanyDoc } from '@/lib/types';

interface Props {
  docs: CompanyDoc[];
  onAdd: (doc: { title: string; body: string; tags: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const DocsPanel: React.FC<Props> = ({ docs, onAdd, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    setSaving(true);
    try {
      await onAdd({
        title: title.trim(),
        body: body.trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      setTitle('');
      setBody('');
      setTags('');
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" /> Company notes
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Rate cards, union rules, venue quirks — the copilot cites these when they match your question.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {open && (
          <div className="space-y-2 border rounded-md p-3 bg-accent/20">
            <Input placeholder="Title (e.g. Local 720 overtime rules)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder="The note itself…" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
            <Input placeholder="Tags, comma separated" value={tags} onChange={(e) => setTags(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save note'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {docs.length === 0 && !open && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Nothing saved yet — ask the copilot to “remember that…” or add a note here.
          </div>
        )}

        {docs.map((d) => (
          <div key={d.id} className="border rounded-md p-3 space-y-1 group">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium leading-snug">{d.title}</div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                onClick={() => onDelete(d.id)}
              >
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">{d.body}</div>
            {d.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {d.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default DocsPanel;
