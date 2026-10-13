@echo off
rem Télécharge les données sources avec le Python de QGIS. Usage : scripts\telecharger_sources.bat [jeu ...]
call "C:\Program Files\QGIS 3.44.14\bin\o4w_env.bat" >nul
python "%~dp0telecharger_sources.py" %*
