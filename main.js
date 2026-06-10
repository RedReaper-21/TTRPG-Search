const {
    Component,
    ItemView,
    MarkdownRenderer,
    Modal,
    Notice,
    EditorSuggest,
    Plugin,
    PluginSettingTab,
    Setting,
    TFile,
    debounce,
    normalizePath,
} = require("obsidian");

const DEFAULT_SETTINGS = {
    indexedFolders: "",
    maxResults: 250,
    openInNewLeaf: false,
    openSearchInPopoutByDefault: true,
    openReaderInPopoutByDefault: false,
    sortMode: "relevance",
    searchTitleOnly: true,
    bookmarks: [],
    bookmarkGroups: [],    // [{id: string, name: string}]
    bookmarkTags: {},      // {path: groupId | null}
    bookmarkGroupOrder: {},// {[groupId]: string[]} – custom path order per named group
    sourceAliasesText: "",
    sourceOverridesText: "",
    sourceChipData: {},
    sourceFilterPresets: [],
    typeFolderMappingsText: "",
    saveLastSearch: false,
    lastSearchState: null,
    spellbookBookmarks: [], // isolated bookmark list for the Spellbook modal
    spellTagPrefix: "ttrpg-cli", // prefix for tag-based spell metadata: e.g. ttrpg-cli/spell/school/Evocation
    settingsBackupEnabled: true,
    settingsBackupIntervalHours: 24,
    settingsBackupFolder: "TTRPG Search Backups",
    settingsBackupMaxFiles: 30,
    settingsBackupLastRun: 0,
};

const COLLATOR = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
});

const RESULT_ROW_HEIGHT = 124;
const RESULT_OVERSCAN = 8;

const SMALL_WORDS = new Set([
    "a",
    "an",
    "and",
    "as",
    "at",
    "but",
    "by",
    "for",
    "from",
    "in",
    "nor",
    "of",
    "on",
    "or",
    "per",
    "the",
    "to",
    "via",
    "with",
]);

const OVERVIEW_BASENAMES = new Set([
    "index",
    "readme",
    "overview",
    "contents",
    "toc",
    "home",
    "cover",
    "introduction",
    "intro",
    "preface",
    "prologue",
]);

const KNOWN_TYPE_ALIASES = {
    action: "Action",
    actions: "Action",
    adventure: "Adventure",
    adventures: "Adventure",
    background: "Background",
    backgrounds: "Background",
    bestiary: "Monster",
    bestiaries: "Monster",
    book: "Book",
    books: "Book",
    class: "Class",
    classes: "Class",
    condition: "Condition",
    conditions: "Condition",
    creature: "Monster",
    creatures: "Monster",
    deity: "Deity",
    deities: "Deity",
    feat: "Feat",
    feats: "Feat",
    item: "Item",
    items: "Item",
    monster: "Monster",
    monsters: "Monster",
    npc: "NPC",
    npcs: "NPC",
    object: "Object",
    objects: "Object",
    optionalfeature: "Optional Feature",
    optionalfeatures: "Optional Feature",
    race: "Race",
    races: "Race",
    species: "Species",
    spell: "Spell",
    spells: "Spell",
    subclass: "Subclass",
    subclasses: "Subclass",
    table: "Table",
    tables: "Table",
    tool: "Tool",
    tools: "Tool",
    trap: "Trap",
    traps: "Trap",
    vehicle: "Vehicle",
    vehicles: "Vehicle",
};

const GENERIC_PATH_SEGMENTS = new Set([
    "3mechanics",
    "5e",
    "5etools",
    "adventure",
    "adventures",
    "background",
    "backgrounds",
    "book",
    "books",
    "class",
    "classes",
    "cli",
    "collection",
    "collections",
    "compendium",
    "compendia",
    "content",
    "contents",
    "creature",
    "creatures",
    "data",
    "docs",
    "export",
    "exports",
    "feat",
    "feats",
    "file",
    "files",
    "homebrew",
    "item",
    "items",
    "mechanics",
    "monster",
    "monsters",
    "npc",
    "npcs",
    "object",
    "objects",
    "official",
    "optionalfeature",
    "optionalfeatures",
    "output",
    "outputs",
    "race",
    "races",
    "reference",
    "references",
    "rule",
    "rules",
    "species",
    "spell",
    "spells",
    "subclass",
    "subclasses",
    "table",
    "tables",
    "tool",
    "tools",
    "trap",
    "traps",
    "ttrpg",
    "vault",
    "vehicle",
    "vehicles",
    "chapter",
    "chapters",
    "section",
    "sections",
    // D&D 5e creature types — never valid source labels
    "aberration",
    "aberrations",
    "beast",
    "beasts",
    "celestial",
    "celestials",
    "construct",
    "constructs",
    "dragon",
    "dragons",
    "elemental",
    "elementals",
    "fey",
    "fiend",
    "fiends",
    "giant",
    "giants",
    "humanoid",
    "humanoids",
    "monstrosity",
    "monstrosities",
    "ooze",
    "oozes",
    "plant",
    "plants",
    "undead",
    "demon",
    "demons",
    "devil",
    "devils",
    "swarm",
    "swarms",
    "shapechanger",
    "shapechangers",
    "lycanthrope",
    "lycanthropes",
]);

let ACTIVE_SOURCE_LABELS = new Map();
let ACTIVE_FOLDER_TYPE_MAP = new Map();
let ACTIVE_SOURCE_OVERRIDE_RULES = [];
let ACTIVE_BASENAME_SOURCE_KEYS = new Set();

function normalizeConfiguredFolder(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    return normalizePath(trimmed).replace(/^\/+|\/+$/g, "");
}

function splitConfiguredFolders(value) {
    return String(value || "")
        .split(/\n|,/)
        .map((part) => normalizeConfiguredFolder(part))
        .filter(Boolean);
}

function isHiddenPath(path) {
    return normalizePath(path)
        .split("/")
        .some((segment) => segment.startsWith("."));
}

function isWithinConfiguredFolders(path, folders) {
    if (!folders.length) return true;
    const normalized = normalizePath(path);
    return folders.some((folder) => normalized === folder || normalized.startsWith(`${folder}/`));
}

function humanizeRawText(text) {
    return String(text || "")
        .replace(/\.md$/i, "")
        .replace(/[-_.]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeKey(text) {
    return humanizeRawText(text).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeToken(text) {
    return normalizeKey(text);
}

function looksNumericish(value) {
    return /^0*\d+[a-z]?$/i.test(String(value || "").trim());
}

function parseSpellLevel(value) {
    if (value == null) return null;
    const str = String(value).trim().toLowerCase();
    if (str === "cantrip" || str === "0" || str === "0th") return 0;
    const num = parseInt(str, 10);
    if (!isNaN(num) && num >= 0 && num <= 9) return num;
    return null;
}

function formatSpellLevel(level) {
    if (level === 0) return "Cantrip";
    const suffixes = ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"];
    return `${level}${suffixes[level]} Level`;
}

function isOverviewBasename(value) {
    return OVERVIEW_BASENAMES.has(String(value || "").trim().toLowerCase());
}

const _escapeHtmlMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const _escapeHtmlRe  = /[&<>"']/g;
function escapeHtml(text) {
    return String(text || "").replace(_escapeHtmlRe, (c) => _escapeHtmlMap[c]);
}

function escapeRegExp(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let _hlQuery = null, _hlPattern = null;
function highlightMatch(text, query) {
    const raw = String(text || "");
    const trimmed = String(query || "").trim();
    if (!trimmed) return escapeHtml(raw);

    if (trimmed !== _hlQuery) {
        _hlQuery = trimmed;
        const terms = Array.from(
            new Set(
                trimmed
                    .split(/\s+/)
                    .map((t) => t.trim())
                    .filter((t) => t.length >= 2)
            )
        );
        _hlPattern = terms.length
            ? new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "ig")
            : null;
    }

    const escaped = escapeHtml(raw);
    if (!_hlPattern) return escaped;
    // RegExp.lastIndex must be reset for reuse with /g
    _hlPattern.lastIndex = 0;
    return escaped.replace(_hlPattern, "<mark>$1</mark>");
}

function formatTitle(text) {
    const humanized = humanizeRawText(text);
    if (!humanized) return "";

    return humanized
        .split(" ")
        .map((word, index) => {
            const lower = word.toLowerCase();

            if (/^[ivxlcdm]+$/i.test(word)) return word.toUpperCase();

            const mapped = ACTIVE_SOURCE_LABELS.get(normalizeKey(word));
            if (mapped && mapped.toUpperCase() === mapped) {
                return mapped;
            }

            if (index > 0 && SMALL_WORDS.has(lower)) return lower;
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(" ");
}

function indexFrontmatter(frontmatter) {
    if (!frontmatter) return null;
    const indexed = {};
    for (const [key, value] of Object.entries(frontmatter)) {
        indexed[key.toLowerCase()] = value;
    }
    return indexed;
}

function getFrontmatterValue(frontmatter, ...keys) {
    if (!frontmatter) return undefined;
    for (const key of keys) {
        if (frontmatter[key.toLowerCase()] !== undefined) {
            return frontmatter[key.toLowerCase()];
        }
    }
    return undefined;
}

function readString(value) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = readString(item);
            if (found) return found;
        }
        return null;
    }

    if (value && typeof value === "object") {
        const obj = value;
        for (const key of ["name", "title", "abbr", "abbreviation", "source", "value"]) {
            const found = readString(obj[key]);
            if (found) return found;
        }
    }

    return null;
}

function readStringArray(value) {
    if (value == null) return [];

    if (typeof value === "string") {
        return value
            .split(/[,;]/)
            .map((part) => part.trim())
            .filter(Boolean);
    }

    if (Array.isArray(value)) {
        return value.flatMap((item) => readStringArray(item));
    }

    if (typeof value === "object") {
        const single = readString(value);
        return single ? [single] : [];
    }

    return [];
}

function uniqueStrings(values) {
    const seen = new Set();
    const out = [];

    for (const value of values) {
        const trimmed = String(value || "").trim();
        if (!trimmed) continue;

        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;

        seen.add(key);
        out.push(trimmed);
    }

    return out;
}

function extractAliases(frontmatter) {
    return uniqueStrings([
        ...readStringArray(getFrontmatterValue(frontmatter, "aliases")),
        ...readStringArray(getFrontmatterValue(frontmatter, "alias")),
    ]);
}

function segmentToTypeLabel(segment) {
    const normalized = normalizeToken(segment);

    if (ACTIVE_FOLDER_TYPE_MAP.has(normalized)) {
        return ACTIVE_FOLDER_TYPE_MAP.get(normalized);
    }

    if (KNOWN_TYPE_ALIASES[normalized]) return KNOWN_TYPE_ALIASES[normalized];
    if (normalized.endsWith("s") && KNOWN_TYPE_ALIASES[normalized.slice(0, -1)]) {
        return KNOWN_TYPE_ALIASES[normalized.slice(0, -1)];
    }

    return "";
}

function normalizeTypeLabel(value) {
    const normalized = normalizeToken(value);

    if (ACTIVE_FOLDER_TYPE_MAP.has(normalized)) {
        return ACTIVE_FOLDER_TYPE_MAP.get(normalized);
    }

    if (KNOWN_TYPE_ALIASES[normalized]) return KNOWN_TYPE_ALIASES[normalized];
    if (normalized.endsWith("s") && KNOWN_TYPE_ALIASES[normalized.slice(0, -1)]) {
        return KNOWN_TYPE_ALIASES[normalized.slice(0, -1)];
    }

    return formatTitle(value);
}

function extractType(frontmatter, path) {
    const explicit =
        readString(
            getFrontmatterValue(
                frontmatter,
                "type",
                "kind",
                "category",
                "entitytype",
                "entity-type",
                "compendiumtype",
                "compendium-type"
            )
        ) ?? "";

    if (explicit) return normalizeTypeLabel(explicit);

    const tags = [
        ...readStringArray(getFrontmatterValue(frontmatter, "tags")),
        ...readStringArray(getFrontmatterValue(frontmatter, "tag")),
    ];

    for (const tag of tags) {
        const normalized = normalizeToken(String(tag || "").replace(/^#/, ""));
        if (ACTIVE_FOLDER_TYPE_MAP.has(normalized)) return ACTIVE_FOLDER_TYPE_MAP.get(normalized);
        if (KNOWN_TYPE_ALIASES[normalized]) return KNOWN_TYPE_ALIASES[normalized];
    }

    for (const segment of normalizePath(path).split("/")) {
        const inferred = segmentToTypeLabel(segment);
        if (inferred) return inferred;
    }

    return "";
}

function extractExplicitSource(frontmatter) {
    const sourceValue = getFrontmatterValue(
        frontmatter,
        "source",
        "sources",
        "src",
        "book",
        "publication",
        "from"
    );

    if (Array.isArray(sourceValue)) {
        for (const item of sourceValue) {
            if (typeof item === "string" && item.trim()) {
                return item.trim();
            }

            if (item && typeof item === "object") {
                const obj = item;
                const found =
                    readString(obj.source) ??
                    readString(obj.name) ??
                    readString(obj.title) ??
                    readString(obj.abbr) ??
                    readString(obj.abbreviation);

                if (found) return found;
            }
        }
    }

    return readString(sourceValue) ?? "";
}

function extractDisplayName(frontmatter) {
    const raw =
        readString(getFrontmatterValue(frontmatter, "title")) ??
        readString(getFrontmatterValue(frontmatter, "name")) ??
        readString(getFrontmatterValue(frontmatter, "displayname")) ??
        readString(getFrontmatterValue(frontmatter, "display-name")) ??
        "";

    return raw ? formatTitle(raw) : "";
}

function buildConfiguredFolderKeySet(folders) {
    const out = new Set();

    for (const folder of folders) {
        for (const segment of normalizePath(folder).split("/")) {
            const normalized = normalizeToken(segment);
            if (normalized) out.add(normalized);
        }
    }

    return out;
}


function looksLikeBasenameSourceSuffix(value) {
    const key = normalizeKey(value);
    if (!key || key.length < 2 || key.length > 16) return false;
    if (looksNumericish(key) || GENERIC_PATH_SEGMENTS.has(key) || segmentToTypeLabel(key)) return false;
    return /\d/.test(key) || !/[aeiou]/i.test(key) || ACTIVE_SOURCE_LABELS.has(key);
}
function buildBasenameSourceKeySet(files) {
    const counts = new Map();
    for (const file of files) {
        const parts = String(file.basename || "").split(/[-_.]+/).filter(Boolean);
        if (parts.length < 2) continue;
        const key = normalizeKey(parts[parts.length - 1]);
        if (!looksLikeBasenameSourceSuffix(key)) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    const out = new Set();
    for (const [key, count] of counts.entries()) if (count >= 2 || /\d/.test(key) || !/[aeiou]/i.test(key) || ACTIVE_SOURCE_LABELS.has(key)) out.add(key);
    return out;
}
function extractSourceFromTags(fileCache, frontmatter, prefix) {
    const base = String(prefix || "ttrpg-cli").replace(/\/+$/, "").toLowerCase() + "/compendium/src/5e/";
    const cacheTags = fileCache?.tags ? fileCache.tags.map((tc) => String(tc.tag || "").replace(/^#/, "")) : [];
    const fmTags = readStringArray(getFrontmatterValue(frontmatter, "tags", "tag")).map((t) => String(t).replace(/^#/, ""));
    for (const tag of [...cacheTags, ...fmTags]) {
        const clean = String(tag || "");
        if (clean.toLowerCase().startsWith(base)) {
            const val = clean.slice(base.length).trim();
            if (val) return val;
        }
    }
    return "";
}
function tagContains(fileCache, frontmatter, needle) {
    const lowerNeedle = String(needle || "").toLowerCase();
    const cacheTags = fileCache?.tags ? fileCache.tags.map((tc) => String(tc.tag || "").replace(/^#/, "")) : [];
    const fmTags = readStringArray(getFrontmatterValue(frontmatter, "tags", "tag")).map((t) => String(t).replace(/^#/, ""));
    return [...cacheTags, ...fmTags].some((tag) => String(tag || "").toLowerCase().split(/[\/\s_-]+/).includes(lowerNeedle));
}
function valueContainsText(value, needle) {
    return JSON.stringify(value || "").toLowerCase().includes(String(needle || "").toLowerCase());
}
function tokenizeSearchQuery(query) { return String(query || "").toLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean); }
const _wbReCache = new Map();
function wordBoundaryIndex(haystack, needle) {
    if (!needle) return -1;
    let re = _wbReCache.get(needle);
    if (!re) {
        re = new RegExp(`(^|[^a-z0-9])(${escapeRegExp(needle)})`, "i");
        _wbReCache.set(needle, re);
        // Evict oldest entry to keep cache bounded
        if (_wbReCache.size > 512) _wbReCache.delete(_wbReCache.keys().next().value);
    }
    const match = String(haystack || "").match(re);
    if (!match || typeof match.index !== "number") return -1;
    return match.index + (match[1] ? match[1].length : 0);
}
function scoreTextField(value, query, weight) { const text = String(value || "").toLowerCase(); if (!text || !query) return Number.NEGATIVE_INFINITY; if (text === query) return weight + 320; if (text.startsWith(query)) return weight + 250 - Math.min(45, (text.length - query.length) * 0.12); const boundary = wordBoundaryIndex(text, query); if (boundary >= 0) return weight + 195 - boundary * 0.25; const contains = text.indexOf(query); if (contains >= 0) return weight + 130 - contains * 0.15; const fuzzy = fuzzyPenalty(text, query); if (Number.isFinite(fuzzy) && query.length >= 3) return weight + 40 - fuzzy * 0.7; return Number.NEGATIVE_INFINITY; }
function scoreTokenCoverage(fields, tokens) { if (!tokens.length) return 0; let score = 0; for (const token of tokens) { let best = Number.NEGATIVE_INFINITY; for (const field of fields) best = Math.max(best, scoreTextField(field.value, token, field.weight)); if (best === Number.NEGATIVE_INFINITY) return Number.NEGATIVE_INFINITY; score += best; } return score / tokens.length + 130; }

function isIgnorableSourceToken(value, configuredFolderKeys) {
    const normalized = normalizeToken(value);

    if (!normalized) return true;
    if (configuredFolderKeys.has(normalized)) return true;
    if (GENERIC_PATH_SEGMENTS.has(normalized)) return true;
    if (segmentToTypeLabel(value)) return true;
    if (looksNumericish(value)) return true;

    return false;
}

function resolveSourceLabel(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    if (looksNumericish(trimmed)) return "";

    const mapped = ACTIVE_SOURCE_LABELS.get(normalizeKey(trimmed));
    if (mapped) return mapped;

    if (/^[a-z0-9]{2,12}$/i.test(trimmed)) {
        const upperMapped = ACTIVE_SOURCE_LABELS.get(normalizeKey(trimmed.toUpperCase()));
        if (upperMapped) return upperMapped;
    }

    return formatTitle(trimmed);
}

function inferCollectionInfo(path) {
    const segments = normalizePath(path).split("/").filter(Boolean);

    for (let i = 0; i < segments.length - 1; i++) {
        const typeLabel = segmentToTypeLabel(segments[i]);

        if ((typeLabel === "Book" || typeLabel === "Adventure") && segments[i + 1]) {
            const rawName = segments[i + 1];
            const name = resolveSourceLabel(rawName) || formatTitle(rawName);

            return {
                name,
                path: segments.slice(0, i + 2).join("/"),
                kind: typeLabel.toLowerCase(),
            };
        }
    }

    return null;
}

function inferSourceFromPath(path, typeLabel, configuredFolderKeys, collectionInfo) {
    if (collectionInfo) return collectionInfo.name;

    const segments = normalizePath(path).split("/").filter(Boolean);
    const parents = segments.slice(0, -1);

    if (!parents.length) return "";

    const candidates = [];

    for (let i = 0; i < parents.length; i++) {
        const segType = segmentToTypeLabel(parents[i]);

        if (segType && (!typeLabel || normalizeKey(segType) === normalizeKey(typeLabel))) {
            if (parents[i + 1]) candidates.push(parents[i + 1]);
            if (parents[i - 1]) candidates.push(parents[i - 1]);
            if (parents[i + 2]) candidates.push(parents[i + 2]);
            if (parents[i - 2]) candidates.push(parents[i - 2]);
        }
    }

    for (let i = parents.length - 1; i >= 0; i--) {
        candidates.push(parents[i]);
    }

    for (const candidate of candidates) {
        if (!isIgnorableSourceToken(candidate, configuredFolderKeys)) {
            return candidate;
        }
    }

    return "";
}

function inferSourceFromBasename(baseName) {
    const parts = String(baseName || "").replace(/\.md$/i, "").split(/[-_.]+/).filter(Boolean);
    if (parts.length < 2) return "";
    const last = parts[parts.length - 1];
    if (looksNumericish(last)) return "";
    const key = normalizeKey(last);
    if (ACTIVE_SOURCE_LABELS.has(key) || ACTIVE_BASENAME_SOURCE_KEYS.has(key)) return last;
    return "";
}

function isTypeTokenForLabel(token, typeLabel) {
    const tokenType = segmentToTypeLabel(token);
    return !!tokenType && normalizeKey(tokenType) === normalizeKey(typeLabel);
}

function stripCollectionPrefix(title, collectionName) {
    const cleanTitle = String(title || "").trim();
    const cleanCollection = String(collectionName || "").trim();

    if (!cleanTitle || !cleanCollection) return cleanTitle;

    const lowerTitle = cleanTitle.toLowerCase();
    const lowerCollection = cleanCollection.toLowerCase();

    const separators = [" - ", " — ", ": "];
    for (const separator of separators) {
        const prefix = `${lowerCollection}${separator}`;
        if (lowerTitle.startsWith(prefix)) {
            return cleanTitle.slice(prefix.length).trim();
        }
    }

    return cleanTitle;
}

function normalizeParsedName(raw) {
    const clean = String(raw || "").trim();
    if (!clean) return "";

    if (isOverviewBasename(clean)) return "Overview";
    return formatTitle(clean);
}

function parseBasenameDetails(baseName, typeLabel, sourceHint) {
    const cleanBaseName = String(baseName || "").replace(/\.md$/i, "");
    const originalParts = cleanBaseName.split(/[-_.]+/).filter(Boolean);

    if (!originalParts.length) {
        return {
            name: formatTitle(cleanBaseName),
            source: sourceHint,
            isOverview: false,
        };
    }

    if (isOverviewBasename(cleanBaseName)) {
        return {
            name: "Overview",
            source: sourceHint,
            isOverview: true,
        };
    }

    const parts = [...originalParts];
    let source = String(sourceHint || "").trim();

    if (parts.length > 1) {
        const last = parts[parts.length - 1];

        if (!looksNumericish(last)) {
            const lastKey = normalizeKey(last);

            if (source && lastKey === normalizeKey(source)) {
                parts.pop();
            } else if (!source && ACTIVE_SOURCE_LABELS.has(lastKey)) {
                source = last;
                parts.pop();
            }
        }
    }

    if (parts.length > 1 && isTypeTokenForLabel(parts[0], typeLabel)) {
        parts.shift();
    }

    if (parts.length > 1 && /^(chapter|ch|part|pt|appendix|app)$/i.test(parts[0]) && looksNumericish(parts[1])) {
        parts.shift();
        parts.shift();
    } else {
        while (parts.length > 1 && looksNumericish(parts[0])) {
            parts.shift();
        }
    }

    const joined = parts.join(" ").trim();
    const name = normalizeParsedName(joined || cleanBaseName);

    return {
        name,
        source,
        isOverview: normalizeKey(name) === normalizeKey("Overview"),
    };
}

function buildSearchBlob(entry) {
    const parts = [
        entry.displayName,
        entry.fileLabel,
        entry.typeLabel,
        entry.sourceLabel,
        entry.collectionName,
        entry.aliases.join(" "),
        entry.path,
        humanizeRawText(entry.path),
    ];

    if (entry.spellMeta) {
        if (entry.spellMeta.school) parts.push(entry.spellMeta.school);
        if (entry.spellMeta.classes && entry.spellMeta.classes.length) parts.push(entry.spellMeta.classes.join(" "));
        if (entry.spellMeta.level != null) parts.push(formatSpellLevel(entry.spellMeta.level));
    }

    return parts.join(" | ").toLowerCase();
}

function fuzzyPenalty(haystack, needle) {
    let haystackIndex = 0;
    let penalty = 0;

    for (const char of needle) {
        const foundIndex = haystack.indexOf(char, haystackIndex);
        if (foundIndex === -1) return Number.POSITIVE_INFINITY;

        penalty += foundIndex - haystackIndex;
        haystackIndex = foundIndex + 1;
    }

    penalty += Math.max(0, haystack.length - needle.length);
    return penalty;
}

function scoreEntry(entry, query, titleOnly = false) {
    const q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) return 100;
    const name = entry.displayNameLower || "", collection = (entry.collectionName || "").toLowerCase();
    const fields = [
        { value: name, weight: 1050 },
        { value: collection ? `${collection} ${name}` : name, weight: 960 },
        { value: entry.aliasesBlob || "", weight: 780 },
        { value: entry.fileLabelLower || "", weight: 720 },
        { value: (entry.sourceLabel || "").toLowerCase(), weight: 470 },
        { value: (entry.typeLabel || "").toLowerCase(), weight: 430 },
    ];
    if (!titleOnly) fields.push({ value: entry.pathLower || "", weight: 245 }, { value: entry.searchBlob || "", weight: 190 });
    let best = Number.NEGATIVE_INFINITY;
    for (const field of fields) best = Math.max(best, scoreTextField(field.value, q, field.weight));
    const tokenScore = scoreTokenCoverage(fields, tokenizeSearchQuery(q));
    if (tokenScore !== Number.NEGATIVE_INFINITY) best = Math.max(best, tokenScore);
    if (best === Number.NEGATIVE_INFINITY) return -1;
    return best - Math.min(60, Math.max(0, name.length - q.length) * 0.08) + (entry.isOverview && collection.includes(q) ? 20 : 0);
}

function sameStringArray(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function entriesEqual(a, b) {
    return (
        a.path === b.path &&
        a.displayName === b.displayName &&
        a.fileLabel === b.fileLabel &&
        a.typeLabel === b.typeLabel &&
        a.typeKey === b.typeKey &&
        a.sourceLabel === b.sourceLabel &&
        a.sourceKey === b.sourceKey &&
        a.collectionName === b.collectionName &&
        a.collectionPath === b.collectionPath &&
        a.collectionKind === b.collectionKind &&
        a.isOverview === b.isOverview &&
        a.searchBlob === b.searchBlob &&
        sameStringArray(a.aliases, b.aliases)
    );
}

function relativePathWithinFolder(path, folderPath) {
    const normalizedPath = normalizePath(path);
    const normalizedFolder = normalizePath(folderPath);

    if (normalizedPath === normalizedFolder) return "";
    if (normalizedPath.startsWith(`${normalizedFolder}/`)) {
        return normalizedPath.slice(normalizedFolder.length + 1);
    }

    return normalizedPath;
}

function compareCollectionEntries(a, b, collectionPath) {
    const rankA = a.isOverview ? 0 : 1;
    const rankB = b.isOverview ? 0 : 1;
    if (rankA !== rankB) return rankA - rankB;

    const relA = relativePathWithinFolder(a.path, collectionPath);
    const relB = relativePathWithinFolder(b.path, collectionPath);

    return COLLATOR.compare(relA, relB);
}

function sectionMeta(entry) {
    if (!entry.collectionPath) return "";

    const relative = relativePathWithinFolder(entry.path, entry.collectionPath);
    const parts = relative.split("/").filter(Boolean);
    if (parts.length <= 1) return "";

    return formatTitle(parts.slice(0, -1).join(" / "));
}

function collectionDepth(entry) {
    if (!entry.collectionPath) return 0;
    const relative = relativePathWithinFolder(entry.path, entry.collectionPath);
    const parts = relative.split("/").filter(Boolean);
    return Math.max(0, parts.length - 1);
}

function sortEntries(entries, sortMode, query, titleOnly = false, preScored = null) {
    const list = [...entries];
    if (sortMode === "name") { list.sort((a,b)=>COLLATOR.compare(a.collectionKind ? `${a.collectionName} - ${a.displayName}` : a.displayName, b.collectionKind ? `${b.collectionName} - ${b.displayName}` : b.displayName)||COLLATOR.compare(a.path,b.path)); return list; }
    if (sortMode === "source") { list.sort((a,b)=>COLLATOR.compare(a.sourceLabel||"zzz",b.sourceLabel||"zzz")||COLLATOR.compare(a.collectionName||a.displayName,b.collectionName||b.displayName)||COLLATOR.compare(a.displayName,b.displayName)||COLLATOR.compare(a.path,b.path)); return list; }
    if (sortMode === "type") { list.sort((a,b)=>COLLATOR.compare(a.typeLabel,b.typeLabel)||COLLATOR.compare(a.collectionName||a.displayName,b.collectionName||b.displayName)||COLLATOR.compare(a.displayName,b.displayName)||COLLATOR.compare(a.path,b.path)); return list; }
    const getScore = preScored
        ? (entry) => preScored.get(entry.path) ?? scoreEntry(entry, query, titleOnly)
        : (() => { const cache = new Map(); return (entry) => { let s = cache.get(entry.path); if (s === undefined) { s = scoreEntry(entry, query, titleOnly); cache.set(entry.path, s); } return s; }; })();
    list.sort((a,b)=>getScore(b)-getScore(a)||COLLATOR.compare(a.collectionName||a.displayName,b.collectionName||b.displayName)||COLLATOR.compare(a.displayName,b.displayName)||COLLATOR.compare(a.path,b.path));
    return list;
}

function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }

    return new Promise((resolve, reject) => {
        try {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            textarea.remove();
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

function makeWikiLink(file) {
    const linkPath = String(file.path || "").replace(/\.md$/i, "");
    return `[[${linkPath}]]`;
}

function parseSourceAliasesText(text) {
    const map = createDefaultSourceAliasMap();

    const lines = String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));

    for (const line of lines) {
        if (line.includes("=>")) {
            const [labelRaw, aliasesRaw] = line.split("=>").map((s) => s.trim());
            if (!labelRaw) continue;

            const label = labelRaw;
            map.set(normalizeKey(label), label);

            const aliases = aliasesRaw
                ? aliasesRaw.split(",").map((s) => s.trim()).filter(Boolean)
                : [];

            for (const alias of aliases) {
                map.set(normalizeKey(alias), label);
            }
            continue;
        }

        if (line.includes("=")) {
            const [aliasRaw, labelRaw] = line.split("=").map((s) => s.trim());
            if (!aliasRaw || !labelRaw) continue;

            map.set(normalizeKey(aliasRaw), labelRaw);
            map.set(normalizeKey(labelRaw), labelRaw);
        }
    }

    return map;
}


function wildcardPatternToRegExp(pattern) {
    const escaped = String(pattern || "")
        .replace(/[|\\{}()[\]^$+*?.]/g, "\\$&")
        .replace(/\\\*/g, ".*")
        .replace(/\\\?/g, ".");
    return new RegExp("^" + escaped + "$", "i");
}
function parseSourceOverrideRulesText(text) {
    return String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
            const parts = line.includes("=>") ? line.split("=>") : line.split("=");
            if (parts.length < 2) return null;
            const matcher = String(parts.shift() || "").trim();
            const source = String(parts.join("=>") || "").trim();
            if (!matcher || !source) return null;
            let kind = "path";
            let value = matcher;
            const mode = matcher.match(/^(path|glob|type|source|name)\s*:\s*(.+)$/i);
            if (mode) { kind = mode[1].toLowerCase(); value = mode[2].trim(); }
            return { kind, value, source, valueKey: normalizeKey(value), valuePath: normalizePath(value).toLowerCase(), regex: kind === "glob" ? wildcardPatternToRegExp(normalizePath(value)) : null };
        })
        .filter(Boolean);
}
function findForcedSourceOverride(path, typeLabel, inferredSourceLabel, displayName) {
    if (!ACTIVE_SOURCE_OVERRIDE_RULES || !ACTIVE_SOURCE_OVERRIDE_RULES.length) return "";
    const cleanPath = normalizePath(path || "");
    const lowerPath = cleanPath.toLowerCase();
    const pathKey = normalizeKey(cleanPath);
    const typeKey = normalizeKey(typeLabel || "");
    const sourceKey = normalizeKey(inferredSourceLabel || "");
    const nameKey = normalizeKey(displayName || "");
    for (const rule of ACTIVE_SOURCE_OVERRIDE_RULES) {
        if (!rule) continue;
        if (rule.kind === "type" && typeKey === rule.valueKey) return rule.source;
        if (rule.kind === "source" && sourceKey === rule.valueKey) return rule.source;
        if (rule.kind === "name" && nameKey && (nameKey === rule.valueKey || nameKey.includes(rule.valueKey))) return rule.source;
        if (rule.kind === "glob" && rule.regex && rule.regex.test(cleanPath)) return rule.source;
        if (rule.kind === "path") {
            const valuePath = rule.valuePath;
            if (lowerPath === valuePath || lowerPath.startsWith(valuePath.replace(/\/+$/, "") + "/") || lowerPath.includes(valuePath)) return rule.source;
            if (rule.valueKey && pathKey.includes(rule.valueKey)) return rule.source;
        }
    }
    return "";
}
function parseTypeFolderMappingsText(text) {
    const map = new Map();

    const lines = String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));

    for (const line of lines) {
        if (!line.includes("=>")) continue;

        const [foldersRaw, typeRaw] = line.split("=>").map((s) => s.trim());
        if (!foldersRaw || !typeRaw) continue;

        const typeLabel = normalizeTypeLabel(typeRaw);
        const folders = foldersRaw.split(",").map((s) => s.trim()).filter(Boolean);

        for (const folder of folders) {
            map.set(normalizeKey(folder), typeLabel);
        }
    }

    return map;
}

function createDefaultSourceAliasMap() {
    const map = new Map();

    const add = (label, ...aliases) => {
        for (const alias of [label, ...aliases]) {
            const key = normalizeKey(alias);
            if (key) map.set(key, label);
        }
    };

    add("Player's Handbook", "PHB", "playershandbook", "playerhandbook");
    add("Player's Handbook (2024)", "XPHB", "playershandbook2024", "playerhandbook2024", "phb2024");
    add("Dungeon Master's Guide", "DMG", "dungeonmastersguide");
    add("Dungeon Master's Guide (2024)", "XDMG", "dungeonmastersguide2024", "dmg2024");
    add("Monster Manual", "MM", "monstermanual");
    add("Monster Manual (2024)", "XMM", "monstermanual2024", "mm2024");

    add("Xanathar's Guide to Everything", "XGE");
    add("Tasha's Cauldron of Everything", "TCE");
    add("Fizban's Treasury of Dragons", "FTD");
    add("Sword Coast Adventurer's Guide", "SCAG");
    add("Volo's Guide to Monsters", "VGM");
    add("Mordenkainen's Tome of Foes", "MTF");
    add("Mordenkainen Presents: Monsters of the Multiverse", "MPMM");
    add("Explorer's Guide to Wildemount", "EGW");
    add("Eberron: Rising from the Last War", "ERLW");
    add("Eberron: Forge of the Artificer", "EFA", "forgeoftheartificer", "eberronforgeoftheartificer");
    add("Van Richten's Guide to Ravenloft", "VRGR");
    add("Astral Adventurer's Guide", "AAG");
    add("Boo's Astral Menagerie", "BAM");
    add("The Book of Many Things", "BMT");
    add("Mythic Odysseys of Theros", "MOT");

    add("Lost Mine of Phandelver", "LMOP", "lmop");
    add("Light of Xaryxis", "LOX", "lox");
    add("Turn of Fortune's Wheel", "TOFW", "tofw");
    add("Baldur's Gate: Descent into Avernus", "BGDIA", "bgdia");
    add("Curse of Strahd", "COS", "cos");
    add("Storm King's Thunder", "SKT", "skt");
    add("Out of the Abyss", "OOTA", "oota");
    add("Tomb of Annihilation", "TOA", "toa");
    add("Waterdeep: Dragon Heist", "WDH", "wdh");
    add("Waterdeep: Dungeon of the Mad Mage", "WDMM", "wdmm");
    add("Princes of the Apocalypse", "POTA", "pota");
    add("Infernal Machine Rebuild", "IMR", "imr");
    add("Icewind Dale: Rime of the Frostmaiden", "IDROTF", "idrotf");
    add("The Wild Beyond the Witchlight", "WBTW", "wbtw");
    add("Ghosts of Saltmarsh", "GOS", "gos");
    add("Hoard of the Dragon Queen", "HOTDQ", "hotdq");
    add("Rise of Tiamat", "ROT", "rot");
    add("Dragons of Stormwreck Isle", "DOSI", "dosi");
    add("Dragonlance: Shadow of the Dragon Queen", "DSOTDQ", "dsotdq");
    add("Chains of Asmodeus", "COA", "coa");
    add("Lost Laboratory of Kwalish", "LLK", "llk");
    add("Vecna: Eve of Ruin", "VEOR", "veor");
    add("Spelljammer: Adventures in Space", "SJA", "sja");

    add("Ryoko's Guide to the Yokai Realms", "ryokosguidetotheyokairealms", "ryokoguidetoyokairealms", "ryoko");
    add("Dungeons of Drakkenheim", "dungeonsofdrakkenheim", "drakkenheim");
    add("Monsters of Drakkenheim", "monstersofdrakkenheim");
    add("Sebastian Crowe's Guide to Drakkenheim", "sebastiancrowesguidetodrakkenheim");
    add("Sands of Doom", "sandsofdoom");
    add("Flee, Mortals!", "fleemortals");
    add("Strongholds and Followers", "strongholdsandfollowers", "saf");
    add("Kingdoms & Warfare", "kingdomsandwarfare");
    add("Creature Codex", "creaturecodex", "ccodex");
    add("Conflux Creatures", "confc", "confluxcreatures");
    add("Tome of Beasts", "tob", "tomeofbeasts");
    add("Tome of Beasts 1 (2023)", "tob1-2023", "tob12023");
    add("Tome of Beasts 2", "tob2", "tomeofbeasts2");
    add("Tome of Beasts 3", "tob3", "tomeofbeasts3");
    add("Vault of Magic", "vaultofmagic");
    add("Tal'Dorei Campaign Guide", "taldoreicampaignguide");
    add("Blood Hunter", "bloodhunter");
    add("Blood Hunter (2022)", "bloodhunter2022");
    add("Grim Hollow Campaign Guide", "grimhollowcampaignguide");
    add("Grim Hollow Player's Guide", "grimhollowplayersguide");
    add("Grim Hollow Monster Grimoire", "grimhollowmonstergrimoire");
    add("Chronicles of Eberron", "chroniclesofeberron");
    add("Exploring Eberron", "exploringeberron", "exploringeberron2024");
    add("Keith Baker Kanon", "keithbakerkanon");
    add("Frontiers of Eberron: Quickstone", "frontiersofeberronquickstone", "quickstone");
    add("35 Versatile NPCs", "35versatilenpcs", "versatilenpcs");

    for (const [abbr, label] of PRESET_SOURCE_ALIASES_5E) add(label, abbr, abbr.toLowerCase());
    const presetByAbbr = new Map(PRESET_SOURCE_ALIASES_5E.map(([abbr, label]) => [normalizeKey(abbr), label]));
    for (const [alias, target] of PRESET_SOURCE_ALIASES_ALT_5E) add(presetByAbbr.get(normalizeKey(target)) || target, alias);
    return map;
}


const PRESET_SOURCE_ALIASES_5E = [
    ["PHB", "Player's Handbook", "book"], ["DMG", "Dungeon Master's Guide", "book"], ["MM", "Monster Manual", "book"],
    ["XPHB", "Player's Handbook (2024)", "book"], ["XDMG", "Dungeon Master's Guide (2024)", "book"], ["XMM", "Monster Manual (2024)", "book"],
    ["XGE", "Xanathar's Guide to Everything", "book"], ["TCE", "Tasha's Cauldron of Everything", "book"], ["MPMM", "Mordenkainen Presents: Monsters of the Multiverse", "book"],
    ["SCAG", "Sword Coast Adventurer's Guide", "book"], ["VGM", "Volo's Guide to Monsters", "book"], ["MTF", "Mordenkainen's Tome of Foes", "book"],
    ["FTD", "Fizban's Treasury of Dragons", "book"], ["EGW", "Explorer's Guide to Wildemount", "book"], ["ERLW", "Eberron: Rising from the Last War", "book"],
    ["VRGR", "Van Richten's Guide to Ravenloft", "book"], ["BGG", "Bigby Presents: Glory of the Giants", "book"], ["BMT", "The Book of Many Things", "book"],
    ["CoS", "Curse of Strahd", "adventure"], ["SKT", "Storm King's Thunder", "adventure"], ["OotA", "Out of the Abyss", "adventure"], ["ToA", "Tomb of Annihilation", "adventure"],
    ["WDH", "Waterdeep: Dragon Heist", "adventure"], ["WDMM", "Waterdeep: Dungeon of the Mad Mage", "adventure"], ["PotA", "Princes of the Apocalypse", "adventure"],
    ["IDRotF", "Icewind Dale: Rime of the Frostmaiden", "adventure"], ["WBtW", "The Wild Beyond the Witchlight", "adventure"], ["GoS", "Ghosts of Saltmarsh", "adventure"],
    ["HotDQ", "Hoard of the Dragon Queen", "adventure"], ["RoT", "The Rise of Tiamat", "adventure"], ["DoSI", "Dragons of Stormwreck Isle", "adventure"],
    ["DSotDQ", "Dragonlance: Shadow of the Dragon Queen", "adventure"], ["VEoR", "Vecna: Eve of Ruin", "adventure"], ["ToFW", "Turn of Fortune's Wheel", "adventure"],
    ["KftGV", "Keys from the Golden Vault", "adventure"], ["JttRC", "Journeys through the Radiant Citadel", "adventure"], ["QftIS", "Quests from the Infinite Staircase", "adventure"],
    ["LMoP", "Lost Mine of Phandelver", "adventure"], ["LoX", "Light of Xaryxis", "adventure"], ["CoA", "Chains of Asmodeus", "adventure"],
    ["TftYP", "Tales from the Yawning Portal", "reference"], ["ToD", "Tyranny of Dragons", "reference"], ["SAiS", "Spelljammer: Adventures in Space", "reference"],
];
const PRESET_SOURCE_ALIASES_ALT_5E = [["TYP", "TftYP"], ["HEROES_FEAST", "HF"], ["freeRules2024", "basicRules2024"], ["ALCurseOfStrahd", "ALCoS"], ["ALElementalEvil", "ALEE"], ["ALRageOfDemons", "ALRoD"]];

const EMBEDDED_STYLES = `
.ttrpg-vs-modal {
    width: min(1180px, 96vw);
    height: min(88vh, 900px);
}
/* Prevent the modal-content from adding its own scrollbar */
.ttrpg-vs-modal .modal-content {
    overflow: hidden;
}
.ttrpg-vs {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1 1 auto; /* works inside flex leaf */
    height: 100%;   /* works inside fixed-height modal */
    min-height: 0;
}
/* When the inline search is embedded in a leaf (pop-out), add inner padding
   since the modal's chrome normally provides it */
.view-content > .ttrpg-vs {
    padding: 12px;
    box-sizing: border-box;
    height: auto;
}
.ttrpg-vs__toolbar {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex-shrink: 0;
}
.ttrpg-vs__search {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
}
.ttrpg-vs__filters {
    display: grid;
    grid-template-columns: minmax(0, 170px) minmax(0, 1fr) minmax(0, 160px) auto;
    gap: 10px;
    align-items: end;
}
.ttrpg-vs__filter {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}
.ttrpg-vs__label {
    font-size: 12px;
    color: var(--text-muted);
}
.ttrpg-vs__select,
.ttrpg-vs__button,
.ttrpg-vs__toolbutton {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    min-height: 34px;
    line-height: 1.4;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
    text-align: left;
}
.ttrpg-vs__button-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
.ttrpg-vs__toolbutton {
    width: auto;
    white-space: nowrap;
    background: var(--background-secondary);
}
.ttrpg-vs__toolbutton.is-active {
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 12%, var(--background-secondary));
}
.ttrpg-vs__stats {
    font-size: 12px;
    color: var(--text-muted);
    flex-shrink: 0;
}
.ttrpg-vs__viewport {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
}
.ttrpg-vs__canvas {
    position: relative;
    width: 100%;
}
.ttrpg-vs__empty {
    padding: 18px 12px;
    text-align: center;
    color: var(--text-muted);
    border: 1px dashed var(--background-modifier-border);
    border-radius: 12px;
    background: var(--background-primary);
}
.ttrpg-vs__result {
    contain: layout paint style;
    position: absolute;
    left: 0;
    right: 0;
    height: 116px;
    box-sizing: border-box;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    cursor: pointer;
    overflow: hidden;
    transition: background-color 120ms ease, border-color 120ms ease;
}
.ttrpg-vs__result:hover,
.ttrpg-vs__result.is-selected {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
}
.ttrpg-vs__top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
}
.ttrpg-vs__main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
    flex: 1 1 auto;
}
.ttrpg-vs__title {
    min-width: 0;
    font-size: 15px;
    line-height: 1.35;
    font-weight: 700;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
}
.ttrpg-vs__title-piece,
.ttrpg-vs__title-sep {
    min-width: 0;
}
.ttrpg-vs__title-collection,
.ttrpg-vs__title-chapter {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    word-break: break-word;
    white-space: normal;
}
.ttrpg-vs__title-collection {
    flex: 0 1 auto;
    max-width: 46%;
}
.ttrpg-vs__title-chapter {
    flex: 1 1 260px;
}
.ttrpg-vs__title-sep {
    color: var(--text-muted);
    flex: 0 0 auto;
}
.ttrpg-vs__meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
}
.ttrpg-vs__chip,
.ttrpg-vs__badge {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 1.35;
    border: 1px solid var(--background-modifier-border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ttrpg-vs__chip {
    background: color-mix(in srgb, var(--interactive-accent) 12%, var(--background-secondary));
    color: var(--text-normal);
    font-weight: 700;
    flex-shrink: 0;
}
.ttrpg-vs__badge {
    background: var(--background-secondary);
    color: var(--text-normal);
    font-weight: 600;
    flex-shrink: 0;
}
.ttrpg-vs__meta-text {
    min-width: 0;
    flex: 1 1 auto;
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ttrpg-vs__path {
    margin-top: 8px;
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ttrpg-vs__right {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex-shrink: 0;
}
.ttrpg-vs__star {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    color: var(--text-muted);
    cursor: pointer;
    padding: 0;
    font-size: 14px;
}
.ttrpg-vs__star.is-active {
    color: #e0a100;
    background: color-mix(in srgb, #e0a100 18%, var(--background-secondary));
    border-color: #e0a10055;
}
.ttrpg-vs mark {
    background: color-mix(in srgb, var(--interactive-accent) 26%, transparent);
    color: inherit;
    padding: 0 2px;
    border-radius: 3px;
}

.ttrpg-vs-source-modal {
    width: min(720px, 94vw);
}
.ttrpg-vs-source {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.ttrpg-vs-source__search {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
}
.ttrpg-vs-source__list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 62vh;
    overflow-y: auto;
}
.ttrpg-vs-source__item {
    width: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    cursor: pointer;
    text-align: left;
}
.ttrpg-vs-source__item:hover,
.ttrpg-vs-source__item.is-selected {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
}
.ttrpg-vs-source__name {
    min-width: 0;
    flex: 1 1 auto;
    white-space: normal;
    word-break: break-word;
    line-height: 1.35;
}
.ttrpg-vs-source__count {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
}

.ttrpg-reader-modal {
    width: min(1400px, 97vw);
    height: min(90vh, 980px);
}
.ttrpg-reader {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 0;
}
.ttrpg-reader__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}
.ttrpg-reader__heading {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.ttrpg-reader__subtitle {
    font-size: 12px;
    color: var(--text-muted);
}
.ttrpg-reader__actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
}
.ttrpg-reader__action {
    padding: 7px 12px;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    cursor: pointer;
}
.ttrpg-reader__action.is-active {
    color: #e0a100;
    border-color: #e0a10055;
    background: color-mix(in srgb, #e0a100 12%, var(--background-secondary));
}
.ttrpg-reader__body {
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr);
    gap: 12px;
    flex: 1;
    min-height: 0;
}
.ttrpg-reader__sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    background: var(--background-primary);
    overflow: hidden;
}
.ttrpg-reader__pane {
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    min-height: 0;
}
.ttrpg-reader__pane + .ttrpg-reader__pane {
    border-top: 1px solid var(--background-modifier-border);
}
.ttrpg-reader__sidebar-section-title {
    padding: 10px 14px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
}
.ttrpg-reader__sections,
.ttrpg-reader__subheadings {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    min-height: 0;
    padding: 6px;
    flex: 1 1 0;
}
.ttrpg-reader__section,
.ttrpg-reader__subheading {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
    white-space: normal;
    word-break: break-word;
}
.ttrpg-reader__section {
    padding-left: calc(12px + (var(--ttrpg-depth, 0) * 12px));
}
.ttrpg-reader__section:hover,
.ttrpg-reader__section.is-active,
.ttrpg-reader__subheading:hover {
    background: var(--background-modifier-hover);
}
.ttrpg-reader__section-title,
.ttrpg-reader__subheading-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-normal);
    word-break: break-word;
    white-space: normal;
    line-height: 1.4;
}
.ttrpg-reader__section-meta {
    font-size: 11px;
    color: var(--text-muted);
    white-space: normal;
    word-break: break-word;
    line-height: 1.35;
}
.ttrpg-reader__subheading {
    padding-left: calc(12px + (var(--ttrpg-depth, 0) * 12px));
}
.ttrpg-reader__content-wrap {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    background: var(--background-primary);
    overflow: hidden;
}
.ttrpg-reader__content-header {
    padding: 14px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
}
.ttrpg-reader__content-title {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.3;
}
.ttrpg-reader__content-meta {
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-muted);
    word-break: break-all;
}
.ttrpg-reader__content {
    min-height: 0;
    overflow-y: auto;
    padding: 18px 20px 28px;
    line-height: 1.6;
}
.ttrpg-reader__content .markdown-preview-view,
.ttrpg-reader__content .markdown-rendered {
    padding: 0;
}
.ttrpg-reader__content img,
.ttrpg-reader__content .internal-embed img,
.ttrpg-reader__content .markdown-rendered img {
    max-width: 100% !important;
    width: auto !important;
    height: auto !important;
    max-height: 75vh;
    object-fit: contain;
    display: block;
    margin-left: auto;
    margin-right: auto;
}
.ttrpg-reader__content figure {
    max-width: 100%;
}
.ttrpg-reader__content .image-embed,
.ttrpg-reader__content .markdown-embed {
    max-width: 100%;
}
.ttrpg-reader__content a {
    cursor: pointer;
}
.ttrpg-reader__topbar-button {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    color: var(--text-normal);
    cursor: pointer;
    margin-right: 6px;
}
.ttrpg-reader__topbar-button:hover {
    background: var(--background-modifier-hover);
}

@media (max-width: 980px) {
    .ttrpg-reader__body {
        grid-template-columns: 1fr;
    }
    .ttrpg-reader__sidebar {
        max-height: 420px;
    }
}
@media (max-width: 760px) {
    .ttrpg-vs__filters {
        grid-template-columns: 1fr;
    }
    .ttrpg-reader__header {
        flex-direction: column;
    }
    .ttrpg-reader__actions {
        justify-content: flex-start;
    }
}


.ttrpg-vs__chip--source { --ttrpg-source-color: var(--interactive-accent); background: color-mix(in srgb, var(--ttrpg-source-color) 18%, var(--background-secondary)); border-color: color-mix(in srgb, var(--ttrpg-source-color) 55%, var(--background-modifier-border)); }
.ttrpg-vs__chip--source:hover { background: color-mix(in srgb, var(--ttrpg-source-color) 28%, var(--background-secondary)); }
.ttrpg-reader__content { font-size: var(--font-text-size); font-family: var(--font-text); line-height: var(--line-height-normal); }
.ttrpg-reader__content .markdown-rendered, .ttrpg-reader__content .markdown-preview-view { max-width: var(--file-line-width, 700px); margin: 0 auto; width: 100%; }
.ttrpg-vs-source-edit__row { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
.ttrpg-vs-source-edit__input { width:100%; box-sizing:border-box; padding:8px 10px; border-radius:8px; border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); }
.ttrpg-vs-source-chip-manager { display:flex; flex-direction:column; gap:8px; margin:8px 0 18px; }
.ttrpg-vs-source-chip-manager__row { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) 52px auto auto; gap:8px; align-items:center; padding:8px; border:1px solid var(--background-modifier-border); border-radius:10px; background:var(--background-primary); }
.ttrpg-vs-source-chip-manager__original { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; color:var(--text-muted); }
.ttrpg-vs-source-chip-manager__input { width:100%; box-sizing:border-box; padding:6px 8px; border-radius:8px; border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); }

/* Clickable chip / badge variants */
button.ttrpg-vs__chip,
button.ttrpg-vs__badge {
    font-family: inherit;
    outline: none;
}
.ttrpg-vs__chip--clickable {
    cursor: pointer;
}
.ttrpg-vs__chip--clickable:hover {
    background: color-mix(in srgb, var(--interactive-accent) 24%, var(--background-secondary));
    border-color: var(--interactive-accent);
}
.ttrpg-vs__badge--clickable {
    cursor: pointer;
}
.ttrpg-vs__badge--clickable:hover {
    background: color-mix(in srgb, var(--interactive-accent) 14%, var(--background-secondary));
    border-color: var(--interactive-accent);
}

/* Type picker modal */
.ttrpg-vs-type-modal {
    width: min(560px, 94vw);
}
.ttrpg-vs-type {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.ttrpg-vs-type__actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding-top: 6px;
    border-top: 1px solid var(--background-modifier-border);
}
.ttrpg-vs-type__item {
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    cursor: pointer;
}
.ttrpg-vs-type__item:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
}
.ttrpg-vs-type__checkbox {
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    cursor: pointer;
    accent-color: var(--interactive-accent);
}

/* Source picker modal — shares type-picker layout/items */
.ttrpg-vs-source-modal {
    width: min(600px, 94vw);
}
.ttrpg-vs-source {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

/* Bookmark group tabs */
.ttrpg-vs__group-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 0 2px;
}
.ttrpg-vs__group-tab {
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
}
.ttrpg-vs__group-tab:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
}
.ttrpg-vs__group-tab.is-active {
    background: color-mix(in srgb, var(--interactive-accent) 18%, var(--background-secondary));
    border-color: var(--interactive-accent);
}

/* Bookmark manager modal */
.ttrpg-vs-bm-modal {
    width: min(820px, 95vw);
    height: min(80vh, 700px);
}
.ttrpg-vs-bm {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 12px;
    height: 100%;
    min-height: 0;
}
.ttrpg-vs-bm__sidebar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    background: var(--background-primary);
    overflow: hidden;
    min-height: 0;
}
.ttrpg-vs-bm__sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted);
    flex-shrink: 0;
}
.ttrpg-vs-bm__groups {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    overflow-y: auto;
    flex: 1 1 0;
    min-height: 0;
}
.ttrpg-vs-bm__group-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid transparent;
    cursor: pointer;
    gap: 6px;
}
.ttrpg-vs-bm__group-item:hover,
.ttrpg-vs-bm__group-item.is-active {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border);
}
.ttrpg-vs-bm__group-item.is-active {
    border-color: var(--interactive-accent);
}
.ttrpg-vs-bm__group-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-normal);
    flex: 1 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ttrpg-vs-bm__group-count {
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
}
.ttrpg-vs-bm__group-delete {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    border: 0;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    font-size: 12px;
    padding: 0;
    opacity: 0;
}
.ttrpg-vs-bm__group-item:hover .ttrpg-vs-bm__group-delete {
    opacity: 1;
}
.ttrpg-vs-bm__group-delete:hover {
    background: color-mix(in srgb, var(--color-red) 14%, var(--background-secondary));
    color: var(--color-red);
}
.ttrpg-vs-bm__add-group {
    display: flex;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
}
.ttrpg-vs-bm__add-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    font-size: 12px;
}
.ttrpg-vs-bm__add-btn {
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    cursor: pointer;
    font-size: 12px;
    color: var(--text-normal);
    white-space: nowrap;
}
.ttrpg-vs-bm__add-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
}
.ttrpg-vs-bm__main {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    background: var(--background-primary);
    overflow: hidden;
    min-height: 0;
}
.ttrpg-vs-bm__main-header {
    padding: 10px 14px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted);
    flex-shrink: 0;
}
.ttrpg-vs-bm__list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    overflow-y: auto;
    flex: 1 1 0;
    min-height: 0;
}
.ttrpg-vs-bm__entry {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
}
.ttrpg-vs-bm__entry-info {
    flex: 1 1 auto;
    min-width: 0;
}
.ttrpg-vs-bm__entry-name {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ttrpg-vs-bm__entry-meta {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ttrpg-vs-bm__entry-select {
    flex-shrink: 0;
    padding: 4px 8px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    font-size: 11px;
    color: var(--text-normal);
    cursor: pointer;
    max-width: 140px;
}
.ttrpg-vs-bm__empty {
    padding: 20px;
    text-align: center;
    color: var(--text-muted);
}

/* Settings number input */
.ttrpg-vs-setting__number-wrap {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-end;
}
.ttrpg-vs-setting__number {
    width: 90px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    text-align: right;
}
.ttrpg-vs-setting__warning {
    font-size: 11px;
    color: var(--text-warning, #e8a020);
    max-width: 220px;
    text-align: right;
}

/* Reader: in-content find bar */
.ttrpg-reader__search-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding-top: 8px;
    border-top: 1px solid var(--background-modifier-border);
    margin-top: 6px;
}
.ttrpg-reader__search-input {
    flex: 1;
    min-width: 0;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    font-size: 12px;
}
.ttrpg-reader__search-nav {
    padding: 4px 8px !important;
    font-size: 11px !important;
}
.ttrpg-reader__search-count {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    min-width: 54px;
    text-align: right;
}
mark.ttrpg-reader__find-match {
    background: color-mix(in srgb, #f4c430 35%, transparent);
    color: inherit;
    padding: 0 1px;
    border-radius: 2px;
}
mark.ttrpg-reader__find-match.is-current {
    background: #f4c430;
    outline: 2px solid #c8960a;
    border-radius: 2px;
}

/* ── Popout window: tab-based layout ──────────────────────────────────────── */
.ttrpg-popout-view {
    display: flex !important;
    flex-direction: column !important;
    height: 100% !important;
    overflow: hidden !important;
}
.ttrpg-popout__tabbar {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    gap: 2px;
    padding: 6px 8px 0;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
    scrollbar-width: thin;
}
.ttrpg-popout__body { flex: 1; min-height: 0; position: relative; }
.ttrpg-popout__panel {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    overflow: hidden;
}
.ttrpg-popout__panel[hidden] { display: none !important; }
.ttrpg-popout__tab {
    display: flex; align-items: center; gap: 5px;
    padding: 5px 10px 5px 12px;
    border-radius: 6px 6px 0 0; cursor: pointer; font-size: 12px;
    background: var(--background-secondary-alt, var(--background-secondary));
    border: 1px solid var(--background-modifier-border); border-bottom: none;
    max-width: 180px; user-select: none; white-space: nowrap; flex-shrink: 0;
    transition: background 80ms ease;
}
.ttrpg-popout__tab.is-active {
    background: var(--background-primary);
    color: var(--text-normal); font-weight: 600;
}
.ttrpg-popout__tab-title { overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
.ttrpg-popout__tab-close {
    flex-shrink: 0; width: 16px; height: 16px;
    border: none; background: none; cursor: pointer;
    font-size: 15px; line-height: 1; opacity: 0; padding: 0;
    color: var(--text-muted); font-family: inherit;
}
.ttrpg-popout__tab:hover .ttrpg-popout__tab-close { opacity: 0.7; }
.ttrpg-popout__tab-close:hover { opacity: 1 !important; color: var(--text-normal); }

/* Search panel: fill height with no fixed max-height */
.ttrpg-popout__panel.is-search { padding: 12px; gap: 10px; }
.ttrpg-popout__panel.is-search .ttrpg-vs__viewport {
    max-height: none !important; flex: 1 !important; min-height: 0 !important;
}
/* Reader panel */
.ttrpg-popout__panel.is-reader { padding: 0; }
.ttrpg-popout__panel.is-reader .ttrpg-reader { height: 100%; min-height: 0; }

/* ── Spellbook ──────────────────────────────────────────────────────────────── */
.ttrpg-sb-modal {
    width: min(1180px, 96vw);
    height: min(88vh, 900px);
}
.ttrpg-sb-modal .modal-content {
    overflow: hidden;
}
.ttrpg-sb__filters {
    grid-template-columns: auto minmax(0, 110px) minmax(0, 140px) minmax(0, 140px) minmax(0, 1fr) auto auto minmax(0, 115px) auto;
}
/* Spell level chips — color-coded by level */
.ttrpg-sb__level-chip {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    border: 1px solid transparent;
    white-space: nowrap;
    flex-shrink: 0;
}
.ttrpg-sb__level-0  { background: color-mix(in srgb, #a78bfa 15%, var(--background-secondary)); border-color: #a78bfa44; color: #a78bfa; }
.ttrpg-sb__level-1  { background: color-mix(in srgb, #60a5fa 15%, var(--background-secondary)); border-color: #60a5fa44; color: #60a5fa; }
.ttrpg-sb__level-2  { background: color-mix(in srgb, #34d399 15%, var(--background-secondary)); border-color: #34d39944; color: #34d399; }
.ttrpg-sb__level-3  { background: color-mix(in srgb, #fbbf24 15%, var(--background-secondary)); border-color: #fbbf2444; color: #fbbf24; }
.ttrpg-sb__level-4  { background: color-mix(in srgb, #fb923c 15%, var(--background-secondary)); border-color: #fb923c44; color: #fb923c; }
.ttrpg-sb__level-5  { background: color-mix(in srgb, #f87171 15%, var(--background-secondary)); border-color: #f8717144; color: #f87171; }
.ttrpg-sb__level-6  { background: color-mix(in srgb, #e879f9 15%, var(--background-secondary)); border-color: #e879f944; color: #e879f9; }
.ttrpg-sb__level-7  { background: color-mix(in srgb, #2dd4bf 15%, var(--background-secondary)); border-color: #2dd4bf44; color: #2dd4bf; }
.ttrpg-sb__level-8  { background: color-mix(in srgb, #818cf8 15%, var(--background-secondary)); border-color: #818cf844; color: #818cf8; }
.ttrpg-sb__level-9  { background: color-mix(in srgb, #fb7185 15%, var(--background-secondary)); border-color: #fb718544; color: #fb7185; }

@media (max-width: 760px) {
    .ttrpg-sb__filters {
        grid-template-columns: 1fr !important;
    }
}

/* Reader: tables */
.ttrpg-reader__content table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.75em 0;
    font-size: 0.92em;
}
.ttrpg-reader__content th,
.ttrpg-reader__content td {
    border: 1px solid var(--background-modifier-border);
    padding: 7px 12px;
    text-align: left;
    vertical-align: top;
    word-break: break-word;
    min-width: 60px;
}
.ttrpg-reader__content th {
    background: var(--background-secondary);
    font-weight: 600;
    color: var(--text-normal);
    position: sticky;
    top: 0;
    z-index: 1;
}
.ttrpg-reader__content tbody tr:nth-child(even) {
    background: color-mix(in srgb, var(--background-secondary) 45%, transparent);
}
.ttrpg-reader__content tbody tr:hover {
    background: var(--background-modifier-hover);
}
/* Horizontally scroll wide tables rather than overflow the pane */
.ttrpg-reader__content .markdown-rendered,
.ttrpg-reader__content .markdown-preview-view {
    overflow-x: auto;
}

/* Bookmark drag-and-drop */
.ttrpg-vs-bm__drag-handle {
    cursor: grab;
    color: var(--text-faint);
    flex-shrink: 0;
    padding: 0 6px 0 0;
    font-size: 15px;
    line-height: 1;
    user-select: none;
    display: flex;
    align-items: center;
    opacity: 0.5;
}
.ttrpg-vs-bm__drag-handle:active { cursor: grabbing; }
.ttrpg-vs-bm__group-item:hover .ttrpg-vs-bm__drag-handle,
.ttrpg-vs-bm__entry:hover .ttrpg-vs-bm__drag-handle { opacity: 1; }
.ttrpg-vs-bm__group-item.is-dragging,
.ttrpg-vs-bm__entry.is-dragging { opacity: 0.35; }
.ttrpg-vs-bm__drop-indicator {
    height: 2px;
    background: var(--interactive-accent);
    border-radius: 1px;
    margin: 1px 0;
    pointer-events: none;
}

/* TTRPG selector vertical clipping fix */
.ttrpg-vs__select,
.ttrpg-vs select,
.ttrpg-reader select,
.ttrpg-vs-source select,
.ttrpg-vs-type select,
.ttrpg-search-button-insert-modal select {
    box-sizing: border-box !important;
    min-height: 34px !important;
    height: auto !important;
    line-height: 1.4 !important;
    padding-top: 6px !important;
    padding-bottom: 6px !important;
    vertical-align: middle !important;
    font-family: var(--font-interface) !important;
    font-size: var(--font-ui-small, 13px) !important;
    letter-spacing: normal !important;
    text-transform: none !important;
    transform: none !important;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
}

.ttrpg-vs__select option,
.ttrpg-vs select option,
.ttrpg-reader select option,
.ttrpg-vs-source select option,
.ttrpg-vs-type select option,
.ttrpg-search-button-insert-modal select option {
    line-height: 1.4 !important;
    font-family: var(--font-interface) !important;
    font-size: var(--font-ui-small, 13px) !important;
}

/* Keep adjacent input fields visually aligned with fixed selects. */
.ttrpg-vs-source__search,
.ttrpg-vs-source__input,
.ttrpg-vs-source-edit__input,
.ttrpg-vs-setting__number {
    box-sizing: border-box !important;
    min-height: 34px !important;
    line-height: 1.4 !important;
    padding-top: 6px !important;
    padding-bottom: 6px !important;
}
`;
const TTRPG_READER_VIEW_TYPE = "ttrpg-reader-view";

class TTRPGVaultSearchPlugin extends Plugin {
    async onload() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        this.entryMap = new Map();
        this.index = [];
        this.configuredFolders = [];
        this.configuredFolderKeys = new Set();
        this.activeModals = new Set();
        this._cachedSearchState = null;    // fast in-memory last-search cache
        this._pendingReaderState = null;   // handoff to TTRPGReaderView on open

        this.pendingPaths = new Set();
        this.didInitialResolvedRebuild = false;
        this.flushPendingUpdates = debounce(() => this.applyPendingUpdates(), 250, false);

        this.refreshConfiguredFolders();
        this.refreshCustomMaps();
        this.injectStyles();
        this.startSettingsBackupScheduler();

        this.registerView(TTRPG_READER_VIEW_TYPE, (leaf) => new TTRPGReaderView(leaf, this));

        this.addCommand({
            id: "open-ttrpg-vault-search",
            name: "Open TTRPG Vault Search",
            callback: () => this.openSearchModal(),
        });

        this.addCommand({
            id: "open-ttrpg-spellbook",
            name: "Open TTRPG Spellbook",
            callback: () => this.openSpellbookModal(),
        });

        this.addCommand({
            id: "insert-ttrpg-search-button",
            name: "Insert TTRPG Search button",
            editorCallback: (editor) => {
                new TTRPGSearchButtonInsertModal(this.app, this, editor).open();
            },
        });


        this.addCommand({
            id: "rebuild-ttrpg-vault-search-index",
            name: "Rebuild TTRPG Vault Search index",
            callback: () => this.buildIndex(true),
        });

        this.addCommand({
            id: "ttrpg-vault-search-diagnostics",
            name: "Run TTRPG Vault Search diagnostics",
            callback: () => this.runDiagnostics(),
        });

        this.addCommand({
            id: "compact-ttrpg-vault-search-index",
            name: "Compact TTRPG Vault Search index",
            callback: () => this.compactIndex(),
        });

        this.addRibbonIcon("search", "Open TTRPG Vault Search", () => {
            this.openSearchModal();
        });

        this.addRibbonIcon("book-open", "Open TTRPG Spellbook", () => {
            this.openSpellbookModal();
        });

        this.addSettingTab(new TTRPGVaultSearchSettingTab(this.app, this));

        this.startApplicatorReloadWatcher();

        this.registerTTRPGSearchEmbeds();

        this.registerEvent(this.app.vault.on("create", (file) => this.scheduleRefresh(file)));
        this.registerEvent(this.app.vault.on("modify", (file) => this.scheduleRefresh(file)));
        this.registerEvent(this.app.vault.on("delete", (file) => this.scheduleRemove(file)));
        this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.handleRename(file, oldPath)));
        this.registerEvent(this.app.metadataCache.on("changed", (file) => this.scheduleRefresh(file)));
        this.registerEvent(
            this.app.metadataCache.on("resolved", () => {
                if (this.didInitialResolvedRebuild) return;
                this.didInitialResolvedRebuild = true;
                this.buildIndex(false);
            })
        );

        this.buildIndex(false);
    }

    onunload() {
        if (this.activeModals) this.activeModals.clear();
        if (this.pendingPaths) this.pendingPaths.clear();
    }

    injectStyles() {
        const styleEl = document.createElement("style");
        styleEl.textContent = EMBEDDED_STYLES;
        document.head.appendChild(styleEl);
        this.register(() => styleEl.remove());
    }

    refreshConfiguredFolders() {
        this.configuredFolders = splitConfiguredFolders(this.settings.indexedFolders);
        this.configuredFolderKeys = buildConfiguredFolderKeySet(this.configuredFolders);
    }

    refreshCustomMaps() {
        ACTIVE_SOURCE_LABELS = parseSourceAliasesText(this.settings.sourceAliasesText || "");
        ACTIVE_FOLDER_TYPE_MAP = parseTypeFolderMappingsText(this.settings.typeFolderMappingsText || "");
        ACTIVE_SOURCE_OVERRIDE_RULES = parseSourceOverrideRulesText(this.settings.sourceOverridesText || "");
    }

    openSearchModal(initialState = null) {
        if (initialState && initialState.mode === "spellbook") {
            this.openSpellbookModal(initialState);
            return;
        }
        const state = initialState || (this.settings.saveLastSearch ? (this._cachedSearchState || this.settings.lastSearchState || null) : null);
        if (this.settings.openSearchInPopoutByDefault && !(state && state.forceModal)) {
            void this.openSearchPopout(state);
            return;
        }
        new TTRPGSearchModal(this.app, this, state).open();
    }

    openSpellbookModal(initialState = null) {
        new TTRPGSpellbookModal(this.app, this, initialState).open();
    }

    // ── Spell bookmarks (isolated from main bookmarks) ────────────────────────
    isSpellBookmarked(path) {
        return Array.isArray(this.settings.spellbookBookmarks) && this.settings.spellbookBookmarks.includes(path);
    }

    async toggleSpellBookmark(path) {
        if (!Array.isArray(this.settings.spellbookBookmarks)) this.settings.spellbookBookmarks = [];
        const idx = this.settings.spellbookBookmarks.indexOf(path);
        if (idx >= 0) this.settings.spellbookBookmarks.splice(idx, 1);
        else this.settings.spellbookBookmarks.push(path);
        await this.saveSettings();
        this.notifyModals();
    }

    getSpellBookmarkedPaths() {
        return Array.isArray(this.settings.spellbookBookmarks) ? [...this.settings.spellbookBookmarks] : [];
    }

    // ── Pop-out helpers ───────────────────────────────────────────────────────
    async openReaderPopout(entries, initialIndex, searchState) {
        const leaf = this.app.workspace.getLeaf("window");
        await leaf.setViewState({ type: TTRPG_READER_VIEW_TYPE, active: true });
        const view = leaf.view;
        if (view instanceof TTRPGReaderView) {
            view.setReaderState(entries, initialIndex, searchState, "window");
        }
    }

    async openSearchPopout(initialState) {
        try {
            const leaf = this.app.workspace.getLeaf("window");
            await leaf.setViewState({ type: TTRPG_READER_VIEW_TYPE, active: true });
            if (leaf.view && typeof leaf.view.initSearchView === "function") {
                leaf.view.initSearchView(initialState);
            }
        } catch (err) {
            new Notice("Could not open pop-out window — Obsidian 1.1+ required.");
            console.error("TTRPG pop-out error:", err);
        }
    }
    async openReaderInWindow(entries, initialIndex, searchState) {
        try {
            const leaf = this.app.workspace.getLeaf("window");
            await leaf.setViewState({ type: TTRPG_READER_VIEW_TYPE, active: true });
            if (leaf.view && typeof leaf.view.setReaderState === "function") {
                leaf.view.setReaderState(entries, initialIndex, searchState, "window");
            }
        } catch (err) {
            new Notice("Could not open pop-out window — Obsidian 1.1+ required.");
            console.error("TTRPG Vault Search pop-out error:", err);
        }
    }

    registerModal(modal) {
        this.activeModals.add(modal);
    }

    unregisterModal(modal) {
        this.activeModals.delete(modal);
    }

    getEntries() {
        return this.index;
    }

    getEntryByPath(path) {
        return this.entryMap.get(path) || null;
    }

    getTypeOptions() {
        if (this._cachedTypeOptions) return this._cachedTypeOptions;
        const map = new Map();

        for (const entry of this.index) {
            if (!entry.typeKey) continue;

            const existing = map.get(entry.typeKey);
            if (existing) existing.count += 1;
            else {
                map.set(entry.typeKey, {
                    key: entry.typeKey,
                    label: entry.typeLabel,
                    count: 1,
                });
            }
        }

        this._cachedTypeOptions = Array.from(map.values()).sort((a, b) => COLLATOR.compare(a.label, b.label));
        return this._cachedTypeOptions;
    }

    getSourceOptions() {
        if (this._cachedSourceOptions) return this._cachedSourceOptions;
        const map = new Map();

        for (const entry of this.index) {
            if (!entry.sourceKey || !entry.sourceLabel) continue;

            const existing = map.get(entry.sourceKey);
            if (existing) existing.count += 1;
            else {
                map.set(entry.sourceKey, {
                    key: entry.sourceKey,
                    label: this.getSourceDisplayLabel(entry.sourceKey, entry.sourceLabel),
                    rawLabel: entry.sourceLabel,
                    count: 1,
                });
            }
        }

        this._cachedSourceOptions = Array.from(map.values()).sort((a, b) => COLLATOR.compare(a.label, b.label));
        return this._cachedSourceOptions;
    }

    getSpellLevelOptions() {
        if (this._cachedSpellLevels) return this._cachedSpellLevels;
        const map = new Map();
        for (const entry of this.index) {
            if (entry.typeKey !== "spell" || !entry.spellMeta) continue;
            const { level } = entry.spellMeta;
            if (level == null) continue;
            const key = String(level);
            const existing = map.get(key);
            if (existing) existing.count++;
            else map.set(key, { key, level, label: formatSpellLevel(level), count: 1 });
        }
        this._cachedSpellLevels = Array.from(map.values()).sort((a, b) => a.level - b.level);
        return this._cachedSpellLevels;
    }

    getSpellSchoolOptions() {
        if (this._cachedSpellSchools) return this._cachedSpellSchools;
        const map = new Map();
        for (const entry of this.index) {
            if (entry.typeKey !== "spell" || !entry.spellMeta) continue;
            const { school } = entry.spellMeta;
            if (!school) continue;
            const key = normalizeKey(school);
            const existing = map.get(key);
            if (existing) existing.count++;
            else map.set(key, { key, label: school, count: 1 });
        }
        this._cachedSpellSchools = Array.from(map.values()).sort((a, b) => COLLATOR.compare(a.label, b.label));
        return this._cachedSpellSchools;
    }

    getSpellClassOptions() {
        if (this._cachedSpellClasses) return this._cachedSpellClasses;
        const map = new Map();
        for (const entry of this.index) {
            if (entry.typeKey !== "spell" || !entry.spellMeta) continue;
            for (const cls of entry.spellMeta.classes) {
                const key = normalizeKey(cls);
                const existing = map.get(key);
                if (existing) existing.count++;
                else map.set(key, { key, label: cls, count: 1 });
            }
        }
        this._cachedSpellClasses = Array.from(map.values()).sort((a, b) => COLLATOR.compare(a.label, b.label));
        return this._cachedSpellClasses;
    }

    getCollectionEntries(collectionPath) {
        return this.index
            .filter((entry) => entry.collectionPath === collectionPath)
            .sort((a, b) => compareCollectionEntries(a, b, collectionPath));
    }

    getReaderEntriesForEntry(entry) {
        if (entry.collectionKind && entry.collectionPath) {
            return this.getCollectionEntries(entry.collectionPath);
        }
        return [entry];
    }

    getBookmarkedPaths() {
        return Array.isArray(this.settings.bookmarks) ? [...this.settings.bookmarks] : [];
    }

    isBookmarked(path) {
        return this.getBookmarkedPaths().includes(path);
    }

    async toggleBookmark(path) {
        const current = new Set(this.getBookmarkedPaths());

        if (current.has(path)) {
            current.delete(path);
            // Clean up tag if present
            const tags = Object.assign({}, this.settings.bookmarkTags || {});
            delete tags[path];
            this.settings.bookmarkTags = tags;
        } else {
            current.add(path);
        }

        this.settings.bookmarks = Array.from(current); // preserve insertion order
        await this.saveSettings(false);

        for (const modal of this.activeModals) {
            if (typeof modal.handleBookmarksChanged === "function") {
                modal.handleBookmarksChanged();
            }
        }
    }

    getBookmarkedEntries() {
        const bookmarked = new Set(this.getBookmarkedPaths());
        return this.index.filter((entry) => bookmarked.has(entry.path));
    }

    // Bookmark groups API
    getBookmarkGroups() {
        return Array.isArray(this.settings.bookmarkGroups) ? [...this.settings.bookmarkGroups] : [];
    }

    getBookmarkGroupForPath(path) {
        const tags = this.settings.bookmarkTags || {};
        return tags[path] !== undefined ? tags[path] : null;
    }

    async setBookmarkGroup(path, groupId) {
        const tags = Object.assign({}, this.settings.bookmarkTags || {});
        tags[path] = groupId;
        this.settings.bookmarkTags = tags;
        await this.saveSettings(false);
        for (const modal of this.activeModals) {
            if (typeof modal.handleBookmarksChanged === "function") modal.handleBookmarksChanged();
        }
    }

    async createBookmarkGroup(name) {
        const id = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const groups = this.getBookmarkGroups();
        groups.push({ id, name });
        this.settings.bookmarkGroups = groups;
        await this.saveSettings(false);
        return id;
    }

    async renameBookmarkGroup(id, name) {
        const groups = this.getBookmarkGroups();
        const group = groups.find((g) => g.id === id);
        if (group) group.name = name;
        this.settings.bookmarkGroups = groups;
        await this.saveSettings(false);
        for (const modal of this.activeModals) {
            if (typeof modal.handleBookmarksChanged === "function") modal.handleBookmarksChanged();
        }
    }

    async deleteBookmarkGroup(id) {
        this.settings.bookmarkGroups = this.getBookmarkGroups().filter((g) => g.id !== id);
        // Move all bookmarks in this group back to ungrouped
        const tags = Object.assign({}, this.settings.bookmarkTags || {});
        for (const [path, groupId] of Object.entries(tags)) {
            if (groupId === id) tags[path] = null;
        }
        this.settings.bookmarkTags = tags;
        // Clean up any saved order for this group
        if (this.settings.bookmarkGroupOrder) {
            const order = Object.assign({}, this.settings.bookmarkGroupOrder);
            delete order[id];
            this.settings.bookmarkGroupOrder = order;
        }
        await this.saveSettings(false);
        for (const modal of this.activeModals) {
            if (typeof modal.handleBookmarksChanged === "function") modal.handleBookmarksChanged();
        }
    }

    // Save a custom display order for bookmarks inside a named group
    getBookmarkSortPathForEntry(entry, bookmarkedPaths = null) {
        const bookmarked = bookmarkedPaths || new Set(this.getBookmarkedPaths());
        if (entry && entry.collectionKind && entry.collectionPath && bookmarked.has(entry.collectionPath) && !bookmarked.has(entry.path)) {
            return entry.collectionPath;
        }
        return entry && entry.path ? entry.path : "";
    }

    getBookmarkOrderKey(groupId) {
        return groupId === "ungrouped" ? "__ungrouped" : groupId;
    }

    getBookmarkOrderedPathsForGroup(groupId) {
        const bookmarks = this.getBookmarkedPaths();
        const bookmarkSet = new Set(bookmarks);
        const orderKey = this.getBookmarkOrderKey(groupId);
        const savedOrder = this.getBookmarkGroupOrder(orderKey) || [];
        const inGroup = bookmarks.filter((bookmarkPath) => {
            const assigned = this.getBookmarkGroupForPath(bookmarkPath);
            if (groupId === "ungrouped") return !assigned;
            return assigned === groupId;
        });
        const inGroupSet = new Set(inGroup);
        const ordered = [];
        for (const bookmarkPath of savedOrder) {
            if (bookmarkSet.has(bookmarkPath) && inGroupSet.has(bookmarkPath) && !ordered.includes(bookmarkPath)) ordered.push(bookmarkPath);
        }
        const missing = inGroup.filter((bookmarkPath) => !ordered.includes(bookmarkPath)).sort((a, b) => COLLATOR.compare(a, b));
        return ordered.concat(missing);
    }

    getBookmarkOrderedPathsForViewer(groupId = null) {
        if (groupId !== null) return this.getBookmarkOrderedPathsForGroup(groupId);
        const groups = this.getBookmarkGroups();
        const ordered = [];
        const add = (paths) => {
            for (const p of paths) if (!ordered.includes(p)) ordered.push(p);
        };
        add(this.getBookmarkOrderedPathsForGroup("ungrouped"));
        for (const group of groups) add(this.getBookmarkOrderedPathsForGroup(group.id));
        const all = this.getBookmarkedPaths();
        const missing = all.filter((p) => !ordered.includes(p)).sort((a, b) => COLLATOR.compare(a, b));
        return ordered.concat(missing);
    }

    sortEntriesByBookmarkOrder(entries, groupId = null) {
        const orderedPaths = this.getBookmarkOrderedPathsForViewer(groupId);
        if (!orderedPaths.length) return entries;
        const bookmarked = new Set(this.getBookmarkedPaths());
        const orderMap = new Map();
        orderedPaths.forEach((bookmarkPath, index) => orderMap.set(bookmarkPath, index));
        return [...entries].sort((a, b) => {
            const aPath = this.getBookmarkSortPathForEntry(a, bookmarked);
            const bPath = this.getBookmarkSortPathForEntry(b, bookmarked);
            const aIndex = orderMap.has(aPath) ? orderMap.get(aPath) : Number.MAX_SAFE_INTEGER;
            const bIndex = orderMap.has(bPath) ? orderMap.get(bPath) : Number.MAX_SAFE_INTEGER;
            if (aIndex !== bIndex) return aIndex - bIndex;
            const aLabel = (a && (a.collectionName || a.displayName || a.fileLabel || a.path)) || "";
            const bLabel = (b && (b.collectionName || b.displayName || b.fileLabel || b.path)) || "";
            return COLLATOR.compare(aLabel, bLabel);
        });
    }


    getBookmarkGroupOrder(groupId) {
        const order = this.settings.bookmarkGroupOrder || {};
        return Array.isArray(order[groupId]) ? [...order[groupId]] : null;
    }

    async setBookmarkGroupOrder(groupId, paths) {
        if (!this.settings.bookmarkGroupOrder) this.settings.bookmarkGroupOrder = {};
        this.settings.bookmarkGroupOrder[groupId] = paths;
        await this.saveSettings(false);
    }

    // Persist a new ordering of the groups array (drag reorder)
    async setBookmarkGroupsOrder(groups) {
        this.settings.bookmarkGroups = groups;
        await this.saveSettings(false);
        for (const modal of this.activeModals) {
            if (typeof modal.handleBookmarksChanged === "function") modal.handleBookmarksChanged();
        }
    }

    notifyModals() { for (const modal of this.activeModals) { if (typeof modal.refreshFromPlugin === "function") modal.refreshFromPlugin(); else if (typeof modal.handleBookmarksChanged === "function") modal.handleBookmarksChanged(); } }
    refreshDynamicSourceSuffixes() { ACTIVE_BASENAME_SOURCE_KEYS = buildBasenameSourceKeySet(this.app.vault.getMarkdownFiles()); }
    getSourceChipData(sourceKey) { const data = this.settings.sourceChipData || {}; return data[sourceKey] || {}; }
    getSourceDisplayLabel(sourceKey, fallback) { const data = this.getSourceChipData(sourceKey); return String(data.label || fallback || "").trim(); }
    getSourceChipColor(sourceKey) { return this.getSourceChipData(sourceKey).color || ""; }
    async updateSourceChip(sourceKey, currentLabel, nextLabel, nextColor) { if (!sourceKey) return; if (!this.settings.sourceChipData || typeof this.settings.sourceChipData !== "object") this.settings.sourceChipData = {}; this.settings.sourceChipData[sourceKey] = { label: String(nextLabel || currentLabel || "").trim(), color: String(nextColor || "").trim() }; this._cachedSourceOptions = null; await this.saveSettings(false); this.notifyModals(); }
    async resetSourceChip(sourceKey) { if (this.settings.sourceChipData && this.settings.sourceChipData[sourceKey]) { delete this.settings.sourceChipData[sourceKey]; this._cachedSourceOptions = null; await this.saveSettings(false); this.notifyModals(); } }
    applySourceChipStyle(chipEl, sourceKey) { const color = this.getSourceChipColor(sourceKey); chipEl.classList.add("ttrpg-vs__chip--source"); if (color) chipEl.style.setProperty("--ttrpg-source-color", color); }
    getFilterPresets() { const byType=(t)=>PRESET_SOURCE_ALIASES_5E.filter(([, , type])=>type===t).map(([,label])=>normalizeKey(label)); const coreAdd=["Xanathar's Guide to Everything","Tasha's Cauldron of Everything","Mordenkainen Presents: Monsters of the Multiverse"]; const built=[{id:"core-2014",name:"Core 2014+",sources:["Player's Handbook","Dungeon Master's Guide","Monster Manual",...coreAdd].map(normalizeKey),types:[]},{id:"core-2024",name:"Core 2024+",sources:["Player's Handbook (2024)","Dungeon Master's Guide (2024)","Monster Manual (2024)",...coreAdd].map(normalizeKey),types:[]},{id:"books",name:"Books",sources:byType("book"),types:[normalizeKey("Book")]},{id:"adventures",name:"Adventures",sources:byType("adventure"),types:[normalizeKey("Adventure")]},{id:"spells",name:"Spells",sources:[],types:[normalizeKey("Spell")]}]; const custom=Array.isArray(this.settings.sourceFilterPresets)?this.settings.sourceFilterPresets:[]; return [...built,...custom].filter(p=>p&&p.name); }
    async openReaderNativeTab(entries, initialIndex, searchState) {
        try {
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.setViewState({ type: TTRPG_READER_VIEW_TYPE, active: true });
            if (leaf.view && typeof leaf.view.setReaderState === "function") {
                leaf.view.setReaderState(entries, initialIndex, searchState, "native");
            }
        } catch (err) {
            console.error("TTRPG native-tab open failed; falling back to pop-out reader window", err);
            const leaf = this.app.workspace.getLeaf("window");
            await leaf.setViewState({ type: TTRPG_READER_VIEW_TYPE, active: true });
            if (leaf.view && typeof leaf.view.setReaderState === "function") {
                leaf.view.setReaderState(entries, initialIndex, searchState, "window");
            }
        }
    }
    getSettingsBackupFolder() {
        const folder = String(this.settings.settingsBackupFolder || "TTRPG Search Backups").trim() || "TTRPG Search Backups";
        return normalizePath(folder).replace(/^\/+|\/+$/g, "");
    }

    getSettingsBackupIntervalMs() {
        const hours = Number(this.settings.settingsBackupIntervalHours || 24);
        if (!Number.isFinite(hours) || hours <= 0) return 0;
        return Math.max(0.1, hours) * 60 * 60 * 1000;
    }

    async ensureSettingsBackupFolder() {
        const folder = this.getSettingsBackupFolder();
        if (!folder) return "";
        try {
            const exists = await this.app.vault.adapter.exists(folder);
            if (!exists && this.app.vault.adapter.mkdir) await this.app.vault.adapter.mkdir(folder);
            return folder;
        } catch (error) {
            console.error("TTRPG Search settings backup folder error:", error);
            return "";
        }
    }

    buildSettingsBackupPayload(reason = "scheduled") {
        const settingsCopy = JSON.parse(JSON.stringify(this.settings || {}));
        return {
            format: "ttrpg-vault-search-settings-backup-v1",
            reason,
            createdAt: new Date().toISOString(),
            pluginId: this.manifest && this.manifest.id ? this.manifest.id : "ttrpg-search",
            pluginVersion: this.manifest && this.manifest.version ? this.manifest.version : "",
            indexedEntryCount: Array.isArray(this.index) ? this.index.length : 0,
            settings: settingsCopy,
        };
    }

    async pruneSettingsBackups(folder) {
        const maxFiles = Math.max(0, Number(this.settings.settingsBackupMaxFiles || 30));
        if (!maxFiles || !folder || !this.app.vault.adapter.list) return;
        try {
            const listed = await this.app.vault.adapter.list(folder);
            const files = (listed && Array.isArray(listed.files) ? listed.files : [])
                .filter((file) => /ttrpg-search-settings-.*\.json$/i.test(file))
                .sort();
            const excess = files.length - maxFiles;
            if (excess <= 0) return;
            for (const file of files.slice(0, excess)) {
                try { await this.app.vault.adapter.remove(file); }
                catch (error) { console.warn("TTRPG Search could not remove old settings backup:", file, error); }
            }
        } catch (error) {
            console.warn("TTRPG Search settings backup prune failed:", error);
        }
    }

    async runSettingsBackup(reason = "scheduled", force = false) {
        if (!force && !this.settings.settingsBackupEnabled) return false;
        const intervalMs = this.getSettingsBackupIntervalMs();
        if (!force && !intervalMs) return false;
        const now = Date.now();
        const last = Number(this.settings.settingsBackupLastRun || 0);
        if (!force && last && now - last < intervalMs) return false;

        const folder = await this.ensureSettingsBackupFolder();
        if (!folder) return false;

        const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
        const filePath = normalizePath(folder + "/ttrpg-search-settings-" + stamp + ".json");
        const payload = this.buildSettingsBackupPayload(reason);
        try {
            await this.app.vault.adapter.write(filePath, JSON.stringify(payload, null, 2));
            this.settings.settingsBackupLastRun = now;
            // Save only the timestamp. Do not rebuild or notify modals.
            await this.saveData(this.settings);
            await this.pruneSettingsBackups(folder);
            return true;
        } catch (error) {
            console.error("TTRPG Search settings backup failed:", error);
            return false;
        }
    }
    async getSettingsBackupFiles() {
        const folder = this.getSettingsBackupFolder();
        if (!folder || !this.app.vault.adapter.list) return [];
        try {
            const exists = await this.app.vault.adapter.exists(folder);
            if (!exists) return [];
            const listed = await this.app.vault.adapter.list(folder);
            const files = (listed && Array.isArray(listed.files) ? listed.files : [])
                .filter((file) => /ttrpg-search-settings-.*\.json$/i.test(file))
                .sort()
                .reverse();
            const out = [];
            for (const file of files) {
                let meta = { path: file, createdAt: "", reason: "", indexedEntryCount: null, pluginVersion: "" };
                try {
                    const raw = await this.app.vault.adapter.read(file);
                    const parsed = JSON.parse(raw);
                    meta.createdAt = parsed.createdAt || "";
                    meta.reason = parsed.reason || "";
                    meta.indexedEntryCount = parsed.indexedEntryCount ?? null;
                    meta.pluginVersion = parsed.pluginVersion || "";
                    meta.hasSettings = !!(parsed && typeof parsed === "object" && parsed.settings && typeof parsed.settings === "object");
                } catch (error) {
                    meta.error = String(error && error.message ? error.message : error);
                    meta.hasSettings = false;
                }
                out.push(meta);
            }
            return out;
        } catch (error) {
            console.error("TTRPG Search could not list settings backups:", error);
            return [];
        }
    }

    async restoreSettingsBackup(filePath) {
        const cleanPath = normalizePath(String(filePath || ""));
        if (!cleanPath) throw new Error("No backup file selected.");
        const raw = await this.app.vault.adapter.read(cleanPath);
        const parsed = JSON.parse(raw);
        const restoredSettings = parsed && parsed.settings && typeof parsed.settings === "object" ? parsed.settings : null;
        if (!restoredSettings) throw new Error("Backup does not contain a valid settings object.");

        // Safety copy of the current live settings before overwriting them.
        await this.runSettingsBackup("pre-restore", true);

        this.settings = Object.assign({}, DEFAULT_SETTINGS, restoredSettings);
        await this.saveData(this.settings);
        this.refreshConfiguredFolders();
        this.refreshCustomMaps();
        this.buildIndex(false);
        this.notifyModals();
        return true;
    }



    startSettingsBackupScheduler() {
        const check = () => {
            window.setTimeout(() => {
                this.runSettingsBackup("scheduled", false).catch((error) => console.error("TTRPG Search scheduled settings backup failed:", error));
            }, 0);
        };
        this.registerInterval(window.setInterval(check, 60 * 60 * 1000));
        window.setTimeout(check, 15000);
    }



    startApplicatorReloadWatcher() {
        const pluginId = this.manifest && this.manifest.id ? this.manifest.id : "ttrpg-search";
        const markerPath = `${this.app.vault.configDir}/plugins/${pluginId}/.reload-plugin`;

        this.registerInterval(window.setInterval(async () => {
            try {
                const exists = await this.app.vault.adapter.exists(markerPath);
                if (!exists) return;

                await this.app.vault.adapter.remove(markerPath);
                await this.reloadThisPluginFromApplicator();
            } catch (error) {
                console.error("TTRPG Search reload watcher failed:", error);
            }
        }, 1000));
    }

    async reloadThisPluginFromApplicator() {
        const pluginId = this.manifest && this.manifest.id ? this.manifest.id : "ttrpg-search";
        new Notice("Reloading TTRPG Search plugin…");

        window.setTimeout(async () => {
            try {
                await this.app.plugins.disablePlugin(pluginId);
                await this.app.plugins.enablePlugin(pluginId);
                new Notice("TTRPG Search plugin reloaded.");
            } catch (error) {
                console.error("Failed to reload TTRPG Search plugin:", error);
                new Notice("Failed to reload TTRPG Search plugin. Check console.");
            }
        }, 150);
    }

    registerTTRPGSearchEmbeds() {
        this.registerMarkdownCodeBlockProcessor("TTRPG_Search", (source, el, ctx) => this.renderTTRPGSearchEmbed(source, el, ctx));
        this.registerMarkdownCodeBlockProcessor("ttrpg_search", (source, el, ctx) => this.renderTTRPGSearchEmbed(source, el, ctx));
        this.registerMarkdownCodeBlockProcessor("TTRPGSEARCH", (source, el, ctx) => this.renderTTRPGSearchEmbed(source, el, ctx));
        this.registerMarkdownCodeBlockProcessor("ttrpgsearch", (source, el, ctx) => this.renderTTRPGSearchEmbed(source, el, ctx));
        this.registerMarkdownPostProcessor((el, ctx) => this.processTTRPGSearchInlineEmbeds(el, ctx));
        if (typeof EditorSuggest !== "undefined") this.registerEditorSuggest(new TTRPGSearchEmbedSuggest(this.app, this));
    }

    getTTRPGSearchEmbedTypes() {
        const map = new Map(); const add = (label) => map.set(normalizeKey(label), { key: label, label });
        add("Any"); add("Search");
        for (const option of (this.getTypeOptions ? this.getTypeOptions() : [])) if (option && option.label) add(option.label);
        for (const label of ["Book", "Adventure", "Item", "Spell", "Monster", "Creature", "NPC", "Feat", "Class", "Subclass", "Background", "Race", "Species", "Condition", "Rule", "Table", "Vehicle"]) add(label);
        return Array.from(map.values()).sort((a, b) => COLLATOR.compare(a.label, b.label));
    }

    getTTRPGSearchButtonColours() {
        return [
            { key: "Accent", label: "Accent", value: "" }, { key: "Red", label: "Red", value: "#ef4444" }, { key: "Orange", label: "Orange", value: "#f97316" },
            { key: "Amber", label: "Amber", value: "#f59e0b" }, { key: "Yellow", label: "Yellow", value: "#eab308" }, { key: "Green", label: "Green", value: "#22c55e" },
            { key: "Teal", label: "Teal", value: "#14b8a6" }, { key: "Blue", label: "Blue", value: "#3b82f6" }, { key: "Purple", label: "Purple", value: "#a855f7" },
            { key: "Pink", label: "Pink", value: "#ec4899" }, { key: "Slate", label: "Slate", value: "#64748b" },
        ];
    }

    resolveTTRPGSearchButtonColour(raw) {
        const text = String(raw || "").trim(); if (!text || normalizeKey(text) === "accent" || normalizeKey(text) === "default") return "";
        if (/^#[0-9a-f]{6}$/i.test(text)) return text;
        const found = this.getTTRPGSearchButtonColours().find((c) => normalizeKey(c.key) === normalizeKey(text) || normalizeKey(c.label) === normalizeKey(text)); return found ? found.value : "";
    }

    parseTTRPGSearchEmbedSpec(raw) {
        if (raw && typeof raw === "object") return { type: raw.type || "Any", name: raw.name || "", chapter: raw.chapter || "", chapterPath: raw.chapterPath || raw.chapterpath || "", colour: raw.colour || raw.color || "" };
        const text = String(raw || "").trim();
        const typeLine = text.match(/^\s*Type\s*:\s*(.*?)\s*$/im); const nameLine = text.match(/^\s*Name\s*:\s*(.*?)\s*$/im);
        const chapterLine = text.match(/^\s*Chapter\s*:\s*(.*?)\s*$/im); const chapterPathLine = text.match(/^\s*ChapterPath\s*:\s*(.*?)\s*$/im);
        const colourLine = text.match(/^\s*(?:Colour|Color)\s*:\s*(.*?)\s*$/im);
        if (typeLine || nameLine || chapterLine || chapterPathLine || colourLine) return { type: (typeLine && typeLine[1].trim()) || "Any", name: (nameLine && nameLine[1].trim()) || "", chapter: (chapterLine && chapterLine[1].trim()) || "", chapterPath: (chapterPathLine && chapterPathLine[1].trim()) || "", colour: (colourLine && colourLine[1].trim()) || "" };
        let compact = text.replace(/^`+|`+$/g, "").trim(); compact = compact.replace(/^TTRPGSEARCH\s*:?/i, "").trim(); compact = compact.replace(/^TTRPG[_-]?/i, "").trim(); compact = compact.replace(/^[:=_-]+/, "").trim();
        if (!compact) return { type: "Any", name: "", chapter: "", chapterPath: "", colour: "" };
        const colonMatch = compact.match(/^([^:]+):(.+?)(?::([^:]+))?(?::([^:]+))?:?$/);
        if (colonMatch) return { type: String(colonMatch[1] || "Any").trim() || "Any", name: String(colonMatch[2] || "").trim(), chapter: String(colonMatch[3] || "").trim(), chapterPath: "", colour: String(colonMatch[4] || "").trim() };
        return { type: "Any", name: compact, chapter: "", chapterPath: "", colour: "" };
    }

    isTTRPGBookOrAdventureType(type) { const key = normalizeKey(type); return key === "book" || key === "adventure" || key === "books" || key === "adventures"; }
    getFirstChapterForCollection(collectionPath) {
        // Historical name retained for compatibility. This intentionally returns
        // the first entry in the exact same collection order used by the reader/popout.
        const entries = this.getCollectionEntries(collectionPath);
        return entries.length ? entries[0] : null;
    }
    findTTRPGSearchCollectionEntry(type, name) {
        const q = String(name || "").trim();
        if (!q) return null;
        const typeKey = normalizeKey(type || "Any");
        const qKey = normalizeKey(q);
        let entries = this.getEntries ? this.getEntries() : (this.index || []);
        if (typeKey && !["any", "search", "all"].includes(typeKey)) {
            entries = entries.filter((entry) => normalizeKey(entry.typeLabel) === typeKey || normalizeKey(entry.typeKey) === typeKey);
        }

        const byCollection = new Map();
        for (const entry of entries) {
            if (!entry.collectionPath || !entry.collectionName) continue;
            if (!byCollection.has(entry.collectionPath)) byCollection.set(entry.collectionPath, entry);
        }
        const collections = Array.from(byCollection.values());
        if (!collections.length) return null;

        const exact = collections.find((entry) => normalizeKey(entry.collectionName) === qKey);
        if (exact) return exact;

        const starts = collections.filter((entry) => normalizeKey(entry.collectionName).startsWith(qKey));
        if (starts.length) return starts.sort((a, b) => COLLATOR.compare(a.collectionName, b.collectionName))[0];

        const contains = collections.filter((entry) => String(entry.collectionName || "").toLowerCase().includes(q.toLowerCase()));
        if (contains.length) return contains.sort((a, b) => COLLATOR.compare(a.collectionName, b.collectionName))[0];

        // Cheap fuzzy fallback against collection names only. Never score chapter names/paths here.
        const scored = collections
            .map((entry) => ({ entry, score: scoreTextField(String(entry.collectionName || ""), q.toLowerCase(), 1000) }))
            .filter((item) => item.score !== Number.NEGATIVE_INFINITY)
            .sort((a, b) => b.score - a.score || COLLATOR.compare(a.entry.collectionName, b.entry.collectionName));
        return scored.length ? scored[0].entry : null;
    }

    getTTRPGSearchChapterByPath(collectionPath, chapterPath) {
        const cleanPath = String(chapterPath || "").trim();
        if (!cleanPath || !collectionPath) return null;
        const entry = this.getEntryByPath ? this.getEntryByPath(cleanPath) : null;
        if (!entry) return null;
        return entry.collectionPath === collectionPath ? entry : null;
    }
    getTTRPGSearchButtonCandidates(type, query = "") {
        const q = String(query || "").trim();
        const typeKey = normalizeKey(type || "Any");
        let entries = this.getEntries ? this.getEntries() : (this.index || []);
        if (typeKey && !["any", "search", "all"].includes(typeKey)) {
            entries = entries.filter((entry) => normalizeKey(entry.typeLabel) === typeKey || normalizeKey(entry.typeKey) === typeKey);
        }

        if (this.isTTRPGBookOrAdventureType(type)) {
            const byCollection = new Map();
            for (const entry of entries) {
                if (!entry.collectionPath || !entry.collectionName) continue;
                if (!byCollection.has(entry.collectionPath)) byCollection.set(entry.collectionPath, entry);
            }
            return Array.from(byCollection.values())
                .map((entry) => {
                    const label = entry.collectionName;
                    let score = 100;
                    if (q) {
                        const lowerLabel = String(label || "").toLowerCase();
                        score = lowerLabel.includes(q.toLowerCase()) ? 500 : scoreTextField(label, q.toLowerCase(), 1000);
                    }
                    return { entry, label, score };
                })
                .filter((item) => !q || item.score !== Number.NEGATIVE_INFINITY)
                .sort((a, b) => b.score - a.score || COLLATOR.compare(a.label, b.label));
        }

        const seen = new Set();
        const out = [];
        for (const entry of entries) {
            const label = entry.displayName || entry.fileLabel || entry.collectionName || entry.path;
            const key = normalizeKey(label);
            if (!label || seen.has(key)) continue;
            const score = q ? scoreEntry(entry, q, false) : 100;
            if (q && score < 0) continue;
            seen.add(key);
            out.push({ entry, label, score });
        }
        return out.sort((a, b) => b.score - a.score || COLLATOR.compare(a.label, b.label));
    }

    getTTRPGSearchChapterCandidates(type, name, query = "") {
        const base = this.findTTRPGSearchCollectionEntry(type || "Any", name || "");
        if (!base || !base.collectionPath) return [];
        const q = String(query || "").trim();
        const chapters = this.getCollectionEntries(base.collectionPath).filter((entry) => !entry.isOverview);
        const counts = new Map();
        for (const entry of chapters) {
            const baseLabel = entry.displayName || entry.fileLabel || entry.path;
            const key = normalizeKey(baseLabel);
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        return chapters
            .map((entry) => {
                const baseLabel = entry.displayName || entry.fileLabel || entry.path;
                const key = normalizeKey(baseLabel);
                const rel = entry.collectionPath ? relativePathWithinFolder(entry.path, entry.collectionPath).replace(/\.md$/i, "") : entry.path;
                const folderContext = rel.split("/").slice(0, -1).map(formatTitle).filter(Boolean).join(" / " );
                const label = counts.get(key) > 1 ? (folderContext ? baseLabel + " — " + folderContext : baseLabel + " — " + rel) : baseLabel;
                const score = q ? Math.max(scoreEntry(entry, q, false), label.toLowerCase().includes(q.toLowerCase()) ? 80 : -1) : 100;
                return { entry, label, baseLabel, path: entry.path, score };
            })
            .filter((item) => !q || item.score >= 0)
            .sort((a, b) => b.score - a.score || COLLATOR.compare(a.label, b.label));
    }

    processTTRPGSearchInlineEmbeds(rootEl, ctx) { const codeEls = Array.from(rootEl.querySelectorAll("code")); for (const codeEl of codeEls) { const text = String(codeEl.textContent || "").trim(); const classBlob = String(codeEl.className || "").toLowerCase(); if (!/^TTRPG(?:SEARCH)?[_:-]/i.test(text) && !classBlob.includes("language-ttrpg")) continue; const host = codeEl.closest("pre") || codeEl; const replacement = document.createElement("span"); this.renderTTRPGSearchEmbed(text, replacement, ctx); host.replaceWith(replacement); } }
    renderTTRPGSearchEmbed(source, el, ctx) {
        const spec = this.parseTTRPGSearchEmbedSpec(source);
        if (el.empty) el.empty();
        el.classList.add("ttrpg-search-embed");

        const isCollectionButton = this.isTTRPGBookOrAdventureType(spec.type) && spec.name;
        // Avoid resolving collection buttons during Markdown render; resolving many buttons was a major lag source.
        const resolved = isCollectionButton ? null : this.findBestEntryForTTRPGSearchEmbed(spec);
        const title = isCollectionButton ? spec.name : (resolved ? (resolved.displayName || resolved.fileLabel || resolved.collectionName || resolved.path) : spec.name);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "ttrpg-vs__toolbutton ttrpg-search-embed__button";
        button.disabled = false;
        button.style.cursor = "pointer";
        const colour = this.resolveTTRPGSearchButtonColour(spec.colour || spec.color || "");
        if (colour) button.style.setProperty("--ttrpg-search-button-colour", colour);
        button.textContent = title ? ("Open: " + title) : "Open TTRPG Search";
        button.title = title ? ("Open " + title + (spec.chapter ? (" — " + spec.chapter) : "") + " in a new reader tab") : "Open TTRPG Search";
        button.dataset.ttrpgSearchType = spec.type || "Any";
        button.dataset.ttrpgSearchName = spec.name || "";
        button.dataset.ttrpgSearchChapter = spec.chapter || "";
        button.dataset.ttrpgSearchChapterPath = spec.chapterPath || "";
        button.dataset.ttrpgSearchColour = spec.colour || "";
        button.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await this.openTTRPGSearchEmbedTarget(spec);
        });
        el.appendChild(button);
    }
    findBestEntryForTTRPGSearchEmbed(specOrQuery) {
        const spec = this.parseTTRPGSearchEmbedSpec(specOrQuery);
        const q = String(spec.name || "").trim();
        if (!q) return null;
        const typeKey = normalizeKey(spec.type || "Any");
        let entries = this.getEntries ? this.getEntries() : (this.index || []);
        if (typeKey && !["any", "search", "all"].includes(typeKey)) {
            entries = entries.filter((entry) => normalizeKey(entry.typeLabel) === typeKey || normalizeKey(entry.typeKey) === typeKey);
        }

        if (this.isTTRPGBookOrAdventureType(spec.type)) {
            const collectionEntry = this.findTTRPGSearchCollectionEntry(spec.type, q);
            if (!collectionEntry || !collectionEntry.collectionPath) return null;
            const collectionPath = collectionEntry.collectionPath;

            const exactPath = this.getTTRPGSearchChapterByPath(collectionPath, spec.chapterPath);
            if (exactPath) return exactPath;

            const chapter = String(spec.chapter || "").trim();
            if (chapter) {
                const chapters = this.getCollectionEntries(collectionPath).filter((entry) => !entry.isOverview);
                const chapterKey = normalizeKey(chapter);
                const exactChapter = chapters.find((entry) => normalizeKey(entry.displayName) === chapterKey || normalizeKey(entry.fileLabel) === chapterKey);
                if (exactChapter) return exactChapter;
                const scoredChapter = chapters
                    .map((entry) => ({ entry, score: scoreEntry(entry, chapter, false) }))
                    .filter((item) => item.score >= 0)
                    .sort((a, b) => b.score - a.score || COLLATOR.compare(a.entry.displayName, b.entry.displayName))[0];
                if (scoredChapter) return scoredChapter.entry;
            }

            // Default target is exactly the first entry in the reader's collection order.
            return this.getFirstChapterForCollection(collectionPath) || collectionEntry;
        }

        const qKey = normalizeKey(q);
        const exact = entries.find((entry) => normalizeKey(entry.displayName) === qKey || normalizeKey(entry.collectionName) === qKey || normalizeKey(entry.fileLabel) === qKey);
        if (exact) return exact;
        const scored = entries
            .map((entry) => ({ entry, score: scoreEntry(entry, q, false) }))
            .filter((item) => item.score >= 0)
            .sort((a, b) => b.score - a.score || COLLATOR.compare(a.entry.displayName, b.entry.displayName));
        return scored.length ? scored[0].entry : null;
    }

    async openTTRPGSearchEmbedTarget(specOrQuery) { const spec = this.parseTTRPGSearchEmbedSpec(specOrQuery); const q = String(spec.name || "").trim(); if (!q) { if (typeof this.openSearchPopout === "function") await this.openSearchPopout({ query: "", forceModal: false }); else if (typeof this.openSearchModal === "function") this.openSearchModal({ query: "", forceModal: true }); return; } const entry = this.findBestEntryForTTRPGSearchEmbed(spec); if (!entry) { new Notice("No " + (spec.type || "TTRPG") + " entry found for: " + q); if (typeof this.openSearchPopout === "function") await this.openSearchPopout({ query: q, forceModal: false }); return; } let entries = []; let initialIndex = 0; if (entry.collectionKind && entry.collectionPath) { entries = this.getCollectionEntries(entry.collectionPath); initialIndex = Math.max(0, entries.findIndex((candidate) => candidate.path === entry.path)); } else { entries = this.getReaderEntriesForEntry(entry); initialIndex = Math.max(0, entries.findIndex((candidate) => candidate.path === entry.path)); } const state = { query: q, selectedTypes: spec.type ? [normalizeKey(spec.type)] : [], selectedSources: [], selectedIndex: initialIndex, scrollTop: 0 }; if (typeof this.openReaderNativeTab === "function") { try { await this.openReaderNativeTab(entries, initialIndex, state); return; } catch (error) { console.warn("TTRPG Search button native tab open failed; falling back", error); } } if (typeof this.openReaderPopout === "function") await this.openReaderPopout(entries, initialIndex, state); else new TTRPGReaderModal(this.app, this, entries, initialIndex, state).open(); }

    buildIndex(showNotice) {
        this.refreshConfiguredFolders();
        this.refreshCustomMaps();
        this.refreshDynamicSourceSuffixes();

        const nextMap = new Map();
        for (const file of this.app.vault.getMarkdownFiles()) {
            const entry = this.buildEntry(file);
            if (entry) nextMap.set(file.path, entry);
        }

        this.entryMap = nextMap;
        this.publishIndex();

        if (showNotice) {
            new Notice(`TTRPG Vault Search indexed ${this.index.length} files.`);
        }
    }

    publishIndex() {
        this.index = Array.from(this.entryMap.values()).sort((a, b) => {
            const collectionWeightA = a.collectionKind ? 0 : 1;
            const collectionWeightB = b.collectionKind ? 0 : 1;

            return (
                collectionWeightA - collectionWeightB ||
                COLLATOR.compare(a.collectionName || a.displayName, b.collectionName || b.displayName) ||
                COLLATOR.compare(a.displayName, b.displayName) ||
                COLLATOR.compare(a.path, b.path)
            );
        });

        // Invalidate all cached option lists
        this._cachedTypeOptions     = null;
        this._cachedSourceOptions   = null;
        this._cachedSpellLevels     = null;
        this._cachedSpellSchools    = null;
        this._cachedSpellClasses    = null;

        for (const modal of this.activeModals) {
            if (typeof modal.refreshFromPlugin === "function") modal.refreshFromPlugin();
        }
    }

    scheduleRefresh(file) {
        if (!(file instanceof TFile)) return;
        if (file.extension !== "md") return;

        this.pendingPaths.add(file.path);
        this.flushPendingUpdates();
    }

    scheduleRemove(file) {
        if (!(file instanceof TFile)) return;
        if (file.extension !== "md") return;

        this.pendingPaths.add(file.path);
        this.flushPendingUpdates();
    }

    handleRename(file, oldPath) {
        if (!(file instanceof TFile)) return;
        if (file.extension !== "md") return;

        this.pendingPaths.add(oldPath);
        this.pendingPaths.add(file.path);
        this.flushPendingUpdates();
    }

    applyPendingUpdates() {
        if (!this.pendingPaths.size) return;

        this.refreshConfiguredFolders();
        this.refreshCustomMaps();
        this.refreshDynamicSourceSuffixes();

        const changedPaths = Array.from(this.pendingPaths);
        this.pendingPaths.clear();

        let changed = false;

        for (const path of changedPaths) {
            const file = this.app.vault.getAbstractFileByPath(path);

            if (file instanceof TFile && file.extension === "md") {
                const nextEntry = this.buildEntry(file);
                const previousEntry = this.entryMap.get(file.path);

                if (nextEntry) {
                    if (!previousEntry || !entriesEqual(previousEntry, nextEntry)) {
                        this.entryMap.set(file.path, nextEntry);
                        changed = true;
                    }
                } else if (this.entryMap.delete(file.path)) {
                    changed = true;
                }

                if (path !== file.path && this.entryMap.delete(path)) {
                    changed = true;
                }
            } else if (this.entryMap.delete(path)) {
                changed = true;
            }
        }

        if (changed) this.publishIndex();
    }

    buildEntry(file) {
        if (isHiddenPath(file.path)) return null;
        if (!isWithinConfiguredFolders(file.path, this.configuredFolders)) return null;

        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = indexFrontmatter(fileCache && fileCache.frontmatter);

        const inferredType = extractType(frontmatter, file.path);
        const collectionInfo = inferCollectionInfo(file.path);

        const explicitSourceRaw = extractExplicitSource(frontmatter);
        const taggedSourceRaw = extractSourceFromTags(fileCache, frontmatter, this.settings.spellTagPrefix || "ttrpg-cli");
        const pathSourceRaw = inferSourceFromPath(
            file.path,
            inferredType,
            this.configuredFolderKeys,
            collectionInfo
        );
        const basenameSourceRaw = inferSourceFromBasename(file.basename);

        const inferredSourceLabel =
            resolveSourceLabel(explicitSourceRaw) ||
            resolveSourceLabel(taggedSourceRaw) ||
            resolveSourceLabel(basenameSourceRaw) ||
            resolveSourceLabel(pathSourceRaw) ||
            (collectionInfo ? collectionInfo.name : "");
        const forcedSourceRaw = findForcedSourceOverride(file.path, inferredType, inferredSourceLabel, file.basename);
        const sourceLabel = resolveSourceLabel(forcedSourceRaw) || inferredSourceLabel;

        const parsed = parseBasenameDetails(
            file.basename,
            inferredType,
            explicitSourceRaw || taggedSourceRaw || basenameSourceRaw || pathSourceRaw || ""
        );

        let displayName = extractDisplayName(frontmatter) || parsed.name || formatTitle(file.basename);
        let isOverview =
            parsed.isOverview ||
            isOverviewBasename(file.basename) ||
            normalizeKey(displayName) === normalizeKey("Overview");

        if (collectionInfo) {
            displayName = stripCollectionPrefix(displayName, collectionInfo.name);

            if (
                normalizeKey(displayName) === normalizeKey(collectionInfo.name) ||
                !displayName.trim()
            ) {
                displayName = "Overview";
                isOverview = true;
            }
        }

        if (!this.configuredFolders.length && !inferredType && !sourceLabel && !collectionInfo) {
            return null;
        }

        const typeLabel = inferredType || "Other";
        const typeKey = normalizeKey(typeLabel);
        const fileLabel = parsed.name || displayName;
        const aliases = extractAliases(frontmatter);

        // Spell-specific metadata (only populated when type is Spell)
        let spellMeta = null;
        if (typeKey === "spell") {
            // Collect all tags: from the metadata cache (includes inline) + frontmatter array
            const cacheTags = fileCache?.tags ? fileCache.tags.map((tc) => tc.tag.replace(/^#/, "")) : [];
            const fmTagsRaw = Array.isArray(frontmatter?.tags) ? frontmatter.tags : [];
            const fmTags = fmTagsRaw.map((t) => String(t).replace(/^#/, "")).filter(Boolean);
            const allTags = [...new Set([...cacheTags, ...fmTags])];

            // Prefix for ttrpg-cli tag hierarchy, e.g. "ttrpg-cli/spell/school/Evocation"
            const tagBase = ((this.settings.spellTagPrefix || "ttrpg-cli") + "/spell/").toLowerCase();

            // Get single value after a sub-prefix, preserving original case
            const getTagVal = (subPrefix) => {
                const full = tagBase + subPrefix.toLowerCase();
                for (const tag of allTags) {
                    if (tag.toLowerCase().startsWith(full)) {
                        const val = tag.slice(full.length).trim();
                        if (val) return val;
                    }
                }
                return null;
            };
            // Get ALL values matching a sub-prefix (for multi-value fields like class)
            const getTagVals = (subPrefix) => {
                const full = tagBase + subPrefix.toLowerCase();
                const results = [];
                for (const tag of allTags) {
                    if (tag.toLowerCase().startsWith(full)) {
                        const val = tag.slice(full.length).trim();
                        if (val) results.push(val);
                    }
                }
                return results;
            };
            // Check for boolean-presence tag (no trailing value needed)
            const hasTag = (subSuffix) =>
                allTags.some((t) => t.toLowerCase() === tagBase + subSuffix.toLowerCase().replace(/\/$/, ""));

            // Extract from tags first, fall back to frontmatter
            const levelFromTag  = getTagVal("level/");
            const schoolFromTag = getTagVal("school/");
            const classesFromTags = getTagVals("class/").map((c) => formatTitle(c)).filter(Boolean);

            const levelRaw  = levelFromTag  ?? getFrontmatterValue(frontmatter, "level", "spell_level", "spelllevel");
            const schoolRaw = schoolFromTag ?? readString(getFrontmatterValue(frontmatter, "school"));
            const classesFromFM = readStringArray(getFrontmatterValue(frontmatter, "class", "classes", "for_class", "casting_class"))
                .map((c) => formatTitle(c)).filter(Boolean);

            const ritualRaw        = getFrontmatterValue(frontmatter, "ritual", "israitual", "is_ritual");
            const concentrationRaw = getFrontmatterValue(frontmatter, "concentration", "isconcentration", "is_concentration", "duration", "time", "traits", "properties");
            const toBool = (v) => v === true || String(v || "").toLowerCase() === "true" || String(v || "").toLowerCase() === "yes";

            const spellLevel   = parseSpellLevel(levelRaw);
            const spellSchool  = schoolRaw ? formatTitle(String(schoolRaw)) : null;
            const spellClasses = classesFromTags.length ? classesFromTags : classesFromFM;

            spellMeta = {
                level:         spellLevel,
                school:        spellSchool,
                classes:       spellClasses,
                ritual:        hasTag("ritual") || hasTag("tag/ritual") || toBool(ritualRaw),
                concentration: hasTag("concentration") || hasTag("tag/concentration") || hasTag("trait/concentration") || tagContains(fileCache, frontmatter, "concentration") || toBool(concentrationRaw) || valueContainsText(concentrationRaw, "concentration"),
            };
        }

        const entry = {
            file,
            path: file.path,
            pathLower: file.path.toLowerCase(),

            displayName,
            displayNameLower: displayName.toLowerCase(),

            fileLabel,
            fileLabelLower: fileLabel.toLowerCase(),

            typeLabel,
            typeKey,

            sourceLabel,
            sourceKey: sourceLabel ? normalizeKey(sourceLabel) : "",

            aliases,
            aliasesBlob: aliases.join(" ").toLowerCase(),

            collectionName: collectionInfo ? collectionInfo.name : "",
            collectionPath: collectionInfo ? collectionInfo.path : "",
            collectionKind: collectionInfo ? collectionInfo.kind : "",
            isOverview,

            spellMeta,

            searchBlob: "",
        };

        entry.searchBlob = buildSearchBlob(entry);
        return entry;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(rebuild = true) {
        await this.saveData(this.settings);
        if (rebuild) {
            this.refreshConfiguredFolders();
            this.refreshCustomMaps();
            this.buildIndex(false);
        }
    }
}

class SourceChipEditModal extends Modal {
    constructor(app, plugin, sourceKey, currentLabel) { super(app); this.plugin = plugin; this.sourceKey = sourceKey; this.currentLabel = currentLabel; }
    onOpen() { this.modalEl.classList.add("ttrpg-vs-source-modal"); this.titleEl.setText("Edit Source Chip"); this.contentEl.empty(); const data=this.plugin.getSourceChipData(this.sourceKey); const wrap=this.contentEl.createDiv({cls:"ttrpg-vs-source"}); const labelRow=wrap.createDiv({cls:"ttrpg-vs-source-edit__row"}); labelRow.createDiv({cls:"ttrpg-vs__label", text:"Chip text (can duplicate another source without merging filters)"}); const labelInput=labelRow.createEl("input",{cls:"ttrpg-vs-source-edit__input"}); labelInput.type="text"; labelInput.value=data.label||this.currentLabel||""; const colorRow=wrap.createDiv({cls:"ttrpg-vs-source-edit__row"}); colorRow.createDiv({cls:"ttrpg-vs__label", text:"Chip colour"}); const colorInput=colorRow.createEl("input",{cls:"ttrpg-vs-source-edit__input"}); colorInput.type="color"; colorInput.value=/^#[0-9a-f]{6}$/i.test(data.color||"")?data.color:"#7c3aed"; const buttons=wrap.createDiv({cls:"ttrpg-vs__button-row"}); const saveBtn=buttons.createEl("button",{cls:"ttrpg-vs__toolbutton", text:"Save"}); saveBtn.type="button"; saveBtn.addEventListener("click", async()=>{ await this.plugin.updateSourceChip(this.sourceKey,this.currentLabel,labelInput.value,colorInput.value); this.close(); }); const resetBtn=buttons.createEl("button",{cls:"ttrpg-vs__toolbutton", text:"Reset"}); resetBtn.type="button"; resetBtn.addEventListener("click", async()=>{ await this.plugin.resetSourceChip(this.sourceKey); this.close(); }); window.setTimeout(()=>labelInput.focus(),0); }
}



class TTRPGConfirmModal extends Modal {
    constructor(app, title, message, confirmText, cancelText, onResult) {
        super(app);
        this.confirmTitle = title || "Confirm";
        this.message = message || "";
        this.confirmText = confirmText || "Confirm";
        this.cancelText = cancelText || "Cancel";
        this.onResult = typeof onResult === "function" ? onResult : (() => {});
        this.resolved = false;
    }
    resolve(value) {
        if (this.resolved) return;
        this.resolved = true;
        try { this.onResult(!!value); } catch (error) { console.error("TTRPG confirm callback failed:", error); }
    }
    onOpen() {
        this.modalEl.classList.add("ttrpg-vs-source-modal");
        this.titleEl.setText(this.confirmTitle);
        this.contentEl.empty();
        const wrap = this.contentEl.createDiv({ cls: "ttrpg-vs-source" });
        wrap.createDiv({ cls: "ttrpg-vs__label", text: this.message });
        const buttons = wrap.createDiv({ cls: "ttrpg-vs__button-row" });
        const cancelBtn = buttons.createEl("button", { cls: "ttrpg-vs__toolbutton", text: this.cancelText });
        cancelBtn.type = "button";
        cancelBtn.addEventListener("click", () => { this.resolve(false); this.close(); });
        const confirmBtn = buttons.createEl("button", { cls: "ttrpg-vs__toolbutton", text: this.confirmText });
        confirmBtn.type = "button";
        confirmBtn.addEventListener("click", () => { this.resolve(true); this.close(); });
        window.setTimeout(() => confirmBtn.focus(), 0);
    }
    onClose() {
        this.resolve(false);
    }
}
function ttrpgConfirm(app, title, message, confirmText = "Confirm", cancelText = "Cancel") {
    return new Promise((resolve) => {
        new TTRPGConfirmModal(app, title, message, confirmText, cancelText, resolve).open();
    });
}

class SettingsBackupRestoreModal extends Modal {
    constructor(app, plugin) { super(app); this.plugin = plugin; }
    async onOpen() {
        this.modalEl.classList.add("ttrpg-vs-source-modal");
        this.titleEl.setText("Restore TTRPG Search Backup");
        this.contentEl.empty();
        const wrap = this.contentEl.createDiv({ cls: "ttrpg-vs-source" });
        wrap.createDiv({ cls: "ttrpg-vs__label", text: "Loading backups…" });
        const backups = await this.plugin.getSettingsBackupFiles();
        wrap.empty();
        const info = wrap.createDiv({ cls: "ttrpg-vs__label" });
        info.setText("Choose a backup to restore. A safety backup of the current settings is created before restore. Restore replaces plugin settings/bookmarks/customisations, then rebuilds the index.");
        if (!backups.length) {
            wrap.createDiv({ cls: "ttrpg-vs__empty", text: "No backups found in: " + this.plugin.getSettingsBackupFolder() });
            const buttons = wrap.createDiv({ cls: "ttrpg-vs__button-row" });
            const closeBtn = buttons.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Close" });
            closeBtn.type = "button";
            closeBtn.addEventListener("click", () => this.close());
            return;
        }
        for (const backup of backups) {
            const row = wrap.createDiv({ cls: "ttrpg-vs-source__item" });
            row.style.display = "flex";
            row.style.flexDirection = "column";
            row.style.gap = "6px";
            const name = row.createDiv({ cls: "ttrpg-vs-source__name" });
            const created = backup.createdAt ? new Date(backup.createdAt).toLocaleString() : "Unknown date";
            name.setText(created + (backup.reason ? " • " + backup.reason : ""));
            const meta = row.createDiv({ cls: "ttrpg-vs__meta-text" });
            meta.setText(backup.path + (backup.indexedEntryCount != null ? " • " + backup.indexedEntryCount + " indexed entries" : "") + (backup.pluginVersion ? " • v" + backup.pluginVersion : ""));
            if (backup.error || !backup.hasSettings) {
                const err = row.createDiv({ cls: "ttrpg-vs__meta-text" });
                err.setText("Cannot restore: " + (backup.error || "no settings object found"));
                continue;
            }
            const buttons = row.createDiv({ cls: "ttrpg-vs__button-row" });
            const restoreBtn = buttons.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Restore this backup" });
            restoreBtn.type = "button";
            restoreBtn.addEventListener("click", async () => {
                const ok = await ttrpgConfirm(
                    this.app,
                    "Restore TTRPG Search Backup",
                    "Restore this TTRPG Search backup? Current settings will first be backed up, then replaced by the selected backup.",
                    "Restore backup",
                    "Cancel"
                );
                if (!ok) return;
                restoreBtn.disabled = true;
                restoreBtn.textContent = "Restoring…";
                try {
                    await this.plugin.restoreSettingsBackup(backup.path);
                    new Notice("TTRPG Search backup restored.");
                    this.close();
                } catch (error) {
                    console.error("TTRPG Search backup restore failed:", error);
                    new Notice("Restore failed. Check console.");
                    restoreBtn.disabled = false;
                    restoreBtn.textContent = "Restore this backup";
                }
            });
        }
    }
}

class TTRPGSearchModal extends Modal {
    constructor(app, plugin, initialState = null) {
        super(app);
        this.plugin = plugin;
        this.initialState = initialState;

        this.query = "";
        this.selectedTypes = new Set();
        this.selectedSources = new Set();       // ← now a Set (multi-select)
        this.selectedIndex = 0;
        this.visibleEntries = [];
        this.renderedItems = new Map();
        this.virtualRenderQueued = false;
        this.showBookmarksOnly = false;
        this.selectedBookmarkGroup = null;      // null = all groups

        this.refreshResultsDebounced = debounce(() => this.refreshResults(true), 25, false);
    }

    onOpen() {
        this.plugin.registerModal(this);

        this.modalEl.classList.add("ttrpg-vs-modal");
        this.contentEl.empty();
        this.contentEl.classList.add("ttrpg-vs");

        this.titleEl.setText("TTRPG Vault Search");

        const toolbarEl = this.contentEl.createDiv({ cls: "ttrpg-vs__toolbar" });

        this.inputEl = toolbarEl.createEl("input", { cls: "ttrpg-vs__search" });
        this.inputEl.type = "search";
        this.inputEl.placeholder = "Search spells, items, books, adventures, NPCs...";
        this.inputEl.spellcheck = false;

        this.inputEl.addEventListener("input", () => {
            this.query = this.inputEl.value;
            this.selectedIndex = 0;
            this.refreshResultsDebounced();
        });

        this.inputEl.addEventListener("keydown", (event) => {
            if (!this.visibleEntries.length) return;

            if (event.key === "ArrowDown") {
                event.preventDefault();
                this.setSelectedIndex(this.selectedIndex + 1, true);
                return;
            }

            if (event.key === "ArrowUp") {
                event.preventDefault();
                this.setSelectedIndex(this.selectedIndex - 1, true);
                return;
            }

            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                const selected = this.visibleEntries[this.selectedIndex];
                if (selected) {
                    const entries = this.plugin.getReaderEntriesForEntry(selected);
                    const idx = Math.max(0, entries.findIndex((e) => e.path === selected.path));
                    void this.plugin.openReaderPopout(entries, idx, this.getStateSnapshot());
                    this.close();
                }
                return;
            }

            if (event.key === "Enter") {
                event.preventDefault();
                const selected = this.visibleEntries[this.selectedIndex];
                if (selected) void this.openEntry(selected);
            }
        });

        const filtersEl = toolbarEl.createDiv({ cls: "ttrpg-vs__filters" });

        const typeFilterEl = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        typeFilterEl.createDiv({ cls: "ttrpg-vs__label", text: "Type" });

        this.typeButtonEl = typeFilterEl.createEl("button", { cls: "ttrpg-vs__button" });
        this.typeButtonEl.type = "button";
        this.typeButtonEl.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const picker = new TypePickerModal(
                this.app,
                this.plugin.getTypeOptions(),
                new Set(this.selectedTypes),
                (selectedKeys) => {
                    this.selectedTypes = selectedKeys;
                    this.updateTypeButton();
                    this.selectedIndex = 0;
                    this.refreshResults(true);
                }
            );
            picker.open();
        });

        const sourceFilterEl = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        sourceFilterEl.createDiv({ cls: "ttrpg-vs__label", text: "Source" });

        this.sourceButtonEl = sourceFilterEl.createEl("button", { cls: "ttrpg-vs__button" });
        this.sourceButtonEl.type = "button";
        this.sourceButtonEl.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const picker = new SourcePickerModal(
                this.app,
                this.plugin.getSourceOptions(),
                new Set(this.selectedSources),
                (selectedKeys) => {
                    this.selectedSources = selectedKeys;
                    this.updateSourceButton();
                    this.selectedIndex = 0;
                    this.refreshResults(true);
                }
            );
            picker.open();
        });

        const sortFilterEl = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        sortFilterEl.createDiv({ cls: "ttrpg-vs__label", text: "Sort" });

        this.sortSelectEl = sortFilterEl.createEl("select", { cls: "ttrpg-vs__select" });
        [
            ["relevance", "Relevance"],
            ["name", "Name"],
            ["source", "Source"],
            ["type", "Type"],
        ].forEach(([value, label]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            this.sortSelectEl.appendChild(option);
        });
        this.sortSelectEl.value = this.plugin.settings.sortMode || "relevance";
        this.sortSelectEl.addEventListener("change", async () => {
            this.plugin.settings.sortMode = this.sortSelectEl.value;
            await this.plugin.saveSettings(false);
            this.refreshResults(false);
        });

        const buttonRowEl = filtersEl.createDiv({ cls: "ttrpg-vs__button-row" });

        this.bookmarksToggleEl = buttonRowEl.createEl("button", {
            cls: "ttrpg-vs__toolbutton",
            text: "Bookmarks",
        });
        this.bookmarksToggleEl.type = "button";
        this.bookmarksToggleEl.addEventListener("click", () => {
            this.showBookmarksOnly = !this.showBookmarksOnly;
            this.selectedBookmarkGroup = null;
            this.updateBookmarksButton();
            this.renderBookmarkGroupTabs();
            this.refreshResults(true);
        });

        this.manageBookmarksEl = buttonRowEl.createEl("button", {
            cls: "ttrpg-vs__toolbutton",
            text: "Manage",
        });
        this.manageBookmarksEl.type = "button";
        this.manageBookmarksEl.addEventListener("click", () => {
            new BookmarkManagerModal(this.app, this.plugin).open();
        });

        this.clearSourceButtonEl = buttonRowEl.createEl("button", {
            cls: "ttrpg-vs__toolbutton",
            text: "Clear source",
        });
        this.clearSourceButtonEl.type = "button";
        this.clearSourceButtonEl.addEventListener("click", () => {
            this.selectedSources = new Set();
            if (this.presetSelectEl) this.presetSelectEl.value = "";
            this.updateSourceButton();
            this.selectedIndex = 0;
            this.refreshResults(true);
        });

        this.presetSelectEl = buttonRowEl.createEl("select", { cls: "ttrpg-vs__select" });
        this.presetSelectEl.style.width = "auto";
        this.presetSelectEl.appendChild(Object.assign(document.createElement("option"), { value: "", textContent: "Preset…" }));
        for (const preset of this.plugin.getFilterPresets()) { const opt=document.createElement("option"); opt.value=preset.id; opt.textContent=preset.name; this.presetSelectEl.appendChild(opt); }
        this.presetSelectEl.addEventListener("change", () => { const preset=this.plugin.getFilterPresets().find((p)=>p.id===this.presetSelectEl.value); if(!preset) return; const validSources=new Set(this.plugin.getSourceOptions().map((o)=>o.key)); const validTypes=new Set(this.plugin.getTypeOptions().map((o)=>o.key)); this.selectedSources=new Set((preset.sources||[]).map(normalizeKey).filter((k)=>validSources.has(k))); this.selectedTypes=new Set((preset.types||[]).map(normalizeKey).filter((k)=>validTypes.has(k))); this.updateSourceButton(); this.updateTypeButton(); this.selectedIndex=0; this.refreshResults(true); });

        this.popoutSearchEl = buttonRowEl.createEl("button", {
            cls: "ttrpg-vs__toolbutton",
            text: "⤢ Pop-out",
        });
        this.popoutSearchEl.type = "button";
        this.popoutSearchEl.title = "Open search in a pop-out window (keeps this window open)";
        this.popoutSearchEl.addEventListener("click", async () => {
            const snap = this.getStateSnapshot();
            this.close();
            await this.plugin.openSearchPopout(snap);
        });

        // Bookmark group tabs row (hidden unless bookmarks view active)
        this.groupTabsEl = toolbarEl.createDiv({ cls: "ttrpg-vs__group-tabs" });
        this.groupTabsEl.style.display = "none";

        this.statsEl = this.contentEl.createDiv({ cls: "ttrpg-vs__stats" });

        this.viewportEl = this.contentEl.createDiv({ cls: "ttrpg-vs__viewport" });
        this.canvasEl = this.viewportEl.createDiv({ cls: "ttrpg-vs__canvas" });
        this.emptyEl = this.viewportEl.createDiv({ cls: "ttrpg-vs__empty" });
        this.emptyEl.setText("No matching entries found.");

        this.viewportEl.addEventListener("scroll", () => this.scheduleVirtualRender(), { passive: true });

        this._vpHeight = 0;
        if (typeof ResizeObserver !== "undefined") {
            this._viewportRO = new ResizeObserver(entries => {
                this._vpHeight = entries[0].contentRect.height;
                this.scheduleVirtualRender();
            });
            this._viewportRO.observe(this.viewportEl);
        }

        this.applyInitialState();
        this.refreshFromPlugin();
        window.setTimeout(() => this.inputEl.focus(), 0);
    }

    onClose() {
        if (this._viewportRO) { this._viewportRO.disconnect(); this._viewportRO = null; }
        // Persist state. _cachedSearchState is always available within the same session;
        // lastSearchState is also written to disk (async, best-effort for cross-session restore).
        if (this.plugin.settings.saveLastSearch && this.viewportEl) {
            const snap = this.getStateSnapshot();
            this.plugin._cachedSearchState = snap;       // instant in-memory cache
            this.plugin.settings.lastSearchState = snap; // persisted to disk
            void this.plugin.saveSettings(false);
        }
        this.plugin.unregisterModal(this);
        this.renderedItems.clear();
        this.contentEl.empty();
    }

    applyInitialState() {
        if (!this.initialState) return;

        this.query = this.initialState.query || "";
        const stateTypes = this.initialState.selectedTypes;
        if (Array.isArray(stateTypes) && stateTypes.length) {
            this.selectedTypes = new Set(stateTypes);
        } else if (this.initialState.selectedType) {
            // backward compat with old single-type state
            this.selectedTypes = new Set([this.initialState.selectedType]);
        } else {
            this.selectedTypes = new Set();
        }

        // selectedSources — support both old single string and new Set/array
        const stateSources = this.initialState.selectedSources;
        if (Array.isArray(stateSources)) {
            this.selectedSources = new Set(stateSources);
        } else if (typeof this.initialState.selectedSource === "string" && this.initialState.selectedSource) {
            this.selectedSources = new Set([this.initialState.selectedSource]);
        } else {
            this.selectedSources = new Set();
        }

        this.showBookmarksOnly = !!this.initialState.showBookmarksOnly;
        this.selectedBookmarkGroup = this.initialState.selectedBookmarkGroup ?? null;

        if (this.inputEl) this.inputEl.value = this.query;

        // Restore scroll position after the virtual list has had a chance to paint
        if (this.initialState.scrollTop) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (this.viewportEl) this.viewportEl.scrollTop = this.initialState.scrollTop;
                });
            });
        }
    }

    getStateSnapshot() {
        return {
            query: this.query,
            selectedTypes: Array.from(this.selectedTypes),
            selectedSources: Array.from(this.selectedSources),
            showBookmarksOnly: this.showBookmarksOnly,
            selectedBookmarkGroup: this.selectedBookmarkGroup,
            scrollTop: this.viewportEl ? this.viewportEl.scrollTop : 0,
        };
    }

    refreshFromPlugin() {
        this.refreshFilters();
        this.updateSourceButton();
        this.updateBookmarksButton();
        this.renderBookmarkGroupTabs();
        this.refreshResults(false);
    }

    handleBookmarksChanged() {
        this.updateBookmarksButton();
        this.renderBookmarkGroupTabs();
        this.refreshResults(false);
    }

    refreshFilters() {
        this.updateTypeButton();
        this.sortSelectEl.value = this.plugin.settings.sortMode || "relevance";
    }

    updateTypeButton() {
        const typeOptions = this.plugin.getTypeOptions();

        // Remove stale keys that no longer exist in the index
        const validKeys = new Set(typeOptions.map((o) => o.key));
        for (const key of [...this.selectedTypes]) {
            if (!validKeys.has(key)) this.selectedTypes.delete(key);
        }

        if (this.selectedTypes.size === 0) {
            this.typeButtonEl.textContent = "All types";
            this.typeButtonEl.title = "Click to filter by type";
            this.typeButtonEl.classList.remove("is-active");
        } else {
            const labels = typeOptions
                .filter((o) => this.selectedTypes.has(o.key))
                .map((o) => o.label)
                .join(", ");
            const n = this.selectedTypes.size;
            this.typeButtonEl.textContent = `${n} type${n !== 1 ? "s" : ""}`;
            this.typeButtonEl.title = labels;
            this.typeButtonEl.classList.add("is-active");
        }
    }

    updateSourceButton() {
        const sourceOptions = this.plugin.getSourceOptions();
        // Remove stale keys
        const validKeys = new Set(sourceOptions.map((o) => o.key));
        for (const key of [...this.selectedSources]) {
            if (!validKeys.has(key)) this.selectedSources.delete(key);
        }

        if (this.selectedSources.size === 0) {
            this.sourceButtonEl.textContent = "All sources";
            this.sourceButtonEl.title = "Click to filter by source";
            this.sourceButtonEl.classList.remove("is-active");
            this.clearSourceButtonEl.disabled = true;
        } else {
            const labels = sourceOptions
                .filter((o) => this.selectedSources.has(o.key))
                .map((o) => o.label)
                .join(", ");
            const n = this.selectedSources.size;
            this.sourceButtonEl.textContent = `${n} source${n !== 1 ? "s" : ""}`;
            this.sourceButtonEl.title = labels;
            this.sourceButtonEl.classList.add("is-active");
            this.clearSourceButtonEl.disabled = false;
        }
    }

    updateBookmarksButton() {
        const count = this.plugin.getBookmarkedPaths().length;
        this.bookmarksToggleEl.textContent = this.showBookmarksOnly
            ? `Bookmarks Only (${count})`
            : `Bookmarks (${count})`;
        this.bookmarksToggleEl.classList.toggle("is-active", this.showBookmarksOnly);
        this.manageBookmarksEl.style.display = this.showBookmarksOnly ? "" : "none";
    }

    renderBookmarkGroupTabs() {
        if (!this.groupTabsEl) return;
        if (!this.showBookmarksOnly) {
            this.groupTabsEl.style.display = "none";
            return;
        }

        const groups = this.plugin.getBookmarkGroups();
        if (!groups.length) {
            this.groupTabsEl.style.display = "none";
            return;
        }

        this.groupTabsEl.style.display = "flex";
        this.groupTabsEl.replaceChildren();

        // "All" tab
        const allTab = document.createElement("button");
        allTab.type = "button";
        allTab.className = "ttrpg-vs__group-tab" + (this.selectedBookmarkGroup === null ? " is-active" : "");
        allTab.textContent = "All";
        allTab.addEventListener("click", () => {
            this.selectedBookmarkGroup = null;
            this.renderBookmarkGroupTabs();
            this.refreshResults(true);
        });
        this.groupTabsEl.appendChild(allTab);

        // Ungrouped tab (only if there are ungrouped bookmarks)
        const bookmarkedPaths = new Set(this.plugin.getBookmarkedPaths());
        const hasUngrouped = [...bookmarkedPaths].some((p) => !this.plugin.getBookmarkGroupForPath(p));
        if (hasUngrouped) {
            const ungroupedTab = document.createElement("button");
            ungroupedTab.type = "button";
            ungroupedTab.className = "ttrpg-vs__group-tab" + (this.selectedBookmarkGroup === "ungrouped" ? " is-active" : "");
            ungroupedTab.textContent = "Ungrouped";
            ungroupedTab.addEventListener("click", () => {
                this.selectedBookmarkGroup = "ungrouped";
                this.renderBookmarkGroupTabs();
                this.refreshResults(true);
            });
            this.groupTabsEl.appendChild(ungroupedTab);
        }

        for (const group of groups) {
            const tab = document.createElement("button");
            tab.type = "button";
            tab.className = "ttrpg-vs__group-tab" + (this.selectedBookmarkGroup === group.id ? " is-active" : "");
            tab.textContent = group.name;
            tab.addEventListener("click", () => {
                this.selectedBookmarkGroup = group.id;
                this.renderBookmarkGroupTabs();
                this.refreshResults(true);
            });
            this.groupTabsEl.appendChild(tab);
        }
    }

    refreshResults(resetScroll) {
        const titleOnly = !!this.plugin.settings.searchTitleOnly;
        let entries = this.plugin.getEntries();

        if (this.showBookmarksOnly) {
            const bookmarked = new Set(this.plugin.getBookmarkedPaths());
            entries = entries.filter((entry) => {
                if (bookmarked.has(entry.path)) return true;
                if (entry.collectionKind && bookmarked.has(entry.collectionPath)) return true;
                return false;
            });

            // Bookmark group filter
            if (this.selectedBookmarkGroup !== null) {
                entries = entries.filter((entry) => {
                    // A chapter that is individually bookmarked uses its OWN path for
                    // group lookup so it can be placed in a different group than the adventure.
                    const key =
                        entry.collectionKind &&
                        bookmarked.has(entry.collectionPath) &&
                        !bookmarked.has(entry.path)
                            ? entry.collectionPath
                            : entry.path;
                    const groupId = this.plugin.getBookmarkGroupForPath(key);
                    if (this.selectedBookmarkGroup === "ungrouped") return !groupId;
                    return groupId === this.selectedBookmarkGroup;
                });
            }
        }

        entries = entries.filter((entry) => {
            if (this.selectedTypes.size > 0 && !this.selectedTypes.has(entry.typeKey)) return false;
            if (this.selectedSources.size > 0 && !this.selectedSources.has(entry.sourceKey)) return false;
            return true;
        });

        const trimmedQuery = this.query.trim();
        // Score each entry once; reuse that map for both filtering and relevance sorting
        let preScored = null;
        if (trimmedQuery) {
            preScored = new Map();
            entries = entries.filter((entry) => {
                const s = scoreEntry(entry, trimmedQuery, titleOnly);
                preScored.set(entry.path, s);
                return s >= 0;
            });
        }
        entries = sortEntries(entries, this.plugin.settings.sortMode || "relevance", trimmedQuery, titleOnly, preScored);
        if (this.showBookmarksOnly) entries = this.plugin.sortEntriesByBookmarkOrder(entries, this.selectedBookmarkGroup);

        // Deduplicate collection entries: show one representative per book/adventure.
        // In bookmarks-only view, individually-bookmarked chapters still show separately
        // if the whole collection is not bookmarked.
        const bookmarkedPaths = new Set(this.plugin.getBookmarkedPaths());
        this.collectionRepresentatives = new Set();
        this.collectionCounts = new Map();
        const collectionSeen = new Set();

        // First pass: count entries per collection
        for (const entry of entries) {
            if (entry.collectionKind) {
                this.collectionCounts.set(
                    entry.collectionPath,
                    (this.collectionCounts.get(entry.collectionPath) || 0) + 1
                );
            }
        }

        // Pre-select which entry represents each collection (overview wins; else first seen).
        const collRepPath = new Map();
        for (const entry of entries) {
            if (!entry.collectionKind) continue;
            if (!collRepPath.has(entry.collectionPath) || entry.isOverview)
                collRepPath.set(entry.collectionPath, entry.path);
        }

        // Second pass: deduplicate
        const deduped = [];
        for (const entry of entries) {
            if (!entry.collectionKind) {
                deduped.push(entry);
                continue;
            }

            const fileBookmarked = bookmarkedPaths.has(entry.path);
            const collBookmarked = bookmarkedPaths.has(entry.collectionPath);
            const isRep          = entry.path === collRepPath.get(entry.collectionPath);

            if (this.showBookmarksOnly) {
                // Show adventure representative once when the whole adventure is bookmarked
                if (collBookmarked && isRep && !collectionSeen.has(entry.collectionPath)) {
                    collectionSeen.add(entry.collectionPath);
                    this.collectionRepresentatives.add(entry.path);
                    deduped.push(entry);
                    continue;
                }
                // Show any chapter that is individually bookmarked as its own separate item
                if (fileBookmarked && !this.collectionRepresentatives.has(entry.path)) {
                    deduped.push(entry);
                }
                continue;
            }

            // Normal view: one representative per collection
            if (collectionSeen.has(entry.collectionPath)) continue;
            collectionSeen.add(entry.collectionPath);
            this.collectionRepresentatives.add(entry.path);
            deduped.push(entry);
        }

        const bookmarkOrderedEntries = this.showBookmarksOnly ? this.plugin.sortEntriesByBookmarkOrder(deduped, this.selectedBookmarkGroup) : deduped;
        this.visibleEntries = bookmarkOrderedEntries.slice(0, this.plugin.settings.maxResults);

        if (!this.visibleEntries.length) {
            this.selectedIndex = 0;
        } else {
            this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, this.visibleEntries.length - 1));
        }

        if (resetScroll) this.viewportEl.scrollTop = 0;

        this.statsEl.textContent = `${entries.length} matching • ${this.visibleEntries.length} shown • ${this.plugin.getEntries().length} indexed`;
        this.canvasEl.style.height = `${this.visibleEntries.length * RESULT_ROW_HEIGHT}px`;
        this.canvasEl.style.display = this.visibleEntries.length ? "block" : "none";
        this.emptyEl.style.display = this.visibleEntries.length ? "none" : "block";

        this.scheduleVirtualRender(true);
    }

    scheduleVirtualRender(forceFullRebuild = false) {
        if (forceFullRebuild) this._needsFullRebuild = true;
        if (this.virtualRenderQueued) return;

        this.virtualRenderQueued = true;
        requestAnimationFrame(() => {
            this.virtualRenderQueued = false;
            this.renderVirtualRows();
        });
    }

    renderVirtualRows() {
        const needsFullRebuild = !!this._needsFullRebuild;
        this._needsFullRebuild = false;

        if (!this.visibleEntries.length) {
            this.renderedItems.clear();
            this.canvasEl.replaceChildren();
            return;
        }

        const viewportHeight = this._vpHeight || this.viewportEl.clientHeight || this.viewportEl.getBoundingClientRect().height || 600;
        const scrollTop = this.viewportEl.scrollTop;

        const startIndex = Math.max(0, Math.floor(scrollTop / RESULT_ROW_HEIGHT) - RESULT_OVERSCAN);
        const endIndex = Math.min(
            this.visibleEntries.length,
            Math.ceil((scrollTop + viewportHeight) / RESULT_ROW_HEIGHT) + RESULT_OVERSCAN
        );

        if (needsFullRebuild) {
            // New result set — wipe everything and repopulate
            this.renderedItems.clear();
            this.canvasEl.replaceChildren();
        } else {
            // Incremental scroll — prune rows that scrolled out of the visible window
            for (const [index, el] of this.renderedItems) {
                if (index < startIndex || index >= endIndex) {
                    el.remove();
                    this.renderedItems.delete(index);
                }
            }
        }

        const fragment = document.createDocumentFragment();
        for (let index = startIndex; index < endIndex; index++) {
            if (this.renderedItems.has(index)) continue; // already in DOM
            const entry = this.visibleEntries[index];
            const rowEl = this.createResultElement(entry, index);
            rowEl.style.top = `${index * RESULT_ROW_HEIGHT}px`;
            fragment.appendChild(rowEl);
            this.renderedItems.set(index, rowEl);
        }
        if (fragment.childNodes.length) this.canvasEl.appendChild(fragment);
    }

    createResultElement(entry, index) {
        const itemEl = document.createElement("div");
        itemEl.className = "ttrpg-vs__result";
        if (index === this.selectedIndex) itemEl.classList.add("is-selected");

        itemEl.addEventListener("mouseenter", () => {
            this.setSelectedIndex(index, false);
        });

        itemEl.addEventListener("click", () => {
            void this.openEntry(entry);
        });

        const topEl = document.createElement("div");
        topEl.className = "ttrpg-vs__top";

        const mainEl = document.createElement("div");
        mainEl.className = "ttrpg-vs__main";

        const isCollRep = !!(
            this.collectionRepresentatives &&
            this.collectionRepresentatives.has(entry.path) &&
            entry.collectionKind
        );

        const titleEl = document.createElement("div");
        titleEl.className = "ttrpg-vs__title";

        if (isCollRep) {
            // Show just the collection name for the representative
            const nameEl = document.createElement("span");
            nameEl.className = "ttrpg-vs__title-piece ttrpg-vs__title-chapter";
            nameEl.innerHTML = highlightMatch(entry.collectionName, this.query);
            titleEl.appendChild(nameEl);
        } else if (entry.collectionKind) {
            const collectionEl = document.createElement("span");
            collectionEl.className = "ttrpg-vs__title-piece ttrpg-vs__title-collection";
            collectionEl.innerHTML = highlightMatch(entry.collectionName, this.query);
            titleEl.appendChild(collectionEl);

            const sepEl = document.createElement("span");
            sepEl.className = "ttrpg-vs__title-sep";
            sepEl.textContent = "-";
            titleEl.appendChild(sepEl);

            const chapterEl = document.createElement("span");
            chapterEl.className = "ttrpg-vs__title-piece ttrpg-vs__title-chapter";
            chapterEl.innerHTML = highlightMatch(entry.displayName, this.query);
            titleEl.appendChild(chapterEl);
        } else {
            const nameEl = document.createElement("span");
            nameEl.className = "ttrpg-vs__title-piece ttrpg-vs__title-chapter";
            nameEl.innerHTML = highlightMatch(entry.displayName, this.query);
            titleEl.appendChild(nameEl);
        }

        mainEl.appendChild(titleEl);

        const metaEl = document.createElement("div");
        metaEl.className = "ttrpg-vs__meta";

        const shouldShowSourceChip = !!entry.sourceLabel;

        if (shouldShowSourceChip) {
            const chipEl = document.createElement("button");
            chipEl.type = "button";
            chipEl.className = "ttrpg-vs__chip ttrpg-vs__chip--clickable";
            const sourceDisplayLabel = this.plugin.getSourceDisplayLabel(entry.sourceKey, entry.sourceLabel);
            chipEl.textContent = sourceDisplayLabel;
            chipEl.title = `Filter by source: ${sourceDisplayLabel} (right-click to edit chip)`;
            this.plugin.applySourceChipStyle(chipEl, entry.sourceKey);
            chipEl.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.selectedSources = new Set([entry.sourceKey]);
                this.updateSourceButton();
                this.selectedIndex = 0;
                this.refreshResults(true);
            });
            chipEl.addEventListener("contextmenu", (event) => { event.preventDefault(); event.stopPropagation(); new SourceChipEditModal(this.app, this.plugin, entry.sourceKey, entry.sourceLabel).open(); });
            metaEl.appendChild(chipEl);
        }

        const metaTextEl = document.createElement("span");
        metaTextEl.className = "ttrpg-vs__meta-text";

        if (isCollRep) {
            const count = this.collectionCounts ? (this.collectionCounts.get(entry.collectionPath) || 1) : 1;
            metaTextEl.textContent = `${entry.typeLabel} • ${count} section${count !== 1 ? "s" : ""}`;
        } else if (entry.collectionKind) {
            metaTextEl.textContent = entry.isOverview
                ? `${entry.typeLabel} overview`
                : `${entry.typeLabel} chapter`;
        } else {
            const secondary =
                entry.fileLabel && entry.fileLabel !== entry.displayName
                    ? entry.fileLabel
                    : entry.aliases[0] || entry.typeLabel;
            metaTextEl.innerHTML = highlightMatch(secondary, this.query);
        }

        metaEl.appendChild(metaTextEl);
        mainEl.appendChild(metaEl);

        const rightEl = document.createElement("div");
        rightEl.className = "ttrpg-vs__right";

        const badgeEl = document.createElement("button");
        badgeEl.type = "button";
        badgeEl.className = "ttrpg-vs__badge ttrpg-vs__badge--clickable";
        badgeEl.textContent = entry.typeLabel;
        badgeEl.title = `Filter by type: ${entry.typeLabel}`;
        badgeEl.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.selectedTypes = new Set([entry.typeKey]);
            this.updateTypeButton();
            this.selectedIndex = 0;
            this.refreshResults(true);
        });
        rightEl.appendChild(badgeEl);

        const bookmarkKey = isCollRep ? entry.collectionPath : entry.path;
        const starEl = document.createElement("button");
        starEl.type = "button";
        starEl.className = "ttrpg-vs__star";
        starEl.textContent = this.plugin.isBookmarked(bookmarkKey) ? "★" : "☆";
        starEl.classList.toggle("is-active", this.plugin.isBookmarked(bookmarkKey));
        starEl.title = this.plugin.isBookmarked(bookmarkKey) ? "Remove bookmark" : "Add bookmark";
        starEl.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await this.plugin.toggleBookmark(bookmarkKey);
        });
        rightEl.appendChild(starEl);

        topEl.appendChild(mainEl);
        topEl.appendChild(rightEl);

        const pathEl = document.createElement("div");
        pathEl.className = "ttrpg-vs__path";
        pathEl.innerHTML = highlightMatch(entry.path, this.query);

        itemEl.appendChild(topEl);
        itemEl.appendChild(pathEl);

        return itemEl;
    }

    setSelectedIndex(index, ensureVisible) {
        if (!this.visibleEntries.length) {
            this.selectedIndex = 0;
            return;
        }

        const clamped = Math.max(0, Math.min(index, this.visibleEntries.length - 1));
        const previousIndex = this.selectedIndex;
        this.selectedIndex = clamped;

        const previousEl = this.renderedItems.get(previousIndex);
        const nextEl = this.renderedItems.get(clamped);

        if (previousEl && previousEl !== nextEl) previousEl.classList.remove("is-selected");
        if (nextEl) nextEl.classList.add("is-selected");

        if (ensureVisible) {
            const itemTop = clamped * RESULT_ROW_HEIGHT;
            const itemBottom = itemTop + RESULT_ROW_HEIGHT;
            const viewportTop = this.viewportEl.scrollTop;
            const viewportBottom = viewportTop + this.viewportEl.clientHeight;

            if (itemTop < viewportTop) {
                this.viewportEl.scrollTop = itemTop;
                this.scheduleVirtualRender();
            } else if (itemBottom > viewportBottom) {
                this.viewportEl.scrollTop = itemBottom - this.viewportEl.clientHeight;
                this.scheduleVirtualRender();
            }
        }
    }

    async openEntry(entry) {
        let entries, initialIndex;

        const isCollRep = !!(
            this.collectionRepresentatives &&
            this.collectionRepresentatives.has(entry.path) &&
            entry.collectionKind
        );

        if (isCollRep) {
            // Collection representative: open at the first section (overview)
            entries = this.plugin.getCollectionEntries(entry.collectionPath);
            initialIndex = 0;
        } else {
            entries = this.plugin.getReaderEntriesForEntry(entry);
            initialIndex = Math.max(
                0,
                entries.findIndex((candidate) => candidate.path === entry.path)
            );
        }

        const snap = this.getStateSnapshot();
        if (this.plugin.settings.openReaderInPopoutByDefault) { this.close(); await this.plugin.openReaderPopout(entries, initialIndex, snap); return; }
        const reader = new TTRPGReaderModal(this.app, this.plugin, entries, initialIndex, snap);
        this.close();
        reader.open();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TTRPGSpellbookModal – spell-only view with level / school / class filters
// ─────────────────────────────────────────────────────────────────────────────
class TTRPGSpellbookModal extends Modal {
    constructor(app, plugin, initialState = null) {
        super(app);
        this.plugin = plugin;
        this.initialState = initialState;

        this.query = "";
        this.selectedLevels  = new Set();
        this.selectedSchools = new Set();
        this.selectedClasses = new Set();
        this.selectedSources = new Set();
        this.sortMode = "level";
        this.showFavoritesOnly = false;
        this.ritualOnly        = false;
        this.concOnly          = false;
        this.selectedIndex = 0;
        this.visibleEntries = [];
        this.renderedItems = new Map();
        this.virtualRenderQueued = false;

        this.refreshResultsDebounced = debounce(() => this.refreshResults(true), 25, false);
    }

    onOpen() {
        this.plugin.registerModal(this);
        this.modalEl.classList.add("ttrpg-sb-modal", "ttrpg-vs-modal");
        this.contentEl.empty();
        this.contentEl.classList.add("ttrpg-vs");

        this.titleEl.setText("Spellbook");

        const toolbarEl = this.contentEl.createDiv({ cls: "ttrpg-vs__toolbar" });

        // ── Search ────────────────────────────────────────────────────────────
        this.inputEl = toolbarEl.createEl("input", { cls: "ttrpg-vs__search" });
        this.inputEl.type = "search";
        this.inputEl.placeholder = "Search spells by name, school, class…";
        this.inputEl.spellcheck = false;
        this.inputEl.addEventListener("input", () => {
            this.query = this.inputEl.value;
            this.selectedIndex = 0;
            this.refreshResultsDebounced();
        });
        this.inputEl.addEventListener("keydown", (event) => {
            if (!this.visibleEntries.length) return;
            if (event.key === "ArrowDown") { event.preventDefault(); this.setSelectedIndex(this.selectedIndex + 1, true); return; }
            if (event.key === "ArrowUp")   { event.preventDefault(); this.setSelectedIndex(this.selectedIndex - 1, true); return; }
            if (event.key === "Enter") {
                event.preventDefault();
                const sel = this.visibleEntries[this.selectedIndex];
                if (sel) void this.openEntry(sel);
            }
        });

        // ── Filters row (9-column grid) ───────────────────────────────────────
        const filtersEl = toolbarEl.createDiv({ cls: "ttrpg-vs__filters ttrpg-sb__filters" });

        // ★ Favorites toggle
        const favWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        favWrap.createDiv({ cls: "ttrpg-vs__label", text: "\u00a0" });
        this.favBtnEl = favWrap.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "★ Favorites" });
        this.favBtnEl.type = "button";
        this.favBtnEl.title = "Show only spellbook-bookmarked spells";
        this.favBtnEl.addEventListener("click", () => {
            this.showFavoritesOnly = !this.showFavoritesOnly;
            this.favBtnEl.classList.toggle("is-active", this.showFavoritesOnly);
            this.selectedIndex = 0; this.refreshResults(true);
        });

        // Level
        const levelWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        levelWrap.createDiv({ cls: "ttrpg-vs__label", text: "Level" });
        this.levelButtonEl = levelWrap.createEl("button", { cls: "ttrpg-vs__button" });
        this.levelButtonEl.type = "button";
        this.levelButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new SourcePickerModal(this.app, this.plugin.getSpellLevelOptions(), new Set(this.selectedLevels), (keys) => {
                this.selectedLevels = keys; this.updateLevelButton(); this.selectedIndex = 0; this.refreshResults(true);
            }, "Filter by Level").open();
        });

        // School
        const schoolWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        schoolWrap.createDiv({ cls: "ttrpg-vs__label", text: "School" });
        this.schoolButtonEl = schoolWrap.createEl("button", { cls: "ttrpg-vs__button" });
        this.schoolButtonEl.type = "button";
        this.schoolButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new SourcePickerModal(this.app, this.plugin.getSpellSchoolOptions(), new Set(this.selectedSchools), (keys) => {
                this.selectedSchools = keys; this.updateSchoolButton(); this.selectedIndex = 0; this.refreshResults(true);
            }, "Filter by School").open();
        });

        // Class
        const classWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        classWrap.createDiv({ cls: "ttrpg-vs__label", text: "Class" });
        this.classButtonEl = classWrap.createEl("button", { cls: "ttrpg-vs__button" });
        this.classButtonEl.type = "button";
        this.classButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new SourcePickerModal(this.app, this.plugin.getSpellClassOptions(), new Set(this.selectedClasses), (keys) => {
                this.selectedClasses = keys; this.updateClassButton(); this.selectedIndex = 0; this.refreshResults(true);
            }, "Filter by Class").open();
        });

        // Source
        const sourceWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        sourceWrap.createDiv({ cls: "ttrpg-vs__label", text: "Source" });
        this.sourceButtonEl = sourceWrap.createEl("button", { cls: "ttrpg-vs__button" });
        this.sourceButtonEl.type = "button";
        this.sourceButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new SourcePickerModal(this.app, this._getSpellSourceOptions(), new Set(this.selectedSources), (keys) => {
                this.selectedSources = keys; this.updateSourceButton(); this.selectedIndex = 0; this.refreshResults(true);
            }, "Filter by Source").open();
        });

        // Ritual toggle
        const ritualWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        ritualWrap.createDiv({ cls: "ttrpg-vs__label", text: "\u00a0" });
        this.ritualBtnEl = ritualWrap.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Ritual" });
        this.ritualBtnEl.type = "button";
        this.ritualBtnEl.title = "Show only ritual spells";
        this.ritualBtnEl.addEventListener("click", () => {
            this.ritualOnly = !this.ritualOnly;
            this.ritualBtnEl.classList.toggle("is-active", this.ritualOnly);
            this.selectedIndex = 0; this.refreshResults(true);
        });

        // Concentration toggle
        const concWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        concWrap.createDiv({ cls: "ttrpg-vs__label", text: "\u00a0" });
        this.concBtnEl = concWrap.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Concentration" });
        this.concBtnEl.type = "button";
        this.concBtnEl.title = "Show only concentration spells";
        this.concBtnEl.addEventListener("click", () => {
            this.concOnly = !this.concOnly;
            this.concBtnEl.classList.toggle("is-active", this.concOnly);
            this.selectedIndex = 0; this.refreshResults(true);
        });

        // Sort
        const sortWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        sortWrap.createDiv({ cls: "ttrpg-vs__label", text: "Sort" });
        this.sortSelectEl = sortWrap.createEl("select", { cls: "ttrpg-vs__select" });
        [["level", "Level"], ["name", "Name"], ["school", "School"], ["source", "Source"]].forEach(([val, lbl]) => {
            const opt = document.createElement("option"); opt.value = val; opt.textContent = lbl; this.sortSelectEl.appendChild(opt);
        });
        this.sortSelectEl.value = this.sortMode;
        this.sortSelectEl.addEventListener("change", () => { this.sortMode = this.sortSelectEl.value; this.refreshResults(false); });

        // Clear all
        const clearWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        clearWrap.createDiv({ cls: "ttrpg-vs__label", text: "\u00a0" });
        this.clearButtonEl = clearWrap.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Clear" });
        this.clearButtonEl.type = "button";
        this.clearButtonEl.title = "Clear all filters";
        this.clearButtonEl.addEventListener("click", () => {
            this.selectedLevels  = new Set(); this.selectedSchools = new Set();
            this.selectedClasses = new Set(); this.selectedSources = new Set();
            this.showFavoritesOnly = false; this.ritualOnly = false; this.concOnly = false;
            this.query = ""; if (this.inputEl) this.inputEl.value = "";
            this.favBtnEl.classList.remove("is-active");
            this.ritualBtnEl.classList.remove("is-active");
            this.concBtnEl.classList.remove("is-active");
            this.updateLevelButton(); this.updateSchoolButton(); this.updateClassButton(); this.updateSourceButton();
            this.selectedIndex = 0; this.refreshResults(true);
        });

        const presetRow = toolbarEl.createDiv({ cls: "ttrpg-vs__button-row" });
        const spellPresetSelect = presetRow.createEl("select", { cls: "ttrpg-vs__select" });
        spellPresetSelect.style.width = "auto";
        spellPresetSelect.appendChild(Object.assign(document.createElement("option"), { value: "", textContent: "Preset…" }));
        for (const preset of this.plugin.getFilterPresets()) { const opt=document.createElement("option"); opt.value=preset.id; opt.textContent=preset.name; spellPresetSelect.appendChild(opt); }
        spellPresetSelect.addEventListener("change", () => { const preset=this.plugin.getFilterPresets().find((p)=>p.id===spellPresetSelect.value); if(!preset) return; const validSources=new Set(this._getSpellSourceOptions().map((o)=>o.key)); this.selectedSources=new Set((preset.sources||[]).map(normalizeKey).filter((k)=>validSources.has(k))); this.updateSourceButton(); this.selectedIndex=0; this.refreshResults(true); });

        // ── Results area ──────────────────────────────────────────────────────
        this.statsEl    = this.contentEl.createDiv({ cls: "ttrpg-vs__stats" });
        this.viewportEl = this.contentEl.createDiv({ cls: "ttrpg-vs__viewport" });
        this.canvasEl   = this.viewportEl.createDiv({ cls: "ttrpg-vs__canvas" });
        this.emptyEl    = this.viewportEl.createDiv({ cls: "ttrpg-vs__empty" });
        this.emptyEl.setText("No spells found. Try adjusting filters or rebuilding the index.");
        this.viewportEl.addEventListener("scroll", () => this.scheduleVirtualRender(), { passive: true });
        this._vpHeight = 0;
        if (typeof ResizeObserver !== "undefined") {
            this._viewportRO = new ResizeObserver(entries => {
                this._vpHeight = entries[0].contentRect.height;
                this.scheduleVirtualRender();
            });
            this._viewportRO.observe(this.viewportEl);
        }

        this.applyInitialState();
        this.updateLevelButton(); this.updateSchoolButton(); this.updateClassButton(); this.updateSourceButton();
        this.refreshResults(false);
        window.setTimeout(() => this.inputEl.focus(), 0);
    }

    onClose() {
        if (this._viewportRO) { this._viewportRO.disconnect(); this._viewportRO = null; }
        this.plugin.unregisterModal(this);
        this.renderedItems.clear();
        this.contentEl.empty();
    }

    applyInitialState() {
        if (!this.initialState) return;
        this.query = this.initialState.query || "";
        if (this.inputEl) this.inputEl.value = this.query;
        if (Array.isArray(this.initialState.selectedLevels))  this.selectedLevels  = new Set(this.initialState.selectedLevels);
        if (Array.isArray(this.initialState.selectedSchools)) this.selectedSchools = new Set(this.initialState.selectedSchools);
        if (Array.isArray(this.initialState.selectedClasses)) this.selectedClasses = new Set(this.initialState.selectedClasses);
        if (Array.isArray(this.initialState.selectedSources)) this.selectedSources = new Set(this.initialState.selectedSources);
        if (this.initialState.sortMode) { this.sortMode = this.initialState.sortMode; if (this.sortSelectEl) this.sortSelectEl.value = this.sortMode; }
        if (this.initialState.showFavoritesOnly) { this.showFavoritesOnly = true; if (this.favBtnEl) this.favBtnEl.classList.add("is-active"); }
        if (this.initialState.ritualOnly) { this.ritualOnly = true; if (this.ritualBtnEl) this.ritualBtnEl.classList.add("is-active"); }
        if (this.initialState.concOnly)   { this.concOnly   = true; if (this.concBtnEl)   this.concBtnEl.classList.add("is-active"); }
        if (this.initialState.scrollTop) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (this.viewportEl) this.viewportEl.scrollTop = this.initialState.scrollTop;
            }));
        }
    }

    getStateSnapshot() {
        return {
            mode: "spellbook",
            query: this.query,
            selectedLevels:    Array.from(this.selectedLevels),
            selectedSchools:   Array.from(this.selectedSchools),
            selectedClasses:   Array.from(this.selectedClasses),
            selectedSources:   Array.from(this.selectedSources),
            sortMode:          this.sortMode,
            showFavoritesOnly: this.showFavoritesOnly,
            ritualOnly:        this.ritualOnly,
            concOnly:          this.concOnly,
            scrollTop:         this.viewportEl ? this.viewportEl.scrollTop : 0,
        };
    }

    // Called by plugin.notifyModals() when bookmarks or index change
    refreshFromPlugin() {
        this.updateLevelButton(); this.updateSchoolButton(); this.updateClassButton(); this.updateSourceButton();
        this.refreshResults(false);
    }

    handleBookmarksChanged() { this.refreshResults(false); }

    _getSpellSourceOptions() {
        const map = new Map();
        for (const entry of this.plugin.getEntries()) {
            if (entry.typeKey !== "spell" || !entry.sourceKey || !entry.sourceLabel) continue;
            const ex = map.get(entry.sourceKey);
            if (ex) ex.count++;
            else map.set(entry.sourceKey, { key: entry.sourceKey, label: entry.sourceLabel, count: 1 });
        }
        return Array.from(map.values()).sort((a, b) => COLLATOR.compare(a.label, b.label));
    }

    updateLevelButton() {
        const opts = this.plugin.getSpellLevelOptions();
        const valid = new Set(opts.map((o) => o.key));
        for (const k of [...this.selectedLevels]) { if (!valid.has(k)) this.selectedLevels.delete(k); }
        if (this.selectedLevels.size === 0) { this.levelButtonEl.textContent = "All levels"; this.levelButtonEl.classList.remove("is-active"); }
        else { const n = this.selectedLevels.size; this.levelButtonEl.textContent = `${n} level${n !== 1 ? "s" : ""}`; this.levelButtonEl.classList.add("is-active"); }
    }

    updateSchoolButton() {
        const opts = this.plugin.getSpellSchoolOptions();
        const valid = new Set(opts.map((o) => o.key));
        for (const k of [...this.selectedSchools]) { if (!valid.has(k)) this.selectedSchools.delete(k); }
        if (this.selectedSchools.size === 0) { this.schoolButtonEl.textContent = "All schools"; this.schoolButtonEl.classList.remove("is-active"); }
        else { const n = this.selectedSchools.size; this.schoolButtonEl.textContent = `${n} school${n !== 1 ? "s" : ""}`; this.schoolButtonEl.classList.add("is-active"); }
    }

    updateClassButton() {
        const opts = this.plugin.getSpellClassOptions();
        const valid = new Set(opts.map((o) => o.key));
        for (const k of [...this.selectedClasses]) { if (!valid.has(k)) this.selectedClasses.delete(k); }
        if (this.selectedClasses.size === 0) { this.classButtonEl.textContent = "All classes"; this.classButtonEl.classList.remove("is-active"); }
        else { const n = this.selectedClasses.size; this.classButtonEl.textContent = `${n} class${n !== 1 ? "es" : ""}`; this.classButtonEl.classList.add("is-active"); }
    }

    updateSourceButton() {
        const opts = this._getSpellSourceOptions();
        const valid = new Set(opts.map((o) => o.key));
        for (const k of [...this.selectedSources]) { if (!valid.has(k)) this.selectedSources.delete(k); }
        if (this.selectedSources.size === 0) { this.sourceButtonEl.textContent = "All sources"; this.sourceButtonEl.classList.remove("is-active"); }
        else { const n = this.selectedSources.size; this.sourceButtonEl.textContent = `${n} source${n !== 1 ? "s" : ""}`; this.sourceButtonEl.classList.add("is-active"); }
    }

    refreshResults(resetScroll) {
        const titleOnly = !!this.plugin.settings.searchTitleOnly;
        let entries = this.plugin.getEntries().filter((e) => e.typeKey === "spell");
        const total = entries.length;

        // Spellbook-isolated favorites
        if (this.showFavoritesOnly) {
            entries = entries.filter((e) => this.plugin.isSpellBookmarked(e.path));
        }

        // Level / school / class / source filters
        entries = entries.filter((entry) => {
            const sm = entry.spellMeta;
            if (this.selectedLevels.size > 0 && (!sm || sm.level == null || !this.selectedLevels.has(String(sm.level)))) return false;
            if (this.selectedSchools.size > 0 && (!sm || !sm.school || !this.selectedSchools.has(normalizeKey(sm.school)))) return false;
            if (this.selectedClasses.size > 0 && (!sm || !sm.classes.some((c) => this.selectedClasses.has(normalizeKey(c))))) return false;
            if (this.selectedSources.size > 0 && !this.selectedSources.has(entry.sourceKey)) return false;
            return true;
        });

        // Boolean flags
        if (this.ritualOnly) entries = entries.filter((e) => e.spellMeta?.ritual === true);
        if (this.concOnly)   entries = entries.filter((e) => e.spellMeta?.concentration === true);

        // Text search — score once and reuse for sort
        let preScored = null;
        const trimmedQuery = this.query.trim();
        if (trimmedQuery) {
            preScored = new Map();
            entries = entries.filter((e) => {
                const s = scoreEntry(e, trimmedQuery, titleOnly);
                preScored.set(e.path, s);
                return s >= 0;
            });
        }

        entries = this._sortSpellEntries(entries, titleOnly, preScored);
        this.visibleEntries = entries.slice(0, this.plugin.settings.maxResults);

        if (!this.visibleEntries.length) this.selectedIndex = 0;
        else this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, this.visibleEntries.length - 1));

        if (resetScroll && this.viewportEl) this.viewportEl.scrollTop = 0;

        const favCount = this.plugin.getSpellBookmarkedPaths().length;
        const favLabel = favCount > 0 ? ` • ★ ${favCount} saved` : "";
        this.statsEl.textContent = `${entries.length} matching • ${this.visibleEntries.length} shown • ${total} total${favLabel}`;
        this.canvasEl.style.height  = `${this.visibleEntries.length * RESULT_ROW_HEIGHT}px`;
        this.canvasEl.style.display = this.visibleEntries.length ? "block" : "none";
        this.emptyEl.style.display  = this.visibleEntries.length ? "none" : "block";
        this.scheduleVirtualRender(true);
    }

    _compareByMode(a, b) {
        switch (this.sortMode) {
            case "level":  { const la = a.spellMeta?.level ?? 99, lb = b.spellMeta?.level ?? 99; return la - lb || COLLATOR.compare(a.displayName, b.displayName); }
            case "school": return COLLATOR.compare(a.spellMeta?.school || "zzz", b.spellMeta?.school || "zzz") || COLLATOR.compare(a.displayName, b.displayName);
            case "source": return COLLATOR.compare(a.sourceLabel || "zzz", b.sourceLabel || "zzz") || COLLATOR.compare(a.displayName, b.displayName);
            default:       return COLLATOR.compare(a.displayName, b.displayName);
        }
    }

    _sortSpellEntries(entries, titleOnly, preScored = null) {
        const list = [...entries];
        if (this.query.trim()) {
            const getScore = preScored
                ? (e) => preScored.get(e.path) ?? scoreEntry(e, this.query, titleOnly)
                : (e) => scoreEntry(e, this.query, titleOnly);
            list.sort((a, b) => { const d = getScore(b) - getScore(a); return d !== 0 ? d : this._compareByMode(a, b); });
        } else {
            list.sort((a, b) => this._compareByMode(a, b));
        }
        return list;
    }

    scheduleVirtualRender(forceFullRebuild = false) {
        if (forceFullRebuild) this._needsFullRebuild = true;
        if (this.virtualRenderQueued) return;
        this.virtualRenderQueued = true;
        requestAnimationFrame(() => { this.virtualRenderQueued = false; this.renderVirtualRows(); });
    }

    renderVirtualRows() {
        const needsFullRebuild = !!this._needsFullRebuild;
        this._needsFullRebuild = false;

        if (!this.visibleEntries.length) {
            this.renderedItems.clear();
            this.canvasEl.replaceChildren();
            return;
        }

        const vpH = this._vpHeight || this.viewportEl.clientHeight || this.viewportEl.getBoundingClientRect().height || 600;
        const sTop = this.viewportEl.scrollTop;
        const start = Math.max(0, Math.floor(sTop / RESULT_ROW_HEIGHT) - RESULT_OVERSCAN);
        const end   = Math.min(this.visibleEntries.length, Math.ceil((sTop + vpH) / RESULT_ROW_HEIGHT) + RESULT_OVERSCAN);

        if (needsFullRebuild) {
            this.renderedItems.clear();
            this.canvasEl.replaceChildren();
        } else {
            for (const [i, el] of this.renderedItems) {
                if (i < start || i >= end) { el.remove(); this.renderedItems.delete(i); }
            }
        }

        const frag = document.createDocumentFragment();
        for (let i = start; i < end; i++) {
            if (this.renderedItems.has(i)) continue;
            const el = this.createSpellResultElement(this.visibleEntries[i], i);
            el.style.top = `${i * RESULT_ROW_HEIGHT}px`;
            frag.appendChild(el); this.renderedItems.set(i, el);
        }
        if (frag.childNodes.length) this.canvasEl.appendChild(frag);
    }

    createSpellResultElement(entry, index) {
        const itemEl = document.createElement("div");
        itemEl.className = "ttrpg-vs__result";
        if (index === this.selectedIndex) itemEl.classList.add("is-selected");
        itemEl.addEventListener("mouseenter", () => this.setSelectedIndex(index, false));
        itemEl.addEventListener("click", () => void this.openEntry(entry));

        const topEl  = document.createElement("div"); topEl.className  = "ttrpg-vs__top";
        const mainEl = document.createElement("div"); mainEl.className = "ttrpg-vs__main";

        // Name
        const titleEl = document.createElement("div"); titleEl.className = "ttrpg-vs__title";
        const nameEl  = document.createElement("span"); nameEl.className = "ttrpg-vs__title-piece ttrpg-vs__title-chapter";
        nameEl.innerHTML = highlightMatch(entry.displayName, this.query);
        titleEl.appendChild(nameEl); mainEl.appendChild(titleEl);

        // Level chip + school badge (clickable) + source chip (clickable)
        const metaEl = document.createElement("div"); metaEl.className = "ttrpg-vs__meta";
        const sm = entry.spellMeta;
        if (sm?.level != null) {
            const chip = document.createElement("span");
            chip.className = `ttrpg-sb__level-chip ttrpg-sb__level-${sm.level}`;
            chip.textContent = formatSpellLevel(sm.level);
            // Click level chip to filter
            chip.style.cursor = "pointer"; chip.title = `Filter to ${formatSpellLevel(sm.level)}`;
            chip.addEventListener("click", (e) => {
                e.preventDefault(); e.stopPropagation();
                this.selectedLevels = new Set([String(sm.level)]);
                this.updateLevelButton(); this.selectedIndex = 0; this.refreshResults(true);
            });
            metaEl.appendChild(chip);
        }
        if (sm?.school) {
            const badge = document.createElement("button"); badge.type = "button";
            badge.className = "ttrpg-vs__badge ttrpg-vs__badge--clickable";
            badge.textContent = sm.school; badge.title = `Filter by school: ${sm.school}`;
            badge.addEventListener("click", (e) => {
                e.preventDefault(); e.stopPropagation();
                this.selectedSchools = new Set([normalizeKey(sm.school)]);
                this.updateSchoolButton(); this.selectedIndex = 0; this.refreshResults(true);
            });
            metaEl.appendChild(badge);
        }
        if (entry.sourceLabel) {
            const chip = document.createElement("button"); chip.type = "button";
            chip.className = "ttrpg-vs__chip ttrpg-vs__chip--clickable";
            const sourceDisplayLabel = this.plugin.getSourceDisplayLabel(entry.sourceKey, entry.sourceLabel);
            chip.textContent = sourceDisplayLabel; chip.title = `Filter by source: ${sourceDisplayLabel} (right-click to edit chip)`;
            this.plugin.applySourceChipStyle(chip, entry.sourceKey);
            chip.addEventListener("click", (e) => {
                e.preventDefault(); e.stopPropagation();
                this.selectedSources = new Set([entry.sourceKey]);
                this.updateSourceButton(); this.selectedIndex = 0; this.refreshResults(true);
            });
            chip.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); new SourceChipEditModal(this.app, this.plugin, entry.sourceKey, entry.sourceLabel).open(); });
            metaEl.appendChild(chip);
        }
        mainEl.appendChild(metaEl);

        // Classes • Ritual • Concentration
        const classesEl = document.createElement("div"); classesEl.className = "ttrpg-vs__meta-text";
        if (sm) {
            const parts = [];
            if (sm.classes.length) parts.push(sm.classes.join(", "));
            if (sm.ritual)        parts.push("Ritual");
            if (sm.concentration) parts.push("Concentration");
            classesEl.textContent = parts.join(" • ") || (entry.aliases[0] || "");
        } else {
            classesEl.textContent = entry.aliases[0] || entry.typeLabel;
        }
        mainEl.appendChild(classesEl);

        // Right: ★ spellbook-isolated bookmark
        const rightEl = document.createElement("div"); rightEl.className = "ttrpg-vs__right";
        const starEl  = document.createElement("button"); starEl.type = "button"; starEl.className = "ttrpg-vs__star";
        const refreshStar = () => {
            const on = this.plugin.isSpellBookmarked(entry.path);
            starEl.textContent = on ? "★" : "☆";
            starEl.classList.toggle("is-active", on);
            starEl.title = on ? "Remove from Spellbook favorites" : "Add to Spellbook favorites";
        };
        refreshStar();
        starEl.addEventListener("click", async (e) => {
            e.preventDefault(); e.stopPropagation();
            await this.plugin.toggleSpellBookmark(entry.path);
            refreshStar();
            // If favorites filter is on, re-render to reflect removal
            if (this.showFavoritesOnly) this.refreshResults(false);
        });
        rightEl.appendChild(starEl);

        topEl.appendChild(mainEl); topEl.appendChild(rightEl);
        const pathEl = document.createElement("div"); pathEl.className = "ttrpg-vs__path";
        pathEl.innerHTML = highlightMatch(entry.path, this.query);
        itemEl.appendChild(topEl); itemEl.appendChild(pathEl);
        return itemEl;
    }

    setSelectedIndex(index, ensureVisible) {
        if (!this.visibleEntries.length) { this.selectedIndex = 0; return; }
        const c = Math.max(0, Math.min(index, this.visibleEntries.length - 1));
        const prev = this.selectedIndex; this.selectedIndex = c;
        const pEl = this.renderedItems.get(prev), nEl = this.renderedItems.get(c);
        if (pEl && pEl !== nEl) pEl.classList.remove("is-selected");
        if (nEl) nEl.classList.add("is-selected");
        if (ensureVisible) {
            const top = c * RESULT_ROW_HEIGHT, bot = top + RESULT_ROW_HEIGHT;
            const vT = this.viewportEl.scrollTop, vB = vT + this.viewportEl.clientHeight;
            if (top < vT) { this.viewportEl.scrollTop = top; this.scheduleVirtualRender(); }
            else if (bot > vB) { this.viewportEl.scrollTop = bot - this.viewportEl.clientHeight; this.scheduleVirtualRender(); }
        }
    }

    async openEntry(entry) {
        const entries = this.plugin.getReaderEntriesForEntry(entry);
        const idx     = Math.max(0, entries.findIndex((e) => e.path === entry.path));
        const snap    = this.getStateSnapshot();
        if (this.plugin.settings.openReaderInPopoutByDefault) { this.close(); await this.plugin.openReaderPopout(entries, idx, snap); return; }
        const reader  = new TTRPGReaderModal(this.app, this.plugin, entries, idx, snap);
        this.close();
        reader.open();
    }
}

