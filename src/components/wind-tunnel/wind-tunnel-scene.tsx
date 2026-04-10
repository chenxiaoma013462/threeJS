'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import SU7CarModel from './su7-car-model'
import WindParticles from './wind-particles'
import styles from './wind-tunnel-scene.module.css'

type ColorMode = 'speed' | 'pressure' | 'uniform'

export default function WindTunnelScene() {
  const [windSpeed, setWindSpeed] = useState(2.5)
  const [particleCount, setParticleCount] = useState(3000)
  const [colorMode, setColorMode] = useState<ColorMode>('speed')
  const [showStreamlines, setShowStreamlines] = useState(true)
  const [particleSize, setParticleSize] = useState(0.03)
  const [carColor, setCarColor] = useState('#1a1a2e')
  const [showGrid, setShowGrid] = useState(true)
  const [useRealModel, setUseRealModel] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const takeScreenshot = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `wind_tunnel_${Date.now()}.png`
      link.href = dataUrl
      link.click()
    } catch {
      console.error('截图失败')
    }
  }, [])

  return (
    <div className={styles.container}>
      {/* 左侧控制面板 */}
      <aside className={styles.panel}>
        <div className={styles.panelHeader}>
          <Link href="/" className={styles.backLink}>← 返回</Link>
          <h2 className={styles.panelTitle}>风洞模拟</h2>
          <span className={styles.subtitle}>Xiaomi SU7</span>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>风速</label>
          <div className={styles.sliderRow}>
            <input
              type="range"
              min="0.5"
              max="8"
              step="0.1"
              value={windSpeed}
              onChange={(e) => setWindSpeed(parseFloat(e.target.value))}
              className={styles.slider}
            />
            <span className={styles.value}>{windSpeed.toFixed(1)}</span>
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>粒子数量</label>
          <div className={styles.sliderRow}>
            <input
              type="range"
              min="1000"
              max="10000"
              step="500"
              value={particleCount}
              onChange={(e) => setParticleCount(parseInt(e.target.value))}
              className={styles.slider}
            />
            <span className={styles.value}>{particleCount}</span>
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>粒子大小</label>
          <div className={styles.sliderRow}>
            <input
              type="range"
              min="0.01"
              max="0.08"
              step="0.005"
              value={particleSize}
              onChange={(e) => setParticleSize(parseFloat(e.target.value))}
              className={styles.slider}
            />
            <span className={styles.value}>{particleSize.toFixed(3)}</span>
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>颜色模式</label>
          <div className={styles.btnGroup}>
            {(['speed', 'pressure', 'uniform'] as ColorMode[]).map((mode) => (
              <button
                key={mode}
                className={`${styles.modeBtn} ${colorMode === mode ? styles.active : ''}`}
                onClick={() => setColorMode(mode)}
              >
                {mode === 'speed' ? '速度' : mode === 'pressure' ? '压力' : '统一'}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>车身颜色</label>
          <div className={styles.colorRow}>
            <input
              type="color"
              value={carColor}
              onChange={(e) => setCarColor(e.target.value)}
              className={styles.colorPicker}
            />
            <span className={styles.value}>{carColor}</span>
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={showStreamlines}
              onChange={(e) => setShowStreamlines(e.target.checked)}
            />
            显示流线拖尾
          </label>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />
            显示地面网格
          </label>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={useRealModel}
              onChange={(e) => setUseRealModel(e.target.checked)}
            />
            加载真实模型 (27MB)
          </label>
        </div>

        <div className={styles.section}>
          <button className={styles.screenshotBtn} onClick={takeScreenshot}>
            截图导出
          </button>
        </div>

        <div className={styles.legend}>
          <div className={styles.legendTitle}>
            {colorMode === 'speed' ? '速度图例' : colorMode === 'pressure' ? '压力图例' : ''}
          </div>
          {colorMode !== 'uniform' && (
            <div className={styles.legendBar}>
              <span>{colorMode === 'speed' ? '低速' : '低压'}</span>
              <div className={styles.gradient} />
              <span>{colorMode === 'speed' ? '高速' : '高压'}</span>
            </div>
          )}
        </div>
      </aside>

      {/* 3D 视口 */}
      <div className={styles.viewport}>
        <Canvas
          ref={canvasRef}
          camera={{ position: [4, 3, 6], fov: 45 }}
          gl={{ preserveDrawingBuffer: true, antialias: true, powerPreference: 'default' }}
          dpr={[1, 1.5]}
          style={{ background: '#0a0a18' }}
          onCreated={({ gl }) => {
            // WebGL context 丢失后自动恢复
            const canvas = gl.domElement
            canvas.addEventListener('webglcontextlost', (e) => {
              e.preventDefault()
              console.warn('WebGL context lost, will restore...')
            })
            canvas.addEventListener('webglcontextrestored', () => {
              console.log('WebGL context restored')
            })
          }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[10, 10, 5]} intensity={0.8} />
          <directionalLight position={[-5, 8, -3]} intensity={0.3} color="#aaccff" />

          <SU7CarModel color={carColor} useRealModel={useRealModel} />

          <WindParticles
            count={particleCount}
            windSpeed={windSpeed}
            colorMode={colorMode}
            showStreamlines={showStreamlines}
            particleSize={particleSize}
          />

          {showGrid && (
            <Grid
              infiniteGrid
              cellSize={1}
              sectionSize={5}
              cellColor="#1a1a3a"
              sectionColor="#2a2a5a"
              fadeDistance={25}
              position={[0, -0.1, 0]}
            />
          )}

          <OrbitControls
            makeDefault
            minDistance={3}
            maxDistance={20}
            target={[0, 0.5, 0]}
          />

          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport labelColor="white" axisHeadScale={1} />
          </GizmoHelper>
        </Canvas>

        {/* HUD 信息覆盖层 */}
        <div className={styles.hud}>
          <span>Wind: {windSpeed.toFixed(1)} m/s</span>
          <span>Particles: {particleCount}</span>
        </div>
      </div>
    </div>
  )
}
