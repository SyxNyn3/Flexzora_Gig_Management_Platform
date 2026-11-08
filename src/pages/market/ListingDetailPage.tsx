import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import {
  getListing, createOrder, checkoutOrder, marketMoney, marketPhotoUrl,
  categoryLabel, conditionLabel, MarketListing,
} from '@/lib/crewMarket';
import { ArrowLeft, Loader2, Package, ShieldAlert } from 'lucide-react';

// Listing detail + checkout. The buy box offers pickup or ship depending on
// the listing's fulfillment setting; 'ship' collects a full address that is
// stored on the order row (service role reads it for the seller's benefit —
// it never goes to Stripe).
//
// Payment honesty: this is a destination charge — the buyer pays Flexzora
// Market, Stripe routes the item price minus the 5% platform fee to the
// seller's Connect account. There is NO escrow and no buyer protection
// program; copy says so plainly rather than implying otherwise.

interface ShipForm {
  line1: string; line2: string; city: string; state: string; zip: string; country: string;
}
const EMPTY_SHIP: ShipForm = { line1: '', line2: '', city: '', state: '', zip: '', country: 'US' };

const ListingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [listing, setListing] = useState<MarketListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);

  const [fulfillment, setFulfillment] = useState<'pickup' | 'ship' | null>(null);
  const [ship, setShip] = useState<ShipForm>(EMPTY_SHIP);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getListing(id).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) setNotFound(true);
      else {
        setListing(data);
        // Pre-select the only option when the listing doesn't allow both.
        if (data.fulfillment !== 'both') {
          setFulfillment(data.fulfillment === 'ship' ? 'ship' : 'pickup');
        }
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const isOwnListing = !!(listing && profile && listing.seller_id === profile.id);
  const canShip = listing?.fulfillment === 'ship' || listing?.fulfillment === 'both';
  const canPickup = listing?.fulfillment === 'pickup' || listing?.fulfillment === 'both';

  const shipValid =
    ship.line1.trim() !== '' && ship.city.trim() !== '' &&
    ship.state.trim() !== '' && ship.zip.trim() !== '';

  const buy = async () => {
    if (!listing || !fulfillment || busy) return;
    if (fulfillment === 'ship' && !shipValid) {
      toast.error('Please fill in the shipping address');
      return;
    }
    setBusy(true);
    // Step 1: create the order server-side (price + 5% fee snapshotted from
    // the listing row — the client sends none of it).
    const { orderId, error } = await createOrder(
      listing.id,
      fulfillment,
      fulfillment === 'ship'
        ? { line1: ship.line1.trim(), line2: ship.line2.trim() || undefined,
            city: ship.city.trim(), state: ship.state.trim(),
            zip: ship.zip.trim(), country: ship.country.trim() || 'US' }
        : undefined,
    );
    if (error || !orderId) {
      toast.error(error || 'Could not create order');
      setBusy(false);
      return;
    }
    // Step 2: open Stripe Checkout. Payment confirmation arrives via the
    // webhook, not this redirect — the orders page polls for the update.
    const { url, error: coError } = await checkoutOrder(orderId);
    if (coError || !url) {
      toast.error(coError || 'Checkout unavailable');
      setBusy(false);
      return;
    }
    window.location.href = url;
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid md:grid-cols-2 gap-8">
          <Skeleton className="aspect-[4/3] rounded-xl" />
          <div className="space-y-4"><Skeleton className="h-10 w-3/4" /><Skeleton className="h-24" /><Skeleton className="h-12" /></div>
        </div>
      </div>
    );
  }

  if (notFound || !listing) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">Listing not found</h1>
        <p className="text-muted-foreground mb-6">It may have sold or been removed.</p>
        <Button asChild variant="outline"><Link to="/market">Back to Market</Link></Button>
      </div>
    );
  }

  const photos = listing.photo_paths ?? [];
  const cover = photos[photoIdx] ? marketPhotoUrl(photos[photoIdx]) : null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link to="/market"><ArrowLeft className="w-4 h-4 mr-2" />Back to Market</Link>
      </Button>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Photo gallery */}
        <div>
          <div className="aspect-[4/3] rounded-xl bg-muted overflow-hidden">
            {cover ? (
              <img src={cover} alt={listing.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Package className="w-16 h-16 opacity-40" />
              </div>
            )}
          </div>
          {photos.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto">
              {photos.map((p, i) => (
                <button key={p} onClick={() => setPhotoIdx(i)}
                        className={`w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 ${i === photoIdx ? 'border-primary' : 'border-transparent'}`}>
                  <img src={marketPhotoUrl(p)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details + buy box */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary" className="capitalize">{categoryLabel(listing.category)}</Badge>
            <Badge variant="outline" className="capitalize">{conditionLabel(listing.condition)}</Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">{listing.title}</h1>
          <p className="text-lg text-muted-foreground mb-4">by {listing.seller_name || 'Flexzora crew'}</p>
          <p className="text-3xl font-bold text-primary mb-6">{marketMoney(listing.price_cents)}</p>

          {listing.description && (
            <div className="whitespace-pre-wrap text-sm text-foreground/90 mb-6">{listing.description}</div>
          )}

          {isOwnListing ? (
            <Card>
              <CardContent className="py-4 text-sm text-muted-foreground">
                This is your listing. Manage it from{' '}
                <Link to="/market/mine" className="text-primary underline">My listings</Link>.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <p className="font-semibold mb-2">How do you want it?</p>
                  <div className="flex gap-2">
                    {canPickup && (
                      <Button
                        variant={fulfillment === 'pickup' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => setFulfillment('pickup')}
                      >Local pickup</Button>
                    )}
                    {canShip && (
                      <Button
                        variant={fulfillment === 'ship' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => setFulfillment('ship')}
                      >Ships to me</Button>
                    )}
                  </div>
                </div>

                {fulfillment === 'ship' && (
                  <div className="space-y-3 border-t pt-4">
                    <p className="text-sm font-medium">Shipping address</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Label htmlFor="ship-line1">Address</Label>
                        <Input id="ship-line1" value={ship.line1}
                               onChange={(e) => setShip({ ...ship, line1: e.target.value })}
                               placeholder="123 Stagehand Way" />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="ship-line2">Apt / suite (optional)</Label>
                        <Input id="ship-line2" value={ship.line2}
                               onChange={(e) => setShip({ ...ship, line2: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="ship-city">City</Label>
                        <Input id="ship-city" value={ship.city}
                               onChange={(e) => setShip({ ...ship, city: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="ship-state">State</Label>
                          <Input id="ship-state" value={ship.state}
                                 onChange={(e) => setShip({ ...ship, state: e.target.value })} />
                        </div>
                        <div>
                          <Label htmlFor="ship-zip">ZIP</Label>
                          <Input id="ship-zip" value={ship.zip}
                                 onChange={(e) => setShip({ ...ship, zip: e.target.value })} />
                        </div>
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="ship-country">Country</Label>
                        <Input id="ship-country" value={ship.country}
                               onChange={(e) => setShip({ ...ship, country: e.target.value })} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Shipping cost isn't included — arrange freight with the seller after purchase.
                    </p>
                  </div>
                )}

                <Button className="w-full" size="lg" onClick={buy}
                        disabled={!fulfillment || busy || (fulfillment === 'ship' && !shipValid)}>
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {fulfillment ? `Pay ${marketMoney(listing.price_cents)}` : 'Choose pickup or shipping'}
                </Button>

                <div className="flex gap-2 text-xs text-muted-foreground">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    Payment goes to the seller through Stripe minus Flexzora's 5% fee.
                    There's no escrow or buyer protection — inspect the item at pickup,
                    or confirm delivery only after it arrives.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default ListingDetailPage;
