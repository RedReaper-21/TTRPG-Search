# README – TTRPG Vault Search 🔎

TTRPG Search is a search, reader, and spellbook plugin for Obsidian designed to be used with the TTRPG CLI tool.
It is designed to work with vaults using the output of the [TTRPG‑CLI tool](https://github.com/Obsidian-TTRPG-Community/ttrpg-convert-cli-ui/releases/) (or really any TTRPG‑focused collection of markdown files)

🚀 Fast indexed search – virtual scrolling, faceted filters (type, source, bookmark groups)

📖 Integrated Reader – table of contents, subheadings, in‑note search, internal link navigation

📚 Spellbook – dedicated modal with spell‑level, school, class, and concentration filters

🔖 Bookmark groups – organise favourites into named groups, drag‑and‑drop reorder

🏷 Source chips – click to filter, right‑click to edit label/colour

🧩 Inline search buttons – insert clickable buttons that open specific books, adventures, or chapters

Installation
Copy https://github.com/RedReaper-21/TTRPG-Search/
and go to the BRAT plugin (https://github.com/TfTHacker/obsidian42-brat)
Go to add plugin and use this link

# Quick Start
Index your notes – By default, all markdown files are indexed. To restrict indexing, go to plugin settings and list folders (one per line and all subfolders are read).

Open the search – Click the ribbon icon (magnifying glass) or run the command Open TTRPG Vault Search.

Search & filter – Type a query, then use the type / source dropdowns or click on chips / badges.

Open a result – Click any entry to open it in the built‑in Reader (modal or pop‑out – configurable).

Spellbook – Click the spellbook button in the search toolbar or use the command Open TTRPG Spellbook.

# Detailed Usage
## Search Modal
Query input – searches names, aliases, collection names, and (optionally) file paths.

Type filter – click the “All types” button to pick one or more types (multi‑select).

Source filter – click the “All sources” button to pick sources; right‑click any source chip to edit its label/colour.

Sort – relevance, name, source, or type.

Bookmarks toggle – show only bookmarked items; group tabs appear when bookmarks are active.

Preset dropdown – pre‑defined filter combinations (e.g. “Core 2014+”).

Star – click the star on any result to add/remove a bookmark.

<img width="1160" height="892" alt="image" src="https://github.com/user-attachments/assets/961d608a-96f5-4a15-9cd5-0073c84620dc" />


## Reader (Document Viewer)
Opens a single entry or a whole book/adventure.

Contents (left sidebar) – lists all sections (chapters) of the current collection. Click any to jump.

Subheadings (left sidebar) – headings from the currently open note.

Search within note – type in the “Find in note…” field; use ▲/▼ to navigate matches.

Bookmark – star icon next to “Bookmark” (current section) or “Bookmark Adventure” (whole collection).

Copy – wiki link or a ready‑to‑use TTRPG Search button block.

Open File – opens the original note in an Obsidian tab.

Internal links – clicking a link to another note opens it inside the reader (with back/forward history).

Pop Out / Pop In – if the reader is in a modal, you can move it to a pop‑out window; if already in a pop‑out, you can pop it back into the main window.

<img width="1374" height="881" alt="image" src="https://github.com/user-attachments/assets/426201af-e2a4-42fc-aac4-6dcc16eaf26e" />


## Spellbook Modal
Filters: level, school, class, source (multi‑select).

Toggles: Ritual, Concentration. (concentration does not work properly as the CLI output does not include a concentration tag but it's nice to have for anyone's custom spells)

Sort: level, name, school, source.

Favourites – star any spell to add it to an isolated spell‑only bookmark list.

Level badges are colour‑coded (Cantrip = purple, 1st = blue, 2nd = green, etc.).

## Bookmark Manager
Open via the Manage button in the search modal or the command palette.

Left sidebar: All bookmarks, Ungrouped, and any named groups.

Drag groups to reorder them.

Click a group to see its bookmarks.

Drag bookmarks inside a group to reorder them.

Use the “Add” button to create a new group.

Double‑click a group name to rename; click the × to delete (bookmarks become ungrouped).

<img width="1163" height="851" alt="image" src="https://github.com/user-attachments/assets/84b99088-e2a8-4b80-a67f-457eaa3f354f" />



## Open via button in normal obsidian:

\```ttrpg_search
Type: Book
Name: Player's Handbook (2024)
Chapter: Chapter 1
Colour: #7c3aed
\```

<img width="399" height="203" alt="image" src="https://github.com/user-attachments/assets/b6c20ef9-9b07-4960-86cf-9f4926466752" />

Can also be made via the CTRL+P and searching for "Insert TTRPG Search Button"
<img width="554" height="916" alt="image" src="https://github.com/user-attachments/assets/55e510e8-676d-47e1-bd23-bb5cdf6e7485" />

## Pop‑out Windows
The search modal has a ⤢ Pop‑out button – opens a detached window with tabbed search.

If “Open search in pop‑out by default” is enabled, the ribbon/command opens directly in a pop‑out.

In the reader, the ⤢ Pop Out button moves the reader to a new window (or opens a new tab in the pop‑out if already in one).

Pop‑out windows support multiple tabs (search and reader). Each tab can be closed individually.

## Configuration (Settings)
Setting	Description
Indexed folders	Limit indexing to specific folders (one per line or comma‑separated). Empty = all markdown files.

Maximum results	How many results to display (default 250). High values may impact performance.

Search titles only	When enabled, search does not scan file paths, aliases, or metadata.

Default sort mode	Relevance, name, source, or type.

Open search in pop‑out by default	If true, the search command/ribbon opens directly in a pop‑out window.

Open reader in pop‑out by default	If true, opening a result from the search uses a pop‑out reader instead of a modal.

Custom source aliases	Map abbreviations to canonical names, e.g. PHB = Player's Handbook. One per line.

Custom source chip labels/colours	Per‑source overrides for chip text and colour.

Custom filter presets	Define reusable filter combinations, e.g. My Books => PHB, XGE | Book.

Custom folder‑to‑type mappings	Map folder names to types, e.g. npcs, villains => NPC.

Save last search	Restores query, filters, and scroll position when re‑opening the search modal.

Spell tag prefix	Tag prefix used for hierarchical spell metadata (default ttrpg‑cli).

Tag‑based Spell Metadata (for TTRPG‑CLI users)

If your notes are generated by TTRPG‑CLI (or you manually add tags), the plugin reads spell properties from tags like these:

#ttrpg-cli/spell/level/3

#ttrpg-cli/spell/school/Evocation

#ttrpg-cli/spell/class/Wizard

#ttrpg-cli/spell/ritual

#ttrpg-cli/spell/concentration

Change the prefix in settings if your generator uses a different one (e.g. pf2e‑tools).

## Commands:

Open TTRPG Vault Search	- Opens the main search modal (or pop‑out per settings).

Open TTRPG Spellbook	- Opens the spell‑only modal.

Insert TTRPG Search button	- Shows a modal to insert a search button at the cursor.

Rebuild TTRPG Vault Search index - Forces a full rebuild of the search index.

Run TTRPG Vault Search diagnostics - Logs index statistics to the developer console. Send if facing issues.

Compact TTRPG Vault Search index	- Removes entries for missing files. (Rarely needed manually.)
