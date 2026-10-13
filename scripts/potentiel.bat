@echo off
rem Calcule les potentiels de site (data\potentiel-*.png) avec le Python/GDAL de QGIS.
rem Usage : scripts\potentiel.bat [--force] [--largeur-web 4096]
call "C:\Program Files\QGIS 3.44.14\bin\o4w_env.bat" >nul
python "%~dp0potentiel.py" %*
