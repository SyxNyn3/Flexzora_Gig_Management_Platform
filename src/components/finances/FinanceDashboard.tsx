import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import InvoiceGenerator from './InvoiceGenerator';
import PaymentProcessor from '@/components/payments/PaymentProcessor';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, DatabaseService } from '@/lib/supabase';
import { Payment, Expense } from '@/lib/types';
import ExpenseTracker from '@/components/expenses/ExpenseTracker';
import { usePayments, useExpenses } from '@/hooks/useSupabaseQuery';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  Download,
  Plus,
  AlertCircle,
  CreditCard
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface FinanceStats {
  totalEarnings: number;
  monthlyEarnings: number;
  pendingPayments: number;
  totalExpenses: number;
  monthlyExpenses: number;
  netIncome: number;
}

const FinanceDashboard: React.FC = () => {
  const { profile } = useAuth();
  const [stats, setStats] = useState<FinanceStats>({
    totalEarnings: 0,
    monthlyEarnings: 0,
    pendingPayments: 0,
    totalExpenses: 0,
    monthlyExpenses: 0,
    netIncome: 0,
  });
  
  // Use real data hooks
  const { data: payments = [], loading: paymentsLoading, refetch: refetchPayments } = usePayments({ 
    workerId: profile?.id 
  });
  const { data: expenses = [], loading: expensesLoading } = useExpenses({ 
    workerId: profile?.id 
  });
  
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  useEffect(() => {
    if (profile) {
      calculateStats(payments, expenses);
      generateMonthlyData(payments, expenses);
    }
  }, [profile, payments, expenses]);

  const calculateStats = (payments: Payment[], expenses: Expense[]) => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const totalEarnings = payments
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount, 0);

    const monthlyEarnings = payments
      .filter(p => 
        p.status === 'paid' && 
        p.paid_date &&
        new Date(p.paid_date) >= monthStart && 
        new Date(p.paid_date) <= monthEnd
      )
      .reduce((sum, p) => sum + p.amount, 0);

    const pendingPayments = payments
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + p.amount, 0);

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    const monthlyExpenses = expenses
      .filter(e => 
        new Date(e.expense_date) >= monthStart && 
        new Date(e.expense_date) <= monthEnd
      )
      .reduce((sum, e) => sum + e.amount, 0);

    const netIncome = totalEarnings - totalExpenses;

    setStats({
      totalEarnings,
      monthlyEarnings,
      pendingPayments,
      totalExpenses,
      monthlyExpenses,
      netIncome,
    });
  };

  const generateMonthlyData = (payments: Payment[], expenses: Expense[]) => {
    const months = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const month = subMonths(now, i);
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);

      const monthlyEarnings = payments
        .filter(p => 
          p.status === 'paid' && 
          p.paid_date &&
          new Date(p.paid_date) >= monthStart && 
          new Date(p.paid_date) <= monthEnd
        )
        .reduce((sum, p) => sum + p.amount, 0);

      const monthlyExpenses = expenses
        .filter(e => 
          new Date(e.expense_date) >= monthStart && 
          new Date(e.expense_date) <= monthEnd
        )
        .reduce((sum, e) => sum + e.amount, 0);

      months.push({
        month: format(month, 'MMM yyyy'),
        earnings: monthlyEarnings,
        expenses: monthlyExpenses,
        net: monthlyEarnings - monthlyExpenses,
      });
    }

    setMonthlyData(months);
  };

  const handlePaymentSuccess = async () => {
    // Update payment status in the database
    try {
      if (selectedPayment) {
        await DatabaseService.updatePaymentStatus(
          selectedPayment.id, 
          'paid', 
          new Date().toISOString().split('T')[0]
        );
      }
      
      // Refresh payments data
      await refetchPayments();
      toast.success('Payment processed successfully!');
    } catch (error: any) {
      console.error('Payment update error:', error);
      toast.error(`Failed to update payment: ${error.message || 'Unknown error'}`);
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-success-lighter text-success';
      case 'pending': return 'bg-warning-lighter text-warning-dark';
      case 'overdue': return 'bg-destructive-lighter text-destructive-dark';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const loading = paymentsLoading || expensesLoading;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header skeleton */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex space-x-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        
        {/* Stats Grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        
        {/* Charts skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        
        {/* Tabs skeleton */}
        <div>
          <Skeleton className="h-10 w-full mb-4" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Financial Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Track your earnings, expenses, and financial performance
          </p>
        </div>
        <div className="flex space-x-2">
          <InvoiceGenerator />
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalEarnings.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              From all completed gigs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.monthlyEarnings.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Monthly earnings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.pendingPayments.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting payment
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.netIncome.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Earnings minus expenses
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Earnings vs Expenses</CardTitle>
            <CardDescription>
              Track your financial performance over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Area type="monotone" dataKey="earnings" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.5} />
                <Area type="monotone" dataKey="expenses" stackId="2" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.5} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Net Income Trend</CardTitle>
            <CardDescription>
              Your profit/loss over the last 6 months
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Net Income']}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="net" fill="hsl(var(--secondary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tables */}
      <Tabs defaultValue="payments" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Payments</CardTitle>
              <CardDescription>
                Your payment history and pending payments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {payments.length > 0 ? (
                  payments.slice(0, 10).map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <CreditCard className="h-8 w-8 text-gray-400" />
                        <div>
                          <h4 className="font-medium">{payment.gig?.title || 'Unknown Gig'}</h4>
                          <p className="text-xs text-gray-500">
                            {payment.gig?.company?.name || 'Unknown Company'}
                          </p>
                          <div className="mt-2 flex space-x-2">
                            <InvoiceGenerator payment={payment} gig={payment.gig} />
                            {payment.status !== 'paid' && profile?.role === 'company' && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setSelectedPayment(payment);
                                  setShowPaymentDialog(true);
                                }}
                              >
                                <CreditCard className="h-4 w-4 mr-2" />
                                Process Payment
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${payment.amount.toLocaleString()}</p>
                        <Badge className={getPaymentStatusColor(payment.status)}>
                          {payment.status}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-8">No payments recorded</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          <ExpenseTracker />
        </TabsContent>
      </Tabs>
      
      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>
              Complete payment for {selectedPayment?.gig?.title || 'this gig'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedPayment && (
            <div className="py-4">
              <PaymentProcessor 
                payment={selectedPayment} 
                gig={selectedPayment.gig} 
                onSuccess={handlePaymentSuccess}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinanceDashboard;