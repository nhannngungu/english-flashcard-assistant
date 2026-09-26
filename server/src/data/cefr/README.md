# Local CEFR vocabulary data

The analyzer loads these CSV files locally at server startup. It does not call a
remote CEFR service and it does not assign a guessed level when a lookup misses.

## Sources and terms

- `cefrj-vocabulary-profile-1.5.csv`: **The CEFR-J Wordlist Version 1.5**, compiled
  by Yukio Tono, Tokyo University of Foreign Studies. CEFR-J permits research and
  commercial use without charge when the dataset is cited. Copyright belongs to
  Tono Laboratory at TUFS. Source mirror:
  <https://github.com/openlanguageprofiles/olp-en-cefrj>
- `octanove-vocabulary-profile-c1c2-1.0.csv`: **Octanove Vocabulary Profile C1/C2
  Version 1.0**, created by Octanove Labs and distributed under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Source mirror:
  <https://github.com/openlanguageprofiles/olp-en-cefrj>

The downloaded copies came from the public Open Language Profiles mirror at
<https://github.com/vitwits/english-wordlist-cefr-a1-c2> on 2026-09-26.

## Deterministic mapping policy

CEFR-J supplies A1-B2 entries and Octanove supplies C1-C2 entries. When a
headword appears more than once (usually for different parts of speech), the
analyzer uses the earliest/lower listed CEFR band because this version does not
perform contextual part-of-speech disambiguation. Missing words remain
`Unknown`. Slash-separated spelling alternatives are indexed individually.
