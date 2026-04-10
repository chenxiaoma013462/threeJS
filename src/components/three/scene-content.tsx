'use client'

import { useRef, Suspense } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { SceneObject, GeometryType } from '@/types/scene'

/** 几何体映射 */
function GeometryByType({ type }: { type: GeometryType }) {
  switch (type) {
    case 'box': return <boxGeometry args={[1, 1, 1]} />
    case 'sphere': return <sphereGeometry args={[0.5, 32, 32]} />
    case 'cylinder': return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
    case 'cone': return <coneGeometry args={[0.5, 1, 32]} />
    case 'torus': return <torusGeometry args={[0.5, 0.2, 16, 32]} />
  }
}

/** 加载的 GLTF 模型 */
function LoadedModel({ url, color }: { url: string; color: string }) {
  const { scene } = useGLTF(url)
  const cloned = scene.clone(true)

  cloned.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      // 保留原材质但叠加颜色调整
      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        const mat = mesh.material.clone()
        mat.color.set(color)
        mesh.material = mat
      }
    }
  })

  return <primitive object={cloned} />
}

/** 单个场景对象 */
function SceneItem({
  obj,
  isSelected,
  onSelect,
}: {
  obj: SceneObject
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)

  return (
    <group
      position={obj.position}
      rotation={obj.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]}
      scale={obj.scale}
    >
      {obj.type === 'model' && obj.modelUrl ? (
        <group onClick={(e) => { e.stopPropagation(); onSelect(obj.id) }}>
          <Suspense fallback={
            <mesh>
              <boxGeometry args={[0.5, 0.5, 0.5]} />
              <meshStandardMaterial color="#888" wireframe />
            </mesh>
          }>
            <LoadedModel url={obj.modelUrl} color={obj.color} />
          </Suspense>
        </group>
      ) : (
        <mesh
          ref={meshRef}
          onClick={(e) => { e.stopPropagation(); onSelect(obj.id) }}
        >
          <GeometryByType type={obj.type as GeometryType} />
          <meshStandardMaterial
            color={obj.color}
            emissive={isSelected ? '#335' : '#000'}
            emissiveIntensity={isSelected ? 0.3 : 0}
          />
        </mesh>
      )}

      {/* 选中高亮边框 */}
      {isSelected && obj.type !== 'model' && (
        <mesh scale={[1.05, 1.05, 1.05]}>
          <GeometryByType type={obj.type as GeometryType} />
          <meshBasicMaterial color="#4fc3f7" wireframe />
        </mesh>
      )}
    </group>
  )
}

interface SceneContentProps {
  objects: SceneObject[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export default function SceneContent({ objects, selectedId, onSelect }: SceneContentProps) {
  return (
    <>
      {objects.map((obj) => (
        <SceneItem
          key={obj.id}
          obj={obj}
          isSelected={obj.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}
