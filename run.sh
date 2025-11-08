#!/bin/bash
set -a
source .env
set +a
exec node_modules/.bin/tsx watch src/server.ts
