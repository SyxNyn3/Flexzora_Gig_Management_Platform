import { loadStripe, Stripe } from '@stripe/stripe-js';
import { supabase } from './supabase';

// Initialize Stripe with your publishable key
let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
  if (!stripePromise) {
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.error('Stripe publishable key is missing');
      return Promise.resolve(null);
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
};

// Function to create a payment intent via Supabase Edge Function
export const createPaymentIntent = async (
  amount: number,
  currency: string = 'usd',
  metadata: Record<string, string> = {}
) => {
  try {
    const { data, error } = await supabase.functions.invoke('create-payment-intent', {
      body: { amount, currency, metadata },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw error;
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
) => {
  try {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { lineItems, successUrl, cancelUrl, metadata },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
};

// Function to retrieve a payment intent
export const retrievePaymentIntent = async (paymentIntentId: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('retrieve-payment-intent', {
      body: { paymentIntentId },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error retrieving payment intent:', error);
    throw error;
  }
};

// Function to handle payment method setup
export const setupPaymentMethod = async (
  customerId: string,
  paymentMethodId: string
) => {
  try {
    const { data, error } = await supabase.functions.invoke('setup-payment-method', {
      body: { customerId, paymentMethodId },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error setting up payment method:', error);
    throw error;
  }
};

// Function to list customer payment methods
export const listPaymentMethods = async (customerId: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('list-payment-methods', {
      body: { customerId },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error listing payment methods:', error);
    throw error;
  }
};

// Function to create a customer
export const createCustomer = async (
  email: string,
  name: string,
  metadata: Record<string, string> = {}
) => {
  try {
    const { data, error } = await supabase.functions.invoke('create-customer', {
      body: { email, name, metadata },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating customer:', error);
    throw error;
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
    const { data, error } = await supabase.functions.invoke('create-payment-link', {
      body: { amount, currency, description, metadata },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating payment link:', error);
    throw error;
  }
};