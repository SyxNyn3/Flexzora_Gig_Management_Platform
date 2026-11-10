import React from 'react';
import Navbar from './Navbar';
import { Toaster } from '@/components/ui/sonner';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  // overflow-x-clip (not hidden): hidden creates a scroll container on
  // this ancestor, which breaks the sidebar's position:sticky pinning.
  return (
    <div className="relative min-h-screen [overflow-x:clip] bg-[#0A0A0B] text-zinc-100">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      {/* Ambient color fields — the glass surfaces blur/refract these, so
          keep them subtle but present in every viewport quadrant. */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-amber-400/[0.07] blur-[120px]" />
      <div className="pointer-events-none absolute top-[35%] -left-40 h-[420px] w-[420px] rounded-full bg-sky-500/[0.05] blur-[140px]" />
      <div className="pointer-events-none absolute bottom-[10%] -right-40 h-[480px] w-[480px] rounded-full bg-violet-500/[0.05] blur-[160px]" />
      <div className="pointer-events-none absolute top-[60%] left-[30%] h-[300px] w-[500px] rounded-full bg-amber-300/[0.03] blur-[130px]" />
      <div className="relative flex min-h-screen">
        <Navbar />
        <main className="flex-1 min-w-0 pt-14 md:pt-0">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
};

export default Layout;
