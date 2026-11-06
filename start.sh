#!/bin/sh
set -e

CLIENT_PID=""
SERVER_PID=""

cleanup() {
  [ -n "$CLIENT_PID" ] && kill "$CLIENT_PID" 2>/dev/null || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

node --watch --env-file=.env server.js &
SERVER_PID=$!

./node_modules/.bin/vite &
CLIENT_PID=$!

wait
