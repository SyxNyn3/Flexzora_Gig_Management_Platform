import React, { useEffect, useRef } from 'react';
import { loadGoogleMaps, hasMapsKey } from '@/lib/maps';

interface VenueMapProps {
  lat: number;
  lng: number;
  label?: string;
}

/**
 * Renders a Google Map centered on the gig venue. Only mounts when the
 * gig has coordinates AND the Maps key is configured — otherwise renders
 * nothing, so gig pages work identically before/without the key.
 */
const VenueMap: React.FC<VenueMapProps> = ({ lat, lng, label }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !hasMapsKey) return;
    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (cancelled || !ref.current) return;
      const map = new google.maps.Map(ref.current, {
        center: { lat, lng },
        zoom: 14,
        disableDefaultUI: true,
        zoomControl: true,
      });
      new google.maps.Marker({
        position: { lat, lng },
        map,
        title: label,
      });
    }).catch(() => { /* map is decorative — silent */ });
    return () => { cancelled = true; };
  }, [lat, lng, label]);

  if (!hasMapsKey) return null;
  return <div ref={ref} className="w-full h-48 rounded-lg overflow-hidden border border-border/60 mt-2" />;
};

export default VenueMap;
