@echo off
rem Valide les cartes de potentiel avec les observations GBIF.
call "C:\Program Files\QGIS 3.44.14\bin\o4w_env.bat" >nul
python "%~dp0valider.py" %*
