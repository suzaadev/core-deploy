#!/bin/bash
export $(cat .env | grep -v '^#' | xargs)
pnpm exec tsx watch src/server.ts