class SourcePickerModal extends Modal {
    constructor(app, options, initialSelection, onApply, titleText = "Filter by Source") {
        super(app);
        this.options = options; // [{key, label, count}]
        this.onApply = onApply;
        this.titleText = titleText;
        this.query = "";
        // If initialSelection is empty that means "show all" → pre-check every box
        this.pendingKeys =
            initialSelection.size === 0
                ? new Set(options.map((o) => o.key))
                : new Set(initialSelection);
    }

    onOpen() {
        this.modalEl.classList.add("ttrpg-vs-source-modal");
        this.contentEl.empty();
        this.contentEl.classList.add("ttrpg-vs-source");

        this.titleEl.setText(this.titleText);

        this.inputEl = this.contentEl.createEl("input", {
            cls: "ttrpg-vs-source__search",
        });
        this.inputEl.type = "search";
        this.inputEl.placeholder = "Search sources…";
        this.inputEl.spellcheck = false;
        this.inputEl.addEventListener("input", () => {
            this.query = this.inputEl.value;
            this.renderList();
        });

        this.listEl = this.contentEl.createDiv({ cls: "ttrpg-vs-source__list" });

        const actionsEl = this.contentEl.createDiv({ cls: "ttrpg-vs-type__actions" });

        const selectAllEl = actionsEl.createEl("button", {
            cls: "ttrpg-vs__toolbutton",
            text: "Select all",
        });
        selectAllEl.type = "button";
        selectAllEl.addEventListener("click", () => {
            this.options.forEach((o) => this.pendingKeys.add(o.key));
            this.renderList();
        });

        const clearAllEl = actionsEl.createEl("button", {
            cls: "ttrpg-vs__toolbutton",
            text: "Clear all",
        });
        clearAllEl.type = "button";
        clearAllEl.addEventListener("click", () => {
            this.pendingKeys.clear();
            this.renderList();
        });

        const applyEl = actionsEl.createEl("button", {
            cls: "ttrpg-vs__toolbutton is-active",
            text: "Apply",
        });
        applyEl.type = "button";
        applyEl.addEventListener("click", () => {
            // All boxes checked = same as "show all" → pass empty Set
            const resultSet =
                this.pendingKeys.size >= this.options.length
                    ? new Set()
                    : new Set(this.pendingKeys);
            this.onApply(resultSet);
            this.close();
        });

        this.renderList();
        window.setTimeout(() => this.inputEl.focus(), 0);
    }

