'use client'

import { useRef } from 'react'
import type { GeometryType, SceneObject } from '@/types/scene'
import styles from './tool-panel.module.css'

const GEOMETRY_OPTIONS: { type: GeometryType; label: string; icon: string }[] = [
  { type: 'box', label: '立方体', icon: '⬜' },
  { type: 'sphere', label: '球体', icon: '⚪' },
  { type: 'cylinder', label: '圆柱', icon: '🔷' },
  { type: 'cone', label: '圆锥', icon: '🔺' },
  { type: 'torus', label: '圆环', icon: '⭕' },
]

interface ToolPanelProps {
  objects: SceneObject[]
  selectedId: string | null
  onAddGeometry: (type: GeometryType) => void
  onLoadModel: (file: File) => void
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
  onReset: () => void
  onScreenshot: () => void
}

export default function ToolPanel({
  objects,
  selectedId,
  onAddGeometry,
  onLoadModel,
  onSelect,
  onDelete,
  onReset,
  onScreenshot,
}: ToolPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onLoadModel(file)
      e.target.value = ''
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>几何体</h3>
        <div className={styles.grid}>
          {GEOMETRY_OPTIONS.map(({ type, label, icon }) => (
            <button
              key={type}
              className={styles.geoBtn}
              onClick={() => onAddGeometry(type)}
              title={label}
            >
              <span className={styles.geoIcon}>{icon}</span>
              <span className={styles.geoLabel}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>模型加载</h3>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gltf,.glb"
          onChange={handleFileChange}
          className={styles.hidden}
        />
        <button
          className={styles.actionBtn}
          onClick={() => fileInputRef.current?.click()}
        >
          导入 GLTF / GLB
        </button>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>场景对象</h3>
        <div className={styles.objectList}>
          {objects.length === 0 && (
            <div className={styles.empty}>暂无对象</div>
          )}
          {objects.map((obj) => (
            <div
              key={obj.id}
              className={`${styles.objectItem} ${obj.id === selectedId ? styles.selected : ''}`}
              onClick={() => onSelect(obj.id)}
            >
              <span
                className={styles.colorDot}
                style={{ background: obj.color }}
              />
              <span className={styles.objectName}>{obj.name}</span>
              <button
                className={styles.deleteBtn}
                onClick={(e) => { e.stopPropagation(); onDelete(obj.id) }}
                title="删除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>操作</h3>
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={onScreenshot}>
            截图导出
          </button>
          <button className={`${styles.actionBtn} ${styles.danger}`} onClick={onReset}>
            重置场景
          </button>
        </div>
      </div>
    </div>
  )
}
