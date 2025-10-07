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
import { Gig } from '@/lib/types';
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
  category: z.enum(['travel', 'equipment', 'meals', 'accommodation', 'other']),
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
  const { data: expenses = [], loading: expensesLoading, refetch: refetchExpenses } = useExpenses({ 
    workerId: profile?.id, 
    gigId 
  });
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ExpenseForm>({
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
      };

      const { error } = await DatabaseService.addExpense(expenseData);

      if (error) throw error;

      toast.success('Expense added successfully!');
      setShowAddDialog(false);
      form.reset();
      await refetchExpenses();
    } catch (error: any) {
      toast.error(`Failed to add expense: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'travel': return 'bg-blue-100 text-blue-800';
      case 'equipment': return 'bg-purple-100 text-purple-800';
      case 'meals': return 'bg-orange-100 text-orange-800';
      case 'accommodation': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
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
          <h2 className="text-2xl font-bold text-gray-900">Expense Tracker</h2>
          <p className="text-gray-600 mt-2">
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (expenses || []).length > 0 ? (
            <div className="space-y-4">
              {(expenses || []).map((expense) => (
                <div key={expense.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      <Receipt className="h-5 w-5 text-gray-600" />
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
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                        <span>{format(new Date(expense.expense_date), 'MMM d, yyyy')}</span>
                        {expense.gig && (
                          <span>• {expense.gig?.title || 'Unknown Gig'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-lg">${expense.amount.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">{expense.currency}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No expenses recorded</h3>
              <p className="text-gray-600">
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
                  <p className="text-sm text-red-600 mt-1">
                    {form.formState.errors.amount.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select onValueChange={(value) => form.setValue('category', value as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="travel">Travel</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="meals">Meals</SelectItem>
                    <SelectItem value="accommodation">Accommodation</SelectItem>
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
                <p className="text-sm text-red-600 mt-1">
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
                <Select onValueChange={(value) => form.setValue('gig_id', value)}>
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