    onClose() {
        this.contentEl.empty();
    }

    renderList() {
        const query = this.query.trim().toLowerCase();

        const filtered = this.options.filter((option) => {
            if (!query) return true;
            return (
                String(option.label || "").toLowerCase().includes(query) ||
                String(option.key || "").toLowerCase().includes(query)
            );
        });

        this.listEl.replaceChildren();

        if (!filtered.length) {
            const emptyEl = document.createElement("div");
            emptyEl.className = "ttrpg-vs__empty";
            emptyEl.textContent = "No matching sources.";
            this.listEl.appendChild(emptyEl);
            return;
        }

        const fragment = document.createDocumentFragment();

        filtered.forEach((option) => {
            const labelEl = document.createElement("label");
            labelEl.className = "ttrpg-vs-type__item";

            const checkboxEl = document.createElement("input");
            checkboxEl.type = "checkbox";
            checkboxEl.className = "ttrpg-vs-type__checkbox";
            checkboxEl.checked = this.pendingKeys.has(option.key);
            checkboxEl.addEventListener("change", () => {
                if (checkboxEl.checked) {
                    this.pendingKeys.add(option.key);
                } else {
                    this.pendingKeys.delete(option.key);
                }
            });

            const nameEl = document.createElement("span");
            nameEl.className = "ttrpg-vs-source__name";
            nameEl.textContent = option.label;

            const countEl = document.createElement("span");
            countEl.className = "ttrpg-vs-source__count";
            countEl.textContent = String(option.count);

            labelEl.appendChild(checkboxEl);
            labelEl.appendChild(nameEl);
            labelEl.appendChild(countEl);
            fragment.appendChild(labelEl);
        });

        this.listEl.appendChild(fragment);
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// ReaderEngine – all reader logic, shared by the modal and the pop-out view
// ─────────────────────────────────────────────────────────────────────────────
class ReaderEngine {
    constructor(app, plugin, callbacks = {}) {
        this.app = app;
        this.plugin = plugin;
        this.callbacks = Object.assign(
            { setTitle: () => {}, goBack: () => {}, closeReader: null, isPopout: false },
            callbacks
        );
        this.entries = [];
        this.initialIndex = 0;
        this.searchState = null;
        this.navHistory = [];
        this.selectedIndex = 0;
        this.currentEntry = null;
        this.currentRenderComponent = null;
        this.headingTargets = [];
        this._searchMatches = [];
        this._searchMatchIndex = -1;
    }

    refreshFromPlugin() {}

    buildTTRPGSearchButtonBlock(entry) {
        if (!entry) return "";
        const type = String(entry.typeLabel || "Any").trim() || "Any";
        const name = String((entry.collectionKind && entry.collectionName) ? entry.collectionName : (entry.displayName || entry.fileLabel || entry.path || "")).trim();
        let chapter = "";
        if (entry.collectionKind && entry.collectionPath) {
            const first = this.plugin.getFirstChapterForCollection ? this.plugin.getFirstChapterForCollection(entry.collectionPath) : null;
            if (!first || first.path !== entry.path) chapter = String(entry.displayName || entry.fileLabel || "").trim();
        }
        return "```TTRPG_Search\nType: " + type + "\nName: " + name + (chapter ? "\nChapter: " + chapter : "") + "\n```";
    }

    build(containerEl, entries, initialIndex, searchState) {
        this.containerEl = containerEl;
        this.entries = entries || [];
        this.initialIndex = typeof initialIndex === "number" ? initialIndex : 0;
        this.searchState = searchState;
        containerEl.empty();
        this._buildUI(containerEl);
        this._syncTitle();
        this.renderSectionList();
        if (!this.entries.length) {
            if (this.contentTitleEl) this.contentTitleEl.setText("No sections found");
            if (this.contentMetaEl) this.contentMetaEl.setText("No file");
            if (this.contentBodyEl) this.contentBodyEl.setText("There are no readable notes in this selection.");
            if (this.prevButtonEl) this.prevButtonEl.disabled = true;
            if (this.nextButtonEl) this.nextButtonEl.disabled = true;
            return;
        }
        void this.selectIndex(Math.max(0, Math.min(this.initialIndex, this.entries.length - 1)));
    }

    _buildUI(containerEl) {
        const headerEl = containerEl.createDiv({ cls: "ttrpg-reader__header" });
        const headingEl = headerEl.createDiv({ cls: "ttrpg-reader__heading" });
        this.subtitleEl = headingEl.createDiv({ cls: "ttrpg-reader__subtitle" });
        this.actionsEl = headerEl.createDiv({ cls: "ttrpg-reader__actions" });

        this.backButtonEl = this.actionsEl.createEl("button", { cls: "ttrpg-reader__action", text: "← Back" });
        this.backButtonEl.title = "Back to search";
        this.backButtonEl.addEventListener("click", () => this.goBack());

        this.copyButtonBlockEl = this.actionsEl.createEl("button", { cls: "ttrpg-reader__action", text: "Copy Button" });
        this.copyButtonBlockEl.title = "Copy a TTRPG_Search button block for the current reader entry";
        this.copyButtonBlockEl.addEventListener("click", async () => {
            if (!this.currentEntry) {
                new Notice("No current reader entry to copy.");
                return;
            }
            const block = this.buildTTRPGSearchButtonBlock(this.currentEntry);
            if (!block) {
                new Notice("Could not build TTRPG Search button block.");
                return;
            }
            try {
                await copyTextToClipboard(block);
                new Notice("Copied TTRPG Search button block.");
            } catch (error) {
                console.error("Failed to copy TTRPG Search button block:", error);
                new Notice("Failed to copy button block. Check console.");
            }
        });

        this.openFileButtonEl = this.actionsEl.createEl("button", { cls: "ttrpg-reader__action", text: "Open File" });
        this.openFileButtonEl.addEventListener("click", async () => {
            if (!this.currentEntry) return;
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(this.currentEntry.file);
            if (this.callbacks.closeReader) this.callbacks.closeReader();
        });

        this.copyLinkButtonEl = this.actionsEl.createEl("button", { cls: "ttrpg-reader__action", text: "Copy [[Link]]" });
        this.copyLinkButtonEl.addEventListener("click", async () => {
            if (!this.currentEntry) return;
            try { await copyTextToClipboard(makeWikiLink(this.currentEntry.file)); new Notice("Wiki link copied."); }
            catch (_) { new Notice("Could not copy link."); }
        });

        this.bookmarkButtonEl = this.actionsEl.createEl("button", { cls: "ttrpg-reader__action", text: "Bookmark" });
        this.bookmarkButtonEl.addEventListener("click", async () => {
            if (!this.currentEntry) return;
            await this.plugin.toggleBookmark(this.currentEntry.path);
            this.updateBookmarkButton();
        });

        this.bookmarkCollectionButtonEl = this.actionsEl.createEl("button", { cls: "ttrpg-reader__action", text: "Bookmark Adventure" });
        this.bookmarkCollectionButtonEl.style.display = "none";
        this.bookmarkCollectionButtonEl.addEventListener("click", async () => {
            if (!this.currentEntry || !this.currentEntry.collectionPath) return;
            await this.plugin.toggleBookmark(this.currentEntry.collectionPath);
            this.updateBookmarkCollectionButton();
        });

        // ⤢ Pop Out button — only shown inside a blocking modal, not inside a popout window
        if (!this.callbacks.isPopout) {
            this.popOutButtonEl = this.actionsEl.createEl("button", { cls: "ttrpg-reader__action", text: "⤢ Pop Out" });
            this.popOutButtonEl.title = "Open in a separate Obsidian window";
            this.popOutButtonEl.addEventListener("click", async () => {
                const e = this.entries, i = this.selectedIndex, s = this.searchState;
                await this.plugin.openReaderInWindow(e, i, s);
                if (this.callbacks.closeReader) this.callbacks.closeReader();
            });
        } else {
            // ⤡ Pop Back In — close the popout tab and reopen as a blocking modal
            this.popInButtonEl = this.actionsEl.createEl("button", { cls: "ttrpg-reader__action", text: "⤡ Pop In" });
            this.popInButtonEl.title = "Move this reader back to the main window";
            this.popInButtonEl.addEventListener("click", () => {
                if (this.callbacks.onPopBackIn) this.callbacks.onPopBackIn();
            });
        }

        this.prevButtonEl = this.actionsEl.createEl("button", { cls: "ttrpg-reader__action", text: "Previous" });
        this.prevButtonEl.addEventListener("click", () => void this.selectIndex(this.selectedIndex - 1));

        this.nextButtonEl = this.actionsEl.createEl("button", { cls: "ttrpg-reader__action", text: "Next" });
        this.nextButtonEl.addEventListener("click", () => void this.selectIndex(this.selectedIndex + 1));

        // ── Body ─────────────────────────────────────────────────────────────────
        const bodyEl = containerEl.createDiv({ cls: "ttrpg-reader__body" });
        const sidebarEl = bodyEl.createDiv({ cls: "ttrpg-reader__sidebar" });

        const contentsPaneEl = sidebarEl.createDiv({ cls: "ttrpg-reader__pane" });
        contentsPaneEl.createDiv({ cls: "ttrpg-reader__sidebar-section-title", text: "Contents" });
        this.sectionButtonsEl = contentsPaneEl.createDiv({ cls: "ttrpg-reader__sections" });

        const subheadingsPaneEl = sidebarEl.createDiv({ cls: "ttrpg-reader__pane" });
        subheadingsPaneEl.createDiv({ cls: "ttrpg-reader__sidebar-section-title", text: "Subheadings" });
        this.subheadingsEl = subheadingsPaneEl.createDiv({ cls: "ttrpg-reader__subheadings" });

        const contentWrapEl = bodyEl.createDiv({ cls: "ttrpg-reader__content-wrap" });
        const contentHeaderEl = contentWrapEl.createDiv({ cls: "ttrpg-reader__content-header" });
        this.contentTitleEl = contentHeaderEl.createDiv({ cls: "ttrpg-reader__content-title" });
        this.contentMetaEl = contentHeaderEl.createDiv({ cls: "ttrpg-reader__content-meta" });

        // ── In-note search bar ────────────────────────────────────────────────────
        const searchRowEl = contentHeaderEl.createDiv({ cls: "ttrpg-reader__search-row" });
        this.contentSearchEl = searchRowEl.createEl("input", { cls: "ttrpg-reader__search-input" });
        this.contentSearchEl.type = "search";
        this.contentSearchEl.placeholder = "Find in note…";
        this.contentSearchEl.spellcheck = false;

        this.contentSearchPrevEl = searchRowEl.createEl("button", { cls: "ttrpg-reader__action ttrpg-reader__search-nav", text: "▲" });
        this.contentSearchPrevEl.title = "Previous match (Shift+Enter)";
        this.contentSearchPrevEl.addEventListener("click", () => this._navigateMatch(-1));

        this.contentSearchNextEl = searchRowEl.createEl("button", { cls: "ttrpg-reader__action ttrpg-reader__search-nav", text: "▼" });
        this.contentSearchNextEl.title = "Next match (Enter)";
        this.contentSearchNextEl.addEventListener("click", () => this._navigateMatch(1));

        this.contentSearchCountEl = searchRowEl.createDiv({ cls: "ttrpg-reader__search-count" });

        const doSearch = debounce(() => this._findAndMark(this.contentSearchEl.value), 150, false);
        this.contentSearchEl.addEventListener("input", doSearch);
        this.contentSearchEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); this._navigateMatch(e.shiftKey ? -1 : 1); }
            if (e.key === "Escape") { this.contentSearchEl.value = ""; this._clearMarks(); }
        });

        this.contentBodyEl = contentWrapEl.createDiv({ cls: "ttrpg-reader__content" });
    }

    destroy() {
        if (this.currentRenderComponent) {
            this.currentRenderComponent.unload();
            this.currentRenderComponent = null;
        }
    }

    _syncTitle() {
        const list = Array.isArray(this.entries) ? this.entries : [];
        const selected = list[this.selectedIndex] || list[this.initialIndex] || list[0] || null;
        const first = list[0] || selected;
        const title = (selected && (selected.collectionName || selected.displayName)) ||
            (first && (first.collectionName || first.displayName)) ||
            "Reader";

        if (this.callbacks && typeof this.callbacks.setTitle === "function") {
            this.callbacks.setTitle(title);
        }

        if (this.subtitleEl) {
            const collectionName = first && first.collectionName;
            const typeLabel = (selected && selected.typeLabel) || (first && first.typeLabel);
            this.subtitleEl.setText(
                collectionName
                    ? String(typeLabel || "Collection") + " • " + String(list.length) + " sections"
                    : String(typeLabel || "Note")
            );
        }
    }

    goBack() {
        if (this.navHistory.length > 0) {
            const prev = this.navHistory.pop();
            this.entries = prev.entries;
            this._syncTitle();
            this.renderSectionList();
            void this.selectIndex(prev.selectedIndex, prev.scrollTop ?? 0);
            this.updateBackButton();
        } else {
            this.callbacks.goBack(this.searchState);
        }
    }

    renderSectionList() {
        this.sectionButtonsEl.replaceChildren();
        this.entries.forEach((entry, index) => {
            const buttonEl = document.createElement("button");
            buttonEl.type = "button";
            buttonEl.className = "ttrpg-reader__section";
            buttonEl.style.setProperty("--ttrpg-depth", String(collectionDepth(entry)));
            if (index === this.selectedIndex) buttonEl.classList.add("is-active");
            buttonEl.addEventListener("click", () => void this.selectIndex(index));

            const titleEl = document.createElement("div");
            titleEl.className = "ttrpg-reader__section-title";
            titleEl.textContent = entry.displayName || "Untitled";
            buttonEl.appendChild(titleEl);

            const metaText = sectionMeta(entry);
            if (metaText) {
                const metaEl = document.createElement("div");
                metaEl.className = "ttrpg-reader__section-meta";
                metaEl.textContent = metaText;
                buttonEl.appendChild(metaEl);
            }
            this.sectionButtonsEl.appendChild(buttonEl);
        });
    }

    async selectIndex(index, restoreScrollTop = null) {
        if (!this.entries.length) return;
        const clamped = Math.max(0, Math.min(index, this.entries.length - 1));
        this.selectedIndex = clamped;
        this.currentEntry = this.entries[clamped];
        const entry = this.currentEntry;
        if (!entry || !entry.file) {
            console.warn("TTRPG reader: missing entry/file", entry);
            if (this.contentTitleEl) this.contentTitleEl.setText("Missing note");
            if (this.contentMetaEl) this.contentMetaEl.setText(entry && entry.path ? entry.path : "No file path");
            if (this.contentBodyEl) {
                this.contentBodyEl.empty();
                this.contentBodyEl.createDiv().setText("This search result points to a note that is no longer available. Rebuild the TTRPG Vault Search index.");
            }
            return;
        }
        let markdown = "";
        try {
            markdown = await this.app.vault.cachedRead(entry.file);
        } catch (error) {
            console.error("TTRPG reader: could not read note", entry, error);
            if (this.contentTitleEl) this.contentTitleEl.setText(entry.displayName || "Unreadable note");
            if (this.contentMetaEl) this.contentMetaEl.setText(entry.path || entry.file.path || "Unknown path");
            if (this.contentBodyEl) {
                this.contentBodyEl.empty();
                this.contentBodyEl.createDiv().setText("This note could not be read. Try rebuilding the index or opening the file directly.");
            }
            return;
        }

        this.updateSectionSelection();
        this.updateNavState();
        this.updateBookmarkButton();
        this.updateBookmarkCollectionButton();
        if (this.copyButtonBlockEl) this.copyButtonBlockEl.disabled = !this.currentEntry;

        // Clear in-note search on section change
        if (this.contentSearchEl) this.contentSearchEl.value = "";
        this._clearMarks();

        if (entry.collectionName) {
            this.contentTitleEl.setText(`${entry.collectionName} - ${entry.displayName}`);
        } else {
            this.contentTitleEl.setText(entry.displayName);
        }
        this.contentMetaEl.setText(entry.path);
        this.contentBodyEl.empty();
        this.contentBodyEl.scrollTop = 0;
        this.subheadingsEl.replaceChildren();

        if (this.currentRenderComponent) this.currentRenderComponent.unload();
        this.currentRenderComponent = new Component();
        this.currentRenderComponent.load();

        try {
            await MarkdownRenderer.render(this.app, markdown, this.contentBodyEl, entry.file.path, this.currentRenderComponent);
        } catch (error) {
            console.error("TTRPG reader render error:", error);
            this.contentBodyEl.createDiv().setText("There was an error rendering this note. You can still open the file directly.");
        }

        this.wireRenderedContentInteractions(entry.file);
        this.buildSubheadingsFromRenderedContent();

        // Restore scroll position when navigating back through history
        if (restoreScrollTop !== null && restoreScrollTop > 0) {
            requestAnimationFrame(() => {
                if (this.contentBodyEl) this.contentBodyEl.scrollTop = restoreScrollTop;
            });
        }
    }

    updateSectionSelection() {
        const buttons = this.sectionButtonsEl.querySelectorAll(".ttrpg-reader__section");
        buttons.forEach((btn, i) => btn.classList.toggle("is-active", i === this.selectedIndex));
        const active = buttons[this.selectedIndex];
        if (active) active.scrollIntoView({ block: "nearest" });
    }

    updateNavState() {
        this.prevButtonEl.disabled = this.selectedIndex <= 0;
        this.nextButtonEl.disabled = this.selectedIndex >= this.entries.length - 1;
    }

    updateBookmarkButton() {
        if (!this.currentEntry) return;
        const bookmarked = this.plugin.isBookmarked(this.currentEntry.path);
        this.bookmarkButtonEl.textContent = bookmarked ? "Bookmarked ★" : "Bookmark";
        this.bookmarkButtonEl.classList.toggle("is-active", bookmarked);
    }

    updateBookmarkCollectionButton() {
        if (!this.currentEntry) return;
        const hasCollection = !!this.currentEntry.collectionPath;
        this.bookmarkCollectionButtonEl.style.display = hasCollection ? "" : "none";
        if (!hasCollection) return;
        const bookmarked = this.plugin.isBookmarked(this.currentEntry.collectionPath);
        const kind = this.currentEntry.collectionKind || "collection";
        const label = kind.charAt(0).toUpperCase() + kind.slice(1);
        this.bookmarkCollectionButtonEl.textContent = bookmarked ? `${label} ★` : `Bookmark ${label}`;
        this.bookmarkCollectionButtonEl.classList.toggle("is-active", bookmarked);
    }

    updateBackButton() {
        if (!this.backButtonEl) return;
        this.backButtonEl.title = this.navHistory.length > 0 ? "Go back" : "Back to search";
    }

    scrollToHeadingFragment(fragment) {
        if (!fragment || !this.contentBodyEl) return;
        const decoded = decodeURIComponent(fragment).trim();
        if (!decoded) return;
        const find = () => {
            try { const el = this.contentBodyEl.querySelector(`#${CSS.escape(decoded)}`); if (el) return el; } catch (_) {}
            const lower = decoded.toLowerCase();
            for (const el of this.contentBodyEl.querySelectorAll("[id]")) {
                if (el.id.toLowerCase() === lower) return el;
            }
            const headings = Array.from(this.contentBodyEl.querySelectorAll("h1,h2,h3,h4,h5,h6"));
            for (const h of headings) { if (h.textContent.trim() === decoded) return h; }
            const normalised = lower.replace(/-/g, " ");
            for (const h of headings) { if (h.textContent.trim().toLowerCase() === normalised) return h; }
            return null;
        };
        const attempt = (delay) => setTimeout(() => {
            const target = find();
            if (target) { target.scrollIntoView({ block: "start", behavior: "smooth" }); }
            else if (delay < 800) { attempt(delay * 2); }
        }, delay);
        attempt(80);
    }

    async navigateToEntry(targetEntry, headingFragment = null) {
        this.navHistory.push({
            entries: this.entries,
            selectedIndex: this.selectedIndex,
            scrollTop: this.contentBodyEl ? this.contentBodyEl.scrollTop : 0,
        });
        const newEntries = this.plugin.getReaderEntriesForEntry(targetEntry);
        const newIndex = Math.max(0, newEntries.findIndex((e) => e.path === targetEntry.path));
        this.entries = newEntries;
        this._syncTitle();
        this.renderSectionList();
        await this.selectIndex(newIndex);
        this.updateBackButton();
        if (headingFragment) this.scrollToHeadingFragment(headingFragment);
    }

    wireRenderedContentInteractions(file) {
        const extractFragment = (href) => { const idx = href.indexOf("#"); return idx !== -1 ? href.slice(idx + 1) : null; };
        const resolveLocalFile = (href) => {
            const filePart = href.split("#")[0];
            if (!filePart) return null;
            return this.app.metadataCache.getFirstLinkpathDest(filePart.replace(/^\/+/, ""), file.path);
        };
        const handleAnchorOnly = (frag) => this.scrollToHeadingFragment(frag);

        const internalLinks = this.contentBodyEl.querySelectorAll("a.internal-link");
        internalLinks.forEach((linkEl) => {
            linkEl.addEventListener("click", (event) => {
                event.preventDefault();
                const rawHref = linkEl.getAttribute("data-href") || linkEl.getAttribute("href") || linkEl.textContent || "";
                if (!rawHref) return;
                if (rawHref.startsWith("#")) { handleAnchorOnly(rawHref.slice(1)); return; }
                const fragment = extractFragment(rawHref);
                const targetFile = resolveLocalFile(rawHref);
                if (targetFile instanceof TFile) {
                    const targetEntry = this.plugin.getEntryByPath(targetFile.path);
                    if (targetEntry) { void this.navigateToEntry(targetEntry, fragment); return; }
                    this.app.workspace.getLeaf(false).openFile(targetFile);
                }
            });
        });

        const regularLinks = this.contentBodyEl.querySelectorAll("a[href]:not(.internal-link)");
        regularLinks.forEach((linkEl) => {
            const rawHref = linkEl.getAttribute("href") || "";
            if (!rawHref) return;
            if (/^(https?:|mailto:)/i.test(rawHref)) {
                linkEl.setAttribute("target", "_blank"); linkEl.setAttribute("rel", "noopener noreferrer"); return;
            }
            linkEl.addEventListener("click", (event) => {
                event.preventDefault();
                if (rawHref.startsWith("#")) { handleAnchorOnly(rawHref.slice(1)); return; }
                const fragment = extractFragment(rawHref);
                const targetFile = resolveLocalFile(rawHref);
                if (targetFile instanceof TFile) {
                    const targetEntry = this.plugin.getEntryByPath(targetFile.path);
                    if (targetEntry) { void this.navigateToEntry(targetEntry, fragment); return; }
                    this.app.workspace.getLeaf(false).openFile(targetFile);
                }
            });
        });

        const images = this.contentBodyEl.querySelectorAll("img");
        images.forEach((img) => { img.setAttribute("loading", "lazy"); img.style.maxWidth = "100%"; img.style.height = "auto"; });
    }

    buildSubheadingsFromRenderedContent() {
        this.subheadingsEl.replaceChildren();
        this.headingTargets = [];
        const headingEls = this.contentBodyEl.querySelectorAll("h1, h2, h3, h4, h5, h6");
        if (!headingEls.length) {
            const emptyEl = document.createElement("div");
            emptyEl.className = "ttrpg-reader__section-meta";
            emptyEl.textContent = "No subheadings in this note.";
            this.subheadingsEl.appendChild(emptyEl);
            return;
        }
        headingEls.forEach((headingEl, index) => {
            const text = headingEl.textContent ? headingEl.textContent.trim() : "";
            if (!text) return;
            const level = Number(headingEl.tagName.slice(1));
            const id = headingEl.id || `ttrpg-reader-heading-${index}`;
            headingEl.id = id;
            this.headingTargets.push({ id, text, level, element: headingEl });
        });
        if (!this.headingTargets.length) {
            const emptyEl = document.createElement("div");
            emptyEl.className = "ttrpg-reader__section-meta";
            emptyEl.textContent = "No subheadings in this note.";
            this.subheadingsEl.appendChild(emptyEl);
            return;
        }
        const baseLevel = Math.min(...this.headingTargets.map((h) => h.level));
        const fragment = document.createDocumentFragment();
        this.headingTargets.forEach((heading) => {
            const buttonEl = document.createElement("button");
            buttonEl.type = "button";
            buttonEl.className = "ttrpg-reader__subheading";
            buttonEl.style.setProperty("--ttrpg-depth", String(Math.max(0, heading.level - baseLevel)));
            buttonEl.addEventListener("click", () => heading.element.scrollIntoView({ block: "start", behavior: "smooth" }));
            const titleEl = document.createElement("div");
            titleEl.className = "ttrpg-reader__subheading-title";
            titleEl.textContent = heading.text;
            buttonEl.appendChild(titleEl);
            fragment.appendChild(buttonEl);
        });
        this.subheadingsEl.appendChild(fragment);
    }

    // ── In-note text search ───────────────────────────────────────────────────

    _findAndMark(query) {
        this._clearMarks();
        if (!query.trim()) return;
        const pattern = new RegExp(escapeRegExp(query.trim()), "gi");
        const contentEl = this.contentBodyEl;
        const walker = document.createTreeWalker(this.contentBodyEl, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const tag = node.parentElement && node.parentElement.tagName.toLowerCase();
                if (tag === "script" || tag === "style") return NodeFilter.FILTER_REJECT;
                // Skip text inside heading elements — injecting <mark> splits heading text
                // nodes, breaking multi-line heading layout and rendering
                let el = node.parentElement;
                while (el && el !== contentEl) {
                    if (/^h[1-6]$/.test(el.tagName.toLowerCase())) return NodeFilter.FILTER_REJECT;
                    el = el.parentElement;
                }
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (pattern.test(node.nodeValue || "")) textNodes.push(node);
            pattern.lastIndex = 0;
        }
        for (const textNode of textNodes) {
            const text = textNode.nodeValue || "";
            pattern.lastIndex = 0;
            const frag = document.createDocumentFragment();
            let lastIndex = 0, match;
            while ((match = pattern.exec(text)) !== null) {
                if (match.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                const mark = document.createElement("mark");
                mark.className = "ttrpg-reader__find-match";
                mark.textContent = match[0];
                frag.appendChild(mark);
                this._searchMatches.push(mark);
                lastIndex = pattern.lastIndex;
            }
            if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
        }
        if (this._searchMatches.length) { this._searchMatchIndex = 0; this._highlightCurrent(); }
        this._updateCount();
    }

    _clearMarks() {
        if (this.contentBodyEl) {
            for (const mark of Array.from(this.contentBodyEl.querySelectorAll("mark.ttrpg-reader__find-match"))) {
                const parent = mark.parentNode;
                if (parent) { parent.replaceChild(document.createTextNode(mark.textContent || ""), mark); parent.normalize(); }
            }
        }
        this._searchMatches = [];
        this._searchMatchIndex = -1;
        this._updateCount();
    }

    _navigateMatch(direction) {
        if (!this._searchMatches.length) return;
        this._searchMatchIndex = (this._searchMatchIndex + direction + this._searchMatches.length) % this._searchMatches.length;
        this._highlightCurrent();
        this._updateCount();
    }

    _highlightCurrent() {
        this._searchMatches.forEach((mark, i) => mark.classList.toggle("is-current", i === this._searchMatchIndex));
        const cur = this._searchMatches[this._searchMatchIndex];
        if (cur) cur.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    _updateCount() {
        if (!this.contentSearchCountEl) return;
        const total = this._searchMatches.length;
        const hasQuery = this.contentSearchEl && this.contentSearchEl.value.trim();
        this.contentSearchCountEl.textContent =
            total === 0 ? (hasQuery ? "No results" : "") : `${this._searchMatchIndex + 1} / ${total}`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TTRPGReaderModal – thin wrapper: hosts ReaderEngine inside a blocking Modal
// ─────────────────────────────────────────────────────────────────────────────
class TTRPGReaderModal extends Modal {
    constructor(app, plugin, entries, initialIndex = 0, searchState = null) {
        super(app);
        this.plugin = plugin;
        this.entries = entries || [];
        this.initialIndex = initialIndex;
        this.searchState = searchState;
        this._engine = null;
    }

    onOpen() {
        this.plugin.registerModal(this);
        this.modalEl.classList.add("ttrpg-reader-modal");
        this.contentEl.empty();
        this.contentEl.classList.add("ttrpg-reader");
        this._engine = new ReaderEngine(this.app, this.plugin, {
            setTitle: (text) => this.titleEl.setText(text),
            goBack: (state) => { this.close(); this.plugin.openSearchModal(state); },
            closeReader: () => this.close(),
            isPopout: false,
        });
        this._engine.build(this.contentEl, this.entries, this.initialIndex, this.searchState);
    }

    onClose() {
        if (this._engine) { this._engine.destroy(); this._engine = null; }
        this.plugin.unregisterModal(this);
        this.contentEl.empty();
    }

    handleBookmarksChanged() { if (this._engine) this._engine.handleBookmarksChanged(); }
    refreshFromPlugin() {}
}

// ─────────────────────────────────────────────────────────────────────────────
// TTRPGReaderView – hosts ReaderEngine inside a leaf / pop-out Obsidian window
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// TTRPGReaderView – tab-based pop-out window (ItemView)
// Each search or reader tab lives in its own panel inside one Obsidian leaf.
// ─────────────────────────────────────────────────────────────────────────────
class TTRPGReaderView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.tabs = [];          // [{id, type, title, panelEl, engine, ro?}]
        this.activeTabId = null;
        this._tabBarEl  = null;
        this._tabBodyEl = null;
        this.displayTitle = "TTRPG";
    }

    getViewType()    { return TTRPG_READER_VIEW_TYPE; }
    getDisplayText() { return this.displayTitle || "TTRPG"; }
    getIcon()        { return "book-open"; }

    _setViewTitle(title) {
        const clean = String(title || "TTRPG").trim() || "TTRPG";
        this.displayTitle = clean;
        if (this.contentEl) this.contentEl.dataset.ttrpgTitle = clean;

        // Obsidian does not always re-read getDisplayText() for custom ItemViews after
        // their internal state changes, especially in pop-out windows. Update the tab
        // header defensively as well.
        try {
            if (this.leaf && this.leaf.tabHeaderInnerTitleEl) {
                const titleEl = this.leaf.tabHeaderInnerTitleEl;
                if (typeof titleEl.setText === "function") titleEl.setText(clean);
                else titleEl.textContent = clean;
            }
            const headerEl = this.leaf && this.leaf.tabHeaderEl;
            const domTitle = headerEl && headerEl.querySelector && headerEl.querySelector(".workspace-tab-header-inner-title");
            if (domTitle) domTitle.textContent = clean;
        } catch (err) {
            console.debug("TTRPG title update failed", err);
        }
    }

    async onOpen() {
        this.plugin.registerModal(this);
        this._setViewTitle("Search");
        this.contentEl.empty();
        this.contentEl.addClass("ttrpg-popout-view");
        this._tabBarEl  = this.contentEl.createDiv({ cls: "ttrpg-popout__tabbar" });
        this._tabBarEl.style.display = "none";
        this._tabBodyEl = this.contentEl.createDiv({ cls: "ttrpg-popout__body" });
        // Tabs are populated by initSearchView() or setReaderState() after setViewState resolves
        const ph = this._tabBodyEl.createDiv({ cls: "ttrpg-popout__panel is-search" });
        ph.createDiv({ cls: "ttrpg-reader__empty", text: "Loading…" });
    }

    // Called by openSearchPopout — sets up a fresh search tab with state
    initSearchView(initialState) {
        this._setViewTitle("Search");
        this._resetTabs();
        this._addSearchTab(initialState);
    }

    // Destroy all tabs (for re-init)
    _resetTabs() {
        for (const tab of this.tabs) {
            if (tab.ro)     { tab.ro.disconnect(); tab.ro = null; }
            if (tab.engine) { tab.engine.destroy(); tab.engine = null; }
            tab.panelEl.remove();
        }
        this.tabs = [];
        this.activeTabId = null;
        // Clear placeholder too
        this._tabBodyEl.empty();
        if (this._tabBarEl) this._tabBarEl.replaceChildren();
    }

    // ── Tab management ────────────────────────────────────────────────────────

    _addSearchTab(initialState) {
        this._setViewTitle("Search");
        const id = "search-" + Date.now();
        const panelEl = this._tabBodyEl.createDiv({ cls: "ttrpg-popout__panel is-search" });
        const tab = { id, type: "search", title: "Search", panelEl, engine: null, ro: null };
        this.tabs.push(tab);
        this._buildSearchPanel(tab, panelEl, initialState);
        this._renderTabBar();
        this._activateTab(id);
        return id;
    }
    _addReaderTab(entries, initialIndex, searchState, options = {}) {
        // If same collection already open in a reader tab, just switch to it.
        const existingId = this._findReaderTabForEntries(entries, initialIndex);
        if (existingId) { this._activateTab(existingId); return existingId; }

        const id = "reader-" + Date.now();
        const first = entries[0];
        const title = (entries[initialIndex] && (entries[initialIndex].collectionName || entries[initialIndex].displayName)) || (first && (first.collectionName || first.displayName)) || "Reader";
        const sourceMode = options && options.sourceMode ? options.sourceMode : "window";
        const isDetachedWindow = sourceMode === "window";
        this.displayTitle = title;
        this._setViewTitle(title);
        const panelEl = this._tabBodyEl.createDiv({ cls: "ttrpg-popout__panel is-reader ttrpg-reader" });
        const tab = { id, type: "reader", title, panelEl, engine: null, ro: null, sourceMode };

        const self = this;
        tab.engine = new ReaderEngine(this.app, this.plugin, {
            setTitle: (text) => { tab.title = text; self._setViewTitle(text); self._renderTabBar(); },
            goBack: (state) => {
                // Close this reader tab and switch to the nearest search tab.
                self._closeTab(id);
                const searchTab = self.tabs.find(t => t.type === "search");
                if (searchTab) self._activateTab(searchTab.id);
            },
            closeReader: null,
            isPopout: isDetachedWindow,
            onPopBackIn: async () => {
                // Move this reader from a detached window back into a normal workspace tab.
                const e = tab.engine ? tab.engine.entries : entries;
                const i = tab.engine ? tab.engine.selectedIndex : initialIndex;
                const s = tab.engine ? tab.engine.searchState : searchState;
                await self.plugin.openReaderNativeTab(e, i, s);
                self._closeTab(id);
            },
        });
        tab.engine.build(panelEl, entries, initialIndex, searchState);

        this.tabs.push(tab);
        this._renderTabBar();
        this._activateTab(id);
        return id;
    }

    _findReaderTabForEntries(entries, initialIndex) {
        if (!entries || !entries[0]) return null;
        const targetPath = entries[initialIndex]?.path || entries[0]?.path;
        const targetColl = entries[0]?.collectionPath;
        for (const tab of this.tabs) {
            if (tab.type !== "reader" || !tab.engine) continue;
            const tabFirst = tab.engine.entries[0];
            if (!tabFirst) continue;
            // Same single-entry view
            if (tabFirst.path === targetPath && tab.engine.entries.length === 1) return tab.id;
            // Same collection
            if (targetColl && tabFirst.collectionPath === targetColl) return tab.id;
        }
        return null;
    }

    _closeTab(id) {
        const idx = this.tabs.findIndex(t => t.id === id);
        if (idx < 0) return;
        const tab = this.tabs[idx];
        if (tab.ro)     { tab.ro.disconnect(); tab.ro = null; }
        if (tab.engine) { tab.engine.destroy(); tab.engine = null; }
        tab.panelEl.remove();
        this.tabs.splice(idx, 1);
        this._renderTabBar();

        if (this.activeTabId === id) {
            const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
            if (next) this._activateTab(next.id);
            else      this.leaf.detach();
        }
    }

    _activateTab(id) {
        this.activeTabId = id;
        for (const tab of this.tabs) {
            if (tab.id === id) {
                tab.panelEl.removeAttribute("hidden");
            } else {
                tab.panelEl.setAttribute("hidden", "");
            }
        }
        this._renderTabBar();
    }

    _renderTabBar() {
        this._tabBarEl.replaceChildren();
        for (const tab of this.tabs) {
            const el = document.createElement("div");
            el.className = "ttrpg-popout__tab" + (tab.id === this.activeTabId ? " is-active" : "");

            const titleEl = document.createElement("span");
            titleEl.className = "ttrpg-popout__tab-title";
            titleEl.textContent = tab.title;
            titleEl.title = tab.title;
            titleEl.addEventListener("click", () => this._activateTab(tab.id));
            el.appendChild(titleEl);

            const closeBtn = document.createElement("button");
            closeBtn.className = "ttrpg-popout__tab-close";
            closeBtn.textContent = "×";
            closeBtn.title = "Close tab";
            closeBtn.addEventListener("click", (e) => { e.stopPropagation(); this._closeTab(tab.id); });
            el.appendChild(closeBtn);

            this._tabBarEl.appendChild(el);
        }
    }

    // ── Inline search panel ───────────────────────────────────────────────────
    _buildSearchPanel(tab, containerEl, initialState) {
        // ── State ─────────────────────────────────────────────────────────────
        let query          = initialState?.query || "";
        let selectedTypes  = new Set(Array.isArray(initialState?.selectedTypes)  ? initialState.selectedTypes  : []);
        let selectedSources= new Set(Array.isArray(initialState?.selectedSources) ? initialState.selectedSources : []);
        let sortMode       = initialState?.sortMode || this.plugin.settings.sortMode || "relevance";
        let showBookmarks  = !!(initialState?.showBookmarksOnly);
        let visibleEntries = [];
        let selectedIndex  = 0;
        let renderedItems  = new Map();
        let virtualQueued  = false;
        let renderGeneration = 0;
        let collReps       = new Set();
        let collCounts     = new Map();

        // ── DOM ───────────────────────────────────────────────────────────────
        const toolbarEl  = containerEl.createDiv({ cls: "ttrpg-vs__toolbar" });
        const inputEl    = toolbarEl.createEl("input", { cls: "ttrpg-vs__search" });
        inputEl.type = "search";
        inputEl.placeholder = "Search spells, items, monsters, adventures…";
        inputEl.spellcheck = false;
        inputEl.value = query;

        const filtersEl = toolbarEl.createDiv({ cls: "ttrpg-vs__filters" });

        const typeWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        typeWrap.createDiv({ cls: "ttrpg-vs__label", text: "Type" });
        const typeButtonEl = typeWrap.createEl("button", { cls: "ttrpg-vs__button" });
        typeButtonEl.type = "button";

        const sourceWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        sourceWrap.createDiv({ cls: "ttrpg-vs__label", text: "Source" });
        const sourceButtonEl = sourceWrap.createEl("button", { cls: "ttrpg-vs__button" });
        sourceButtonEl.type = "button";

        const sortWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        sortWrap.createDiv({ cls: "ttrpg-vs__label", text: "Sort" });
        const sortSelectEl = sortWrap.createEl("select", { cls: "ttrpg-vs__select" });
        [["relevance","Relevance"],["name","Name"],["source","Source"],["type","Type"]].forEach(([v,l]) => {
            const o = document.createElement("option"); o.value = v; o.textContent = l; sortSelectEl.appendChild(o);
        });
        sortSelectEl.value = sortMode;

        // Button row: Bookmarks, Manage, Clear source, Spellbook, Pop Back In
        const btnRowEl = toolbarEl.createDiv({ cls: "ttrpg-vs__button-row" });

        const bookmarksBtn = btnRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Bookmarks" });
        bookmarksBtn.type = "button";

        const manageBtn = btnRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Manage" });
        manageBtn.type = "button";
        manageBtn.style.display = "none";

        const clearSrcBtn = btnRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Clear source" });
        clearSrcBtn.type = "button"; clearSrcBtn.disabled = true;

        const spellbookBtn = btnRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Spellbook" });
        spellbookBtn.type = "button"; spellbookBtn.title = "Open Spellbook";

        const popInBtn = btnRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "⤡ Pop In" });
        popInBtn.type = "button"; popInBtn.title = "Move search back to main window";

        const statsEl    = containerEl.createDiv({ cls: "ttrpg-vs__stats" });
        const viewportEl = containerEl.createDiv({ cls: "ttrpg-vs__viewport" });
        const canvasEl   = viewportEl.createDiv({ cls: "ttrpg-vs__canvas" });
        const emptyEl    = viewportEl.createDiv({ cls: "ttrpg-vs__empty" });
        emptyEl.setText("No matching entries found.");

        // ── Helpers ───────────────────────────────────────────────────────────
        const getSnapshot = () => ({
            query, selectedTypes: Array.from(selectedTypes),
            selectedSources: Array.from(selectedSources),
            sortMode, showBookmarksOnly: showBookmarks,
            scrollTop: viewportEl.scrollTop,
        });

        const updateTypeButton = () => {
            const opts = this.plugin.getTypeOptions();
            for (const k of [...selectedTypes]) { if (!opts.some(o => o.key === k)) selectedTypes.delete(k); }
            if (selectedTypes.size === 0) {
                typeButtonEl.textContent = "All types"; typeButtonEl.classList.remove("is-active");
            } else {
                const labels = opts.filter(o => selectedTypes.has(o.key)).map(o => o.label).join(", ");
                typeButtonEl.textContent = `${selectedTypes.size} type${selectedTypes.size !== 1 ? "s" : ""}`;
                typeButtonEl.title = labels; typeButtonEl.classList.add("is-active");
            }
        };

        const updateSourceButton = () => {
            const opts = this.plugin.getSourceOptions();
            for (const k of [...selectedSources]) { if (!opts.some(o => o.key === k)) selectedSources.delete(k); }
            if (selectedSources.size === 0) {
                sourceButtonEl.textContent = "All sources"; sourceButtonEl.classList.remove("is-active");
                clearSrcBtn.disabled = true;
            } else {
                const n = selectedSources.size;
                sourceButtonEl.textContent = `${n} source${n !== 1 ? "s" : ""}`;
                sourceButtonEl.classList.add("is-active"); clearSrcBtn.disabled = false;
            }
        };

        const updateBookmarksButton = () => {
            const count = this.plugin.getBookmarkedPaths().length;
            bookmarksBtn.textContent = showBookmarks ? `Bookmarks Only (${count})` : `Bookmarks (${count})`;
            bookmarksBtn.classList.toggle("is-active", showBookmarks);
            manageBtn.style.display = showBookmarks ? "" : "none";
        };

        const scheduleVirtualRender = (forceFullRebuild = false) => {
            // Static bounded rendering: rebuild only when the result set changes.
            // Scroll events call this without forceFullRebuild, so ignore them once rows exist.
            if (!forceFullRebuild && renderedItems.size) return;
            if (forceFullRebuild) scheduleVirtualRender.needsFullRebuild = true;
            if (virtualQueued) return;
            virtualQueued = true;
            requestAnimationFrame(() => {
                virtualQueued = false;
                renderVirtualRows();
            });
        };
        scheduleVirtualRender.needsFullRebuild = false;

        const setSelectedIndex = (idx, ensureVisible) => {
            if (!visibleEntries.length) { selectedIndex = 0; return; }
            const c = Math.max(0, Math.min(idx, visibleEntries.length - 1));
            const prevEl = renderedItems.get(selectedIndex);
            const nextEl = renderedItems.get(c);
            if (prevEl && prevEl !== nextEl) prevEl.classList.remove("is-selected");
            if (nextEl) nextEl.classList.add("is-selected");
            selectedIndex = c;
            if (ensureVisible) {
                const top = c * RESULT_ROW_HEIGHT, bottom = top + RESULT_ROW_HEIGHT;
                const vTop = viewportEl.scrollTop, vBot = vTop + viewportEl.clientHeight;
                if (top < vTop) { viewportEl.scrollTop = top; scheduleVirtualRender(); }
                else if (bottom > vBot) { viewportEl.scrollTop = bottom - viewportEl.clientHeight; scheduleVirtualRender(); }
            }
        };

        const openEntry = async (entry) => {
            const isCollRep = collReps.has(entry.path) && !!entry.collectionKind;
            let entries, initialIndex;
            if (isCollRep) {
                entries = this.plugin.getCollectionEntries(entry.collectionPath);
                initialIndex = 0;
            } else {
                entries = this.plugin.getReaderEntriesForEntry(entry);
                initialIndex = Math.max(0, entries.findIndex(e => e.path === entry.path));
            }
            try {
                try {
                await this.plugin.openReaderNativeTab(entries, initialIndex, getSnapshot());
            } catch (err) {
                console.error("TTRPG reader native-tab open failed; falling back to same-window reader tab", err);
                this._addReaderTab(entries, initialIndex, getSnapshot());
            }
            } catch (err) {
                console.error("TTRPG reader native-tab open failed; falling back to same-window reader tab", err);
                this._addReaderTab(entries, initialIndex, getSnapshot());
            }
        };

        const createResultEl = (entry, index) => {
            const itemEl = document.createElement("div");
            itemEl.className = "ttrpg-vs__result";
            if (index === selectedIndex) itemEl.classList.add("is-selected");
            itemEl.addEventListener("mouseenter", () => setSelectedIndex(index, false));
            itemEl.addEventListener("click", () => openEntry(entry));

            const isCollRep = collReps.has(entry.path) && !!entry.collectionKind;
            const topEl = document.createElement("div"); topEl.className = "ttrpg-vs__top";
            const mainEl = document.createElement("div"); mainEl.className = "ttrpg-vs__main";
            const titleEl = document.createElement("div"); titleEl.className = "ttrpg-vs__title";

            if (isCollRep) {
                const s = document.createElement("span"); s.className = "ttrpg-vs__title-piece ttrpg-vs__title-chapter";
                s.innerHTML = highlightMatch(entry.collectionName, query); titleEl.appendChild(s);
            } else if (entry.collectionKind) {
                const c = document.createElement("span"); c.className = "ttrpg-vs__title-piece ttrpg-vs__title-collection";
                c.innerHTML = highlightMatch(entry.collectionName, query); titleEl.appendChild(c);
                const sep = document.createElement("span"); sep.className = "ttrpg-vs__title-sep"; sep.textContent = "-"; titleEl.appendChild(sep);
                const ch = document.createElement("span"); ch.className = "ttrpg-vs__title-piece ttrpg-vs__title-chapter";
                ch.innerHTML = highlightMatch(entry.displayName, query); titleEl.appendChild(ch);
            } else {
                const s = document.createElement("span"); s.className = "ttrpg-vs__title-piece ttrpg-vs__title-chapter";
                s.innerHTML = highlightMatch(entry.displayName, query); titleEl.appendChild(s);
            }
            mainEl.appendChild(titleEl);

            const metaEl = document.createElement("div"); metaEl.className = "ttrpg-vs__meta";
            if (entry.sourceLabel) {
                const chip = document.createElement("button"); chip.type = "button";
                chip.className = "ttrpg-vs__chip ttrpg-vs__chip--clickable";
                const sourceDisplayLabel = this.plugin.getSourceDisplayLabel(entry.sourceKey, entry.sourceLabel);
                chip.textContent = sourceDisplayLabel; chip.title = `Filter by source: ${sourceDisplayLabel} (right-click to edit chip)`;
                this.plugin.applySourceChipStyle(chip, entry.sourceKey);
                chip.addEventListener("click", (e) => {
                    e.preventDefault(); e.stopPropagation();
                    selectedSources = new Set([entry.sourceKey]);
                    updateSourceButton(); selectedIndex = 0; refreshResults(true);
                });
                chip.addEventListener("contextmenu", (e) => {
                    e.preventDefault(); e.stopPropagation();
                    new SourceChipEditModal(this.app, this.plugin, entry.sourceKey, entry.sourceLabel).open();
                });
                metaEl.appendChild(chip);
            }
            const metaTextEl = document.createElement("span"); metaTextEl.className = "ttrpg-vs__meta-text";
            if (isCollRep) { const cnt = collCounts.get(entry.collectionPath) || 1; metaTextEl.textContent = `${entry.typeLabel} • ${cnt} section${cnt !== 1 ? "s" : ""}`; }
            else if (entry.collectionKind) { metaTextEl.textContent = entry.isOverview ? `${entry.typeLabel} overview` : `${entry.typeLabel} chapter`; }
            else { const sec = entry.fileLabel !== entry.displayName ? entry.fileLabel : (entry.aliases[0] || entry.typeLabel); metaTextEl.innerHTML = highlightMatch(sec, query); }
            metaEl.appendChild(metaTextEl);
            mainEl.appendChild(metaEl);

            const rightEl = document.createElement("div"); rightEl.className = "ttrpg-vs__right";
            const badge = document.createElement("button"); badge.type = "button";
            badge.className = "ttrpg-vs__badge ttrpg-vs__badge--clickable";
            badge.textContent = entry.typeLabel; badge.title = `Filter by type: ${entry.typeLabel}`;
            badge.addEventListener("click", (e) => {
                e.preventDefault(); e.stopPropagation();
                selectedTypes = new Set([entry.typeKey]);
                updateTypeButton(); selectedIndex = 0; refreshResults(true);
            });
            rightEl.appendChild(badge);

            const star = document.createElement("button"); star.type = "button"; star.className = "ttrpg-vs__star";
            const refreshStar = () => { const bm = this.plugin.isBookmarked(entry.path); star.textContent = bm ? "★" : "☆"; star.classList.toggle("is-active", bm); };
            refreshStar();
            star.addEventListener("click", async (e) => { e.preventDefault(); e.stopPropagation(); await this.plugin.toggleBookmark(entry.path); refreshStar(); });
            rightEl.appendChild(star);

            topEl.appendChild(mainEl); topEl.appendChild(rightEl);
            const pathEl = document.createElement("div"); pathEl.className = "ttrpg-vs__path";
            pathEl.innerHTML = highlightMatch(entry.path, query);
            itemEl.appendChild(topEl); itemEl.appendChild(pathEl);
            return itemEl;
        };

        const renderVirtualRows = () => {
            scheduleVirtualRender.needsFullRebuild = false;
            const generation = ++renderGeneration;
            renderedItems.clear();
            canvasEl.replaceChildren();

            if (!visibleEntries.length) return;

            const chunkSize = 40;
            let i = 0;
            const renderChunk = () => {
                if (generation !== renderGeneration) return;
                const frag = document.createDocumentFragment();
                const end = Math.min(visibleEntries.length, i + chunkSize);
                for (; i < end; i++) {
                    const el = createResultEl(visibleEntries[i], i);
                    el.style.top = `${i * RESULT_ROW_HEIGHT}px`;
                    frag.appendChild(el);
                    renderedItems.set(i, el);
                }
                if (frag.childNodes.length) canvasEl.appendChild(frag);
                if (i < visibleEntries.length) requestAnimationFrame(renderChunk);
            };
            renderChunk();
        };

        const refreshResults = (resetScroll) => {
            const titleOnly = !!this.plugin.settings.searchTitleOnly;
            let entries = this.plugin.getEntries();
            if (showBookmarks) {
                const bm = new Set(this.plugin.getBookmarkedPaths());
                entries = entries.filter(e => bm.has(e.path) || (e.collectionKind && bm.has(e.collectionPath)));
            }
            if (selectedTypes.size   > 0) entries = entries.filter(e => selectedTypes.has(e.typeKey));
            if (selectedSources.size > 0) entries = entries.filter(e => selectedSources.has(e.sourceKey));
            entries = sortEntries(entries, sortMode, query, titleOnly);
            if (query.trim()) {
                entries = entries.filter(e => scoreEntry(e, query, titleOnly) >= 0);
                if (sortMode === "relevance") entries = sortEntries(entries, "relevance", query, titleOnly);
            }
            collReps = new Set(); collCounts = new Map();
            const seen = new Set();
            for (const e of entries) { if (e.collectionKind) collCounts.set(e.collectionPath, (collCounts.get(e.collectionPath) || 0) + 1); }
            const deduped = [];
            for (const e of entries) {
                if (!e.collectionKind) { deduped.push(e); continue; }
                if (seen.has(e.collectionPath)) continue;
                seen.add(e.collectionPath); collReps.add(e.path); deduped.push(e);
            }
            const bookmarkOrderedEntries = showBookmarksOnly ? this.plugin.sortEntriesByBookmarkOrder(deduped, selectedBookmarkGroup) : deduped;
            visibleEntries = bookmarkOrderedEntries.slice(0, this.plugin.settings.maxResults);
            if (!visibleEntries.length) selectedIndex = 0;
            else selectedIndex = Math.max(0, Math.min(selectedIndex, visibleEntries.length - 1));
            if (resetScroll) viewportEl.scrollTop = 0;
            statsEl.textContent = `${entries.length} matching • ${visibleEntries.length} shown • ${this.plugin.getEntries().length} indexed`;
            canvasEl.style.height  = `${visibleEntries.length * RESULT_ROW_HEIGHT}px`;
            canvasEl.style.display = visibleEntries.length ? "block" : "none";
            emptyEl.style.display  = visibleEntries.length ? "none"  : "block";
            scheduleVirtualRender(true);
        };

        const refreshDebounced = debounce(() => refreshResults(true), 40, false);

        // ── ResizeObserver: store real height so render never uses stale 0 ──────
        let viewportH = 0;
        if (typeof ResizeObserver !== "undefined") {
            tab.ro = new ResizeObserver(entries => {
                viewportH = entries[0].contentRect.height;
                scheduleVirtualRender();
            });
            tab.ro.observe(viewportEl);
        }

        // ── Event listeners ───────────────────────────────────────────────────
        inputEl.addEventListener("input", () => { query = inputEl.value; selectedIndex = 0; refreshDebounced(); });
        inputEl.addEventListener("keydown", (e) => {
            if (!visibleEntries.length) return;
            if (e.key === "ArrowDown")  { e.preventDefault(); setSelectedIndex(selectedIndex + 1, true); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(selectedIndex - 1, true); }
            else if (e.key === "Enter")   { e.preventDefault(); const sel = visibleEntries[selectedIndex]; if (sel) openEntry(sel); }
        });
        typeButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new TypePickerModal(this.app, this.plugin.getTypeOptions(), new Set(selectedTypes), (keys) => {
                selectedTypes = keys; updateTypeButton(); selectedIndex = 0; refreshResults(true);
            }).open();
        });
        sourceButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new SourcePickerModal(this.app, this.plugin.getSourceOptions(), new Set(selectedSources), (keys) => {
                selectedSources = keys; updateSourceButton(); selectedIndex = 0; refreshResults(true);
            }).open();
        });
        sortSelectEl.addEventListener("change", () => { sortMode = sortSelectEl.value; refreshResults(false); });
        bookmarksBtn.addEventListener("click", () => {
            showBookmarks = !showBookmarks;
            updateBookmarksButton(); selectedIndex = 0; refreshResults(true);
        });
        manageBtn.addEventListener("click", () => new BookmarkManagerModal(this.app, this.plugin).open());
        clearSrcBtn.addEventListener("click", () => {
            selectedSources = new Set(); updateSourceButton(); selectedIndex = 0; refreshResults(true);
        });
        spellbookBtn.addEventListener("click", () => this.plugin.openSpellbookModal(getSnapshot()));
        popInBtn.addEventListener("click", () => {
            // Close this search tab and open the search as a normal modal.
            const snap = Object.assign({}, getSnapshot(), { forceModal: true });
            this._closeTab(tab.id);
            this.plugin.openSearchModal(snap);
        });
        viewportEl.addEventListener("scroll", () => scheduleVirtualRender(), { passive: true });

        if (initialState?.scrollTop) {
            requestAnimationFrame(() => requestAnimationFrame(() => { viewportEl.scrollTop = initialState.scrollTop; }));
        }

        updateTypeButton(); updateSourceButton(); updateBookmarksButton();
        refreshResults(false);
        window.setTimeout(() => inputEl.focus(), 0);
    }

    // ── Called externally by openReaderInWindow (pop out from modal reader) ────
    setReaderState(entries, initialIndex, searchState, sourceMode = "window") {
        const list = Array.isArray(entries) ? entries : [];
        const safeIndex = Math.max(0, Math.min(typeof initialIndex === "number" ? initialIndex : 0, Math.max(0, list.length - 1)));
        const activeEntry = list[safeIndex] || list[0] || null;
        this.displayTitle = (activeEntry && (activeEntry.collectionName || activeEntry.displayName)) || "TTRPG";

        // sourceMode controls the reader transfer button:
        //   "native" => normal workspace tab, show ⤢ Pop Out
        //   "window" => detached/pop-out window, show ⤡ Pop In
        // Older applicators passed true for native; keep that compatible.
        const mode = sourceMode === true ? "native" : (sourceMode || "window");

        if (!this._tabBodyEl || !this._tabBarEl || !this._tabBodyEl.isConnected) {
            this.contentEl.empty();
            this.contentEl.addClass("ttrpg-popout-view");
            this._tabBarEl = this.contentEl.createDiv({ cls: "ttrpg-popout__tabbar" });
            this._tabBarEl.style.display = "none";
            this._tabBodyEl = this.contentEl.createDiv({ cls: "ttrpg-popout__body" });
        }

        this._resetTabs();
        this._addReaderTab(list, safeIndex, searchState, { sourceMode: mode });
    }

    async onClose() {
        for (const tab of this.tabs) {
            if (tab.ro)     { tab.ro.disconnect(); tab.ro = null; }
            if (tab.engine) { tab.engine.destroy(); tab.engine = null; }
        }
        this.tabs = [];
        this.plugin.unregisterModal(this);
    }

    handleBookmarksChanged() {
        for (const tab of this.tabs) {
            if (tab.engine) tab.engine.handleBookmarksChanged();
        }
    }

    refreshFromPlugin() {}
}



class BookmarkManagerModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
        this.selectedGroupId = null; // null = ungrouped view
    }

    onOpen() {
        this.modalEl.classList.add("ttrpg-vs-bm-modal");
        this.contentEl.empty();
        this.contentEl.classList.add("ttrpg-vs-bm");

        this.titleEl.setText("Manage Bookmarks");

        // Drag state – shared across render cycles
        this._draggedGroupId = null;
        this._draggedBookmarkPath = null;
        this._bmListScrollGroupId = null; // track which group the list is showing so scroll restore works

        // Sidebar: groups list
        const sidebarEl = this.contentEl.createDiv({ cls: "ttrpg-vs-bm__sidebar" });

        const sidebarHeaderEl = sidebarEl.createDiv({ cls: "ttrpg-vs-bm__sidebar-header" });
        sidebarHeaderEl.textContent = "Groups";

        this.groupsEl = sidebarEl.createDiv({ cls: "ttrpg-vs-bm__groups" });

        const addGroupEl = sidebarEl.createDiv({ cls: "ttrpg-vs-bm__add-group" });
        this.newGroupInputEl = addGroupEl.createEl("input", { cls: "ttrpg-vs-bm__add-input" });
        this.newGroupInputEl.placeholder = "New group name…";
        this.newGroupInputEl.spellcheck = false;
        this.newGroupInputEl.addEventListener("keydown", async (e) => {
            if (e.key === "Enter") await this.createGroup();
        });
        const addBtnEl = addGroupEl.createEl("button", { cls: "ttrpg-vs-bm__add-btn", text: "Add" });
        addBtnEl.type = "button";
        addBtnEl.addEventListener("click", () => this.createGroup());

        // Main: bookmark list
        const mainEl = this.contentEl.createDiv({ cls: "ttrpg-vs-bm__main" });

        this.mainHeaderEl = mainEl.createDiv({ cls: "ttrpg-vs-bm__main-header" });

        this.bookmarkListEl = mainEl.createDiv({ cls: "ttrpg-vs-bm__list" });

        this.renderGroups();
        this.renderBookmarks();
    }

    onClose() {
        this.contentEl.empty();
    }

    async createGroup() {
        const name = (this.newGroupInputEl.value || "").trim();
        if (!name) return;
        await this.plugin.createBookmarkGroup(name);
        this.newGroupInputEl.value = "";
        this.renderGroups();
        this.renderBookmarks();
    }

    // Returns paths in a group in their saved display order (named groups only).
    // "All" and "Ungrouped" always stay alphabetical.
    getGroupOrderedPaths(groupId) {
        const allPaths = this.plugin.getBookmarkedPaths();

        if (groupId === null) {
            // All – alphabetical (no custom order for the combined view)
            return [...allPaths].sort((a, b) => COLLATOR.compare(a, b));
        }

        if (groupId === "ungrouped") {
            const ungroupedPaths = allPaths.filter((p) => !this.plugin.getBookmarkGroupForPath(p));
            const savedOrder = this.plugin.getBookmarkGroupOrder("__ungrouped");
            if (!savedOrder) return ungroupedPaths;
            const ordered = savedOrder.filter((p) => ungroupedPaths.includes(p));
            const missing = ungroupedPaths.filter((p) => !ordered.includes(p));
            return [...ordered, ...missing];
        }

        // Named group – use saved order if present, then append any un-ordered paths
        const groupPaths = allPaths.filter(
            (p) => this.plugin.getBookmarkGroupForPath(p) === groupId
        );
        const savedOrder = this.plugin.getBookmarkGroupOrder(groupId);
        if (!savedOrder) return groupPaths;

        const ordered = savedOrder.filter((p) => groupPaths.includes(p));
        const missing = groupPaths.filter((p) => !ordered.includes(p));
        return [...ordered, ...missing];
    }

    renderGroups() {
        this.groupsEl.replaceChildren();
        const groups = this.plugin.getBookmarkGroups();
        const paths = this.plugin.getBookmarkedPaths();
        const ungroupedCount = paths.filter((p) => !this.plugin.getBookmarkGroupForPath(p)).length;

        // --- Drag helpers for groups ---
        const clearDropIndicators = () =>
            this.groupsEl.querySelectorAll(".ttrpg-vs-bm__drop-indicator").forEach((el) => el.remove());

        const commitGroupReorder = async (draggedId, targetId, insertAfter) => {
            const gs = this.plugin.getBookmarkGroups();
            const fromIdx = gs.findIndex((g) => g.id === draggedId);
            const toIdx = gs.findIndex((g) => g.id === targetId);
            if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
            const next = [...gs];
            const [moved] = next.splice(fromIdx, 1);
            const newTo = next.findIndex((g) => g.id === targetId);
            next.splice(insertAfter ? newTo + 1 : newTo, 0, moved);
            await this.plugin.setBookmarkGroupsOrder(next);
            this.renderGroups();
            this.renderBookmarks();
        };

        const makeDraggableGroup = (el, groupId) => {
            el.draggable = true;
            el.addEventListener("dragstart", (e) => {
                this._draggedGroupId = groupId;
                e.dataTransfer.effectAllowed = "move";
                setTimeout(() => el.classList.add("is-dragging"), 0);
            });
            el.addEventListener("dragend", () => {
                this._draggedGroupId = null;
                el.classList.remove("is-dragging");
                clearDropIndicators();
            });
            el.addEventListener("dragover", (e) => {
                if (!this._draggedGroupId || this._draggedGroupId === groupId) return;
                e.preventDefault();
                clearDropIndicators();
                const rect = el.getBoundingClientRect();
                const indicator = document.createElement("div");
                indicator.className = "ttrpg-vs-bm__drop-indicator";
                if (e.clientY > rect.top + rect.height / 2) el.after(indicator);
                else el.before(indicator);
            });
            el.addEventListener("drop", (e) => {
                e.preventDefault();
                if (!this._draggedGroupId || this._draggedGroupId === groupId) return;
                const rect = el.getBoundingClientRect();
                void commitGroupReorder(
                    this._draggedGroupId,
                    groupId,
                    e.clientY > rect.top + rect.height / 2
                );
            });
        };

        // "All" — not draggable
        const allEl = document.createElement("div");
        allEl.className = "ttrpg-vs-bm__group-item" + (this.selectedGroupId === null ? " is-active" : "");
        const allNameEl = document.createElement("div");
        allNameEl.className = "ttrpg-vs-bm__group-name";
        allNameEl.textContent = "All bookmarks";
        const allCountEl = document.createElement("div");
        allCountEl.className = "ttrpg-vs-bm__group-count";
        allCountEl.textContent = String(paths.length);
        allEl.appendChild(allNameEl);
        allEl.appendChild(allCountEl);
        allEl.addEventListener("click", () => {
            this.selectedGroupId = null;
            this.renderGroups();
            this.renderBookmarks();
        });
        this.groupsEl.appendChild(allEl);

        // "Ungrouped" — not draggable
        if (ungroupedCount > 0) {
            const unEl = document.createElement("div");
            unEl.className = "ttrpg-vs-bm__group-item" + (this.selectedGroupId === "ungrouped" ? " is-active" : "");
            const unNameEl = document.createElement("div");
            unNameEl.className = "ttrpg-vs-bm__group-name";
            unNameEl.textContent = "Ungrouped";
            const unCountEl = document.createElement("div");
            unCountEl.className = "ttrpg-vs-bm__group-count";
            unCountEl.textContent = String(ungroupedCount);
            unEl.appendChild(unNameEl);
            unEl.appendChild(unCountEl);
            unEl.addEventListener("click", () => {
                this.selectedGroupId = "ungrouped";
                this.renderGroups();
                this.renderBookmarks();
            });
            this.groupsEl.appendChild(unEl);
        }

        // Named groups — draggable
        for (const group of groups) {
            const count = paths.filter((p) => this.plugin.getBookmarkGroupForPath(p) === group.id).length;
            const groupEl = document.createElement("div");
            groupEl.className = "ttrpg-vs-bm__group-item" + (this.selectedGroupId === group.id ? " is-active" : "");

            // Drag handle
            const handleEl = document.createElement("div");
            handleEl.className = "ttrpg-vs-bm__drag-handle";
            handleEl.textContent = "⠿";
            handleEl.title = "Drag to reorder";
            groupEl.appendChild(handleEl);

            const nameEl = document.createElement("div");
            nameEl.className = "ttrpg-vs-bm__group-name";
            nameEl.textContent = group.name;
            nameEl.contentEditable = "false";
            nameEl.addEventListener("dblclick", () => {
                nameEl.contentEditable = "true";
                nameEl.focus();
                const sel = window.getSelection();
                if (sel) sel.selectAllChildren(nameEl);
                nameEl.addEventListener("blur", async () => {
                    nameEl.contentEditable = "false";
                    const newName = (nameEl.textContent || "").trim();
                    if (newName && newName !== group.name) {
                        await this.plugin.renameBookmarkGroup(group.id, newName);
                    } else {
                        nameEl.textContent = group.name;
                    }
                    this.renderGroups();
                }, { once: true });
            });

            const countEl = document.createElement("div");
            countEl.className = "ttrpg-vs-bm__group-count";
            countEl.textContent = String(count);

            const deleteEl = document.createElement("button");
            deleteEl.type = "button";
            deleteEl.className = "ttrpg-vs-bm__group-delete";
            deleteEl.textContent = "×";
            deleteEl.title = `Delete group "${group.name}" (bookmarks move to Ungrouped)`;
            deleteEl.addEventListener("click", async (e) => {
                e.stopPropagation();
                await this.plugin.deleteBookmarkGroup(group.id);
                if (this.selectedGroupId === group.id) this.selectedGroupId = null;
                this.renderGroups();
                this.renderBookmarks();
            });

            groupEl.appendChild(nameEl);
            groupEl.appendChild(countEl);
            groupEl.appendChild(deleteEl);
            groupEl.addEventListener("click", () => {
                this.selectedGroupId = group.id;
                this.renderGroups();
                this.renderBookmarks();
            });

            makeDraggableGroup(groupEl, group.id);
            this.groupsEl.appendChild(groupEl);
        }
    }

    renderBookmarks() {
        const paths = this.plugin.getBookmarkedPaths();
        const groups = this.plugin.getBookmarkGroups();

        // Save scroll only when staying in the same group view
        const savedScrollGroupId = this._lastScrollGroupId;
        const savedScrollTop =
            savedScrollGroupId === this.selectedGroupId
                ? this.bookmarkListEl?.scrollTop || 0
                : 0;
        this._lastScrollGroupId = this.selectedGroupId;

        let filtered;
        let headerText;
        // Drag is enabled in any single-group view (named OR ungrouped), but not in "All"
        const isDraggable = this.selectedGroupId !== null;

        if (this.selectedGroupId === null) {
            filtered = this.getGroupOrderedPaths(null);
            headerText = `All Bookmarks (${paths.length})`;
        } else if (this.selectedGroupId === "ungrouped") {
            filtered = this.getGroupOrderedPaths("ungrouped");
            headerText = `Ungrouped (${filtered.length})`;
        } else {
            filtered = this.getGroupOrderedPaths(this.selectedGroupId);
            const group = groups.find((g) => g.id === this.selectedGroupId);
            headerText = `${group ? group.name : "Group"} (${filtered.length})`;
        }

        if (this.mainHeaderEl) this.mainHeaderEl.textContent = headerText;
        this.bookmarkListEl.replaceChildren();

        if (!filtered.length) {
            const emptyEl = document.createElement("div");
            emptyEl.className = "ttrpg-vs-bm__empty";
            emptyEl.textContent = "No bookmarks here.";
            this.bookmarkListEl.appendChild(emptyEl);
            return;
        }

        // --- Drag helpers (named groups + ungrouped) ---
        const clearDropIndicators = () =>
            this.bookmarkListEl
                .querySelectorAll(".ttrpg-vs-bm__drop-indicator")
                .forEach((el) => el.remove());

        const commitBookmarkReorder = async (draggedPath, targetPath, insertAfter) => {
            const current = this.getGroupOrderedPaths(this.selectedGroupId);
            const fromIdx = current.indexOf(draggedPath);
            const toIdx = current.indexOf(targetPath);
            if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
            const next = [...current];
            const [moved] = next.splice(fromIdx, 1);
            const newTo = next.indexOf(targetPath);
            next.splice(insertAfter ? newTo + 1 : newTo, 0, moved);
            // Use "__ungrouped" as the storage key for the ungrouped view order
            const orderKey = this.selectedGroupId === "ungrouped" ? "__ungrouped" : this.selectedGroupId;
            await this.plugin.setBookmarkGroupOrder(orderKey, next);
            this.renderBookmarks();
        };

        const makeDraggableEntry = (el, path) => {
            el.draggable = true;
            el.addEventListener("dragstart", (e) => {
                this._draggedBookmarkPath = path;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", path); // required for Firefox
                setTimeout(() => el.classList.add("is-dragging"), 0);
            });
            el.addEventListener("dragend", () => {
                this._draggedBookmarkPath = null;
                el.classList.remove("is-dragging");
                clearDropIndicators();
            });
            el.addEventListener("dragover", (e) => {
                if (!this._draggedBookmarkPath || this._draggedBookmarkPath === path) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                clearDropIndicators();
                const rect = el.getBoundingClientRect();
                const indicator = document.createElement("div");
                indicator.className = "ttrpg-vs-bm__drop-indicator";
                if (e.clientY > rect.top + rect.height / 2) el.after(indicator);
                else el.before(indicator);
            });
            el.addEventListener("drop", (e) => {
                e.preventDefault();
                if (!this._draggedBookmarkPath || this._draggedBookmarkPath === path) return;
                const rect = el.getBoundingClientRect();
                void commitBookmarkReorder(
                    this._draggedBookmarkPath,
                    path,
                    e.clientY > rect.top + rect.height / 2
                );
            });
        };

        const fragment = document.createDocumentFragment();

        for (const path of filtered) {
            // For file paths, look up the entry directly.
            // For collection/folder paths (bookmarked adventures), find via the collection.
            let entry = this.plugin.getEntryByPath(path);
            if (!entry) {
                // Check if this is a bookmarked collection path (a folder, not a file)
                const collEntries = this.plugin.getEntries().filter((e) => e.collectionPath === path);
                if (collEntries.length) {
                    entry = collEntries.find((e) => e.isOverview) || collEntries[0];
                }
            }

            const groupId = this.plugin.getBookmarkGroupForPath(path);

            const entryEl = document.createElement("div");
            entryEl.className = "ttrpg-vs-bm__entry";

            // Drag handle (all single-group views)
            if (isDraggable) {
                const handleEl = document.createElement("div");
                handleEl.className = "ttrpg-vs-bm__drag-handle";
                handleEl.textContent = "⠿";
                handleEl.title = "Drag to reorder";
                entryEl.appendChild(handleEl);
            }

            const infoEl = document.createElement("div");
            infoEl.className = "ttrpg-vs-bm__entry-info";

            const nameEl = document.createElement("div");
            nameEl.className = "ttrpg-vs-bm__entry-name";
            if (entry) {
                // Show the collection name if this is an adventure/book bookmark (folder path)
                if (entry.collectionName && entry.collectionPath === path) {
                    nameEl.textContent = `${entry.collectionName} (${entry.typeLabel})`;
                } else if (entry.collectionName) {
                    nameEl.textContent = `${entry.collectionName} – ${entry.displayName}`;
                } else {
                    nameEl.textContent = entry.displayName;
                }
            } else {
                nameEl.textContent = path.split("/").pop().replace(/\.md$/i, "");
            }

            const metaEl = document.createElement("div");
            metaEl.className = "ttrpg-vs-bm__entry-meta";
            const metaParts = [];
            if (entry) {
                if (entry.typeLabel) metaParts.push(entry.typeLabel);
                if (entry.sourceLabel) metaParts.push(entry.sourceLabel);
            }
            metaParts.push(path);
            metaEl.textContent = metaParts.join(" · ");

            infoEl.appendChild(nameEl);
            infoEl.appendChild(metaEl);

            // Group selector
            const selectEl = document.createElement("select");
            selectEl.className = "ttrpg-vs-bm__entry-select";

            const noneOpt = document.createElement("option");
            noneOpt.value = "";
            noneOpt.textContent = "Ungrouped";
            selectEl.appendChild(noneOpt);

            for (const group of groups) {
                const opt = document.createElement("option");
                opt.value = group.id;
                opt.textContent = group.name;
                selectEl.appendChild(opt);
            }

            selectEl.value = groupId ?? "";
            selectEl.addEventListener("change", async () => {
                const newGroupId = selectEl.value || null;
                await this.plugin.setBookmarkGroup(path, newGroupId);
                this.renderGroups();
                this.renderBookmarks();
            });

            entryEl.appendChild(infoEl);
            entryEl.appendChild(selectEl);
            if (isDraggable) makeDraggableEntry(entryEl, path);
            fragment.appendChild(entryEl);
        }

        this.bookmarkListEl.appendChild(fragment);

        if (savedScrollTop > 0) {
            requestAnimationFrame(() => {
                if (this.bookmarkListEl) this.bookmarkListEl.scrollTop = savedScrollTop;
            });
        }
    }
}

