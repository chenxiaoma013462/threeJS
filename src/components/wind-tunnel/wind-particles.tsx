'use client'

/**
 * WindDensity-MBIR 风洞粒子模拟系统
 *
 * 基于 Model-Based Iterative Reconstruction (MBIR) 框架的风场密度重建算法：
 *
 * 1. 正向模型（Forward Model）：
 *    - 将空间离散化为 3D 密度网格
 *    - 通过车体 SDF 定义障碍物边界条件
 *    - 基于连续性方程 ∇·(ρv) = 0 建立密度-速度耦合关系
 *
 * 2. 先验模型（Prior Model）：
 *    - Markov Random Field (MRF) 空间平滑先验：相邻体素密度相关
 *    - 来流边界的 Dirichlet 条件作为硬约束
 *    - 障碍物表面的无穿透条件（Neumann 边界）
 *
 * 3. 迭代重建（Iterative Reconstruction）：
 *    - 每帧执行若干次 Gauss-Seidel 松弛迭代
 *    - 通过最小化代价函数 C(ρ) = ||y - Aρ||² + β·R(ρ) 更新密度
 *      其中 y=观测, A=正向算子, R=正则化项, β=正则化强度
 *    - 密度梯度 ∇ρ 驱动速度场的更新
 *
 * 粒子在重建后的速度场中运动，产生真实的风洞流线效果。
 */

