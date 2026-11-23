# 启动 skyworkshop-frontend（端口 5173）
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$frontend = Join-Path $root 'skyworkshop-frontend'
Set-Location $frontend

if (-not (Test-Path 'node_modules')) {
    Write-Host '安装依赖 npm install...'
    npm install
}

npm run dev
