@echo off
rem Launches the widget directly via the Electron binary (no system Node needed)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
