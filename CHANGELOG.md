# Changelog

All notable changes to NextLibrary (Knowledge Cards) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.4] - 2026-07-17

### Added
- Screenshots and a repository link in the app metadata, so the App Store listing
  shows what the app looks like instead of a wall of text.

## [1.0.3] - 2026-07-17

### Changed
- Contact address updated to saficeylan89@gmail.com.
- Bug report link now points at this app's own repository instead of the old
  development repository.

## [1.0.2] - 2026-07-17

### Fixed
- App icon is now drawn in white so it stays visible on the Nextcloud navigation bar
  (bright background inverts dark icons, making a black icon disappear).
- Background poll now applies incoming changes to the reading canvas even when the
  update arrives as a delta, and re-renders are skipped when a poll carries no changes
  (avoids resetting scroll position and replaying page-entry animations for no reason).

### Added
- Periodic background sync (every 20s, paused while editing, saving, or a modal is open)
  so a collaborator's changes to a collection show up without a manual page reload.

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
