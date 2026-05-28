#!/bin/sh
# Patch nginx resolver to use whatever DNS server the container actually got
# (Docker = 127.0.0.11, Podman = network gateway e.g. 10.89.0.1)
RESOLVER=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
if [ -n "$RESOLVER" ]; then
    sed -i "s|resolver [0-9.]*|resolver $RESOLVER|g" /etc/nginx/conf.d/default.conf
fi

# When the web service uses network_mode: host, 'web:8080' is unreachable via
# Docker DNS. Instead, host.docker.internal is injected via extra_hosts into
# /etc/hosts pointing at the host gateway. nginx's resolver can't read /etc/hosts,
# so we resolve the IP here and substitute it directly — a raw IP in set $backend
# is used as-is without any DNS lookup.
BACKEND_IP=$(awk '/[[:space:]]host\.docker\.internal([[:space:]]|$)/{print $1; exit}' /etc/hosts)
if [ -n "$BACKEND_IP" ]; then
    sed -i "s|host\.docker\.internal|$BACKEND_IP|g" /etc/nginx/conf.d/default.conf
fi
