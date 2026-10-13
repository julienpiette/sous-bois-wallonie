@echo off
rem Donnees de "Pourquoi ici ?" (data/sigles.json + data/facteurs/) avec le Python/GDAL de QGIS.
call "C:\Program Files\QGIS 3.44.14\bin\o4w_env.bat" >nul
python "%~dp0facteurs.py" %*
