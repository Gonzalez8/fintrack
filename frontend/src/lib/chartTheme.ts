/**
 * chartTheme.ts — Single source of truth for all chart visual tokens in Fintrack APEX.
 *
 * Usage (Recharts):
 *   const ct = useChartTheme()
 *   <Tooltip contentStyle={ct.tooltipStyle} labelStyle={ct.tooltipLabelStyle} ... />
 *   <XAxis tick={ct.axisTick} axisLine={false} tickLine={false} />
 *
 * Usage (lightweight-charts):
 *   import { DARK_TOKENS, LIGHT_TOKENS } from '@/lib/chartTheme'
 *   const t = isDark ? DARK_TOKENS : LIGHT_TOKENS
 *   chart.applyOptions({ layout: { background: { color: t.bg }, textColor: t.textMuted } })
 */

import { useState, useEffect } from 'react'

// Minimal CSS-properties alias so this .ts file doesn't need to import React namespace.
// Matches the subset we actually assign (Recharts contentStyle / wrapperStyle props).
type CSSProperties = Record<string, string | number | undefined>

// ─── Font ─────────────────────────────────────────────────────────────────────

export const CHART_FONT = "'JetBrains Mono', 'Fira Code', ui-monospace, monospace"

// ─── Palette — data series (10 stops, APEX-coherent) ─────────────────────────

export const CHART_COLORS = [
  '#3b82f6', // [0] blue-500  — primary APEX
  '#22c55e', // [1] green-500
  '#f59e0b', // [2] amber-500
  '#a855f7', // [3] purple-500
  '#06b6d4', // [4] cyan-500
  '#ef4444', // [5] red-500
  '#f97316', // [6] orange-500
  '#6366f1', // [7] indigo-500
  '#ec4899', // [8] pink-500
  '#14b8a6', // [9] teal-500
] as const

// ─── Semantic series colors ───────────────────────────────────────────────────

export const SERIES = {
  investments: '#3b82f6', // blue  — renta variable / inversiones
  cash:        '#f59e0b', // amber — efectivo
  rf:          '#22c55e', // green — renta fija
  dividends:   '#3b82f6', // blue
  interests:   '#22c55e', // green
  sales:       '#f59e0b', // amber
} as const

// ─── Semantic P&L ─────────────────────────────────────────────────────────────

export const POSITIVE = '#22c55e'
export const NEGATIVE = '#ef4444'

// ─── Token interface ──────────────────────────────────────────────────────────

export interface ChartTokens {
  /** Chart canvas / container background */
  bg: string
  /** Primary text on chart */
  text: string
  /** Secondary / axis label text */
  textMuted: string
  /** Grid line color */
  grid: string
  /** Scale border / crosshair color */
  border: string

  // ── Recharts-ready prop objects ──────────────────────────────────────────
  /** Recharts <Tooltip contentStyle={...}> */
  tooltipStyle: CSSProperties
  /** Recharts <Tooltip labelStyle={...}> */
  tooltipLabelStyle: CSSProperties
  /** Recharts <Tooltip itemStyle={...}> */
  tooltipItemStyle: CSSProperties
  /** Recharts <Tooltip cursor={...}> */
  tooltipCursor: CSSProperties
  /** Recharts <XAxis tick={...}> / <YAxis tick={...}> */
  axisTick: { fontSize: number; fill: string; fontFamily: string }
  /** Recharts <Legend wrapperStyle={...}> */
  legendStyle: CSSProperties
}

// ─── Dark tokens (APEX) ───────────────────────────────────────────────────────

export const DARK_TOKENS: ChartTokens = {
  bg:        '#111827',        // --card dark  (221 32% 10%)
  text:      '#e2e8f0',
  textMuted: '#94a3b8',        // --muted-foreground dark
  grid:      'rgba(30,45,69,0.4)',
  border:    '#1e2d45',

  tooltipStyle: {
    backgroundColor: '#131f35',   // slightly darker than card for contrast
    border:          '1px solid #1e2d45',
    borderRadius:    '8px',
    fontFamily:      CHART_FONT,
    fontSize:        '11px',
    color:           '#e2e8f0',
    boxShadow:       '0 8px 32px rgba(0,0,0,0.5)',
    padding:         '8px 12px',
  },
  tooltipLabelStyle: {
    color:        '#94a3b8',
    fontFamily:   CHART_FONT,
    marginBottom: '4px',
    fontSize:     '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  tooltipItemStyle: {
    fontFamily: CHART_FONT,
    padding:    '2px 0',
    fontSize:   '12px',
  },
  tooltipCursor: {
    stroke:          '#1e2d45',
    strokeWidth:     1,
    strokeDasharray: '4 4',
  },
  axisTick:    { fontSize: 10, fill: '#94a3b8', fontFamily: CHART_FONT },
  legendStyle: {
    fontSize:      '11px',
    fontFamily:    CHART_FONT,
    color:         '#94a3b8',
    width:         '100%',
    boxSizing:     'border-box' as const,
    paddingBottom: '4px',
  },
}

// ─── Light tokens ─────────────────────────────────────────────────────────────

export const LIGHT_TOKENS: ChartTokens = {
  bg:        '#ffffff',
  text:      '#0f1728',
  textMuted: '#6b7280',
  grid:      'rgba(229,231,235,0.7)',
  border:    '#e5e7eb',

  tooltipStyle: {
    backgroundColor: '#ffffff',
    border:          '1px solid #e5e7eb',
    borderRadius:    '8px',
    fontFamily:      CHART_FONT,
    fontSize:        '11px',
    color:           '#0f1728',
    boxShadow:       '0 4px 16px rgba(0,0,0,0.08)',
    padding:         '8px 12px',
  },
  tooltipLabelStyle: {
    color:        '#6b7280',
    fontFamily:   CHART_FONT,
    marginBottom: '4px',
    fontSize:     '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  tooltipItemStyle: {
    fontFamily: CHART_FONT,
    padding:    '2px 0',
    fontSize:   '12px',
  },
  tooltipCursor: {
    stroke:          '#e5e7eb',
    strokeWidth:     1,
    strokeDasharray: '4 4',
  },
  axisTick:    { fontSize: 10, fill: '#6b7280', fontFamily: CHART_FONT },
  legendStyle: {
    fontSize:      '11px',
    fontFamily:    CHART_FONT,
    color:         '#6b7280',
    width:         '100%',
    boxSizing:     'border-box' as const,
    paddingBottom: '4px',
  },
}

// ─── React hook ───────────────────────────────────────────────────────────────

/**
 * Returns the correct ChartTokens based on the current dark/light mode.
 * Reactively updates when the user toggles the theme.
 */
export function useChartTheme(): ChartTokens {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  )

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  return isDark ? DARK_TOKENS : LIGHT_TOKENS
}
