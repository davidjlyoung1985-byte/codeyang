@echo off
chcp 65001 >nul
title CodeYang ↔ Claude Code Bridge
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   CodeYang ↔ Claude Code Bridge         ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  Starting bridge server...
echo.

npx tsx src/bridge/server.ts

pause
