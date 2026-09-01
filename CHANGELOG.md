# Changelog

All notable changes to NextLibrary (Knowledge Cards) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/).

## [1.9.2] - 2026-09-01

### Fixed
- **Opening the app ran one database query per collection, plus one per member.** Building
  the collection list asked for each collection's pages separately, then each collection's
  members separately, and then resolved every member's and owner's display name one at a
  time — so an account with many collections paid for it on every single sync, twenty
  seconds apart. Pages and members now arrive in one query each, and each distinct account
  or group name is resolved once no matter how many collections it appears in. The trash
  bin listing takes the same path. Nothing about the response changed: the same fields,
  in the same order.

### Changed
- **The card template panel is now translated.** The templates added in 1.7.2 and 1.8.0
  were written directly in Turkish, so an English-language Nextcloud showed a Turkish
  panel: the category filters, and every template's name, description and badge. Those
  now follow the language Nextcloud is set to, with 26 new Turkish translations.
- The template *contents* — the ready-made card bodies themselves — are chosen by language
  rather than translated string by string, because rich HTML makes that fragile: the API
  template's body contains a JSON example, and the braces in it collide with the
  placeholder substitution the translation function performs. English and Turkish bodies
  are kept side by side instead. A consequence worth knowing: a language added later gets
  English card bodies, though the panel around them still translates. The class names are
  identical in both languages, so styling is unaffected.

## [1.9.1] - 2026-08-11

### Fixed
- **The profile and meeting templates carried a real person's details.** A name, an email
  address, a phone number and a city had been left in the sample content, so every
  installation showed them as the starting point of a profile card. They are now neutral
  placeholders — "İsim Soyisim", "ad.soyad@example.com", "+90 5XX XXX XX XX", "Şehir,
  Ülke" — and the meeting template lists "Katılımcı 1-3" instead of named attendees.

## [1.9.0] - 2026-08-11

### Fixed
- **A photo added to the profile template came out as a large square instead of a round
  avatar.** The placeholder carried the shape, and replacing it with the uploaded image
  threw that away, leaving a bare `<img>` that fell back to full width. The slot's shape
  now travels to the image, so a profile photo stays a circle, mockups keep their frame,
  and a banner stays full width.
- Uploaded images no longer carry an empty `alt`. The placeholder's own wording ("Profile
  photo", "UI Mockup 1", …) becomes the description, so a screen reader has something to
  read.

### Added
- **Choose which part of a photo is shown.** Picking a photo for a template slot now opens
  a positioning screen: drag the photo, zoom in, and the outlined area — a circle for a
  profile photo — is what ends up in the card. For slots that are not round, **Whole image**
  skips cropping entirely, so a tall photo is not forced into a wide frame.
- The crop is written into the pixels rather than into the markup, so it survives saving
  and the uploaded file is only as large as the slot needs (a profile photo is now 400×400
  instead of a downscaled full-size image).
- Images picked up a frame that suits their slot: a ring in the theme colour around a
  profile photo, a bordered card around design mockups, and nothing extra around a banner.

## [1.8.0] - 2026-08-11

### Added
- **Eight card templates instead of five, grouped into categories.** The right-hand panel
  now opens with a row of filter chips — code / API, executive, process, design, meeting,
  profile, product and academic — so the right skeleton is one click away instead of a
  scroll. The new templates bring their own building blocks: endpoint headers, parameter
  tables, code blocks, KPI cards, numbered process steps, colour palettes, meeting headers,
  skill tags and reference lists.
- **Preview before you commit.** Clicking a template's header slides open a small preview
  inside the card, and **Live preview** opens the full template in a large modal with a
  **Use this template** button. Nothing is created until you ask for it.
- Code blocks carry a working **Copy** control that puts the snippet on the clipboard.

### Fixed
- Template markup no longer relies on inline `style` attributes or `<button>` elements.
  Both are removed by the server's HTML sanitiser, so a card looked correct while being
  written and then lost its colour palette and copy control the moment it was saved. The
  same styling now comes from classes, and all eight templates were verified to pass
  through the sanitiser without losing a single tag or class.
- Image placeholders inside a template preview no longer open the file picker. The preview
  is not a page, so there was nothing to upload to.

## [1.7.2] - 2026-08-11

### Added
- **Card templates in the right-hand panel.** Starting a card no longer means facing an
  empty page: the right panel now has two tabs, and the first one offers five ready-made
  skeletons — note & summary, idea & concept, definition / term, person & profile, and
  project & task. Picking one creates the card already filled with headings, callouts, a
  list and an image placeholder, ready to be overwritten.
