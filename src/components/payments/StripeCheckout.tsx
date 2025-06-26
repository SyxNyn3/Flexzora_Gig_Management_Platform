import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CreditCard, Shield, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createPaymentIntent } from '@/lib/stripe';
import CheckoutForm from './CheckoutForm';

// Initialize Stripe outside component to avoid recreating on each render
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface StripeCheckoutProps {
  amount: number;
  currency?: string;
  description: string;
  metadata?: Record<string, string>;
  onPaymentSuccess?: (paymentIntentId: string) => void;
  onPaymentError?: (error: Error) => void;
  onCancel?: () => void;
}

const StripeCheckout: React.FC<StripeCheckoutProps> = ({
  amount,
  currency = 'usd',
  description,
  metadata = {},
  onPaymentSuccess,
  onPaymentError,
  onCancel
}) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializePayment = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Create a payment intent on the server
        const { clientSecret, error } = await createPaymentIntent(amount, currency, metadata);
        
        if (error) {
          throw new Error(error);
        }
        
        if (!clientSecret) {
          throw new Error('Failed to initialize payment: No client secret returned');
        }
        
        setClientSecret(clientSecret);
      } catch (err: any) {
        console.error('Failed to initialize payment:', err);
        setError(err.message || 'Failed to initialize payment');
        onPaymentError?.(err);
      } finally {
        setLoading(false);
      }
    };

    initializePayment();
  }, [amount, currency, metadata, onPaymentError]);

  const handlePaymentSuccess = (paymentIntentId: string) => {
    toast.success('Payment successful!');
    onPaymentSuccess?.(paymentIntentId);
  };

  const handlePaymentError = (error: Error) => {
    toast.error(`Payment failed: ${error.message}`);
    onPaymentError?.(error);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col items-center justify-center py-10">
          <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
          <p className="text-center text-gray-600">Initializing payment...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <CreditCard className="mr-2 h-5 w-5" />
          Secure Payment
        </CardTitle>
        <CardDescription>
          Complete your payment for {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {clientSecret && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: 'stripe',
                variables: {
                  colorPrimary: '#3b82f6',
                  colorBackground: '#ffffff',
                  colorText: '#1f2937',
                  colorDanger: '#ef4444',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  borderRadius: '8px',
                },
              },
            }}
          >
            <CheckoutForm 
              amount={amount}
              currency={currency}
              onPaymentSuccess={handlePaymentSuccess}
              onPaymentError={handlePaymentError}
            />
          </Elements>
        )}
      </CardContent>
      <CardFooter className="flex justify-between border-t pt-4 text-xs text-gray-500">
        <div className="flex items-center">
          <Shield className="h-3 w-3 mr-1" />
          Secure payment powered by Stripe
        </div>
        <div>All card information is encrypted</div>
      </CardFooter>
    </Card>
  );
};

export default StripeCheckout;