import { useRef, useMemo, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface WindParticlesProps {
  count?: number
  windSpeed?: number
  emitX?: number
  spreadY?: number
  spreadZ?: number
  colorMode?: 'speed' | 'pressure' | 'uniform'
  showStreamlines?: boolean
  particleSize?: number
}

// ===== 密度场网格参数 =====
const GRID_NX = 40  // X 方向网格数
const GRID_NY = 16  // Y 方向
const GRID_NZ = 20  // Z 方向

// 物理空间范围
const DOMAIN_MIN_X = -4.5, DOMAIN_MAX_X = 6.5
const DOMAIN_MIN_Y = -0.5, DOMAIN_MAX_Y = 3.5
const DOMAIN_MIN_Z = -2.5, DOMAIN_MAX_Z = 2.5

const DX = (DOMAIN_MAX_X - DOMAIN_MIN_X) / GRID_NX
const DY = (DOMAIN_MAX_Y - DOMAIN_MIN_Y) / GRID_NY
const DZ = (DOMAIN_MAX_Z - DOMAIN_MIN_Z) / GRID_NZ

// MBIR 迭代参数
const MBIR_ITERATIONS = 3        // 每帧迭代次数（平衡精度与性能）
const MBIR_BETA = 0.12           // 正则化强度
const MBIR_RELAXATION = 1.35     // SOR 超松弛因子
const DENSITY_AMBIENT = 1.0      // 环境空气密度 (ρ∞)

// ===== 车体 SDF（与车模型匹配）=====
function carSDF(x: number, y: number, z: number): number {
  const carLen = 4.0
  const halfLen = carLen / 2
  const t = (x + halfLen) / carLen

  if (t < 0 || t > 1) {
    const dx = t < 0 ? -x - halfLen : x - halfLen
    return Math.sqrt(dx * dx + Math.max(0, y - 1.1) ** 2)
  }

  let width: number, height: number, centerY: number

  if (t < 0.05) {
    const s = t / 0.05
    width = s * 0.3; height = s * 0.4; centerY = 0.35
  } else if (t < 0.15) {
    const s = (t - 0.05) / 0.1
    width = 0.3 + s * 0.45; height = 0.4 + s * 0.2; centerY = 0.38
  } else if (t < 0.3) {
    const s = (t - 0.15) / 0.15
    width = 0.75; height = 0.6 + s * 0.45; centerY = 0.4 + s * 0.1
  } else if (t < 0.55) {
    width = 0.75; height = 1.05; centerY = 0.52
  } else if (t < 0.75) {
    const s = (t - 0.55) / 0.2
    width = 0.75 - s * 0.05; height = 1.05 - s * 0.2; centerY = 0.5
  } else if (t < 0.9) {
    const s = (t - 0.75) / 0.15
    width = 0.7 - s * 0.1; height = 0.85 - s * 0.25; centerY = 0.47
  } else {
    const s = (t - 0.9) / 0.1
    width = 0.6 - s * 0.2; height = 0.6 - s * 0.2; centerY = 0.4
  }

  const dz = Math.abs(z) / Math.max(width, 0.01)
  const dy = (y - centerY) / Math.max(height * 0.5, 0.01)
  const dyFlat = y < 0.08 ? (0.08 - y) / 0.3 : dy
  const ellipseDist = Math.sqrt(dz * dz + Math.max(dy, dyFlat) ** 2)

  return (ellipseDist - 1.0) * Math.min(width, height * 0.5)
}

// ===== 3D 网格索引 =====
function gridIdx(ix: number, iy: number, iz: number): number {
  return ix + iy * GRID_NX + iz * GRID_NX * GRID_NY
}

function worldToGrid(x: number, y: number, z: number): [number, number, number] {
  return [
    (x - DOMAIN_MIN_X) / DX,
    (y - DOMAIN_MIN_Y) / DY,
    (z - DOMAIN_MIN_Z) / DZ,
  ]
}

// ===== MBIR 密度场类 =====
class DensityField {
  density: Float32Array      // ρ(x,y,z) — 密度场
  velocityX: Float32Array    // u(x,y,z) — x 速度分量
  velocityY: Float32Array    // v(x,y,z)
  velocityZ: Float32Array    // w(x,y,z)
  pressure: Float32Array     // p(x,y,z) — 压力场
  solidMask: Uint8Array      // 1 = 固体（车内）, 0 = 流体
  private totalCells: number

  constructor() {
    this.totalCells = GRID_NX * GRID_NY * GRID_NZ
    this.density = new Float32Array(this.totalCells)
    this.velocityX = new Float32Array(this.totalCells)
    this.velocityY = new Float32Array(this.totalCells)
    this.velocityZ = new Float32Array(this.totalCells)
    this.pressure = new Float32Array(this.totalCells)
    this.solidMask = new Uint8Array(this.totalCells)

    this.initialize()
  }

  /** 初始化密度场和边界条件 */
  initialize() {
    for (let iz = 0; iz < GRID_NZ; iz++) {
      for (let iy = 0; iy < GRID_NY; iy++) {
        for (let ix = 0; ix < GRID_NX; ix++) {
          const idx = gridIdx(ix, iy, iz)

          // 物理坐标
          const x = DOMAIN_MIN_X + (ix + 0.5) * DX
          const y = DOMAIN_MIN_Y + (iy + 0.5) * DY
          const z = DOMAIN_MIN_Z + (iz + 0.5) * DZ

          // 障碍物标记
          const sdf = carSDF(x, y, z)
          this.solidMask[idx] = sdf < 0 ? 1 : 0

          // 初始均匀来流
          this.density[idx] = DENSITY_AMBIENT
          this.velocityX[idx] = this.solidMask[idx] ? 0 : 1.0
          this.velocityY[idx] = 0
          this.velocityZ[idx] = 0
          this.pressure[idx] = 0
        }
      }
    }
  }

  /**
   * MBIR 迭代重建：
   * 代价函数 C(ρ) = Σ_i (y_i - [Aρ]_i)² + β Σ_{j∈N(i)} φ(ρ_i - ρ_j)
   *
   * 其中 φ(t) = |t|² (Tikhonov 二次正则化，保证密度场平滑)
   * A 是正向算子（连续性方程投影）
   *
   * 使用 SOR (Successive Over-Relaxation) 迭代求解
   */
  mbirIterate(baseSpeed: number, time: number) {
    const { density, velocityX, velocityY, velocityZ, pressure, solidMask } = this

    for (let iter = 0; iter < MBIR_ITERATIONS; iter++) {
      // --- Step 1: 基于连续性方程更新密度（正向模型） ---
      // ∂ρ/∂t + ∇·(ρv) = 0
      // 离散化：ρ_new = ρ_old - dt * div(ρv)
      for (let iz = 1; iz < GRID_NZ - 1; iz++) {
        for (let iy = 1; iy < GRID_NY - 1; iy++) {
          for (let ix = 1; ix < GRID_NX - 1; ix++) {
            const idx = gridIdx(ix, iy, iz)
            if (solidMask[idx]) continue

            // 中心差分计算散度 ∇·(ρv)
            const rhoUxp = density[gridIdx(ix + 1, iy, iz)] * velocityX[gridIdx(ix + 1, iy, iz)]
            const rhoUxm = density[gridIdx(ix - 1, iy, iz)] * velocityX[gridIdx(ix - 1, iy, iz)]
            const rhoVyp = density[gridIdx(ix, iy + 1, iz)] * velocityY[gridIdx(ix, iy + 1, iz)]
            const rhoVym = density[gridIdx(ix, iy - 1, iz)] * velocityY[gridIdx(ix, iy - 1, iz)]
            const rhoWzp = density[gridIdx(ix, iy, iz + 1)] * velocityZ[gridIdx(ix, iy, iz + 1)]
            const rhoWzm = density[gridIdx(ix, iy, iz - 1)] * velocityZ[gridIdx(ix, iy, iz - 1)]

            const divRhoV = (rhoUxp - rhoUxm) / (2 * DX)
              + (rhoVyp - rhoVym) / (2 * DY)
              + (rhoWzp - rhoWzm) / (2 * DZ)

            // MBIR 数据保真项更新
            const dataFidelity = -divRhoV * 0.02

            // --- Step 2: MRF 先验正则化 ---
            // R(ρ) = Σ_{j∈N(i)} (ρ_i - ρ_j)²
            // ∂R/∂ρ_i = 2 Σ_{j∈N(i)} (ρ_i - ρ_j)
            let regularization = 0
            let neighborCount = 0
            const neighbors = [
              gridIdx(ix + 1, iy, iz), gridIdx(ix - 1, iy, iz),
              gridIdx(ix, iy + 1, iz), gridIdx(ix, iy - 1, iz),
              gridIdx(ix, iy, iz + 1), gridIdx(ix, iy, iz - 1),
            ]
            for (const nIdx of neighbors) {
              if (!solidMask[nIdx]) {
                regularization += density[idx] - density[nIdx]
                neighborCount++
              }
            }
            if (neighborCount > 0) {
              regularization /= neighborCount
            }

            // --- Step 3: SOR 更新 ---
            // ρ_new = ρ_old + ω * (dataFidelity - β * ∂R/∂ρ)
            const update = dataFidelity - MBIR_BETA * regularization
            density[idx] += MBIR_RELAXATION * update

            // 密度约束：ρ > 0 且有上界
            density[idx] = Math.max(0.1, Math.min(2.5, density[idx]))
          }
        }
      }

      // --- Step 4: 压力泊松方程求解（投影法确保 ∇·v=0）---
      for (let iz = 1; iz < GRID_NZ - 1; iz++) {
        for (let iy = 1; iy < GRID_NY - 1; iy++) {
          for (let ix = 1; ix < GRID_NX - 1; ix++) {
            const idx = gridIdx(ix, iy, iz)
            if (solidMask[idx]) { pressure[idx] = 0; continue }

            // 速度散度
            const divV = (velocityX[gridIdx(ix + 1, iy, iz)] - velocityX[gridIdx(ix - 1, iy, iz)]) / (2 * DX)
              + (velocityY[gridIdx(ix, iy + 1, iz)] - velocityY[gridIdx(ix, iy - 1, iz)]) / (2 * DY)
              + (velocityZ[gridIdx(ix, iy, iz + 1)] - velocityZ[gridIdx(ix, iy, iz - 1)]) / (2 * DZ)

            // Jacobi 迭代求解 ∇²p = ρ·div(v)
            const pxp = solidMask[gridIdx(ix + 1, iy, iz)] ? pressure[idx] : pressure[gridIdx(ix + 1, iy, iz)]
            const pxm = solidMask[gridIdx(ix - 1, iy, iz)] ? pressure[idx] : pressure[gridIdx(ix - 1, iy, iz)]
            const pyp = solidMask[gridIdx(ix, iy + 1, iz)] ? pressure[idx] : pressure[gridIdx(ix, iy + 1, iz)]
            const pym = solidMask[gridIdx(ix, iy - 1, iz)] ? pressure[idx] : pressure[gridIdx(ix, iy - 1, iz)]
            const pzp = solidMask[gridIdx(ix, iy, iz + 1)] ? pressure[idx] : pressure[gridIdx(ix, iy, iz + 1)]
            const pzm = solidMask[gridIdx(ix, iy, iz - 1)] ? pressure[idx] : pressure[gridIdx(ix, iy, iz - 1)]

            const pNew = (pxp + pxm + pyp + pym + pzp + pzm - divV * density[idx] * DX * DX) / 6
            pressure[idx] += MBIR_RELAXATION * (pNew - pressure[idx])
          }
        }
      }

      // --- Step 5: 密度梯度驱动速度场更新 ---
      for (let iz = 1; iz < GRID_NZ - 1; iz++) {
        for (let iy = 1; iy < GRID_NY - 1; iy++) {
          for (let ix = 1; ix < GRID_NX - 1; ix++) {
            const idx = gridIdx(ix, iy, iz)
            if (solidMask[idx]) {
              velocityX[idx] = 0; velocityY[idx] = 0; velocityZ[idx] = 0
              continue
            }

            const x = DOMAIN_MIN_X + (ix + 0.5) * DX
            const y = DOMAIN_MIN_Y + (iy + 0.5) * DY
            const z = DOMAIN_MIN_Z + (iz + 0.5) * DZ

            // 压力梯度力：v -= (1/ρ) ∇p
            const dpdx = (pressure[gridIdx(ix + 1, iy, iz)] - pressure[gridIdx(ix - 1, iy, iz)]) / (2 * DX)
            const dpdy = (pressure[gridIdx(ix, iy + 1, iz)] - pressure[gridIdx(ix, iy - 1, iz)]) / (2 * DY)
            const dpdz = (pressure[gridIdx(ix, iy, iz + 1)] - pressure[gridIdx(ix, iy, iz - 1)]) / (2 * DZ)

            const invRho = 1 / Math.max(density[idx], 0.1)
            velocityX[idx] -= dpdx * invRho * 0.05
            velocityY[idx] -= dpdy * invRho * 0.05
            velocityZ[idx] -= dpdz * invRho * 0.05

            // 密度梯度贡献（MBIR 核心：密度场反馈到速度场）
            const drhodx = (density[gridIdx(ix + 1, iy, iz)] - density[gridIdx(ix - 1, iy, iz)]) / (2 * DX)
            const drhody = (density[gridIdx(ix, iy + 1, iz)] - density[gridIdx(ix, iy - 1, iz)]) / (2 * DY)
            const drhodz = (density[gridIdx(ix, iy, iz + 1)] - density[gridIdx(ix, iy, iz - 1)]) / (2 * DZ)

            // 气流倾向从高密度区流向低密度区
            velocityX[idx] -= drhodx * 0.03
            velocityY[idx] -= drhody * 0.03
            velocityZ[idx] -= drhodz * 0.03

            // SDF 势场排斥（防止穿透车体）
            const sdf = carSDF(x, y, z)
            if (sdf < 0.3 && sdf > -0.1) {
              const eps = 0.04
              const sdfGx = (carSDF(x + eps, y, z) - carSDF(x - eps, y, z)) / (2 * eps)
              const sdfGy = (carSDF(x, y + eps, z) - carSDF(x, y, z - eps)) / (2 * eps)
              const sdfGz = (carSDF(x, y, z + eps) - carSDF(x, y, z - eps)) / (2 * eps)
              const sdfGLen = Math.sqrt(sdfGx * sdfGx + sdfGy * sdfGy + sdfGz * sdfGz) || 1
              const repulsionStr = Math.max(0, 0.3 - sdf) * 2.0
              velocityX[idx] += (sdfGx / sdfGLen) * repulsionStr
              velocityY[idx] += (sdfGy / sdfGLen) * repulsionStr
              velocityZ[idx] += (sdfGz / sdfGLen) * repulsionStr
            }

            // 尾流湍流注入（卡门涡街）
            if (x > 1.5) {
              const wakeDecay = Math.exp(-(x - 1.5) * 0.4)
              const vortex = Math.sin(time * 3 + x * 2) * wakeDecay * baseSpeed * 0.15
              velocityY[idx] += vortex
              velocityZ[idx] += Math.cos(time * 2.1 + z * 3) * wakeDecay * baseSpeed * 0.1
            }
          }
        }
      }
    }

    // --- 边界条件刷新 ---
    for (let iz = 0; iz < GRID_NZ; iz++) {
      for (let iy = 0; iy < GRID_NY; iy++) {
        // 入流边界 (x=0): Dirichlet 条件
        const inIdx = gridIdx(0, iy, iz)
        density[inIdx] = DENSITY_AMBIENT
        velocityX[inIdx] = baseSpeed
        velocityY[inIdx] = 0
        velocityZ[inIdx] = 0

        // 出流边界 (x=N-1): Neumann 条件（零梯度外推）
        const outIdx = gridIdx(GRID_NX - 1, iy, iz)
        const innerIdx = gridIdx(GRID_NX - 2, iy, iz)
        density[outIdx] = density[innerIdx]
        velocityX[outIdx] = velocityX[innerIdx]
        velocityY[outIdx] = velocityY[innerIdx]
        velocityZ[outIdx] = velocityZ[innerIdx]
      }
    }

    // 地面边界（y=0）: 无滑移
    for (let iz = 0; iz < GRID_NZ; iz++) {
      for (let ix = 0; ix < GRID_NX; ix++) {
        const idx = gridIdx(ix, 0, iz)
        velocityY[idx] = 0
        // 地面弱反射
        const aboveIdx = gridIdx(ix, 1, iz)
        density[idx] = density[aboveIdx]
      }
    }
  }

  /** 三线性插值采样速度场 */
  sampleVelocity(x: number, y: number, z: number): [number, number, number, number, number] {
    const [gx, gy, gz] = worldToGrid(x, y, z)

    const ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz)
    const fx = gx - ix, fy = gy - iy, fz = gz - iz

    // 边界截断
    const ix0 = Math.max(0, Math.min(ix, GRID_NX - 2))
    const iy0 = Math.max(0, Math.min(iy, GRID_NY - 2))
    const iz0 = Math.max(0, Math.min(iz, GRID_NZ - 2))
    const ix1 = ix0 + 1, iy1 = iy0 + 1, iz1 = iz0 + 1

    // 8 个角点索引
    const c000 = gridIdx(ix0, iy0, iz0), c100 = gridIdx(ix1, iy0, iz0)
    const c010 = gridIdx(ix0, iy1, iz0), c110 = gridIdx(ix1, iy1, iz0)
    const c001 = gridIdx(ix0, iy0, iz1), c101 = gridIdx(ix1, iy0, iz1)
    const c011 = gridIdx(ix0, iy1, iz1), c111 = gridIdx(ix1, iy1, iz1)

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    // 三线性插值
    const triLerp = (f: Float32Array) => {
      const x00 = lerp(f[c000], f[c100], fx)
      const x10 = lerp(f[c010], f[c110], fx)
      const x01 = lerp(f[c001], f[c101], fx)
      const x11 = lerp(f[c011], f[c111], fx)
      const y0 = lerp(x00, x10, fy)
      const y1 = lerp(x01, x11, fy)
      return lerp(y0, y1, fz)
    }

    const vx = triLerp(this.velocityX)
    const vy = triLerp(this.velocityY)
    const vz = triLerp(this.velocityZ)
    const rho = triLerp(this.density)
    const p = triLerp(this.pressure)

    return [vx, vy, vz, rho, p]
  }
}

