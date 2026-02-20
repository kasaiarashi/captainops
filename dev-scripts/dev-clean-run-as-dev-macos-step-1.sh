#!/bin/sh

if ! [ $(id -u) = 0 ]; then
   echo "Must run as sudo or root"
   exit 1
fi

CAPTAIN_DATA_DIR="${CAPTAIN_BASE_DIRECTORY:-/Users/$SUDO_USER/captain-data}"

# on macOS Catalina and above, the root filesystem is read-only.
# Use a writable directory instead of /captain
mkdir -p "$CAPTAIN_DATA_DIR"
rm -rf "$CAPTAIN_DATA_DIR"/*
chmod -R 777 "$CAPTAIN_DATA_DIR"