- Cards created from a template follow the same rule as every other card: they land inside
  the section you are currently in, not at the top of the collection.
- The image placeholder inside a template opens the file picker when clicked, and the
  uploaded image replaces the placeholder itself instead of landing wherever the cursor
  happened to be.

### Fixed
- The template panel and the image placeholder are hidden from accounts without writing
  rights. Both used to be offered to every reader, and clicking them could only produce a
  "not allowed" message.
- Choosing a template with no collection open used to create the card in whichever
  collection happened to be first. It now asks for a collection to be opened instead.
- Callout boxes coming from a template (`kx-callout`) had no styling at all and were
  rendered as plain paragraphs; the info, warning and success variants now look like
  callouts in both light and dark mode.

## [1.7.1] - 2026-08-04

### Fixed
- **The Knowledge Cards icon was invisible in the administration sidebar.** The settings
  page added in 1.7.0 reused the app menu's icon, which is drawn in white so it reads
  against the dark top bar. The settings sidebar has a light background, so the icon
  disappeared and stood out among the black icons of every other app. It now uses a black
  variant, which Nextcloud inverts by itself in dark mode.

## [1.7.0] - 2026-08-04

### Added
- **Administrators can now hand out editing rights.** Until now writing was hard-wired to
  Nextcloud administrators: there was no way to let a colleague add a page without making
  them an administrator of the whole server. A new page under **Administration → Knowledge
  Cards** lets an administrator pick accounts and groups as *editors*. An editor has the
  same rights inside the app as an administrator — creating, editing and deleting
  collections and pages, uploading media, managing members and the trash bin — and no extra
  rights at all outside it.
- Editors are chosen once for the whole app, not per collection. Group membership counts, so
  adding a group is enough; people who join that group later become editors automatically.

### Changed
- **Only real Nextcloud administrators can change the editor list.** Editors match
  administrators everywhere else in the app, but deliberately cannot appoint or remove
  editors — otherwise an editor could make themselves permanent and take the decision away
  from the administrator.
- Wording that promised administrator-only writing was corrected: the visibility hints in
  the member dialog, the message shown when a write is refused, and the App Store
  description.
- Accounts and groups that no longer exist are dropped when the editor list is saved, so a
  mistyped name cannot sit in the list looking as though it grants something.

### Note on upgrading
Nothing changes for existing instances until an administrator appoints someone: with an
empty editor list the app behaves exactly as it did in 1.6.0.

## [1.6.0] - 2026-08-03

### Added
- **Uploaded pictures and videos are now cleaned up.** A file could only ever be added,
  never removed: an icon picked while creating a collection that was then abandoned, an
  image deleted from a page, or a page deleted for good all left the file behind forever.
  A daily background job now deletes files nothing points at any more. It errs on the side
  of keeping: a file is removed only when no collection and no page anywhere refers to it —
  including collections and pages sitting in the trash bin, which can still be restored —
  and only once it is more than a day old, so a picture uploaded a moment ago is never
  caught mid-edit.
- A test suite (`tests/run.php`) that runs on plain PHP — no Composer, no PHPUnit. It checks
  the HTML sanitiser and, more importantly, that the server's whitelist of allowed tags and
  attributes still matches the browser's. If those two drift apart, something the browser
  strips could pass on the server.

### Changed
- **The editor/reader switch on member chips is gone, and the wording around it was wrong.**
  Writing has been administrator-only since 1.0.7, so the switch changed nothing — it
  promised a distinction the app does not make. Members decide who can *see* a private
  collection; the hint text now says exactly that. Existing member records keep whatever
  role they were given.
- The app description in the App Store listing said owners and editors can write. They
  cannot; only Nextcloud administrators can.

### Fixed
- Opening the trash bin ran one database query per collection. It now takes a single query,
  which shows on instances with many collections.
- Signed in but unidentified, the app used to fall back to a hardcoded identity, quietly
  attributing reading progress to the wrong account. It now waits for the identity the
  server sends instead.

## [1.5.0] - 2026-07-31

### Added
- **Link a file straight from Nextcloud.** A paperclip next to the image and video buttons
  opens Nextcloud's own file picker; the file you choose is inserted as a link. Nothing is
  copied — the page points at the file where it lives, so it stays current when the file
  changes, and a reader without access to it simply cannot open it. The link uses the
  file's instance-wide id (`/f/<id>`), so it also resolves for colleagues whose own path
  to a shared file is different.

## [1.4.3] - 2026-07-31

### Fixed
- **Sections were counted as cards waiting to be read.** A section holds no text and
  cannot be marked as read, so counting it made progress impossible to finish — a
  collection with one page and one section sat at "2 pages · 1/2 read (50%)" forever.
  Reading progress — the collection cover, the sidebar badge and bar, the home cards and
  the section header — now counts pages only.

