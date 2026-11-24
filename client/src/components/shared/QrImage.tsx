import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function QrImage({ value, caption }: { value: string; caption?: string }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, { margin: 1, width: 280 }).then(url => {
      if (!cancelled) setSrc(url)
    }).catch(() => {
      if (!cancelled) setSrc('')
    })
    return () => { cancelled = true }
  }, [value])

  if (!src) return null

  return (
    <figure className="space-y-2">
      <img src={src} alt={caption ?? 'QR code'} className="h-56 w-56 rounded-xl border bg-white p-2" />
      {caption && <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>}
    </figure>
  )
}
