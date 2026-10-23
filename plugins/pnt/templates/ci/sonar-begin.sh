#!/usr/bin/env bash
# Starts a Sonar analysis with this project's analysis parameters.
#
# The ONE place `dotnet sonarscanner begin` is called: bitbucket-pipelines.yml
# and ci/verify.sh both run this script, so CI, local runs and per-developer
# local projects all apply the same exclusions and rule settings. Project
# parameters live in ci/sonar-analysis.properties next to this script.
#
# Usage: ci/sonar-begin.sh <project-key>
# Needs SONAR_HOST_URL and SONAR_TOKEN in the environment (never hard-code
# them, never echo the token).
set -euo pipefail

key="${1:?usage: ci/sonar-begin.sh <project-key>}"
: "${SONAR_HOST_URL:?SONAR_HOST_URL is not set}"
: "${SONAR_TOKEN:?SONAR_TOKEN is not set}"

properties="$(dirname "$0")/sonar-analysis.properties"
if [[ ! -f "$properties" ]]; then
  echo "sonar-begin: $properties not found." >&2
  exit 1
fi

# One `key=value` per line becomes one `/d:key=value` argument. Each stays a
# single quoted argument, so globs like **/Migrations/** are never expanded.
args=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  if [[ -z "${line//[[:space:]]/}" || "$line" =~ ^[[:space:]]*# ]]; then
    continue
  fi
  args+=("/d:$line")
done < "$properties"

# One version per pipeline run: Sonar's "previous version" new-code period only
# moves when the version changes; with a fixed version the whole project counts
# as new code. Local runs use "local".
version="${BITBUCKET_BUILD_NUMBER:-local}"

echo "sonar-begin: $key (version $version) with ${#args[@]} analysis parameter(s) from $properties"
dotnet sonarscanner begin \
  /k:"$key" \
  /v:"$version" \
  /d:sonar.host.url="$SONAR_HOST_URL" \
  /d:sonar.token="$SONAR_TOKEN" \
  /d:sonar.qualitygate.wait=true \
  "${args[@]}"
