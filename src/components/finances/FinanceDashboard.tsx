import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Payment, Expense } from '@/lib/types';
import ExpenseTracker from '@/components/expenses/ExpenseTracker';
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
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchFinanceData();
    }
  }, [profile]);

  const fetchFinanceData = async () => {
    if (!profile) return;

    try {
      setLoading(true);

      // Fetch payments
      const { data: paymentsData } = await supabase
        .from('payments')
        .select(`
          *,
          gig:gigs(
            title,
            company:companies(name)
          )
        `)
        .eq('worker_id', profile.id)
        .order('created_at', { ascending: false });

      // Fetch expenses
      const { data: expensesData } = await supabase
        .from('expenses')
        .select(`
          *,
          gig:gigs(title)
        `)
        .eq('worker_id', profile.id)
        .order('expense_date', { ascending: false });

      setPayments(paymentsData || []);
      setExpenses(expensesData || []);

      // Calculate stats
      calculateStats(paymentsData || [], expensesData || []);
      generateMonthlyData(paymentsData || [], expensesData || []);

    } catch (error) {
      console.error('Error fetching finance data:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
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
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, '']} />
                <Area type="monotone" dataKey="earnings" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
                <Area type="monotone" dataKey="expenses" stackId="2" stroke="#EF4444" fill="#EF4444" fillOpacity={0.6} />
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
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Net Income']} />
                <Bar dataKey="net" fill="#10B981" />
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
                          <h4 className="font-medium">{payment.gig?.title}</h4>
                          <p className="text-sm text-gray-600">
                            {payment.gig?.company?.name}
                          </p>
                          {payment.due_date && (
                            <p className="text-xs text-gray-500">
                              Due: {format(new Date(payment.due_date), 'MMM d, yyyy')}
                            </p>
                          )}
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
    </div>
  );
};

export default FinanceDashboard;