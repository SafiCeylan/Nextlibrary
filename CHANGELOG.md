# Changelog

All notable changes to NextLibrary (Knowledge Cards) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-16

First public release, prepared for the Nextcloud App Store.

### Added
- Collections and pages with a browsable tree, a reading canvas and a related-pages rail.
- Rich text editor: headings, lists, quotes, code blocks, text colours, highlights,
  callouts, alignment, links, images and YouTube/Vimeo/MP4 video embeds.
- Per-user reading progress: mark pages as read, with progress bars and unread badges.
- Roles and visibility: owners and editors can write, readers can only read; collections
  are public to the instance or private to their members.
- Trash bin with restore and permanent delete for collections and pages.
- Optimistic locking to handle two people editing the same page.
- Media stored in Nextcloud app data (not inline in the database), with per-collection
  access control.
- Server-side HTML sanitisation on every write.
- Full English/Turkish localisation; dates and number formats follow the Nextcloud UI language.
- Light/dark theme switch; accent colours follow the Nextcloud primary theme colour.

### Notes
- This app began life internally as "collectivemap" / "Akademi". The app id is now
  `nextlibrary`; the display name is "Knowledge Cards" (Turkish: "Bilgi Kartları").
