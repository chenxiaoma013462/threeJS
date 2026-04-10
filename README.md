# 3D 可视化工作台

基于 Next.js + Three.js 构建的 3D 可视化应用，包含 3D 场景编辑工作台和风洞模拟测试系统。

## 功能模块

### 3D 场景工作台
- 3D 场景搭建与编辑
- 工具面板与属性面板
- 场景对象管理

### 风洞模拟
- 小米 SU7 车型模型加载
- 粒子系统模拟气流流动
- 流线/流光风洞测试视觉效果

## 技术栈

- **框架**: Next.js 15 + React 19
- **3D 引擎**: Three.js + React Three Fiber + Drei
- **语言**: TypeScript

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看 3D 工作台。

访问 [http://localhost:3000/wind-tunnel](http://localhost:3000/wind-tunnel) 查看风洞模拟。

## 项目结构

```
src/
├── app/
│   ├── page.tsx              # 首页 - 3D 工作台
│   └── wind-tunnel/
│       └── page.tsx          # 风洞模拟页面
├── components/
│   ├── three/                # 3D 场景组件
│   │   ├── scene-canvas.tsx
│   │   ├── scene-content.tsx
│   │   └── three-workbench.tsx
│   ├── wind-tunnel/          # 风洞模拟组件
│   │   ├── su7-car-model.tsx
│   │   ├── wind-particles.tsx
│   │   └── wind-tunnel-scene.tsx
│   └── tools/                # 工具面板组件
│       ├── tool-panel.tsx
│       └── properties-panel.tsx
└── types/
    └── scene.ts              # 场景类型定义
```

## 构建部署

```bash
# 构建生产版本
npm run build

# 启动生产服务器
npm start
```