class TypePickerModal extends Modal {
    constructor(app, options, initialSelection, onApply) {
        super(app);
        this.options = options; // [{key, label, count}]
        this.onApply = onApply;
        this.query = "";
        // If initialSelection is empty that means "show all" → pre-check every box
        this.pendingKeys =
            initialSelection.size === 0
                ? new Set(options.map((o) => o.key))
                : new Set(initialSelection);
    }

    onOpen() {
        this.modalEl.classList.add("ttrpg-vs-type-modal");
        this.contentEl.empty();
        this.contentEl.classList.add("ttrpg-vs-type");

        this.titleEl.setText("Filter by Type");

        this.inputEl = this.contentEl.createEl("input", {
            cls: "ttrpg-vs-source__search",
        });
        this.inputEl.type = "search";
        this.inputEl.placeholder = "Search types…";
        this.inputEl.spellcheck = false;
        this.inputEl.addEventListener("input", () => {
            this.query = this.inputEl.value;
            this.renderList();
        });

        this.listEl = this.contentEl.createDiv({ cls: "ttrpg-vs-source__list" });

        const actionsEl = this.contentEl.createDiv({ cls: "ttrpg-vs-type__actions" });

        const selectAllEl = actionsEl.createEl("button", {
            cls: "ttrpg-vs__toolbutton",
            text: "Select all",
        });
        selectAllEl.type = "button";
        selectAllEl.addEventListener("click", () => {
            this.options.forEach((o) => this.pendingKeys.add(o.key));
            this.renderList();
        });

        const clearAllEl = actionsEl.createEl("button", {
            cls: "ttrpg-vs__toolbutton",
            text: "Clear all",
        });
        clearAllEl.type = "button";
        clearAllEl.addEventListener("click", () => {
            this.pendingKeys.clear();
            this.renderList();
        });

        const applyEl = actionsEl.createEl("button", {
            cls: "ttrpg-vs__toolbutton is-active",
            text: "Apply",
        });
        applyEl.type = "button";
        applyEl.addEventListener("click", () => {
            // All boxes checked = same as "show all" → pass empty Set
            const resultSet =
                this.pendingKeys.size >= this.options.length
                    ? new Set()
                    : new Set(this.pendingKeys);
            this.onApply(resultSet);
            this.close();
        });

        this.renderList();
        window.setTimeout(() => this.inputEl.focus(), 0);
    }

