#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
    python manage.py migrate --noinput
fi

if [ "${1:-}" = "gunicorn" ]; then
    python manage.py collectstatic --noinput
fi

exec "$@"
