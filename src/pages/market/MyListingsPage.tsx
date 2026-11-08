import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  myListings, setListingStatus, deleteListing, marketMoney, marketPhotoUrl,
  categoryLabel, conditionLabel, MarketListing,
} from '@/lib/crewMarket';
import { Package, Plus, Trash2 } from 'lucide-react';

// My listings — everything the seller has posted, including sold/removed
// history (RLS returns the seller's own rows regardless of status). Sellers
// can relist a removed item or delete a listing that never sold; 'sold' is
// terminal and managed through orders.

const statusBadge = (s: MarketListing['status']) =>
  s === 'active' ? 'bg-green-500/15 text-green-600 border-green-500/30'
  : s === 'sold' ? 'bg-blue-500/15 text-blue-600 border-blue-500/30'
  : 'bg-muted text-muted-foreground border-border';

const MyListingsPage: React.FC = () => {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error: err } = await myListings();
    if (err) setError(err); else { setError(null); setListings(data ?? []); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleStatus = async (l: MarketListing) => {
    const next = l.status === 'active' ? 'removed' : 'active';
    const { error: err } = await setListingStatus(l.id, next);
    if (err) { toast.error(err); return; }
    toast.success(next === 'removed' ? 'Listing removed' : 'Listing is live again');
    load();
  };

  const remove = async (l: MarketListing) => {
    if (!window.confirm(`Delete "${l.title}"? This can't be undone.`)) return;
    const { error: err } = await deleteListing(l.id);
    if (err) { toast.error(err); return; }
    toast.success('Listing deleted');
    load();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">My listings</h1>
          <p className="text-muted-foreground mt-1">Gear you're selling on Flexzora Market.</p>
        </div>
        <Button asChild><Link to="/market/sell"><Plus className="w-4 h-4 mr-2" />New listing</Link></Button>
      </div>

      {error && <Card className="mb-4"><CardContent className="py-4 text-destructive">{error}</CardContent></Card>}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : listings.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No listings yet</h2>
            <p className="text-muted-foreground mb-6">Clear out the trailer — sell what the next crew needs.</p>
            <Button asChild><Link to="/market/sell">Sell your first item</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => {
            const cover = l.photo_paths?.[0];
            return (
              <Card key={l.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <Link to={`/market/${l.id}`} className="w-20 h-20 rounded-lg bg-muted overflow-hidden shrink-0">
                    {cover
                      ? <img src={marketPhotoUrl(cover)} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Package className="w-6 h-6 opacity-40" /></div>}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/market/${l.id}`} className="font-semibold hover:text-primary truncate">{l.title}</Link>
                      <Badge variant="outline" className={`capitalize ${statusBadge(l.status)}`}>{l.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {categoryLabel(l.category)} · {conditionLabel(l.condition)} ·{' '}
                      {l.fulfillment === 'pickup' ? 'Pickup' : l.fulfillment === 'ship' ? 'Ships' : 'Pickup or ship'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold">{marketMoney(l.price_cents)}</p>
                    <p className="text-xs text-muted-foreground">
                      you keep ~{marketMoney(Math.round(l.price_cents * 0.95))}
                    </p>
                  </div>
                  {l.status !== 'sold' && (
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => toggleStatus(l)}>
                        {l.status === 'active' ? 'Remove' : 'Relist'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(l)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyListingsPage;
