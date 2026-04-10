'use client'

import dynamic from 'next/dynamic'

const ThreeWorkbench = dynamic(
  () => import('@/components/three/three-workbench'),
  { ssr: false }
)

export default function Home() {
  return <ThreeWorkbench />
}