    onClose() {
        this.contentEl.empty();
    }

    renderList() {
        const query = this.query.trim().toLowerCase();

        const filtered = this.options.filter((option) => {
            if (!query) return true;
            return String(option.label || "").toLowerCase().includes(query);
        });

        this.listEl.replaceChildren();

        if (!filtered.length) {
            const emptyEl = document.createElement("div");
            emptyEl.className = "ttrpg-vs__empty";
            emptyEl.textContent = "No matching types.";
            this.listEl.appendChild(emptyEl);
            return;
        }

        const fragment = document.createDocumentFragment();

        filtered.forEach((option) => {
            const labelEl = document.createElement("label");
            labelEl.className = "ttrpg-vs-type__item";

            const checkboxEl = document.createElement("input");
            checkboxEl.type = "checkbox";
            checkboxEl.className = "ttrpg-vs-type__checkbox";
            checkboxEl.checked = this.pendingKeys.has(option.key);
            checkboxEl.addEventListener("change", () => {
                if (checkboxEl.checked) {
                    this.pendingKeys.add(option.key);
                } else {
                    this.pendingKeys.delete(option.key);
                }
            });

            const nameEl = document.createElement("span");
            nameEl.className = "ttrpg-vs-source__name";
            nameEl.textContent = option.label;

            const countEl = document.createElement("span");
            countEl.className = "ttrpg-vs-source__count";
            countEl.textContent = String(option.count);

            labelEl.appendChild(checkboxEl);
            labelEl.appendChild(nameEl);
            labelEl.appendChild(countEl);
            fragment.appendChild(labelEl);
        });

        this.listEl.appendChild(fragment);
    }
}

