// Crew-to-crew tools marketplace ("Flexzora Market") — data layer.
//
// Backend contract (supabase/migrations/20261216000000 + 20261217000000):
//   * marketplace_listings — sellers CRUD their own rows directly under RLS;
//     'sold' status is reserved for the payment path (guard trigger).
//   * marketplace_orders — NO direct writes. Orders are created by the
//     market_create_order RPC (price + 5% fee snapshotted server-side) and
//     transitioned by party RPCs or the Stripe webhook (service role).
//   * Checkout goes through the market-checkout edge function, which reads
//     the order row server-side and returns a Stripe Checkout URL. The
//     browser never supplies an amount.
//   * Photos live in the public market-photos bucket under
//     {seller_profile_id}/{uuid}.webp — storage policies enforce the folder.
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types — mirror the table columns; kept local rather than generated so the
// marketplace can evolve without a full Database type regen.
// ---------------------------------------------------------------------------
export type MarketCategory = 'tools' | 'cases' | 'cables' | 'apparel' | 'vehicles' | 'other';
export type MarketCondition = 'new' | 'like_new' | 'good' | 'fair';
export type MarketFulfillment = 'pickup' | 'ship' | 'both';
export type MarketListingStatus = 'active' | 'sold' | 'removed';
export type MarketOrderStatus =
  | 'pending_payment' | 'paid' | 'shipped' | 'delivered'
  | 'cancelled' | 'disputed';

export interface MarketListing {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  category: MarketCategory;
  condition: MarketCondition;
  price_cents: number;
  fulfillment: MarketFulfillment;
  photo_paths: string[];
  status: MarketListingStatus;
  created_at: string;
  updated_at: string;
  // Joined at read time when we ask for it — seller display name only,
  // never sensitive fields.
  seller_name?: string | null;
}

export interface MarketOrder {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount_cents: number;
  fee_cents: number;
  currency: string;
  fulfillment: 'pickup' | 'ship';
  shipping_address: {
    line1?: string; line2?: string; city?: string;
    state?: string; zip?: string; country?: string;
  } | null;
  tracking_number: string | null;
  tracking_url: string | null;
  status: MarketOrderStatus;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  // Snapshotted at order creation — the listing row becomes RLS-invisible
  // to the buyer once sold, so the embed alone can't describe the order.
  listing_title?: string | null;
  listing_photo?: string | null;
}

export interface MarketOrderWithListing extends MarketOrder {
  listing?: Pick<MarketListing, 'id' | 'title' | 'price_cents' | 'photo_paths' | 'category' | 'condition'> | null;
}

// ---------------------------------------------------------------------------
// Formatting helpers shared by the market pages.
// ---------------------------------------------------------------------------
export const marketMoney = (cents: number): string =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const MARKET_CATEGORIES: { value: MarketCategory; label: string }[] = [
  { value: 'tools', label: 'Tools' },
  { value: 'cases', label: 'Cases & bags' },
  { value: 'cables', label: 'Cables & power' },
  { value: 'apparel', label: 'Apparel & merch' },
  { value: 'vehicles', label: 'Vehicles & rentals' },
  { value: 'other', label: 'Other' },
];

export const MARKET_CONDITIONS: { value: MarketCondition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
];

export const categoryLabel = (c: MarketCategory): string =>
  MARKET_CATEGORIES.find((x) => x.value === c)?.label ?? c;
export const conditionLabel = (c: MarketCondition): string =>
  MARKET_CONDITIONS.find((x) => x.value === c)?.label ?? c;

export const orderStatusLabel = (s: MarketOrderStatus): string =>
  ({ pending_payment: 'Awaiting payment', paid: 'Paid', shipped: 'Shipped',
     delivered: 'Delivered', cancelled: 'Cancelled', disputed: 'Disputed' })[s];

// Public URL for a stored photo path. The bucket is public-read; paths are
// opaque uuids so there's nothing sensitive to sign.
export const marketPhotoUrl = (path: string): string => {
  const { data } = supabase.storage.from('market-photos').getPublicUrl(path);
  return data.publicUrl;
};

