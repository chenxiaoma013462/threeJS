'use client'

import { useRef, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import type { SceneObject } from '@/types/scene'
import SceneContent from './scene-content'

interface SceneCanvasProps {
  objects: SceneObject[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}

export default function SceneCanvas({ objects, selectedId, onSelect, canvasRef }: SceneCanvasProps) {
  const controlsRef = useRef(null)

  const handlePointerMissed = useCallback(() => {
    onSelect(null)
  }, [onSelect])

  return (
    <Canvas
      ref={canvasRef}
      camera={{ position: [5, 5, 5], fov: 50 }}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      onPointerMissed={handlePointerMissed}
      style={{ background: '#1a1a2e' }}
    >
      {/* 灯光 */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-5, 5, -5]} intensity={0.3} />

      {/* 网格与坐标轴 */}
      <Grid
        infiniteGrid
        cellSize={1}
        sectionSize={5}
        cellColor="#444466"
        sectionColor="#666688"
        fadeDistance={30}
      />
      <axesHelper args={[5]} />

      {/* 场景对象 */}
      <SceneContent
        objects={objects}
        selectedId={selectedId}
        onSelect={onSelect}
      />

      {/* 相机控制 */}
      <OrbitControls ref={controlsRef} makeDefault />

      {/* 视角小部件 */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport labelColor="white" axisHeadScale={1} />
      </GizmoHelper>
    </Canvas>
  )
}
