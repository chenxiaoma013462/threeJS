export type GeometryType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus'

export interface SceneObject {
  id: string
  type: GeometryType | 'model'
  name: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: string
  /** GLTF/GLB 文件的 object URL，仅 type === 'model' 时有值 */
  modelUrl?: string
}
