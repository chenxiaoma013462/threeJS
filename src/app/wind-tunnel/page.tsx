'use client'

import dynamic from 'next/dynamic'

const WindTunnelScene = dynamic(
  () => import('@/components/wind-tunnel/wind-tunnel-scene'),
  { ssr: false }
)

export default function WindTunnelPage() {
  return <WindTunnelScene />
}
