#!/bin/sh
# Fetches real Scryfall API responses into tests/fixtures/.
# Follows the Scryfall rules: Accept header, descriptive User-Agent, and
# at least 500 ms between requests.
set -eu
cd "$(dirname "$0")/../tests/fixtures"
API="https://api.scryfall.com"
UA="CardDiscoveryDev/0.1"
ACCEPT="application/json;q=0.9,*/*;q=0.8"

get() { # get <file> <path>
  curl -sS -A "$UA" -H "Accept: $ACCEPT" "$API$2" -o "$1"
  echo "saved $1"
  sleep 0.6
}
post() { # post <file> <path> <json>
  curl -sS -A "$UA" -H "Accept: $ACCEPT" -H "Content-Type: application/json" \
    -X POST --data "$3" "$API$2" -o "$1"
  echo "saved $1"
  sleep 0.6
}

get card-normal.json "/cards/named?exact=Llanowar%20Elves"
get card-transform.json "/cards/named?exact=Delver%20of%20Secrets"
get card-mdfc.json "/cards/named?exact=Shatterskull%20Smashing"
get card-split.json "/cards/named?exact=Fire%20//%20Ice"
get card-adventure.json "/cards/named?exact=Bonecrusher%20Giant"
get card-basic-land.json "/cards/named?exact=Forest"
get card-snow-basic.json "/cards/named?exact=Snow-Covered%20Forest"
get search-rebalanced.json "/cards/search?q=is%3Arebalanced&unique=cards&order=name"
get random-404.json "/cards/random?q=asdf"
get search-404.json "/cards/search?q=asdf&unique=cards"
get search-invalid.json "/cards/search?q=mv%3Eabc&unique=cards"
get search-bad-request.json "/cards/search?q=c%3Dq&unique=cards"
get search-warnings.json "/cards/search?q=t%3Aelf%20f%3Astandard%20c%3Dq&unique=cards"
get search-list.json "/cards/search?q=f%3Astandard%20game%3Aarena%20t%3Agoblin%20r%3Arare&unique=cards"
ID=$(node -e 'console.log(require("./card-normal.json").id)')
post collection-not-found.json "/cards/collection" \
  "{\"identifiers\":[{\"id\":\"$ID\"},{\"id\":\"9b1c6c0e-2f43-4c33-9c1e-5f2a0d7b1e11\"}]}"

# Added for the design overhaul: paging, rulings, Brawl, synergy, and counters tests.
get search-page.json "/cards/search?q=t%3Agoblin&unique=cards&order=cmc&dir=desc"
DELVER=$(node -e 'console.log(require("./card-transform.json").id)')
get rulings.json "/cards/$DELVER/rulings"
get card-legendary.json "/cards/named?exact=Krenko%2C%20Mob%20Boss"
get card-planeswalker.json "/cards/named?exact=Teferi%2C%20Hero%20of%20Dominaria"
get card-landfall.json "/cards/named?exact=Lotus%20Cobra"
get card-enchantress.json "/cards/named?exact=Starfield%20Mystic"
get card-flyer.json "/cards/named?exact=Serra%20Angel"

# Added for GitHub sync: real responses from the GitHub REST API, from a
# public repository and with no token (and one with a token that is not
# valid). These requests send curl's default User-Agent.
GH="https://api.github.com"
GH_ACCEPT="application/vnd.github+json"
GH_VERSION="2022-11-28"
gh_get() { # gh_get <file> <path> [token]
  if [ -n "${3:-}" ]; then
    curl -sS -H "Accept: $GH_ACCEPT" -H "X-GitHub-Api-Version: $GH_VERSION" -H "Authorization: Bearer $3" "$GH$2" -o "$1"
  else
    curl -sS -H "Accept: $GH_ACCEPT" -H "X-GitHub-Api-Version: $GH_VERSION" "$GH$2" -o "$1"
  fi
  echo "saved $1"
  sleep 0.6
}
gh_get github-repo.json "/repos/octocat/Hello-World"
gh_get github-contents.json "/repos/octocat/Hello-World/contents/README"
gh_get github-contents-404.json "/repos/octocat/Hello-World/contents/no-such-file.json"
gh_get github-401.json "/repos/octocat/Hello-World" "not-a-real-token"
# Added for backups on GitHub: a folder listing.
gh_get github-dir.json "/repos/octocat/Spoon-Knife/contents/"
