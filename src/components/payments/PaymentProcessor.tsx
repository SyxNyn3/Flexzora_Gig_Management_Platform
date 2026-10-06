import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Payment, Gig } from '@/lib/types';
import { CreditCard, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import StripeCheckout from '@/components/payments/StripeCheckout';

interface PaymentProcessorProps {
  payment?: Payment;
  gig?: Gig;
  onSuccess?: () => void;
}

const PaymentProcessor: React.FC<PaymentProcessorProps> = ({ payment, gig, onSuccess }) => {
  const { profile } = useAuth();
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [, setProcessing] = useState(false);

  const handlePayNow = () => {
    if (!payment) {
      toast.error('No payment selected');
      return;
    }
    
    setShowPaymentDialog(true);
  };

  const handlePaymentSuccess = async () => {
    if (!payment || !profile) return;
    
    try {
      setProcessing(true);
      
      // Update payment status in database
      const { error } = await supabase
        .from('payments')
        .update({
          status: 'paid',
          paid_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', payment.id);
      
      if (error) throw error;
      
      // Close dialog
      setShowPaymentDialog(false);
      
      // Show success message
      toast.success('Payment processed successfully!');
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast.error((error as Error).message || 'Failed to update payment status');
    } finally {
      setProcessing(false);
    }
  };

  const handlePaymentError = (error: Error) => {
    console.error('Payment error:', error);
    toast.error(`Payment failed: ${error.message}`);
  };

  return (
    <>
      <Button 
        onClick={handlePayNow} 
        disabled={!payment || payment.status === 'paid'}
        className={payment?.status === 'paid' ? 'bg-green-600 hover:bg-green-700' : ''}
      >
        {payment?.status === 'paid' ? (
          <>
            <CheckCircle className="h-4 w-4 mr-2" />
            Paid
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4 mr-2" />
            Pay Now
          </>
        )}
      </Button>
      
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>
              Complete payment for {gig?.title || 'this gig'}
            </DialogDescription>
          </DialogHeader>
          
          {payment && (
            <StripeCheckout
              amount={payment.amount}
              currency={payment.currency.toLowerCase()}
              description={`Payment for ${gig?.title || 'gig services'}`}
              metadata={{
                payment_id: payment.id,
                gig_id: payment.gig_id || '',
                worker_id: payment.worker_id || '',
                company_id: payment.company_id || '',
                description: gig?.title || 'Gig payment'
              }}
              onPaymentSuccess={handlePaymentSuccess}
              onPaymentError={handlePaymentError}
              onCancel={() => setShowPaymentDialog(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PaymentProcessor;