import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { DatabaseService, supabase } from '@/lib/supabase';
import { Gig, ExpenseCategory } from '@/lib/types';
import { useExpenses } from '@/hooks/useSupabaseQuery';
import {
  Plus,
  Receipt,
  DollarSign,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const expenseSchema = z.object({
  amount: z.string().min(1, 'Amount is required'),
  category: z.enum(['travel', 'equipment', 'meals', 'accommodation', 'fuel', 'parking', 'other']),
  description: z.string().min(3, 'Description must be at least 3 characters'),
  expense_date: z.string().min(1, 'Date is required'),
  gig_id: z.string().optional(),
  is_reimbursable: z.boolean().default(false),
  is_tax_deductible: z.boolean().default(true),
  notes: z.string().optional(),
});

type ExpenseForm = z.infer<typeof expenseSchema>;

interface ExpenseTrackerProps {
  gigId?: string;
}

const ExpenseTracker: React.FC<ExpenseTrackerProps> = ({ gigId }) => {
  const { profile } = useAuth();
  const { data: expensesData, loading: expensesLoading, refetch: refetchExpenses } = useExpenses({ 
    workerId: profile?.id, 
    gigId 
  });
  const expenses = expensesData ?? [];
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Receipt photo/PDF for the expense being added. Uploaded to the private
  // expense-receipts bucket under the worker's own folder; the storage path
  // lands in expenses.receipt_url.
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const receiptInputRef = React.useRef<HTMLInputElement>(null);

  // zod 4: .default() splits input vs output types — fields are z.input,
  // the submitted data is the z.infer output type.
  const form = useForm<z.input<typeof expenseSchema>, unknown, ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      amount: '',
      category: 'other',
      description: '',
      expense_date: format(new Date(), 'yyyy-MM-dd'),
      gig_id: gigId || '',
      is_reimbursable: false,
      is_tax_deductible: true,
      notes: '',
    },
  });

  useEffect(() => {
    if (profile) {
      fetchGigs();
    }
  }, [profile, gigId]);

  const fetchGigs = async () => {
    if (!profile) return;

    try {
      // Fetch gigs where the user has accepted applications
      const { data: applications } = await supabase
        .from('gig_applications')
        .select(`
          gig:gigs(
            id,
            title,
            company:companies(name)
          )
        `)
        .eq('worker_id', profile.id)
        .eq('status', 'accepted');

      const gigData = (applications?.map(app => app.gig).filter(Boolean) || []) as unknown as Gig[];
      setGigs(gigData);
    } catch (error) {
      console.error('Error fetching gigs:', error);
    }
  };

  const onSubmit = async (data: ExpenseForm) => {
    if (!profile) return;

    setSubmitting(true);
    try {
      // Upload the receipt first so the expense row can reference its path.
      // The bucket is private — the path alone is useless without a signed URL.
      let receiptPath: string | undefined;
      if (receiptFile) {
        const ext = (receiptFile.name.split('.').pop() || 'jpg').toLowerCase();
        receiptPath = `${profile.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('expense-receipts')
          .upload(receiptPath, receiptFile, { upsert: false });
        if (upErr) throw new Error(`Receipt upload failed: ${upErr.message}`);
      }

      const expenseData = {
        worker_id: profile.id || '',
        amount: parseFloat(data.amount),
        category: data.category,
        description: data.description,
        expense_date: data.expense_date,
        gig_id: data.gig_id || undefined,
        is_reimbursable: data.is_reimbursable,
        is_tax_deductible: data.is_tax_deductible,
        notes: data.notes || undefined,
        currency: 'USD',
        receipt_url: receiptPath,
      };

      const { error } = await DatabaseService.addExpense(expenseData);

      if (error) throw error;

      toast.success('Expense added successfully!');
      setShowAddDialog(false);
      setReceiptFile(null);
      if (receiptInputRef.current) receiptInputRef.current.value = '';
      form.reset();
      await refetchExpenses();
    } catch (error) {
      toast.error(`Failed to add expense: ${(error as Error).message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'travel': return 'bg-primary/15 text-primary';
      case 'equipment': return 'bg-secondary/15 text-purple-800';
      case 'meals': return 'bg-amber-500/15 text-orange-800';
      case 'accommodation': return 'bg-primary/15 text-indigo-800';
      case 'fuel': return 'bg-amber-500/15 text-amber-800';
      case 'parking': return 'bg-primary/15 text-blue-800';
      default: return 'bg-muted text-foreground/90';
    }
  };

  // Receipts live in a private bucket — mint a short-lived signed URL on
  // demand rather than storing an expiring URL on the row.
  const viewReceipt = async (path: string) => {
    const { data, error } = await supabase.storage
      .from('expense-receipts')
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error('Could not open receipt');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const totalExpenses = (expenses || []).reduce((sum, expense) => sum + expense.amount, 0);
  const reimbursableExpenses = (expenses || [])
    .filter(expense => expense.is_reimbursable)
    .reduce((sum, expense) => sum + expense.amount, 0);
  const taxDeductibleExpenses = (expenses || [])
    .filter(expense => expense.is_tax_deductible)
    .reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Expense Tracker</h2>
          <p className="text-muted-foreground mt-2">
            Track your business expenses and manage deductions
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Expense
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalExpenses.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {(expenses || []).length} expense{(expenses || []).length !== 1 ? 's' : ''} recorded
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reimbursable</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${reimbursableExpenses.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting reimbursement
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tax Deductible</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${taxDeductibleExpenses.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              For tax purposes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Expenses List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Expenses</CardTitle>
          <CardDescription>
            Your expense history and details
          </CardDescription>
        </CardHeader>
        <CardContent>
          {expensesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (expenses || []).length > 0 ? (
            <div className="space-y-4">
              {(expenses || []).map((expense) => (
                <div key={expense.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                      <Receipt className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h4 className="font-medium">{expense.description}</h4>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge className={getCategoryColor(expense.category)}>
                          {expense.category}
                        </Badge>
                        {expense.is_reimbursable && (
                          <Badge variant="outline" className="text-xs">
                            Reimbursable
                          </Badge>
                        )}
                        {expense.is_tax_deductible && (
                          <Badge variant="outline" className="text-xs">
                            Tax Deductible
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-muted-foreground">
                        <span>{format(new Date(expense.expense_date), 'MMM d, yyyy')}</span>
                        {expense.gig && (
                          <span>• {expense.gig?.title || 'Unknown Gig'}</span>
                        )}
                        {expense.receipt_url && (
                          <button
                            type="button"
                            onClick={() => viewReceipt(expense.receipt_url!)}
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <Receipt className="h-3 w-3" /> Receipt
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-lg">${expense.amount.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">{expense.currency}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 text-muted-foreground/70 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No expenses recorded</h3>
              <p className="text-muted-foreground">
                Start tracking your business expenses to manage your finances better.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Expense Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Expense</DialogTitle>
            <DialogDescription>
              Record a business expense for tracking and tax purposes
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="amount">Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  {...form.register('amount')}
                  placeholder="0.00"
                />
                {form.formState.errors.amount && (
                  <p className="text-sm text-destructive dark:text-red-400 mt-1">
                    {form.formState.errors.amount.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select onValueChange={(value) => form.setValue('category', value as ExpenseCategory, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="travel">Travel</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="meals">Meals</SelectItem>
                    <SelectItem value="accommodation">Accommodation</SelectItem>
                    <SelectItem value="fuel">Fuel</SelectItem>
                    <SelectItem value="parking">Parking</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                {...form.register('description')}
                placeholder="What was this expense for?"
              />
              {form.formState.errors.description && (
                <p className="text-sm text-destructive dark:text-red-400 mt-1">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="expense_date">Date</Label>
                <Input
                  id="expense_date"
                  type="date"
                  {...form.register('expense_date')}
                />
              </div>

              <div>
                <Label htmlFor="gig_id">Related Gig (Optional)</Label>
                <Select onValueChange={(value) => form.setValue('gig_id', value, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gig" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No gig</SelectItem>
                    {gigs.map((gig) => (
                      <SelectItem key={gig.id} value={gig.id}>
                        {gig.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="receipt">Receipt photo or PDF (optional)</Label>
              <Input
                id="receipt"
                ref={receiptInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
              {receiptFile && (
                <p className="text-xs text-muted-foreground mt-1">{receiptFile.name}</p>
              )}
            </div>

            {/* Honest tax note: for a personal vehicle the IRS allows EITHER
                the standard mileage rate OR actual expenses (fuel, parking,
                etc.) — not both for the same miles. Workers who log mileage in
                the ledger should not double-claim the same trips here. */}
            {(form.watch('category') === 'fuel' || form.watch('category') === 'parking') && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                Tip: if you claim the IRS standard mileage rate for these miles in
                your ledger, don't also deduct the same trips as actual expenses —
                the IRS doesn't allow both. Actual-expense claims fit a dedicated
                work vehicle or trips you didn't mileage-log.
              </p>
            )}

            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                {...form.register('notes')}
                placeholder="Additional details about this expense"
                rows={2}
              />
            </div>

            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_reimbursable"
                  checked={form.watch('is_reimbursable')}
                  onCheckedChange={(checked) => form.setValue('is_reimbursable', checked)}
                />
                <Label htmlFor="is_reimbursable">Reimbursable</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_tax_deductible"
                  checked={form.watch('is_tax_deductible')}
                  onCheckedChange={(checked) => form.setValue('is_tax_deductible', checked)}
                />
                <Label htmlFor="is_tax_deductible">Tax Deductible</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Adding...' : 'Add Expense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExpenseTracker;