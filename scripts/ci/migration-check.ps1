# Sobe PostgreSQL descartavel, aplica todas as migracoes Prisma e para o container.
# Requer: docker no PATH, DATABASE_URL no ambiente (passada pelo pipeline).
# Regra 4 do docs/DEPLOY.md: migracoes validadas no PR, antes de chegar em main.

$ErrorActionPreference = "Stop"

# Agente self-hosted e persistente entre builds (docs/CI.md): um build
# interrompido pode deixar o container anterior de pe, travando o proximo
# "docker run --name pg-migcheck" por nome duplicado. Remove antes de subir.
#
# Consulta a existencia primeiro em vez de remover e engolir o erro: no Windows
# PowerShell 5.1, redirecionar o stderr de um executavel nativo ("docker rm ...
# 2>$null") transforma cada linha em NativeCommandError e, com
# $ErrorActionPreference = "Stop", aborta o script -- foi assim que o passo
# falhou quando nao havia container residual (o caso normal).
$residual = docker ps -aq --filter "name=^pg-migcheck$"
if ($residual) { docker rm -f pg-migcheck | Out-Null }

# A porta publicada vem da propria DATABASE_URL: uma so fonte de verdade entre
# o pipeline e este script (se as duas divergirem, o prisma aponta para um banco
# que nao existe). Nao pode ser a 5432 padrao -- o agente e self-hosted e a
# mesma maquina roda o Postgres de desenvolvimento nela (docs/CI.md), entao a
# 5432 ja esta ocupada e o "docker run -p 5432:5432" falha por porta em uso.
if (-not $env:DATABASE_URL) { throw "DATABASE_URL nao definida (o pipeline deve passa-la)." }
$porta = ([uri]$env:DATABASE_URL).Port
if ($porta -le 0) { throw "DATABASE_URL sem porta explicita: $($env:DATABASE_URL)" }

docker run -d --name pg-migcheck --rm `
  -e POSTGRES_USER=ci -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=ci `
  -p "${porta}:5432" postgres:16-alpine

# Sem numero fixo de tentativas: continua ate o Postgres aceitar conexoes
# (tudo passa) ou ate um bloqueio real (container saiu do estado "running").
# Um timeout arbitrario so trocaria uma falha real por um erro de prazo sem
# diagnostico -- o sinal que importa e o estado do container, nao o relogio.
$ok = $false
while (-not $ok) {
    $status = docker inspect -f "{{.State.Status}}" pg-migcheck 2>&1
    if ($status -notmatch "running") {
        Write-Host "--- logs do pg-migcheck (bloqueio real: saiu de 'running') ---"
        docker logs pg-migcheck 2>&1
        throw "pg-migcheck nao esta rodando (status: $status)."
    }

    if ((docker exec pg-migcheck pg_isready -U ci 2>&1) -match "accepting") {
        $ok = $true
    } else {
        Start-Sleep 2
    }
}

try {
    # schema.prisma exige directUrl (conexao direta, sem pooler) para o Neon
    # em produção. O banco descartavel do CI nao tem pooler -- mesma conexao
    # serve para as duas variaveis.
    $env:DIRECT_URL = $env:DATABASE_URL
    npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { exit 1 }
} finally {
    docker stop pg-migcheck | Out-Null
}
