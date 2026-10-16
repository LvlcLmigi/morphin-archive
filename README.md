# The Morphin Archive

The website at https://powerrangers.volbeat.vip, a gallery of Heroes of the Grid Ranger cards and decks.

The cards, decks, likes and comments live in Google Apps Script (with a Google Sheet and Drive folder).
This repository only publishes the pages:

- `build.py` downloads the current pages and card data from the Apps Script and writes the site.
- `.github/workflows/site.yml` runs it on every change here, every 20 minutes, and from **Actions → Build site → Run workflow**.
  It only republishes when something changed.

Phones get the phone layout (`m.html`); computers get the full gallery. `?full=1` keeps a phone on the full site.

If GitHub pauses the 20-minute schedule after a long quiet spell, open **Actions → Build site** and choose **Enable workflow**.
The site keeps working either way; it just won't pick up new page designs until the next run.
