import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { browseListings, marketMoney, marketPhotoUrl, categoryLabel, conditionLabel,
         MARKET_CATEGORIES, MarketListing, MarketCategory } from '@/lib/crewMarket';
import { Package, Plus, Search } from 'lucide-react';

// Flexzora Market — browse page. Lists active crew-to-crew listings with
// category filter + text search. Everything shown comes from live
// marketplace_listings rows; RLS guarantees only 'active' listings (plus
// the viewer's own) are ever returned.

const ListingCard: React.FC<{ listing: MarketListing }> = ({ listing }) => {
  const cover = listing.photo_paths?.[0];
  return (
    <Link to={`/market/${listing.id}`} className="group block">
      <Card className="overflow-hidden h-full transition-shadow group-hover:shadow-lg group-hover:shadow-primary/10">
        <div className="aspect-[4/3] bg-muted relative overflow-hidden">
          {cover ? (
            <img src={marketPhotoUrl(cover)} alt={listing.title}
                 className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Package className="w-10 h-10 opacity-40" />
            </div>
          )}
          <Badge variant="secondary" className="absolute top-2 left-2 capitalize">
            {categoryLabel(listing.category)}
          </Badge>
        </div>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug line-clamp-2">{listing.title}</h3>
            <span className="font-bold text-primary whitespace-nowrap">
              {marketMoney(listing.price_cents)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 capitalize">
            {conditionLabel(listing.condition)} · {listing.fulfillment === 'pickup' ? 'Pickup' :
             listing.fulfillment === 'ship' ? 'Ships' : 'Pickup or ship'}
          </p>
          {listing.seller_name && (
            <p className="text-xs text-muted-foreground mt-1">by {listing.seller_name}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
};

const MarketBrowsePage: React.FC = () => {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<MarketCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Debounce the text search so each keystroke doesn't fire a query.
    const t = setTimeout(async () => {
      const { data, error: err } = await browseListings({
        category: category === 'all' ? undefined : category,
        query: search,
      });
      if (cancelled) return;
      if (err) setError(err); else { setError(null); setListings(data ?? []); }
      setLoading(false);
    }, query === search ? 0 : 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [category, search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Flexzora Market</h1>
          <p className="text-muted-foreground mt-1">
            Tools and gear sold crew-to-crew. Flexzora keeps 5% of each sale.
          </p>
        </div>
        <Button asChild>
          <Link to="/market/sell"><Plus className="w-4 h-4 mr-2" />Sell gear</Link>
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search listings…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearch(query)}
            onBlur={() => setSearch(query)}
            className="pl-9"
          />
        </div>
        <Tabs value={category} onValueChange={(v) => setCategory(v as MarketCategory | 'all')}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            {MARKET_CATEGORIES.map((c) => (
              <TabsTrigger key={c.value} value={c.value}>{c.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {error && (
        <Card><CardContent className="py-8 text-center text-destructive">{error}</CardContent></Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Nothing listed yet</h2>
            <p className="text-muted-foreground mb-6">
              Be the first to sell gear to the crew — cameras, cases, cables, carts, apparel.
            </p>
            <Button asChild><Link to="/market/sell">Sell your first item</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {listings.map((l) => <ListingCard key={l.id} listing={l} />)}
        </div>
      )}
    </div>
  );
};

export default MarketBrowsePage;
