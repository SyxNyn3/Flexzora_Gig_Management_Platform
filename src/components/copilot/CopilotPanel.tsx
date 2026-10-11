// Copilot chat — routes each question through the intent catalog, runs the
// whitelisted RPC, snapshots the rows onto the message, and renders action
// previews that only execute on explicit confirm.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, FileText, Loader2, Send, Sparkles, Trash2, User } from 'lucide-react';
import { CompanyDoc, CopilotAction, CopilotMessage } from '@/lib/types';
import { CopilotService } from '@/lib/copilot/service';
import { HELP_TEXT, IntentContext, routeIntent, summarize } from '@/lib/copilot/intents';
import { llmRouteIntent } from '@/lib/copilot/llm';
import ActionCard from './ActionCard';
import ResultTable from './ResultTable';

interface Props {
  companyId: string;
  profileId: string;
  docs: CompanyDoc[];
  onDocSaved: (doc: CompanyDoc) => void;
  onClearHistory: () => void;
}

const SUGGESTIONS = [
  'What calls are still unfilled this week?',
  'Which certs expire this month?',
  'Timesheets waiting on me',
  "What's coming up?",
];

const CopilotPanel: React.FC<Props> = ({ companyId, profileId, docs, onDocSaved, onClearHistory }) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [ctx, setCtx] = useState<IntentContext>({ events: [], shifts: [] });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [msgs, evts] = await Promise.all([
        CopilotService.listMessages(companyId),
        supabase.from('events').select('id, name').eq('company_id', companyId).order('starts_on').limit(100),
      ]);
      if (cancelled) return;
      if (msgs.error) toast.error(msgs.error);
      setMessages(msgs.data);
      const events = ((evts.data ?? []) as { id: string; name: string }[]);
      const eventIds = events.map((e) => e.id);
      let shifts: IntentContext['shifts'] = [];
      if (eventIds.length) {
        const { data } = await supabase
          .from('shifts')
          .select('id, title, event_id')
          .in('event_id', eventIds)
          .order('starts_at')
          .limit(300);
        const byId = new Map(events.map((e) => [e.id, e.name]));
        shifts = ((data ?? []) as { id: string; title: string; event_id: string }[]).map((s) => ({
          id: s.id,
          title: s.title,
          eventName: byId.get(s.event_id) ?? '',
        }));
      }
      if (!cancelled) {
        setCtx({ events, shifts });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const persist = useCallback(
    async (msg: Parameters<typeof CopilotService.addMessage>[0]): Promise<CopilotMessage | null> => {
      const { data, error } = await CopilotService.addMessage(msg);
      if (error) toast.error(error);
      return data;
    },
    [],
  );

  const docsContextNote = useCallback(
    (question: string): string => {
      const hits = CopilotService.matchDocs(docs, question);
      return hits.length ? `\n\nFrom your notes: ${hits.map((d) => `“${d.title}”`).join(', ')}` : '';
    },
    [docs],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput('');
      setBusy(true);
      const userMsg = await persist({ company_id: companyId, profile_id: profileId, role: 'user', content: text });
      if (userMsg) setMessages((m) => [...m, userMsg]);

      try {
        const context = ctxRef.current;
        // Heuristic first (instant, deterministic); LLM disambiguates only when
        // the heuristic bails — either way the whitelisted RPC does the reading.
        let intent = routeIntent(text, context);
        if (intent.type === 'help') {
          intent = (await llmRouteIntent(text, context)) ?? intent;
        }

        let assistant: Omit<Parameters<typeof CopilotService.addMessage>[0], 'company_id'>;
        if (intent.type === 'query') {
          const { data: rows, error } = await CopilotService.query(companyId, intent.kind, intent.args);
          if (error) {
            assistant = { role: 'assistant', content: `I couldn't run that check: ${error}` };
          } else {
            assistant = {
              role: 'assistant',
              content: summarize(intent.kind, rows) + docsContextNote(text),
              query_kind: intent.kind,
              result: rows,
            };
          }
        } else if (intent.type === 'action') {
          const action: CopilotAction = {
            kind: intent.action,
            label: intent.label,
            payload: intent.payload,
            status: 'pending',
          };
          assistant = {
            role: 'assistant',
            content:
              intent.action === 'save_doc'
                ? 'I can save that as a company note — confirm below and it lands in the docs panel.'
                : 'Here is a draft for your review — nothing goes out without you.',
            action,
          };
        } else {
          assistant = { role: 'assistant', content: HELP_TEXT + docsContextNote(text) };
        }

        const saved = await persist({ company_id: companyId, ...assistant });
        if (saved) setMessages((m) => [...m, saved]);
      } finally {
        setBusy(false);
      }
    },
    [busy, companyId, profileId, persist, docsContextNote],
  );

  const confirmAction = useCallback(
    async (msg: CopilotMessage) => {
      const action = msg.action;
      if (!action || action.status !== 'pending') return;
      setActionBusy(msg.id);
      try {
        if (action.kind === 'save_doc') {
          const body = String(action.payload.body ?? '').trim();
          const title = body.split(/[.!?\n]/)[0]?.slice(0, 80) || 'Copilot note';
          const { data: doc, error } = await CopilotService.createDoc({ company_id: companyId, title, body, tags: ['copilot'], created_by: profileId });
          if (error || !doc) {
            toast.error(error ?? 'Could not save the note');
            return;
          }
          onDocSaved(doc);
          const next = { ...action, status: 'done' as const, note: `saved “${doc.title}”` };
          await CopilotService.setActionStatus(msg.id, next);
          setMessages((ms) => ms.map((m) => (m.id === msg.id ? { ...m, action: next } : m)));
          toast.success('Note saved');
        }
      } finally {
        setActionBusy(null);
      }
    },
    [companyId, profileId, onDocSaved],
  );

  const dismissAction = useCallback(async (msg: CopilotMessage) => {
    if (!msg.action) return;
    setActionBusy(msg.id);
    const next = { ...msg.action, status: 'dismissed' as const };
    await CopilotService.setActionStatus(msg.id, next);
    setMessages((ms) => ms.map((m) => (m.id === msg.id ? { ...m, action: next } : m)));
    setActionBusy(null);
  }, []);

  const clearHistory = useCallback(async () => {
    const { error } = await CopilotService.clearHistory(companyId);
    if (error) {
      toast.error(error);
      return;
    }
    setMessages([]);
    onClearHistory();
  }, [companyId, onClearHistory]);

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-10 w-1/2 ml-auto" />
        <Skeleton className="h-10 w-3/4" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-16rem)] min-h-[26rem]">
      <div className="flex items-center justify-between pb-3 border-b">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="w-4 h-4" />
          Reads your live data through a fixed catalog — every action is previewed first.
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearHistory}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3 pt-6">
            <div className="flex gap-2">
              <Bot className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground max-w-md">{HELP_TEXT}</div>
            </div>
            <div className="flex flex-wrap gap-2 pl-7">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs border rounded-full px-3 py-1.5 hover:bg-accent transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && <Bot className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
            <div className={`max-w-[85%] ${m.role === 'user' ? 'order-first' : ''}`}>
              <div
                className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent/50'
                }`}
              >
                {m.content}
              </div>
              {m.query_kind && (
                <Badge variant="outline" className="mt-1 text-[10px]">
                  {m.query_kind.replace(/_/g, ' ')}
                </Badge>
              )}
              {m.result && <ResultTable rows={m.result} />}
              {m.action && (
                <ActionCard
                  action={m.action}
                  busy={actionBusy === m.id}
                  onConfirm={() => confirmAction(m)}
                  onDismiss={() => dismissAction(m)}
                />
              )}
            </div>
            {m.role === 'user' && <User className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />}
          </div>
        ))}

        {busy && (
          <div className="flex gap-2 items-center text-sm text-muted-foreground">
            <Bot className="w-5 h-5 text-primary" />
            <Loader2 className="w-4 h-4 animate-spin" /> checking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex gap-2 pt-3 border-t"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about calls, crew, certs, timesheets, budgets…"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
      <div className="pt-1 text-[10px] text-muted-foreground flex items-center gap-1">
        <FileText className="w-3 h-3" /> Relevant notes from the docs panel are cited under answers.
      </div>
    </div>
  );
};

export default CopilotPanel;
