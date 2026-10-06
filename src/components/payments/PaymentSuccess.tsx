import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { retrievePaymentIntent, PaymentIntentDetails } from '@/lib/stripe';
import { CheckCircle, ArrowRight, Loader2 } from 'lucide-react';

const PaymentSuccess: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [paymentDetails, setPaymentDetails] = useState<PaymentIntentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processPayment = async () => {
      try {
        setLoading(true);
        
        // Get the payment_intent from URL
        const paymentIntentId = searchParams.get('payment_intent');
        
        if (!paymentIntentId) {
          throw new Error('No payment intent ID found');
        }
        
        // Retrieve payment details from Stripe
        const paymentData = await retrievePaymentIntent(paymentIntentId);
        
        if (!paymentData || paymentData.error) {
          throw new Error(typeof paymentData?.error === 'string' ? paymentData.error : 'Failed to retrieve payment details');
        }
        
        setPaymentDetails(paymentData);
        
        // Update payment status in database if needed
        if (profile && paymentData.metadata?.payment_id) {
          await supabase
            .from('payments')
            .update({
              status: 'paid',
              paid_date: new Date().toISOString().split('T')[0],
            })
            .eq('id', paymentData.metadata.payment_id);
        }
      } catch (err) {
        console.error('Error processing payment success:', err);
        setError((err as Error).message || 'An error occurred while processing your payment');
      } finally {
        setLoading(false);
      }
    };
    
    processPayment();
  }, [searchParams, profile]);

  const handleViewDetails = () => {
    if (paymentDetails?.metadata?.gig_id) {
      navigate(`/gigs/${paymentDetails.metadata.gig_id}`);
    } else {
      navigate('/finances');
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 flex flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
        <p className="text-center text-muted-foreground">Verifying your payment...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Payment Error</CardTitle>
            <CardDescription>
              There was a problem processing your payment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-foreground/80">{error}</p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => navigate('/finances')} className="w-full">
              Return to Finance Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto bg-green-500/15 p-3 rounded-full w-16 h-16 flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-2xl">Payment Successful!</CardTitle>
          <CardDescription>
            Your payment has been processed successfully
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-medium">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: paymentDetails?.currency?.toUpperCase() || 'USD',
                }).format((paymentDetails?.amount ?? 0) / 100)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date:</span>
              <span className="font-medium">
                {new Date().toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment ID:</span>
              <span className="font-medium text-sm truncate max-w-[200px]">
                {paymentDetails?.id}
              </span>
            </div>
            {typeof paymentDetails?.metadata?.description === 'string' && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Description:</span>
                <span className="font-medium">
                  {String(paymentDetails.metadata.description)}
                </span>
              </div>
            )}
          </div>
          
          <p className="text-center text-sm text-muted-foreground">
            A receipt has been sent to your email address.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <Button onClick={handleViewDetails} className="w-full">
            View Details
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => navigate('/dashboard')} className="w-full">
            Return to Dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default PaymentSuccess;