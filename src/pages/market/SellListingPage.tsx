import React, { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import {
  createListing, uploadListingPhoto, marketPhotoUrl,
  MARKET_CATEGORIES, MARKET_CONDITIONS, MARKET_MAX_PHOTOS,
  MarketCategory, MarketCondition, MarketFulfillment,
} from '@/lib/crewMarket';
import { ArrowLeft, ImagePlus, Loader2, X } from 'lucide-react';

// Sell a listing. Photos upload to market-photos/{seller_id}/… as soon as
// they're picked (before the listing exists) — the storage path, not a URL,
// is what gets stored in photo_paths. If the seller abandons the form the
// orphaned objects are cheap; a cleanup sweep can collect them later.
//
// Price entry is dollars; converted to integer cents once at submit — the
// DB CHECK constraint requires 100..10,000,000 cents ($1..$100k).

const SellListingPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MarketCategory>('tools');
  const [condition, setCondition] = useState<MarketCondition>('good');
  const [fulfillment, setFulfillment] = useState<MarketFulfillment>('both');
  const [price, setPrice] = useState('');
  const [photos, setPhotos] = useState<string[]>([]); // storage paths
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const addPhotos = async (files: FileList | null) => {
    if (!files || !profile) return;
    const remaining = MARKET_MAX_PHOTOS - photos.length;
    const batch = Array.from(files).slice(0, remaining);
    if (batch.length === 0) {
      toast.error(`Up to ${MARKET_MAX_PHOTOS} photos per listing`);
      return;
    }
    setUploading(true);
    const paths: string[] = [];
    for (const f of batch) {
      const { path, error } = await uploadListingPhoto(profile.id, f);
      if (error) toast.error(`Photo failed: ${error}`);
      else if (path) paths.push(path);
    }
    setPhotos((p) => [...p, ...paths]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const priceCents = Math.round(parseFloat(price || '0') * 100);
  const valid =
    title.trim().length >= 3 && title.trim().length <= 120 &&
    priceCents >= 100 && priceCents <= 10000000;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !valid || busy) return;
    setBusy(true);
    const { data, error } = await createListing({
      title: title.trim(),
      description: description.trim(),
      category, condition, fulfillment,
      price_cents: priceCents,
      photo_paths: photos,
    }, profile.id);
    setBusy(false);
    if (error) { toast.error(error); return; }
    toast.success('Listing is live');
    navigate(data?.id ? `/market/${data.id}` : '/market/mine');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link to="/market"><ArrowLeft className="w-4 h-4 mr-2" />Back to Market</Link>
      </Button>

      <h1 className="text-3xl font-bold mb-2">Sell gear to the crew</h1>
      <p className="text-muted-foreground mb-6">
        Flexzora takes 5% when it sells. Buyers pay by card; you get paid
        through your connected payout account.
      </p>

      <form onSubmit={submit} className="space-y-6">
        {/* Photos */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Photos</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {photos.map((p) => (
                <div key={p} className="relative w-24 h-24 rounded-lg overflow-hidden border">
                  <img src={marketPhotoUrl(p)} alt="" className="w-full h-full object-cover" />
                  <button type="button"
                          onClick={() => setPhotos(photos.filter((x) => x !== p))}
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {photos.length < MARKET_MAX_PHOTOS && (
                <button type="button" onClick={() => fileRef.current?.click()}
                        className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/40 flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                  <span className="text-[10px] mt-1">Add</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
                   multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
            <p className="text-xs text-muted-foreground mt-3">
              Up to {MARKET_MAX_PHOTOS} photos. Good light and a clean background sell faster.
            </p>
          </CardContent>
        </Card>

        {/* Basics */}
        <Card>
          <CardHeader><CardTitle className="text-lg">The item</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="m-title">Title</Label>
              <Input id="m-title" value={title} maxLength={120}
                     onChange={(e) => setTitle(e.target.value)}
                     placeholder="e.g. ARRI Skypanel 1200W — barely used" />
            </div>
            <div>
              <Label htmlFor="m-desc">Description</Label>
              <Textarea id="m-desc" value={description} maxLength={2000} rows={4}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Condition details, what's included, reason for selling…" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as MarketCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MARKET_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Condition</Label>
                <Select value={condition} onValueChange={(v) => setCondition(v as MarketCondition)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MARKET_CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Price + fulfillment */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Price &amp; fulfillment</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="m-price">Price (USD)</Label>
              <Input id="m-price" type="number" min="1" step="0.01" value={price}
                     onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
              <p className="text-xs text-muted-foreground mt-1">
                You receive the price minus 5% and Stripe's processing fee.
              </p>
            </div>
            <div>
              <Label>Fulfillment</Label>
              <div className="flex gap-2 mt-1">
                {(['both', 'pickup', 'ship'] as const).map((f) => (
                  <Button key={f} type="button"
                          variant={fulfillment === f ? 'default' : 'outline'}
                          className="flex-1 capitalize"
                          onClick={() => setFulfillment(f)}>
                    {f === 'both' ? 'Pickup or ship' : f}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {fulfillment === 'pickup' && 'Buyers arrange local handoff — you set the meetup.'}
                {fulfillment === 'ship' && 'You ship it; tracking is shared with the buyer at handoff.'}
                {fulfillment === 'both' && 'Buyer chooses pickup or shipping at checkout.'}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Badge variant="outline">5% platform fee on sale</Badge>
          <Button type="submit" size="lg" disabled={!valid || busy || uploading}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {uploading ? 'Uploading photos…' : 'List it'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default SellListingPage;
