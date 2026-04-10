'use client'

import type { SceneObject } from '@/types/scene'
import styles from './properties-panel.module.css'

interface PropertiesPanelProps {
  object: SceneObject | null
  onUpdate: (id: string, updates: Partial<SceneObject>) => void
}

function NumberInput({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <input
        type="number"
        className={styles.fieldInput}
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  )
}

function Vec3Input({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string
  value: [number, number, number]
  onChange: (v: [number, number, number]) => void
  step?: number
}) {
  const labels = ['X', 'Y', 'Z']
  return (
    <div className={styles.group}>
      <div className={styles.groupTitle}>{label}</div>
      <div className={styles.vec3}>
        {labels.map((axis, i) => (
          <NumberInput
            key={axis}
            label={axis}
            value={value[i]}
            step={step}
            onChange={(v) => {
              const next = [...value] as [number, number, number]
              next[i] = v
              onChange(next)
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default function PropertiesPanel({ object, onUpdate }: PropertiesPanelProps) {
  if (!object) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>选择一个对象以编辑属性</div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.objectName}>{object.name}</span>
        <span className={styles.objectType}>{object.type}</span>
      </div>

      <Vec3Input
        label="位置"
        value={object.position}
        onChange={(v) => onUpdate(object.id, { position: v })}
      />

      <Vec3Input
        label="旋转 (°)"
        value={object.rotation}
        step={5}
        onChange={(v) => onUpdate(object.id, { rotation: v })}
      />

      <Vec3Input
        label="缩放"
        value={object.scale}
        step={0.1}
        onChange={(v) => onUpdate(object.id, { scale: v })}
      />

      <div className={styles.group}>
        <div className={styles.groupTitle}>颜色</div>
        <div className={styles.colorRow}>
          <input
            type="color"
            className={styles.colorPicker}
            value={object.color}
            onChange={(e) => onUpdate(object.id, { color: e.target.value })}
          />
          <input
            type="text"
            className={styles.colorText}
            value={object.color}
            onChange={(e) => onUpdate(object.id, { color: e.target.value })}
          />
        </div>
      </div>
    </div>
  )
}
