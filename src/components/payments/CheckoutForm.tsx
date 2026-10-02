import React, { useState, useEffect } from 'react';
import {
  PaymentElement,
  LinkAuthenticationElement,
  useStripe,
  useElements,
  AddressElement,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';

interface CheckoutFormProps {
  amount: number;
  currency: string;
  onPaymentSuccess: (paymentIntentId: string) => void;
  onPaymentError: (error: Error) => void;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({
  amount,
  currency,
  onPaymentSuccess,
  onPaymentError,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    if (!stripe) {
      return;
    }

    // Retrieve the PaymentIntent client secret from the URL
    const clientSecret = new URLSearchParams(window.location.search).get(
      'payment_intent_client_secret'
    );

    if (!clientSecret) {
      return;
    }

    // Retrieve the PaymentIntent
    stripe.retrievePaymentIntent(clientSecret).then(({ paymentIntent }) => {
      if (!paymentIntent) {
        return;
      }
      
      switch (paymentIntent.status) {
        case 'succeeded':
          setErrorMessage('Payment succeeded!');
          onPaymentSuccess(paymentIntent.id);
          break;
        case 'processing':
          setErrorMessage('Your payment is processing.');
          break;
        case 'requires_payment_method':
          setErrorMessage('Your payment was not successful, please try again.');
          break;
        default:
          setErrorMessage('Something went wrong.');
          break;
      }
    });
  }, [stripe, onPaymentSuccess]);

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
        onPaymentError(new Error(error.message || 'An unknown error occurred'));
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        onPaymentSuccess(paymentIntent.id);
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'An unexpected error occurred');
      onPaymentError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <LinkAuthenticationElement
          onChange={(e) => setEmail(e.value.email)}
          options={{
            defaultValues: {
              email: email,
            },
          }}
        />
        
        <PaymentElement 
          options={{
            layout: 'tabs',
          }}
        />
        
        <AddressElement 
          options={{
            mode: 'billing',
            fields: {
              phone: 'auto',
            },
            validation: {
              phone: {
                required: 'never',
              },
            },
          }}
        />
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          Total: <span className="font-bold">{formattedAmount}</span>
        </p>
        <Button
          type="submit"
          disabled={isLoading || !stripe || !elements}
          className="w-1/2"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            `Pay ${formattedAmount}`
          )}
        </Button>
      </div>
    </form>
  );
};

export default CheckoutForm;