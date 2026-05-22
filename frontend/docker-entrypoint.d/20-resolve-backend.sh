#!/bin/sh
# Resolve the backend container and add 'web' to /etc/hosts.
# Without this, nginx can't resolve the compose service name because
# podman's external docker-compose provider doesn't set up DNS for
# service names on the compose network.
if ! grep -q ' web$' /etc/hosts 2>/dev/null; then
  WEB_IP=$(getent hosts slopsmith-plus-web-1 2>/dev/null | awk '{print $1}')
  if [ -n "$WEB_IP" ]; then
    echo "$WEB_IP web" >> /etc/hosts
  fi
fi
