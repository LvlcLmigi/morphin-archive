# RPG quick-add data

Builds `static/rpgadd.json`, the list of things in each RPG book that the book reader's "Add to sheet" tray can put on a character sheet.

1. `python3 dl.py` downloads every RPG book listed on the site into `pdf/` (through the Apps Script backend).
2. `python3 ext.py` pulls each page's text lines (with font size and position) into `txt/`.
3. `python3 books.py` reads the sections each book uses for origins, influences, roles, perks, Grid Powers, weapons, armor, gear, vehicles, Zord features and Zords (page ranges are set per book in `books.py`).

4. `python3 roles.py` reads each Role's starting features, level table and role perk text into `roles.json`.
5. `python3 export.py` writes `rpgadd.json` (the reader's tray) and `rpgrules.json` (the guided character builder); copy both to `static/`. The tray file's shape is `{books: {fileId: [ {p, q, k, n, d, f} ]}}`, where p/q are the book's PDF page range, k is the kind, n the name, d a short summary and f the fields to fill.
Needs `pip install pymupdf`. The scripts expect to run from a working folder holding `files.json`, `pdf/` and `txt/`.
