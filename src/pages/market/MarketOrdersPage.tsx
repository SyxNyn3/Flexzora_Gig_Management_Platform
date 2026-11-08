import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import {
  myOrders, checkoutOrder, markShipped, markDelivered, cancelOrder,
  marketMoney, marketPhotoUrl, orderStatusLabel,
  MarketOrderWithListing, MarketOrderStatus,
} from '@/lib/crewMarket';
import { Package, Truck, CheckCircle2, ExternalLink, XCircle } from 'lucide-react';

// Order inbox — both sides of every marketplace purchase. Split into
// "Buying" (orders where I'm the buyer) and "Selling" (orders where I'm the
// seller) because the actions differ: buyers pay/cancel/confirm receipt,
// sellers mark shipped with tracking. All transitions go through the guarded
// RPCs — the UI only decides which buttons to show.
//
// The checkout redirect lands back here with ?paid=1 or ?cancelled=1. Payment
// confirmation itself arrives via the Stripe webhook, so on return we poll
// briefly for the status flip before declaring anything.

const statusTone: Record<MarketOrderStatus, string> = {
  pending_payment: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  paid: 'bg-green-500/15 text-green-600 border-green-500/30',
  shipped: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  delivered: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  cancelled: 'bg-muted text-muted-foreground border-border',
  disputed: 'bg-red-500/15 text-red-600 border-red-500/30',
};

