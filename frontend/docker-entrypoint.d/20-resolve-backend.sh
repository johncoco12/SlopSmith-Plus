#!/bin/sh
# Patch nginx resolver to use whatever DNS server the container actually got
# (Docker = 127.0.0.11, Podman = network gateway e.g. 10.89.0.1)
RESOLVER=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
if [ -n "$RESOLVER" ]; then
    sed -i "s|resolver [0-9.]*|resolver $RESOLVER|g" /etc/nginx/conf.d/default.conf
fi
