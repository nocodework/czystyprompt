#!/usr/bin/env bash
# Pobiera surowe listy imion i nazwisk z rejestru PESEL (dane.gov.pl) do data-raw/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data-raw
curl -fsSL -o data-raw/imiona_m.csv 'https://api.dane.gov.pl/media/resources/20200130/lista_imion_m%C4%99skich_os_%C5%BCyj%C4%85ce_2020-01-21.csv'
curl -fsSL -o data-raw/imiona_k.csv 'https://api.dane.gov.pl/media/resources/20200130/lista_imion_%C5%BCe%C5%84skich_os_%C5%BCyj%C4%85ce_2020-01-21.csv'
curl -fsSL -o data-raw/nazwiska_m.csv 'https://www.dane.gov.pl/media/resources/20190514/Nazwiska_m%C4%99skie_wyst%C4%99pujace_w_rejestrze_PESEL_stan_na_2019.04.15.csv'
curl -fsSL -o data-raw/nazwiska_k.csv 'https://www.dane.gov.pl/media/resources/20190514/Nazwiska_%C5%BCe%C5%84skie_wyst%C4%99puj%C4%85ce_w_rejestrze_PESEL_stan_na_2019.04.15.csv'
echo "OK — teraz: node scripts/build-data.mjs"
