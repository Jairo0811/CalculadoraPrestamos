#!/usr/bin/env bash
# Netlify "ignore builds": exit 0 = omitir, exit 1 = compilar. Se ejecuta en calculadora-prestamos/.
set -u

if [ "${CONTEXT:-}" = "branch-deploy" ]; then
  echo "Branch deploy de '${HEAD:-desconocida}' omitido: solo master (producción) y los Pull Requests se publican."
  exit 0
fi

if [ -z "${CACHED_COMMIT_REF:-}" ] || ! git cat-file -e "${CACHED_COMMIT_REF}^{commit}" 2>/dev/null; then
  echo "Sin commit previo comparable: se compila."
  exit 1
fi

if git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- . ../netlify.toml; then
  echo "Sin cambios en el frontend ni en netlify.toml desde ${CACHED_COMMIT_REF}: se omite el build."
  exit 0
fi

echo "Cambios en el frontend detectados: se compila."
exit 1
