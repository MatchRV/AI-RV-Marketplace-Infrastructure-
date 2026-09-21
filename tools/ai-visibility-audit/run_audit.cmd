@echo off
REM MatchRV AI Visibility Audit v2 - double-click or CLI.
REM Forwards all arguments to audit.py (FIX v2: previously dropped).
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" audit.py %*
) else (
  where py >nul 2>nul && (py audit.py %*) || (python audit.py %*)
)
pause
