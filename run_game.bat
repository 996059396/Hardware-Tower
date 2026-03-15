@echo off
echo [Hardware Tower] 正在检查环境...
cd frontend
if not exist node_modules (
    echo [1/2] 正在安装依赖 (首次运行较慢)...
    call npm install --legacy-peer-deps
)
echo [2/2] 正在启动预览环境...
call npm run build
call npm run preview
pause