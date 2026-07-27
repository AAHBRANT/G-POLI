#!/bin/sh
set -e
# Aplica migrações pendentes e sobe o servidor Next (standalone).
# Fail-closed (ver docs/DEPLOY.md): se a migração falhar, o container NÃO sobe.
# Com `set -e`, o erro do migrate encerra o processo — a revisão nova fica sem
# tráfego e a revisão anterior continua servindo. Nunca subir com o schema em
# estado desconhecido.
echo "→ prisma migrate deploy"
node node_modules/prisma/build/index.js migrate deploy
echo "→ iniciando Next"
exec node server.js
