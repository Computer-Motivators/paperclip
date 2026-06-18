#!/bin/sh
set -eu
REQ_FILE="$(dirname "$0")/agent-python-requirements.txt"
apt-get update
apt-get install -y --no-install-recommends python3 python3-pip
pip3 install --no-cache-dir --break-system-packages -r "$REQ_FILE"
rm -rf /var/lib/apt/lists/*
