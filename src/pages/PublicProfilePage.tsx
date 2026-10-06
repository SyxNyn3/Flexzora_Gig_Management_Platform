import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase';
import { money } from '@/components/marketplace/format';
import { Star, MapPin, Briefcase, ExternalLink, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface PublicProfile {
  full_name: string;
  username: string;
  avatar_url?: string;
  location?: string;
  bio?: string;
  hourly_rate?: number;
  experience_years?: number;
  average_rating?: number;
  review_count?: number;
  portfolio_url?: string;
  skills: { name: string; proficiency_level?: number; years_experience?: number }[];
  portfolio_items: {
    title: string;
    description?: string;
    url?: string;
    image_url?: string;
    category?: string;
    client?: string;
    date_completed?: string;
    is_featured?: boolean;
  }[];
  reviews: { rating: number; comment?: string; reviewer_name?: string; created_at: string }[];
}

const Stars: React.FC<{ rating: number }> = ({ rating }) => (
  <span className="inline-flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={`w-4 h-4 ${n <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
    ))}
  </span>
);

const PublicProfilePage: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);

  useEffect(() => {
    if (!username) return;
    supabase.rpc('get_public_profile', { p_username: username }).then(({ data }) => {
      setProfile((data as PublicProfile | null) ?? null);
    });
  }, [username]);

  if (profile === undefined) {
    return <div className="max-w-3xl mx-auto p-6 space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }

  if (profile === null) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center py-24">
        <h1 className="text-xl font-semibold mb-2">Profile not found</h1>
        <p className="text-sm text-muted-foreground">This worker profile doesn't exist or isn't public yet.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <Card>
          <CardContent className="p-6 flex items-start gap-5">
            <Avatar className="w-20 h-20">
              <AvatarImage src={profile.avatar_url} />
              <AvatarFallback className="text-xl">{profile.full_name.split(' ').map((s) => s[0]).join('').slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{profile.full_name}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                {profile.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{profile.location}</span>}
                {profile.experience_years != null && <span className="inline-flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{profile.experience_years} yrs experience</span>}
                {profile.hourly_rate != null && <span>{money(profile.hourly_rate)}/hr</span>}
              </div>
              {profile.average_rating != null && profile.review_count != null && profile.review_count > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <Stars rating={profile.average_rating} />
                  <span className="text-sm">{profile.average_rating.toFixed(1)} · {profile.review_count} reviews</span>
                </div>
              )}
              {profile.portfolio_url && (
                <a href={profile.portfolio_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary mt-2 hover:underline">
                  Portfolio site <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        {profile.bio && (
          <Card><CardContent className="p-6"><p className="text-sm whitespace-pre-line">{profile.bio}</p></CardContent></Card>
        )}

        {profile.skills.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Skills</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {profile.skills.map((s) => (
                <Badge key={s.name} variant="secondary">{s.name}{s.years_experience ? ` · ${s.years_experience}y` : ''}</Badge>
              ))}
            </CardContent>
          </Card>
        )}

        {profile.portfolio_items.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Portfolio</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3">
              {profile.portfolio_items.map((item, i) => (
                <div key={i} className="border rounded-md p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{item.title}</p>
                    {item.is_featured && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />}
                  </div>
                  {item.description && <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {item.client && <span>{item.client}</span>}
                    {item.date_completed && <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(item.date_completed), 'MMM yyyy')}</span>}
                  </div>
                  {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">View <ExternalLink className="w-3 h-3" /></a>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {profile.reviews.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Recent reviews</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {profile.reviews.map((r, i) => (
                <div key={i} className="border-b last:border-0 pb-3 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <span className="text-xs text-muted-foreground">{r.reviewer_name ?? 'Anonymous'} · {format(new Date(r.created_at), 'MMM yyyy')}</span>
                  </div>
                  {r.comment && <p className="text-sm mt-1">{r.comment}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4">
          Crew profiles on <Link to="/" className="text-primary hover:underline">FlexZora</Link>
        </p>
      </div>
    </div>
  );
};

export default PublicProfilePage;
