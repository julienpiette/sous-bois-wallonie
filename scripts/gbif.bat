@echo off
rem Observations GBIF des espèces suivies en Wallonie (validation de la carte).
call "C:\Program Files\QGIS 3.44.14\bin\o4w_env.bat" >nul
python "%~dp0gbif.py" %*
