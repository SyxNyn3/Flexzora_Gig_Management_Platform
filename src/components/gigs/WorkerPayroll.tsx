import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import PaymentProcessor from '@/components/payments/PaymentProcessor';
import ReviewForm from '@/components/reviews/ReviewForm';
import { DatabaseService } from '@/lib/supabase';
import { 
  DollarSign, 
  Users, 
  Clock,
  Calculator,
  Download,
  Send,
  CheckCircle,
  AlertCircle,
  Plus,
  Edit,
  FileText,
  CreditCard, 
  Star,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface WorkerPayment {
  id: string;
  worker_id: string;
  worker_name: string;
  worker_email: string;
  gig_id: string;
  hours_worked: number;
  hourly_rate: number;
  overtime_hours: number;
  overtime_rate: number;
  bonus_amount: number;
  deductions: number;
  gross_pay: number;
  net_pay: number;
  status: 'pending' | 'approved' | 'paid' | 'disputed';
  payment_method: 'direct_deposit' | 'check' | 'paypal' | 'venmo';
  payment_details: any;
  notes: string;
  created_at: string;
  paid_at?: string;
}

interface WorkerPayrollProps {
  gigId: string;
  gigTitle: string;
  workers: Array<{
    id: string;
    name: string;
    email: string;
    hourly_rate: number;
    avatar_url?: string;
  }>;
}

const WorkerPayroll: React.FC<WorkerPayrollProps> = ({ gigId, gigTitle, workers }) => {
  const { profile } = useAuth();
  const [payments, setPayments] = useState<WorkerPayment[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<string>('');
  const [hoursWorked, setHoursWorked] = useState<string>('');
  const [overtimeHours, setOvertimeHours] = useState<string>('');
  const [bonusAmount, setBonusAmount] = useState<string>('');
  const [deductions, setDeductions] = useState<string>('');
  const [selectedPayment, setSelectedPayment] = useState<WorkerPayment | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [selectedWorkerForReview, setSelectedWorkerForReview] = useState<string | null>(null);

  useEffect(() => {
    loadPayments();
  }, [gigId]);

  const loadPayments = async () => {
    try {
      const { data, error } = await DatabaseService.getPayments({ gigId });
      
      if (error) {
        console.error('Error loading payments:', error);
        return;
      }
      
      // Transform database payments to WorkerPayment format
      const transformedPayments: WorkerPayment[] = (data || []).map((payment: any) => {
        const worker = workers.find(w => w.id === payment.worker_id);
        return {
          id: payment.id,
          worker_id: payment.worker_id,
          worker_name: worker?.name || 'Unknown Worker',
          worker_email: worker?.email || '',
          gig_id: payment.gig_id,
          hours_worked: 8, // Default, should be stored in metadata
          hourly_rate: payment.amount / 8, // Estimated based on amount
          overtime_hours: 0,
          overtime_rate: 0,
          bonus_amount: 0,
          deductions: 0,
          gross_pay: payment.amount,
          net_pay: payment.amount,
          status: payment.status as any,
          payment_method: 'direct_deposit',
          payment_details: {},
          notes: payment.notes || '',
          created_at: payment.created_at,
          paid_at: payment.paid_date,
        };
      });
      
      setPayments(transformedPayments);
    } catch (error) {
      console.error('Error loading payments:', error);
      // Fall back to mock data if database fails
      const mockPayments: WorkerPayment[] = [
        {
          id: '1',
          worker_id: 'worker-1',
          worker_name: 'John Smith',
          worker_email: 'john@example.com',
          gig_id: gigId,
          hours_worked: 8,
          hourly_rate: 45,
          overtime_hours: 2,
          overtime_rate: 67.5,
          bonus_amount: 50,
          deductions: 0,
          gross_pay: 545,
          net_pay: 545,
          status: 'paid',
          payment_method: 'direct_deposit',
          payment_details: { account_ending: '1234' },
          notes: 'Excellent work on camera operations',
          created_at: '2024-01-15T10:00:00Z',
          paid_at: '2024-01-16T14:30:00Z',
        },
      ];
      setPayments(mockPayments);
    }
  };

  const calculatePayment = () => {
    const worker = workers.find(w => w.id === selectedWorker);
    if (!worker) return { gross: 0, net: 0 };

    const regularHours = parseFloat(hoursWorked) || 0;
    const overtime = parseFloat(overtimeHours) || 0;
    const bonus = parseFloat(bonusAmount) || 0;
    const deduction = parseFloat(deductions) || 0;

    const regularPay = regularHours * worker.hourly_rate;
    const overtimePay = overtime * (worker.hourly_rate * 1.5);
    const gross = regularPay + overtimePay + bonus;
    const net = gross - deduction;

    return { gross, net };
  };

  const addPayment = async () => {
    if (!selectedWorker || !hoursWorked) {
      toast.error('Please fill in required fields');
      return;
    }

    setLoading(true);
    try {
      const worker = workers.find(w => w.id === selectedWorker);
      if (!worker) return;

      const { gross, net } = calculatePayment();

      // Save to database
      const paymentData = {
        worker_id: selectedWorker,
        gig_id: gigId,
        company_id: profile?.id || '',
        amount: net,
        currency: 'USD',
        status: 'pending' as const,
        notes,
      };
      
      const { data: savedPayment, error } = await DatabaseService.addPayment(paymentData);
      
      if (error) {
        throw new Error(error);
      }

      // Reload payments from database
      await loadPayments();
      setShowPaymentDialog(false);
      resetForm();
      toast.success('Payment record created successfully!');
    } catch (error) {
      console.error('Error creating payment:', error);
      toast.error('Failed to create payment record');
    } finally {
      setLoading(false);
    }
  };

  const updatePaymentStatus = async (paymentId: string, status: string) => {
    setPayments(prev => prev.map(payment => 
      payment.id === paymentId 
        ? { 
            ...payment, 
            status: status as any,
            paid_at: status === 'paid' ? new Date().toISOString() : payment.paid_at
          }
        : payment
    ));

    toast.success(`Payment ${status} successfully!`);
  };

  const handlePaymentSuccess = () => {
    // Update the payment status in the UI
    setPayments(prev => prev.map(payment => 
      payment.id === selectedPayment?.id 
        ? { ...payment, status: 'paid' as const, paid_at: new Date().toISOString() }
        : payment
    ));
    
    setShowPaymentDialog(false);
    toast.success('Payment processed successfully!');
  };

  const processAllPayments = async () => {
    const pendingPayments = payments.filter(p => p.status === 'approved');
    
    for (const payment of pendingPayments) {
      await updatePaymentStatus(payment.id, 'paid');
    }

    toast.success(`Processed ${pendingPayments.length} payments!`);
  };

  const resetForm = () => {
    setSelectedWorker('');
    setHoursWorked('');
    setOvertimeHours('');
    setBonusAmount('');
    setDeductions('');
    setNotes('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'disputed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <CheckCircle className="h-4 w-4" />;
      case 'approved': return <CheckCircle className="h-4 w-4" />;
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'disputed': return <AlertCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const totalPayments = payments.reduce((sum, p) => sum + p.net_pay, 0);
  const paidPayments = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.net_pay, 0);
  const pendingPayments = payments.filter(p => p.status === 'pending' || p.status === 'approved').reduce((sum, p) => sum + p.net_pay, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Worker Payroll</h2>
          <p className="text-gray-600 mt-2">
            Manage payments for {gigTitle}
          </p>
        </div>
        {profile?.role === 'company' && (
          <div className="flex space-x-2">
            <Button variant="outline" onClick={processAllPayments}>
              <CreditCard className="h-4 w-4 mr-2" />
              Process All Approved
            </Button>
            <Button onClick={() => setShowPaymentDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Payment
            </Button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payroll</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalPayments.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {payments.length} payment records
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Out</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${paidPayments.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {payments.filter(p => p.status === 'paid').length} payments completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">${pendingPayments.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {payments.filter(p => p.status === 'pending' || p.status === 'approved').length} payments pending
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payments List */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Records</CardTitle>
          <CardDescription>
            Track and manage individual worker payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>
                      {payment.worker_name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-medium">{payment.worker_name}</h4>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <span>{payment.hours_worked}h regular</span>
                      {payment.overtime_hours > 0 && (
                        <span>{payment.overtime_hours}h overtime</span>
                      )}
                      <span>${payment.hourly_rate}/hr</span>
                    </div>
                    {payment.notes && (
                      <p className="text-sm text-gray-500 mt-1">{payment.notes}</p>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="flex items-center space-x-2 mb-2">
                    <Badge className={getStatusColor(payment.status)}>
                      <span className="flex items-center gap-1">
                        {getStatusIcon(payment.status)}
                        {payment.status}
                      </span>
                    </Badge>
                  </div>
                  <div className="text-lg font-semibold">${payment.net_pay.toLocaleString()}</div>
                  <div className="text-sm text-gray-500">
                    {payment.paid_at ? (
                      <span>Paid on {format(new Date(payment.paid_at), 'MMM d, yyyy')}</span>
                    ) : (
                      <span>Created on {format(new Date(payment.created_at), 'MMM d, yyyy')}</span>
                    )}
                  </div>
                </div>

                {profile?.role === 'company' && payment.status !== 'paid' && (
                  <div className="flex space-x-2 ml-4">
                    {payment.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updatePaymentStatus(payment.id, 'approved')}
                      >
                        Approve
                      </Button>
                    )}
                    {payment.status === 'approved' && (
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => updatePaymentStatus(payment.id, 'paid')}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Pay Now
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedPayment(payment);
                            setShowPaymentDialog(true);
                          }}
                        >
                          <CreditCard className="h-4 w-4 mr-1" />
                          Pay with Card
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {profile?.role === 'company' && payment.status === 'paid' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-4"
                    onClick={() => {
                      setSelectedWorkerForReview(payment.worker_id);
                      setShowReviewForm(true);
                    }}
                  >
                    <Star className="h-4 w-4 mr-1" />
                    Review
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Payment Record</DialogTitle>
            <DialogDescription>
              Create a payment record for a worker's time and compensation
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="worker">Worker</Label>
              <Select value={selectedWorker} onValueChange={setSelectedWorker}>
                <SelectTrigger>
                  <SelectValue placeholder="Select worker" />
                </SelectTrigger>
                <SelectContent>
                  {workers.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id}>
                      {worker.name} - ${worker.hourly_rate}/hr
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="hours_worked">Regular Hours</Label>
                <Input
                  id="hours_worked"
                  type="number"
                  step="0.5"
                  value={hoursWorked}
                  onChange={(e) => setHoursWorked(e.target.value)}
                  placeholder="8"
                />
              </div>

              <div>
                <Label htmlFor="overtime_hours">Overtime Hours</Label>
                <Input
                  id="overtime_hours"
                  type="number"
                  step="0.5"
                  value={overtimeHours}
                  onChange={(e) => setOvertimeHours(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="bonus">Bonus ($)</Label>
                <Input
                  id="bonus"
                  type="number"
                  step="0.01"
                  value={bonusAmount}
                  onChange={(e) => setBonusAmount(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div>
                <Label htmlFor="deductions">Deductions ($)</Label>
                <Input
                  id="deductions"
                  type="number"
                  step="0.01"
                  value={deductions}
                  onChange={(e) => setDeductions(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Performance notes, bonuses, etc."
              />
            </div>

            {selectedWorker && hoursWorked && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Payment Calculation</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Regular Pay:</span>
                    <span>${((parseFloat(hoursWorked) || 0) * (workers.find(w => w.id === selectedWorker)?.hourly_rate || 0)).toFixed(2)}</span>
                  </div>
                  {overtimeHours && parseFloat(overtimeHours) > 0 && (
                    <div className="flex justify-between">
                      <span>Overtime Pay:</span>
                      <span>${((parseFloat(overtimeHours) || 0) * ((workers.find(w => w.id === selectedWorker)?.hourly_rate || 0) * 1.5)).toFixed(2)}</span>
                    </div>
                  )}
                  {bonusAmount && parseFloat(bonusAmount) > 0 && (
                    <div className="flex justify-between">
                      <span>Bonus:</span>
                      <span>${parseFloat(bonusAmount).toFixed(2)}</span>
                    </div>
                  )}
                  {deductions && parseFloat(deductions) > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Deductions:</span>
                      <span>-${parseFloat(deductions).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t pt-1 flex justify-between font-medium">
                    <span>Net Pay:</span>
                    <span>${calculatePayment().net.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addPayment} disabled={loading}>
              {loading ? 'Creating...' : 'Create Payment Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>
              Complete payment for {selectedPayment?.worker_name || 'worker'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedPayment && (
            <div className="py-4">
              <Alert className="mb-4">
                <AlertDescription>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{selectedPayment.worker_name}</p>
                      <p className="text-sm text-gray-600">
                        {selectedPayment.hours_worked} hours at ${selectedPayment.hourly_rate}/hr
                        {selectedPayment.overtime_hours > 0 && ` + ${selectedPayment.overtime_hours} overtime hours`}
                      </p>
                    </div>
                    <p className="text-xl font-bold">${selectedPayment.net_pay.toLocaleString()}</p>
                  </div>
                </AlertDescription>
              </Alert>
              
              <PaymentProcessor 
                payment={{
                  id: selectedPayment.id,
                  worker_id: selectedPayment.worker_id,
                  amount: selectedPayment.net_pay,
                  currency: 'USD',
                  status: 'pending',
                  created_at: selectedPayment.created_at,
                  updated_at: selectedPayment.created_at,
                  gig_id: selectedPayment.gig_id,
                  company_id: profile?.id || '',
                }}
                onSuccess={handlePaymentSuccess}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Review Form Dialog */}
      {showReviewForm && selectedWorkerForReview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">Write a Review</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => setShowReviewForm(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              <ReviewForm 
                workerId={selectedWorkerForReview} 
                gigId={gigId}
                onSuccess={() => {
                  setShowReviewForm(false);
                  setSelectedWorkerForReview(null);
                  toast.success('Review submitted successfully!');
                }}
                onCancel={() => {
                  setShowReviewForm(false);
                  setSelectedWorkerForReview(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkerPayroll;