"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";

const SWIPE_THRESHOLD = 72;
const SWIPE_DEAD_ZONE = 12;
const ACTION_WIDTH = 144;

export function SwipeCard({
  children,
  onTap,
  onEdit,
  onDelete,
  accentColor,
  className,
}: {
  children: ReactNode;
  onTap?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  accentColor?: string;
  className?: string;
}) {
  const t = useTranslations();
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);
  const locked = useRef(false);
  const isOpen = useRef(false);
  const [actionsVisible, setActionsVisible] = useState(false);

  const setTranslate = useCallback((x: number, animate = false) => {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform 280ms cubic-bezier(.4,0,.2,1)" : "none";
    el.style.transform = `translateX(${x}px)`;
  }, []);

  const resetPosition = useCallback(() => {
    setTranslate(0, true);
    isOpen.current = false;
    setTimeout(() => { if (!isOpen.current) setActionsVisible(false); }, 300);
  }, [setTranslate]);

  const openActions = useCallback(() => {
    setActionsVisible(true);
    setTranslate(-ACTION_WIDTH, true);
    isOpen.current = true;
  }, [setTranslate]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    swiping.current = false;
    locked.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    currentX.current = dx;

    if (!locked.current) {
      if (Math.abs(dx) < SWIPE_DEAD_ZONE) return;
      locked.current = true;
      swiping.current = true;
      setActionsVisible(true);
    }

    const offset = isOpen.current ? -ACTION_WIDTH + dx : dx;
    if (offset > 0) { setTranslate(0); return; }
    setTranslate(Math.max(offset, -ACTION_WIDTH));
  }, [setTranslate]);

  const handleTouchEnd = useCallback(() => {
    if (!swiping.current) return;
    const traveled = Math.abs(currentX.current);
    if (isOpen.current) {
      if (traveled > SWIPE_THRESHOLD && currentX.current > 0) resetPosition();
      else openActions();
    } else {
      if (traveled > SWIPE_THRESHOLD && currentX.current < 0) openActions();
      else resetPosition();
    }
  }, [resetPosition, openActions]);

  const handleClick = useCallback(() => {
    if (swiping.current) return;
    if (isOpen.current) { resetPosition(); return; }
    onTap?.();
  }, [onTap, resetPosition]);

  useEffect(() => {
    const close = () => { if (isOpen.current) resetPosition(); };
    window.addEventListener("scroll", close, { passive: true });
    return () => window.removeEventListener("scroll", close);
  }, [resetPosition]);

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Swipe-behind actions */}
      <div className={`absolute inset-y-0 right-0 flex ${actionsVisible ? "" : "invisible"}`}>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); resetPosition(); }}
          className="flex w-[72px] items-center justify-center bg-blue-500 text-white active:bg-blue-600"
          aria-label={t("common.edit")}
        >
          <Pencil className="h-5 w-5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); resetPosition(); }}
          className="flex w-[72px] items-center justify-center bg-red-500 text-white active:bg-red-600"
          aria-label={t("common.delete")}
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      {/* Card foreground */}
      <div
        ref={trackRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        className={cn(
          "relative z-10 cursor-pointer bg-card px-3.5 py-3 active:bg-accent/50 transition-colors",
          "border border-border rounded-lg",
          accentColor && `border-l-[3px] ${accentColor}`,
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
