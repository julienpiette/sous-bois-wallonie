@echo off
rem Demo sur smartphone : serveur local + tunnel Cloudflare temporaire (adresse https://....trycloudflare.com).
rem L'adresse s'affiche dans cette fenetre (ligne "Your quick Tunnel has been created"). Elle change a chaque lancement.
rem Fermer cette fenetre = fin de la demo. Le PC doit rester allume. Ne pas diffuser le lien (licence forets anciennes).
start "Sous-bois serveur" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 8080
"%USERPROFILE%\outils\cloudflared\cloudflared.exe" tunnel --no-autoupdate --url http://localhost:8080 --http-host-header localhost:8080
