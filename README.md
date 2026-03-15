# 🏗️ 硬件学院：通天塔 (Hardware Tower)

一个专为硬件工程师打造的硬核关卡式学习应用。涵盖了从电路基础到 EDA 布线的全维度交互体验。

## ✨ 核心特性
- **微型 EDA 引擎**：在浏览器中实现原生的电路拉线、元件旋转、以及实时网表拓扑判题。
- **硬核公式算法**：基于 AST 抽象语法树与蒙特卡洛验算，支持复杂的代数公式输入。
- **离线生存模式**：基于 PWA 技术，一次加载后可在无网络环境下完美运行。
- **云端拾荒同步**：零成本架构，利用 GitHub Gist 实现多端进度同步。

## 🚀 快速开始

### 方式 A：普通用户 (Windows)
1. 确保已安装 [Node.js](https://nodejs.org/)。
2. 双击运行根目录下的 `run_game.bat`。
3. 待浏览器自动打开或访问 `http://localhost:4173`。

### 方式 B：开发者模式
```bash
# 1. 编译题库
cd tools
node build.js

# 2. 启动前端
cd ../frontend
npm install --legacy-peer-deps
npm run dev
