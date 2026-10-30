#!/usr/bin/env bash
#
# Tells Bing (and other IndexNow search engines: Yandex, Seznam, Naver) which of our pages exist or changed, so new and
# updated pages are crawled in minutes instead of whenever the engine next visits. Bing's index also feeds ChatGPT
# search and Copilot, so this matters for AI visibility too. Google does not use IndexNow (submit the sitemap in Search Console).
#
# The key file web/public/b26ba9e23765ba99159648ecd0c220f7.txt must be live at https://dripemporium.store/b26ba9e23765ba99159648ecd0c220f7.txt first (it is deployed with the
# site). Safe to run repeatedly; run it after a deploy that adds pages, or weekly from cron:
#   0 5 * * 1 /root/drip-emp-ops/scripts/indexnow.sh >> /var/log/indexnow.log 2>&1

set -Eeuo pipefail

SITE="${SITE:-https://dripemporium.store}"
KEY="b26ba9e23765ba99159648ecd0c220f7"

# Fail early if the key file is not reachable: the engine would reject every URL otherwise.
if [[ "$(curl -fsS "${SITE}/${KEY}.txt")" != "${KEY}" ]]; then
  echo "Key file ${SITE}/${KEY}.txt is not live yet (deploy first)." >&2
  exit 1
fi

PAYLOAD="$(curl -fsS "${SITE}/sitemap.xml" | python3 -c '
import json, re, sys
site, key = sys.argv[1], sys.argv[2]
urls = re.findall(r"<loc>([^<]+)</loc>", sys.stdin.read())
print(json.dumps({"host": site.split("//", 1)[1], "key": key, "keyLocation": f"{site}/{key}.txt", "urlList": urls}))
' "${SITE}" "${KEY}")"

echo "Submitting $(echo "${PAYLOAD}" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["urlList"]))') URLs to IndexNow"
# A brand-new key is validated lazily: IndexNow fetches the key file itself, and the first submission can come back 403
# ("key not valid") if that check has not completed yet. Wait and retry before treating it as a real failure.
for attempt in 1 2 3; do
  CODE="$(curl -sS -o /dev/null -w "%{http_code}" -X POST "https://api.indexnow.org/indexnow" \
    -H "Content-Type: application/json; charset=utf-8" -d "${PAYLOAD}")"
  echo "IndexNow responded HTTP ${CODE} (200 or 202 = accepted)"
  [[ "${CODE}" == "200" || "${CODE}" == "202" ]] && exit 0
  [[ "${CODE}" == "403" && "${attempt}" -lt 3 ]] || break
  echo "403 usually means the new key has not been validated yet; retrying in 30 seconds (attempt ${attempt} of 3)"
  sleep 30
done
exit 1
