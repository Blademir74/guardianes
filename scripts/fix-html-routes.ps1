# fix-html-routes.ps1
# Script para corregir todas las rutas antiguas en archivos HTML

Write-Host "🔧 CORRIGIENDO RUTAS EN ARCHIVOS HTML" -ForegroundColor Cyan
Write-Host ""

$replacements = @(
    @{
        Old = "/api/data/municipios"
        New = "/api/data/municipalities"
    },
    @{
        Old = "/api/data/candidatos"
        New = "/api/data/candidates"
    }
)

$files = @(
    "public/index.html",
    "public/admin.html",
    "public/landing.html"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "📝 Procesando $file..." -ForegroundColor Yellow
        
        $content = Get-Content $file -Raw -Encoding UTF8
        $changed = $false
        
        foreach ($replacement in $replacements) {
            if ($content -match [regex]::Escape($replacement.Old)) {
                $content = $content -replace [regex]::Escape($replacement.Old), $replacement.New
                Write-Host "   ✅ Reemplazado: $($replacement.Old) → $($replacement.New)" -ForegroundColor Green
                $changed = $true
            }
        }
        
        if ($changed) {
            $content | Set-Content $file -Encoding UTF8 -NoNewline
            Write-Host "   💾 Guardado" -ForegroundColor Green
        } else {
            Write-Host "   ℹ️  Sin cambios necesarios" -ForegroundColor Gray
        }
    } else {
        Write-Host "❌ Archivo no encontrado: $file" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "✅ Corrección completada" -ForegroundColor Green
Write-Host ""
Write-Host "Ejecuta ahora:" -ForegroundColor Cyan
Write-Host "   git add ." -ForegroundColor White
Write-Host "   git commit -m 'Fix: Corregir rutas de API en HTML'" -ForegroundColor White
Write-Host "   git push origin main" -ForegroundColor White