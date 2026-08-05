#!/bin/zsh
# CRF Comps — Mac SMS queue sender launcher
# Double-click this file in Finder to run the sender in Terminal.

cd "$(dirname "$0")"
node send-sms-queue.js

echo ""
read -p "Press Enter to close..."