// ---------------------------------------------------------------------------
// Listings — direct table access under RLS (seller owns their rows).
// ---------------------------------------------------------------------------
export async function browseListings(opts?: {
  category?: MarketCategory;
  query?: string;
}): Promise<{ data: MarketListing[] | null; error: string | null }> {
  try {
    let q = supabase
      .from('marketplace_listings')
      .select('*, seller:profiles!marketplace_listings_seller_id_fkey(full_name)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(100);
    if (opts?.category) q = q.eq('category', opts.category);
    if (opts?.query?.trim()) {
      // PostgREST `or` with ilike — wildcards are escaped by wrapping the term;
      // commas inside the term would break the filter grammar, so strip them.
      const term = opts.query.trim().replace(/[,()\\]/g, ' ').replace(/[%_]/g, '');
      if (term) q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []).map((r) => {
      const { seller, ...rest } = r as MarketListing & { seller?: { full_name?: string } | null };
      return { ...rest, seller_name: seller?.full_name ?? null };
    });
    return { data: rows, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getListing(id: string): Promise<{ data: MarketListing | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('*, seller:profiles!marketplace_listings_seller_id_fkey(full_name)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { data: null, error: null };
    const { seller, ...rest } = data as MarketListing & { seller?: { full_name?: string } | null };
    return { data: { ...rest, seller_name: seller?.full_name ?? null }, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function myListings(): Promise<{ data: MarketListing[] | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    // RLS already scopes this to the caller's own rows (active + history).
    return { data: (data ?? []) as MarketListing[], error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ListingInput {
  title: string;
  description: string;
  category: MarketCategory;
  condition: MarketCondition;
  price_cents: number;
  fulfillment: MarketFulfillment;
  photo_paths: string[];
}

export async function createListing(input: ListingInput, sellerId: string) {
  try {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .insert({ ...input, seller_id: sellerId, status: 'active' })
      .select('id')
      .single();
    if (error) throw error;
    return { data, error: null as string | null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateListing(id: string, input: Partial<ListingInput>) {
  try {
    // status is deliberately NOT updatable here — 'sold' is owned by the
    // payment path; sellers can only toggle active<->removed via removeListing.
    const { error } = await supabase
      .from('marketplace_listings')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return { error: null as string | null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Sellers toggle active<->removed only. 'sold' is owned by the payment
 * path — the guard trigger silently reverts any other transition anyway,
 * but we never send one. */
export async function setListingStatus(id: string, status: 'active' | 'removed') {
  try {
    const { error } = await supabase
      .from('marketplace_listings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return { error: null as string | null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteListing(id: string) {
  try {
    const { error } = await supabase.from('marketplace_listings').delete().eq('id', id);
    if (error) throw error;
    return { error: null as string | null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Photos — market-photos bucket, seller's own folder enforced by storage RLS.
// Photos are downscaled to a sane listing size (larger than avatars) before
// upload so phone photos don't blow the bucket cap.
// ---------------------------------------------------------------------------
const PHOTO_ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_EDGE = 1600;
const PHOTO_MAX_FILES = 6;

export const MARKET_MAX_PHOTOS = PHOTO_MAX_FILES;

async function preparePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob) throw new Error('Could not encode image');
    return blob;
  } finally {
    bitmap.close();
  }
}

/** Upload one photo; returns the storage path to keep in photo_paths. */
export async function uploadListingPhoto(sellerId: string, file: File) {
  try {
    if (!PHOTO_ACCEPTED.includes(file.type)) throw new Error('JPEG, PNG or WebP only');
    const blob = await preparePhoto(file);
    const path = `${sellerId}/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage.from('market-photos').upload(path, blob, {
      contentType: 'image/webp',
      upsert: false,
    });
    if (error) throw error;
    return { path, error: null as string | null };
  } catch (e) {
    return { path: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Orders — RPC-only writes. Every function maps to a guarded security-definer
// function; the browser supplies only the order id (+ fulfillment/address at
// creation time).
// ---------------------------------------------------------------------------
export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

/** Start a purchase. Returns the new order id; price/fee are server-side. */
export async function createOrder(
  listingId: string,
  fulfillment: 'pickup' | 'ship',
  shippingAddress?: ShippingAddress,
) {
  try {
    const { data, error } = await supabase.rpc('market_create_order', {
      p_listing_id: listingId,
      p_fulfillment: fulfillment,
      p_shipping_address: shippingAddress ?? null,
    });
    if (error) throw error;
    return { orderId: data as string, error: null as string | null };
  } catch (e) {
    return { orderId: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Create the Stripe Checkout session for an unpaid order and return its URL. */
export async function checkoutOrder(orderId: string) {
  try {
    const { data, error } = await supabase.functions.invoke('market-checkout', {
      body: { order_id: orderId },
    });
    if (error) throw error;
    if (!data?.url) throw new Error(data?.error || data?.message || 'Checkout unavailable');
    return { url: data.url as string, error: null as string | null };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function myOrders(): Promise<{ data: MarketOrderWithListing[] | null; error: string | null }> {
  try {
    // Orders I bought or sold — RLS scopes to parties. Join the listing for
    // title/photos so order rows are self-describing.
    const { data, error } = await supabase
      .from('marketplace_orders')
      .select('*, listing:marketplace_listings(id,title,price_cents,photo_paths,category,condition)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { data: (data ?? []) as MarketOrderWithListing[], error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function markShipped(orderId: string, trackingNumber?: string, trackingUrl?: string) {
  try {
    const { error } = await supabase.rpc('market_mark_shipped', {
      p_order_id: orderId,
      p_tracking_number: trackingNumber || null,
      p_tracking_url: trackingUrl || null,
    });
    if (error) throw error;
    return { error: null as string | null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function markDelivered(orderId: string) {
  try {
    const { error } = await supabase.rpc('market_mark_delivered', { p_order_id: orderId });
    if (error) throw error;
    return { error: null as string | null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function cancelOrder(orderId: string) {
  try {
    const { error } = await supabase.rpc('market_cancel_order', { p_order_id: orderId });
    if (error) throw error;
    return { error: null as string | null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
