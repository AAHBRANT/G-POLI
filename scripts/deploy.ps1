# Deploy manual do G-Politicas para o Container App de homologacao.
# Runbook completo: docs/DEPLOY.md ("Passo a passo - subir uma nova versao manualmente").
# Uso: .\scripts\deploy.ps1 -Version v12
#
# Pre-requisito: a PR ja precisa estar mergeada em origin/main. Este script
# nunca builda a partir de um branch nao mergeado - isso e deliberado (regra 4
# do DEPLOY.md: so o que passou pelo CI e revisao vai pra homologacao).

param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

$AcrName = "acrgpolhml27207f"
$AppName = "ca-gpol-hml-aahbrant"
$ResourceGroup = "rg-gpoliticas"
$PublicUrl = "https://ca-gpol-hml-aahbrant.whitesmoke-8dee35f8.brazilsouth.azurecontainerapps.io/"
$Image = "gpoliticas:$Version"
$ImageRemoto = "$AcrName.azurecr.io/gpoliticas:$Version"

function Passo($texto) {
    Write-Host ""
    Write-Host "=== $texto ===" -ForegroundColor Cyan
}

# --- 0. Confirmar que estamos em main, atualizado com origin ---
Passo "0/6 - Confirmando main atualizado"
git fetch origin
$local = git rev-parse main
$remoto = git rev-parse origin/main
if ($local -ne $remoto) {
    git checkout main
    git pull --ff-only origin main
}
git log --oneline -3

# --- 1. Build da imagem ---
Passo "1/6 - Build da imagem $Image"
docker build -t $Image .
if ($LASTEXITCODE -ne 0) { throw "Build falhou." }

# --- 2. Smoke test: banco descartavel + boot completo ---
Passo "2/6 - Smoke test (migracoes + boot)"

$netName = "gpol-smoke-net"
$pgName = "gpol-smoke-pg"
$appName = "gpol-smoke-app"

# Limpeza de residuo de uma execucao anterior interrompida.
docker rm -f $appName $pgName 2>$null | Out-Null
docker network rm $netName 2>$null | Out-Null

try {
    docker network create $netName | Out-Null

    docker run -d --name $pgName --network $netName `
        -e POSTGRES_USER=gpol -e POSTGRES_PASSWORD=gpol_dev -e POSTGRES_DB=gpoliticas `
        postgres:15-alpine | Out-Null

    $pronto = $false
    for ($i = 0; $i -lt 15; $i++) {
        if ((docker exec $pgName pg_isready -U gpol 2>&1) -match "accepting") { $pronto = $true; break }
        Start-Sleep 1
    }
    if (-not $pronto) { throw "Postgres de smoke test nao ficou pronto." }

    docker run -d --name $appName --network $netName -p 13000:3000 `
        -e DATABASE_URL="postgresql://gpol:gpol_dev@${pgName}:5432/gpoliticas?schema=public" `
        -e AZURE_AD_TENANT_ID="8cc518ea-6df8-4d1e-a79f-89ee9314335c" `
        -e AZURE_AD_CLIENT_ID="1b98db67-5ce0-469e-aea3-8beaf8044b87" `
        -e AZURE_AD_CLIENT_SECRET="dummy" `
        -e AUTH_SECRET="dummy_secret_for_smoke_test_only_1234" `
        -e APP_BASE_URL="http://localhost:13000" `
        -e ADMIN_EMAILS="wellington.lourenco@aahbrant.com" `
        $Image | Out-Null

    Start-Sleep 5
    $logs = docker logs $appName 2>&1 | Out-String
    Write-Host $logs

    if ($logs -notmatch "All migrations have been successfully applied") {
        throw "Migracoes nao aplicaram limpo no smoke test - ver log acima. Deploy ABORTADO."
    }
    if ($logs -notmatch "Ready in") {
        throw "Next.js nao subiu no smoke test - ver log acima. Deploy ABORTADO."
    }

    $codigoRaiz = curl.exe -s -o NUL -w "%{http_code}" http://localhost:13000/
    $codigoHealth = curl.exe -s -o NUL -w "%{http_code}" http://localhost:13000/api/health
    Write-Host "GET / -> $codigoRaiz | GET /api/health -> $codigoHealth"
    if ($codigoHealth -ne "200") { throw "Health check do smoke test nao respondeu 200 (respondeu $codigoHealth). Deploy ABORTADO." }
}
finally {
    docker rm -f $appName $pgName 2>$null | Out-Null
    docker network rm $netName 2>$null | Out-Null
}

# --- 3. Push para o ACR ---
Passo "3/6 - Push para o ACR"
az acr login --name $AcrName
docker tag $Image $ImageRemoto
docker push $ImageRemoto
if ($LASTEXITCODE -ne 0) { throw "Push para o ACR falhou." }

# --- 4. Atualizar o Container App ---
Passo "4/6 - Atualizando revisao do Container App"
az containerapp update --name $AppName --resource-group $ResourceGroup --image $ImageRemoto | Out-Null

# --- 5. Aguardar a revisao nova ficar Healthy ---
Passo "5/6 - Aguardando revisao nova ficar Healthy"
$revisaoNova = az containerapp revision list --name $AppName --resource-group $ResourceGroup `
    --query '[?properties.trafficWeight==`100`].name | [0]' -o tsv

$saudavel = $false
for ($i = 0; $i -lt 12; $i++) {
    $estado = az containerapp revision show --name $AppName --resource-group $ResourceGroup `
        --revision $revisaoNova --query "properties.healthState" -o tsv
    Write-Host "  tentativa $($i+1): $estado"
    if ($estado -eq "Healthy") { $saudavel = $true; break }
    if ($estado -eq "Unhealthy") { break }
    Start-Sleep 5
}

if (-not $saudavel) {
    Write-Host "Revisao $revisaoNova NAO ficou Healthy. Logs:" -ForegroundColor Red
    az containerapp logs show --name $AppName --resource-group $ResourceGroup --tail 100
    throw "Deploy da revisao $revisaoNova falhou o health check. Considere rollback: az containerapp revision activate --name $AppName --resource-group $ResourceGroup --revision <revisao-anterior>"
}

# --- 6. Confirmar publicamente ---
Passo "6/6 - Confirmando URL publica"
$codigoPublico = curl.exe -s -o NUL -w "%{http_code}" $PublicUrl
Write-Host "GET $PublicUrl -> $codigoPublico"

Write-Host ""
Write-Host "Deploy de $Version concluido. Revisao $revisaoNova Healthy, 100% do trafego." -ForegroundColor Green
