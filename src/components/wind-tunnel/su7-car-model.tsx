'use client'

import { useEffect, useState, useMemo } from 'react'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

interface SU7CarModelProps {
  color?: string
  useRealModel?: boolean
}

/**
 * 程序化 SU7 车身 — 车头朝 -X 方向（迎风面）
 * 风从 -X 吹向 +X，车头正对风洞出口
 */
function createFallbackCar(color: string): THREE.Group {
  const group = new THREE.Group()

  // --- 车身主体 ---
  // 沿 X 轴建模：车头在 -X，车尾在 +X
  // 截面在 YZ 平面，通过 ExtrudeGeometry 沿 X 拉伸

  // 车身横截面（YZ 平面，Y=上下，半侧轮廓然后镜像）
  const halfWidth = 0.75

  // 用多段 Box 近似流线型车身，从前到后
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.85,
    roughness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  })

  // 车身用多个截面的 LatheGeometry 构建不太好控制，
  // 改用简单方案：沿 X 轴排列多个缩放不同的椭圆截面
  const carLength = 4.0
  const segments = 20
  const positions: number[] = []
  const indices: number[] = []
  const radialSegments = 16

  for (let i = 0; i <= segments; i++) {
    const t = i / segments // 0=车头, 1=车尾
    const x = -carLength / 2 + t * carLength

    // SU7 轮廓：宽度和高度沿车身变化
    let width: number, height: number, yOffset: number

    if (t < 0.05) {
      // 车头尖端
      const s = t / 0.05
      width = s * 0.3
      height = 0.2 + s * 0.25
      yOffset = 0.35
    } else if (t < 0.15) {
      // 前保险杠 → 引擎盖
      const s = (t - 0.05) / 0.1
      width = 0.3 + s * 0.45
      height = 0.45 + s * 0.15
      yOffset = 0.35 + s * 0.05
    } else if (t < 0.3) {
      // 引擎盖 → A柱
      const s = (t - 0.15) / 0.15
      width = halfWidth
      height = 0.6 + s * 0.45
      yOffset = 0.4 + s * 0.1
    } else if (t < 0.55) {
      // A柱 → 车顶
      const s = (t - 0.3) / 0.25
      width = halfWidth
      height = 1.05 + s * 0.05
      yOffset = 0.5 + s * 0.02
    } else if (t < 0.75) {
      // 车顶 → C柱溜背
      const s = (t - 0.55) / 0.2
      width = halfWidth - s * 0.05
      height = 1.1 - s * 0.25
      yOffset = 0.52 - s * 0.05
    } else if (t < 0.9) {
      // 溜背 → 尾部
      const s = (t - 0.75) / 0.15
      width = 0.7 - s * 0.1
      height = 0.85 - s * 0.25
      yOffset = 0.47 - s * 0.07
    } else {
      // 车尾收束
      const s = (t - 0.9) / 0.1
      width = 0.6 - s * 0.2
      height = 0.6 - s * 0.2
      yOffset = 0.4 - s * 0.05
    }

    for (let j = 0; j <= radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2
      // 椭圆截面
      const py = Math.sin(angle) * height * 0.5 + yOffset
      const pz = Math.cos(angle) * width

      // 底部压平（模拟底盘）
      const flatY = Math.max(py, 0.08)

      positions.push(x, flatY, pz)
    }
  }

  // 构建三角面
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * (radialSegments + 1) + j
      const b = a + radialSegments + 1
      const c = a + 1
      const d = b + 1
      indices.push(a, b, c)
      indices.push(c, b, d)
    }
  }

  const bodyGeo = new THREE.BufferGeometry()
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  bodyGeo.setIndex(indices)
  bodyGeo.computeVertexNormals()

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
  group.add(bodyMesh)

  // --- 车窗玻璃（简化用深色区域表示）---
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#080818',
    metalness: 0.1,
    roughness: 0.05,
    opacity: 0.8,
    transparent: true,
  })

  // A柱到C柱的玻璃区域
  const glassGeo = new THREE.BufferGeometry()
  const glassPos: number[] = []
  const glassIdx: number[] = []
  const glassSegs = 8
  const glassRadSegs = 8

  for (let i = 0; i <= glassSegs; i++) {
    const t = 0.32 + (i / glassSegs) * 0.4 // 车身 32%~72% 位置
    const x = -carLength / 2 + t * carLength

    let w: number, h: number
    if (t < 0.55) {
      const s = (t - 0.32) / 0.23
      w = 0.65 + s * 0.05
      h = 0.42 + s * 0.05
    } else {
      const s = (t - 0.55) / 0.17
      w = 0.7 - s * 0.15
      h = 0.47 - s * 0.15
    }

    for (let j = 0; j <= glassRadSegs; j++) {
      const angle = (j / glassRadSegs) * Math.PI // 只取上半圆
      const py = Math.sin(angle) * h * 0.5 + 0.72
      const pz = Math.cos(angle) * w * 0.95
      glassPos.push(x, py, pz)
    }
  }

  for (let i = 0; i < glassSegs; i++) {
    for (let j = 0; j < glassRadSegs; j++) {
      const a = i * (glassRadSegs + 1) + j
      const b = a + glassRadSegs + 1
      const c = a + 1
      const d = b + 1
      glassIdx.push(a, b, c)
      glassIdx.push(c, b, d)
    }
  }

  glassGeo.setAttribute('position', new THREE.Float32BufferAttribute(glassPos, 3))
  glassGeo.setIndex(glassIdx)
  glassGeo.computeVertexNormals()
  const glassMesh = new THREE.Mesh(glassGeo, glassMat)
  group.add(glassMesh)

  // --- 轮子 ---
  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 20)
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', metalness: 0.5, roughness: 0.5 })
  const tireGeo = new THREE.TorusGeometry(0.3, 0.1, 8, 20)
  const tireMat = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 })

  // 前轮在车身 20% 处，后轮在 78% 处
  const frontX = -carLength / 2 + 0.2 * carLength  // -1.2
  const rearX = -carLength / 2 + 0.78 * carLength   //  1.12
  const wheelY = 0.08
  const wheelZ = 0.72

  for (const [wx, wz] of [[frontX, wheelZ], [frontX, -wheelZ], [rearX, wheelZ], [rearX, -wheelZ]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat)
    wheel.position.set(wx, wheelY, wz)
    wheel.rotation.x = Math.PI / 2
    group.add(wheel)

    const tire = new THREE.Mesh(tireGeo, tireMat)
    tire.position.set(wx, wheelY, wz)
    tire.rotation.y = Math.PI / 2
    group.add(tire)
  }

  // --- 前灯 ---
  const headlightGeo = new THREE.SphereGeometry(0.06, 8, 8)
  const headlightMat = new THREE.MeshStandardMaterial({
    color: '#ffffff', emissive: '#aaccff', emissiveIntensity: 0.6,
  })
  for (const hz of [0.45, -0.45]) {
    const hl = new THREE.Mesh(headlightGeo, headlightMat)
    hl.position.set(-1.95, 0.4, hz)
    group.add(hl)
  }

  // --- 尾灯（贯穿式）---
  const tailGeo = new THREE.BoxGeometry(0.03, 0.04, 1.2)
  const tailMat = new THREE.MeshStandardMaterial({
    color: '#ff2200', emissive: '#ff2200', emissiveIntensity: 0.8,
  })
  const tail = new THREE.Mesh(tailGeo, tailMat)
  tail.position.set(1.95, 0.5, 0)
  group.add(tail)

  return group
}

