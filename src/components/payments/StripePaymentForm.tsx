import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  PaymentElement,
  LinkAuthenticationElement,
  useStripe,
  useElements,
  Elements,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { createPaymentIntent, isStripeDemoMode } from '@/lib/stripe';
import { toast } from 'sonner';

// Load Stripe outside of component to avoid recreating Stripe object on every render
const stripePromise = isStripeDemoMode ? null : loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

interface StripePaymentFormProps {
  amount: number;
  currency?: string;
  description: string;
  metadata?: Record<string, string>;
  onPaymentSuccess?: (paymentIntentId: string) => void;
  onPaymentError?: (error: Error) => void;
}

const StripePaymentFormInner: React.FC<StripePaymentFormProps> = ({
  amount,
  currency = 'usd',
  onPaymentSuccess,
  onPaymentError,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js hasn't yet loaded.
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-success`,
          receipt_email: email,
        },
        redirect: 'if_required',
      });

      if (error) {
        setErrorMessage(error.message);
        onPaymentError?.(new Error(error.message));
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        toast.success('Payment successful!');
        onPaymentSuccess?.(paymentIntent.id);
      }
    } catch (error) {
      setErrorMessage((error as Error).message || 'An unexpected error occurred');
      onPaymentError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <LinkAuthenticationElement
          onChange={(e) => setEmail(e.value.email)}
        />
        <PaymentElement />
      </div>

      {errorMessage && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-red-800 text-sm">
          {errorMessage}
        </div>
      )}

      <Button
        type="submit"
        disabled={isLoading || !stripe || !elements}
        className="w-full"
      >
        {isLoading ? 'Processing...' : `Pay ${new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)}`}
      </Button>
    </form>
  );
};

const StripePaymentForm: React.FC<StripePaymentFormProps> = (props) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializePayment = async () => {
      try {
        setLoading(true);
        const { clientSecret: secret } = await createPaymentIntent(
          props.amount,
          props.currency,
          props.metadata
        );
        setClientSecret(secret);
      } catch (err) {
        console.error('Failed to initialize payment:', err);
        setError((err as Error).message || 'Failed to initialize payment');
      } finally {
        setLoading(false);
      }
    };

    initializePayment();
  }, [props.amount, props.currency, props.metadata]);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-md text-red-800">
            <p className="font-medium">Payment initialization failed</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!clientSecret) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Details</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>
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
          <StripePaymentFormInner {...props} />
        </Elements>
      </CardContent>
      <CardFooter className="flex justify-between text-xs text-muted-foreground">
        <div>Secure payment powered by Stripe</div>
        <div>All card information is encrypted</div>
      </CardFooter>
    </Card>
  );
};

export default StripePaymentForm;