## [1.4.2] - 2026-07-31

### Fixed
- **An icon chosen while creating a collection came out as an empty frame.** The picture
  is uploaded before the collection exists, so it lands in the shared icon folder, but it
  was then requested under the new collection's own folder and answered with a 404 — the
  file was always there, just looked for in the wrong place. Serving now falls back to the
  shared folder, which also repairs icons uploaded before this release.

## [1.4.1] - 2026-07-31

### Fixed
- A white or light logo uploaded with a transparent background looked like an empty frame,
  because it sat on a light surface. Icons now carry a hairline shadow — invisible on dark
  logos, an outline on pale ones. (The upload itself was always fine: a 4000×4000 square
  PNG scales down and stores correctly.)
- Downscaling only limited the width, so a narrow, very tall picture was uploaded almost
  full size. Height is now limited too.

- Delete buttons looked washed out on some themes. They took their colour from
  Nextcloud's `--color-error`, which a theme may define as a pale warning tint; they now
  use a fixed red, so a permanent action always looks like one.

### Changed
- The ＋ button in the tree asks what to add — a page or a section — instead of silently
  creating an empty page. Nothing is created until you pick. The same two choices already
  existed in card menus; now every entry point offers both.
- **Reading stays inside the folder you are in.** "Next"/"Previous" walk the current
  folder's cards only — they used to run through the whole instance in one flat order and
  could jump into a different folder, or another collection entirely — and the cards under
  a page are its folder's cards, not loosely related pages from everywhere. Word-scored
  "related pages" is gone with them.
- The trash bin's buttons read "Delete" and "Delete selected" instead of the longer
  "Delete for good"; the permanence is in the tooltip and the confirmation.

## [1.4.0] - 2026-07-31

### Added
- **The trash bin can be emptied in one go.** Every row has a checkbox, the bar on top
  selects everything at once and says how many items are picked, and one button deletes
  the whole selection for good. Deleting twenty leftovers no longer means twenty clicks
  and twenty confirmations — a single confirmation names the count, because the action
  cannot be undone.

### Changed
- Delete actions are no longer whispered in grey. "Delete for good" is a solid red button
  and the delete entry in card menus is red and bold, so a permanent action looks like one.
  Selected trash rows are outlined in red as well.
- The icon picker's buttons were oversized wordy text; they are now small labelled chips
  with line icons ("Image", and "Emoji" only when a picture is set), sitting quietly above
  the emoji grid instead of dominating it.

## [1.3.0] - 2026-07-31

### Added
- **Your own image instead of an emoji.** The icon picker now offers "Upload an image":
  pick a picture or a logo and it becomes the icon of a collection, a page or a section —
  in the tree, on covers, in card grids, in breadcrumbs and in search results. Pictures
  are scaled down to 128 px before upload, and "Use an emoji again" restores the emoji,
  which was never lost. Icons chosen while creating a collection work too, before the
  collection exists.
- **The right-hand panel is now the folder you are in.** It lists the cards of the current
  folder — nothing else — so it answers "where am I and what is next to me" instead of
  showing loosely related pages from the whole collection. Above the list is a single-line
  path (collection › section › section …); clicking any step takes you back up to it.

### Changed
- The reading tree only builds the branches that are open. A collection of 780 cards used
  to put all 784 rows in the page and rebuild them on every click; now only the visible
  rows exist. Together with a one-pass child index and one-pass subtree counts, opening a
  collection, expanding branches and opening a page each got about three times faster.
- Section cards no longer carry a redundant "Section" caption — the folder icon and the
  card count already say it.

### Database
- `nextlibrary_collections` and `nextlibrary_pages` gain an `icon` column (empty by
  default, so every existing collection and card keeps its emoji).

## [1.2.0] - 2026-07-31

### Added
- **Pages and sections.** Every card is now one of two kinds, and you pick which when you
  create it:
  - **📄 Page** — a card you write in. Unchanged from before.
  - **📁 Section** — a card that only groups other cards. Opening it goes straight to its
    grid of cards: no editor, no reading time, no read mark, because it has no text of
    its own.
- The new-collection dialog has a Page/Section toggle on every row, so the shape of a
  collection — sections holding pages, at any depth — is set up before it is created.
- A card's menu offers "Add a page inside", "Add a section inside", and switching an
  existing card between the two. Switching a page to a section **keeps its text**: it is
  hidden while the card is a section and comes back untouched if you switch back.
- Sections are labelled as such on collection covers and card grids, and are left out of
  the "related pages" suggestions since they have nothing to read.

