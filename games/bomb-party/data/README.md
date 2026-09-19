# French dictionary

`french.txt` is a local derivative of [Lexique 4.00](https://lexique.org/), by Boris New, Christophe Pallier, Gauvain Schalchli, Jessica Bourgin, Manuel Gimenes and contributors. The word-list data remains licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). This attribution and license apply to the data, independently of application code.

Source: https://lexique.org/databases/Lexique400/Lexique400.tsv (retrieved 2026-09-18).

Source SHA-256: `fe333b4f9e1797f23922d5863cde28635ee13685813af0f9b4b4b9f7d4610a5a`.

Changes: extract the word-form column; exclude spaces, digits and non-word punctuation; fold case, accents, œ/æ, hyphens and apostrophes; retain 2–40 letters; deduplicate and sort. Includes inflected forms. Result: **159,588** normalized words. This is Lexique's coverage, not JKLM's private dictionary; it is not a profanity-filtered list.

Rebuild with Node 24: `node scripts/import-french-dictionary.mjs /path/to/Lexique400.tsv`. The server reads this checked-in file locally; no dictionary request is made during play, and it is never included in the client bundle.
