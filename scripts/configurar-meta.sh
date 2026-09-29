#!/bin/bash
# Configura as chaves do Instagram no GitHub sem expor o token.
# Uso (no Terminal do Mac): bash scripts/configurar-meta.sh
set -e
REPO="justinmarcossss/cbrdoc-feed-publicacao"
GRAPH="https://graph.facebook.com/v23.0"
printf "Cole o token da Meta e aperte Enter (não aparece na tela): "
read -rs TOKEN; echo
[ -z "$TOKEN" ] && { echo "Token vazio."; exit 1; }

echo "Procurando a conta do Instagram ligada às páginas..."
RESP=$(curl -s "$GRAPH/me/accounts?fields=name,instagram_business_account%7Busername%7D&access_token=$TOKEN")
IDS=$(echo "$RESP" | python3 -c '
import json,sys
d=json.load(sys.stdin)
if "error" in d: print("ERRO:", d["error"].get("message")); sys.exit(1)
for p in d.get("data",[]):
    ig=p.get("instagram_business_account")
    if ig: print(ig["id"], "@"+ig.get("username",""), "| página:", p["name"])
')
echo "$IDS"
[ -z "$IDS" ] && { echo "Nenhuma conta do Instagram encontrada para esse token. Confira as permissões e os ativos do usuário do sistema."; exit 1; }
IG_ID=$(echo "$IDS" | grep -i cbrdoc | head -1 | awk '{print $1}')
[ -z "$IG_ID" ] && IG_ID=$(echo "$IDS" | head -1 | awk '{print $1}')
echo "Usando a conta: $(echo "$IDS" | grep "^$IG_ID")"

gh secret set IG_ACCESS_TOKEN -R "$REPO" -b "$TOKEN"
gh secret set IG_USER_ID -R "$REPO" -b "$IG_ID"
unset TOKEN
echo "Pronto: IG_ACCESS_TOKEN e IG_USER_ID salvos no GitHub."
