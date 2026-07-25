#!/bin/sh
set -e
# Aplica migrações pendentes e sobe o servidor Next (standalone).
echo "→ prisma migrate deploy"
node node_modules/prisma/build/index.js migrate deploy || echo "migrate falhou (segue mesmo assim)"
echo "→ iniciando Next"
exec node server.js
