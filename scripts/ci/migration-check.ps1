# Sobe PostgreSQL descartavel, aplica todas as migracoes Prisma e para o container.
# Requer: docker no PATH, DATABASE_URL no ambiente (passada pelo pipeline).
# Regra 4 do docs/DEPLOY.md: migracoes validadas no PR, antes de chegar em main.

$ErrorActionPreference = "Stop"

# Agente self-hosted e persistente entre builds (docs/CI.md): um build
# interrompido pode deixar o container anterior de pe, travando o proximo
# "docker run --name pg-migcheck" por nome duplicado. Remove antes de subir.
docker rm -f pg-migcheck 2>$null | Out-Null

docker run -d --name pg-migcheck --rm `
  -e POSTGRES_USER=ci -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=ci `
  -p 5432:5432 postgres:16-alpine

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
    npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { exit 1 }
} finally {
    docker stop pg-migcheck | Out-Null
}
