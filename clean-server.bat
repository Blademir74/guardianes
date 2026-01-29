@echo off
echo Deteniendo servidor en puerto 3000...
netstat -ano | findstr :3000 > temp.txt
for /f "tokens=5" %%a in ('type temp.txt ^| findstr LISTENING') do (
  echo Matando proceso PID: %%a
  taskkill /PID %%a /F
)
del temp.txt 2>nul

echo Limpiando cache de Node...
npm cache clean --force 2>nul

echo Borrando node_modules/.cache...
rmdir /s /q node_modules\.cache 2>nul

echo Reiniciando servidor...
timeout /t 2 /nobreak >nul
npm start

pause