import React, { useRef, useState, useEffect } from 'react';

// Drawn-signature capture for deal memos. Pointer events cover mouse + touch;
// the canvas exports a PNG data URL that deal_memo_sign stores on the memo.
// Empty canvas exports '' so callers can tell "signed" from "skipped".

interface Props {
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

const SignaturePad: React.FC<Props> = ({ onChange, height = 140 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // Size the backing store to the displayed size so strokes aren't blurry.
    const rect = c.getBoundingClientRect();
    c.width = rect.width * window.devicePixelRatio;
    c.height = height * window.devicePixelRatio;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#111827';
    }
  }, [height]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (empty) setEmpty(false);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const c = canvasRef.current;
    if (c) onChange(c.toDataURL('image/png'));
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height, touchAction: 'none' }}
        className="border rounded-md bg-white cursor-crosshair"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex justify-between items-center mt-1">
        <p className="text-xs text-muted-foreground">{empty ? 'Draw your signature (optional)' : 'Signature captured'}</p>
        <button type="button" onClick={clear} className="text-xs text-primary hover:underline">Clear</button>
      </div>
    </div>
  );
};

export default SignaturePad;
