#!/bin/bash
set -a
source .env
set +a
exec node --loader tsx src/server.ts
