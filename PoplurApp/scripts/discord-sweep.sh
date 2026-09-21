#!/bin/zsh
# Every few minutes: hand the Tester role to signers who joined the server after signing.
# Key from the keychain item 'Poplur Funnel Key' (the FUNNEL_KEY on Vercel).
set -u
K="$(/usr/bin/security find-generic-password -s 'Poplur Funnel Key' -a local-owner -w 2>/dev/null)" || exit 0
/usr/bin/curl -s --max-time 25 -X POST -H "x-funnel-key: $K" "${POPLUR_SITE:-https://www.poplur.ca}/api/discord/sweep" >/dev/null
