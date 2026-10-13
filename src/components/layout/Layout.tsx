import React from 'react';
import Navbar from './Navbar';
import { Toaster } from '@/components/ui/sonner';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0A0A0B] text-zinc-100">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-amber-400/[0.07] blur-[120px]" />
      <div className="relative">
        <Navbar />
        <main className="flex-1">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
};

export default Layout;