export default function SU7CarModel({ color = '#1a1a2e', useRealModel = true }: SU7CarModelProps) {
  const [fbxModel, setFbxModel] = useState<THREE.Group | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!useRealModel) {
      setLoading(false)
      return
    }

    const loader = new FBXLoader()
    loader.load(
      '/models/su7/Xiaomi_SU7_2024_low.FBX',
      (group) => {
        const box = new THREE.Box3().setFromObject(group)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())

        // 归一化到约 4m 长
        const maxDim = Math.max(size.x, size.y, size.z)
        const scale = 4 / maxDim
        group.scale.setScalar(scale)

        // 居中 + 落地 + 车头朝 -X
        group.position.set(
          -center.x * scale,
          -box.min.y * scale,
          -center.z * scale,
        )

        // FBX 模型的默认朝向可能不对，检测后旋转
        // 重新计算包围盒确认长轴方向
        const newBox = new THREE.Box3().setFromObject(group)
        const newSize = newBox.getSize(new THREE.Vector3())

        // 如果 Z 轴比 X 轴长，说明车身沿 Z，需要旋转 90°
        if (newSize.z > newSize.x * 1.2) {
          group.rotation.y = Math.PI / 2
        }

        group.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            mesh.castShadow = true
            mesh.receiveShadow = true
          }
        })

        setFbxModel(group)
        setLoading(false)
      },
      undefined,
      (err) => {
        console.error('FBX 加载失败，使用程序化模型:', err)
        setLoadError(true)
        setLoading(false)
      },
    )

    return () => {
      if (fbxModel) {
        fbxModel.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            mesh.geometry?.dispose()
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((m) => m.dispose())
            } else {
              mesh.material?.dispose()
            }
          }
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useRealModel])

  const fallbackGroup = useMemo(() => {
    if (!loadError && useRealModel) return null
    return createFallbackCar(color)
  }, [color, loadError, useRealModel])

  if (loading) {
    return (
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[4, 1.0, 1.5]} />
        <meshBasicMaterial color="#333355" wireframe />
      </mesh>
    )
  }

  if (fbxModel) return <primitive object={fbxModel} />
  if (fallbackGroup) return <primitive object={fallbackGroup} />
  return null
}