// ===== 颜色映射 =====
const tempColor = new THREE.Color()
function speedToColor(
  speed: number, maxSpeed: number,
  mode: 'speed' | 'pressure' | 'uniform',
  density: number, pressure: number,
): THREE.Color {
  if (mode === 'uniform') return tempColor.setHSL(0.58, 0.8, 0.55)

  if (mode === 'pressure') {
    // 压力映射：低压=蓝, 高压=红
    const pNorm = Math.min(1, Math.max(0, (pressure + 0.5) / 1.0))
    const hue = (1 - pNorm) * 0.65
    return tempColor.setHSL(hue, 0.85, 0.45)
  }

  // 速度模式：基于密度加权的速度色，密度越高颜色越饱和
  const ratio = Math.min(speed / maxSpeed, 1)
  const hue = (1 - ratio) * 0.65
  const saturation = 0.7 + Math.min(density / DENSITY_AMBIENT, 1) * 0.25
  return tempColor.setHSL(hue, saturation, 0.38 + ratio * 0.22)
}

const TRAIL_LENGTH = 8

export default function WindParticles({
  count = 3000,
  windSpeed = 2.5,
  emitX = -5,
  spreadY = 3.0,
  spreadZ = 2.5,
  colorMode = 'speed',
  showStreamlines = true,
  particleSize = 0.03,
}: WindParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null)
  const trailRef = useRef<THREE.LineSegments>(null)
  const timeRef = useRef(0)
  const fieldRef = useRef<DensityField | null>(null)

  // 初始化密度场（仅一次）
  if (!fieldRef.current) {
    fieldRef.current = new DensityField()
  }

  const particleData = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    const ages = new Float32Array(count)
    const maxAge = new Float32Array(count)
    const history = new Float32Array(count * TRAIL_LENGTH * 3)

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const startX = emitX + Math.random() * 12 - 2
      positions[i3] = startX
      positions[i3 + 1] = Math.random() * spreadY * 0.8
      positions[i3 + 2] = (Math.random() - 0.5) * spreadZ
      velocities[i3] = windSpeed
      velocities[i3 + 1] = 0
      velocities[i3 + 2] = 0
      ages[i] = Math.random() * 350
      maxAge[i] = 250 + Math.random() * 200

      for (let h = 0; h < TRAIL_LENGTH; h++) {
        const hi = (i * TRAIL_LENGTH + h) * 3
        history[hi] = positions[i3]
        history[hi + 1] = positions[i3 + 1]
        history[hi + 2] = positions[i3 + 2]
      }
    }

    return { positions, colors, velocities, ages, maxAge, history }
  }, [count, windSpeed, emitX, spreadY, spreadZ])

  const trailData = useMemo(() => {
    if (!showStreamlines) return null
    const segCount = count * (TRAIL_LENGTH - 1)
    return {
      positions: new Float32Array(segCount * 6),
      colors: new Float32Array(segCount * 6),
    }
  }, [count, showStreamlines])

  const resetParticle = useCallback((i: number) => {
    const i3 = i * 3
    particleData.positions[i3] = emitX + Math.random() * 0.5
    particleData.positions[i3 + 1] = Math.random() * spreadY * 0.8
    particleData.positions[i3 + 2] = (Math.random() - 0.5) * spreadZ
    particleData.velocities[i3] = windSpeed
    particleData.velocities[i3 + 1] = 0
    particleData.velocities[i3 + 2] = 0
    particleData.ages[i] = 0
    particleData.maxAge[i] = 250 + Math.random() * 200

    for (let h = 0; h < TRAIL_LENGTH; h++) {
      const hi = (i * TRAIL_LENGTH + h) * 3
      particleData.history[hi] = particleData.positions[i3]
      particleData.history[hi + 1] = particleData.positions[i3 + 1]
      particleData.history[hi + 2] = particleData.positions[i3 + 2]
    }
  }, [particleData, emitX, spreadY, spreadZ, windSpeed])

  useFrame((_, delta) => {
    if (!pointsRef.current || !fieldRef.current) return

    const dt = Math.min(delta, 0.033)
    timeRef.current += dt
    const time = timeRef.current
    const field = fieldRef.current

    // 每帧执行 MBIR 迭代重建密度场
    field.mbirIterate(windSpeed, time)

    const { positions, colors, velocities, ages, maxAge, history } = particleData

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      ages[i] += 1

      if (ages[i] > maxAge[i] || positions[i3] > 8 || positions[i3 + 1] > 4.5 || positions[i3 + 1] < -0.5 || Math.abs(positions[i3 + 2]) > 4) {
        resetParticle(i)
        continue
      }

      // 移动历史
      for (let h = TRAIL_LENGTH - 1; h > 0; h--) {
        const hi = (i * TRAIL_LENGTH + h) * 3
        const prevHi = (i * TRAIL_LENGTH + h - 1) * 3
        history[hi] = history[prevHi]
        history[hi + 1] = history[prevHi + 1]
        history[hi + 2] = history[prevHi + 2]
      }
      const h0 = i * TRAIL_LENGTH * 3
      history[h0] = positions[i3]
      history[h0 + 1] = positions[i3 + 1]
      history[h0 + 2] = positions[i3 + 2]

      // 从 MBIR 密度场采样速度
      const [vx, vy, vz, rho, p] = field.sampleVelocity(
        positions[i3], positions[i3 + 1], positions[i3 + 2],
      )

      // 缩放到用户设定的风速
      const fieldVx = vx * windSpeed
      const fieldVy = vy * windSpeed
      const fieldVz = vz * windSpeed

      // 惯性平滑
      const lerp = 0.2
      velocities[i3] += (fieldVx - velocities[i3]) * lerp
      velocities[i3 + 1] += (fieldVy - velocities[i3 + 1]) * lerp
      velocities[i3 + 2] += (fieldVz - velocities[i3 + 2]) * lerp

      // RK2 积分（更准确的轨迹）
      const midX = positions[i3] + velocities[i3] * dt * 0.5
      const midY = positions[i3 + 1] + velocities[i3 + 1] * dt * 0.5
      const midZ = positions[i3 + 2] + velocities[i3 + 2] * dt * 0.5
      const [mvx, mvy, mvz] = field.sampleVelocity(midX, midY, midZ)

      positions[i3] += mvx * windSpeed * dt
      positions[i3 + 1] += mvy * windSpeed * dt
      positions[i3 + 2] += mvz * windSpeed * dt

      // 地面
      if (positions[i3 + 1] < 0.01) {
        positions[i3 + 1] = 0.01
        velocities[i3 + 1] = Math.abs(velocities[i3 + 1]) * 0.2
      }

      // 颜色（结合密度和压力信息）
      const localSpeed = Math.sqrt(velocities[i3] ** 2 + velocities[i3 + 1] ** 2 + velocities[i3 + 2] ** 2)
      const col = speedToColor(localSpeed, windSpeed * 2.5, colorMode, rho, p)

      const lifeRatio = ages[i] / maxAge[i]
      const fadeIn = Math.min(1, ages[i] / 20)
      const fadeOut = lifeRatio > 0.8 ? (1 - lifeRatio) / 0.2 : 1
      const alpha = fadeIn * fadeOut

      colors[i3] = col.r * alpha
      colors[i3 + 1] = col.g * alpha
      colors[i3 + 2] = col.b * alpha

      // 流线拖尾
      if (trailData) {
        for (let h = 0; h < TRAIL_LENGTH - 1; h++) {
          const segIdx = (i * (TRAIL_LENGTH - 1) + h) * 6
          const curHi = (i * TRAIL_LENGTH + h) * 3
          const nextHi = (i * TRAIL_LENGTH + h + 1) * 3

          trailData.positions[segIdx] = history[curHi]
          trailData.positions[segIdx + 1] = history[curHi + 1]
          trailData.positions[segIdx + 2] = history[curHi + 2]
          trailData.positions[segIdx + 3] = history[nextHi]
          trailData.positions[segIdx + 4] = history[nextHi + 1]
          trailData.positions[segIdx + 5] = history[nextHi + 2]

          const trailFade = (1 - h / TRAIL_LENGTH)
          const ta = alpha * trailFade * 0.7
          trailData.colors[segIdx] = col.r * ta
          trailData.colors[segIdx + 1] = col.g * ta
          trailData.colors[segIdx + 2] = col.b * ta
          const ta2 = alpha * (1 - (h + 1) / TRAIL_LENGTH) * 0.7
          trailData.colors[segIdx + 3] = col.r * ta2
          trailData.colors[segIdx + 4] = col.g * ta2
          trailData.colors[segIdx + 5] = col.b * ta2
        }
      }
    }

    const geo = pointsRef.current.geometry
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true

    if (trailRef.current && trailData) {
      const tGeo = trailRef.current.geometry
      tGeo.attributes.position.needsUpdate = true
      tGeo.attributes.color.needsUpdate = true
    }
  })

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particleData.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[particleData.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={particleSize}
          vertexColors
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>

      {showStreamlines && trailData && (
        <lineSegments ref={trailRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[trailData.positions, 3]} />
            <bufferAttribute attach="attributes-color" args={[trailData.colors, 3]} />
          </bufferGeometry>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={0.55}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}
    </>
  )
}
