@echo off
chcp 65001 >nul
title Claude Code Bridge Agent
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   Claude Code Bridge Agent              ║
echo  ║   (Run inside Claude Code terminal)     ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  Please set BRIDGE_TOKEN first.
echo  Copy the token from the bridge server output.
echo.
set /p TOKEN=Enter Bridge Token: 
set BRIDGE_TOKEN=%TOKEN%
echo.
echo  Starting Claude Code bridge agent...
echo.
echo  NOTE: Run this in Claude Code's integrated terminal
echo  so Claude Code can directly execute tasks.
echo.

npx tsx src/bridge/claude-agent.ts

pause
