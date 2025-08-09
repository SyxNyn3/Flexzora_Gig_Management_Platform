import { loadStripe, Stripe } from '@stripe/stripe-js';
import { supabase } from './supabase';

// Initialize Stripe with publishable key
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

export const getStripe = () => {
  return stripePromise;
};

// Function to create a payment intent via Supabase Edge Function
export const createPaymentIntent = async (
  amount: number,
  currency: string = 'usd',
  metadata: Record<string, string> = {}
): Promise<{ clientSecret: string | null; error: string | null }> => {
  try {
    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('create-payment-intent', {
      body: { 
        amount, 
        currency, 
        metadata 
      },
    });

    if (error) throw error;
    
    if (!data || !data.clientSecret) {
      throw new Error('No client secret returned from payment intent creation');
    }
    
    return { 
      clientSecret: data.clientSecret,
      error: null
    };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return { 
      clientSecret: null, 
      error: error instanceof Error ? error.message : 'Unknown error creating payment intent'
    };
  }
};

// Function to create a checkout session via Supabase Edge Function
export const createCheckoutSession = async (
  lineItems: Array<{
    price_data: {
      currency: string;
      product_data: {
        name: string;
        description?: string;
      };
      unit_amount: number;
    };
    quantity: number;
  }>,
  successUrl: string,
  cancelUrl: string,
  metadata: Record<string, string> = {}
): Promise<{ sessionId: string | null; url: string | null; error: string | null }> => {
  try {
    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { lineItems, successUrl, cancelUrl, metadata },
    });

    if (error) throw error;
    
    if (!data || !data.sessionId) {
      throw new Error('No session ID returned from checkout session creation');
    }
    
    return { 
      sessionId: data.sessionId,
      url: data.url,
      error: null
    };
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return { 
      sessionId: null, 
      url: null,
      error: error instanceof Error ? error.message : 'Unknown error creating checkout session'
    };
  }
};

// Function to retrieve a payment intent
export const retrievePaymentIntent = async (paymentIntentId: string): Promise<any> => {
  try {
    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('retrieve-payment-intent', {
      body: { paymentIntentId },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error retrieving payment intent:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error retrieving payment intent' };
  }
};

// Function to handle payment method setup
export const setupPaymentMethod = async (
  customerId: string,
  paymentMethodId: string
) => {
  try {
    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('setup-payment-method', {
      body: { customerId, paymentMethodId },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error setting up payment method:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error setting up payment method' };
  }
};

// Function to list customer payment methods
export const listPaymentMethods = async (customerId: string) => {
  try {
    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('list-payment-methods', {
      body: { customerId },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error listing payment methods:', error);
    return { paymentMethods: [], error: error instanceof Error ? error.message : 'Unknown error listing payment methods' };
  }
};

// Function to create a customer
export const createCustomer = async (
  email: string,
  name: string,
  metadata: Record<string, string> = {}
) => {
  try {
    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('create-customer', {
      body: { email, name, metadata },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating customer:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error creating customer' };
  }
};

// Function to create a payment link
export const createPaymentLink = async (
  amount: number,
  currency: string = 'usd',
  description: string,
  metadata: Record<string, string> = {}
) => {
  try {
    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('create-payment-link', {
      body: { amount, currency, description, metadata },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating payment link:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error creating payment link' };
  }
};