### Database
- `nextlibrary_pages` gains a `kind` column (`page` | `folder`, default `page`). Existing
  cards are all pages, so nothing changes visually after the update.

## [1.1.0] - 2026-07-31

### Added
- **Cards inside cards, as deep as you like.** A card is no longer only a page: it can
  hold other cards, which can hold their own, without a depth limit. Opening a card shows
  its own grid of cards, the same way opening a collection does — the "go into a folder"
  feeling now works at every level.
  - The sidebar tree expands and collapses per card; the path to the card you are reading
    stays open, and search reveals the ancestors of every match instead of showing
    orphaned children.
  - Breadcrumbs show the full path (collection › card › card › …), and every step is
    clickable.
  - A card's context menu and its page footer both offer "Add a card inside".
  - The new-collection dialog builds the whole tree up front: every row has a ＋ that adds
    an indented row beneath it.
- Collection cards show how many cards live inside them.

### Changed
- Deleting a card takes everything inside it to the trash bin, and restoring brings the
  whole branch back. The confirmation says how many cards will go. If a card is restored
  while its parent is still in the trash, it returns to the top level of its collection
  rather than becoming unreachable.
- The editor ↔ visitor preview button is hidden for accounts that cannot write; it only
  ever made sense for editors, and a read-only account is already in visitor mode.

### Database
- `nextlibrary_pages` gains a `parent_id` column (0 = top level of the collection).
  Existing pages keep `parent_id = 0`, so nothing moves and every collection looks exactly
  as it did before the update.

## [1.0.8] - 2026-07-31

### Fixed
- **Adding a page appeared to do nothing.** The page was created on the server, but the
  reading canvas (`#viewer`) had gone missing from the page, so drawing the new page threw
  and nothing appeared — and because the error landed in the request's `catch`, it was
  reported as "could not save to the server" even though the save had succeeded. The
  canvas is now recreated if it is missing, and drawing errors are no longer reported as
  save failures: a failed save and a failed redraw are told apart.

### Changed (internal)
- Dropped the redundant `'self'` entries added to the page's Content Security Policy.
  Nextcloud's `ContentSecurityPolicy` already ships `'self'` for scripts, styles and
  connections (and `'self' data:` for fonts), so the extra calls changed nothing. The
  strict `default-src 'none'` seen in the browser console comes from Nextcloud's own
  error pages (a 401 response carries it), which an app's policy cannot influence.

## [1.0.7] - 2026-07-30

### Fixed
- **Non-administrators were told "could not save — check your connection" when the real
  answer was "you are not allowed to do that".** Writing is administrator-only, but the
  "New collection" button was shown to everyone and every failure was reported as a
  network problem, so a permission rule looked like a broken server. Failures now carry
  their real cause: 403, 401 and 429 each get their own message.
- Planting the sample collection on an empty instance produced a repeating 403 in the
  console for non-administrators (`POST /api/import` is administrator-only). It is now
  skipped silently — it was never an error, just an optional convenience.
- The reading canvas no longer throws when its container is missing from the page.

### Changed (internal)
- Controller permissions moved from docblock annotations (`@NoAdminRequired`,
  `@NoCSRFRequired`, `@UserRateThrottle`) to the PHP attributes `#[NoAdminRequired]`,
  `#[NoCSRFRequired]` and `#[UserRateLimit]`. Nextcloud still honours the annotations
  (`SecurityMiddleware::hasAnnotationOrAttribute` falls back to them and logs a
  deprecation notice), but they are deprecated and the attributes are the supported form
  on every version this app targets (Nextcloud 28–34). This is future-proofing, not a
  bug fix.

### Changed (user visible)
- Opening a collection no longer hides the other collections from the sidebar. Creating a
  collection opens its first page, which used to leave that one collection alone in the
  tree — it looked as if the existing collections had been deleted. All collections now
  stay listed; only the current one is expanded.
- The "New collection" and "Trash bin" buttons are hidden for accounts that cannot write
  (writing stays administrator-only). They used to be shown to everyone and produced a
  403 on click.
- Planting the sample collection on an empty instance is skipped silently for
  non-administrators instead of raising an error toast.

## [1.0.6] - 2026-07-20

### Changed
- Raised the supported PHP version to 8.4 (was capped at 8.3), so the app installs on
  Nextcloud 34 servers running PHP 8.4. Without this, `occ app:install` reported the app
  as not found because no published release matched the server's PHP version.

## [1.0.5] - 2026-07-20

### Changed
- Raised the supported Nextcloud version to 34 (was capped at 31), so the app can be
  installed on current Nextcloud releases.

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