const OrderCard: React.FC<{
  order: MarketOrderWithListing;
  side: 'buying' | 'selling';
  onChanged: () => void;
}> = ({ order, side, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? '');
  const [trackingUrl, setTrackingUrl] = useState(order.tracking_url ?? '');

  const listing = order.listing;
  const cover = listing?.photo_paths?.[0];

  const run = async (fn: () => Promise<{ error: string | null }>, okMsg: string) => {
    if (busy) return;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { toast.error(error); return; }
    toast.success(okMsg);
    onChanged();
  };

  const pay = async () => {
    setBusy(true);
    const { url, error } = await checkoutOrder(order.id);
    setBusy(false);
    if (error || !url) { toast.error(error || 'Checkout unavailable'); return; }
    window.location.href = url;
  };

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="w-20 h-20 rounded-lg bg-muted overflow-hidden shrink-0">
            {cover
              ? <img src={marketPhotoUrl(cover)} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Package className="w-6 h-6 opacity-40" /></div>}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold truncate">{listing?.title ?? 'Deleted listing'}</p>
              <Badge variant="outline" className={statusTone[order.status]}>
                {orderStatusLabel(order.status)}
              </Badge>
              <Badge variant="secondary" className="capitalize">{order.fulfillment}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {marketMoney(order.amount_cents)} · {format(new Date(order.created_at), 'MMM d, yyyy')}
              {side === 'selling' && ` · buyer keeps ${marketMoney(order.amount_cents - order.fee_cents)}`}
            </p>
            {order.shipping_address?.line1 && (
              <p className="text-xs text-muted-foreground mt-1">
                Ships to: {order.shipping_address.line1}
                {order.shipping_address.line2 ? `, ${order.shipping_address.line2}` : ''},{' '}
                {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}
              </p>
            )}
            {order.tracking_number && (
              <p className="text-xs mt-1 flex items-center gap-1">
                <Truck className="w-3 h-3" />
                {order.tracking_url ? (
                  <a href={order.tracking_url} target="_blank" rel="noreferrer"
                     className="text-primary underline inline-flex items-center gap-1">
                    {order.tracking_number}<ExternalLink className="w-3 h-3" />
                  </a>
                ) : order.tracking_number}
              </p>
            )}
          </div>

          {/* Actions — which buttons appear is dictated by status + side. */}
          <div className="shrink-0 flex flex-col gap-2 sm:items-end">
            {side === 'buying' && order.status === 'pending_payment' && (
              <>
                <Button size="sm" onClick={pay} disabled={busy}>Complete payment</Button>
                <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => run(() => cancelOrder(order.id), 'Order cancelled')}>
                  <XCircle className="w-4 h-4 mr-1" />Cancel
                </Button>
              </>
            )}
            {side === 'buying' && (order.status === 'paid' || order.status === 'shipped') && (
              <Button size="sm" disabled={busy}
                      onClick={() => run(() => markDelivered(order.id), 'Marked delivered')}>
                <CheckCircle2 className="w-4 h-4 mr-1" />
                {order.fulfillment === 'pickup' ? 'Confirm pickup' : 'Confirm delivered'}
              </Button>
            )}

            {side === 'selling' && order.status === 'paid' && (
              order.fulfillment === 'ship' ? (
                <Button size="sm" variant="outline" onClick={() => setShipOpen((v) => !v)}>
                  <Truck className="w-4 h-4 mr-1" />Mark shipped
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground max-w-[200px]">
                  Waiting for the buyer to confirm pickup.
                </p>
              )
            )}
            {side === 'selling' && order.status === 'shipped' && (
              <p className="text-xs text-muted-foreground max-w-[200px]">
                In transit — the buyer confirms delivery.
              </p>
            )}
          </div>
        </div>

        {/* Inline tracking form — seller only, paid+ship orders. */}
        {side === 'selling' && shipOpen && order.status === 'paid' && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`tn-${order.id}`}>Tracking number</Label>
                <Input id={`tn-${order.id}`} value={trackingNumber}
                       onChange={(e) => setTrackingNumber(e.target.value)}
                       placeholder="1Z999AA10123456784" />
              </div>
              <div>
                <Label htmlFor={`tu-${order.id}`}>Tracking URL (optional)</Label>
                <Input id={`tu-${order.id}`} value={trackingUrl}
                       onChange={(e) => setTrackingUrl(e.target.value)}
                       placeholder="https://…" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy}
                      onClick={() => run(
                        () => markShipped(order.id, trackingNumber.trim() || undefined, trackingUrl.trim() || undefined),
                        'Marked shipped')}>
                Confirm shipped
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShipOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const MarketOrdersPage: React.FC = () => {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<MarketOrderWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error: err } = await myOrders();
    if (err) setError(err); else { setError(null); setOrders(data ?? []); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Checkout redirects land here with ?paid=1 / ?cancelled=1. Payment state
    // flips via webhook, which can lag the redirect by a second or two —
    // poll a few times before giving up so a paid order doesn't look unpaid.
    if (searchParams.get('paid') === '1' || searchParams.get('cancelled') === '1') {
      let tries = 0;
      const t = setInterval(async () => {
        tries += 1;
        await load();
        if (tries >= 6) clearInterval(t);
      }, 2000);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchParams.get('paid') === '1') toast.success('Payment received — the seller will be notified by order status.');
    if (searchParams.get('cancelled') === '1') toast.info('Checkout cancelled — your order is still open if you change your mind.');
  }, [searchParams]);

  const { buying, selling } = useMemo(() => {
    const mine = profile?.id;
    return {
      buying: orders.filter((o) => o.buyer_id === mine),
      selling: orders.filter((o) => o.seller_id === mine),
    };
  }, [orders, profile?.id]);

  if (!profile) return null;

  const renderList = (list: MarketOrderWithListing[], side: 'buying' | 'selling') =>
    list.length === 0 ? (
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
        {side === 'buying' ? 'No purchases yet.' : 'No sales yet.'}
      </CardContent></Card>
    ) : (
      <div className="space-y-3">
        {list.map((o) => (
          <OrderCard key={o.id} order={o} side={side} onChanged={load} />
        ))}
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold mb-1">Market orders</h1>
      <p className="text-muted-foreground mb-6">Everything you've bought or sold on Flexzora Market.</p>

      {error && <Card className="mb-4"><CardContent className="py-4 text-destructive">{error}</CardContent></Card>}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : (
        <Tabs defaultValue="buying">
          <TabsList className="mb-4">
            <TabsTrigger value="buying">Buying ({buying.length})</TabsTrigger>
            <TabsTrigger value="selling">Selling ({selling.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="buying">{renderList(buying, 'buying')}</TabsContent>
          <TabsContent value="selling">{renderList(selling, 'selling')}</TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default MarketOrdersPage;
