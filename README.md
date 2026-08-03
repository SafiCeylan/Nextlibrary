# NextLibrary (Knowledge Cards)

A small learning library for Nextcloud. Group pages into **collections**, write them
with a rich text editor, and let your team read through them at their own pace. Every
page remembers who has read it and when, so reading progress is visible at a glance.

> Turkish name: **Bilgi Kartları**

## Features

- **Collections and pages** — a browsable tree on the left, a reading canvas in the middle, related pages on the right.
- **Reading progress** — mark pages as read; progress bars and unread badges show what is left.
- **Rich editor** — headings, lists, quotes, code blocks, text colours, highlights, callouts, alignment, links, images and YouTube/Vimeo/MP4 video embeds.
- **Roles and visibility** — collections can be public to the instance or private to their members. Editing is restricted to Nextcloud administrators; everyone else reads.
- **Trash bin** — deleted collections and pages can be restored.
- **Localisation** — English and Turkish; dates follow the Nextcloud UI language.
- **Theme** — a light/dark switch, with accent colours that follow the Nextcloud primary theme colour.

## Requirements

- Nextcloud 28–34

- PHP 8.0–8.3

## Installation

Once released on the [Nextcloud App Store](https://apps.nextcloud.com), install it from
**Apps → search "Knowledge Cards"**.

### Manual installation

Copy this repository into your Nextcloud `apps/` directory as a folder named
`nextlibrary`, then enable it:

```bash
cd /path/to/nextcloud
sudo -u www-data php occ app:enable nextlibrary
```

## Building a release tarball

The store expects a single top-level folder named after the app id:

```bash
# from the parent directory, with this repo checked out as ./nextlibrary
tar --exclude-vcs \
    --exclude='nextlibrary/dev.html' \
    --exclude='nextlibrary/.claude' \
    -czf nextlibrary.tar.gz nextlibrary/
```

## Development

`dev.html` is a standalone harness that renders the UI outside Nextcloud (it mocks the
`t()`/`n()` translation helpers and the REST API). Serve the folder with any static
server and open `dev.html`. It is a development aid only and is excluded from release builds.

### Tests

`tests/run.php` needs no Composer, no PHPUnit and no Nextcloud — only PHP with `ext-dom`:

```bash
php tests/run.php
```

It covers the HTML sanitiser and checks that the server-side whitelist
(`lib/Service/HtmlSanitizer.php`) still matches the client-side one (`js/app.js`). Those two
lists must never drift apart, so the check is mechanical rather than a comment. Tests are
excluded from release builds.

## License

[GNU AGPL v3](LICENSE) © Mehmet Safi Ceylan
