# Local Manual PDF Missing Report v5.9

## CURRENT STATUS

Local manual manifest generation did not complete because required local PDFs or catalog codes are missing.

## CATALOG SOURCE

- Supabase active manual catalog

## MISSING LOCAL PDFS

- data/manuals-local/B737/B737 MAX/B737_MAX_FCOM_V1.pdf
- data/manuals-local/B737/B737 MAX/B737_MAX_FCOM_V2.pdf
- data/manuals-local/B737/B737 MAX/B737_MAX_MEL_NTP23_R06B_R06B.pdf
- data/manuals-local/B737/B737 MAX/B737_MAX_QRH.pdf
- data/manuals-local/B737/B737 NG/B737_NG_FCOM_V1.pdf
- data/manuals-local/B737/B737 NG/B737_NG_FCOM_V2.pdf
- data/manuals-local/B737/B737 NG/B737_NG_MEL_R52.pdf
- data/manuals-local/B737/B737 NG/B737_NG_QRH.pdf
- data/manuals-local/B737/FCTM/B737_NG_MAX_FCTM.pdf

## INVALID LOCAL PDF PATHS

- none

## MISSING ACTIVE SUPABASE CATALOG CODES

- none

## NEXT REQUIRED ACTION

Place the missing PDFs at the exact paths above, verify active manual catalog rows in Supabase if needed, then rerun `npm run manuals:manifest`.
