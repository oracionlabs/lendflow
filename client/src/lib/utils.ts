import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useSyncExternalStore } from 'react'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Reactive currency store ─────────────────────────────────────────────────

let _currency = 'USD'
const _listeners = new Set<() => void>()

export function setCurrency(currency: string) {
  if (_currency === currency) return
  _currency = currency
  _listeners.forEach(l => l())
}

export function useCurrency(): string {
  return useSyncExternalStore(
    (cb) => { _listeners.add(cb); return () => _listeners.delete(cb) },
    () => _currency,
  )
}

export function getCurrencySymbol(currency: string): string {
  const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0)
  return parts.find(p => p.type === 'currency')?.value ?? currency
}

export function useCurrencySymbol(): string {
  const currency = useCurrency()
  return getCurrencySymbol(currency)
}

export function formatCents(cents: number, currency?: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency ?? _currency,
  }).format(cents / 100)
}

const percentFmt = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatPercent(decimal: number): string {
  return percentFmt.format(decimal)
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatMonthYear(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}

export function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