class TTRPGSearchButtonInsertModal extends Modal {
    constructor(app, plugin, editor) { super(app); this.plugin = plugin; this.editor = editor; this.selectedType = "Any"; this.selectedName = ""; this.selectedChapter = ""; this.selectedChapterPath = ""; }
    onOpen() {
        this.modalEl.classList.add("ttrpg-search-button-insert-modal"); this.titleEl.setText("Insert TTRPG Search Button"); this.contentEl.empty(); const wrap = this.contentEl.createDiv({ cls: "ttrpg-vs-source" });
        wrap.createDiv({ cls: "ttrpg-vs__label", text: "Type" }); const typeSelect = wrap.createEl("select", { cls: "ttrpg-vs__select" }); for (const type of this.plugin.getTTRPGSearchEmbedTypes()) { const opt = document.createElement("option"); opt.value = type.label; opt.textContent = type.label; typeSelect.appendChild(opt); } typeSelect.value = this.selectedType;
        wrap.createDiv({ cls: "ttrpg-vs__label", text: "Name" }); const input = wrap.createEl("input", { cls: "ttrpg-vs-source__search" }); input.type = "search"; input.placeholder = "Search for a book, adventure, item, spell...";
        wrap.createDiv({ cls: "ttrpg-vs__label", text: "Chapter (optional, books/adventures only)" }); const chapterInput = wrap.createEl("input", { cls: "ttrpg-vs-source__search" }); chapterInput.type = "search"; chapterInput.placeholder = "Leave blank for first chapter";
        wrap.createDiv({ cls: "ttrpg-vs__label", text: "Colour" }); const colourRow = wrap.createDiv({ cls: "ttrpg-search-colour-row" }); const colourSelect = colourRow.createEl("select", { cls: "ttrpg-vs__select" }); const customColourInput = colourRow.createEl("input", { cls: "ttrpg-vs-source__search" }); customColourInput.placeholder = "Optional hex, e.g. #7c3aed"; for (const colour of this.plugin.getTTRPGSearchButtonColours()) { const opt = document.createElement("option"); opt.value = colour.key; opt.textContent = colour.label; colourSelect.appendChild(opt); } colourSelect.value = "Accent";
        const list = wrap.createDiv({ cls: "ttrpg-vs-source__list" }); const preview = wrap.createEl("pre"); const buttons = wrap.createDiv({ cls: "ttrpg-vs__button-row" }); const insertBtn = buttons.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Insert button" });
        const getColour = () => { const custom = customColourInput.value.trim(); return custom || (colourSelect.value === "Accent" ? "" : colourSelect.value); }; const setTypeFromEntry = (entry) => { const nextType = entry && entry.typeLabel ? entry.typeLabel : this.selectedType; if (!nextType) return; this.selectedType = nextType; if (!Array.from(typeSelect.options).some((option) => option.value === nextType)) { const opt = document.createElement("option"); opt.value = nextType; opt.textContent = nextType; typeSelect.appendChild(opt); } typeSelect.value = nextType; };
        const renderPreview = () => { const colour = getColour(); const chapter = chapterInput.value.trim(); preview.textContent = "```TTRPG_Search\nType: " + this.selectedType + "\nName: " + (this.selectedName || input.value || "") + (chapter ? "\nChapter: " + chapter : "") + (this.selectedChapterPath ? "\nChapterPath: " + this.selectedChapterPath : "") + (colour ? "\nColour: " + colour : "") + "\n```"; insertBtn.disabled = !(this.selectedName || input.value.trim()); };
        const renderList = () => { this.selectedType = typeSelect.value || "Any"; const query = input.value.trim(); const entries = this.plugin.getTTRPGSearchButtonCandidates(this.selectedType, query).slice(0, 40); list.replaceChildren(); for (const item of entries) { const btn = document.createElement("button"); btn.type = "button"; btn.className = "ttrpg-vs-source__item"; const name = item.label; const nameEl = btn.createDiv({ cls: "ttrpg-vs-source__name", text: name }); nameEl.title = name; const metaText = [item.entry.typeLabel, item.entry.sourceLabel].filter(Boolean).join(" • " ); const metaEl = btn.createDiv({ cls: "ttrpg-vs-source__count", text: metaText }); metaEl.title = metaText; btn.addEventListener("click", () => { setTypeFromEntry(item.entry); this.selectedName = name; input.value = name; chapterInput.value = ""; this.selectedChapter = ""; this.selectedChapterPath = ""; renderChapterList(); renderPreview(); }); list.appendChild(btn); } renderPreview(); };
        const renderChapterList = () => { if (!this.plugin.isTTRPGBookOrAdventureType(this.selectedType) || !(this.selectedName || input.value.trim())) return; const chapterQuery = chapterInput.value.trim(); const chapters = this.plugin.getTTRPGSearchChapterCandidates(this.selectedType, this.selectedName || input.value.trim(), chapterQuery).slice(0, 40); if (!chapterQuery && chapters.length) return; list.replaceChildren(); for (const item of chapters) { const btn = document.createElement("button"); btn.type = "button"; btn.className = "ttrpg-vs-source__item"; const nameEl = btn.createDiv({ cls: "ttrpg-vs-source__name", text: item.label }); nameEl.title = item.path || item.label; btn.createDiv({ cls: "ttrpg-vs-source__count", text: item.path || "Chapter" }); btn.addEventListener("click", () => { chapterInput.value = item.baseLabel || item.label; this.selectedChapter = item.baseLabel || item.label; this.selectedChapterPath = item.path || ""; renderPreview(); }); list.appendChild(btn); } renderPreview(); };
        typeSelect.addEventListener("change", () => { this.selectedType = typeSelect.value || "Any"; this.selectedName = ""; input.value = ""; chapterInput.value = ""; this.selectedChapterPath = ""; renderList(); }); input.addEventListener("input", () => { this.selectedName = input.value.trim(); chapterInput.value = ""; this.selectedChapterPath = ""; renderList(); }); chapterInput.addEventListener("input", () => { this.selectedChapterPath = ""; renderChapterList(); }); colourSelect.addEventListener("change", renderPreview); customColourInput.addEventListener("input", renderPreview); insertBtn.addEventListener("click", () => { const name = this.selectedName || input.value.trim(); if (!name) return; const chapter = chapterInput.value.trim(); const colour = getColour(); const block = "```TTRPG_Search\nType: " + this.selectedType + "\nName: " + name + (chapter ? "\nChapter: " + chapter : "") + (this.selectedChapterPath ? "\nChapterPath: " + this.selectedChapterPath : "") + (colour ? "\nColour: " + colour : "") + "\n```"; this.editor.replaceSelection(block); this.close(); });
        renderList(); window.setTimeout(() => input.focus(), 0);
    }
}

class TTRPGSearchEmbedSuggest extends EditorSuggest {
    constructor(app, plugin) { super(app); this.plugin = plugin; this.context = null; }
    onTrigger(cursor, editor) { const line = editor.getLine(cursor.line).slice(0, cursor.ch); const typeMatch = line.match(/^\s*Type:\s*(.*)$/i); const nameMatch = line.match(/^\s*Name:\s*(.*)$/i); const chapterMatch = line.match(/^\s*Chapter:\s*(.*)$/i); const colourMatch = line.match(/^\s*(?:Colour|Color):\s*(.*)$/i); if (!typeMatch && !nameMatch && !chapterMatch && !colourMatch) return null; let blockHasFence = false; let blockType = "Any"; let blockName = ""; let fenceLine = -1; let typeLine = -1; let chapterPathLine = -1; for (let ln = cursor.line; ln >= Math.max(0, cursor.line - 30); ln--) { const value = editor.getLine(ln); if (/^```TTRPG_Search/i.test(value.trim())) { blockHasFence = true; fenceLine = ln; break; } const foundType = value.match(/^\s*Type:\s*(.+)$/i); if (foundType) { blockType = foundType[1].trim(); typeLine = ln; } const foundName = value.match(/^\s*Name:\s*(.+)$/i); if (foundName) blockName = foundName[1].trim(); if (/^\s*ChapterPath:/i.test(value)) chapterPathLine = ln; } if (!blockHasFence) return null; if (typeMatch) typeLine = cursor.line; const query = (typeMatch ? typeMatch[1] : nameMatch ? nameMatch[1] : chapterMatch ? chapterMatch[1] : colourMatch[1]) || ""; const startCh = cursor.ch - query.length; this.context = { mode: typeMatch ? "type" : nameMatch ? "name" : chapterMatch ? "chapter" : "colour", query, type: blockType, name: blockName, fenceLine, typeLine, chapterPathLine, start: { line: cursor.line, ch: startCh }, end: cursor, editor }; return this.context; }
    getSuggestions(context) { const query = String(context.query || "").trim(); if (context.mode === "colour") return this.plugin.getTTRPGSearchButtonColours().filter((c) => !query || c.label.toLowerCase().includes(query.toLowerCase()) || c.value.toLowerCase().includes(query.toLowerCase())).map((c) => ({ kind: "colour", label: c.label, value: c.value })).slice(0, 30); if (context.mode === "type") return this.plugin.getTTRPGSearchEmbedTypes().filter((t) => !query || t.label.toLowerCase().includes(query.toLowerCase())).slice(0, 30).map((t) => ({ kind: "type", label: t.label })); if (context.mode === "chapter") return this.plugin.getTTRPGSearchChapterCandidates(context.type, context.name, query).slice(0, 30).map((x) => ({ kind: "chapter", label: x.label, entry: x.entry, path: x.path, baseLabel: x.baseLabel, score: x.score })); return this.plugin.getTTRPGSearchButtonCandidates(context.type, query).slice(0, 30).map((x) => ({ kind: "entry", label: x.label, entry: x.entry, score: x.score })); }
    renderSuggestion(item, el) { el.createDiv({ cls: "ttrpg-vs-source__name", text: item.kind === "colour" && item.value ? item.label + " (" + item.value + ")" : item.label }); if (item.path) el.createDiv({ cls: "ttrpg-vs-source__meta", text: item.path }); else if (item.entry) { const meta = [item.entry.typeLabel, item.entry.sourceLabel].filter(Boolean).join(" • " ); if (meta) el.createDiv({ cls: "ttrpg-vs-source__meta", text: meta }); } }
    updateTypeLineForEntry(entry) { if (!this.context || !entry || !entry.typeLabel) return; const editor = this.context.editor; const nextTypeLineText = "Type: " + entry.typeLabel; if (this.context.typeLine >= 0) { editor.replaceRange(nextTypeLineText, { line: this.context.typeLine, ch: 0 }, { line: this.context.typeLine, ch: editor.getLine(this.context.typeLine).length }); return; } const insertLine = this.context.fenceLine >= 0 ? this.context.fenceLine + 1 : this.context.start.line; editor.replaceRange(nextTypeLineText + "\n", { line: insertLine, ch: 0 }); }
    updateChapterPathLine(path) { if (!this.context || !path) return; const editor = this.context.editor; const lineText = "ChapterPath: " + path; if (this.context.chapterPathLine >= 0) { editor.replaceRange(lineText, { line: this.context.chapterPathLine, ch: 0 }, { line: this.context.chapterPathLine, ch: editor.getLine(this.context.chapterPathLine).length }); return; } editor.replaceRange("\n" + lineText, this.context.end); }
    selectSuggestion(item) { if (!this.context) return; const replacement = item.kind === "colour" ? (item.value || item.label) : (item.kind === "chapter" ? (item.baseLabel || item.label) : item.label); this.context.editor.replaceRange(replacement, this.context.start, this.context.end); if (this.context.mode === "name" && item.entry) this.updateTypeLineForEntry(item.entry); if (this.context.mode === "chapter" && item.path) this.updateChapterPathLine(item.path); }
}

class TTRPGVaultSearchSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    renderSourceChipSettings(containerEl) {
        const details = containerEl.createEl("details");
        details.createEl("summary", { text: "Source chip labels & colours" });
        details.createEl("p", { text: "Collapsed by default because this list can be long. Chip labels are per raw source key, so duplicate visible labels do not merge filters." });
        const options = this.plugin.getSourceOptions();
        if (!options.length) return;
        const managerEl = details.createDiv({ cls: "ttrpg-vs-source-chip-manager" });
        for (const option of options) {
            const data=this.plugin.getSourceChipData(option.key); const row=managerEl.createDiv({cls:"ttrpg-vs-source-chip-manager__row"}); row.createDiv({cls:"ttrpg-vs-source-chip-manager__original", text:`${option.rawLabel || option.label} (${option.count})`}); const labelInput=row.createEl("input",{cls:"ttrpg-vs-source-chip-manager__input"}); labelInput.type="text"; labelInput.value=data.label||option.label; const colorInput=row.createEl("input",{cls:"ttrpg-vs-source-chip-manager__input"}); colorInput.type="color"; colorInput.value=/^#[0-9a-f]{6}$/i.test(data.color||"")?data.color:"#7c3aed"; const saveBtn=row.createEl("button",{cls:"ttrpg-vs__toolbutton", text:"Save"}); saveBtn.type="button"; saveBtn.addEventListener("click", async()=>{ await this.plugin.updateSourceChip(option.key, option.rawLabel || option.label, labelInput.value, colorInput.value); this.display(); }); const resetBtn=row.createEl("button",{cls:"ttrpg-vs__toolbutton", text:"Reset"}); resetBtn.type="button"; resetBtn.addEventListener("click", async()=>{ await this.plugin.resetSourceChip(option.key); this.display(); });
        }
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "TTRPG Vault Search" });

        new Setting(containerEl)
            .setName("Indexed folders")
            .setDesc("One folder per line or comma-separated. Leave empty to auto-detect.")
            .addTextArea((text) => {
                text.setPlaceholder("TTRPG\n5etools\nCompendium");
                text.setValue(this.plugin.settings.indexedFolders);
                text.inputEl.rows = 5;
                text.onChange(async (value) => {
                    this.plugin.settings.indexedFolders = value;
                    await this.plugin.saveSettings(true);
                });
            });

        new Setting(containerEl)
            .setName("Maximum results")
            .setDesc("Maximum number of results shown in the search modal.")
            .addText((text) => {
                text.inputEl.type = "number";
                text.inputEl.min = "10";
                text.inputEl.max = "2000";
                text.inputEl.step = "10";
                text.inputEl.style.width = "90px";
                text.inputEl.style.textAlign = "right";
                text.setValue(String(this.plugin.settings.maxResults));
                text.onChange(async (value) => {
                    const parsed = parseInt(value, 10);
                    if (!Number.isFinite(parsed) || parsed < 1) return;
                    this.plugin.settings.maxResults = parsed;
                    await this.plugin.saveSettings(false);
                });
                const warning = text.inputEl.parentElement || containerEl;
                const warnEl = document.createElement("div");
                warnEl.style.cssText = "font-size:11px;color:var(--text-warning,#e8a020);max-width:240px;margin-top:4px;";
                warnEl.textContent = "⚠ Values above 500 may cause noticeable lag on large vaults.";
                warning.appendChild(warnEl);
            });

        new Setting(containerEl)
            .setName("Search titles only (default)")
            .setDesc("When enabled, searching only scans entry titles and collection names. Disable to also search file paths, aliases, and metadata fields.")
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.searchTitleOnly !== false)
                    .onChange(async (value) => {
                        this.plugin.settings.searchTitleOnly = value;
                        await this.plugin.saveSettings(false);
                    });
            });

        new Setting(containerEl)
            .setName("Default sort mode")
            .setDesc("Default sort mode for the search modal.")
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("relevance", "Relevance")
                    .addOption("name", "Name")
                    .addOption("source", "Source")
                    .addOption("type", "Type")
                    .setValue(this.plugin.settings.sortMode || "relevance")
                    .onChange(async (value) => {
                        this.plugin.settings.sortMode = value;
                        await this.plugin.saveSettings(false);
                    });
            });

        new Setting(containerEl)
            .setName("Open in new leaf by default")
            .setDesc("Used for direct file opens outside the reader.")
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.openInNewLeaf)
                    .onChange(async (value) => {
                        this.plugin.settings.openInNewLeaf = value;
                        await this.plugin.saveSettings(false);
                    });
            });


        new Setting(containerEl)
            .setName("Open search in pop-out by default")
            .setDesc("When enabled, the search command/ribbon opens directly in a pop-out window.")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.openSearchInPopoutByDefault !== false).onChange(async (value) => { this.plugin.settings.openSearchInPopoutByDefault = value; await this.plugin.saveSettings(false); }));

        new Setting(containerEl)
            .setName("Open reader in pop-out by default")
            .setDesc("When enabled, selecting a result opens the reader in a pop-out window by default.")
            .addToggle((toggle) => toggle.setValue(!!this.plugin.settings.openReaderInPopoutByDefault).onChange(async (value) => { this.plugin.settings.openReaderInPopoutByDefault = value; await this.plugin.saveSettings(false); }));

        new Setting(containerEl)
            .setName("Custom source aliases")
            .setDesc(
                "Format either 'Canonical Name => alias1, alias2' or 'alias = Canonical Name'. One per line."
            )
            .addTextArea((text) => {
                text.setPlaceholder("Eberron: Forge of the Artificer => EFA, forgeoftheartificer\nphb24 = Player's Handbook (2024)");
                text.setValue(this.plugin.settings.sourceAliasesText || "");
                text.inputEl.rows = 8;
                text.onChange(async (value) => {
                    this.plugin.settings.sourceAliasesText = value;
                    await this.plugin.saveSettings(true);
                });
            });

        new Setting(containerEl)
            .setName("Forced source overrides")
            .setDesc("Force specific files, folders, types, current sources, names, or globs to use a source. One rule per line: matcher => Source. Matchers: path:, glob:, type:, source:, name:. Bare matchers are treated as paths/contains.")
            .addTextArea((text) => {
                text.setPlaceholder("type:Action => Player's Handbook\nsource:Arcadia Issue 1 => Player's Handbook\npath:3-Mechanics/CLI/actions/ => Dungeon Master's Guide\nglob:3-Mechanics/CLI/actions/*.md => Player's Handbook");
                text.setValue(this.plugin.settings.sourceOverridesText || "");
                text.inputEl.rows = 7;
                text.onChange(async (value) => {
                    this.plugin.settings.sourceOverridesText = value;
                    await this.plugin.saveSettings(false);
                });
            });
        new Setting(containerEl)
            .setName("Apply forced source overrides")
            .setDesc("Rebuild the index after editing forced source override rules. This avoids rebuilding the whole vault on every keystroke.")
            .addButton((button) => button.setButtonText("Apply / rebuild index").onClick(async () => {
                await this.plugin.saveSettings(true);
                new Notice("Forced source overrides applied.");
            }));

        this.renderSourceChipSettings(containerEl);

        new Setting(containerEl)
            .setName("Custom filter presets")
            .setDesc("One preset per line: Name => source1, source2 | type1, type2. Works in normal search and Spellbook.")
            .addTextArea((text) => {
                text.setPlaceholder("My Books => PHB, XGE, TCE | Book\nMy Spells => XPHB, XGE | Spell");
                text.setValue((this.plugin.settings.sourceFilterPresets || []).map((p) => `${p.name} => ${(p.sources || []).join(", ")} | ${(p.types || []).join(", ")}`).join("\n"));
                text.inputEl.rows = 5;
                text.onChange(async (value) => {
                    this.plugin.settings.sourceFilterPresets = String(value || "").split(/\r?\n/).map((line) => {
                        const [nameRaw, restRaw] = line.split("=>").map((s) => (s || "").trim());
                        if (!nameRaw || !restRaw) return null;
                        const [sourcesRaw, typesRaw] = restRaw.split("|").map((s) => (s || "").trim());
                        return { id: `custom-${normalizeKey(nameRaw)}`, name: nameRaw, sources: (sourcesRaw || "").split(",").map((s) => normalizeKey(s)).filter(Boolean), types: (typesRaw || "").split(",").map((s) => normalizeKey(s)).filter(Boolean) };
                    }).filter(Boolean);
                    await this.plugin.saveSettings(false);
                });
            });

        new Setting(containerEl)
            .setName("Custom folder-to-type mappings")
            .setDesc("Format 'folder1, folder2 => Type'. One per line.")
            .addTextArea((text) => {
                text.setPlaceholder("npcs, villains => NPC\nmagicitems => Item");
                text.setValue(this.plugin.settings.typeFolderMappingsText || "");
                text.inputEl.rows = 6;
                text.onChange(async (value) => {
                    this.plugin.settings.typeFolderMappingsText = value;
                    await this.plugin.saveSettings(true);
                });
            });

        new Setting(containerEl)
            .setName("Settings backups")
            .setDesc("Back up TTRPG Search settings/bookmarks/source customisations to a vault folder outside the plugin folder. These backups are intended to survive plugin corruption or replacement.")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.settingsBackupEnabled !== false).onChange(async (value) => {
                this.plugin.settings.settingsBackupEnabled = value;
                await this.plugin.saveSettings(false);
            }));

        new Setting(containerEl)
            .setName("Backup folder")
            .setDesc("Vault-relative folder for JSON backups. Keep this outside .obsidian/plugins so plugin corruption or reinstalling does not remove it.")
            .addText((text) => {
                text.setPlaceholder("TTRPG Search Backups");
                text.setValue(this.plugin.settings.settingsBackupFolder || "TTRPG Search Backups");
                text.onChange(async (value) => {
                    this.plugin.settings.settingsBackupFolder = value || "TTRPG Search Backups";
                    await this.plugin.saveSettings(false);
                });
            });

        new Setting(containerEl)
            .setName("Backup frequency")
            .setDesc("How often to create a backup, in hours. Use 24 for daily backups. Set to 0 to disable scheduled backups without changing the toggle.")
            .addText((text) => {
                text.inputEl.type = "number";
                text.inputEl.min = "0";
                text.inputEl.step = "1";
                text.setValue(String(this.plugin.settings.settingsBackupIntervalHours || 24));
                text.onChange(async (value) => {
                    const parsed = Number(value);
                    this.plugin.settings.settingsBackupIntervalHours = Number.isFinite(parsed) ? Math.max(0, parsed) : 24;
                    await this.plugin.saveSettings(false);
                });
            });

        new Setting(containerEl)
            .setName("Backups to keep")
            .setDesc("Oldest backup files are removed after this count. Set to 0 to keep all backups.")
            .addText((text) => {
                text.inputEl.type = "number";
                text.inputEl.min = "0";
                text.inputEl.step = "1";
                text.setValue(String(this.plugin.settings.settingsBackupMaxFiles || 30));
                text.onChange(async (value) => {
                    const parsed = Number(value);
                    this.plugin.settings.settingsBackupMaxFiles = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 30;
                    await this.plugin.saveSettings(false);
                });
            })
            .addButton((button) => button.setButtonText("Back up now").onClick(async () => {
                const ok = await this.plugin.runSettingsBackup("manual", true);
                new Notice(ok ? "TTRPG Search settings backup created." : "TTRPG Search settings backup failed. Check console.");
            }))
            .addButton((button) => button.setButtonText("Restore…").onClick(() => {
                new SettingsBackupRestoreModal(this.app, this.plugin).open();
            }));

        new Setting(containerEl)
            .setName("Save last search")
            .setDesc(
                "When enabled, re-opening the search modal restores the last query, filters, and scroll position."
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.saveLastSearch).onChange(async (value) => {
                    this.plugin.settings.saveLastSearch = value;
                    if (!value) this.plugin.settings.lastSearchState = null;
                    await this.plugin.saveSettings(false);
                });
            });

        new Setting(containerEl)
            .setName("Spell tag prefix")
            .setDesc(
                "Tag path prefix used by your vault generator for spell metadata. " +
                "E.g. 'ttrpg-cli' reads tags like ttrpg-cli/spell/school/Evocation. " +
                "Rebuild the index after changing this."
            )
            .addText((text) => {
                text.setPlaceholder("ttrpg-cli")
                    .setValue(this.plugin.settings.spellTagPrefix || "ttrpg-cli")
                    .onChange(async (value) => {
                        this.plugin.settings.spellTagPrefix = value.trim() || "ttrpg-cli";
                        await this.plugin.saveSettings(false);
                    });
            });

        new Setting(containerEl)
            .setName("Manual rebuild")
            .setDesc("Force a full reindex immediately.")
            .addButton((button) => {
                button.setButtonText("Rebuild index").onClick(() => {
                    this.plugin.buildIndex(true);
                });
            });
    }
}

module.exports = TTRPGVaultSearchPlugin;
