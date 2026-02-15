// Type declarations for Razorpay SDK

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name?: string;
  description?: string;
  image?: string;
  order_id: string;
  handler?: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
    method?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
    hide_topbar?: boolean;
  };
  modal?: {
    escape?: boolean;
    backdropclose?: boolean;
    handleback?: boolean;
    confirm_close?: boolean;
    ondismiss?: () => void;
    animation?: boolean;
  };
  retry?: {
    enabled?: boolean;
    max_count?: number;
  };
  timeout?: number;
  remember_customer?: boolean;
  readonly?: boolean;
  hidden?: {
    contact?: boolean;
    email?: boolean;
  };
  callback_url?: string;
  redirect?: boolean;
}

interface RazorpayInstance {
  open(): void;
  close(): void;
  on(event: string, callback: (...args: any[]) => void): void;
}

export {};
