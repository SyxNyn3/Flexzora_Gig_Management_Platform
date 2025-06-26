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
    // Check if we're in demo mode
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      console.log('Demo mode: Simulating payment intent creation');
      // Simulate a successful response in demo mode
      return {
        clientSecret: 'demo_pi_secret_' + Math.random().toString(36).substring(2, 15),
        error: null
      };
    }
    
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
    // Check if we're in demo mode
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      console.log('Demo mode: Simulating checkout session creation');
      // Simulate a successful response in demo mode
      return {
        sessionId: 'demo_cs_' + Math.random().toString(36).substring(2, 15),
        url: `${window.location.origin}/payment-success?demo=true`,
        error: null
      };
    }
    
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
    // Check if we're in demo mode
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY || paymentIntentId.startsWith('demo_')) {
      console.log('Demo mode: Simulating payment intent retrieval');
      // Simulate a successful response in demo mode
      return {
        id: paymentIntentId,
        amount: 5000, // $50.00
        currency: 'usd',
        status: 'succeeded',
        metadata: {
          payment_id: 'demo_payment_123',
          gig_id: 'demo_gig_123',
          description: 'Demo Payment'
        }
      };
    }
    
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
    // Check if we're in demo mode
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      console.log('Demo mode: Simulating payment method setup');
      // Simulate a successful response in demo mode
      return {
        success: true,
        paymentMethod: {
          id: 'demo_pm_' + Math.random().toString(36).substring(2, 15),
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242'
          }
        }
      };
    }
    
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
    // Check if we're in demo mode
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      console.log('Demo mode: Simulating payment methods listing');
      // Simulate a successful response in demo mode
      return {
        paymentMethods: [
          {
            id: 'demo_pm_1',
            type: 'card',
            card: {
              brand: 'visa',
              last4: '4242',
              exp_month: 12,
              exp_year: 2025
            }
          },
          {
            id: 'demo_pm_2',
            type: 'card',
            card: {
              brand: 'mastercard',
              last4: '5555',
              exp_month: 10,
              exp_year: 2024
            }
          }
        ]
      };
    }
    
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
    // Check if we're in demo mode
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      console.log('Demo mode: Simulating customer creation');
      // Simulate a successful response in demo mode
      return {
        customerId: 'demo_cus_' + Math.random().toString(36).substring(2, 15),
        email,
        name
      };
    }
    
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
    // Check if we're in demo mode
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      console.log('Demo mode: Simulating payment link creation');
      // Simulate a successful response in demo mode
      return {
        url: `${window.location.origin}/payment-success?demo=true`,
        id: 'demo_link_' + Math.random().toString(36).substring(2, 15)
      };
    }
    
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