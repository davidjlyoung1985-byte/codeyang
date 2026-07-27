@echo off
cd /d e:\Qt\ai-code-agent
npx vitest run > C:\Users\Administrator\AppData\Local\Temp\vfinal2.txt 2>&1
findstr /n "." C:\Users\Administrator\AppData\Local\Temp\vfinal2.txt | findstr /r /c:"Test Files" /c:"Tests " 
