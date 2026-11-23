# 启动 skyworkshop-backend（端口 8080）
# Windows 中文路径下 mvn spring-boot:run 可能 ClassNotFound，统一用可执行 jar 启动。
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $root 'skyworkshop-backend'
Set-Location $backend

$j17 = Get-ChildItem @('D:\Program Files\Eclipse Adoptium', 'C:\Program Files\Eclipse Adoptium') -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '17' } |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $j17) {
    throw '未找到 JDK 17，请安装 Temurin 17 并确保 JAVA_HOME 指向 JDK 17+'
}
$env:JAVA_HOME = $j17
$env:Path = "$j17\bin;" + $env:Path

$jar = Join-Path $backend 'target\skyworkshop-backend-1.0.0-exec.jar'
if (-not (Test-Path $jar)) {
    Write-Host '打包可执行 jar...'
    mvn -q package '-Dmaven.test.skip=true'
}
if (-not (Test-Path $jar)) {
    throw "未找到 $jar，打包失败"
}

Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "启动 $jar"
java -jar $jar
