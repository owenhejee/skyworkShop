@echo off
setlocal
node "%~dp0setup-ai-stats.cjs" --setup
exit /b %ERRORLEVEL%
