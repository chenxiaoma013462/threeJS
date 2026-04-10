'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import SceneCanvas from './scene-canvas'
import ToolPanel from '../tools/tool-panel'
import PropertiesPanel from '../tools/properties-panel'
import type { SceneObject, GeometryType } from '@/types/scene'
import styles from './three-workbench.module.css'

const COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8', '#4db6ac', '#fff176']

let idCounter = 0
function nextId() {
  return `obj_${++idCounter}_${Date.now()}`
}

export default function ThreeWorkbench() {
  const [objects, setObjects] = useState<SceneObject[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const selectedObject = objects.find((o) => o.id === selectedId) ?? null

  const addGeometry = useCallback((type: GeometryType) => {
    const id = nextId()
    const color = COLORS[idCounter % COLORS.length]
    const newObj: SceneObject = {
      id,
      type,
      name: `${type}_${idCounter}`,
      position: [0, 0.5, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color,
    }
    setObjects((prev) => [...prev, newObj])
    setSelectedId(id)
  }, [])

  const loadModel = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    const id = nextId()
    const newObj: SceneObject = {
      id,
      type: 'model',
      name: file.name.replace(/\.(gltf|glb)$/i, ''),
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#ffffff',
      modelUrl: url,
    }
    setObjects((prev) => [...prev, newObj])
    setSelectedId(id)
  }, [])

  const updateObject = useCallback((id: string, updates: Partial<SceneObject>) => {
    setObjects((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...updates } : o))
    )
  }, [])

  const deleteObject = useCallback((id: string) => {
    setObjects((prev) => {
      const obj = prev.find((o) => o.id === id)
      if (obj?.modelUrl) URL.revokeObjectURL(obj.modelUrl)
      return prev.filter((o) => o.id !== id)
    })
    setSelectedId((prev) => (prev === id ? null : prev))
  }, [])

  const resetScene = useCallback(() => {
    objects.forEach((o) => {
      if (o.modelUrl) URL.revokeObjectURL(o.modelUrl)
    })
    setObjects([])
    setSelectedId(null)
  }, [objects])

  const takeScreenshot = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    try {
      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `scene_${Date.now()}.png`
      link.href = dataUrl
      link.click()
    } catch {
      console.error('截图失败：Canvas 不可读')
    }
  }, [])

  return (
    <div className={styles.workbench}>
      <header className={styles.header}>
        <h1 className={styles.title}>Three.js 工具台</h1>
        <nav className={styles.headerNav}>
          <Link href="/wind-tunnel" className={styles.navLink}>风洞模拟</Link>
        </nav>
        <div className={styles.headerInfo}>
          对象: {objects.length}
        </div>
      </header>

      <div className={styles.body}>
        <ToolPanel
          objects={objects}
          selectedId={selectedId}
          onAddGeometry={addGeometry}
          onLoadModel={loadModel}
          onSelect={setSelectedId}
          onDelete={deleteObject}
          onReset={resetScene}
          onScreenshot={takeScreenshot}
        />

        <div className={styles.canvas}>
          <SceneCanvas
            objects={objects}
            selectedId={selectedId}
            onSelect={setSelectedId}
            canvasRef={canvasRef}
          />
        </div>

        <PropertiesPanel
          object={selectedObject}
          onUpdate={updateObject}
        />
      </div>
    </div>
  )
}
