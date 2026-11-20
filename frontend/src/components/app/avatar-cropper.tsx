"use client";

import { useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useTranslations } from "@/i18n/use-translations";

const VIEW = 256; // crop area in CSS px
const OUTPUT = 256; // uploaded photo in px
const MAX_ZOOM = 4;

interface Frame {
  zoom: number; // 1 = the photo just covers the circle
  x: number; // photo's top-left corner inside the crop area
  y: number;
}

// Profile-photo framing: drag to move, slider / wheel / pinch to zoom. Only what
// is inside the circle is exported, as a OUTPUT×OUTPUT JPEG data URL (re-encoding
// also drops EXIF/GPS). Mount it with key={src} so each photo starts afresh.
export function AvatarCropper({
  src,
  onCancel,
  onConfirm,
  onError,
  busy,
}: {
  src: string | null;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
  onError: () => void;
  busy?: boolean;
}) {
  const t = useTranslations();
  const imgRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<Frame>({ zoom: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  const baseScale = size ? Math.max(VIEW / size.w, VIEW / size.h) : 1;

  // Keep the photo covering the whole crop area.
  const clamp = (f: Frame): Frame => {
    if (!size) return f;
    const zoom = Math.min(MAX_ZOOM, Math.max(1, f.zoom));
    const scale = baseScale * zoom;
    return {
      zoom,
      x: Math.min(0, Math.max(VIEW - size.w * scale, f.x)),
      y: Math.min(0, Math.max(VIEW - size.h * scale, f.y)),
    };
  };

  // Zoom keeping the centre of the circle on the same point of the photo.
  const zoomTo = (zoom: number) =>
    setFrame((f) => {
      const old = baseScale * f.zoom;
      const next = baseScale * Math.min(MAX_ZOOM, Math.max(1, zoom));
      const cx = (VIEW / 2 - f.x) / old;
      const cy = (VIEW / 2 - f.y) / old;
      return clamp({ zoom, x: VIEW / 2 - cx * next, y: VIEW / 2 - cy * next });
    });

  const onLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const scale = Math.max(VIEW / w, VIEW / h);
    setSize({ w, h });
    setFrame({ zoom: 1, x: (VIEW - w * scale) / 2, y: (VIEW - h * scale) / 2 });
  };

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch.current = { dist: distance(), zoom: frame.zoom };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      zoomTo(pinch.current.zoom * (distance() / pinch.current.dist));
    } else if (pointers.current.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setFrame((f) => clamp({ ...f, x: f.x + dx, y: f.y + dy }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const confirm = () => {
    const img = imgRef.current;
    if (!img || !size) return;
    const scale = baseScale * frame.zoom;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return onError();
    ctx.drawImage(img, -frame.x / scale, -frame.y / scale, VIEW / scale, VIEW / scale, 0, 0, OUTPUT, OUTPUT);
    onConfirm(canvas.toDataURL("image/jpeg", 0.85));
  };

  const scale = baseScale * frame.zoom;

  return (
    <Dialog open={src !== null} onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("profile.cropTitle")}</DialogTitle>
          <DialogDescription>{t("profile.cropHint")}</DialogDescription>
        </DialogHeader>

        <div
          className="relative mx-auto cursor-grab touch-none overflow-hidden rounded-lg bg-muted select-none active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => zoomTo(frame.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))}
        >
          {src && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL being framed
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={onLoad}
              onError={onError}
              className="absolute max-w-none"
              style={
                size
                  ? { left: frame.x, top: frame.y, width: size.w * scale, height: size.h * scale }
                  : { opacity: 0 }
              }
            />
          )}
          {/* Darkens everything outside the circle */}
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-white/80" />
        </div>

        <div className="flex items-center gap-3 px-2">
          <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Slider
            aria-label={t("profile.zoom")}
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={[frame.zoom]}
            onValueChange={(v) => zoomTo(Array.isArray(v) ? v[0] : v)}
            disabled={!size}
          />
          <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={confirm} disabled={!size || busy}>
            {busy ? t("profile.saving") : t("profile.usePhoto")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
