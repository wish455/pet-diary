@echo off
chcp 65001 >nul
title 铲屎官日记 · 宠物管理系统
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [错误] 没有找到 Node.js，请先安装 Node.js 22.5 或更高版本：
  echo   https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动「铲屎官日记 · 宠物管理系统」...
echo   启动完成后浏览器会自动打开 http://127.0.0.1:3000
echo   关闭本窗口即可停止服务。
echo.

start "" /b cmd /c "timeout /t 2 >nul & start http://127.0.0.1:3000"
node server\index.js

echo.
echo   服务已停止。
pause
