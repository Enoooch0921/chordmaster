# Simultaneous rhythm voices

`Bar.rhythm` remains the primary rhythm. `Bar.rhythmVoices` optionally adds independent rows with `{ id, label, rhythm }`. Use the same id in adjacent bars for the same instrument; cross-bar ties follow that id rather than the next rendered row. `primary` is reserved for the original lane.

Each voice uses the existing rhythm token grammar, including rests, crossheads and hidden spacers. A short notation such as `q` states only a first-beat quarter note; later beats remain unspecified and are not automatically changed into rests. Primary chord, rhythm and melody fields are preserved when editing an additional voice.

Both editors expose “Additional rhythm voices” with editable labels and note controls. In the preview editor, expanding this area replaces the primary keyboard until collapsed. Sheets align voice rows, reserve vertical space in all three layouts, and include the additional rows in PDF exports. Complete-bar copying and JSON normalization preserve voices.

Existing charts need no migration. Older clients cannot display additional voices; update web/native clients before editing charts that use them. Publishing the web build does not update an installed native app.
