import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CreditCard, Shield, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createPaymentIntent } from '@/lib/stripe';
import { IS_PAYMENTS_SANDBOX, SANDBOX_BANNER } from '@/lib/payments';
import CheckoutForm from './CheckoutForm';

// Initialize Stripe outside component — skipped in payments sandbox (no key, no Stripe request)
const stripePromise = IS_PAYMENTS_SANDBOX
  ? null
  : loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

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
    if (IS_PAYMENTS_SANDBOX) {
      setLoading(false);
      return;
    }
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
      } catch (err) {
        console.error('Failed to initialize payment:', err);
        const e = err instanceof Error ? err : new Error('Failed to initialize payment');
        setError(e.message);
        onPaymentError?.(e);
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

  if (IS_PAYMENTS_SANDBOX) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Payments sandbox
          </CardTitle>
          <CardDescription>Complete your payment for {description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-2">
            {SANDBOX_BANNER}
          </p>
        </CardContent>
        <CardFooter className="flex justify-between text-xs text-muted-foreground">
          <div>Set VITE_STRIPE_PUBLISHABLE_KEY to enable live checkout.</div>
          {onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              Close
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col items-center justify-center py-10">
          <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
          <p className="text-center text-muted-foreground">Initializing payment...</p>
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
      <CardFooter className="flex justify-between border-t pt-4 text-xs text-muted-foreground">
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