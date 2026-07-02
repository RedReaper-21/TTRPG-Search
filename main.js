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
    bookmarkDisplayNames: {}, // {path: customDisplayName} - client-sided visual rename
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
    enableInitiativeTrackerIntegration: true,
    enableFantasyStatblocksIntegration: true,
    randomEncounterMinCR: "",
    randomEncounterMaxCR: "",
    randomEncounterSources: "",
    customMonsterImages: {},
    bestiaryFilterWidth: 280,
    bestiaryEncounterWidth: 340,
    bestiaryEncounterMinimised: false,
    bestiaryEncounterName: "New Encounter",
    bestiaryEncounter: [],
    bestiaryPartyRows: [{ level: 5, count: 4 }],
    bestiaryXpMathMode: "kpfc",
    bestiaryIncludePartySizeAdjustment: true,
    bestiaryFleeMortalsDifficulty: "standard",
    bestiaryFleeMortalsDayBudget: 8,
    bestiaryFleeMortalsSpent: 0,
    bestiarySelectedPartyName: "custom",
    openSpellbookInPopoutByDefault: false,
    openBestiaryInPopoutByDefault: false,
    saveLastSpellbookSearch: false,
    lastSpellbookSearchState: null,
    saveLastBestiarySearch: false,
    lastBestiarySearchState: null,
    searchExclusions: [],      // [{property: string, value: string}] — exclude from normal search
    bestiaryExclusions: [],    // [{property: string, value: string}] — exclude from bestiary
    spellbookExclusions: [],   // [{property: string, value: string}] — exclude from spellbook
    openItemSearchInPopoutByDefault: false,
    saveLastItemSearch: false,
    lastItemSearchState: null,
    itemBookmarks: [],
    itembookExclusions: [],
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
const _escapeHtmlRe = /[&<>"']/g;
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
function scoreTextField(value, query, weight) {
    const text = String(value || "").toLowerCase();
    if (!text || !query) return Number.NEGATIVE_INFINITY;
    if (weight === 100) {
        const contains = text.indexOf(query);
        if (contains >= 0) return weight + 130 - contains * 0.001;
        return Number.NEGATIVE_INFINITY;
    }
    if (text === query) return weight + 320;
    if (text.startsWith(query)) return weight + 250 - Math.min(45, (text.length - query.length) * 0.12);
    const boundary = wordBoundaryIndex(text, query);
    if (boundary >= 0) return weight + 195 - boundary * 0.25;
    const contains = text.indexOf(query);
    if (contains >= 0) return weight + 130 - contains * 0.15;
    const fuzzy = fuzzyPenalty(text, query);
    if (Number.isFinite(fuzzy) && query.length >= 3) return weight + 40 - fuzzy * 0.7;
    return Number.NEGATIVE_INFINITY;
}
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


const BESTIARY_CR_ORDER = ["0", "1/8", "1/4", "1/2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"];
const BESTIARY_XP_BY_CR = {
    "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
    "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000,
    "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
    "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000,
    "28": 120000, "29": 135000, "30": 155000,
};
function normalizeCR(value) {
    const raw = readString(value);
    if (!raw) return "";
    const text = String(raw).trim().replace(/^cr\s*/i, "");
    if (/^0.125$/.test(text)) return "1/8";
    if (/^0.25$/.test(text)) return "1/4";
    if (/^0.5$/.test(text)) return "1/2";
    const compact = text.replace(/\s+/g, "");
    if (compact.includes("1/8")) return "1/8";
    if (compact.includes("1/4")) return "1/4";
    if (compact.includes("1/2")) return "1/2";
    const num = text.match(/\d+/);
    return num ? String(Math.max(0, Math.min(30, Number(num[0])))) : "";
}
function readFirstString(frontmatter, keys) {
    return readString(getFrontmatterValue(frontmatter, ...keys)) || "";
}
function extractImageLike(frontmatter) {
    return readFirstString(frontmatter, ["token", "image", "img", "avatar", "portrait", "art", "picture"]);
}
function parseStatblockCodeBlock(content) {
    const data = {};
    if (!content) return data;
    const matches = content.matchAll(/```statblock\s*([\s\S]*?)```/g);
    for (const match of matches) {
        const blockText = match[1];
        const lines = blockText.split(/\r?\n/);
        for (const line of lines) {
            const m = line.match(/^\s*["']?([a-zA-Z0-9_-]+)["']?\s*:\s*(.*)$/);
            if (m) {
                const key = m[1].toLowerCase();
                let val = m[2].trim();
                val = val.replace(/^!![a-z]+\s+/i, "");
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.slice(1, -1);
                }
                data[key] = val;
            }
        }
    }
    return data;
}

function extractMonsterMeta(frontmatter, allTags, file, typeLabel, displayName, statblockData = {}) {
    // 1. Extract CR
    let crRaw = getFrontmatterValue(frontmatter, "cr", "challenge", "challenge_rating", "challengeRating");
    if (crRaw == null) {
        crRaw = statblockData.cr || statblockData.challenge || statblockData.challenge_rating || statblockData.challengerating;
    }
    if (crRaw == null && Array.isArray(allTags)) {
        for (const tag of allTags) {
            const match = tag.match(/(?:^|\/)(?:monster|creature)\/cr\/([^\/]+)/i);
            if (match) {
                crRaw = match[1].replace(/-/g, "/"); // e.g. "1-2" -> "1/2"
                break;
            }
        }
    }
    const cr = normalizeCR(crRaw);

    // 2. Extract Type
    let bestiaryType = readFirstString(frontmatter, ["bestiarytype", "bestiary_type", "monster_type", "monstertype", "type", "creature_type"]);
    if (!bestiaryType) {
        bestiaryType = statblockData.bestiarytype || statblockData.bestiary_type || statblockData.monster_type || statblockData.monstertype || statblockData.type || statblockData.creature_type || "";
    }
    if (!bestiaryType && Array.isArray(allTags)) {
        for (const tag of allTags) {
            const match = tag.match(/(?:^|\/)(?:monster|creature)\/type\/([^\/]+)/i);
            if (match) {
                bestiaryType = match[1];
                break;
            }
        }
    }

    // 3. Extract Size
    let size = readFirstString(frontmatter, ["size"]);
    if (!size) {
        size = statblockData.size || "";
    }
    if (!size && Array.isArray(allTags)) {
        for (const tag of allTags) {
            const match = tag.match(/(?:^|\/)(?:monster|creature)\/size\/([^\/]+)/i);
            if (match) {
                size = match[1];
                break;
            }
        }
    }

    // 4. Extract Alignment
    let alignment = readFirstString(frontmatter, ["alignment"]);
    if (!alignment) {
        alignment = statblockData.alignment || "";
    }
    if (!alignment && Array.isArray(allTags)) {
        for (const tag of allTags) {
            const match = tag.match(/(?:^|\/)(?:monster|creature)\/alignment\/([^\/]+)/i);
            if (match) {
                alignment = match[1];
                break;
            }
        }
    }

    // 5. Extract Environment
    let environmentParts = readStringArray(getFrontmatterValue(frontmatter, "environment", "environments", "terrain", "biome", "habitat"));
    if (!environmentParts.length && statblockData.environment) {
        environmentParts = String(statblockData.environment).split(",").map(e => e.trim()).filter(Boolean);
    }
    if (!environmentParts.length && Array.isArray(allTags)) {
        for (const tag of allTags) {
            const cleanTag = String(tag || "").toLowerCase().trim();
            const match = cleanTag.match(/(?:^|\/)(?:monster|creature|environment)\/environment\/([^\/]+)/) ||
                cleanTag.match(/(?:^|\/)environment\/([^\/]+)/);
            if (match) {
                const envVal = match[1].replace(/-/g, " ").trim();
                const formattedEnv = envVal.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                if (formattedEnv && !environmentParts.includes(formattedEnv)) environmentParts.push(formattedEnv);
            }
        }
    }
    const environment = environmentParts.join(", ");

    // 6. Extract AC, HP and Image
    let ac = readFirstString(frontmatter, ["ac", "armor_class", "armorClass"]);
    if (!ac) ac = statblockData.ac || statblockData.armor_class || statblockData.armorclass || "";

    let hp = readFirstString(frontmatter, ["hp", "hit_points", "hitPoints"]);
    if (!hp) hp = statblockData.hp || statblockData.hit_points || statblockData.hitpoints || "";

    let image = extractImageLike(frontmatter);
    if (!image) {
        image = statblockData.token || statblockData.image || statblockData.img || statblockData.avatar || statblockData.portrait || statblockData.art || statblockData.picture || "";
    }

    // 7. Extract Hit Dice
    let hit_dice = readFirstString(frontmatter, ["hit_dice", "hitDice", "hd", "hp_dice"]);
    if (!hit_dice) hit_dice = statblockData.hit_dice || statblockData.hitdice || statblockData.hd || statblockData.hp_dice || "";

    // 8. Extract Initiative Modifier / stats
    const stats = getFrontmatterValue(frontmatter, "stats");
    let dex = getFrontmatterValue(frontmatter, "dex", "dexterity");
    if (dex == null && stats && Array.isArray(stats) && stats.length > 1) {
        dex = stats[1];
    }
    if (dex == null && statblockData.dex) dex = statblockData.dex;
    if (dex == null && statblockData.dexterity) dex = statblockData.dexterity;
    if (dex == null && statblockData.stats) {
        try {
            let statsVal = statblockData.stats;
            if (typeof statsVal === "string") {
                if (statsVal.startsWith("[") && statsVal.endsWith("]")) {
                    statsVal = statsVal.slice(1, -1).split(",").map(Number);
                } else {
                    statsVal = statsVal.split(",").map(Number);
                }
            }
            if (Array.isArray(statsVal) && statsVal.length > 1) {
                dex = statsVal[1];
            }
        } catch (_) { }
    }

    let modifier = getFrontmatterValue(frontmatter, "modifier", "init_modifier", "initiative_modifier", "init");
    if (modifier == null) modifier = statblockData.modifier || statblockData.init_modifier || statblockData.initiative_modifier || statblockData.init;
    if (modifier == null && dex != null) {
        modifier = Math.floor((Number(dex) - 10) / 2);
    }

    return {
        cr,
        xp: cr && BESTIARY_XP_BY_CR[cr] ? BESTIARY_XP_BY_CR[cr] : 0,
        bestiaryType: bestiaryType ? bestiaryType.toLowerCase() : "",
        size,
        alignment,
        environment,
        ac,
        hp,
        image,
        hit_dice,
        modifier: modifier != null ? Number(modifier) : 0,
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

    if (entry.monsterMeta) {
        if (entry.monsterMeta.cr) parts.push("cr " + entry.monsterMeta.cr);
        if (entry.monsterMeta.bestiaryType) parts.push(entry.monsterMeta.bestiaryType);
        if (entry.monsterMeta.environment) parts.push(entry.monsterMeta.environment);
        if (entry.monsterMeta.size) parts.push(entry.monsterMeta.size);
        if (entry.monsterMeta.alignment) parts.push(entry.monsterMeta.alignment);
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
    if (!titleOnly) {
        fields.push({ value: entry.pathLower || "", weight: 245 }, { value: entry.searchBlob || "", weight: 190 });
        if (entry.fileContentLower) {
            fields.push({ value: entry.fileContentLower, weight: 100 });
        }
    }
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
        sameStringArray(a.aliases, b.aliases) &&
        JSON.stringify(a.spellMeta) === JSON.stringify(b.spellMeta) &&
        JSON.stringify(a.monsterMeta) === JSON.stringify(b.monsterMeta)
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
    const getScore = preScored
        ? (entry) => preScored.get(entry.path) ?? scoreEntry(entry, query, titleOnly)
        : (() => { const cache = new Map(); return (entry) => { let s = cache.get(entry.path); if (s === undefined) { s = scoreEntry(entry, query, titleOnly); cache.set(entry.path, s); } return s; }; })();

    if (sortMode === "name") {
        list.sort((a, b) => 
            COLLATOR.compare(a.collectionKind ? `${a.collectionName} - ${a.displayName}` : a.displayName, b.collectionKind ? `${b.collectionName} - ${b.displayName}` : b.displayName) || 
            (getScore(b) - getScore(a)) || 
            COLLATOR.compare(a.path, b.path)
        );
        return list;
    }
    if (sortMode === "source") {
        list.sort((a, b) => 
            COLLATOR.compare(a.sourceLabel || "zzz", b.sourceLabel || "zzz") || 
            (getScore(b) - getScore(a)) || 
            COLLATOR.compare(a.collectionName || a.displayName, b.collectionName || b.displayName) || 
            COLLATOR.compare(a.displayName, b.displayName) || 
            COLLATOR.compare(a.path, b.path)
        );
        return list;
    }
    if (sortMode === "type") {
        list.sort((a, b) => 
            COLLATOR.compare(a.typeLabel, b.typeLabel) || 
            (getScore(b) - getScore(a)) || 
            COLLATOR.compare(a.collectionName || a.displayName, b.collectionName || b.displayName) || 
            COLLATOR.compare(a.displayName, b.displayName) || 
            COLLATOR.compare(a.path, b.path)
        );
        return list;
    }
    
    list.sort((a, b) => 
        (getScore(b) - getScore(a)) || 
        COLLATOR.compare(a.collectionName || a.displayName, b.collectionName || b.displayName) || 
        COLLATOR.compare(a.displayName, b.displayName) || 
        COLLATOR.compare(a.path, b.path)
    );
    return list;
}

function highlightAndScrollToQuery(containerEl, query) {
    if (!query || !query.trim()) return;
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return;

    const walkTextNodes = (node, callback) => {
        if (node.nodeType === 3) {
            callback(node);
        } else if (node.nodeType === 1 && node.childNodes && 
                   !/^(style|script|textarea)$/i.test(node.tagName) &&
                   !node.classList.contains("ttrpg-vs__chip")) {
            const children = Array.from(node.childNodes);
            for (let i = 0; i < children.length; i++) {
                walkTextNodes(children[i], callback);
            }
        }
    };

    const nodesToReplace = [];
    walkTextNodes(containerEl, (node) => {
        const text = node.nodeValue;
        const textLower = text.toLowerCase();
        
        const fullQuery = terms.join(" ");
        let idx = textLower.indexOf(fullQuery);
        let matchLen = fullQuery.length;
        
        if (idx === -1) {
            idx = textLower.indexOf(terms[0]);
            matchLen = terms[0].length;
        }

        if (idx >= 0 && matchLen > 0) {
            nodesToReplace.push({ node, idx, matchLen, fullQuery, firstTerm: terms[0] });
        }
    });

    let firstHighlightedEl = null;
    for (const item of nodesToReplace) {
        const { node, idx, matchLen, fullQuery, firstTerm } = item;
        const text = node.nodeValue;
        const textLower = text.toLowerCase();
        const parent = node.parentNode;
        if (!parent) continue;

        const frag = document.createDocumentFragment();
        let lastIdx = 0;
        
        while (true) {
            let nextIdx = textLower.indexOf(fullQuery, lastIdx);
            let len = fullQuery.length;
            if (nextIdx === -1) {
                nextIdx = textLower.indexOf(firstTerm, lastIdx);
                len = firstTerm.length;
            }
            if (nextIdx === -1) break;
            
            if (nextIdx > lastIdx) {
                frag.appendChild(document.createTextNode(text.slice(lastIdx, nextIdx)));
            }
            const mark = document.createElement("mark");
            mark.className = "ttrpg-search-highlight";
            mark.textContent = text.slice(nextIdx, nextIdx + len);
            mark.style.backgroundColor = "var(--text-highlight-bg, rgba(255, 222, 115, 0.4))";
            mark.style.color = "inherit";
            mark.style.padding = "0 2px";
            mark.style.borderRadius = "2px";
            frag.appendChild(mark);
            
            if (!firstHighlightedEl) {
                firstHighlightedEl = mark;
            }
            lastIdx = nextIdx + len;
        }
        if (lastIdx < text.length) {
            frag.appendChild(document.createTextNode(text.slice(lastIdx)));
        }
        parent.replaceChild(frag, node);
    }

    if (firstHighlightedEl) {
        setTimeout(() => {
            firstHighlightedEl.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 100);
    }
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
    border-bottom: 2px solid var(--background-modifier-hover);
    padding-bottom: 4px;
    margin-bottom: 8px;
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
.ttrpg-vs__chip {
    display: inline-block;
    vertical-align: middle;
    max-width: 100%;
    text-align: left;
    box-sizing: border-box;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 14px;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 2px solid #ffffff;
    background: color-mix(in srgb, var(--interactive-accent) 12%, var(--background-secondary));
    color: var(--text-normal);
    font-weight: 700;
}
.ttrpg-vs__badge {
    display: inline-block;
    vertical-align: middle;
    text-align: left;
    box-sizing: border-box;
    max-width: 100%;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 1px solid var(--background-modifier-border);
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


.ttrpg-vs__chip--source { --ttrpg-source-color: var(--interactive-accent); background: color-mix(in srgb, var(--ttrpg-source-color) 18%, var(--background-secondary)); }
.ttrpg-vs__chip--has-custom-color { border-color: color-mix(in srgb, var(--ttrpg-source-color) 55%, var(--background-modifier-border)) !important; }
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
button.ttrpg-vs__chip {
    font-family: inherit;
    outline: none;
    text-align: center;
    justify-content: center;
}
button.ttrpg-vs__badge {
    font-family: inherit;
    outline: none;
    text-align: left;
    justify-content: flex-start;
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
    white-space: normal;
    word-break: break-word;
    overflow-wrap: break-word;
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

.ttrpg-vs-bestiary-modal {
    width: min(1680px, 98vw);
    height: min(94vh, 1040px);
}
.ttrpg-vs-bestiary-modal .modal-content {
    height: 100%;
    overflow: hidden;
}
.ttrpg-vs-bestiary-modal input,
.ttrpg-vs-bestiary-modal select,
.ttrpg-vs-bestiary-modal button {
    box-sizing: border-box;
}
/* Bestiary-only: stretch source chips to full width */
.ttrpg-vs-best-root .ttrpg-vs__chip {
    display: block;
    width: 100%;
    text-align: center;
}
.ttrpg-bestiary-popout-view .ttrpg-vs__chip {
    display: block;
    width: 100%;
    text-align: center;
}

/* ── Spellbook ──────────────────────────────────────────────────────────────── */
.ttrpg-sb-modal {
    width: min(1180px, 96vw);
    height: min(88vh, 900px);
}
.ttrpg-sb-modal .modal-content {
    overflow: hidden;
}
.ttrpg-sb__filters {
    grid-template-columns: minmax(0, 110px) minmax(0, 140px) minmax(0, 140px) minmax(0, 1fr) minmax(0, 120px) auto;
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

/* Spell schools — color-coded by school of magic */
.ttrpg-sb__school-badge--abjuration { background: color-mix(in srgb, var(--color-cyan, #06b6d4) 15%, var(--background-secondary)); border: 2px solid color-mix(in srgb, var(--color-cyan, #06b6d4) 40%, var(--background-modifier-border)); color: var(--color-cyan, #06b6d4); }
.ttrpg-sb__school-badge--conjuration { background: color-mix(in srgb, var(--color-purple, #a855f7) 15%, var(--background-secondary)); border: 2px solid color-mix(in srgb, var(--color-purple, #a855f7) 40%, var(--background-modifier-border)); color: var(--color-purple, #a855f7); }
.ttrpg-sb__school-badge--divination { background: color-mix(in srgb, var(--color-yellow, #eab308) 15%, var(--background-secondary)); border: 2px solid color-mix(in srgb, var(--color-yellow, #eab308) 40%, var(--background-modifier-border)); color: var(--color-yellow, #eab308); }
.ttrpg-sb__school-badge--enchantment { background: color-mix(in srgb, var(--color-pink, #ec4899) 15%, var(--background-secondary)); border: 2px solid color-mix(in srgb, var(--color-pink, #ec4899) 40%, var(--background-modifier-border)); color: var(--color-pink, #ec4899); }
.ttrpg-sb__school-badge--evocation { background: color-mix(in srgb, var(--color-red, #ef4444) 15%, var(--background-secondary)); border: 2px solid color-mix(in srgb, var(--color-red, #ef4444) 40%, var(--background-modifier-border)); color: var(--color-red, #ef4444); }
.ttrpg-sb__school-badge--illusion { background: color-mix(in srgb, var(--color-indigo, #6366f1) 15%, var(--background-secondary)); border: 2px solid color-mix(in srgb, var(--color-indigo, #6366f1) 40%, var(--background-modifier-border)); color: var(--color-indigo, #6366f1); }
.ttrpg-sb__school-badge--necromancy { background: color-mix(in srgb, var(--color-green, #22c55e) 15%, var(--background-secondary)); border: 2px solid color-mix(in srgb, var(--color-green, #22c55e) 40%, var(--background-modifier-border)); color: var(--color-green, #22c55e); }
.ttrpg-sb__school-badge--transmutation { background: color-mix(in srgb, var(--color-orange, #f97316) 15%, var(--background-secondary)); border: 2px solid color-mix(in srgb, var(--color-orange, #f97316) 40%, var(--background-modifier-border)); color: var(--color-orange, #f97316); }

@media (max-width: 760px) {
    .ttrpg-sb__filters {
        grid-template-columns: 1fr !important;
    }
}

/* ── Item Search ───────────────────────────────────────────────────────────── */
.ttrpg-item-search-modal {
    width: min(1180px, 96vw);
    height: min(88vh, 900px);
}
.ttrpg-item-search-modal .modal-content {
    overflow: hidden;
}
.ttrpg-item-search__filters {
    grid-template-columns: minmax(0, 120px) minmax(0, 140px) minmax(0, 140px) minmax(0, 1fr) minmax(0, 120px) auto;
}
@media (max-width: 760px) {
    .ttrpg-item-search__filters {
        grid-template-columns: 1fr !important;
    }
}
.ttrpg-item__rarity-chip {
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
.ttrpg-item__rarity-common  { background: color-mix(in srgb, #9ca3af 15%, var(--background-secondary)); border-color: #9ca3af44; color: #9ca3af; }
.ttrpg-item__rarity-uncommon  { background: color-mix(in srgb, #34d399 15%, var(--background-secondary)); border-color: #34d39944; color: #34d399; }
.ttrpg-item__rarity-rare  { background: color-mix(in srgb, #60a5fa 15%, var(--background-secondary)); border-color: #60a5fa44; color: #60a5fa; }
.ttrpg-item__rarity-veryrare  { background: color-mix(in srgb, #a78bfa 15%, var(--background-secondary)); border-color: #a78bfa44; color: #a78bfa; }
.ttrpg-item__rarity-legendary  { background: color-mix(in srgb, #fbbf24 15%, var(--background-secondary)); border-color: #fbbf2444; color: #fbbf24; }
.ttrpg-item__rarity-artifact  { background: color-mix(in srgb, #fb7185 15%, var(--background-secondary)); border-color: #fb718544; color: #fb7185; }

/* Advanced Collapsible Filters */
.ttrpg-vs__input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    min-height: 34px;
    line-height: 1.4;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
}
.ttrpg-vs__input:focus {
    border-color: var(--interactive-accent);
    outline: none;
}
.ttrpg-vs__advanced-details {
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    background: var(--background-secondary);
    padding: 8px 12px;
    margin-bottom: 6px;
}
.ttrpg-vs__advanced-summary {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
}
.ttrpg-vs__advanced-summary::-webkit-details-marker {
    display: none;
}
.ttrpg-vs__advanced-content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--background-modifier-border);
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

/* Allow text selection inside reader content */
.ttrpg-reader__content, .ttrpg-reader__content * {
    user-select: text !important;
    -webkit-user-select: text !important;
}

/* Hide edit elements in hover previews */
.hover-popover .clickable-icon[title*="Edit" i],
.hover-popover .view-action[title*="Edit" i],
.hover-popover .hover-editor-titlebar-edit {
    display: none !important;
}

/* Settings panel grouping styles */
.ttrpg-settings-group {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    margin-bottom: 16px;
    background: var(--background-secondary-alt);
    overflow: hidden;
}
.ttrpg-settings-group-title {
    padding: 10px 14px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    background: var(--background-secondary);
    user-select: none;
    outline: none;
    transition: background 0.1s ease;
    display: list-item;
}
.ttrpg-settings-group-title:hover {
    background: var(--background-modifier-hover);
}
.ttrpg-settings-group-content {
    padding: 12px 14px 14px;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
}
.ttrpg-settings-subdetails {
    margin-top: 10px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    overflow: hidden;
}
.ttrpg-settings-subdetails-title {
    padding: 8px 12px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    background: var(--background-secondary-alt);
    user-select: none;
    outline: none;
    transition: background 0.1s ease;
    display: list-item;
}
.ttrpg-settings-subdetails-title:hover {
    background: var(--background-modifier-hover);
}
.ttrpg-settings-subdetails > p {
    margin: 8px 12px 10px;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.4;
}
.ttrpg-settings-subdetails > div,
.ttrpg-settings-subdetails > button {
    margin: 0 12px;
}
.ttrpg-settings-subdetails[open] {
    padding-bottom: 10px;
}
.ttrpg-settings-subdetails[open] .ttrpg-settings-subdetails-title {
    border-bottom: 1px solid var(--background-modifier-border);
    margin-bottom: 10px;
}
`;
const TTRPG_READER_VIEW_TYPE = "ttrpg-reader-view";
const TTRPG_SPELLBOOK_VIEW_TYPE = "ttrpg-spellbook-view";
const TTRPG_ITEM_SEARCH_VIEW_TYPE = "ttrpg-item-search-view";
const TTRPG_SEARCH_VIEW_TYPE = "ttrpg-search-view";

class TTRPGVaultSearchPlugin extends Plugin {
    async onload() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.hoverPopover = null;
        this.registerHoverLinkSource("ttrpg-search", {
            display: "TTRPG Search",
            defaultMod: true
        });

        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.setText("");

        this.entryMap = new Map();
        this.index = [];
        this.configuredFolders = [];
        this.configuredFolderKeys = new Set();
        this.activeModals = new Set();
        this._cachedSearchState = null;    // fast in-memory last-search cache
        this._cachedSpellbookSearchState = null;
        this._cachedBestiarySearchState = null;
        this._cachedItemSearchState = null;
        this._pendingReaderState = null;   // handoff to TTRPGReaderView on open
        this._bestiaryEntriesCache = null;
        this._spellEntriesCache = null;
        this._itemEntriesCache = null;
        this._cachedItemRarities = null;
        this._cachedItemAttunements = null;
        this._cachedItemCategories = null;
        this._cachedItemAges = null;
        this._cachedItemTiers = null;
        this._cachedItemSources = null;

        this.pendingPaths = new Set();
        this.didInitialResolvedRebuild = false;
        this.flushPendingUpdates = debounce(() => { void this.applyPendingUpdates(); }, 250, false);

        this.refreshConfiguredFolders();
        this.refreshCustomMaps();
        this.injectStyles();
        this.startSettingsBackupScheduler();

        this.registerView(TTRPG_READER_VIEW_TYPE, (leaf) => new TTRPGReaderView(leaf, this));
        this.registerView(TTRPG_BESTIARY_VIEW_TYPE, (leaf) => new TTRPGBestiaryView(leaf, this));
        this.registerView(TTRPG_SPELLBOOK_VIEW_TYPE, (leaf) => new TTRPGSpellbookView(leaf, this));
        this.registerView(TTRPG_ITEM_SEARCH_VIEW_TYPE, (leaf) => new TTRPGItemSearchView(leaf, this));
        this.registerView(TTRPG_SEARCH_VIEW_TYPE, (leaf) => new TTRPGSearchView(leaf, this));

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
            id: "open-ttrpg-item-search",
            name: "Open TTRPG Item Search",
            callback: () => this.openItemSearchModal(),
        });

        this.addCommand({
            id: "open-ttrpg-bestiary",
            name: "Open TTRPG Bestiary / Encounter Builder",
            callback: () => this.openBestiaryModal(),
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

        this.addRibbonIcon("package", "Open TTRPG Item Search", () => {
            this.openItemSearchModal();
        });

        this.addRibbonIcon("swords", "Open TTRPG Bestiary", () => {
            this.openBestiaryModal();
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

        // Global read-only enforcement inside hover popovers.
        // Blocks all editing while allowing navigation & copy.
        const SAFE_KEYS = new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","PageUp","PageDown","Home","End","Tab","Escape","Shift","Control","Meta","Alt","F5"]);
        const isInHoverPopover = (el) => !!el.closest(".hover-popover");
        const hoverReadOnlyKeydown = (e) => {
            if (!isInHoverPopover(e.target)) return;
            // Allow Ctrl/Cmd+C (copy) and Ctrl/Cmd+A (select-all)
            if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "a")) return;
            if (SAFE_KEYS.has(e.key)) return;
            e.preventDefault();
            e.stopPropagation();
        };
        const hoverReadOnlyBlock = (e) => {
            if (isInHoverPopover(e.target)) { e.preventDefault(); e.stopPropagation(); }
        };
        window.addEventListener("keydown", hoverReadOnlyKeydown, true);
        window.addEventListener("paste",   hoverReadOnlyBlock,   true);
        window.addEventListener("cut",     hoverReadOnlyBlock,   true);
        window.addEventListener("drop",    hoverReadOnlyBlock,   true);
        window.addEventListener("dblclick",hoverReadOnlyBlock,   true);
        this.register(() => {
            window.removeEventListener("keydown", hoverReadOnlyKeydown, true);
            window.removeEventListener("paste",   hoverReadOnlyBlock,   true);
            window.removeEventListener("cut",     hoverReadOnlyBlock,   true);
            window.removeEventListener("drop",    hoverReadOnlyBlock,   true);
            window.removeEventListener("dblclick",hoverReadOnlyBlock,   true);
        });
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
    openBestiaryModal(initialState = null) {
        const state = initialState || (this.settings.saveLastBestiarySearch ? (this._cachedBestiarySearchState || this.settings.lastBestiarySearchState || null) : null);
        const shouldPopout = (this.settings.openBestiaryInPopoutByDefault || (state && state.wasPopout)) && !(state && state.forceModal);
        if (shouldPopout) {
            if (state) state.wasPopout = true;
            void this.openBestiaryPopout(state);
            return;
        }
        new TTRPGBestiaryModal(this.app, this, state).open();
    }
    async openBestiaryPopout(initialState = null) {
        try {
            const leaf = this.app.workspace.getLeaf("window");
            await leaf.setViewState({ type: TTRPG_BESTIARY_VIEW_TYPE, active: true });
            const view = leaf.view;
            if (view && typeof view.initBestiaryView === "function") {
                view.initBestiaryView(initialState);
            }
        } catch (err) {
            new Notice("Could not open pop-out window — Obsidian 1.1+ required.");
            console.error("TTRPG Bestiary pop-out error:", err);
        }
    }
    async openSpellbookPopout(initialState = null) {
        try {
            const leaf = this.app.workspace.getLeaf("window");
            await leaf.setViewState({ type: TTRPG_SPELLBOOK_VIEW_TYPE, active: true });
            const view = leaf.view;
            if (view && typeof view.initSpellbookView === "function") {
                view.initSpellbookView(initialState);
            }
        } catch (err) {
            new Notice("Could not open pop-out window — Obsidian 1.1+ required.");
            console.error("TTRPG Spellbook pop-out error:", err);
        }
    }
    async openItemSearchPopout(initialState = null) {
        try {
            const leaf = this.app.workspace.getLeaf("window");
            await leaf.setViewState({ type: TTRPG_ITEM_SEARCH_VIEW_TYPE, active: true });
            const view = leaf.view;
            if (view && typeof view.initItemSearchView === "function") {
                view.initItemSearchView(initialState);
            }
        } catch (err) {
            new Notice("Could not open pop-out window — Obsidian 1.1+ required.");
            console.error("TTRPG Item Search pop-out error:", err);
        }
    }

    getBestiaryEntries() {
        if (this._bestiaryEntriesCache) return this._bestiaryEntriesCache;
        const bestiaryExcl = this.settings.bestiaryExclusions;
        this._bestiaryEntriesCache = this.getEntries().filter((entry) => {
            if (!entry) return false;
            if (bestiaryExcl && bestiaryExcl.length && this._entryMatchesExclusions(entry, bestiaryExcl)) return false;
            const path = normalizePath(entry.path || "");
            const filename = path.split("/").pop().toLowerCase();
            if (filename.includes("index") || entry.typeKey === "index") {
                return false;
            }
            if (entry.typeKey === "monster") return true;
            if (entry.monsterMeta && (entry.monsterMeta.cr || entry.monsterMeta.bestiaryType || entry.monsterMeta.environment || entry.monsterMeta.xp)) return true;
            if (/(^|\/)(bestiary|bestiaries|monster|monsters|creature|creatures)(\/|$)/i.test(path)) return true;
            return false;
        }).map(entry => {
            if (entry.monsterMeta) {
                const meta = entry.monsterMeta;
                let hasResolvedFS = meta._hasResolvedFS || false;
                if (!hasResolvedFS && this.settings.enableFantasyStatblocksIntegration !== false && window.FantasyStatblocks && typeof window.FantasyStatblocks.getCreatureFromBestiary === "function") {
                    try {
                        const name = entry.collectionName || entry.displayName || entry.fileLabel || entry.path;
                        const fs = window.FantasyStatblocks.getCreatureFromBestiary(name);
                        if (fs) {
                            if (meta.cr == null || meta.cr === "") meta.cr = fs.cr;
                            if (meta.ac == null || meta.ac === "") meta.ac = fs.ac || fs.armor_class;
                            if (meta.hp == null || meta.hp === "") meta.hp = fs.hp || fs.hit_points;
                            if (meta.alignment == null || meta.alignment === "") meta.alignment = fs.alignment;
                            if (meta.bestiaryType == null || meta.bestiaryType === "") meta.bestiaryType = fs.type;
                            if (meta.hit_dice == null || meta.hit_dice === "") meta.hit_dice = fs.hit_dice || fs.hitDice;
                            if (meta.modifier == null || meta.modifier === 0) {
                                const stats = fs.stats || fs.abilities;
                                const dex = fs.dex || fs.dexterity || (stats && (Array.isArray(stats) ? stats[1] : stats.dex));
                                if (dex != null) meta.modifier = Math.floor((Number(dex) - 10) / 2);
                            }
                        }
                    } catch (_) { }
                    meta._hasResolvedFS = true;
                }

                if (meta.cr && (meta.xp == null || meta.xp === "" || meta.xp === 0) && typeof BESTIARY_XP_BY_CR !== "undefined") {
                    meta.xp = BESTIARY_XP_BY_CR[String(meta.cr)] || 0;
                }

                if (meta.bestiaryType && meta._normalizedTypeKey === undefined) {
                    meta._normalizedTypeKey = normalizeKey(meta.bestiaryType);
                }
                if (meta.alignment && meta._normalizedAlignmentKey === undefined) {
                    meta._normalizedAlignmentKey = normalizeKey(meta.alignment);
                }
            }
            return entry;
        });
        return this._bestiaryEntriesCache;
    }

    getSpellEntries() {
        if (this._spellEntriesCache) return this._spellEntriesCache;
        const spellExcl = this.settings.spellbookExclusions;
        this._spellEntriesCache = this.getEntries().filter((entry) => {
            if (!entry || entry.typeKey !== "spell") return false;
            if (spellExcl && spellExcl.length && this._entryMatchesExclusions(entry, spellExcl)) return false;
            return true;
        }).map(entry => {
            if (entry.spellMeta) {
                if (entry.spellMeta.school && entry.spellMeta._normalizedSchoolKey === undefined) {
                    entry.spellMeta._normalizedSchoolKey = normalizeKey(entry.spellMeta.school);
                }
                if (Array.isArray(entry.spellMeta.classes)) {
                    if (entry.spellMeta._normalizedClassesKeys === undefined) {
                        entry.spellMeta._normalizedClassesKeys = entry.spellMeta.classes.map(normalizeKey);
                    }
                } else {
                    entry.spellMeta._normalizedClassesKeys = [];
                }
            }
            return entry;
        });
        return this._spellEntriesCache;
    }

    getBestiaryFavorites() {
        return Array.isArray(this.settings.bestiaryFavorites) ? [...this.settings.bestiaryFavorites] : [];
    }

    isBestiaryFavorite(path) {
        return this.getBestiaryFavorites().includes(path);
    }

    async toggleBestiaryFavorite(path) {
        const set = new Set(this.getBestiaryFavorites());
        if (set.has(path)) set.delete(path); else set.add(path);
        this.settings.bestiaryFavorites = [...set];
        await this.saveSettings(false);
        this.notifyModals();
    }



    openSearchModal(initialState = null) {
        if (initialState && initialState.mode === "spellbook") {
            this.openSpellbookModal(initialState);
            return;
        }
        if (initialState && initialState.mode === "item-search") {
            this.openItemSearchModal(initialState);
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
        const state = initialState || (this.settings.saveLastSpellbookSearch ? (this._cachedSpellbookSearchState || this.settings.lastSpellbookSearchState || null) : null);
        const shouldPopout = (this.settings.openSpellbookInPopoutByDefault || (state && state.isPopout)) && !(state && state.forceModal);
        if (shouldPopout) {
            if (state) state.isPopout = true;
            void this.openSpellbookPopout(state);
            return;
        }
        new TTRPGSpellbookModal(this.app, this, state).open();
    }

    openItemSearchModal(initialState = null) {
        const state = initialState || (this.settings.saveLastItemSearch ? (this._cachedItemSearchState || this.settings.lastItemSearchState || null) : null);
        const shouldPopout = (this.settings.openItemSearchInPopoutByDefault || (state && state.isPopout)) && !(state && state.forceModal);
        if (shouldPopout) {
            if (state) state.isPopout = true;
            void this.openItemSearchPopout(state);
            return;
        }
        new TTRPGItemSearchModal(this.app, this, state).open();
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
            await leaf.setViewState({ type: TTRPG_SEARCH_VIEW_TYPE, active: true });
            // The view may not be ready immediately after setViewState in pop-out windows.
            // Retry a few times with a short delay before giving up.
            let view = leaf.view;
            if (!view || typeof view.initSearchView !== "function") {
                for (let attempt = 0; attempt < 10; attempt++) {
                    await new Promise(r => setTimeout(r, 50));
                    view = leaf.view;
                    if (view && typeof view.initSearchView === "function") break;
                }
            }
            if (view && typeof view.initSearchView === "function") {
                view.initSearchView(initialState);
            } else {
                console.warn("TTRPG: pop-out view not ready after retries, falling back to modal.");
                try { leaf.detach(); } catch (_) { /* ignore */ }
                new TTRPGSearchModal(this.app, this, initialState).open();
            }
        } catch (err) {
            console.error("TTRPG pop-out error:", err);
            // Fallback to modal instead of just showing an error
            new TTRPGSearchModal(this.app, this, initialState).open();
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

    getBestiaryController() {
        for (const modal of this.activeModals) {
            if (modal.controller && (modal instanceof TTRPGBestiaryModal || (modal.getViewType && modal.getViewType() === "ttrpg-bestiary-view"))) {
                return modal.controller;
            }
        }
        let controller = null;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view && leaf.view.getViewType && leaf.view.getViewType() === "ttrpg-bestiary-view" && leaf.view.controller) {
                controller = leaf.view.controller;
            }
        });
        return controller;
    }

    getEntries() {
        return this.index;
    }

    /**
     * Returns true if the entry should be EXCLUDED based on the given exclusion rules.
     * Each rule has {property, value}. If the file's frontmatter[property] matches the value
     * (case-insensitive), the entry is excluded.
     */
    _entryMatchesExclusions(entry, exclusions) {
        if (!exclusions || !exclusions.length) return false;
        const fileCache = this.app.metadataCache.getFileCache(entry.file);
        const fm = fileCache && fileCache.frontmatter;
        if (!fm) return false;
        for (const rule of exclusions) {
            if (!rule.property || !rule.value) continue;
            const propKey = rule.property.toLowerCase();
            const propVal = fm[propKey];
            if (propVal === undefined || propVal === null) continue;
            const ruleVal = rule.value.toLowerCase();
            // Handle arrays (e.g. tags: [a, b])
            if (Array.isArray(propVal)) {
                if (propVal.some(v => String(v).toLowerCase() === ruleVal)) return true;
            } else if (String(propVal).toLowerCase() === ruleVal) {
                return true;
            }
        }
        return false;
    }

    /** Returns index entries filtered by searchExclusions. Used by the search modal/reader. */
    getSearchEntries() {
        const exclusions = this.settings.searchExclusions;
        if (!exclusions || !exclusions.length) return this.index;
        return this.index.filter(entry => !this._entryMatchesExclusions(entry, exclusions));
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

    getItemEntries() {
        if (this._itemEntriesCache) return this._itemEntriesCache;
        const itemExcl = this.settings.itembookExclusions || [];
        this._itemEntriesCache = this.getEntries().filter((entry) => {
            if (!entry || entry.typeKey !== "item") return false;
            if (itemExcl && itemExcl.length && this._entryMatchesExclusions(entry, itemExcl)) return false;
            return true;
        }).map(entry => {
            if (entry.itemMeta) {
                if (entry.itemMeta.rarity && entry.itemMeta._normalizedRarityKey === undefined) {
                    entry.itemMeta._normalizedRarityKey = normalizeKey(entry.itemMeta.rarity);
                }
                if (entry.itemMeta._normalizedAttunementKey === undefined) {
                    const rawAttune = entry.itemMeta.attunement;
                    if (!rawAttune) {
                        entry.itemMeta._normalizedAttunementKey = "no";
                    } else {
                        const norm = rawAttune.toLowerCase();
                        if (norm === "no" || norm === "none" || norm === "false") {
                            entry.itemMeta._normalizedAttunementKey = "no";
                        } else {
                            entry.itemMeta._normalizedAttunementKey = normalizeKey(rawAttune);
                        }
                    }
                }
                if (Array.isArray(entry.itemMeta.categories)) {
                    if (entry.itemMeta._normalizedCategoriesKeys === undefined) {
                        entry.itemMeta._normalizedCategoriesKeys = entry.itemMeta.categories.map(normalizeKey);
                    }
                } else {
                    entry.itemMeta._normalizedCategoriesKeys = [];
                }
            }
            return entry;
        });
        return this._itemEntriesCache;
    }

    getItemRarityOptions() {
        if (this._cachedItemRarities) return this._cachedItemRarities;
        const map = new Map();
        for (const entry of this.index) {
            if (entry.typeKey !== "item" || !entry.itemMeta) continue;
            const { rarity } = entry.itemMeta;
            if (!rarity) continue;
            const key = normalizeKey(rarity);
            const existing = map.get(key);
            if (existing) existing.count++;
            else map.set(key, { key, label: rarity, count: 1 });
        }
        const getRarityWeight = (r) => {
            if (!r) return 0;
            if (r === "none") return 0;
            if (r === "common") return 1;
            if (r === "uncommon") return 2;
            if (r === "rare") return 3;
            if (r === "very rare" || r === "veryrare") return 4;
            if (r === "legendary") return 5;
            if (r === "artifact") return 6;
            if (r.startsWith("unknown")) return 7;
            if (r === "varies") return 8;
            return 9;
        };
        this._cachedItemRarities = Array.from(map.values()).sort((a, b) => {
            const wa = getRarityWeight(a.key);
            const wb = getRarityWeight(b.key);
            return wa - wb || COLLATOR.compare(a.label, b.label);
        });
        return this._cachedItemRarities;
    }

    getItemAttunementOptions() {
        if (this._cachedItemAttunements) return this._cachedItemAttunements;
        const map = new Map();
        for (const entry of this.index) {
            if (entry.typeKey !== "item" || !entry.itemMeta) continue;
            const { attunement } = entry.itemMeta;
            let key = "no";
            let label = "No";
            if (attunement) {
                const norm = attunement.toLowerCase();
                if (norm !== "no" && norm !== "none" && norm !== "false") {
                    key = normalizeKey(attunement);
                    label = attunement;
                }
            }
            const existing = map.get(key);
            if (existing) existing.count++;
            else map.set(key, { key, label, count: 1 });
        }
        this._cachedItemAttunements = Array.from(map.values()).sort((a, b) => COLLATOR.compare(a.label, b.label));
        return this._cachedItemAttunements;
    }

    getItemCategoryOptions() {
        if (this._cachedItemCategories) return this._cachedItemCategories;
        const map = new Map();
        for (const entry of this.index) {
            if (entry.typeKey !== "item" || !entry.itemMeta) continue;
            for (const cat of entry.itemMeta.categories) {
                const key = normalizeKey(cat);
                const existing = map.get(key);
                if (existing) existing.count++;
                else map.set(key, { key, label: cat, count: 1 });
            }
        }
        this._cachedItemCategories = Array.from(map.values()).sort((a, b) => COLLATOR.compare(a.label, b.label));
        return this._cachedItemCategories;
    }

    getItemAgeOptions() {
        if (this._cachedItemAges) return this._cachedItemAges;
        const map = new Map();
        for (const entry of this.index) {
            if (entry.typeKey !== "item" || !entry.itemMeta) continue;
            const { age } = entry.itemMeta;
            if (!age) continue;
            const key = normalizeKey(age);
            const existing = map.get(key);
            if (existing) existing.count++;
            else map.set(key, { key, label: age, count: 1 });
        }
        this._cachedItemAges = Array.from(map.values()).sort((a, b) => COLLATOR.compare(a.label, b.label));
        return this._cachedItemAges;
    }

    getItemTierOptions() {
        if (this._cachedItemTiers) return this._cachedItemTiers;
        const map = new Map();
        for (const entry of this.index) {
            if (entry.typeKey !== "item" || !entry.itemMeta) continue;
            const { tier } = entry.itemMeta;
            if (!tier) continue;
            const key = normalizeKey(tier);
            const existing = map.get(key);
            if (existing) existing.count++;
            else map.set(key, { key, label: tier, count: 1 });
        }
        this._cachedItemTiers = Array.from(map.values()).sort((a, b) => COLLATOR.compare(a.label, b.label));
        return this._cachedItemTiers;
    }

    _getItemSourceOptions() {
        if (this._cachedItemSources) return this._cachedItemSources;
        const map = new Map();
        for (const entry of this.getItemEntries()) {
            if (entry.sourceKey) {
                const existing = map.get(entry.sourceKey);
                if (existing) {
                    existing.count++;
                } else {
                    map.set(entry.sourceKey, {
                        key: entry.sourceKey,
                        label: this.getSourceDisplayLabel(entry.sourceKey, entry.sourceLabel),
                        rawLabel: entry.sourceLabel,
                        count: 1,
                    });
                }
            }
        }
        this._cachedItemSources = Array.from(map.values()).sort((a, b) => COLLATOR.compare(a.label, b.label));
        return this._cachedItemSources;
    }

    isItemBookmarked(path) {
        return Array.isArray(this.settings.itemBookmarks) && this.settings.itemBookmarks.includes(path);
    }

    async toggleItemBookmark(path) {
        if (!Array.isArray(this.settings.itemBookmarks)) this.settings.itemBookmarks = [];
        const idx = this.settings.itemBookmarks.indexOf(path);
        if (idx >= 0) this.settings.itemBookmarks.splice(idx, 1);
        else this.settings.itemBookmarks.push(path);
        await this.saveSettings();
        this.notifyModals();
    }

    getItemBookmarkedPaths() {
        return Array.isArray(this.settings.itemBookmarks) ? [...this.settings.itemBookmarks] : [];
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

        this.notifyBookmarksChanged();
    }

    getBookmarkedEntries() {
        const bookmarked = new Set(this.getBookmarkedPaths());
        return this.index.filter((entry) => {
            if (bookmarked.has(entry.path)) return true;
            if (entry.collectionKind && bookmarked.has(entry.collectionPath)) return true;
            return false;
        });
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
        this.notifyBookmarksChanged();
    }

    async createBookmarkGroup(name) {
        const id = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const groups = this.getBookmarkGroups();
        groups.push({ id, name });
        this.settings.bookmarkGroups = groups;
        await this.saveSettings(false);
        this.notifyBookmarksChanged();
        return id;
    }

    async renameBookmarkGroup(id, name) {
        const groups = this.getBookmarkGroups();
        const group = groups.find((g) => g.id === id);
        if (group) group.name = name;
        this.settings.bookmarkGroups = groups;
        await this.saveSettings(false);
        this.notifyBookmarksChanged();
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
        this.notifyBookmarksChanged();
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
        this.notifyBookmarksChanged();
    }

    // Persist a new ordering of the groups array (drag reorder)
    async setBookmarkGroupsOrder(groups) {
        this.settings.bookmarkGroups = groups;
        await this.saveSettings(false);
        this.notifyBookmarksChanged();
    }

    getBookmarkGroupForEntry(entry) {
        const path = this.getBookmarkSortPathForEntry(entry);
        return this.getBookmarkGroupForPath(path);
    }

    applyCustomDisplayNames() {
        const names = this.settings.bookmarkDisplayNames || {};
        for (const entry of this.index) {
            const orig = entry.originalDisplayName || entry.displayName;
            if (!entry.originalDisplayName) entry.originalDisplayName = orig;

            if (names[entry.path]) {
                entry.displayName = names[entry.path];
                entry.displayNameLower = names[entry.path].toLowerCase();
            } else if (entry.collectionPath && names[entry.collectionPath] && entry.collectionPath === entry.path) {
                entry.displayName = names[entry.collectionPath];
                entry.displayNameLower = names[entry.collectionPath].toLowerCase();
            } else {
                entry.displayName = orig;
                entry.displayNameLower = orig.toLowerCase();
            }
        }
    }

    async setBookmarkDisplayName(path, displayName) {
        if (!this.settings.bookmarkDisplayNames) this.settings.bookmarkDisplayNames = {};
        if (displayName && displayName.trim()) {
            this.settings.bookmarkDisplayNames[path] = displayName.trim();
        } else {
            delete this.settings.bookmarkDisplayNames[path];
        }
        await this.saveSettings(false);
        this.applyCustomDisplayNames();
        this.notifyBookmarksChanged();
    }

    notifyBookmarksChanged() {
        for (const modal of this.activeModals) {
            try {
                if (typeof modal.handleBookmarksChanged === "function") {
                    modal.handleBookmarksChanged();
                }
            } catch (e) {
                console.error("Error notifying handleBookmarksChanged:", e);
            }
        }
    }

    notifyModals() {
        for (const modal of this.activeModals) {
            try {
                if (typeof modal.refreshFromPlugin === "function") {
                    modal.refreshFromPlugin();
                } else if (typeof modal.handleBookmarksChanged === "function") {
                    modal.handleBookmarksChanged();
                }
            } catch (e) {
                console.error("Error notifying modal:", e);
            }
        }
    }
    refreshDynamicSourceSuffixes() { ACTIVE_BASENAME_SOURCE_KEYS = buildBasenameSourceKeySet(this.app.vault.getMarkdownFiles()); }
    getSourceChipData(sourceKey) { const data = this.settings.sourceChipData || {}; return data[sourceKey] || {}; }
    getSourceDisplayLabel(sourceKey, fallback) { const data = this.getSourceChipData(sourceKey); return String(data.label || fallback || "").trim(); }
    getSourceChipColor(sourceKey) { return this.getSourceChipData(sourceKey).color || ""; }
    async updateSourceChip(sourceKey, currentLabel, nextLabel, nextColor) { if (!sourceKey) return; if (!this.settings.sourceChipData || typeof this.settings.sourceChipData !== "object") this.settings.sourceChipData = {}; this.settings.sourceChipData[sourceKey] = { label: String(nextLabel || currentLabel || "").trim(), color: String(nextColor || "").trim() }; this._cachedSourceOptions = null; await this.saveSettings(false); this.notifyModals(); }
    async resetSourceChip(sourceKey) { if (this.settings.sourceChipData && this.settings.sourceChipData[sourceKey]) { delete this.settings.sourceChipData[sourceKey]; this._cachedSourceOptions = null; await this.saveSettings(false); this.notifyModals(); } }
    applySourceChipStyle(chipEl, sourceKey) {
        const color = this.getSourceChipColor(sourceKey);
        chipEl.classList.add("ttrpg-vs__chip--source");
        if (color) {
            chipEl.style.setProperty("--ttrpg-source-color", color);
            chipEl.classList.add("ttrpg-vs__chip--has-custom-color");
        }
        const text = chipEl.textContent || "";
        const len = text.length;
        if (len > 12) {
            const size = Math.max(9, Math.min(13, 13 - (len - 12) * 0.2));
            chipEl.style.fontSize = `${size}px`;
        } else {
            chipEl.style.fontSize = "";
        }
    }
    getFilterPresets() { const byType = (t) => PRESET_SOURCE_ALIASES_5E.filter(([, , type]) => type === t).map(([, label]) => normalizeKey(label)); const coreAdd = ["Xanathar's Guide to Everything", "Tasha's Cauldron of Everything", "Mordenkainen Presents: Monsters of the Multiverse"]; const built = [{ id: "core-2014", name: "Core 2014+", sources: ["Player's Handbook", "Dungeon Master's Guide", "Monster Manual", ...coreAdd].map(normalizeKey), types: [] }, { id: "core-2024", name: "Core 2024+", sources: ["Player's Handbook (2024)", "Dungeon Master's Guide (2024)", "Monster Manual (2024)", ...coreAdd].map(normalizeKey), types: [] }, { id: "books", name: "Books", sources: byType("book"), types: [normalizeKey("Book")] }, { id: "adventures", name: "Adventures", sources: byType("adventure"), types: [normalizeKey("Adventure")] }, { id: "spells", name: "Spells", sources: [], types: [normalizeKey("Spell")] }]; const custom = Array.isArray(this.settings.sourceFilterPresets) ? this.settings.sourceFilterPresets : []; return [...built, ...custom].filter(p => p && p.name); }
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
                const folderContext = rel.split("/").slice(0, -1).map(formatTitle).filter(Boolean).join(" / ");
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

    async buildIndex(showNotice) {
        this.refreshConfiguredFolders();
        this.refreshCustomMaps();
        this.refreshDynamicSourceSuffixes();

        const startTime = performance.now();
        const files = this.app.vault.getMarkdownFiles();
        const total = files.length;

        console.log(`[TTRPG Search] Indexing started. Total markdown files in vault: ${total}`);
        if (showNotice) {
            new Notice("TTRPG Vault Search: Indexing started...");
        }
        if (this.statusBarItem) {
            this.statusBarItem.setText(`TTRPG Indexing: 0/${total}`);
        }

        const nextMap = new Map();
        let count = 0;
        let skippedHidden = 0;
        let skippedFolder = 0;
        let skippedFilter = 0;
        let errors = 0;

        for (const file of files) {
            if (file.extension !== "md") {
                continue;
            }
            if (isHiddenPath(file.path)) {
                skippedHidden++;
            } else if (!isWithinConfiguredFolders(file.path, this.configuredFolders)) {
                skippedFolder++;
            } else {
                try {
                    const entry = await this.buildEntry(file);
                    if (entry) {
                        nextMap.set(file.path, entry);
                    } else {
                        skippedFilter++;
                    }
                } catch (e) {
                    errors++;
                    console.error("Failed to build index entry for file:", file.path, e);
                }
            }
            count++;
            const isMilestone = count % Math.max(1, Math.round(total / 5)) === 0 || count === total;
            if (isMilestone) {
                console.log(`[TTRPG Search] Indexing progress: ${count}/${total} (${Math.round((count / total) * 100)}%)`);
            }
            if (count % 100 === 0 || count === total) {
                if (this.statusBarItem) {
                    this.statusBarItem.setText(`TTRPG Indexing: ${count}/${total} (${Math.round((count / total) * 100)}%)`);
                }
            }
        }

        this.entryMap = nextMap;
        this.publishIndex();

        const duration = performance.now() - startTime;
        console.log(`[TTRPG Search] Indexing finished in ${duration.toFixed(2)}ms.
- Total files checked: ${total}
- Successfully indexed: ${this.index.length}
- Skipped (hidden path): ${skippedHidden}
- Skipped (not in configured folders): ${skippedFolder}
- Skipped (no type/source/collection metadata): ${skippedFilter}
- Errors encountered: ${errors}`);

        if (this.statusBarItem) {
            this.statusBarItem.setText("TTRPG Indexing: Done");
            setTimeout(() => {
                this.statusBarItem.setText("");
            }, 3000);
        }

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

        this.applyCustomDisplayNames();

        // Invalidate all cached option lists
        this._bestiaryEntriesCache = null;
        this._spellEntriesCache = null;
        this._itemEntriesCache = null;
        this._cachedTypeOptions = null;
        this._cachedSourceOptions = null;
        this._cachedSpellLevels = null;
        this._cachedSpellSchools = null;
        this._cachedSpellClasses = null;
        this._cachedItemRarities = null;
        this._cachedItemAttunements = null;
        this._cachedItemCategories = null;
        this._cachedItemAges = null;
        this._cachedItemTiers = null;
        this._cachedItemSources = null;

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

    async applyPendingUpdates() {
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
                let nextEntry = null;
                try {
                    nextEntry = await this.buildEntry(file);
                } catch (e) {
                    console.error("Failed to update index entry for file:", file.path, e);
                }
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

    async buildEntry(file) {
        if (file.extension !== "md") return null;
        if (isHiddenPath(file.path)) return null;
        if (!isWithinConfiguredFolders(file.path, this.configuredFolders)) return null;

        let content = "";
        try {
            content = await this.app.vault.cachedRead(file);
        } catch (e) {
            console.error("Failed to read file content for indexing:", file.path, e);
        }

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

        // Shared tag collection for spell and monster/bestiary metadata.
        // Keep this outside the spell-only block so monsters can safely use it too.
        const cacheTags = fileCache?.tags ? fileCache.tags.map((tc) => tc.tag.replace(/^#/, "")) : [];
        const fmTagsRaw = Array.isArray(frontmatter?.tags) ? frontmatter.tags : [];
        const fmTags = fmTagsRaw.map((t) => String(t).replace(/^#/, "")).filter(Boolean);
        const allTags = [...new Set([...cacheTags, ...fmTags])];

        // Spell-specific metadata (only populated when type is Spell)
        let spellMeta = null;
        if (typeKey === "spell") {
            // Reuse shared tag collection from buildEntry scope.
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
            const levelFromTag = getTagVal("level/");
            const schoolFromTag = getTagVal("school/");
            const classesFromTags = getTagVals("class/").map((c) => formatTitle(c)).filter(Boolean);

            const levelRaw = levelFromTag ?? getFrontmatterValue(frontmatter, "level", "spell_level", "spelllevel");
            const schoolRaw = schoolFromTag ?? readString(getFrontmatterValue(frontmatter, "school"));
            const classesFromFM = readStringArray(getFrontmatterValue(frontmatter, "class", "classes", "for_class", "casting_class"))
                .map((c) => formatTitle(c)).filter(Boolean);

            const ritualRaw = getFrontmatterValue(frontmatter, "ritual", "israitual", "is_ritual");
            const concentrationRaw = getFrontmatterValue(frontmatter, "concentration", "isconcentration", "is_concentration", "duration", "time", "traits", "properties");
            const toBool = (v) => v === true || String(v || "").toLowerCase() === "true" || String(v || "").toLowerCase() === "yes";

            const spellLevel = parseSpellLevel(levelRaw);
            const spellSchool = schoolRaw ? formatTitle(String(schoolRaw)) : null;
            const spellClasses = classesFromTags.length ? classesFromTags : classesFromFM;

            spellMeta = {
                level: spellLevel,
                school: spellSchool,
                classes: spellClasses,
                ritual: hasTag("ritual") || hasTag("tag/ritual") || toBool(ritualRaw),
                concentration: hasTag("concentration") || hasTag("tag/concentration") || hasTag("trait/concentration") || tagContains(fileCache, frontmatter, "concentration") || toBool(concentrationRaw) || valueContainsText(concentrationRaw, "concentration"),
            };
        }

        // Item-specific metadata (only populated when type is Item)
        let itemMeta = null;
        if (typeKey === "item") {
            const tagBase = ((this.settings.spellTagPrefix || "ttrpg-cli") + "/item/").toLowerCase();
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

            const rarityFromTag = getTagVal("rarity/");
            const rarityFromFM = getFrontmatterValue(frontmatter, "rarity");
            const rarity = rarityFromTag || rarityFromFM || null;

            const attunementFromTag = getTagVal("attunement/");
            const attunementFromFM = getFrontmatterValue(frontmatter, "attunement", "attunes");
            const attunement = attunementFromTag || attunementFromFM || null;

            const categories = [];
            for (const tag of allTags) {
                if (tag.toLowerCase().startsWith(tagBase)) {
                    const subPath = tag.slice(tagBase.length).trim();
                    if (subPath) {
                        const segments = subPath.split("/");
                        const category = segments[0];
                        if (category !== "rarity" && category !== "attunement") {
                            categories.push(category);
                        }
                    }
                }
            }
            const typeFromFM = getFrontmatterValue(frontmatter, "itemtype", "item_type", "type");
            if (typeFromFM && !categories.includes(String(typeFromFM).toLowerCase())) {
                categories.push(String(typeFromFM).toLowerCase());
            }

            const magicRaw = getFrontmatterValue(frontmatter, "magic", "is_magic", "ismagic");
            let isMagic = false;
            if (magicRaw != null) {
                isMagic = magicRaw === true || String(magicRaw).toLowerCase() === "true" || String(magicRaw).toLowerCase() === "yes";
            } else {
                const normRarity = rarity ? rarity.toLowerCase() : "";
                const hasAttune = !!attunement && attunement !== "none" && attunement !== "no" && attunement !== "false";
                const isMagicCategory = categories.some(c => ["wondrous", "wand", "rod", "staff", "scroll", "potion", "ring"].includes(c));
                const hasMagicRarity = normRarity && !["none", "normal", "mundane"].includes(normRarity);
                isMagic = hasAttune || isMagicCategory || hasMagicRarity;
            }

            const ageFromTag = getTagVal("age/");
            const ageFromFM = getFrontmatterValue(frontmatter, "age");
            const age = ageFromTag || ageFromFM || null;

            const tierFromTag = getTagVal("tier/");
            const tierFromFM = getFrontmatterValue(frontmatter, "tier");
            const tier = tierFromTag || tierFromFM || null;

            const ac = getFrontmatterValue(frontmatter, "ac", "armorclass", "armor_class") || null;
            let acVal = null;
            if (ac != null) {
                const matches = String(ac).match(/\d+/);
                if (matches) acVal = Number(matches[0]);
            }

            const range = getFrontmatterValue(frontmatter, "range") || null;
            let normalRange = null;
            let longRange = null;
            if (range != null) {
                const parts = String(range).split("/");
                if (parts[0]) {
                    const m0 = parts[0].match(/\d+/);
                    if (m0) normalRange = Number(m0[0]);
                }
                if (parts[1]) {
                    const m1 = parts[1].match(/\d+/);
                    if (m1) longRange = Number(m1[0]);
                }
            }

            itemMeta = {
                rarity: rarity ? formatTitle(rarity) : null,
                attunement: attunement ? formatTitle(attunement) : null,
                categories: [...new Set(categories.map(c => formatTitle(c)).filter(Boolean))],
                isMagic: !!isMagic,
                age: age ? formatTitle(age) : null,
                tier: tier ? formatTitle(tier) : null,
                ac: acVal,
                normalRange,
                longRange
            };
        }

        const bestiaryPathHint = /(^|\/)(bestiary|bestiaries|monster|monsters|creature|creatures)(\/|$)/i.test(normalizePath(file.path || ""));
        const bestiaryFrontmatterHint = !!getFrontmatterValue(frontmatter, "cr", "challenge", "challenge_rating", "challengeRating", "bestiarytype", "bestiary_type", "monster_type", "monstertype", "creature_type");
        const bestiaryTagHint = (Array.isArray(allTags) ? allTags : []).some((tag) => /(^|\/)(bestiary|monster|creature|npc)(\/|$)/i.test(String(tag || "")));
        const entryLooksLikeMonster = normalizeKey(typeLabel) === "monster" || bestiaryPathHint || bestiaryFrontmatterHint || bestiaryTagHint;
        let monsterMeta = null;
        if (entryLooksLikeMonster) {
            try {
                const statblockData = parseStatblockCodeBlock(content);
                monsterMeta = extractMonsterMeta(frontmatter, Array.isArray(allTags) ? allTags : [], file, typeLabel, displayName, statblockData);
            } catch (err) {
                console.error("Failed to parse monster metadata for indexing:", file.path, err);
            }
        }

        const entry = {
            file,
            path: file.path,
            pathLower: file.path.toLowerCase(),

            displayName,
            displayNameLower: displayName.toLowerCase(),
            originalDisplayName: displayName,

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
            itemMeta,
            monsterMeta,

            fileContent: content,
            fileContentLower: content.toLowerCase(),

            searchBlob: "",
        };

        entry.searchBlob = buildSearchBlob(entry);
        return entry;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.applyCustomDisplayNames();
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
    onOpen() { this.modalEl.classList.add("ttrpg-vs-source-modal"); this.titleEl.setText("Edit Source Chip"); this.contentEl.empty(); const data = this.plugin.getSourceChipData(this.sourceKey); const wrap = this.contentEl.createDiv({ cls: "ttrpg-vs-source" }); const labelRow = wrap.createDiv({ cls: "ttrpg-vs-source-edit__row" }); labelRow.createDiv({ cls: "ttrpg-vs__label", text: "Chip text (can duplicate another source without merging filters)" }); const labelInput = labelRow.createEl("input", { cls: "ttrpg-vs-source-edit__input" }); labelInput.type = "text"; labelInput.value = data.label || this.currentLabel || ""; const colorRow = wrap.createDiv({ cls: "ttrpg-vs-source-edit__row" }); colorRow.createDiv({ cls: "ttrpg-vs__label", text: "Chip colour" }); const colorInput = colorRow.createEl("input", { cls: "ttrpg-vs-source-edit__input" }); colorInput.type = "color"; colorInput.value = /^#[0-9a-f]{6}$/i.test(data.color || "") ? data.color : "#7c3aed"; const buttons = wrap.createDiv({ cls: "ttrpg-vs__button-row" }); const saveBtn = buttons.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Save" }); saveBtn.type = "button"; saveBtn.addEventListener("click", async () => { await this.plugin.updateSourceChip(this.sourceKey, this.currentLabel, labelInput.value, colorInput.value); this.close(); }); const resetBtn = buttons.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Reset" }); resetBtn.type = "button"; resetBtn.addEventListener("click", async () => { await this.plugin.resetSourceChip(this.sourceKey); this.close(); }); window.setTimeout(() => labelInput.focus(), 0); }
}

class ImageSelectorModal extends Modal {
    constructor(app, plugin, entry, onSave) {
        super(app);
        this.plugin = plugin;
        this.entry = entry;
        this.onSave = onSave;
    }
    onOpen() {
        this.modalEl.classList.add("ttrpg-vs-source-modal");
        this.titleEl.setText("Set Custom Token Image");
        const contentEl = this.contentEl;
        contentEl.empty();

        const wrap = contentEl.createDiv({ cls: "ttrpg-vs-source" });

        const info = wrap.createDiv();
        info.style.marginBottom = "12px";
        info.style.color = "var(--text-accent)";
        info.style.fontWeight = "bold";
        info.style.fontSize = "13px";
        info.setText("Optimal image size is 256x256 pixels.");

        const vaultRow = wrap.createDiv({ cls: "ttrpg-vs-source-edit__row" });
        vaultRow.createDiv({ cls: "ttrpg-vs__label", text: "Vault Image Path" });
        const vaultInput = vaultRow.createEl("input", { cls: "ttrpg-vs-source-edit__input" });
        vaultInput.type = "text";
        vaultInput.placeholder = "e.g. attachments/goblin_token.png";

        const key = this.entry.collectionPath || this.entry.path;
        const currentCustom = this.plugin.settings.customMonsterImages?.[key] || this.entry.monsterMeta?.image || "";
        vaultInput.value = currentCustom;

        const uploadRow = wrap.createDiv({ cls: "ttrpg-vs-source-edit__row" });
        uploadRow.createDiv({ cls: "ttrpg-vs__label", text: "Or Upload from Desktop (Copies file into vault)" });
        const fileInput = uploadRow.createEl("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.style.width = "100%";

        const buttons = wrap.createDiv({ cls: "ttrpg-vs__button-row" });

        const saveBtn = buttons.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Save" });
        saveBtn.type = "button";
        saveBtn.addEventListener("click", async () => {
            const file = fileInput.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async () => {
                    const arrayBuffer = reader.result;
                    let folderPath = "";
                    if (this.entry.path && this.entry.path.includes("/")) {
                        folderPath = this.entry.path.substring(0, this.entry.path.lastIndexOf("/"));
                    }
                    const destPath = (folderPath ? folderPath + "/" : "") + file.name;
                    try {
                        let existing = this.app.vault.getAbstractFileByPath(destPath);
                        if (existing) {
                            await this.app.vault.modifyBinary(existing, arrayBuffer);
                        } else {
                            await this.app.vault.createBinary(destPath, arrayBuffer);
                        }
                        await this.saveImage(destPath);
                        new Notice(`Copied desktop file to vault: ${destPath}`);
                        this.close();
                    } catch (err) {
                        new Notice("Failed to copy file: " + err.message);
                    }
                };
                reader.readAsArrayBuffer(file);
            } else {
                const pathVal = vaultInput.value.trim();
                if (pathVal) {
                    await this.saveImage(pathVal);
                    this.close();
                } else {
                    new Notice("Please enter a vault path or select a desktop file.");
                }
            }
        });

        const resetBtn = buttons.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Reset" });
        resetBtn.type = "button";
        resetBtn.addEventListener("click", async () => {
            await this.saveImage("");
            this.close();
        });
    }

    async saveImage(imgPath) {
        const key = this.entry.collectionPath || this.entry.path;
        if (!this.plugin.settings.customMonsterImages) {
            this.plugin.settings.customMonsterImages = {};
        }
        if (imgPath) {
            this.plugin.settings.customMonsterImages[key] = imgPath;
        } else {
            delete this.plugin.settings.customMonsterImages[key];
        }
        await this.plugin.saveSettings(false);

        const file = this.app.vault.getAbstractFileByPath(this.entry.path);
        if (file && file instanceof TFile) {
            try {
                await this.app.fileManager.processFrontMatter(file, (fm) => {
                    if (imgPath) {
                        fm["image"] = imgPath;
                    } else {
                        delete fm["image"];
                    }
                });
            } catch (e) {
                console.error("Failed to update frontmatter image:", e);
            }
        }
        if (this.onSave) this.onSave();
    }
}

class TTRPGConfirmModal extends Modal {
    constructor(app, title, message, confirmText, cancelText, onResult) {
        super(app);
        this.confirmTitle = title || "Confirm";
        this.message = message || "";
        this.confirmText = confirmText || "Confirm";
        this.cancelText = cancelText || "Cancel";
        this.onResult = typeof onResult === "function" ? onResult : (() => { });
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
        this.hoverPopover = null;

        this.query = "";
        this.selectedTypes = new Set();
        this.selectedSources = new Set();       // ← now a Set (multi-select)
        this.selectedIndex = 0;
        this.visibleEntries = [];
        this.renderedItems = new Map();
        this.virtualRenderQueued = false;
        this.showBookmarksOnly = false;
        this.selectedBookmarkGroup = null;      // null = all groups
        this._engine = null;
        this.sortReverse = false;
        this._openingEntry = false;

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
        this.inputEl.addEventListener("blur", () => this.saveSearchState());

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
                    this.saveSearchState();
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
                this.plugin,
                () => this.plugin.getSourceOptions(),
                new Set(this.selectedSources),
                (selectedKeys) => {
                    this.selectedSources = selectedKeys;
                    this.updateSourceButton();
                    this.selectedIndex = 0;
                    this.refreshResults(true);
                    this.saveSearchState();
                }
            );
            picker.open();
        });

        const sortFilterEl = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        sortFilterEl.createDiv({ cls: "ttrpg-vs__label", text: "Sort" });

        const sortRow = sortFilterEl.createDiv({ cls: "ttrpg-vs__sort-row" });
        sortRow.style.display = "flex";
        sortRow.style.gap = "4px";
        sortRow.style.width = "100%";

        this.sortSelectEl = sortRow.createEl("select", { cls: "ttrpg-vs__select" });
        this.sortSelectEl.style.flex = "1";
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
            this.saveSearchState();
            this.refreshResults(false);
        });

        this.sortReverseBtn = sortRow.createEl("button", {
            cls: "ttrpg-vs__toolbutton",
            text: "⇅",
        });
        this.sortReverseBtn.type = "button";
        this.sortReverseBtn.style.padding = "4px 8px";
        this.sortReverseBtn.style.width = "auto";
        this.sortReverseBtn.style.flexShrink = "0";
        this.sortReverseBtn.title = "Reverse Sort Order";
        this.sortReverseBtn.addEventListener("click", () => {
            this.sortReverse = !this.sortReverse;
            this.sortReverseBtn.classList.toggle("is-active", this.sortReverse);
            this.saveSearchState();
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
            this.saveSearchState();
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
            this.saveSearchState();
        });

        this.presetSelectEl = buttonRowEl.createEl("select", { cls: "ttrpg-vs__select" });
        this.presetSelectEl.style.width = "auto";
        this.presetSelectEl.appendChild(Object.assign(document.createElement("option"), { value: "", textContent: "Preset…" }));
        for (const preset of this.plugin.getFilterPresets()) { const opt = document.createElement("option"); opt.value = preset.id; opt.textContent = preset.name; this.presetSelectEl.appendChild(opt); }
        this.presetSelectEl.addEventListener("change", () => {
            const preset = this.plugin.getFilterPresets().find((p) => p.id === this.presetSelectEl.value);
            if (!preset) return;
            const validSources = new Set(this.plugin.getSourceOptions().map((o) => o.key));
            const validTypes = new Set(this.plugin.getTypeOptions().map((o) => o.key));
            this.selectedSources = new Set((preset.sources || []).map(normalizeKey).filter((k) => validSources.has(k)));
            this.selectedTypes = new Set((preset.types || []).map(normalizeKey).filter((k) => validTypes.has(k)));
            this.updateSourceButton();
            this.updateTypeButton();
            this.selectedIndex = 0;
            this.refreshResults(true);
            this.saveSearchState();
        });

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
        if (this._engine) {
            this._engine.destroy();
        }
        if (this._viewportRO) { this._viewportRO.disconnect(); this._viewportRO = null; }
        if (this.plugin.settings.saveLastSearch) {
            const snap = this._engine ? this._engine.searchState : (this.viewportEl ? this.getStateSnapshot() : null);
            if (snap) {
                this.plugin._cachedSearchState = snap;
                this.plugin.settings.lastSearchState = snap;
                void this.plugin.saveSettings(false);
            }
        }
        this._engine = null;
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
        this.sortReverse = !!this.initialState.sortReverse;
        if (this.sortReverseBtn) {
            this.sortReverseBtn.classList.toggle("is-active", this.sortReverse);
        }

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
            sortReverse: this.sortReverse,
            scrollTop: this.viewportEl ? this.viewportEl.scrollTop : 0,
        };
    }

    saveSearchState() {
        if (this.plugin.settings.saveLastSearch) {
            const snap = this.getStateSnapshot();
            this.plugin._cachedSearchState = snap;
            this.plugin.settings.lastSearchState = snap;
            void this.plugin.saveSettings(false);
        }
    }

    refreshFromPlugin() {
        if (this._engine) {
            this._engine.refreshFromPlugin();
            return;
        }
        this.refreshFilters();
        this.updateSourceButton();
        this.updateBookmarksButton();
        this.renderBookmarkGroupTabs();
        this.refreshResults(false);
    }

    handleBookmarksChanged() {
        if (this._engine) {
            this._engine.handleBookmarksChanged();
            return;
        }
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
            this.saveSearchState();
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
                this.saveSearchState();
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
                this.saveSearchState();
            });
            this.groupTabsEl.appendChild(tab);
        }
    }

    refreshResults(resetScroll) {
        const titleOnly = !!this.plugin.settings.searchTitleOnly;
        let entries = this.plugin.getSearchEntries();

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
                    const groupId = this.plugin.getBookmarkGroupForEntry(entry);
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
            const isRep = entry.path === collRepPath.get(entry.collectionPath);

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

        let bookmarkOrderedEntries = this.showBookmarksOnly ? this.plugin.sortEntriesByBookmarkOrder(deduped, this.selectedBookmarkGroup) : deduped;
        if (this.sortReverse) {
            bookmarkOrderedEntries = [...bookmarkOrderedEntries].reverse();
        }
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

        // Ctrl/Cmd-hover: trigger Obsidian native page preview
        const _handleModalHover = (e) => {
            if (e.ctrlKey || e.metaKey) {
                this.app.workspace.trigger("hover-link", {
                    event: e,
                    source: "search",
                    hoverParent: this,
                    targetEl: itemEl,
                    linktext: entry.path,
                    sourcePath: ""
                });
            }
        };
        itemEl.addEventListener("mouseover", _handleModalHover);
        itemEl.addEventListener("mousemove", _handleModalHover);

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
            starEl.classList.toggle("is-active", this.plugin.isBookmarked(bookmarkKey));
            starEl.textContent = this.plugin.isBookmarked(bookmarkKey) ? "★" : "☆";
            starEl.title = this.plugin.isBookmarked(bookmarkKey) ? "Remove bookmark" : "Add bookmark";
            this.updateBookmarksButton();
            if (this.showBookmarksOnly) {
                this.refreshResults(false);
            }
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
        if (this._openingEntry) return;
        this._openingEntry = true;
        const timeoutId = setTimeout(() => { this._openingEntry = false; }, 1000);
        try {
            await new Promise(resolve => setTimeout(resolve, 50));
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

            if (this._viewportRO) {
                this._viewportRO.disconnect();
                this._viewportRO = null;
            }
            this.renderedItems.clear();
            this.contentEl.empty();
            this.contentEl.classList.remove("ttrpg-vs");
            this.contentEl.classList.add("ttrpg-reader");
            this.modalEl.classList.remove("ttrpg-vs-modal");
            this.modalEl.classList.add("ttrpg-reader-modal");

            this._engine = new ReaderEngine(this.app, this.plugin, {
                setTitle: (text) => this.titleEl.setText(text),
                goBack: (state) => {
                    if (this._engine) {
                        this._engine.destroy();
                        this._engine = null;
                    }
                    this.initialState = state;
                    this.contentEl.empty();
                    this.contentEl.classList.remove("ttrpg-reader");
                    this.contentEl.classList.add("ttrpg-vs");
                    this.modalEl.classList.remove("ttrpg-reader-modal");
                    this.modalEl.classList.add("ttrpg-vs-modal");
                    this.onOpen();
                },
                closeReader: () => this.close(),
                isPopout: false,
            });
            this._engine.build(this.contentEl, entries, initialIndex, snap);
        } finally {
            clearTimeout(timeoutId);
            this._openingEntry = false;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
function stopSelectPropagation(el) {
    if (!el) return;
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => e.stopPropagation());
}

class TTRPGBestiaryController {
    constructor(app, plugin, options) {
        this.app = app;
        this.plugin = plugin;
        this.containerEl = options.containerEl;
        this.isPopout = options.isPopout || false;
        this.onClose = options.onClose;
        this.parentComponent = options.parentComponent || plugin;
        this._openingEntry = false;

        this.nameQuery = "";
        this.environmentQuery = "";
        this.crQuery = "";
        this.acQuery = "";
        this.typeQuery = "";
        this.sizeQuery = "";
        this.alignmentQuery = "";
        this.selectedCRs = new Set();
        this.selectedSources = new Set();
        this.selectedTypes = new Set();
        this.selectedAlignments = new Set();
        this.showFavoritesOnly = false;
        this.selectedBookmarkGroup = "";
        this.activeTab = "CR";
        this.sortMode = "name";
        this.sortDirection = "asc";
        this.viewMode = "cards";
        this.filterWidth = this.plugin.settings.bestiaryFilterWidth || 280;
        this.encounterWidth = this.plugin.settings.bestiaryEncounterWidth || 340;
        this.encounterMinimised = this.plugin.settings.bestiaryEncounterMinimised || false;
        this.encounterName = this.plugin.settings.bestiaryEncounterName || "New Encounter";
        this.encounter = Array.isArray(this.plugin.settings.bestiaryEncounter) ? JSON.parse(JSON.stringify(this.plugin.settings.bestiaryEncounter)) : [];
        this.partyRows = Array.isArray(this.plugin.settings.bestiaryPartyRows) ? JSON.parse(JSON.stringify(this.plugin.settings.bestiaryPartyRows)) : [{ level: 5, count: 4 }];
        this.xpMathMode = this.plugin.settings.bestiaryXpMathMode || "kpfc";
        this.includePartySizeAdjustment = this.plugin.settings.bestiaryIncludePartySizeAdjustment !== false;
        this.fleeMortalsDifficulty = this.plugin.settings.bestiaryFleeMortalsDifficulty || "standard";
        this.fleeMortalsDayBudget = this.plugin.settings.bestiaryFleeMortalsDayBudget || 8;
        this.fleeMortalsSpent = this.plugin.settings.bestiaryFleeMortalsSpent || 0;
        this.selectedPartyName = this.plugin.settings.bestiarySelectedPartyName || "custom";
        this._monsterReaderLeaf = null;

        this._sourcesCache = null;
        this._typesCache = null;
        this._alignmentsCache = null;
        this._monsterImageCache = new Map();

        if (options.initialState) {
            this.loadState(options.initialState);
        }

        this.debouncedMainRender = debounce(() => this.renderMainContent(), 150, false);
    }

    loadState(state) {
        if (!state) return;
        if (state.nameQuery !== undefined) this.nameQuery = state.nameQuery;
        if (state.environmentQuery !== undefined) this.environmentQuery = state.environmentQuery;
        if (state.crQuery !== undefined) this.crQuery = state.crQuery;
        if (state.acQuery !== undefined) this.acQuery = state.acQuery;
        if (state.typeQuery !== undefined) this.typeQuery = state.typeQuery;
        if (state.sizeQuery !== undefined) this.sizeQuery = state.sizeQuery;
        if (state.alignmentQuery !== undefined) this.alignmentQuery = state.alignmentQuery;
        if (state.selectedCRs) this.selectedCRs = new Set(state.selectedCRs);
        if (state.selectedSources) this.selectedSources = new Set(state.selectedSources);
        if (state.selectedTypes) this.selectedTypes = new Set(state.selectedTypes);
        if (state.selectedAlignments) this.selectedAlignments = new Set(state.selectedAlignments);
        if (state.showFavoritesOnly !== undefined) this.showFavoritesOnly = state.showFavoritesOnly;
        if (state.selectedBookmarkGroup !== undefined) this.selectedBookmarkGroup = state.selectedBookmarkGroup;
        if (state.activeTab !== undefined) this.activeTab = state.activeTab;
        if (state.sortMode !== undefined) this.sortMode = state.sortMode;
        if (state.sortDirection !== undefined) this.sortDirection = state.sortDirection;
        if (state.viewMode !== undefined) this.viewMode = state.viewMode;
        if (state.encounterName !== undefined) this.encounterName = state.encounterName;
        if (state.encounter) this.encounter = JSON.parse(JSON.stringify(state.encounter));
        if (state.partyRows) this.partyRows = JSON.parse(JSON.stringify(state.partyRows));
        if (state.xpMathMode !== undefined) this.xpMathMode = state.xpMathMode;
        if (state.includePartySizeAdjustment !== undefined) this.includePartySizeAdjustment = state.includePartySizeAdjustment;
        if (state.fleeMortalsDifficulty !== undefined) this.fleeMortalsDifficulty = state.fleeMortalsDifficulty;
        if (state.fleeMortalsDayBudget !== undefined) this.fleeMortalsDayBudget = state.fleeMortalsDayBudget;
        if (state.fleeMortalsSpent !== undefined) this.fleeMortalsSpent = state.fleeMortalsSpent;
        if (state.selectedPartyName !== undefined) this.selectedPartyName = state.selectedPartyName;
    }

    getStateSnapshot() {
        const listArea = this.mainColumnEl ? this.mainColumnEl.querySelector(".ttrpg-vs-best-list-area") : null;
        return {
            nameQuery: this.nameQuery,
            environmentQuery: this.environmentQuery,
            crQuery: this.crQuery,
            acQuery: this.acQuery,
            typeQuery: this.typeQuery,
            sizeQuery: this.sizeQuery,
            alignmentQuery: this.alignmentQuery,
            selectedCRs: Array.from(this.selectedCRs),
            selectedSources: Array.from(this.selectedSources),
            selectedTypes: Array.from(this.selectedTypes),
            selectedAlignments: Array.from(this.selectedAlignments),
            showFavoritesOnly: this.showFavoritesOnly,
            selectedBookmarkGroup: this.selectedBookmarkGroup,
            activeTab: this.activeTab,
            sortMode: this.sortMode,
            sortDirection: this.sortDirection,
            viewMode: this.viewMode,
            encounterName: this.encounterName,
            encounter: JSON.parse(JSON.stringify(this.encounter)),
            partyRows: JSON.parse(JSON.stringify(this.partyRows)),
            xpMathMode: this.xpMathMode,
            includePartySizeAdjustment: this.includePartySizeAdjustment,
            fleeMortalsDifficulty: this.fleeMortalsDifficulty,
            fleeMortalsDayBudget: this.fleeMortalsDayBudget,
            fleeMortalsSpent: this.fleeMortalsSpent,
            selectedPartyName: this.selectedPartyName,
            wasPopout: this.isPopout,
            scrollTop: listArea ? listArea.scrollTop : 0,
            encounterScrollTop: this.encounterColumnEl ? this.encounterColumnEl.scrollTop : 0
        };
    }

    getMonsterName(entry) { return entry.collectionName || entry.displayName || entry.fileLabel || entry.path; }
    getMonsterKey(entry) { return entry.collectionPath || entry.path; }
    getMonsterMeta(entry) { return entry.monsterMeta || {}; }

    getTrackerPlugin() {
        if (this.plugin.settings.enableInitiativeTrackerIntegration === false) return null;
        return this.app.plugins && this.app.plugins.plugins["initiative-tracker"];
    }

    handleBookmarksChanged() {
        this._sourcesCache = null;
        this._typesCache = null;
        this._alignmentsCache = null;
        this._monsterImageCache.clear();
        this.setupFiltersDOM();
        this.renderFiltersTab();
        this.renderMainContent();
    }

    getMonsterStats(entry) {
        const meta = this.getMonsterMeta(entry);
        let ac = meta.ac, hp = meta.hp, hit_dice = meta.hit_dice, modifier = meta.modifier;
        if (!meta._hasResolvedFS && this.plugin.settings.enableFantasyStatblocksIntegration !== false && window.FantasyStatblocks && typeof window.FantasyStatblocks.getCreatureFromBestiary === "function") {
            try {
                const fsMonster = window.FantasyStatblocks.getCreatureFromBestiary(this.getMonsterName(entry));
                if (fsMonster) {
                    if (!ac) ac = fsMonster.ac || fsMonster.armor_class;
                    if (!hp) hp = fsMonster.hp || fsMonster.hit_points;
                    if (!hit_dice) hit_dice = fsMonster.hit_dice || fsMonster.hitDice;
                    if (modifier == null || modifier === 0) {
                        const stats = fsMonster.stats || fsMonster.abilities;
                        const dex = fsMonster.dex || fsMonster.dexterity || (stats && (Array.isArray(stats) ? stats[1] : stats.dex));
                        if (dex != null) modifier = Math.floor((Number(dex) - 10) / 2);
                    }
                }
            } catch (e) {
                console.error("Failed to read stats from Fantasy Statblocks:", e);
            }
        }
        return {
            ac: ac != null ? String(ac).trim() : "",
            hp: hp != null ? Number(hp) || 0 : 0,
            hit_dice: hit_dice != null ? String(hit_dice).trim() : "",
            modifier: modifier != null ? Number(modifier) || 0 : 0
        };
    }

    resolveImagePath(imgPath) {
        if (!imgPath) return "";
        if (typeof imgPath !== "string") return "";
        let path = imgPath.trim();
        if (path.startsWith("[[") && path.endsWith("]]")) {
            path = path.slice(2, -2).split("|")[0].trim();
        }
        if (/^(https?|data|app):/i.test(path)) {
            return path;
        }
        // Strip leading slash — vault paths are relative to root without leading /
        if (path.startsWith("/")) {
            path = path.slice(1);
        }
        // Try resolving as a link path
        const file = this.app.metadataCache.getFirstLinkpathDest(path, "");
        if (file) {
            return this.app.vault.getResourcePath(file);
        }
        // Try resolving just the basename (some vaults store only the filename)
        const basename = path.split("/").pop();
        if (basename && basename !== path) {
            const basenameFile = this.app.metadataCache.getFirstLinkpathDest(basename, "");
            if (basenameFile) {
                return this.app.vault.getResourcePath(basenameFile);
            }
        }
        // Try as an abstract file path directly
        const abstractFile = this.app.vault.getAbstractFileByPath(path);
        if (abstractFile && abstractFile instanceof TFile) {
            return this.app.vault.getResourcePath(abstractFile);
        }
        if (this.app.vault.adapter.getResourcePath) {
            return this.app.vault.adapter.getResourcePath(path);
        }
        return path;
    }

    getMonsterImage(entry) {
        const key = this.getMonsterKey(entry);
        if (this._monsterImageCache && this._monsterImageCache.has(key)) {
            return this._monsterImageCache.get(key);
        }

        const resolveAndCache = () => {
            const customImage = this.plugin.settings.customMonsterImages?.[key];
            if (customImage) {
                const resolved = this.resolveImagePath(customImage);
                if (resolved) return resolved;
            }
            const meta = this.getMonsterMeta(entry);
            if (meta.image) {
                const resolved = this.resolveImagePath(meta.image);
                if (resolved) return resolved;
            }
            if (this.plugin.settings.enableFantasyStatblocksIntegration !== false && window.FantasyStatblocks && typeof window.FantasyStatblocks.getCreatureFromBestiary === "function") {
                try {
                    const namesToTry = [
                        this.getMonsterName(entry),
                        entry.displayName,
                        entry.fileLabel,
                        ...(entry.aliases || [])
                    ].filter(Boolean);
                    const tried = new Set();
                    for (const name of namesToTry) {
                        if (tried.has(name)) continue;
                        tried.add(name);
                        const fsMonster = window.FantasyStatblocks.getCreatureFromBestiary(name);
                        if (fsMonster) {
                            let imgPath = fsMonster.image || fsMonster.token || fsMonster.avatar || fsMonster.portrait;
                            if (imgPath) {
                                return this.resolveImagePath(imgPath);
                            }
                        }
                    }
                } catch (e) {
                    console.error("Failed to read token image from Fantasy Statblocks:", e);
                }
            }
            if (entry && entry.path) {
                try {
                    const entryPath = entry.path;
                    const dir = entryPath.substring(0, entryPath.lastIndexOf("/"));
                    const baseName = entryPath.substring(entryPath.lastIndexOf("/") + 1).replace(/\.md$/i, "");
                    for (const ext of ["png", "webp", "jpg"]) {
                        const tokenPath = dir + "/token/" + baseName + "." + ext;
                        const tokenFile = this.app.vault.getAbstractFileByPath(tokenPath);
                        if (tokenFile && tokenFile instanceof TFile) {
                            return this.app.vault.getResourcePath(tokenFile);
                        }
                    }
                } catch (e) {
                    console.error("Failed to construct token path:", e);
                }
            }
            return null;
        };

        const result = resolveAndCache();
        if (this._monsterImageCache) {
            this._monsterImageCache.set(key, result);
        }
        return result;
    }

    getMonsterDisplayMeta(entry) {
        const meta = this.getMonsterMeta(entry);
        const stats = this.getMonsterStats(entry);

        let bestiaryType = meta.bestiaryType || "";
        let size = meta.size || "";
        let alignment = meta.alignment || "";

        if (this.plugin.settings.enableFantasyStatblocksIntegration !== false && window.FantasyStatblocks && typeof window.FantasyStatblocks.getCreatureFromBestiary === "function") {
            try {
                const fsMonster = window.FantasyStatblocks.getCreatureFromBestiary(this.getMonsterName(entry));
                if (fsMonster) {
                    if (!bestiaryType) bestiaryType = fsMonster.bestiaryType || fsMonster.type || "";
                    if (!size) size = fsMonster.size || "";
                    if (!alignment) alignment = fsMonster.alignment || "";
                }
            } catch (e) {
                console.error("Failed to read extra meta from Fantasy Statblocks:", e);
            }
        }

        return {
            name: this.getMonsterName(entry),
            cr: meta.cr || "",
            ac: stats.ac || meta.ac || "",
            hp: stats.hp || meta.hp || 0,
            type: bestiaryType,
            size: size,
            alignment: alignment,
            source: this.plugin.getSourceDisplayLabel(entry.sourceKey, entry.sourceLabel || entry.sourceKey)
        };
    }

    formatType(type) {
        if (!type) return "—";
        return String(type)
            .split(/[\s-]+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(" ");
    }

    async startCombat() {
        const tracker = this.getTrackerPlugin();
        if (!tracker) {
            new Notice("Initiative Tracker plugin is not enabled.");
            return;
        }
        const creatures = [];
        if (this.selectedPartyName !== "custom" && tracker.data?.parties) {
            const party = tracker.data.parties.find(p => p.name === this.selectedPartyName);
            if (party && party.players) {
                for (const pName of party.players) {
                    const p = tracker.getPlayerByName(pName);
                    if (p) {
                        creatures.push({
                            name: p.name,
                            hp: p.hp || 0,
                            ac: p.ac || 10,
                            modifier: p.modifier || 0,
                            level: p.level || 1,
                            player: true,
                            path: p.path || ""
                        });
                    }
                }
            }
        } else {
            let customId = 1;
            for (const row of this.partyRows) {
                const level = Math.max(1, Math.min(20, Number(row.level) || 1));
                const count = Math.max(0, Math.floor(Number(row.count) || 0));
                for (let i = 0; i < count; i++) {
                    creatures.push({
                        name: `Player ${customId++} (Lvl ${level})`,
                        hp: 0,
                        ac: 10,
                        modifier: 0,
                        level: level,
                        player: true
                    });
                }
            }
        }
        for (const m of this.encounter) {
            const entry = this.plugin.getEntries().find(e => this.getMonsterKey(e) === m.key || e.path === m.key);
            let stats = { ac: "", hp: 0, hit_dice: "", modifier: 0 };
            if (entry) {
                stats = this.getMonsterStats(entry);
            }
            const qty = Math.max(1, Number(m.qty) || 1);
            for (let i = 0; i < qty; i++) {
                creatures.push({
                    name: qty > 1 ? `${m.name} ${i + 1}` : m.name,
                    hp: stats.hp || 0,
                    ac: Number(stats.ac) || 10,
                    modifier: stats.modifier || 0,
                    cr: m.cr || "",
                    xp: m.xp || 0,
                    hit_dice: stats.hit_dice || "",
                    player: false,
                    path: m.key || ""
                });
            }
        }
        if (!creatures.length) {
            new Notice("No combatants in encounter to start combat.");
            return;
        }
        try {
            if (window.InitiativeTracker && typeof window.InitiativeTracker.newEncounter === "function") {
                window.InitiativeTracker.newEncounter({
                    name: this.encounterName || "Encounter",
                    creatures: creatures
                });
                new Notice("Combat launched in Initiative Tracker!");
                if (this.onClose) this.onClose();
            } else {
                this.app.workspace.trigger("initiative-tracker:start-encounter", creatures);
                new Notice("Combat started via workspace event.");
                if (this.onClose) this.onClose();
            }
        } catch (e) {
            console.error("Failed to start combat:", e);
            new Notice("Error starting combat. See console.");
        }
    }

    refreshPartyFromTracker() {
        if (this.selectedPartyName === "custom") return;
        const tracker = this.getTrackerPlugin();
        if (!tracker || !tracker.data?.parties) return;
        const party = tracker.data.parties.find(p => p.name === this.selectedPartyName);
        if (!party || !party.players) return;
        const levels = {};
        for (const pName of party.players) {
            const p = tracker.getPlayerByName(pName);
            const lvl = p?.level || 5;
            levels[lvl] = (levels[lvl] || 0) + 1;
        }
        const rows = [];
        for (const [lvl, count] of Object.entries(levels)) {
            rows.push({ level: Number(lvl), count: Number(count) });
        }
        this.partyRows = rows.length ? rows : [{ level: 5, count: 1 }];
    }

    randomizeEncounter(difficulty) {
        const party = this.getPartySummary();
        if (party.players <= 0) {
            new Notice("Please add players to your party first.");
            return;
        }
        const budget = party.thresholds[difficulty] || party.thresholds.medium;
        if (!budget) {
            new Notice("Party budget not calculated.");
            return;
        }
        const settings = this.plugin.settings;
        const candidates = this.filteredEntries().filter(e => {
            const crRaw = this.getMonsterMeta(e).cr;
            if (crRaw == null || crRaw === "") return false;
            const crNum = this.crToNumber(crRaw);

            // Exclude CR 0 creatures from easy encounters
            if (difficulty === "easy" && crNum === 0) return false;

            // Apply settings constraints
            if (settings.randomEncounterMinCR !== undefined && settings.randomEncounterMinCR !== "") {
                const minCR = this.crToNumber(settings.randomEncounterMinCR);
                if (crNum < minCR) return false;
            }
            if (settings.randomEncounterMaxCR !== undefined && settings.randomEncounterMaxCR !== "") {
                const maxCR = this.crToNumber(settings.randomEncounterMaxCR);
                if (crNum > maxCR) return false;
            }
            if (settings.randomEncounterSources !== undefined && settings.randomEncounterSources.trim() !== "") {
                const allowedSources = settings.randomEncounterSources.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
                if (allowedSources.length && !allowedSources.includes(e.sourceKey.toLowerCase())) return false;
            }
            return true;
        });
        if (!candidates.length) {
            new Notice("No monsters match active filters to randomize from.");
            return;
        }
        const selectRandomCandidate = () => {
            return candidates[Math.floor(Math.random() * candidates.length)];
        };
        const getAdjustedXP = (raw, count) => {
            const baseMult = this.getBaseEncounterMultiplier(count);
            const mult = this.getAdjustedEncounterMultiplier(baseMult, party.players);
            return Math.round(raw * mult);
        };
        let bestSet = [];
        let bestDiff = Infinity;
        for (let pass = 0; pass < 50; pass++) {
            const currentSet = [];
            let currentXP = 0;
            let currentRaw = 0;
            let currentCount = 0;
            const maxMonsters = difficulty === "deadly" ? 20 : 12;
            while (currentXP < budget && currentCount < maxMonsters) {
                const monster = selectRandomCandidate();
                const meta = this.getMonsterMeta(monster);
                const xp = meta.xp || BESTIARY_XP_BY_CR[meta.cr] || 0;
                if (xp > budget && currentCount > 0) break;
                const key = this.getMonsterKey(monster);
                const name = this.getMonsterName(monster);
                const existing = currentSet.find(x => x.key === key);
                if (existing) {
                    existing.qty++;
                } else {
                    currentSet.push({
                        key,
                        name,
                        qty: 1,
                        cr: meta.cr,
                        xp: xp
                    });
                }
                currentRaw += xp;
                currentCount++;
                currentXP = getAdjustedXP(currentRaw, currentCount);
            }
            const diff = Math.abs(currentXP - budget);
            if (diff < bestDiff && currentXP > 0 && currentXP <= budget * 1.25) {
                bestDiff = diff;
                bestSet = currentSet;
            }
        }
        if (bestSet.length) {
            this.encounter = bestSet;
            new Notice(`Generated ${difficulty} random encounter.`);
            this.updateEncounterMonstersDOM();
            this.updateXPSummary();
            void this.saveStateToSettings();
        } else {
            new Notice("Could not balance a random encounter with active filters. Try widening CR or sources.");
        }
    }

    getSources() {
        if (this._sourcesCache) return this._sourcesCache;
        const map = new Map();
        for (const entry of this.plugin.getBestiaryEntries()) {
            const key = entry.sourceKey;
            if (!key) continue;
            if (!map.has(key)) {
                map.set(key, {
                    key: key,
                    label: this.plugin.getSourceDisplayLabel(key, entry.sourceLabel || key)
                });
            }
        }
        this._sourcesCache = Array.from(map.values()).sort((a, b) => COLLATOR.compare(a.label, b.label));
        return this._sourcesCache;
    }

    getTypes() {
        if (this._typesCache) return this._typesCache;
        this._typesCache = [...new Set(this.plugin.getBestiaryEntries().map(e => (this.getMonsterMeta(e).bestiaryType || "").toLowerCase()).filter(Boolean))].sort((a, b) => COLLATOR.compare(a, b));
        return this._typesCache;
    }

    getAlignments() {
        if (this._alignmentsCache) return this._alignmentsCache;
        this._alignmentsCache = [...new Set(this.plugin.getBestiaryEntries().map(e => {
            const meta = this.getMonsterMeta(e);
            const al = meta.alignment || "";
            return al ? al.toLowerCase().trim() : "";
        }).filter(Boolean))].sort((a, b) => COLLATOR.compare(a, b));
        return this._alignmentsCache;
    }

    filteredEntries() {
        const nq = this.nameQuery.trim().toLowerCase();
        const eq = this.environmentQuery.trim().toLowerCase();
        const favs = new Set(this.plugin.getBestiaryFavorites());
        let entries = this.plugin.getBestiaryEntries().filter((entry) => {
            const meta = this.getMonsterMeta(entry);
            const name = this.getMonsterName(entry).toLowerCase();
            const sourceKey = entry.sourceKey || "";
            const typeKey = meta._normalizedTypeKey || "";
            if (nq && !name.includes(nq)) return false;
            if (eq && !String(meta.environment || "").toLowerCase().includes(eq)) return false;
            if (this.showFavoritesOnly && !favs.has(this.getMonsterKey(entry)) && !favs.has(entry.path)) return false;

            if (this.selectedBookmarkGroup) {
                const entryKey = this.getMonsterKey(entry);
                const entryPath = entry.path || "";
                const isBookmarked = this.plugin.isBookmarked(entryPath) || this.plugin.isBookmarked(entryKey);
                if (!isBookmarked) return false;

                if (this.selectedBookmarkGroup !== "all") {
                    const gId = this.plugin.getBookmarkGroupForPath(entryPath) || this.plugin.getBookmarkGroupForPath(entryKey);
                    if (this.selectedBookmarkGroup === "ungrouped") {
                        if (gId) return false;
                    } else {
                        if (gId !== this.selectedBookmarkGroup) return false;
                    }
                }
            }

            if (this.crQuery) {
                const cq = this.crQuery.trim().toLowerCase();
                if (cq && !String(meta.cr || "").toLowerCase().includes(cq)) return false;
            }
            if (this.acQuery) {
                const aq = this.acQuery.trim().toLowerCase();
                if (aq && !String(meta.ac || "").toLowerCase().includes(aq)) return false;
            }
            if (this.typeQuery) {
                const tq = this.typeQuery.trim().toLowerCase();
                if (tq && !String(meta.bestiaryType || "").toLowerCase().includes(tq)) return false;
            }
            if (this.sizeQuery) {
                const sq = this.sizeQuery.trim().toLowerCase();
                if (sq && !String(meta.size || "").toLowerCase().includes(sq)) return false;
            }
            if (this.alignmentQuery) {
                const alq = this.alignmentQuery.trim().toLowerCase();
                if (alq && !String(meta.alignment || "").toLowerCase().includes(alq)) return false;
            }
            if (this.selectedCRs.size && !this.selectedCRs.has(meta.cr || "")) return false;
            if (this.selectedSources.size && !this.selectedSources.has(sourceKey)) return false;
            if (this.selectedTypes.size && !this.selectedTypes.has(typeKey)) return false;
            if (this.selectedAlignments.size) {
                const alignKey = meta._normalizedAlignmentKey || "";
                if (!this.selectedAlignments.has(alignKey)) return false;
            }
            return true;
        });
        entries.sort((a, b) => {
            const am = this.getMonsterMeta(a), bm = this.getMonsterMeta(b);
            let diff = 0;
            if (this.sortMode === "cr") {
                diff = (BESTIARY_CR_ORDER.indexOf(am.cr) - BESTIARY_CR_ORDER.indexOf(bm.cr));
            } else if (this.sortMode === "source") {
                const aLabel = this.plugin.getSourceDisplayLabel(a.sourceKey, a.sourceLabel || a.sourceKey);
                const bLabel = this.plugin.getSourceDisplayLabel(b.sourceKey, b.sourceLabel || b.sourceKey);
                diff = COLLATOR.compare(aLabel || "", bLabel || "");
            } else if (this.sortMode === "type") {
                diff = COLLATOR.compare(am.bestiaryType || "", bm.bestiaryType || "");
            } else if (this.sortMode === "ac") {
                diff = (Number(am.ac) || 0) - (Number(bm.ac) || 0);
            } else if (this.sortMode === "hp") {
                diff = (Number(am.hp) || 0) - (Number(bm.hp) || 0);
            } else if (this.sortMode === "size") {
                const sizeOrder = ["tiny", "small", "medium", "large", "huge", "gargantuan"];
                diff = sizeOrder.indexOf((am.size || "").toLowerCase()) - sizeOrder.indexOf((bm.size || "").toLowerCase());
            } else if (this.sortMode === "alignment") {
                diff = COLLATOR.compare(am.alignment || "", bm.alignment || "");
            } else {
                diff = COLLATOR.compare(this.getMonsterName(a), this.getMonsterName(b));
            }
            if (diff === 0) {
                return COLLATOR.compare(this.getMonsterName(a), this.getMonsterName(b));
            }
            return this.sortDirection === "asc" ? diff : -diff;
        });
        return entries;
    }

    build() {
        this.containerEl.empty();

        const headerEl = this.containerEl.createDiv({ cls: "ttrpg-bestiary-header" });
        headerEl.style.display = "flex";
        headerEl.style.justifyContent = "space-between";
        headerEl.style.alignItems = "center";
        headerEl.style.marginBottom = "8px";
        headerEl.style.paddingBottom = "6px";
        headerEl.style.borderBottom = "1px solid var(--background-modifier-border)";

        const titleEl = headerEl.createDiv({ cls: "ttrpg-bestiary-title-text", text: "TTRPG Bestiary / Encounter Builder" });
        titleEl.style.fontSize = "16px";
        titleEl.style.fontWeight = "bold";

        const actionsEl = headerEl.createDiv({ cls: "ttrpg-bestiary-actions" });
        actionsEl.style.display = "flex";
        actionsEl.style.gap = "8px";
        actionsEl.style.alignItems = "center";

        const viewModeSelect = actionsEl.createEl("select", { cls: "ttrpg-bestiary-view-select" });
        stopSelectPropagation(viewModeSelect);
        viewModeSelect.style.padding = "4px 8px";
        viewModeSelect.style.fontSize = "12px";
        [["cards", "▦ Cards"], ["table", "▤ Table"]].forEach(([val, lbl]) => {
            const opt = viewModeSelect.createEl("option", { value: val, text: lbl });
            if (this.viewMode === val) opt.selected = true;
        });
        viewModeSelect.addEventListener("change", () => {
            this.viewMode = viewModeSelect.value;
            this.renderMainContent();
        });

        const toggleEncounterBtn = actionsEl.createEl("button", {
            cls: "ttrpg-bestiary-toggle-encounter-btn",
            text: this.encounterMinimised ? "Expand Encounter" : "Collapse Encounter"
        });
        toggleEncounterBtn.addEventListener("click", () => {
            this.encounterMinimised = !this.encounterMinimised;
            this.plugin.settings.bestiaryEncounterMinimised = this.encounterMinimised;
            void this.plugin.saveSettings(false);
            toggleEncounterBtn.setText(this.encounterMinimised ? "Expand Encounter" : "Collapse Encounter");
            this.updateLayout();
        });

        const root = this.containerEl.createDiv({ cls: "ttrpg-vs-best-root" });

        this.filtersColumnEl = root.createDiv({ cls: "ttrpg-vs-best-filters" });
        const splitterLeft = root.createDiv({ cls: "ttrpg-vs-best-splitter" });
        this.mainColumnEl = root.createDiv({ cls: "ttrpg-vs-best-main" });
        this.splitterRightEl = root.createDiv({ cls: "ttrpg-vs-best-splitter" });
        this.encounterColumnEl = root.createDiv({ cls: "ttrpg-vs-best-encounter" });

        this.makeResizable(splitterLeft, this.filtersColumnEl, this.mainColumnEl, false);
        this.makeResizable(this.splitterRightEl, this.mainColumnEl, this.encounterColumnEl, true);

        this.setupFiltersDOM();
        this.renderFiltersTab();
        this.renderMainContent();
        this.setupEncounterDOM();
        this.updateEncounterPanel();
        this.updateLayout();

        if (this.initialState) {
            const state = this.initialState;
            if (state.scrollTop) {
                const listArea = this.mainColumnEl.querySelector(".ttrpg-vs-best-list-area");
                if (listArea) {
                    requestAnimationFrame(() => {
                        listArea.scrollTop = state.scrollTop;
                    });
                }
            }
            if (state.encounterScrollTop) {
                if (this.encounterColumnEl) {
                    requestAnimationFrame(() => {
                        this.encounterColumnEl.scrollTop = state.encounterScrollTop;
                    });
                }
            }
        }
    }

    makeResizable(splitter, leftEl, rightEl, isRightSplitter) {
        let startX, startWidth;
        const onMouseDown = (e) => {
            startX = e.clientX;
            startWidth = isRightSplitter ? rightEl.offsetWidth : leftEl.offsetWidth;
            splitter.classList.add("is-dragging");
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
            e.preventDefault();
        };
        const onMouseMove = (e) => {
            const deltaX = e.clientX - startX;
            let newWidth;
            if (isRightSplitter) {
                newWidth = startWidth - deltaX;
                if (newWidth < 180) newWidth = 180;
                if (newWidth > 600) newWidth = 600;
                this.encounterWidth = newWidth;
                rightEl.style.width = `${newWidth}px`;
                this.plugin.settings.bestiaryEncounterWidth = newWidth;
            } else {
                newWidth = startWidth + deltaX;
                if (newWidth < 180) newWidth = 180;
                if (newWidth > 500) newWidth = 500;
                this.filterWidth = newWidth;
                leftEl.style.width = `${newWidth}px`;
                this.plugin.settings.bestiaryFilterWidth = newWidth;
            }
        };
        const onMouseUp = () => {
            splitter.classList.remove("is-dragging");
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            void this.plugin.saveSettings(false);
        };
        splitter.addEventListener("mousedown", onMouseDown);
    }

    updateLayout() {
        this.filtersColumnEl.style.width = `${this.filterWidth}px`;
        this.filtersColumnEl.style.flexShrink = "0";

        this.mainColumnEl.style.flex = "1 1 0";
        this.mainColumnEl.style.minWidth = "200px";

        if (this.encounterMinimised) {
            this.encounterColumnEl.style.display = "none";
            this.splitterRightEl.style.display = "none";
        } else {
            this.encounterColumnEl.style.display = "flex";
            this.encounterColumnEl.style.width = `${this.encounterWidth}px`;
            this.encounterColumnEl.style.flexShrink = "0";
            this.splitterRightEl.style.display = "block";
        }
    }

    async saveStateToSettings() {
        this.plugin.settings.bestiaryEncounterName = this.encounterName;
        this.plugin.settings.bestiaryEncounter = JSON.parse(JSON.stringify(this.encounter));
        this.plugin.settings.bestiaryPartyRows = JSON.parse(JSON.stringify(this.partyRows));
        this.plugin.settings.bestiaryXpMathMode = this.xpMathMode;
        this.plugin.settings.bestiarySelectedPartyName = this.selectedPartyName;
        this.plugin.settings.bestiaryIncludePartySizeAdjustment = this.includePartySizeAdjustment;
        this.plugin.settings.bestiaryFleeMortalsDifficulty = this.fleeMortalsDifficulty;
        this.plugin.settings.bestiaryFleeMortalsDayBudget = this.fleeMortalsDayBudget;
        this.plugin.settings.bestiaryFleeMortalsSpent = this.fleeMortalsSpent;
        await this.plugin.saveSettings(false);
    }

    setupFiltersDOM() {
        const el = this.filtersColumnEl;
        el.empty();

        const label = (text) => el.createDiv({ cls: "ttrpg-vs__label", text });

        label("Name");
        const name = el.createEl("input");
        name.type = "text";
        name.value = this.nameQuery;
        name.placeholder = "Text";
        name.style.width = "100%";
        name.style.boxSizing = "border-box";
        name.addEventListener("input", () => {
            this.nameQuery = name.value;
            this.debouncedMainRender();
        });

        label("Environment");
        const env = el.createEl("input");
        env.type = "text";
        env.value = this.environmentQuery;
        env.placeholder = "Text";
        env.style.width = "100%";
        env.style.boxSizing = "border-box";
        env.addEventListener("input", () => {
            this.environmentQuery = env.value;
            this.debouncedMainRender();
        });

        const favRow = el.createDiv();
        favRow.style.marginTop = "8px";
        favRow.style.marginBottom = "8px";
        const fav = favRow.createEl("input");
        fav.type = "checkbox";
        fav.checked = this.showFavoritesOnly;
        fav.addEventListener("change", () => {
            this.showFavoritesOnly = fav.checked;
            this.debouncedMainRender();
        });
        favRow.appendText(" Favorites");

        const bmGroupRow = el.createDiv();
        bmGroupRow.style.marginTop = "6px";
        bmGroupRow.style.marginBottom = "8px";
        bmGroupRow.createDiv({ cls: "ttrpg-vs__label", text: "Bookmark Group" }).style.marginBottom = "4px";

        const bmSelect = bmGroupRow.createEl("select");
        stopSelectPropagation(bmSelect);
        bmSelect.style.width = "100%";
        bmSelect.appendChild(Object.assign(document.createElement("option"), { value: "", textContent: "None (All Monsters)" }));
        bmSelect.appendChild(Object.assign(document.createElement("option"), { value: "all", textContent: "All Bookmarked" }));
        bmSelect.appendChild(Object.assign(document.createElement("option"), { value: "ungrouped", textContent: "Ungrouped Bookmarks" }));

        for (const group of this.plugin.getBookmarkGroups()) {
            const opt = document.createElement("option");
            opt.value = group.id;
            opt.textContent = group.name;
            bmSelect.appendChild(opt);
        }
        bmSelect.value = this.selectedBookmarkGroup || "";
        bmSelect.addEventListener("change", () => {
            this.selectedBookmarkGroup = bmSelect.value;
            this.debouncedMainRender();
        });

        const filterActionsRow = el.createDiv();
        filterActionsRow.style.display = "flex";
        filterActionsRow.style.gap = "6px";
        filterActionsRow.style.marginBottom = "10px";

        const clear = filterActionsRow.createEl("button", { text: "↻ Clear" });
        clear.style.flex = "1";
        clear.style.boxSizing = "border-box";

        const presetSelect = filterActionsRow.createEl("select");
        stopSelectPropagation(presetSelect);
        presetSelect.style.flex = "1";
        presetSelect.style.boxSizing = "border-box";
        presetSelect.appendChild(Object.assign(document.createElement("option"), { value: "", textContent: "Preset…" }));
        for (const preset of this.plugin.getFilterPresets()) {
            const opt = document.createElement("option");
            opt.value = preset.id;
            opt.textContent = preset.name;
            presetSelect.appendChild(opt);
        }

        if (!this.isPopout) {
            const popoutBtn = filterActionsRow.createEl("button", { text: "⤢ Pop Out", cls: "ttrpg-bestiary-popout-btn" });
            popoutBtn.title = "Open in its own window";
            popoutBtn.style.flex = "1";
            popoutBtn.style.boxSizing = "border-box";
            popoutBtn.addEventListener("click", async () => {
                const snap = this.getStateSnapshot();
                if (this.onClose) this.onClose();
                await this.plugin.openBestiaryPopout(snap);
            });
        } else {
            const popinBtn = filterActionsRow.createEl("button", { text: "⤡ Pop In", cls: "ttrpg-bestiary-popin-btn" });
            popinBtn.title = "Move back to main window";
            popinBtn.style.flex = "1";
            popinBtn.style.boxSizing = "border-box";
            popinBtn.addEventListener("click", () => {
                const snap = this.getStateSnapshot();
                snap.forceModal = true;
                if (this.onClose) this.onClose();
                this.plugin.openBestiaryModal(snap);
            });
        }

        clear.addEventListener("click", () => {
            this.nameQuery = "";
            name.value = "";
            this.environmentQuery = "";
            env.value = "";
            this.crQuery = "";
            this.acQuery = "";
            this.typeQuery = "";
            this.sizeQuery = "";
            this.alignmentQuery = "";
            this.selectedCRs.clear();
            this.selectedSources.clear();
            this.selectedTypes.clear();
            this.selectedAlignments.clear();
            this.showFavoritesOnly = false;
            this.selectedBookmarkGroup = "";
            fav.checked = false;
            bmSelect.value = "";
            presetSelect.value = "";
            this.renderFiltersTab();
            this.debouncedMainRender();
        });

        presetSelect.addEventListener("change", () => {
            const preset = this.plugin.getFilterPresets().find(p => p.id === presetSelect.value);
            if (!preset) return;
            const validSources = new Set(this.getSources().map(s => s.key));
            this.selectedSources = new Set((preset.sources || []).map(normalizeKey).filter(k => validSources.has(k)));
            if (preset.types && preset.types.length) {
                const validTypes = new Set(this.getTypes().map(t => normalizeKey(t)));
                this.selectedTypes = new Set((preset.types || []).map(normalizeKey).filter(t => validTypes.has(t)));
            }
            this.renderFiltersTab();
            this.debouncedMainRender();
        });

        const tabs = el.createDiv({ cls: "ttrpg-bestiary-filter-tabs" });
        tabs.style.display = "flex";
        tabs.style.gap = "4px";
        tabs.style.marginBottom = "8px";

        this.tabButtons = {};
        ["General", "Sources", "CR", "Type", "Alignment"].forEach(t => {
            const b = tabs.createEl("button", { text: t });
            b.style.flex = "1";
            b.style.padding = "4px 6px";
            b.style.fontSize = "11px";
            b.addEventListener("click", () => {
                this.activeTab = t;
                Object.keys(this.tabButtons).forEach(k => {
                    this.tabButtons[k].classList.toggle("is-active", k === t);
                });
                this.renderFiltersTab();
            });
            if (this.activeTab === t) b.addClass("is-active");
            this.tabButtons[t] = b;
        });

        const boxOuter = el.createDiv();
        boxOuter.style.overflowY = "auto";
        boxOuter.style.flex = "1";
        boxOuter.style.minHeight = "0";
        boxOuter.style.border = "1px solid var(--background-modifier-border)";
        boxOuter.style.borderRadius = "6px";
        boxOuter.style.padding = "8px";
        boxOuter.style.background = "var(--background-secondary)";

        this.filtersCheckboxListEl = boxOuter.createDiv();
        this.filtersCheckboxListEl.style.display = "flex";
        this.filtersCheckboxListEl.style.flexDirection = "column";
        this.filtersCheckboxListEl.style.gap = "6px";
    }

    renderFiltersTab() {
        const box = this.filtersCheckboxListEl;
        box.empty();

        box.style.display = "flex";
        box.style.flexDirection = "column";
        box.style.gap = "6px";
        box.style.gridTemplateColumns = "";

        if (["CR", "Sources", "Type", "Alignment"].includes(this.activeTab)) {
            const btnRow = box.createDiv();
            btnRow.style.display = "flex";
            btnRow.style.gap = "8px";
            btnRow.style.marginBottom = "6px";
            if (this.activeTab === "CR") {
                btnRow.style.gridColumn = "span 2";
            }

            const selectAll = btnRow.createEl("button");
            selectAll.setText("Select All");
            selectAll.style.padding = "2px 8px";
            selectAll.style.fontSize = "11px";
            selectAll.addEventListener("click", (e) => {
                e.preventDefault();
                let items = [];
                let set = null;
                if (this.activeTab === "CR") {
                    items = BESTIARY_CR_ORDER;
                    set = this.selectedCRs;
                } else if (this.activeTab === "Sources") {
                    items = this.getSources().map(s => s.key);
                    set = this.selectedSources;
                } else if (this.activeTab === "Type") {
                    items = this.getTypes().map(t => normalizeKey(t));
                    set = this.selectedTypes;
                } else if (this.activeTab === "Alignment") {
                    items = this.getAlignments().map(a => normalizeKey(a));
                    set = this.selectedAlignments;
                }
                if (set) {
                    items.forEach(item => set.add(item));
                    this.renderFiltersTab();
                    this.debouncedMainRender();
                }
            });

            const unselectAll = btnRow.createEl("button");
            unselectAll.setText("Unselect All");
            unselectAll.style.padding = "2px 8px";
            unselectAll.style.fontSize = "11px";
            unselectAll.addEventListener("click", (e) => {
                e.preventDefault();
                let set = null;
                if (this.activeTab === "CR") {
                    set = this.selectedCRs;
                } else if (this.activeTab === "Sources") {
                    set = this.selectedSources;
                } else if (this.activeTab === "Type") {
                    set = this.selectedTypes;
                } else if (this.activeTab === "Alignment") {
                    set = this.selectedAlignments;
                }
                if (set) {
                    set.clear();
                    this.renderFiltersTab();
                    this.debouncedMainRender();
                }
            });
        }

        if (this.activeTab === "CR") {
            box.style.display = "grid";
            box.style.gridTemplateColumns = "1fr 1fr";
            BESTIARY_CR_ORDER.forEach(cr => {
                this.renderCheck(box, cr, this.selectedCRs, cr);
            });
        } else if (this.activeTab === "Sources") {
            this.getSources().forEach(src => {
                this.renderCheck(box, src.label, this.selectedSources, src.key, (e) => {
                    new SourceChipEditModal(this.app, this.plugin, src.key, src.label).open();
                });
            });
        } else if (this.activeTab === "Type") {
            this.getTypes().forEach(type => {
                this.renderCheck(box, this.formatType(type), this.selectedTypes, normalizeKey(type));
            });
        } else if (this.activeTab === "Alignment") {
            this.getAlignments().forEach(al => {
                this.renderCheck(box, this.formatType(al), this.selectedAlignments, normalizeKey(al));
            });
        } else if (this.activeTab === "General") {
            const addField = (label, value, onInput, placeholder = "Text") => {
                box.createDiv({ cls: "ttrpg-vs__label", text: label }).style.marginTop = "4px";
                const inp = box.createEl("input");
                inp.type = "text";
                inp.value = value;
                inp.placeholder = placeholder;
                inp.style.width = "100%";
                inp.style.boxSizing = "border-box";
                inp.addEventListener("input", () => {
                    onInput(inp.value);
                    this.debouncedMainRender();
                });
                return inp;
            };

            addField("CR", this.crQuery, (val) => { this.crQuery = val; });
            addField("AC", this.acQuery, (val) => { this.acQuery = val; });
            addField("Type", this.typeQuery, (val) => { this.typeQuery = val; });
            addField("Size", this.sizeQuery, (val) => { this.sizeQuery = val; });
            addField("Alignment", this.alignmentQuery, (val) => { this.alignmentQuery = val; });
        } else {
            box.createDiv({
                text: "Use Name, Environment, Favorites, Sources, CR, Type, and Alignment filters.",
                cls: "ttrpg-vs__meta-text"
            }).style.padding = "4px";
        }
    }

    renderCheck(parent, label, set, value, onContextMenu) {
        const row = parent.createDiv();
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "6px";
        row.style.fontSize = "13px";

        const cb = row.createEl("input");
        cb.type = "checkbox";
        cb.checked = set.has(value);
        cb.addEventListener("change", () => {
            if (cb.checked) set.add(value);
            else set.delete(value);
            this.debouncedMainRender();
        });

        const lbl = row.createEl("span", { text: label });
        lbl.style.cursor = "pointer";
        lbl.addEventListener("click", () => {
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event("change"));
        });

        if (onContextMenu) {
            row.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                e.stopPropagation();
                onContextMenu(e);
            });
        }
    }

    hasActiveFilters() {
        return this.nameQuery.trim() !== "" ||
            this.environmentQuery.trim() !== "" ||
            this.crQuery.trim() !== "" ||
            this.acQuery.trim() !== "" ||
            this.typeQuery.trim() !== "" ||
            this.sizeQuery.trim() !== "" ||
            this.alignmentQuery.trim() !== "" ||
            this.selectedCRs.size > 0 ||
            this.selectedSources.size > 0 ||
            this.selectedTypes.size > 0 ||
            this.selectedAlignments.size > 0 ||
            this.showFavoritesOnly;
    }

    renderMainContent() {
        if (this.randBtn) {
            const hasFilters = this.hasActiveFilters();
            this.randBtn.setText(hasFilters ? "🎲 Randomize (Filtered Pool)" : "🎲 Randomize (All Monsters)");
        }
        const el = this.mainColumnEl;
        const oldListArea = el.querySelector(".ttrpg-vs-best-list-area");
        const savedScrollTop = oldListArea ? oldListArea.scrollTop : 0;

        el.empty();

        const filtered = this.filteredEntries();

        const toolbar = el.createDiv();
        toolbar.style.display = "flex";
        toolbar.style.gap = "8px";
        toolbar.style.alignItems = "center";
        toolbar.style.marginBottom = "8px";

        const titleText = this.viewMode === "cards" ? "▦ Cards" : "▤ Table";
        toolbar.createSpan({ text: titleText }).style.fontWeight = "bold";

        const countVal = filtered.length;
        const count = toolbar.createSpan({ text: String(countVal) + " results" });
        count.style.color = "var(--text-accent)";
        count.style.fontSize = "12px";

        const spacer = toolbar.createDiv();
        spacer.style.flex = "1";

        const sort = toolbar.createEl("select");
        stopSelectPropagation(sort);
        sort.style.padding = "4px 8px";
        sort.style.fontSize = "12px";
        [["name", "Name"], ["cr", "CR"], ["ac", "AC"], ["hp", "HP"], ["source", "Source"], ["type", "Type"], ["size", "Size"], ["alignment", "Alignment"]].forEach(([v, t]) => {
            const o = sort.createEl("option", { text: t, value: v });
            if (v === this.sortMode) o.selected = true;
        });
        sort.addEventListener("change", () => {
            this.sortMode = sort.value;
            this.renderMainContent();
        });

        const dirBtn = toolbar.createEl("button", {
            cls: "ttrpg-vs__toolbutton"
        });
        dirBtn.style.padding = "4px 8px";
        dirBtn.style.fontSize = "12px";
        dirBtn.style.width = "auto";
        dirBtn.setText("⇅");
        dirBtn.title = "Reverse Sort Order";
        dirBtn.classList.toggle("is-active", this.sortDirection === "desc");
        dirBtn.addEventListener("click", () => {
            this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
            dirBtn.classList.toggle("is-active", this.sortDirection === "desc");
            this.renderMainContent();
        });

        const listArea = el.createDiv();
        listArea.className = "ttrpg-vs-best-list-area";
        listArea.style.overflowY = "auto";
        listArea.style.flex = "1";
        listArea.style.minHeight = "0";

        const entries = filtered.slice(0, this.plugin.settings.maxResults || 250);

        if (this.viewMode === "cards") {
            const grid = listArea.createDiv();
            grid.style.display = "grid";
            grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(190px, 1fr))";
            grid.style.gap = "12px";
            entries.forEach(entry => this.renderCard(grid, entry));
        } else {
            this.renderTable(listArea, entries);
        }

        if (savedScrollTop) {
            listArea.scrollTop = savedScrollTop;
        }
    }

    renderCard(grid, entry) {
        const meta = this.getMonsterMeta(entry);
        const name = this.getMonsterName(entry);
        const card = grid.createDiv({ cls: "ttrpg-vs-best-card" });
        card.style.border = "1px solid var(--background-modifier-border)";
        card.style.borderRadius = "8px";
        card.style.overflow = "hidden";
        card.style.background = "var(--background-secondary)";

        const art = card.createDiv();
        art.style.height = "120px";
        art.style.display = "flex";
        art.style.alignItems = "center";
        art.style.justifyContent = "center";
        art.style.background = "linear-gradient(135deg, var(--background-modifier-border), var(--background-primary))";
        art.style.position = "relative";

        const tokenFrame = art.createDiv({ cls: "ttrpg-bestiary-token-frame" });

        const imagePath = this.getMonsterImage(entry);
        if (imagePath) {
            const img = tokenFrame.createEl("img");
            img.src = imagePath;
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "cover";
        } else {
            const placeholder = tokenFrame.createDiv({ text: "◉" });
            placeholder.style.fontSize = "40px";
            placeholder.style.color = "var(--text-muted)";
            placeholder.style.opacity = "0.4";
        }

        art.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            new ImageSelectorModal(this.app, this.plugin, entry, () => {
                this.renderMainContent();
            }).open();
        });

        const body = card.createDiv();
        body.style.padding = "10px";
        body.createDiv({ cls: "ttrpg-vs__title", text: name });

        const p = (k, v) => {
            const d = body.createDiv();
            d.createSpan({ text: k, cls: "ttrpg-vs__meta-text" });
            d.createEl("br");
            d.createSpan({ text: String(v || "—") });
        };

        const sourceRow = body.createDiv();
        sourceRow.createSpan({ text: "Source", cls: "ttrpg-vs__meta-text" });
        sourceRow.createEl("br");
        const chip = sourceRow.createEl("button", {
            cls: "ttrpg-vs__chip ttrpg-vs__chip--clickable",
            text: this.plugin.getSourceDisplayLabel(entry.sourceKey, entry.sourceLabel || entry.sourceKey),
            type: "button"
        });
        chip.style.margin = "2px 0";
        this.plugin.applySourceChipStyle(chip, entry.sourceKey);

        chip.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.selectedSources = new Set([entry.sourceKey]);
            this.renderFiltersTab();
            this.renderMainContent();
        });

        chip.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            new SourceChipEditModal(this.app, this.plugin, entry.sourceKey, entry.sourceLabel || entry.sourceKey).open();
        });

        p("Type", this.formatType(meta.bestiaryType || ""));
        p("CR", meta.cr);
        p("Environment", meta.environment);

        const actions = body.createDiv();
        actions.style.display = "flex";
        actions.style.gap = "6px";
        actions.style.marginTop = "8px";

        const add = actions.createEl("button", { text: "Add" });
        add.addEventListener("click", (e) => {
            e.stopPropagation();
            this.addToEncounter(entry);
        });

        const isFav = this.plugin.isBestiaryFavorite(this.getMonsterKey(entry)) || this.plugin.isBestiaryFavorite(entry.path);
        const fav = actions.createEl("button", { text: isFav ? "★" : "☆" });
        fav.addEventListener("click", async (e) => {
            e.stopPropagation();
            await this.plugin.toggleBestiaryFavorite(this.getMonsterKey(entry));
            this.renderMainContent();
        });

        card.addEventListener("click", (e) => {
            if (e.target.closest("button") || e.target.closest("input")) return;
            this.openMonsterReader(entry);
        });

        card.addEventListener("contextmenu", async (e) => {
            if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".ttrpg-bestiary-token-frame") || e.target.closest("img")) {
                return;
            }
            if (this.isPopout) {
                e.preventDefault();
                e.stopPropagation();
                const entries = this.plugin.getReaderEntriesForEntry(entry);
                const initialIndex = Math.max(0, entries.findIndex((candidate) => candidate.path === entry.path));
                const activeLeaf = this.app.workspace.getActiveLeaf();
                try {
                    const leaf = this.app.workspace.getLeaf("tab");
                    await leaf.setViewState({ type: TTRPG_READER_VIEW_TYPE, active: false });
                    if (leaf.view && typeof leaf.view.setReaderState === "function") {
                        leaf.view.setReaderState(entries, initialIndex, this.getStateSnapshot(), "native");
                    }
                    if (activeLeaf) {
                        this.app.workspace.setActiveLeaf(activeLeaf, { focus: true });
                    }
                } catch (err) {
                    console.error("Failed to open bestiary entry in background tab:", err);
                }
            }
        });

        // Ctrl/Cmd-hover: trigger Obsidian native page preview
        const _handleCardHover = (e) => {
            if (e.ctrlKey || e.metaKey) {
                this.plugin.app.workspace.trigger("hover-link", {
                    event: e,
                    source: "search",
                    hoverParent: this.parentComponent,
                    targetEl: card,
                    linktext: entry.path,
                    sourcePath: ""
                });
            }
        };
        card.addEventListener("mouseover", _handleCardHover);
        card.addEventListener("mousemove", _handleCardHover);
    }

    renderTable(container, entries) {
        const table = container.createEl("table", { cls: "ttrpg-bestiary-table" });
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";
        table.style.fontSize = "13px";

        const thead = table.createEl("thead");
        const headerRow = thead.createEl("tr");
        headerRow.style.borderBottom = "2px solid var(--background-modifier-border)";
        headerRow.style.textAlign = "left";

        const sortableHeaders = [
            { label: "Name", sortKey: "name" },
            { label: "CR", sortKey: "cr" },
            { label: "AC", sortKey: "ac" },
            { label: "HP", sortKey: "hp" },
            { label: "Type", sortKey: "type" },
            { label: "Size", sortKey: "size" },
            { label: "Alignment", sortKey: "alignment" },
            { label: "Source", sortKey: "source" },
            { label: "Actions", sortKey: null }
        ];
        sortableHeaders.forEach(h => {
            const th = headerRow.createEl("th");
            th.style.padding = "8px 6px";
            th.style.fontWeight = "bold";
            th.style.color = "var(--text-muted)";
            if (h.sortKey) {
                th.style.cursor = "pointer";
                th.style.userSelect = "none";
                const arrow = this.sortMode === h.sortKey ? (this.sortDirection === "asc" ? " ▲" : " ▼") : "";
                th.textContent = h.label + arrow;
                th.addEventListener("click", () => {
                    if (this.sortMode === h.sortKey) {
                        this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
                    } else {
                        this.sortMode = h.sortKey;
                        this.sortDirection = "asc";
                    }
                    this.renderMainContent();
                });
                th.addEventListener("mouseenter", () => { th.style.color = "var(--text-normal)"; });
                th.addEventListener("mouseleave", () => { th.style.color = "var(--text-muted)"; });
            } else {
                th.textContent = h.label;
            }
        });
        const headers = sortableHeaders.map(h => h.label);

        const tbody = table.createEl("tbody");

        if (!entries.length) {
            const tr = tbody.createEl("tr");
            const td = tr.createEl("td", { text: "No monsters matching filters." });
            td.colSpan = headers.length;
            td.style.padding = "20px";
            td.style.textAlign = "center";
            td.style.color = "var(--text-muted)";
            return;
        }

        entries.forEach(entry => {
            const displayMeta = this.getMonsterDisplayMeta(entry);
            const tr = tbody.createEl("tr");
            tr.style.borderBottom = "1px solid var(--background-modifier-border)";
            tr.style.cursor = "pointer";

            tr.addEventListener("mouseenter", () => {
                tr.style.background = "var(--background-modifier-hover)";
            });
            tr.addEventListener("mouseleave", () => {
                tr.style.background = "transparent";
            });

            const cols = [
                displayMeta.name,
                displayMeta.cr,
                displayMeta.ac,
                String(displayMeta.hp || "—"),
                this.formatType(displayMeta.type),
                displayMeta.size || "—",
                displayMeta.alignment || "—",
                displayMeta.source
            ];

            cols.forEach((val, idx) => {
                const td = tr.createEl("td");
                td.style.padding = "6px 6px";
                td.style.verticalAlign = "middle";
                if (idx === 7) {
                    const chip = td.createEl("button", {
                        cls: "ttrpg-vs__chip ttrpg-vs__chip--clickable",
                        text: val,
                        type: "button"
                    });
                    this.plugin.applySourceChipStyle(chip, entry.sourceKey);
                    chip.addEventListener("click", (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        this.selectedSources = new Set([entry.sourceKey]);
                        this.renderFiltersTab();
                        this.renderMainContent();
                    });
                    chip.addEventListener("contextmenu", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        new SourceChipEditModal(this.app, this.plugin, entry.sourceKey, entry.sourceLabel || entry.sourceKey).open();
                    });
                } else {
                    td.setText(val);
                    if (idx === 0) {
                        td.style.fontWeight = "600";
                        td.style.color = "var(--text-normal)";
                    }
                }
            });

            const tdActions = tr.createEl("td");
            tdActions.style.padding = "4px 6px";
            tdActions.style.verticalAlign = "middle";

            const btnWrap = tdActions.createDiv();
            btnWrap.style.display = "flex";
            btnWrap.style.gap = "4px";

            const add = btnWrap.createEl("button", { text: "＋" });
            add.title = "Add to encounter";
            add.style.padding = "2px 6px";
            add.addEventListener("click", (e) => {
                e.stopPropagation();
                this.addToEncounter(entry);
            });

            const isFav = this.plugin.isBestiaryFavorite(this.getMonsterKey(entry)) || this.plugin.isBestiaryFavorite(entry.path);
            const fav = btnWrap.createEl("button", { text: isFav ? "★" : "☆" });
            fav.title = isFav ? "Remove favorite" : "Favorite";
            fav.style.padding = "2px 6px";
            fav.addEventListener("click", async (e) => {
                e.stopPropagation();
                await this.plugin.toggleBestiaryFavorite(this.getMonsterKey(entry));
                this.renderMainContent();
            });

            tr.addEventListener("click", (e) => {
                if (e.target.closest("button") || e.target.closest("input")) return;
                this.openMonsterReader(entry);
            });

            tr.addEventListener("contextmenu", async (e) => {
                if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".ttrpg-vs__chip")) {
                    return;
                }
                if (this.isPopout) {
                    e.preventDefault();
                    e.stopPropagation();
                    const entries = this.plugin.getReaderEntriesForEntry(entry);
                    const initialIndex = Math.max(0, entries.findIndex((candidate) => candidate.path === entry.path));
                    const activeLeaf = this.app.workspace.getActiveLeaf();
                    try {
                        const leaf = this.app.workspace.getLeaf("tab");
                        await leaf.setViewState({ type: TTRPG_READER_VIEW_TYPE, active: false });
                        if (leaf.view && typeof leaf.view.setReaderState === "function") {
                            leaf.view.setReaderState(entries, initialIndex, this.getStateSnapshot(), "native");
                        }
                        if (activeLeaf) {
                            this.app.workspace.setActiveLeaf(activeLeaf, { focus: true });
                        }
                    } catch (err) {
                        console.error("Failed to open bestiary entry in background tab:", err);
                    }
                }
            });

            // Ctrl/Cmd-hover: trigger Obsidian native page preview
            const _handleRowHover = (e) => {
                if (e.ctrlKey || e.metaKey) {
                    this.plugin.app.workspace.trigger("hover-link", {
                        event: e,
                        source: "search",
                        hoverParent: this.parentComponent,
                        targetEl: tr,
                        linktext: entry.path,
                        sourcePath: ""
                    });
                }
            };
            tr.addEventListener("mouseover", _handleRowHover);
            tr.addEventListener("mousemove", _handleRowHover);
        });
    }

    addToEncounter(entry) {
        const key = this.getMonsterKey(entry);
        const found = this.encounter.find(x => x.key === key);
        if (found) {
            found.qty++;
        } else {
            this.encounter.push({
                key,
                name: this.getMonsterName(entry),
                qty: 1,
                cr: this.getMonsterMeta(entry).cr,
                xp: this.getMonsterMeta(entry).xp || 0
            });
        }
        const savedScrollTop = this.encounterColumnEl ? this.encounterColumnEl.scrollTop : 0;
        this.updateEncounterMonstersDOM();
        this.updateXPSummary();
        void this.saveStateToSettings();
        if (this.encounterColumnEl) {
            this.encounterColumnEl.scrollTop = savedScrollTop;
        }
    }

    setupEncounterDOM() {
        const el = this.encounterColumnEl;
        el.empty();

        el.createDiv({ cls: "ttrpg-vs__title", text: "Encounter Builder" });

        el.createDiv({ cls: "ttrpg-vs__label", text: "Encounter name" });
        this.encounterNameInput = el.createEl("input");
        this.encounterNameInput.value = this.encounterName;
        this.encounterNameInput.style.width = "100%";
        this.encounterNameInput.style.boxSizing = "border-box";
        this.encounterNameInput.addEventListener("input", () => {
            this.encounterName = this.encounterNameInput.value;
            void this.saveStateToSettings();
        });

        const mathBox = el.createDiv();
        mathBox.style.marginTop = "10px";
        mathBox.createDiv({ cls: "ttrpg-vs__label", text: "XP math" });

        this.xpMathSelect = mathBox.createEl("select");
        stopSelectPropagation(this.xpMathSelect);
        this.xpMathSelect.style.width = "100%";
        this.xpMathSelect.style.boxSizing = "border-box";

        [["kpfc", "KPFC / DMG adjusted XP"],
        ["initiative", "Initiative Tracker / raw XP"],
        ["raw-threshold", "Raw XP vs thresholds"],
        ["flee-mortals", "Flee, Mortals! encounter points"]].forEach(([value, label]) => {
            const option = this.xpMathSelect.createEl("option", { text: label });
            option.value = value;
            option.selected = this.xpMathMode === value;
        });
        this.xpMathSelect.addEventListener("change", () => {
            this.xpMathMode = this.xpMathSelect.value;
            this.updateEncounterMathSettingsDOM();
            this.updateXPSummary();
            void this.saveStateToSettings();
        });

        this.xpMathSettingsContainer = mathBox.createDiv();
        this.updateEncounterMathSettingsDOM();

        const partyBox = el.createDiv();
        partyBox.style.marginTop = "12px";
        partyBox.createDiv({ cls: "ttrpg-vs__label", text: "Party Source" });

        const tracker = this.getTrackerPlugin();
        const trackerParties = tracker?.data?.parties || [];

        this.partySelect = partyBox.createEl("select");
        stopSelectPropagation(this.partySelect);
        this.partySelect.style.width = "100%";
        this.partySelect.style.boxSizing = "border-box";
        this.partySelect.style.marginBottom = "8px";

        const customOpt = this.partySelect.createEl("option", { text: "Custom Levels" });
        customOpt.value = "custom";
        customOpt.selected = this.selectedPartyName === "custom";

        trackerParties.forEach(p => {
            const opt = this.partySelect.createEl("option", { text: `Tracker: ${p.name}` });
            opt.value = p.name;
            opt.selected = this.selectedPartyName === p.name;
        });

        this.partySelect.addEventListener("change", () => {
            this.selectedPartyName = this.partySelect.value;
            this.refreshPartyFromTracker();
            this.updatePartyRowsDOM();
            this.updateXPSummary();
            void this.saveStateToSettings();
        });

        this.partyRowsContainer = partyBox.createDiv();
        this.updatePartyRowsDOM();

        const randomBox = el.createDiv();
        randomBox.style.marginTop = "14px";
        randomBox.style.borderTop = "1px solid var(--background-modifier-border)";
        randomBox.style.paddingTop = "10px";
        randomBox.createDiv({ cls: "ttrpg-vs__label", text: "Random Generator" });

        this.randSelect = randomBox.createEl("select");
        stopSelectPropagation(this.randSelect);
        this.randSelect.style.width = "100%";
        this.randSelect.style.boxSizing = "border-box";
        this.randSelect.style.marginBottom = "6px";
        [["easy", "Easy Encounter"], ["medium", "Medium Encounter"], ["hard", "Hard Encounter"], ["deadly", "Deadly Encounter"]].forEach(([val, label]) => {
            const o = this.randSelect.createEl("option", { text: label });
            o.value = val;
        });

        this.randBtn = randomBox.createEl("button");
        this.randBtn.style.width = "100%";
        this.randBtn.style.boxSizing = "border-box";
        this.randBtn.addEventListener("click", () => {
            this.randomizeEncounter(this.randSelect.value);
        });

        const listContainer = el.createDiv();
        listContainer.style.marginTop = "12px";
        listContainer.createDiv({ cls: "ttrpg-vs__label", text: "Monsters" });
        this.encounterMonstersEl = listContainer.createDiv();

        this.xpSummaryEl = el.createDiv();
        this.xpSummaryEl.style.marginTop = "12px";
        this.xpSummaryEl.style.borderTop = "1px solid var(--background-modifier-border)";
        this.xpSummaryEl.style.paddingTop = "8px";

        this.actionButtonsEl = el.createDiv();
        this.actionButtonsEl.style.display = "flex";
        this.actionButtonsEl.style.flexWrap = "wrap";
        this.actionButtonsEl.style.gap = "6px";
        this.actionButtonsEl.style.marginTop = "10px";

        this.setupActionButtonsDOM();
    }

    updateEncounterMathSettingsDOM() {
        const container = this.xpMathSettingsContainer;
        container.empty();

        if (this.xpMathMode === "kpfc") {
            const adjustRow = container.createDiv();
            adjustRow.style.marginTop = "6px";
            const adjust = adjustRow.createEl("input");
            adjust.type = "checkbox";
            adjust.checked = this.includePartySizeAdjustment !== false;
            adjust.addEventListener("change", () => {
                this.includePartySizeAdjustment = adjust.checked;
                this.updateXPSummary();
                void this.saveStateToSettings();
            });
            adjustRow.appendText(" Apply small/large party multiplier adjustment");
        } else if (this.xpMathMode === "flee-mortals") {
            const fm = container.createDiv();
            fm.style.display = "grid";
            fm.style.gridTemplateColumns = "1fr 1fr";
            fm.style.gap = "6px";
            fm.style.marginTop = "6px";

            const diff = fm.createEl("select");
            stopSelectPropagation(diff);
            diff.style.width = "100%";
            diff.style.boxSizing = "border-box";
            [["trivial", "Trivial (0 EP)"], ["easy", "Easy (1 EP)"], ["standard", "Standard (2 EP)"], ["hard", "Hard (4 EP)"], ["extreme", "Extreme (8 EP)"]].forEach(([v, l]) => {
                const o = diff.createEl("option", { text: l });
                o.value = v;
                o.selected = this.fleeMortalsDifficulty === v;
            });
            diff.addEventListener("change", () => {
                this.fleeMortalsDifficulty = diff.value;
                this.updateXPSummary();
                void this.saveStateToSettings();
            });

            const spent = fm.createEl("input");
            spent.type = "number";
            spent.min = "0";
            spent.value = String(this.fleeMortalsSpent || 0);
            spent.style.width = "100%";
            spent.style.boxSizing = "border-box";
            spent.title = "Encounter points already spent today";
            spent.addEventListener("input", () => {
                this.fleeMortalsSpent = Math.max(0, Number(spent.value) || 0);
                this.updateXPSummary();
                void this.saveStateToSettings();
            });

            const budget = fm.createEl("input");
            budget.type = "number";
            budget.min = "1";
            budget.value = String(this.fleeMortalsDayBudget || 8);
            budget.style.width = "100%";
            budget.style.boxSizing = "border-box";
            budget.title = "Daily encounter point budget";
            budget.addEventListener("input", () => {
                this.fleeMortalsDayBudget = Math.max(1, Number(budget.value) || 8);
                this.updateXPSummary();
                void this.saveStateToSettings();
            });

            fm.createDiv({ cls: "ttrpg-vs__meta-text", text: "spent today" }).style.fontSize = "11px";
            fm.createDiv({ cls: "ttrpg-vs__meta-text", text: "daily budget" }).style.fontSize = "11px";
        }
    }

    updatePartyRowsDOM() {
        const container = this.partyRowsContainer;
        container.empty();

        if (this.selectedPartyName === "custom") {
            const rows = this.getPartySummary().rows;
            rows.forEach((row, index) => {
                const line = container.createDiv();
                line.style.display = "grid";
                line.style.gridTemplateColumns = "1fr 1fr 28px";
                line.style.gap = "6px";
                line.style.marginTop = "4px";

                const level = line.createEl("input");
                level.type = "number";
                level.min = "1";
                level.max = "20";
                level.value = String(row.level || 1);
                level.style.width = "100%";
                level.style.boxSizing = "border-box";
                level.title = "Level";
                level.addEventListener("change", () => {
                    row.level = Math.max(1, Math.min(20, Number(level.value) || 1));
                    this.updateXPSummary();
                    void this.saveStateToSettings();
                });

                const count = line.createEl("input");
                count.type = "number";
                count.min = "0";
                count.value = String(row.count || 0);
                count.style.width = "100%";
                count.style.boxSizing = "border-box";
                count.title = "Count";
                count.addEventListener("change", () => {
                    row.count = Math.max(0, Math.floor(Number(count.value) || 0));
                    this.updateXPSummary();
                    void this.saveStateToSettings();
                });

                const remove = line.createEl("button", { text: "×" });
                remove.disabled = rows.length <= 1;
                remove.addEventListener("click", () => {
                    this.partyRows.splice(index, 1);
                    this.updatePartyRowsDOM();
                    this.updateXPSummary();
                    void this.saveStateToSettings();
                });
            });
            const addParty = container.createEl("button", { text: "+ Add level band" });
            addParty.style.marginTop = "6px";
            addParty.style.width = "100%";
            addParty.style.boxSizing = "border-box";
            addParty.addEventListener("click", () => {
                this.partyRows.push({ level: 5, count: 1 });
                this.updatePartyRowsDOM();
                this.updateXPSummary();
                void this.saveStateToSettings();
            });
        } else {
            const tracker = this.getTrackerPlugin();
            const trackerParties = tracker?.data?.parties || [];
            const party = trackerParties.find(p => p.name === this.selectedPartyName);
            if (party && party.players) {
                const listWrap = container.createDiv({ cls: "ttrpg-vs-synced-players" });
                listWrap.style.padding = "6px 8px";
                listWrap.style.background = "var(--background-secondary)";
                listWrap.style.borderRadius = "6px";
                listWrap.style.border = "1px solid var(--background-modifier-border)";
                listWrap.style.fontSize = "12px";

                party.players.forEach(pName => {
                    const p = tracker.getPlayerByName(pName);
                    const lvl = p?.level || 5;
                    const pDiv = listWrap.createDiv();
                    pDiv.style.display = "flex";
                    pDiv.style.justifyContent = "space-between";
                    pDiv.createSpan({ text: pName, cls: "ttrpg-vs-player-name" }).style.fontWeight = "bold";
                    pDiv.createSpan({ text: `Lvl ${lvl}`, cls: "ttrpg-vs-player-lvl" }).style.color = "var(--text-muted)";
                });

                const syncBtn = container.createEl("button", { text: "↻ Sync Levels" });
                syncBtn.style.marginTop = "6px";
                syncBtn.style.width = "100%";
                syncBtn.style.boxSizing = "border-box";
                syncBtn.addEventListener("click", () => {
                    this.refreshPartyFromTracker();
                    this.updatePartyRowsDOM();
                    this.updateXPSummary();
                    void this.saveStateToSettings();
                });
            }
        }
    }

    updateEncounterMonstersDOM() {
        const list = this.encounterMonstersEl;
        list.empty();

        if (!this.encounter.length) {
            list.createDiv({ cls: "ttrpg-vs__meta-text", text: "Add monsters from the cards to build an encounter." });
            return;
        }

        this.encounter.forEach((m, i) => {
            const row = list.createDiv();
            row.style.display = "grid";
            row.style.gridTemplateColumns = "44px 1fr 28px";
            row.style.gap = "6px";
            row.style.alignItems = "center";
            row.style.marginTop = "4px";

            const qty = row.createEl("input");
            qty.type = "number";
            qty.min = "1";
            qty.value = String(m.qty);
            qty.style.width = "100%";
            qty.style.boxSizing = "border-box";
            qty.addEventListener("change", () => {
                const savedScrollTop = this.encounterColumnEl ? this.encounterColumnEl.scrollTop : 0;
                m.qty = Math.max(1, Number(qty.value) || 1);
                this.updateXPSummary();
                void this.saveStateToSettings();
                if (this.encounterColumnEl) {
                    this.encounterColumnEl.scrollTop = savedScrollTop;
                }
            });

            const nameDiv = row.createDiv({ text: m.name + (m.cr ? " (CR " + m.cr + ")" : "") });
            nameDiv.style.fontSize = "13px";
            nameDiv.style.wordBreak = "break-word";
            nameDiv.style.cursor = "pointer";
            nameDiv.style.textDecoration = "underline dotted";
            nameDiv.style.textDecorationColor = "var(--text-muted)";
            nameDiv.title = "Open in reader (click) / Ctrl+hover to preview";
            nameDiv.addEventListener("click", () => {
                const entry = this.plugin.getEntries().find(e => this.getMonsterKey(e) === m.key || e.path === m.key);
                if (entry) this.openMonsterReader(entry);
            });
            // Ctrl/Cmd-hover: trigger Obsidian native page preview
            const _handleEncHover = (e) => {
                if (e.ctrlKey || e.metaKey) {
                    const entry = this.plugin.getEntries().find(en => this.getMonsterKey(en) === m.key || en.path === m.key);
                    if (entry) {
                        this.plugin.app.workspace.trigger("hover-link", {
                            event: e,
                            source: "search",
                            hoverParent: this.parentComponent,
                            targetEl: nameDiv,
                            linktext: entry.path,
                            sourcePath: ""
                        });
                    }
                }
            };
            nameDiv.addEventListener("mouseover", _handleEncHover);
            nameDiv.addEventListener("mousemove", _handleEncHover);

            const del = row.createEl("button", { text: "×" });
            del.addEventListener("click", () => {
                const savedScrollTop = this.encounterColumnEl ? this.encounterColumnEl.scrollTop : 0;
                this.encounter.splice(i, 1);
                this.updateEncounterMonstersDOM();
                this.updateXPSummary();
                void this.saveStateToSettings();
                if (this.encounterColumnEl) {
                    this.encounterColumnEl.scrollTop = savedScrollTop;
                }
            });
        });
    }

    updateXPSummary() {
        const el = this.xpSummaryEl;
        el.empty();

        const math = this.calculateEncounterMath();

        el.createDiv({ cls: "ttrpg-vs__label", text: "Difficulty: " + math.difficulty });
        el.createDiv({ text: "Players: " + math.party.players + " • Monsters: " + math.monsterCount + " • CR total: " + (Math.round((math.crTotal || 0) * 100) / 100) });
        el.createDiv({ text: "Raw monster XP: " + this.formatXP(math.rawXP) });

        if (math.mode === "flee-mortals") {
            el.createDiv({ text: "FM encounter points: " + math.fmPoints + " • Day remaining after this: " + math.fmRemaining + " / " + math.fmBudget });
            const tipDetails = el.createEl("details");
            tipDetails.style.marginTop = "4px";
            const tipSummary = tipDetails.createEl("summary", { cls: "ttrpg-vs__meta-text" });
            tipSummary.textContent = "MCDM Tip";
            tipSummary.style.cursor = "pointer";
            tipSummary.style.fontWeight = "bold";
            tipDetails.createDiv({
                cls: "ttrpg-vs__meta-text",
                text: "Use CR total against the Flee, Mortals! encounter CR-per-character table for your party level and chosen difficulty."
            });
        } else {
            el.createDiv({ text: "Adjusted XP: " + this.formatXP(math.adjustedXP) + " ×" + math.multiplier });
            el.createDiv({ text: "Per-player XP: " + (math.party.players ? this.formatXP(math.rawXP / math.party.players) : "0") });

            const thresholdsDetails = el.createEl("details");
            thresholdsDetails.style.marginTop = "4px";
            const thresholdsSummary = thresholdsDetails.createEl("summary", { cls: "ttrpg-vs__meta-text" });
            thresholdsSummary.textContent = "View XP Thresholds";
            thresholdsSummary.style.cursor = "pointer";
            thresholdsSummary.style.fontWeight = "bold";
            thresholdsDetails.createDiv({
                cls: "ttrpg-vs__meta-text",
                text: "Easy: " + this.formatXP(math.party.thresholds.easy) + " • Medium: " + this.formatXP(math.party.thresholds.medium) + " • Hard: " + this.formatXP(math.party.thresholds.hard) + " • Deadly: " + this.formatXP(math.party.thresholds.deadly)
            });
        }

        const calcDetails = el.createEl("details");
        calcDetails.style.marginTop = "4px";
        const calcSummary = calcDetails.createEl("summary", { cls: "ttrpg-vs__meta-text" });
        calcSummary.textContent = "XP Calc: " + math.label;
        calcSummary.style.cursor = "pointer";
        calcSummary.style.fontWeight = "bold";
        calcDetails.createDiv({
            cls: "ttrpg-vs__meta-text",
            text: math.detail
        });
    }

    setupActionButtonsDOM() {
        const el = this.actionButtonsEl;
        el.empty();

        const tracker = this.getTrackerPlugin();
        if (tracker) {
            const startBtn = el.createEl("button", { text: "⚔️ Start Combat", cls: "mod-cta" });
            startBtn.addEventListener("click", () => this.startCombat());
        }

        const copy = el.createEl("button", { text: "Copy encounter block" });
        copy.addEventListener("click", () => this.copyEncounterBlock());

        const insert = el.createEl("button", { text: "Insert into active note" });
        insert.addEventListener("click", () => this.insertEncounterBlock());

        const clear = el.createEl("button", { text: "Clear encounter" });
        clear.addEventListener("click", () => {
            this.encounter = [];
            this.updateEncounterMonstersDOM();
            this.updateXPSummary();
            void this.saveStateToSettings();
        });
    }

    updateEncounterPanel() {
        const savedScrollTop = this.encounterColumnEl ? this.encounterColumnEl.scrollTop : 0;
        this.encounterNameInput.value = this.encounterName;
        this.xpMathSelect.value = this.xpMathMode;
        this.updateEncounterMathSettingsDOM();
        this.updatePartyRowsDOM();
        this.updateEncounterMonstersDOM();
        this.updateXPSummary();
        this.setupActionButtonsDOM();
        if (this.encounterColumnEl) {
            this.encounterColumnEl.scrollTop = savedScrollTop;
        }
    }

    getXPThresholdsForLevel(level) {
        const table = {
            1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500],
            5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100],
            9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
            13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200],
            17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700],
        };
        return table[Math.max(1, Math.min(20, Number(level) || 1))] || table[1];
    }

    getPartySummary() {
        const rows = Array.isArray(this.partyRows) && this.partyRows.length ? this.partyRows : [{ level: 5, count: 4 }];
        const thresholds = { easy: 0, medium: 0, hard: 0, deadly: 0 };
        let players = 0, weightedLevel = 0;
        for (const row of rows) {
            const level = Math.max(1, Math.min(20, Number(row.level) || 1));
            const count = Math.max(0, Math.floor(Number(row.count) || 0));
            const t = this.getXPThresholdsForLevel(level);
            players += count; weightedLevel += level * count;
            thresholds.easy += t[0] * count; thresholds.medium += t[1] * count; thresholds.hard += t[2] * count; thresholds.deadly += t[3] * count;
        }
        return { rows, players, averageLevel: players ? weightedLevel / players : 0, thresholds };
    }

    getEncounterMonsterCount() { return this.encounter.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.qty) || 0)), 0); }

    getEncounterRawXP() {
        return this.encounter.reduce((sum, item) => {
            let xp = Number(item.xp || 0);
            if (!xp && item.cr && typeof BESTIARY_XP_BY_CR !== "undefined") xp = BESTIARY_XP_BY_CR[String(item.cr)] || 0;
            return sum + (xp * Math.max(0, Math.floor(Number(item.qty) || 0)));
        }, 0);
    }

    crToNumber(cr) {
        const text = String(cr || "").trim();
        if (!text) return 0;
        if (text.includes("/")) { const [a, b] = text.split("/").map(Number); return b ? a / b : 0; }
        const n = Number(text.replace(/^cr\s*/i, ""));
        return Number.isFinite(n) ? n : 0;
    }

    getEncounterCRTotal() { return this.encounter.reduce((sum, item) => sum + this.crToNumber(item.cr) * Math.max(0, Math.floor(Number(item.qty) || 0)), 0); }

    getBaseEncounterMultiplier(monsterCount) { const c = Math.max(0, Number(monsterCount) || 0); if (c <= 1) return 1; if (c === 2) return 1.5; if (c <= 6) return 2; if (c <= 10) return 2.5; if (c <= 14) return 3; return 4; }

    getAdjustedEncounterMultiplier(baseMultiplier, partySize) {
        if (!this.includePartySizeAdjustment) return baseMultiplier;
        const multipliers = [1, 1.5, 2, 2.5, 3, 4];
        let idx = multipliers.indexOf(baseMultiplier); if (idx < 0) idx = multipliers.findIndex((m) => m >= baseMultiplier); if (idx < 0) idx = multipliers.length - 1;
        if (partySize > 0 && partySize < 3) idx = Math.min(multipliers.length - 1, idx + 1); else if (partySize >= 6) idx = Math.max(0, idx - 1);
        return multipliers[idx];
    }

    getFleeMortalsEncounterPoints() {
        const map = { trivial: 0, easy: 1, standard: 2, hard: 4, extreme: 8 };
        return map[this.fleeMortalsDifficulty || "standard"] ?? 2;
    }

    calculateEncounterMath() {
        const party = this.getPartySummary();
        const rawXP = this.getEncounterRawXP();
        const monsterCount = this.getEncounterMonsterCount();
        const crTotal = this.getEncounterCRTotal();
        const baseMultiplier = this.getBaseEncounterMultiplier(monsterCount);
        const mode = this.xpMathMode || "kpfc";
        let multiplier = 1, adjustedXP = rawXP, compareXP = rawXP, difficulty = "Trivial";
        let label = "Initiative Tracker / raw XP";
        let detail = "Uses raw creature XP totals only, matching the lightweight encounter-block workflow.";
        if (mode === "kpfc") {
            multiplier = this.getAdjustedEncounterMultiplier(baseMultiplier, party.players); adjustedXP = Math.round(rawXP * multiplier); compareXP = adjustedXP;
            label = "KPFC / DMG adjusted XP"; detail = "Uses monster-count multiplier and optional party-size adjustment.";
        } else if (mode === "raw-threshold") {
            label = "Raw XP vs thresholds"; detail = "Compares raw monster XP to party thresholds without a multiplier.";
        } else if (mode === "flee-mortals") {
            const ep = this.getFleeMortalsEncounterPoints();
            const spent = Math.max(0, Number(this.fleeMortalsSpent || 0));
            const budget = Math.max(1, Number(this.fleeMortalsDayBudget || 8));
            label = "Flee, Mortals! encounter points";
            detail = "Tracks MCDM-style encounter points for the adventuring day. Use the selected FM difficulty as the counter, while CR total helps eyeball the encounter budget from your book/table.";
            difficulty = formatTitle(this.fleeMortalsDifficulty || "standard");
            return { mode, label, detail, rawXP, adjustedXP: rawXP, multiplier: 1, baseMultiplier, monsterCount, party, compareXP: rawXP, difficulty, crTotal, fmPoints: ep, fmSpent: spent, fmBudget: budget, fmRemaining: Math.max(0, budget - spent - ep) };
        }
        if (party.players <= 0 || rawXP <= 0) difficulty = "None";
        else if (compareXP >= party.thresholds.deadly) difficulty = "Deadly";
        else if (compareXP >= party.thresholds.hard) difficulty = "Hard";
        else if (compareXP >= party.thresholds.medium) difficulty = "Medium";
        else if (compareXP >= party.thresholds.easy) difficulty = "Easy";
        return { mode, label, detail, rawXP, adjustedXP, multiplier, baseMultiplier, monsterCount, party, compareXP, difficulty, crTotal, fmPoints: 0, fmSpent: 0, fmBudget: 0, fmRemaining: 0 };
    }

    formatXP(value) { return Math.round(Number(value) || 0).toLocaleString(); }

    buildEncounterBlock() { const lines = [String.fromCharCode(96, 96, 96) + "encounter", "name: " + (this.encounterName || "Encounter"), "party: none", "creatures:"]; this.encounter.forEach(m => lines.push("  - " + m.qty + ": " + m.name)); lines.push(String.fromCharCode(96, 96, 96)); return lines.join("\n"); }
    async copyEncounterBlock() { await navigator.clipboard.writeText(this.buildEncounterBlock()); new Notice("Encounter block copied."); }
    insertEncounterBlock() { const leaf = this.app.workspace.getMostRecentLeaf && this.app.workspace.getMostRecentLeaf(); const editor = leaf && leaf.view && leaf.view.editor; if (editor) { editor.replaceSelection("\n" + this.buildEncounterBlock() + "\n"); new Notice("Encounter block inserted."); } else { new Notice("No active editor found. Use Copy encounter block instead."); } }

    handleBookmarksChanged() {
        this.renderMainContent();
    }

    async openMonsterReader(entry) {
        if (this._openingEntry) return;
        this._openingEntry = true;
        const timeoutId = setTimeout(() => { this._openingEntry = false; }, 1000);
        try {
            await new Promise(resolve => setTimeout(resolve, 50));
            const entries = this.plugin.getReaderEntriesForEntry(entry);
            const initialIndex = Math.max(0, entries.findIndex((candidate) => candidate.path === entry.path));

            if (this.isPopout) {
                // When bestiary is popped out, open reader in a new tab in main window
                if (this.plugin.settings.openReaderInPopoutByDefault) {
                    await this.plugin.openReaderPopout(entries, initialIndex);
                } else {
                    try {
                        await this.plugin.openReaderNativeTab(entries, initialIndex);
                    } catch (err) {
                        new TTRPGReaderModal(this.app, this.plugin, entries, initialIndex).open();
                    }
                }
            } else {
                // When bestiary is in a modal, open in a new window (or reuse existing)
                try {
                    // Try to find an existing TTRPG reader view in a popout window and reuse it
                    let existingLeaf = null;
                    if (this._monsterReaderLeaf) {
                        // Check if the previously used leaf is still alive
                        try {
                            const view = this._monsterReaderLeaf.view;
                            if (view && view.getViewType && view.getViewType() === TTRPG_READER_VIEW_TYPE) {
                                existingLeaf = this._monsterReaderLeaf;
                            }
                        } catch (_) {
                            this._monsterReaderLeaf = null;
                        }
                    }
                    if (!existingLeaf) {
                        // Search for any existing reader view in a window leaf
                        this.app.workspace.iterateAllLeaves((leaf) => {
                            if (existingLeaf) return;
                            if (leaf.view && leaf.view.getViewType && leaf.view.getViewType() === TTRPG_READER_VIEW_TYPE) {
                                existingLeaf = leaf;
                            }
                        });
                    }
                    if (existingLeaf) {
                        // Reuse existing window/leaf
                        const view = existingLeaf.view;
                        if (view && typeof view.setReaderState === "function") {
                            view.setReaderState(entries, initialIndex, null, "window");
                        }
                        this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
                        this._monsterReaderLeaf = existingLeaf;
                    } else {
                        // Open a new window
                        const leaf = this.app.workspace.getLeaf("window");
                        await leaf.setViewState({ type: TTRPG_READER_VIEW_TYPE, active: true });
                        const view = leaf.view;
                        if (view && typeof view.setReaderState === "function") {
                            view.setReaderState(entries, initialIndex, null, "window");
                        }
                        this._monsterReaderLeaf = leaf;
                    }
                } catch (err) {
                    console.error("TTRPG Bestiary reader popout error:", err);
                    new TTRPGReaderModal(this.app, this.plugin, entries, initialIndex).open();
                }
            }
        } finally {
            clearTimeout(timeoutId);
            this._openingEntry = false;
        }
    }
}

class TTRPGBestiaryModal extends Modal {
    constructor(app, plugin, initialState = null) {
        super(app);
        this.plugin = plugin;
        this.initialState = initialState;
        this.controller = null;
        this.hoverPopover = null;
    }

    onOpen() {
        this.plugin.registerModal(this);
        this.modalEl.classList.add("ttrpg-vs-bestiary-modal");
        this.modalEl.style.width = "min(1680px, 98vw)";
        this.modalEl.style.height = "min(94vh, 1040px)";
        this.contentEl.style.height = "100%";
        this.contentEl.style.overflow = "hidden";
        this.contentEl.style.padding = "0";

        this.controller = new TTRPGBestiaryController(this.app, this.plugin, {
            containerEl: this.contentEl,
            isPopout: false,
            parentComponent: this,
            onClose: () => this.close(),
            initialState: this.initialState
        });
        this.controller.build();
    }

    onClose() {
        if (this.plugin.settings.saveLastBestiarySearch && this.controller) {
            const snap = this.controller.getStateSnapshot();
            this.plugin._cachedBestiarySearchState = snap;
            this.plugin.settings.lastBestiarySearchState = snap;
            void this.plugin.saveSettings(false);
        }
        this.plugin.unregisterModal(this);
        this.controller = null;
    }

    handleBookmarksChanged() {
        if (this.controller) {
            this.controller.handleBookmarksChanged();
        }
    }

    refreshFromPlugin() {
        if (this.controller) {
            this.controller.handleBookmarksChanged();
        }
    }
}

class TTRPGSpellbookController {
    constructor(app, plugin, options) {
        this.app = app;
        this.plugin = plugin;
        this.containerEl = options.containerEl;
        this.isPopout = options.isPopout || false;
        this.onClose = options.onClose;
        this.parentComponent = options.parentComponent || plugin;
        this.initialState = options.initialState || null;

        this.query = "";
        this.selectedLevels = new Set();
        this.selectedSchools = new Set();
        this.selectedClasses = new Set();
        this.selectedSources = new Set();
        this.sortMode = "level";
        this.showFavoritesOnly = false;
        this.ritualOnly = false;
        this.concOnly = false;
        this.selectedIndex = 0;
        this.visibleEntries = [];
        this.renderedItems = new Map();
        this.virtualRenderQueued = false;
        this.sortReverse = false;
        this._openingEntry = false;

        this.refreshResultsDebounced = debounce(() => this.refreshResults(true), 25, false);
    }

    build() {
        this.containerEl.empty();
        this.containerEl.classList.add("ttrpg-vs");

        const toolbarEl = this.containerEl.createDiv({ cls: "ttrpg-vs__toolbar" });

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
            if (event.key === "ArrowUp") { event.preventDefault(); this.setSelectedIndex(this.selectedIndex - 1, true); return; }
            if (event.key === "Enter") {
                event.preventDefault();
                const sel = this.visibleEntries[this.selectedIndex];
                if (sel) void this.openEntry(sel);
            }
        });

        // ── Filters row (6-column grid) ───────────────────────────────────────
        const filtersEl = toolbarEl.createDiv({ cls: "ttrpg-vs__filters ttrpg-sb__filters" });

        // Level
        const levelWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        levelWrap.createDiv({ cls: "ttrpg-vs__label", text: "Level" });
        this.levelButtonEl = levelWrap.createEl("button", { cls: "ttrpg-vs__button" });
        this.levelButtonEl.type = "button";
        this.levelButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new SourcePickerModal(this.app, this.plugin, () => this.plugin.getSpellLevelOptions(), new Set(this.selectedLevels), (keys) => {
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
            new SourcePickerModal(this.app, this.plugin, () => this.plugin.getSpellSchoolOptions(), new Set(this.selectedSchools), (keys) => {
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
            new SourcePickerModal(this.app, this.plugin, () => this.plugin.getSpellClassOptions(), new Set(this.selectedClasses), (keys) => {
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
            new SourcePickerModal(this.app, this.plugin, () => this._getSpellSourceOptions(), new Set(this.selectedSources), (keys) => {
                this.selectedSources = keys; this.updateSourceButton(); this.selectedIndex = 0; this.refreshResults(true);
            }, "Filter by Source").open();
        });

        // Sort
        const sortWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        sortWrap.createDiv({ cls: "ttrpg-vs__label", text: "Sort" });

        const sortRow = sortWrap.createDiv({ cls: "ttrpg-vs__sort-row" });
        sortRow.style.display = "flex";
        sortRow.style.gap = "4px";
        sortRow.style.width = "100%";

        this.sortSelectEl = sortRow.createEl("select", { cls: "ttrpg-vs__select" });
        this.sortSelectEl.style.flex = "1";
        [["level", "Level"], ["name", "Name"], ["school", "School"], ["source", "Source"]].forEach(([val, lbl]) => {
            const opt = document.createElement("option"); opt.value = val; opt.textContent = lbl; this.sortSelectEl.appendChild(opt);
        });
        this.sortSelectEl.value = this.sortMode;
        this.sortSelectEl.addEventListener("change", () => { this.sortMode = this.sortSelectEl.value; this.refreshResults(false); });

        this.sortReverseBtn = sortRow.createEl("button", {
            cls: "ttrpg-vs__toolbutton",
            text: "⇅",
        });
        this.sortReverseBtn.type = "button";
        this.sortReverseBtn.style.padding = "4px 8px";
        this.sortReverseBtn.style.width = "auto";
        this.sortReverseBtn.style.flexShrink = "0";
        this.sortReverseBtn.title = "Reverse Sort Order";
        this.sortReverseBtn.classList.toggle("is-active", this.sortReverse);
        this.sortReverseBtn.addEventListener("click", () => {
            this.sortReverse = !this.sortReverse;
            this.sortReverseBtn.classList.toggle("is-active", this.sortReverse);
            this.refreshResults(false);
        });

        // Unified button row column
        const buttonRowEl = filtersEl.createDiv({ cls: "ttrpg-vs__button-row" });

        // ★ Favorites toggle
        this.favBtnEl = buttonRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "★ Favorites" });
        this.favBtnEl.type = "button";
        this.favBtnEl.title = "Show only spellbook-bookmarked spells";
        this.favBtnEl.addEventListener("click", () => {
            this.showFavoritesOnly = !this.showFavoritesOnly;
            this.favBtnEl.classList.toggle("is-active", this.showFavoritesOnly);
            this.selectedIndex = 0; this.refreshResults(true);
        });

        // Ritual toggle
        this.ritualBtnEl = buttonRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Ritual" });
        this.ritualBtnEl.type = "button";
        this.ritualBtnEl.title = "Show only ritual spells";
        this.ritualBtnEl.addEventListener("click", () => {
            this.ritualOnly = !this.ritualOnly;
            this.ritualBtnEl.classList.toggle("is-active", this.ritualOnly);
            this.selectedIndex = 0; this.refreshResults(true);
        });

        // Concentration toggle
        this.concBtnEl = buttonRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Concentration" });
        this.concBtnEl.type = "button";
        this.concBtnEl.title = "Show only concentration spells";
        this.concBtnEl.addEventListener("click", () => {
            this.concOnly = !this.concOnly;
            this.concBtnEl.classList.toggle("is-active", this.concOnly);
            this.selectedIndex = 0; this.refreshResults(true);
        });

        // Clear all
        this.clearButtonEl = buttonRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Clear" });
        this.clearButtonEl.type = "button";
        this.clearButtonEl.title = "Clear all filters";
        this.clearButtonEl.addEventListener("click", () => {
            this.selectedLevels = new Set(); this.selectedSchools = new Set();
            this.selectedClasses = new Set(); this.selectedSources = new Set();
            this.showFavoritesOnly = false; this.ritualOnly = false; this.concOnly = false;
            this.query = ""; if (this.inputEl) this.inputEl.value = "";
            this.favBtnEl.classList.remove("is-active");
            this.ritualBtnEl.classList.remove("is-active");
            this.concBtnEl.classList.remove("is-active");
            this.updateLevelButton(); this.updateSchoolButton(); this.updateClassButton(); this.updateSourceButton();
            this.selectedIndex = 0; this.refreshResults(true);
        });

        const doc = this.containerEl.ownerDocument;
        const spellPresetSelect = buttonRowEl.createEl("select", { cls: "ttrpg-vs__select" });
        spellPresetSelect.style.width = "auto";
        spellPresetSelect.appendChild(Object.assign(doc.createElement("option"), { value: "", textContent: "Preset…" }));
        for (const preset of this.plugin.getFilterPresets()) {
            const opt = doc.createElement("option");
            opt.value = preset.id;
            opt.textContent = preset.name;
            spellPresetSelect.appendChild(opt);
        }
        spellPresetSelect.addEventListener("change", () => {
            const preset = this.plugin.getFilterPresets().find((p) => p.id === spellPresetSelect.value);
            if (!preset) return;
            const validSources = new Set(this._getSpellSourceOptions().map((o) => o.key));
            this.selectedSources = new Set((preset.sources || []).map(normalizeKey).filter((k) => validSources.has(k)));
            this.updateSourceButton();
            this.selectedIndex = 0;
            this.refreshResults(true);
        });

        if (!this.isPopout) {
            const popoutBtn = buttonRowEl.createEl("button", {
                cls: "ttrpg-vs__toolbutton",
                text: "⤢ Pop-out",
            });
            popoutBtn.type = "button";
            popoutBtn.title = "Open Spellbook in a pop-out window";
            popoutBtn.addEventListener("click", async () => {
                const snap = this.getStateSnapshot();
                snap.isPopout = true;
                if (this.onClose) this.onClose();
                await this.plugin.openSpellbookPopout(snap);
            });
        } else {
            const popinBtn = buttonRowEl.createEl("button", {
                cls: "ttrpg-vs__toolbutton",
                text: "⤡ Pop-in",
            });
            popinBtn.type = "button";
            popinBtn.title = "Move Spellbook back to main window";
            popinBtn.addEventListener("click", () => {
                const snap = this.getStateSnapshot();
                snap.forceModal = true;
                snap.isPopout = false;
                if (this.onClose) this.onClose();
                this.plugin.openSpellbookModal(snap);
            });
        }

        // ── Results area ──────────────────────────────────────────────────────
        this.statsEl = this.containerEl.createDiv({ cls: "ttrpg-vs__stats" });
        this.viewportEl = this.containerEl.createDiv({ cls: "ttrpg-vs__viewport" });
        this.canvasEl = this.viewportEl.createDiv({ cls: "ttrpg-vs__canvas" });
        this.emptyEl = this.viewportEl.createDiv({ cls: "ttrpg-vs__empty" });
        this.emptyEl.setText("No spells found. Try adjusting filters or rebuilding the index.");
        this.viewportEl.addEventListener("scroll", () => this.scheduleVirtualRender(), { passive: true });
        this._vpHeight = 0;
        if (typeof ResizeObserver !== "undefined") {
            this._viewportRO = new ResizeObserver(entries => {
                if (entries[0] && this.viewportEl) {
                    this._vpHeight = entries[0].contentRect.height;
                    this.scheduleVirtualRender();
                }
            });
            this._viewportRO.observe(this.viewportEl);
        }

        this.applyInitialState();
        this.updateLevelButton(); this.updateSchoolButton(); this.updateClassButton(); this.updateSourceButton();
        this.refreshResults(false);
        window.setTimeout(() => { if (this.inputEl) this.inputEl.focus(); }, 0);
    }

    destroy() {
        if (this._viewportRO) { this._viewportRO.disconnect(); this._viewportRO = null; }
        this.renderedItems.clear();
        this.containerEl.empty();
    }

    applyInitialState() {
        if (!this.initialState) return;
        this.query = this.initialState.query || "";
        if (this.inputEl) this.inputEl.value = this.query;
        if (Array.isArray(this.initialState.selectedLevels)) this.selectedLevels = new Set(this.initialState.selectedLevels);
        if (Array.isArray(this.initialState.selectedSchools)) this.selectedSchools = new Set(this.initialState.selectedSchools);
        if (Array.isArray(this.initialState.selectedClasses)) this.selectedClasses = new Set(this.initialState.selectedClasses);
        if (Array.isArray(this.initialState.selectedSources)) this.selectedSources = new Set(this.initialState.selectedSources);
        if (this.initialState.sortMode) { this.sortMode = this.initialState.sortMode; if (this.sortSelectEl) this.sortSelectEl.value = this.sortMode; }
        if (this.initialState.showFavoritesOnly) { this.showFavoritesOnly = true; if (this.favBtnEl) this.favBtnEl.classList.add("is-active"); }
        if (this.initialState.ritualOnly) { this.ritualOnly = true; if (this.ritualBtnEl) this.ritualBtnEl.classList.add("is-active"); }
        if (this.initialState.concOnly) { this.concOnly = true; if (this.concBtnEl) this.concBtnEl.classList.add("is-active"); }
        this.sortReverse = !!this.initialState.sortReverse;
        if (this.sortReverseBtn) this.sortReverseBtn.classList.toggle("is-active", this.sortReverse);
        if (this.initialState.scrollTop) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (this.viewportEl) this.viewportEl.scrollTop = this.initialState.scrollTop;
            }));
        }
    }

    loadState(state) {
        this.initialState = state;
        this.applyInitialState();
    }

    getStateSnapshot() {
        return {
            mode: "spellbook",
            isPopout: this.isPopout,
            query: this.query,
            selectedLevels: Array.from(this.selectedLevels),
            selectedSchools: Array.from(this.selectedSchools),
            selectedClasses: Array.from(this.selectedClasses),
            selectedSources: Array.from(this.selectedSources),
            sortMode: this.sortMode,
            sortReverse: this.sortReverse,
            showFavoritesOnly: this.showFavoritesOnly,
            ritualOnly: this.ritualOnly,
            concOnly: this.concOnly,
            scrollTop: this.viewportEl ? this.viewportEl.scrollTop : 0,
        };
    }

    refreshFromPlugin() {
        this.updateLevelButton(); this.updateSchoolButton(); this.updateClassButton(); this.updateSourceButton();
        this.refreshResults(false);
    }

    handleBookmarksChanged() { this.refreshResults(false); }

    _getSpellSourceOptions() {
        const map = new Map();
        for (const entry of this.plugin.getSpellEntries()) {
            if (entry.typeKey !== "spell" || !entry.sourceKey || !entry.sourceLabel) continue;
            const ex = map.get(entry.sourceKey);
            if (ex) ex.count++;
            else map.set(entry.sourceKey, {
                key: entry.sourceKey,
                label: this.plugin.getSourceDisplayLabel(entry.sourceKey, entry.sourceLabel),
                rawLabel: entry.sourceLabel,
                count: 1
            });
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
        let entries = this.plugin.getSpellEntries();
        const total = entries.length;

        if (this.showFavoritesOnly) {
            entries = entries.filter((e) => this.plugin.isSpellBookmarked(e.path));
        }

        entries = entries.filter((entry) => {
            const sm = entry.spellMeta;
            if (this.selectedLevels.size > 0 && (!sm || sm.level == null || !this.selectedLevels.has(String(sm.level)))) return false;
            if (this.selectedSchools.size > 0 && (!sm || !sm._normalizedSchoolKey || !this.selectedSchools.has(sm._normalizedSchoolKey))) return false;
            if (this.selectedClasses.size > 0 && (!sm || !sm._normalizedClassesKeys || !sm._normalizedClassesKeys.some((c) => this.selectedClasses.has(c)))) return false;
            if (this.selectedSources.size > 0 && !this.selectedSources.has(entry.sourceKey)) return false;
            return true;
        });

        if (this.ritualOnly) entries = entries.filter((e) => e.spellMeta?.ritual === true);
        if (this.concOnly) entries = entries.filter((e) => e.spellMeta?.concentration === true);

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
        if (this.sortReverse) {
            entries.reverse();
        }
        this.visibleEntries = entries.slice(0, this.plugin.settings.maxResults);

        if (!this.visibleEntries.length) this.selectedIndex = 0;
        else this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, this.visibleEntries.length - 1));

        if (resetScroll && this.viewportEl) this.viewportEl.scrollTop = 0;

        const favCount = this.plugin.getSpellBookmarkedPaths().length;
        const favLabel = favCount > 0 ? ` • ★ ${favCount} saved` : "";
        this.statsEl.textContent = `${entries.length} matching • ${this.visibleEntries.length} shown • ${total} total${favLabel}`;
        this.canvasEl.style.height = `${this.visibleEntries.length * RESULT_ROW_HEIGHT}px`;
        this.canvasEl.style.display = this.visibleEntries.length ? "block" : "none";
        this.emptyEl.style.display = this.visibleEntries.length ? "none" : "block";
        this.scheduleVirtualRender(true);
    }

    _compareByMode(a, b) {
        switch (this.sortMode) {
            case "level": { const la = a.spellMeta?.level ?? 99, lb = b.spellMeta?.level ?? 99; return la - lb || COLLATOR.compare(a.displayName, b.displayName); }
            case "school": return COLLATOR.compare(a.spellMeta?.school || "zzz", b.spellMeta?.school || "zzz") || COLLATOR.compare(a.displayName, b.displayName);
            case "source": return COLLATOR.compare(a.sourceLabel || "zzz", b.sourceLabel || "zzz") || COLLATOR.compare(a.displayName, b.displayName);
            default: return COLLATOR.compare(a.displayName, b.displayName);
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
        const win = this.containerEl.ownerDocument.defaultView || window;
        win.requestAnimationFrame(() => { this.virtualRenderQueued = false; this.renderVirtualRows(); });
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
        const end = Math.min(this.visibleEntries.length, Math.ceil((sTop + vpH) / RESULT_ROW_HEIGHT) + RESULT_OVERSCAN);

        if (needsFullRebuild) {
            this.renderedItems.clear();
            this.canvasEl.replaceChildren();
        } else {
            for (const [i, el] of this.renderedItems) {
                if (i < start || i >= end) { el.remove(); this.renderedItems.delete(i); }
            }
        }

        const doc = this.containerEl.ownerDocument;
        const frag = doc.createDocumentFragment();
        for (let i = start; i < end; i++) {
            if (this.renderedItems.has(i)) continue;
            const el = this.createSpellResultElement(this.visibleEntries[i], i);
            el.style.top = `${i * RESULT_ROW_HEIGHT}px`;
            frag.appendChild(el); this.renderedItems.set(i, el);
        }
        if (frag.childNodes.length) this.canvasEl.appendChild(frag);
    }

    createSpellResultElement(entry, index) {
        const doc = this.containerEl.ownerDocument;
        const itemEl = doc.createElement("div");
        itemEl.className = "ttrpg-vs__result";
        if (index === this.selectedIndex) itemEl.classList.add("is-selected");
        itemEl.addEventListener("mouseenter", () => this.setSelectedIndex(index, false));
        itemEl.addEventListener("click", () => void this.openEntry(entry));

        itemEl.addEventListener("contextmenu", async (e) => {
            if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".ttrpg-sb__level-chip") || e.target.closest(".ttrpg-vs__badge") || e.target.closest(".ttrpg-vs__chip")) {
                return;
            }
            if (this.isPopout) {
                e.preventDefault();
                e.stopPropagation();
                const entries = this.plugin.getReaderEntriesForEntry(entry);
                const initialIndex = Math.max(0, entries.findIndex((candidate) => candidate.path === entry.path));
                const activeLeaf = this.app.workspace.getActiveLeaf();
                try {
                    const leaf = this.app.workspace.getLeaf("tab");
                    await leaf.setViewState({ type: TTRPG_READER_VIEW_TYPE, active: false });
                    if (leaf.view && typeof leaf.view.setReaderState === "function") {
                        leaf.view.setReaderState(entries, initialIndex, this.getStateSnapshot(), "native");
                    }
                    if (activeLeaf) {
                        this.app.workspace.setActiveLeaf(activeLeaf, { focus: true });
                    }
                } catch (err) {
                    console.error("Failed to open spellbook entry in background tab:", err);
                }
            }
        });

        // Ctrl/Cmd-hover: trigger Obsidian native page preview
        const handleHover = (e) => {
            if (e.ctrlKey || e.metaKey) {
                this.plugin.app.workspace.trigger("hover-link", {
                    event: e,
                    source: "search",
                    hoverParent: this.parentComponent,
                    targetEl: itemEl,
                    linktext: entry.path,
                    sourcePath: ""
                });
            }
        };
        itemEl.addEventListener("mouseover", handleHover);
        itemEl.addEventListener("mousemove", handleHover);

        const topEl = doc.createElement("div"); topEl.className = "ttrpg-vs__top";
        const mainEl = doc.createElement("div"); mainEl.className = "ttrpg-vs__main";

        const titleEl = doc.createElement("div"); titleEl.className = "ttrpg-vs__title";
        const nameEl = doc.createElement("span"); nameEl.className = "ttrpg-vs__title-piece ttrpg-vs__title-chapter";
        nameEl.innerHTML = highlightMatch(entry.displayName, this.query);
        titleEl.appendChild(nameEl); mainEl.appendChild(titleEl);

        const metaEl = doc.createElement("div"); metaEl.className = "ttrpg-vs__meta";
        const sm = entry.spellMeta;
        if (sm?.level != null) {
            const chip = doc.createElement("span");
            chip.className = `ttrpg-sb__level-chip ttrpg-sb__level-${sm.level}`;
            chip.textContent = formatSpellLevel(sm.level);
            chip.style.cursor = "pointer"; chip.title = `Filter to ${formatSpellLevel(sm.level)}`;
            chip.addEventListener("click", (e) => {
                e.preventDefault(); e.stopPropagation();
                this.selectedLevels = new Set([String(sm.level)]);
                this.updateLevelButton(); this.selectedIndex = 0; this.refreshResults(true);
            });
            metaEl.appendChild(chip);
        }
        if (sm?.school) {
            const badge = doc.createElement("button"); badge.type = "button";
            badge.className = "ttrpg-vs__badge ttrpg-vs__badge--clickable ttrpg-sb__school-badge--" + normalizeKey(sm.school);
            badge.textContent = sm.school; badge.title = `Filter by school: ${sm.school}`;
            badge.addEventListener("click", (e) => {
                e.preventDefault(); e.stopPropagation();
                this.selectedSchools = new Set([normalizeKey(sm.school)]);
                this.updateSchoolButton(); this.selectedIndex = 0; this.refreshResults(true);
            });
            metaEl.appendChild(badge);
        }
        if (entry.sourceLabel) {
            const chip = doc.createElement("button"); chip.type = "button";
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

        const classesEl = doc.createElement("div"); classesEl.className = "ttrpg-vs__meta-text";
        if (sm) {
            const parts = [];
            if (sm.classes.length) parts.push(sm.classes.join(", "));
            if (sm.ritual) parts.push("Ritual");
            if (sm.concentration) parts.push("Concentration");
            classesEl.textContent = parts.join(" • ") || (entry.aliases[0] || "");
        } else {
            classesEl.textContent = entry.aliases[0] || entry.typeLabel;
        }
        mainEl.appendChild(classesEl);

        const rightEl = doc.createElement("div"); rightEl.className = "ttrpg-vs__right";
        const starEl = doc.createElement("button"); starEl.type = "button"; starEl.className = "ttrpg-vs__star";
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
            if (this.showFavoritesOnly) this.refreshResults(false);
        });
        rightEl.appendChild(starEl);

        topEl.appendChild(mainEl); topEl.appendChild(rightEl);
        const pathEl = doc.createElement("div"); pathEl.className = "ttrpg-vs__path";
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
        if (this._openingEntry) return;
        this._openingEntry = true;
        const timeoutId = setTimeout(() => { this._openingEntry = false; }, 1000);
        try {
            await new Promise(resolve => setTimeout(resolve, 50));
            const entries = this.plugin.getReaderEntriesForEntry(entry);
            const idx = Math.max(0, entries.findIndex((e) => e.path === entry.path));
            const snap = this.getStateSnapshot();
            if (this.isPopout) {
                if (this.plugin.settings.openReaderInPopoutByDefault) {
                    await this.plugin.openReaderPopout(entries, idx, snap);
                } else {
                    try {
                        await this.plugin.openReaderNativeTab(entries, idx, snap);
                    } catch (err) {
                        new TTRPGReaderModal(this.app, this.plugin, entries, idx, snap).open();
                    }
                }
            } else {
                // In modal
                if (this.plugin.settings.openReaderInPopoutByDefault) {
                    if (this.onClose) this.onClose();
                    await this.plugin.openReaderPopout(entries, idx, snap);
                } else {
                    const reader = new TTRPGReaderModal(this.app, this.plugin, entries, idx, snap);
                    if (this.onClose) this.onClose();
                    reader.open();
                }
            }
        } finally {
            clearTimeout(timeoutId);
            this._openingEntry = false;
        }
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
        this.hoverPopover = null;
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
    refreshFromPlugin() {
        if (this._engine) this._engine.refreshFromPlugin();
    }
}

class TTRPGSpellbookModal extends Modal {
    constructor(app, plugin, initialState = null) {
        super(app);
        this.plugin = plugin;
        this.initialState = initialState;
        this.controller = null;
        this.hoverPopover = null;
    }

    onOpen() {
        this.plugin.registerModal(this);
        this.modalEl.classList.add("ttrpg-sb-modal", "ttrpg-vs-modal");
        this.contentEl.empty();
        this.contentEl.classList.add("ttrpg-vs");
        this.titleEl.setText("Spellbook");

        this.controller = new TTRPGSpellbookController(this.app, this.plugin, {
            containerEl: this.contentEl,
            isPopout: false,
            parentComponent: this,
            onClose: () => this.close(),
            initialState: this.initialState
        });
        this.controller.build();
    }

    onClose() {
        if (this.plugin.settings.saveLastSpellbookSearch && this.controller) {
            const snap = this.controller.getStateSnapshot();
            this.plugin._cachedSpellbookSearchState = snap;
            this.plugin.settings.lastSpellbookSearchState = snap;
            void this.plugin.saveSettings(false);
        }
        if (this.controller) {
            this.controller.destroy();
            this.controller = null;
        }
        this.plugin.unregisterModal(this);
    }

    handleBookmarksChanged() {
        if (this.controller) {
            this.controller.handleBookmarksChanged();
        }
    }

    refreshFromPlugin() {
        if (this.controller) {
            this.controller.refreshFromPlugin();
        }
    }
}

class SourcePickerModal extends Modal {
    constructor(app, plugin, optionFetcher, initialSelection, onApply, titleText = "Filter by Source") {
        super(app);
        this.plugin = plugin;
        this.optionFetcher = optionFetcher;
        this.options = optionFetcher() || [];
        this.onApply = onApply;
        this.titleText = titleText;
        this.query = "";
        // If initialSelection is empty that means "show all" → pre-check every box
        this.pendingKeys =
            initialSelection.size === 0
                ? new Set(this.options.map((o) => o.key))
                : new Set(initialSelection);
    }

    onOpen() {
        this.plugin.registerModal(this);
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
        this.plugin.unregisterModal(this);
        this.contentEl.empty();
    }

    refreshFromPlugin() {
        this.options = this.optionFetcher() || [];
        this.renderList();
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

        const doc = this.contentEl.ownerDocument;
        if (!filtered.length) {
            const emptyEl = doc.createElement("div");
            emptyEl.className = "ttrpg-vs__empty";
            emptyEl.textContent = "No matching sources.";
            this.listEl.appendChild(emptyEl);
            return;
        }

        const fragment = doc.createDocumentFragment();

        filtered.forEach((option) => {
            const labelEl = doc.createElement("label");
            labelEl.className = "ttrpg-vs-type__item";

            const checkboxEl = doc.createElement("input");
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

            const nameEl = doc.createElement("span");
            nameEl.className = "ttrpg-vs-source__name";
            nameEl.textContent = option.label;

            // Re-style and add context menu if it is a source option list!
            if (this.titleText.toLowerCase().includes("source") && option.key) {
                nameEl.className = "ttrpg-vs-source__name ttrpg-vs__chip ttrpg-vs__chip--clickable";
                this.plugin.applySourceChipStyle(nameEl, option.key);
                nameEl.style.cursor = "pointer";
                nameEl.title = `Right-click to edit source chip`;
                nameEl.addEventListener("contextmenu", (e) => {
                    e.preventDefault(); e.stopPropagation();
                    new SourceChipEditModal(this.app, this.plugin, option.key, option.rawLabel || option.label).open();
                });
            }

            const countEl = doc.createElement("span");
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
            { setTitle: () => { }, goBack: () => { }, closeReader: null, isPopout: false },
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

    refreshFromPlugin() {
        this.handleBookmarksChanged();
    }

    handleBookmarksChanged() {
        this.updateBookmarkButton();
        this.updateBookmarkCollectionButton();
    }

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
        const doc = this.containerEl.ownerDocument;
        this.entries.forEach((entry, index) => {
            const buttonEl = doc.createElement("button");
            buttonEl.type = "button";
            buttonEl.className = "ttrpg-reader__section";
            buttonEl.style.setProperty("--ttrpg-depth", String(collectionDepth(entry)));
            if (index === this.selectedIndex) buttonEl.classList.add("is-active");
            buttonEl.addEventListener("click", () => void this.selectIndex(index));

            const titleEl = doc.createElement("div");
            titleEl.className = "ttrpg-reader__section-title";
            titleEl.textContent = entry.displayName || "Untitled";
            buttonEl.appendChild(titleEl);

            const metaText = sectionMeta(entry);
            if (metaText) {
                const metaEl = doc.createElement("div");
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
        this.contentMetaEl.empty();
        if (entry.sourceKey) {
            const chip = this.contentMetaEl.createEl("button", {
                cls: "ttrpg-vs__chip ttrpg-vs__chip--clickable",
                text: this.plugin.getSourceDisplayLabel(entry.sourceKey, entry.sourceLabel || entry.sourceKey),
                type: "button"
            });
            chip.style.marginRight = "8px";
            this.plugin.applySourceChipStyle(chip, entry.sourceKey);
            chip.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const controller = this.plugin.getBestiaryController();
                if (controller) {
                    controller.selectedSources = new Set([entry.sourceKey]);
                    controller.renderFiltersTab();
                    controller.renderMainContent();
                }
            });
            chip.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                e.stopPropagation();
                new SourceChipEditModal(this.app, this.plugin, entry.sourceKey, entry.sourceLabel || entry.sourceKey).open();
            });
        }
        this.contentMetaEl.createSpan({ text: entry.path });
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
        } else if (this.searchState && this.searchState.query) {
            highlightAndScrollToQuery(this.contentBodyEl, this.searchState.query);
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
            try { const el = this.contentBodyEl.querySelector(`#${CSS.escape(decoded)}`); if (el) return el; } catch (_) { }
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
        const doc = this.containerEl.ownerDocument;
        if (!headingEls.length) {
            const emptyEl = doc.createElement("div");
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
            const emptyEl = doc.createElement("div");
            emptyEl.className = "ttrpg-reader__section-meta";
            emptyEl.textContent = "No subheadings in this note.";
            this.subheadingsEl.appendChild(emptyEl);
            return;
        }
        const baseLevel = Math.min(...this.headingTargets.map((h) => h.level));
        const fragment = doc.createDocumentFragment();
        this.headingTargets.forEach((heading) => {
            const buttonEl = doc.createElement("button");
            buttonEl.type = "button";
            buttonEl.className = "ttrpg-reader__subheading";
            buttonEl.style.setProperty("--ttrpg-depth", String(Math.max(0, heading.level - baseLevel)));
            buttonEl.addEventListener("click", () => heading.element.scrollIntoView({ block: "start", behavior: "smooth" }));
            const titleEl = doc.createElement("div");
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
        const doc = this.containerEl.ownerDocument;
        for (const textNode of textNodes) {
            const text = textNode.nodeValue || "";
            pattern.lastIndex = 0;
            const frag = doc.createDocumentFragment();
            let lastIndex = 0, match;
            while ((match = pattern.exec(text)) !== null) {
                if (match.index > lastIndex) frag.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
                const mark = doc.createElement("mark");
                mark.className = "ttrpg-reader__find-match";
                mark.textContent = match[0];
                frag.appendChild(mark);
                this._searchMatches.push(mark);
                lastIndex = pattern.lastIndex;
            }
            if (lastIndex < text.length) frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
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
// TTRPGReaderView – hosts ReaderEngine inside a leaf / pop-out Obsidian window
// ─────────────────────────────────────────────────────────────────────────────
function focusSearchTab(currentLeaf) {
    try {
        const currentWin = currentLeaf.view?.containerEl?.ownerDocument?.defaultView || window;
        const searchViewTypes = [
            TTRPG_SEARCH_VIEW_TYPE,
            TTRPG_BESTIARY_VIEW_TYPE,
            TTRPG_SPELLBOOK_VIEW_TYPE,
            TTRPG_ITEM_SEARCH_VIEW_TYPE
        ];
        let targetLeaf = null;
        currentLeaf.app.workspace.iterateAllLeaves((leaf) => {
            if (targetLeaf) return;
            const win = leaf.view?.containerEl?.ownerDocument?.defaultView;
            if (win === currentWin && leaf.view && searchViewTypes.includes(leaf.view.getViewType())) {
                targetLeaf = leaf;
            }
        });
        if (targetLeaf) {
            currentLeaf.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
        }
    } catch (err) {
        console.warn("Failed to focus search tab:", err);
    }
}

class TTRPGReaderView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.engine = null;
        this.displayTitle = "TTRPG Reader";
        this.entries = [];
        this.initialIndex = 0;
        this.searchState = null;
        this.sourceMode = "window";
    }

    getViewType() { return TTRPG_READER_VIEW_TYPE; }
    getDisplayText() { return this.displayTitle || "TTRPG Reader"; }
    getIcon() { return "book-open"; }

    _setViewTitle(title) {
        const clean = String(title || "TTRPG Reader").trim() || "TTRPG Reader";
        this.displayTitle = clean;
        if (this.contentEl) this.contentEl.dataset.ttrpgTitle = clean;

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
        this.contentEl.empty();
        this.contentEl.addClass("ttrpg-popout-view");
        this.contentEl.addClass("ttrpg-reader");

        if (this.entries && this.entries.length) {
            this.buildEngine();
        }
    }

    setReaderState(entries, initialIndex, searchState, sourceMode) {
        this.entries = entries || [];
        this.initialIndex = initialIndex || 0;
        this.searchState = searchState || null;
        const mode = sourceMode === true ? "native" : (sourceMode || "window");
        this.sourceMode = mode;

        const first = this.entries[0];
        const title = (this.entries[this.initialIndex] && (this.entries[this.initialIndex].collectionName || this.entries[this.initialIndex].displayName)) || (first && (first.collectionName || first.displayName)) || "Reader";
        this._setViewTitle(title);

        if (this.contentEl) {
            this.buildEngine();
        }
    }

    buildEngine() {
        if (this.engine) {
            this.engine.destroy();
            this.engine = null;
        }
        this.contentEl.empty();

        const self = this;
        const isDetachedWindow = this.sourceMode === "window";
        this.engine = new ReaderEngine(this.app, this.plugin, {
            setTitle: (text) => { self._setViewTitle(text); },
            goBack: (state) => {
                focusSearchTab(self.leaf);
                self.leaf.detach();
            },
            closeReader: () => {
                focusSearchTab(self.leaf);
                self.leaf.detach();
            },
            isPopout: isDetachedWindow,
            onPopBackIn: async () => {
                const e = self.engine ? self.engine.entries : self.entries;
                const i = self.engine ? self.engine.selectedIndex : self.initialIndex;
                const s = self.engine ? self.engine.searchState : self.searchState;
                await self.plugin.openReaderNativeTab(e, i, s);
                self.leaf.detach();
            },
        });
        this.engine.build(this.contentEl, this.entries, this.initialIndex, this.searchState);
    }

    async onClose() {
        if (this.engine) {
            this.engine.destroy();
            this.engine = null;
        }
        this.plugin.unregisterModal(this);
    }

    handleBookmarksChanged() {
        if (this.engine) this.engine.handleBookmarksChanged();
    }

    refreshFromPlugin() {
        if (this.engine) this.engine.handleBookmarksChanged();
    }
}

class TTRPGSearchView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.initialState = null;
        this.ro = null;
        this.refreshResults = null;
        this.hoverPopover = null;
    }
    getViewType() { return TTRPG_SEARCH_VIEW_TYPE; }
    getDisplayText() { return "TTRPG Vault Search"; }
    getIcon() { return "search"; }
    async onOpen() {
        this.plugin.registerModal(this);
        this.contentEl.empty();
        this.contentEl.addClass("ttrpg-popout-view");
        this.contentEl.addClass("ttrpg-vs");
        this.contentEl.style.height = "100%";
        this.contentEl.style.overflow = "hidden";
        this.contentEl.style.padding = "12px";
        this.contentEl.style.boxSizing = "border-box";
        this.contentEl.style.display = "flex";
        this.contentEl.style.flexDirection = "column";

        this.buildSearchPanel(this.initialState);
    }
    initSearchView(initialState) {
        this.initialState = initialState;
        if (this.contentEl && this.contentEl.isConnected) {
            this.buildSearchPanel(initialState);
        }
    }
    buildSearchPanel(initialState) {
        this.contentEl.empty();
        this._buildSearchPanel(this.contentEl, initialState);
    }
    async onClose() {
        if (this.plugin.settings.saveLastSearch && typeof this.getSnapshot === "function") {
            const snap = this.getSnapshot();
            this.plugin._cachedSearchState = snap;
            this.plugin.settings.lastSearchState = snap;
            void this.plugin.saveSettings(false);
        }
        if (this.ro) {
            this.ro.disconnect();
            this.ro = null;
        }
        this.refreshResults = null;
        this.plugin.unregisterModal(this);
    }
    handleBookmarksChanged() {
        if (this.refreshResults) this.refreshResults();
    }
    refreshFromPlugin() {
        if (this.refreshResults) this.refreshResults();
    }

    _buildSearchPanel(containerEl, initialState) {
        const doc = containerEl.ownerDocument;
        const win = doc.defaultView || window;
        // ── State ─────────────────────────────────────────────────────────────
        let query = initialState?.query || "";
        let selectedTypes = new Set(Array.isArray(initialState?.selectedTypes) ? initialState.selectedTypes : []);
        let selectedSources = new Set(Array.isArray(initialState?.selectedSources) ? initialState.selectedSources : []);
        let sortMode = initialState?.sortMode || this.plugin.settings.sortMode || "relevance";
        let showBookmarks = !!(initialState?.showBookmarksOnly);
        let selectedBookmarkGroup = initialState?.selectedBookmarkGroup ?? null;
        let sortReverse = !!initialState?.sortReverse;
        let openingEntry = false;
        let visibleEntries = [];
        let selectedIndex = 0;
        let renderedItems = new Map();
        let virtualQueued = false;
        let renderGeneration = 0;
        let collReps = new Set();
        let collCounts = new Map();

        // ── DOM ───────────────────────────────────────────────────────────────
        const toolbarEl = containerEl.createDiv({ cls: "ttrpg-vs__toolbar" });
        const inputEl = toolbarEl.createEl("input", { cls: "ttrpg-vs__search" });
        inputEl.type = "search";
        inputEl.placeholder = "Search spells, items, monsters, adventures…";
        inputEl.spellcheck = false;
        inputEl.value = query;
        inputEl.addEventListener("blur", () => saveSearchState());

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

        const sortRow = sortWrap.createDiv({ cls: "ttrpg-vs__sort-row" });
        sortRow.style.display = "flex";
        sortRow.style.gap = "4px";
        sortRow.style.width = "100%";

        const sortSelectEl = sortRow.createEl("select", { cls: "ttrpg-vs__select" });
        sortSelectEl.style.flex = "1";
        [["relevance", "Relevance"], ["name", "Name"], ["source", "Source"], ["type", "Type"]].forEach(([v, l]) => {
            const o = doc.createElement("option"); o.value = v; o.textContent = l; sortSelectEl.appendChild(o);
        });
        sortSelectEl.value = sortMode;

        const sortReverseBtn = sortRow.createEl("button", {
            cls: "ttrpg-vs__toolbutton",
            text: "⇅",
        });
        sortReverseBtn.type = "button";
        sortReverseBtn.style.padding = "4px 8px";
        sortReverseBtn.style.width = "auto";
        sortReverseBtn.style.flexShrink = "0";
        sortReverseBtn.title = "Reverse Sort Order";
        sortReverseBtn.classList.toggle("is-active", sortReverse);
        sortReverseBtn.addEventListener("click", () => {
            sortReverse = !sortReverse;
            sortReverseBtn.classList.toggle("is-active", sortReverse);
            saveSearchState();
            refreshResults(false);
        });

        // Button row
        const btnRowEl = filtersEl.createDiv({ cls: "ttrpg-vs__button-row" });
        const bookmarksBtn = btnRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Bookmarks" });
        bookmarksBtn.type = "button";

        const manageBtn = btnRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Manage" });
        manageBtn.type = "button";
        manageBtn.style.display = "none";

        const clearSrcBtn = btnRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Clear source" });
        clearSrcBtn.type = "button"; clearSrcBtn.disabled = true;

        const presetSelectEl = btnRowEl.createEl("select", { cls: "ttrpg-vs__select" });
        presetSelectEl.style.width = "auto";
        presetSelectEl.appendChild(Object.assign(doc.createElement("option"), { value: "", textContent: "Preset…" }));
        for (const preset of this.plugin.getFilterPresets()) {
            const opt = doc.createElement("option");
            opt.value = preset.id;
            opt.textContent = preset.name;
            presetSelectEl.appendChild(opt);
        }

        const spellbookBtn = btnRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Spellbook" });
        spellbookBtn.type = "button"; spellbookBtn.title = "Open Spellbook";

        const popInBtn = btnRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "⤡ Pop In" });
        popInBtn.type = "button"; popInBtn.title = "Move search back to main window";

        const groupTabsEl = toolbarEl.createDiv({ cls: "ttrpg-vs__group-tabs" });
        groupTabsEl.style.display = "none";

        const statsEl = containerEl.createDiv({ cls: "ttrpg-vs__stats" });
        const viewportEl = containerEl.createDiv({ cls: "ttrpg-vs__viewport" });
        const canvasEl = viewportEl.createDiv({ cls: "ttrpg-vs__canvas" });
        const emptyEl = viewportEl.createDiv({ cls: "ttrpg-vs__empty" });
        emptyEl.setText("No matching entries found.");

        // ── Helpers ───────────────────────────────────────────────────────────
        const getSnapshot = () => ({
            query, selectedTypes: Array.from(selectedTypes),
            selectedSources: Array.from(selectedSources),
            sortMode, showBookmarksOnly: showBookmarks,
            selectedBookmarkGroup,
            sortReverse,
            scrollTop: viewportEl.scrollTop,
        });
        this.getSnapshot = getSnapshot;

        const saveSearchState = () => {
            if (this.plugin.settings.saveLastSearch) {
                const snap = getSnapshot();
                this.plugin._cachedSearchState = snap;
                this.plugin.settings.lastSearchState = snap;
                void this.plugin.saveSettings(false);
            }
        };

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
            renderBookmarkGroupTabs();
        };

        const renderBookmarkGroupTabs = () => {
            groupTabsEl.replaceChildren();
            if (!showBookmarks) {
                groupTabsEl.style.display = "none";
                return;
            }
            const groups = this.plugin.getBookmarkGroups();
            if (!groups.length) {
                groupTabsEl.style.display = "none";
                return;
            }
            groupTabsEl.style.display = "";

            const allTab = doc.createElement("button");
            allTab.type = "button";
            allTab.className = "ttrpg-vs__group-tab" + (selectedBookmarkGroup === null ? " is-active" : "");
            allTab.textContent = "All";
            allTab.addEventListener("click", () => {
                selectedBookmarkGroup = null;
                renderBookmarkGroupTabs();
                refreshResults(true);
                saveSearchState();
            });
            groupTabsEl.appendChild(allTab);

            const ungroupedTab = doc.createElement("button");
            ungroupedTab.type = "button";
            ungroupedTab.className = "ttrpg-vs__group-tab" + (selectedBookmarkGroup === "ungrouped" ? " is-active" : "");
            ungroupedTab.textContent = "Ungrouped";
            ungroupedTab.addEventListener("click", () => {
                selectedBookmarkGroup = "ungrouped";
                renderBookmarkGroupTabs();
                refreshResults(true);
                saveSearchState();
            });
            groupTabsEl.appendChild(ungroupedTab);

            for (const group of groups) {
                const tab = doc.createElement("button");
                tab.type = "button";
                tab.className = "ttrpg-vs__group-tab" + (selectedBookmarkGroup === group.id ? " is-active" : "");
                tab.textContent = group.name;
                tab.addEventListener("click", () => {
                    selectedBookmarkGroup = group.id;
                    renderBookmarkGroupTabs();
                    refreshResults(true);
                    saveSearchState();
                });
                groupTabsEl.appendChild(tab);
            }
        };

        const scheduleVirtualRender = (forceFullRebuild = false) => {
            if (forceFullRebuild) scheduleVirtualRender.needsFullRebuild = true;
            if (virtualQueued) return;
            virtualQueued = true;
            win.requestAnimationFrame(() => {
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
            if (openingEntry) return;
            openingEntry = true;
            const timeoutId = setTimeout(() => { openingEntry = false; }, 1000);
            try {
                await new Promise(resolve => setTimeout(resolve, 50));
                const isCollRep = collReps.has(entry.path) && !!entry.collectionKind;
                let entries, initialIndex;
                if (isCollRep) {
                    entries = this.plugin.getCollectionEntries(entry.collectionPath);
                    initialIndex = 0;
                } else {
                    entries = this.plugin.getReaderEntriesForEntry(entry);
                    initialIndex = Math.max(0, entries.findIndex(e => e.path === entry.path));
                }
                saveSearchState();
                await this.plugin.openReaderNativeTab(entries, initialIndex, getSnapshot());
            } finally {
                clearTimeout(timeoutId);
                openingEntry = false;
            }
        };

        const createResultEl = (entry, index) => {
            const itemEl = doc.createElement("div");
            itemEl.className = "ttrpg-vs__result";
            if (index === selectedIndex) itemEl.classList.add("is-selected");
            itemEl.addEventListener("mouseenter", () => setSelectedIndex(index, false));
            itemEl.addEventListener("click", () => openEntry(entry));

            itemEl.addEventListener("contextmenu", async (event) => {
                let current = event.target;
                let isInteractive = false;
                while (current && current !== itemEl) {
                    if (current.tagName === "BUTTON" || 
                        current.classList.contains("ttrpg-vs__chip") || 
                        current.classList.contains("ttrpg-vs__favorite") || 
                        current.classList.contains("ttrpg-vs__badge--clickable")) {
                        isInteractive = true;
                        break;
                    }
                    current = current.parentElement;
                }
                if (isInteractive) return;

                event.preventDefault();
                event.stopPropagation();

                let entries = this.plugin.getReaderEntriesForEntry(entry);
                let initialIndex = Math.max(0, entries.findIndex((candidate) => candidate.path === entry.path));
                const activeLeaf = this.plugin.app.workspace.getActiveLeaf();
                try {
                    const leaf = this.plugin.app.workspace.getLeaf("tab");
                    await leaf.setViewState({ type: TTRPG_READER_VIEW_TYPE, active: false });
                    if (leaf.view && typeof leaf.view.setReaderState === "function") {
                        leaf.view.setReaderState(entries, initialIndex, getSnapshot(), "native");
                    }
                    if (activeLeaf) {
                        this.plugin.app.workspace.setActiveLeaf(activeLeaf, { focus: true });
                    }
                } catch (err) {
                    console.error("Failed to open entry in background tab:", err);
                }
            });

            // Ctrl-hover preview
            const handleHover = (e) => {
                if (e.ctrlKey || e.metaKey) {
                    this.plugin.app.workspace.trigger("hover-link", {
                        event: e,
                        source: "search",
                        hoverParent: this,
                        targetEl: itemEl,
                        linktext: entry.path,
                        sourcePath: ""
                    });
                }
            };
            itemEl.addEventListener("mouseover", handleHover);
            itemEl.addEventListener("mousemove", handleHover);

            const isCollRep = collReps.has(entry.path) && !!entry.collectionKind;
            const topEl = doc.createElement("div"); topEl.className = "ttrpg-vs__top";
            const mainEl = doc.createElement("div"); mainEl.className = "ttrpg-vs__main";
            const titleEl = doc.createElement("div"); titleEl.className = "ttrpg-vs__title";

            if (isCollRep) {
                const s = doc.createElement("span"); s.className = "ttrpg-vs__title-piece ttrpg-vs__title-chapter";
                s.innerHTML = highlightMatch(entry.collectionName, query); titleEl.appendChild(s);
            } else if (entry.collectionKind) {
                const c = doc.createElement("span"); c.className = "ttrpg-vs__title-piece ttrpg-vs__title-collection";
                c.innerHTML = highlightMatch(entry.collectionName, query); titleEl.appendChild(c);
                const sep = doc.createElement("span"); sep.className = "ttrpg-vs__title-sep"; sep.textContent = "-"; titleEl.appendChild(sep);
                const ch = doc.createElement("span"); ch.className = "ttrpg-vs__title-piece ttrpg-vs__title-chapter";
                ch.innerHTML = highlightMatch(entry.displayName, query); titleEl.appendChild(ch);
            } else {
                const s = doc.createElement("span"); s.className = "ttrpg-vs__title-piece ttrpg-vs__title-chapter";
                s.innerHTML = highlightMatch(entry.displayName, query); titleEl.appendChild(s);
            }
            mainEl.appendChild(titleEl);

            const metaEl = doc.createElement("div"); metaEl.className = "ttrpg-vs__meta";
            if (entry.typeLabel) {
                const t = doc.createElement("span"); t.className = "ttrpg-vs__badge"; t.textContent = entry.typeLabel; metaEl.appendChild(t);
            }
            if (entry.sourceLabel) {
                const s = doc.createElement("button");
                s.type = "button";
                s.className = "ttrpg-vs__chip ttrpg-vs__chip--clickable";
                const sourceDisplayLabel = this.plugin.getSourceDisplayLabel(entry.sourceKey, entry.sourceLabel);
                s.textContent = sourceDisplayLabel;
                s.title = `Filter by source: ${sourceDisplayLabel} (right-click to edit chip)`;
                this.plugin.applySourceChipStyle(s, entry.sourceKey);
                s.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectedSources = new Set([entry.sourceKey]);
                    updateSourceButton();
                    selectedIndex = 0;
                    refreshResults(true);
                });
                s.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    new SourceChipEditModal(this.app, this.plugin, entry.sourceKey, entry.sourceLabel || entry.sourceKey).open();
                });
                metaEl.appendChild(s);
            }
            const infoEl = doc.createElement("span"); infoEl.className = "ttrpg-vs__meta-text";
            const parts = [];
            if (entry.spellMeta) {
                const sm = entry.spellMeta;
                if (sm.school) parts.push(sm.school);
                if (sm.level != null) parts.push(sm.level === 0 ? "Cantrip" : `Level ${sm.level}`);
            }
            if (entry.monsterMeta) {
                const mm = entry.monsterMeta;
                if (mm.bestiaryType) parts.push(mm.bestiaryType);
                if (mm.cr != null && mm.cr !== "") parts.push(`CR ${mm.cr}`);
            }
            infoEl.textContent = parts.join(" • ");
            metaEl.appendChild(infoEl);
            mainEl.appendChild(metaEl);
            topEl.appendChild(mainEl);

            const starEl = doc.createElement("button"); starEl.type = "button";
            starEl.className = "ttrpg-vs__favorite" + (this.plugin.isBookmarked(entry.path) ? " is-active" : "");
            starEl.textContent = this.plugin.isBookmarked(entry.path) ? "★" : "☆";
            starEl.addEventListener("click", async (e) => {
                e.stopPropagation();
                await this.plugin.toggleBookmark(entry.path);
                starEl.classList.toggle("is-active", this.plugin.isBookmarked(entry.path));
                starEl.textContent = this.plugin.isBookmarked(entry.path) ? "★" : "☆";
                updateBookmarksButton();
            });
            topEl.appendChild(starEl);
            itemEl.appendChild(topEl);

            if (entry.path) {
                const p = doc.createElement("div"); p.className = "ttrpg-vs__path"; p.textContent = entry.path; itemEl.appendChild(p);
            }
            return itemEl;
        };

        const renderVirtualRows = () => {
            const viewportH_val = viewportH || viewportEl.clientHeight || 400;
            const scrollTop = viewportEl.scrollTop;
            const startIdx = Math.max(0, Math.floor(scrollTop / RESULT_ROW_HEIGHT) - RESULT_OVERSCAN);
            const endIdx = Math.min(visibleEntries.length - 1, Math.floor((scrollTop + viewportH_val) / RESULT_ROW_HEIGHT) + RESULT_OVERSCAN);

            if (scheduleVirtualRender.needsFullRebuild) {
                scheduleVirtualRender.needsFullRebuild = false;
                canvasEl.replaceChildren();
                renderedItems.clear();
            }

            for (const [idx, el] of renderedItems.entries()) {
                if (idx < startIdx || idx > endIdx) {
                    el.remove();
                    renderedItems.delete(idx);
                }
            }

            const fragment = doc.createDocumentFragment();
            for (let i = startIdx; i <= endIdx; i++) {
                if (renderedItems.has(i)) continue;
                const entry = visibleEntries[i];
                if (!entry) continue;
                const rowEl = createResultEl(entry, i);
                rowEl.style.position = "absolute";
                rowEl.style.top = `${i * RESULT_ROW_HEIGHT}px`;
                rowEl.style.left = "0";
                rowEl.style.right = "0";
                rowEl.style.height = `${RESULT_ROW_HEIGHT}px`;
                fragment.appendChild(rowEl);
                renderedItems.set(i, rowEl);
            }
            if (fragment.childNodes.length) canvasEl.appendChild(fragment);
        };

        const refreshResults = (resetScroll = false) => {
            renderGeneration++;
            let entries = showBookmarks ? this.plugin.getBookmarkedEntries() : this.plugin.getEntries();
            if (showBookmarks && selectedBookmarkGroup !== null) {
                entries = entries.filter((e) => {
                    const groupId = this.plugin.getBookmarkGroupForEntry(e);
                    if (selectedBookmarkGroup === "ungrouped") return !groupId;
                    return groupId === selectedBookmarkGroup;
                });
            }
            if (selectedTypes.size > 0) entries = entries.filter(e => selectedTypes.has(e.typeKey));
            if (selectedSources.size > 0) entries = entries.filter(e => selectedSources.has(e.sourceKey));

            const titleOnly = this.plugin.settings.searchTitleOnly !== false;
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
            let bookmarkOrderedEntries = showBookmarks ? this.plugin.sortEntriesByBookmarkOrder(deduped, selectedBookmarkGroup) : deduped;
            if (sortReverse) {
                bookmarkOrderedEntries = [...bookmarkOrderedEntries].reverse();
            }
            visibleEntries = bookmarkOrderedEntries.slice(0, this.plugin.settings.maxResults);
            if (!visibleEntries.length) selectedIndex = 0;
            else selectedIndex = Math.max(0, Math.min(selectedIndex, visibleEntries.length - 1));
            if (resetScroll) viewportEl.scrollTop = 0;
            statsEl.textContent = `${entries.length} matching • ${visibleEntries.length} shown • ${this.plugin.getEntries().length} indexed`;
            canvasEl.style.height = `${visibleEntries.length * RESULT_ROW_HEIGHT}px`;
            canvasEl.style.display = visibleEntries.length ? "block" : "none";
            emptyEl.style.display = visibleEntries.length ? "none" : "block";
            scheduleVirtualRender(true);
        };

        const refreshDebounced = debounce(() => refreshResults(true), 40, false);

        // ── ResizeObserver ──
        let viewportH = 0;
        if (typeof ResizeObserver !== "undefined") {
            this.ro = new ResizeObserver(entries => {
                viewportH = entries[0].contentRect.height;
                scheduleVirtualRender();
            });
            this.ro.observe(viewportEl);
        }

        // ── Event listeners ───────────────────────────────────────────────────
        inputEl.addEventListener("input", () => { query = inputEl.value; selectedIndex = 0; refreshDebounced(); });
        inputEl.addEventListener("keydown", (e) => {
            if (!visibleEntries.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(selectedIndex + 1, true); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(selectedIndex - 1, true); }
            else if (e.key === "Enter") { e.preventDefault(); const sel = visibleEntries[selectedIndex]; if (sel) openEntry(sel); }
        });
        typeButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new TypePickerModal(this.app, this.plugin.getTypeOptions(), new Set(selectedTypes), (keys) => {
                selectedTypes = keys; updateTypeButton(); selectedIndex = 0; refreshResults(true);
                saveSearchState();
            }).open();
        });
        sourceButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new SourcePickerModal(this.app, this.plugin, () => this.plugin.getSourceOptions(), new Set(selectedSources), (keys) => {
                selectedSources = keys; updateSourceButton(); selectedIndex = 0; refreshResults(true);
                saveSearchState();
            }).open();
        });
        sortSelectEl.addEventListener("change", () => {
            sortMode = sortSelectEl.value;
            refreshResults(false);
            saveSearchState();
        });
        bookmarksBtn.addEventListener("click", () => {
            showBookmarks = !showBookmarks;
            updateBookmarksButton(); selectedIndex = 0; refreshResults(true);
            saveSearchState();
        });
        manageBtn.addEventListener("click", () => new BookmarkManagerModal(this.app, this.plugin).open());
        clearSrcBtn.addEventListener("click", () => {
            selectedSources = new Set();
            if (presetSelectEl) presetSelectEl.value = "";
            updateSourceButton(); selectedIndex = 0; refreshResults(true);
            saveSearchState();
        });
        presetSelectEl.addEventListener("change", () => {
            const preset = this.plugin.getFilterPresets().find((p) => p.id === presetSelectEl.value);
            if (!preset) return;
            const validSources = new Set(this.plugin.getSourceOptions().map((o) => o.key));
            const validTypes = new Set(this.plugin.getTypeOptions().map((o) => o.key));
            selectedSources = new Set((preset.sources || []).map(normalizeKey).filter((k) => validSources.has(k)));
            selectedTypes = new Set((preset.types || []).map(normalizeKey).filter((k) => validTypes.has(k)));
            updateSourceButton();
            updateTypeButton();
            selectedIndex = 0;
            refreshResults(true);
            saveSearchState();
        });
        spellbookBtn.addEventListener("click", () => this.plugin.openSpellbookModal(getSnapshot()));
        popInBtn.addEventListener("click", () => {
            const snap = Object.assign({}, getSnapshot(), { forceModal: true });
            this.leaf.detach();
            this.plugin.openSearchModal(snap);
        });
        viewportEl.addEventListener("scroll", () => scheduleVirtualRender(), { passive: true });

        if (initialState?.scrollTop) {
            win.requestAnimationFrame(() => win.requestAnimationFrame(() => { viewportEl.scrollTop = initialState.scrollTop; }));
        }

        this.refreshResults = refreshResults;
        updateTypeButton(); updateSourceButton(); updateBookmarksButton();
        refreshResults(false);
        window.setTimeout(() => inputEl.focus(), 0);
    }

}

const TTRPG_BESTIARY_VIEW_TYPE = "ttrpg-bestiary-view";

class TTRPGBestiaryView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.controller = null;
        this.initialState = null;
        this.hoverPopover = null;
    }
    getViewType() { return TTRPG_BESTIARY_VIEW_TYPE; }
    getDisplayText() { return "TTRPG Bestiary"; }
    getIcon() { return "swords"; }
    async onOpen() {
        this.plugin.registerModal(this);
        this.contentEl.empty();
        this.contentEl.addClass("ttrpg-bestiary-popout-view");
        this.contentEl.style.height = "100%";
        this.contentEl.style.overflow = "hidden";

        this.controller = new TTRPGBestiaryController(this.app, this.plugin, {
            containerEl: this.contentEl,
            isPopout: true,
            parentComponent: this,
            onClose: () => {
                this.leaf.detach();
            },
            initialState: this.initialState
        });
        this.controller.build();
    }
    initBestiaryView(initialState) {
        this.initialState = initialState;
        if (this.controller) {
            this.controller.loadState(initialState);
            this.controller.build();
        }
    }
    async onClose() {
        if (this.plugin.settings.saveLastBestiarySearch && this.controller) {
            const snap = this.controller.getStateSnapshot();
            this.plugin._cachedBestiarySearchState = snap;
            this.plugin.settings.lastBestiarySearchState = snap;
            void this.plugin.saveSettings(false);
        }
        if (this.controller) {
            this.controller = null;
        }
        this.plugin.unregisterModal(this);
    }
    handleBookmarksChanged() {
        if (this.controller) this.controller.handleBookmarksChanged();
    }
    refreshFromPlugin() {
        if (this.controller) this.controller.handleBookmarksChanged();
    }
}

class TTRPGSpellbookView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.controller = null;
        this.initialState = null;
        this.hoverPopover = null;
    }
    getViewType() { return TTRPG_SPELLBOOK_VIEW_TYPE; }
    getDisplayText() { return "TTRPG Spellbook"; }
    getIcon() { return "book-open"; }
    async onOpen() {
        this.plugin.registerModal(this);
        this.contentEl.empty();
        this.contentEl.addClass("ttrpg-spellbook-popout-view");
        this.contentEl.style.height = "100%";
        this.contentEl.style.overflow = "hidden";

        this.controller = new TTRPGSpellbookController(this.app, this.plugin, {
            containerEl: this.contentEl,
            isPopout: true,
            parentComponent: this,
            onClose: () => {
                this.leaf.detach();
            },
            initialState: this.initialState
        });
        this.controller.build();
    }
    initSpellbookView(initialState) {
        this.initialState = initialState;
        if (this.controller) {
            this.controller.loadState(initialState);
            this.controller.build();
        }
    }
    async onClose() {
        if (this.plugin.settings.saveLastSpellbookSearch && this.controller) {
            const snap = this.controller.getStateSnapshot();
            this.plugin._cachedSpellbookSearchState = snap;
            this.plugin.settings.lastSpellbookSearchState = snap;
            void this.plugin.saveSettings(false);
        }
        if (this.controller) {
            this.controller.destroy();
            this.controller = null;
        }
        this.plugin.unregisterModal(this);
    }
    handleBookmarksChanged() {
        if (this.controller) this.controller.handleBookmarksChanged();
    }
    refreshFromPlugin() {
        if (this.controller) this.controller.refreshFromPlugin();
    }
}

class TTRPGItemSearchController {
    constructor(app, plugin, options) {
        this.app = app;
        this.plugin = plugin;
        this.containerEl = options.containerEl;
        this.isPopout = options.isPopout || false;
        this.onClose = options.onClose;
        this.parentComponent = options.parentComponent || plugin;
        this.initialState = options.initialState || null;

        this.query = "";
        this.selectedRarities = new Set();
        this.selectedAttunements = new Set();
        this.selectedCategories = new Set();
        this.selectedSources = new Set();
        this.selectedAges = new Set();
        this.selectedTiers = new Set();
        this.minACValue = null;
        this.minRangeValue = null;
        this.sortMode = "name";
        this.showFavoritesOnly = false;
        this.magicOnly = false;
        this.mundaneOnly = false;
        this.selectedIndex = 0;
        this.visibleEntries = [];
        this.renderedItems = new Map();
        this.virtualRenderQueued = false;
        this.sortReverse = false;
        this._openingEntry = false;

        this.refreshResultsDebounced = debounce(() => this.refreshResults(true), 25, false);
    }

    build() {
        this.containerEl.empty();
        this.containerEl.classList.add("ttrpg-vs");

        const toolbarEl = this.containerEl.createDiv({ cls: "ttrpg-vs__toolbar" });

        // ── Search ────────────────────────────────────────────────────────────
        this.inputEl = toolbarEl.createEl("input", { cls: "ttrpg-vs__search" });
        this.inputEl.type = "search";
        this.inputEl.placeholder = "Search items by name, rarity, category…";
        this.inputEl.spellcheck = false;
        this.inputEl.addEventListener("input", () => {
            this.query = this.inputEl.value;
            this.selectedIndex = 0;
            this.refreshResultsDebounced();
        });
        this.inputEl.addEventListener("keydown", (event) => {
            if (!this.visibleEntries.length) return;
            if (event.key === "ArrowDown") { event.preventDefault(); this.setSelectedIndex(this.selectedIndex + 1, true); return; }
            if (event.key === "ArrowUp") { event.preventDefault(); this.setSelectedIndex(this.selectedIndex - 1, true); return; }
            if (event.key === "Enter") {
                event.preventDefault();
                const sel = this.visibleEntries[this.selectedIndex];
                if (sel) void this.openEntry(sel);
            }
        });

        // ── Filters row (6-column grid) ───────────────────────────────────────
        const filtersEl = toolbarEl.createDiv({ cls: "ttrpg-vs__filters ttrpg-item-search__filters" });

        // Rarity
        const rarityWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        rarityWrap.createDiv({ cls: "ttrpg-vs__label", text: "Rarity" });
        this.rarityButtonEl = rarityWrap.createEl("button", { cls: "ttrpg-vs__button" });
        this.rarityButtonEl.type = "button";
        this.rarityButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new SourcePickerModal(this.app, this.plugin, () => this.plugin.getItemRarityOptions(), new Set(this.selectedRarities), (keys) => {
                this.selectedRarities = keys; this.updateRarityButton(); this.selectedIndex = 0; this.refreshResults(true);
            }, "Filter by Rarity").open();
        });

        // Attunement
        const attuneWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        attuneWrap.createDiv({ cls: "ttrpg-vs__label", text: "Attunement" });
        this.attuneButtonEl = attuneWrap.createEl("button", { cls: "ttrpg-vs__button" });
        this.attuneButtonEl.type = "button";
        this.attuneButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new SourcePickerModal(this.app, this.plugin, () => this.plugin.getItemAttunementOptions(), new Set(this.selectedAttunements), (keys) => {
                this.selectedAttunements = keys; this.updateAttunementButton(); this.selectedIndex = 0; this.refreshResults(true);
            }, "Filter by Attunement").open();
        });

        // Category
        const catWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        catWrap.createDiv({ cls: "ttrpg-vs__label", text: "Category" });
        this.catButtonEl = catWrap.createEl("button", { cls: "ttrpg-vs__button" });
        this.catButtonEl.type = "button";
        this.catButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new SourcePickerModal(this.app, this.plugin, () => this.plugin.getItemCategoryOptions(), new Set(this.selectedCategories), (keys) => {
                this.selectedCategories = keys; this.updateCategoryButton(); this.selectedIndex = 0; this.refreshResults(true);
            }, "Filter by Category").open();
        });

        // Source
        const sourceWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        sourceWrap.createDiv({ cls: "ttrpg-vs__label", text: "Source" });
        this.sourceButtonEl = sourceWrap.createEl("button", { cls: "ttrpg-vs__button" });
        this.sourceButtonEl.type = "button";
        this.sourceButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new SourcePickerModal(this.app, this.plugin, () => this._getItemSourceOptions(), new Set(this.selectedSources), (keys) => {
                this.selectedSources = keys; this.updateSourceButton(); this.selectedIndex = 0; this.refreshResults(true);
            }, "Filter by Source").open();
        });

        // Sort
        const sortWrap = filtersEl.createDiv({ cls: "ttrpg-vs__filter" });
        sortWrap.createDiv({ cls: "ttrpg-vs__label", text: "Sort" });

        const sortRow = sortWrap.createDiv({ cls: "ttrpg-vs__sort-row" });
        sortRow.style.display = "flex";
        sortRow.style.gap = "4px";
        sortRow.style.width = "100%";

        this.sortSelectEl = sortRow.createEl("select", { cls: "ttrpg-vs__select" });
        this.sortSelectEl.style.flex = "1";
        [["name", "Name"], ["rarity", "Rarity"], ["category", "Category"], ["source", "Source"]].forEach(([val, lbl]) => {
            const opt = document.createElement("option"); opt.value = val; opt.textContent = lbl; this.sortSelectEl.appendChild(opt);
        });
        this.sortSelectEl.value = this.sortMode;
        this.sortSelectEl.addEventListener("change", () => { this.sortMode = this.sortSelectEl.value; this.refreshResults(false); });

        this.sortReverseBtn = sortRow.createEl("button", {
            cls: "ttrpg-vs__toolbutton",
            text: "⇅",
        });
        this.sortReverseBtn.type = "button";
        this.sortReverseBtn.style.padding = "4px 8px";
        this.sortReverseBtn.style.width = "auto";
        this.sortReverseBtn.style.flexShrink = "0";
        this.sortReverseBtn.title = "Reverse Sort Order";
        this.sortReverseBtn.classList.toggle("is-active", this.sortReverse);
        this.sortReverseBtn.addEventListener("click", () => {
            this.sortReverse = !this.sortReverse;
            this.sortReverseBtn.classList.toggle("is-active", this.sortReverse);
            this.refreshResults(false);
        });

        // Unified button row column
        const buttonRowEl = filtersEl.createDiv({ cls: "ttrpg-vs__button-row" });

        // ★ Favorites toggle
        this.favBtnEl = buttonRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "★ Favorites" });
        this.favBtnEl.type = "button";
        this.favBtnEl.title = "Show only bookmarked items";
        this.favBtnEl.addEventListener("click", () => {
            this.showFavoritesOnly = !this.showFavoritesOnly;
            this.favBtnEl.classList.toggle("is-active", this.showFavoritesOnly);
            this.selectedIndex = 0; this.refreshResults(true);
        });

        // Magic toggle
        this.magicBtnEl = buttonRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Magic" });
        this.magicBtnEl.type = "button";
        this.magicBtnEl.title = "Show only magic items";
        this.magicBtnEl.addEventListener("click", () => {
            this.magicOnly = !this.magicOnly;
            if (this.magicOnly) this.mundaneOnly = false;
            this.magicBtnEl.classList.toggle("is-active", this.magicOnly);
            if (this.mundaneBtnEl) this.mundaneBtnEl.classList.remove("is-active");
            this.selectedIndex = 0; this.refreshResults(true);
        });

        // Mundane toggle
        this.mundaneBtnEl = buttonRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Mundane" });
        this.mundaneBtnEl.type = "button";
        this.mundaneBtnEl.title = "Show only mundane items";
        this.mundaneBtnEl.addEventListener("click", () => {
            this.mundaneOnly = !this.mundaneOnly;
            if (this.mundaneOnly) this.magicOnly = false;
            this.mundaneBtnEl.classList.toggle("is-active", this.mundaneOnly);
            if (this.magicBtnEl) this.magicBtnEl.classList.remove("is-active");
            this.selectedIndex = 0; this.refreshResults(true);
        });

        // Clear all
        this.clearButtonEl = buttonRowEl.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Clear" });
        this.clearButtonEl.type = "button";
        this.clearButtonEl.title = "Clear all filters";
        this.clearButtonEl.addEventListener("click", () => {
            this.selectedRarities = new Set(); this.selectedAttunements = new Set();
            this.selectedCategories = new Set(); this.selectedSources = new Set();
            this.selectedAges = new Set(); this.selectedTiers = new Set();
            this.minACValue = null;
            if (this.acInputEl) this.acInputEl.value = "";
            this.minRangeValue = null;
            if (this.rangeInputEl) this.rangeInputEl.value = "";
            this.showFavoritesOnly = false; this.magicOnly = false; this.mundaneOnly = false;
            this.query = ""; if (this.inputEl) this.inputEl.value = "";
            this.favBtnEl.classList.remove("is-active");
            this.magicBtnEl.classList.remove("is-active");
            this.mundaneBtnEl.classList.remove("is-active");
            this.updateRarityButton(); this.updateAttunementButton(); this.updateCategoryButton(); this.updateSourceButton();
            this.updateAgeButton(); this.updateTierButton();
            this.selectedIndex = 0; this.refreshResults(true);
        });

        const doc = this.containerEl.ownerDocument;
        const itemPresetSelect = buttonRowEl.createEl("select", { cls: "ttrpg-vs__select" });
        itemPresetSelect.style.width = "auto";
        itemPresetSelect.appendChild(Object.assign(doc.createElement("option"), { value: "", textContent: "Preset…" }));
        for (const preset of this.plugin.getFilterPresets()) {
            const opt = doc.createElement("option");
            opt.value = preset.id;
            opt.textContent = preset.name;
            itemPresetSelect.appendChild(opt);
        }
        itemPresetSelect.addEventListener("change", () => {
            const preset = this.plugin.getFilterPresets().find((p) => p.id === itemPresetSelect.value);
            if (!preset) return;
            const validSources = new Set(this._getItemSourceOptions().map((o) => o.key));
            this.selectedSources = new Set((preset.sources || []).map(normalizeKey).filter((k) => validSources.has(k)));
            this.updateSourceButton();
            this.selectedIndex = 0;
            this.refreshResults(true);
        });

        if (!this.isPopout) {
            const popoutBtn = buttonRowEl.createEl("button", {
                cls: "ttrpg-vs__toolbutton",
                text: "⤢ Pop-out",
            });
            popoutBtn.type = "button";
            popoutBtn.title = "Open Item Search in a pop-out window";
            popoutBtn.addEventListener("click", async () => {
                const snap = this.getStateSnapshot();
                snap.isPopout = true;
                if (this.onClose) this.onClose();
                await this.plugin.openItemSearchPopout(snap);
            });
        } else {
            const popinBtn = buttonRowEl.createEl("button", {
                cls: "ttrpg-vs__toolbutton",
                text: "⤡ Pop-in",
            });
            popinBtn.type = "button";
            popinBtn.title = "Move Item Search back to main window";
            popinBtn.addEventListener("click", () => {
                const snap = this.getStateSnapshot();
                snap.forceModal = true;
                snap.isPopout = false;
                if (this.onClose) this.onClose();
                this.plugin.openItemSearchModal(snap);
            });
        }

        // ── Advanced collapsible filters ──────────────────────────────────────
        this.advancedDetailsEl = this.containerEl.createEl("details", { cls: "ttrpg-vs__advanced-details" });
        const advancedSummaryEl = this.advancedDetailsEl.createEl("summary", { cls: "ttrpg-vs__advanced-summary" });
        advancedSummaryEl.setText("⚙️ More Filters");
        
        const advancedContentEl = this.advancedDetailsEl.createDiv({ cls: "ttrpg-vs__advanced-content" });

        // Age filter wrap
        this.ageFilterWrapEl = advancedContentEl.createDiv({ cls: "ttrpg-vs__filter" });
        this.ageFilterWrapEl.createDiv({ cls: "ttrpg-vs__label", text: "Age" });
        this.ageButtonEl = this.ageFilterWrapEl.createEl("button", { cls: "ttrpg-vs__button" });
        this.ageButtonEl.type = "button";
        this.ageButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new SourcePickerModal(this.app, this.plugin, () => this.plugin.getItemAgeOptions(), new Set(this.selectedAges), (keys) => {
                this.selectedAges = keys; this.updateAgeButton(); this.selectedIndex = 0; this.refreshResults(true);
            }, "Filter by Age").open();
        });

        // Tier filter wrap
        this.tierFilterWrapEl = advancedContentEl.createDiv({ cls: "ttrpg-vs__filter" });
        this.tierFilterWrapEl.createDiv({ cls: "ttrpg-vs__label", text: "Tier" });
        this.tierButtonEl = this.tierFilterWrapEl.createEl("button", { cls: "ttrpg-vs__button" });
        this.tierButtonEl.type = "button";
        this.tierButtonEl.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            new SourcePickerModal(this.app, this.plugin, () => this.plugin.getItemTierOptions(), new Set(this.selectedTiers), (keys) => {
                this.selectedTiers = keys; this.updateTierButton(); this.selectedIndex = 0; this.refreshResults(true);
            }, "Filter by Tier").open();
        });

        // AC filter wrap
        this.acFilterWrapEl = advancedContentEl.createDiv({ cls: "ttrpg-vs__filter" });
        this.acFilterWrapEl.createDiv({ cls: "ttrpg-vs__label", text: "Min AC" });
        this.acInputEl = this.acFilterWrapEl.createEl("input", { cls: "ttrpg-vs__input" });
        this.acInputEl.type = "number";
        this.acInputEl.placeholder = "Any";
        this.acInputEl.min = "0";
        this.acInputEl.max = "30";
        this.acInputEl.addEventListener("input", () => {
            const val = parseInt(this.acInputEl.value, 10);
            this.minACValue = isNaN(val) ? null : val;
            this.selectedIndex = 0;
            this.refreshResultsDebounced();
        });

        // Range filter wrap
        this.rangeFilterWrapEl = advancedContentEl.createDiv({ cls: "ttrpg-vs__filter" });
        this.rangeFilterWrapEl.createDiv({ cls: "ttrpg-vs__label", text: "Min Range (ft)" });
        this.rangeInputEl = this.rangeFilterWrapEl.createEl("input", { cls: "ttrpg-vs__input" });
        this.rangeInputEl.type = "number";
        this.rangeInputEl.placeholder = "Any";
        this.rangeInputEl.min = "0";
        this.rangeInputEl.addEventListener("input", () => {
            const val = parseInt(this.rangeInputEl.value, 10);
            this.minRangeValue = isNaN(val) ? null : val;
            this.selectedIndex = 0;
            this.refreshResultsDebounced();
        });

        // ── Results area ──────────────────────────────────────────────────────
        this.statsEl = this.containerEl.createDiv({ cls: "ttrpg-vs__stats" });
        this.viewportEl = this.containerEl.createDiv({ cls: "ttrpg-vs__viewport" });
        this.canvasEl = this.viewportEl.createDiv({ cls: "ttrpg-vs__canvas" });
        this.emptyEl = this.viewportEl.createDiv({ cls: "ttrpg-vs__empty" });
        this.emptyEl.setText("No items found. Try adjusting filters or rebuilding the index.");
        this.viewportEl.addEventListener("scroll", () => this.scheduleVirtualRender(), { passive: true });
        this._vpHeight = 0;
        if (typeof ResizeObserver !== "undefined") {
            this._viewportRO = new ResizeObserver(entries => {
                if (entries[0] && this.viewportEl) {
                    this._vpHeight = entries[0].contentRect.height;
                    this.scheduleVirtualRender();
                }
            });
            this._viewportRO.observe(this.viewportEl);
        }

        this.applyInitialState();
        this.updateRarityButton(); this.updateAttunementButton(); this.updateCategoryButton(); this.updateSourceButton();
        this.refreshResults(false);
        window.setTimeout(() => { if (this.inputEl) this.inputEl.focus(); }, 0);
    }

    destroy() {
        if (this._viewportRO) { this._viewportRO.disconnect(); this._viewportRO = null; }
        this.renderedItems.clear();
        this.containerEl.empty();
    }

    applyInitialState() {
        if (!this.initialState) return;
        this.query = this.initialState.query || "";
        if (this.inputEl) this.inputEl.value = this.query;
        if (Array.isArray(this.initialState.selectedRarities)) this.selectedRarities = new Set(this.initialState.selectedRarities);
        if (Array.isArray(this.initialState.selectedAttunements)) this.selectedAttunements = new Set(this.initialState.selectedAttunements);
        if (Array.isArray(this.initialState.selectedCategories)) this.selectedCategories = new Set(this.initialState.selectedCategories);
        if (Array.isArray(this.initialState.selectedSources)) this.selectedSources = new Set(this.initialState.selectedSources);
        if (Array.isArray(this.initialState.selectedAges)) this.selectedAges = new Set(this.initialState.selectedAges);
        if (Array.isArray(this.initialState.selectedTiers)) this.selectedTiers = new Set(this.initialState.selectedTiers);
        
        this.minACValue = this.initialState.minACValue !== undefined ? this.initialState.minACValue : null;
        if (this.acInputEl) this.acInputEl.value = this.minACValue != null ? String(this.minACValue) : "";

        this.minRangeValue = this.initialState.minRangeValue !== undefined ? this.initialState.minRangeValue : null;
        if (this.rangeInputEl) this.rangeInputEl.value = this.minRangeValue != null ? String(this.minRangeValue) : "";

        if (this.initialState.sortMode) { this.sortMode = this.initialState.sortMode; if (this.sortSelectEl) this.sortSelectEl.value = this.sortMode; }
        if (this.initialState.showFavoritesOnly) { this.showFavoritesOnly = true; if (this.favBtnEl) this.favBtnEl.classList.add("is-active"); }
        if (this.initialState.magicOnly) { this.magicOnly = true; if (this.magicBtnEl) this.magicBtnEl.classList.add("is-active"); }
        if (this.initialState.mundaneOnly) { this.mundaneOnly = true; if (this.mundaneBtnEl) this.mundaneBtnEl.classList.add("is-active"); }
        this.sortReverse = !!this.initialState.sortReverse;
        if (this.sortReverseBtn) this.sortReverseBtn.classList.toggle("is-active", this.sortReverse);
        if (this.initialState.scrollTop) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (this.viewportEl) this.viewportEl.scrollTop = this.initialState.scrollTop;
            }));
        }
    }

    loadState(state) {
        this.initialState = state;
        this.applyInitialState();
    }

    getStateSnapshot() {
        return {
            mode: "item-search",
            isPopout: this.isPopout,
            query: this.query,
            selectedRarities: Array.from(this.selectedRarities),
            selectedAttunements: Array.from(this.selectedAttunements),
            selectedCategories: Array.from(this.selectedCategories),
            selectedSources: Array.from(this.selectedSources),
            selectedAges: Array.from(this.selectedAges),
            selectedTiers: Array.from(this.selectedTiers),
            minACValue: this.minACValue,
            minRangeValue: this.minRangeValue,
            sortMode: this.sortMode,
            sortReverse: this.sortReverse,
            showFavoritesOnly: this.showFavoritesOnly,
            magicOnly: this.magicOnly,
            mundaneOnly: this.mundaneOnly,
            scrollTop: this.viewportEl ? this.viewportEl.scrollTop : 0,
        };
    }

    refreshFromPlugin() {
        this.updateRarityButton(); this.updateAttunementButton(); this.updateCategoryButton(); this.updateSourceButton();
        this.updateAgeButton(); this.updateTierButton();
        this.refreshResults(false);
    }

    handleBookmarksChanged() { this.refreshResults(false); }

    _getItemSourceOptions() {
        return this.plugin._getItemSourceOptions();
    }

    updateRarityButton() {
        const opts = this.plugin.getItemRarityOptions();
        const valid = new Set(opts.map((o) => o.key));
        for (const k of [...this.selectedRarities]) { if (!valid.has(k)) this.selectedRarities.delete(k); }
        if (this.selectedRarities.size === 0) { this.rarityButtonEl.textContent = "All rarities"; this.rarityButtonEl.classList.remove("is-active"); }
        else { const n = this.selectedRarities.size; this.rarityButtonEl.textContent = `${n} rarities`; this.rarityButtonEl.classList.add("is-active"); }
    }

    updateAttunementButton() {
        const opts = this.plugin.getItemAttunementOptions();
        const valid = new Set(opts.map((o) => o.key));
        for (const k of [...this.selectedAttunements]) { if (!valid.has(k)) this.selectedAttunements.delete(k); }
        if (this.selectedAttunements.size === 0) { this.attuneButtonEl.textContent = "All attunement"; this.attuneButtonEl.classList.remove("is-active"); }
        else { const n = this.selectedAttunements.size; this.attuneButtonEl.textContent = `${n} attunements`; this.attuneButtonEl.classList.add("is-active"); }
    }

    updateCategoryButton() {
        const opts = this.plugin.getItemCategoryOptions();
        const valid = new Set(opts.map((o) => o.key));
        for (const k of [...this.selectedCategories]) { if (!valid.has(k)) this.selectedCategories.delete(k); }
        if (this.selectedCategories.size === 0) { this.catButtonEl.textContent = "All categories"; this.catButtonEl.classList.remove("is-active"); }
        else { const n = this.selectedCategories.size; this.catButtonEl.textContent = `${n} categories`; this.catButtonEl.classList.add("is-active"); }
    }

    updateSourceButton() {
        const opts = this._getItemSourceOptions();
        const valid = new Set(opts.map((o) => o.key));
        for (const k of [...this.selectedSources]) { if (!valid.has(k)) this.selectedSources.delete(k); }
        if (this.selectedSources.size === 0) { this.sourceButtonEl.textContent = "All sources"; this.sourceButtonEl.classList.remove("is-active"); }
        else { const n = this.selectedSources.size; this.sourceButtonEl.textContent = `${n} source${n !== 1 ? "s" : ""}`; this.sourceButtonEl.classList.add("is-active"); }
    }

    updateAgeButton() {
        const opts = this.plugin.getItemAgeOptions();
        const valid = new Set(opts.map((o) => o.key));
        for (const k of [...this.selectedAges]) { if (!valid.has(k)) this.selectedAges.delete(k); }
        if (this.selectedAges.size === 0) { this.ageButtonEl.textContent = "All ages"; this.ageButtonEl.classList.remove("is-active"); }
        else { const n = this.selectedAges.size; this.ageButtonEl.textContent = `${n} ages`; this.ageButtonEl.classList.add("is-active"); }
    }

    updateTierButton() {
        const opts = this.plugin.getItemTierOptions();
        const valid = new Set(opts.map((o) => o.key));
        for (const k of [...this.selectedTiers]) { if (!valid.has(k)) this.selectedTiers.delete(k); }
        if (this.selectedTiers.size === 0) { this.tierButtonEl.textContent = "All tiers"; this.tierButtonEl.classList.remove("is-active"); }
        else { const n = this.selectedTiers.size; this.tierButtonEl.textContent = `${n} tiers`; this.tierButtonEl.classList.add("is-active"); }
    }

    refreshResults(resetScroll) {
        const titleOnly = !!this.plugin.settings.searchTitleOnly;
        let entries = this.plugin.getItemEntries();
        const total = entries.length;

        if (this.showFavoritesOnly) {
            entries = entries.filter((e) => this.plugin.isItemBookmarked(e.path));
        }

        // Apply primary filters
        entries = entries.filter((entry) => {
            const im = entry.itemMeta;
            if (this.selectedRarities.size > 0 && (!im || !im._normalizedRarityKey || !this.selectedRarities.has(im._normalizedRarityKey))) return false;
            if (this.selectedAttunements.size > 0 && (!im || !im._normalizedAttunementKey || !this.selectedAttunements.has(im._normalizedAttunementKey))) return false;
            if (this.selectedCategories.size > 0 && (!im || !im._normalizedCategoriesKeys || !im._normalizedCategoriesKeys.some((c) => this.selectedCategories.has(c)))) return false;
            if (this.selectedSources.size > 0 && !this.selectedSources.has(entry.sourceKey)) return false;
            if (this.magicOnly && im?.isMagic !== true) return false;
            if (this.mundaneOnly && im?.isMagic === true) return false;
            return true;
        });

        // Check which advanced filters are relevant based on remaining candidates
        const hasACItems = entries.some(e => e.itemMeta?.ac != null);
        const hasRangeItems = entries.some(e => e.itemMeta?.normalRange != null || e.itemMeta?.longRange != null);
        const hasAgeItems = entries.some(e => e.itemMeta?.age);
        const hasTierItems = entries.some(e => e.itemMeta?.tier);

        // Hide/show advanced elements
        if (this.acFilterWrapEl) this.acFilterWrapEl.style.display = hasACItems ? "flex" : "none";
        if (this.rangeFilterWrapEl) this.rangeFilterWrapEl.style.display = hasRangeItems ? "flex" : "none";
        if (this.ageFilterWrapEl) this.ageFilterWrapEl.style.display = hasAgeItems ? "flex" : "none";
        if (this.tierFilterWrapEl) this.tierFilterWrapEl.style.display = hasTierItems ? "flex" : "none";

        const hasAnyAdvanced = hasACItems || hasRangeItems || hasAgeItems || hasTierItems;
        if (this.advancedDetailsEl) this.advancedDetailsEl.style.display = hasAnyAdvanced ? "block" : "none";

        // Apply advanced filters
        if (hasACItems && this.minACValue != null) {
            entries = entries.filter(e => e.itemMeta?.ac != null && e.itemMeta.ac >= this.minACValue);
        }
        if (hasRangeItems && this.minRangeValue != null) {
            entries = entries.filter(e => e.itemMeta?.normalRange != null && e.itemMeta.normalRange >= this.minRangeValue);
        }
        if (hasAgeItems && this.selectedAges.size > 0) {
            entries = entries.filter(e => e.itemMeta?.age && this.selectedAges.has(normalizeKey(e.itemMeta.age)));
        }
        if (hasTierItems && this.selectedTiers.size > 0) {
            entries = entries.filter(e => e.itemMeta?.tier && this.selectedTiers.has(normalizeKey(e.itemMeta.tier)));
        }

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

        entries = this._sortItemEntries(entries, titleOnly, preScored);
        if (this.sortReverse) {
            entries.reverse();
        }
        this.visibleEntries = entries.slice(0, this.plugin.settings.maxResults);

        if (!this.visibleEntries.length) this.selectedIndex = 0;
        else this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, this.visibleEntries.length - 1));

        if (resetScroll && this.viewportEl) this.viewportEl.scrollTop = 0;

        const favCount = this.plugin.getItemBookmarkedPaths().length;
        const favLabel = favCount > 0 ? ` • ★ ${favCount} saved` : "";
        this.statsEl.textContent = `${entries.length} matching • ${this.visibleEntries.length} shown • ${total} total${favLabel}`;
        this.canvasEl.style.height = `${this.visibleEntries.length * RESULT_ROW_HEIGHT}px`;
        this.canvasEl.style.display = this.visibleEntries.length ? "block" : "none";
        this.emptyEl.style.display = this.visibleEntries.length ? "none" : "block";
        this.scheduleVirtualRender(true);
    }

    _compareByMode(a, b) {
        switch (this.sortMode) {
            case "rarity": {
                const getRarityWeight = (rarity) => {
                    if (!rarity) return 0;
                    const r = normalizeKey(rarity);
                    if (r === "none") return 0;
                    if (r === "common") return 1;
                    if (r === "uncommon") return 2;
                    if (r === "rare") return 3;
                    if (r === "very rare" || r === "veryrare") return 4;
                    if (r === "legendary") return 5;
                    if (r === "artifact") return 6;
                    if (r.startsWith("unknown")) return 7;
                    if (r === "varies") return 8;
                    return 9;
                };
                const wa = getRarityWeight(a.itemMeta?.rarity);
                const wb = getRarityWeight(b.itemMeta?.rarity);
                return wa - wb || COLLATOR.compare(a.displayName, b.displayName);
            }
            case "category": {
                const ca = (a.itemMeta?.categories || []).join(", ") || "zzz";
                const cb = (b.itemMeta?.categories || []).join(", ") || "zzz";
                return COLLATOR.compare(ca, cb) || COLLATOR.compare(a.displayName, b.displayName);
            }
            case "source": return COLLATOR.compare(a.sourceLabel || "zzz", b.sourceLabel || "zzz") || COLLATOR.compare(a.displayName, b.displayName);
            default: return COLLATOR.compare(a.displayName, b.displayName);
        }
    }

    _sortItemEntries(entries, titleOnly, preScored = null) {
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
        const win = this.containerEl.ownerDocument.defaultView || window;
        win.requestAnimationFrame(() => { this.virtualRenderQueued = false; this.renderVirtualRows(); });
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
        const end = Math.min(this.visibleEntries.length, Math.ceil((sTop + vpH) / RESULT_ROW_HEIGHT) + RESULT_OVERSCAN);

        if (needsFullRebuild) {
            this.renderedItems.clear();
            this.canvasEl.replaceChildren();
        } else {
            for (const [i, el] of this.renderedItems) {
                if (i < start || i >= end) { el.remove(); this.renderedItems.delete(i); }
            }
        }

        const doc = this.containerEl.ownerDocument;
        const frag = doc.createDocumentFragment();
        for (let i = start; i < end; i++) {
            if (this.renderedItems.has(i)) continue;
            const el = this.createItemResultElement(this.visibleEntries[i], i);
            el.style.top = `${i * RESULT_ROW_HEIGHT}px`;
            frag.appendChild(el); this.renderedItems.set(i, el);
        }
        if (frag.childNodes.length) this.canvasEl.appendChild(frag);
    }

    createItemResultElement(entry, index) {
        const doc = this.containerEl.ownerDocument;
        const itemEl = doc.createElement("div");
        itemEl.className = "ttrpg-vs__result";
        if (index === this.selectedIndex) itemEl.classList.add("is-selected");
        itemEl.addEventListener("mouseenter", () => this.setSelectedIndex(index, false));
        itemEl.addEventListener("click", () => void this.openEntry(entry));

        itemEl.addEventListener("contextmenu", async (e) => {
            if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".ttrpg-item__rarity-chip") || e.target.closest(".ttrpg-vs__badge") || e.target.closest(".ttrpg-vs__chip")) {
                return;
            }
            if (this.isPopout) {
                e.preventDefault();
                e.stopPropagation();
                const entries = this.plugin.getReaderEntriesForEntry(entry);
                const initialIndex = Math.max(0, entries.findIndex((candidate) => candidate.path === entry.path));
                const activeLeaf = this.app.workspace.getActiveLeaf();
                try {
                    const leaf = this.app.workspace.getLeaf("tab");
                    await leaf.setViewState({ type: TTRPG_READER_VIEW_TYPE, active: false });
                    if (leaf.view && typeof leaf.view.setReaderState === "function") {
                        leaf.view.setReaderState(entries, initialIndex, this.getStateSnapshot(), "native");
                    }
                    if (activeLeaf) {
                        this.app.workspace.setActiveLeaf(activeLeaf, { focus: true });
                    }
                } catch (err) {
                    console.error("Failed to open item entry in background tab:", err);
                }
            }
        });

        // Ctrl/Cmd-hover: trigger Obsidian native page preview
        const handleHover = (e) => {
            if (e.ctrlKey || e.metaKey) {
                this.plugin.app.workspace.trigger("hover-link", {
                    event: e,
                    source: "search",
                    hoverParent: this.parentComponent,
                    targetEl: itemEl,
                    linktext: entry.path,
                    sourcePath: ""
                });
            }
        };
        itemEl.addEventListener("mouseover", handleHover);
        itemEl.addEventListener("mousemove", handleHover);

        const topEl = doc.createElement("div"); topEl.className = "ttrpg-vs__top";
        const mainEl = doc.createElement("div"); mainEl.className = "ttrpg-vs__main";

        const titleEl = doc.createElement("div"); titleEl.className = "ttrpg-vs__title";
        const nameEl = doc.createElement("span"); nameEl.className = "ttrpg-vs__title-piece ttrpg-vs__title-chapter";
        nameEl.innerHTML = highlightMatch(entry.displayName, this.query);
        titleEl.appendChild(nameEl); mainEl.appendChild(titleEl);

        const metaEl = doc.createElement("div"); metaEl.className = "ttrpg-vs__meta";
        const im = entry.itemMeta;
        if (im?.rarity) {
            const chip = doc.createElement("span");
            const rarityClass = normalizeKey(im.rarity).replace(/\s+/g, "");
            chip.className = `ttrpg-item__rarity-chip ttrpg-item__rarity-${rarityClass}`;
            chip.textContent = im.rarity;
            chip.style.cursor = "pointer"; chip.title = `Filter to ${im.rarity}`;
            chip.addEventListener("click", (e) => {
                e.preventDefault(); e.stopPropagation();
                this.selectedRarities = new Set([normalizeKey(im.rarity)]);
                this.updateRarityButton(); this.selectedIndex = 0; this.refreshResults(true);
            });
            metaEl.appendChild(chip);
        }
        if (im?.attunement) {
            const badge = doc.createElement("button"); badge.type = "button";
            badge.className = "ttrpg-vs__badge ttrpg-vs__badge--clickable";
            
            let attuneText = "Attunement";
            const norm = im.attunement.toLowerCase();
            if (norm === "required" || norm === "yes" || norm === "true") attuneText = "Attunement (Required)";
            else if (norm === "optional") attuneText = "Attunement (Optional)";
            else if (norm === "no" || norm === "none" || norm === "false") attuneText = "Attunement (No)";
            else attuneText = `Attunement (${im.attunement})`;

            badge.textContent = attuneText; badge.title = `Filter by attunement: ${im.attunement}`;
            badge.addEventListener("click", (e) => {
                e.preventDefault(); e.stopPropagation();
                let key = normalizeKey(im.attunement);
                if (key === "none" || key === "false") key = "no";
                this.selectedAttunements = new Set([key]);
                this.updateAttunementButton(); this.selectedIndex = 0; this.refreshResults(true);
            });
            metaEl.appendChild(badge);
        }
        if (entry.sourceLabel) {
            const chip = doc.createElement("button"); chip.type = "button";
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

        const subMetaEl = doc.createElement("div"); subMetaEl.className = "ttrpg-vs__meta-text";
        if (im) {
            const parts = [];
            if (im.categories && im.categories.length) parts.push(im.categories.join(", "));
            if (im.isMagic) parts.push("Magic");
            else parts.push("Mundane");
            subMetaEl.textContent = parts.join(" • ") || (entry.aliases[0] || "");
        } else {
            subMetaEl.textContent = entry.aliases[0] || entry.typeLabel;
        }
        mainEl.appendChild(subMetaEl);

        const rightEl = doc.createElement("div"); rightEl.className = "ttrpg-vs__right";
        const starEl = doc.createElement("button"); starEl.type = "button"; starEl.className = "ttrpg-vs__star";
        const refreshStar = () => {
            const on = this.plugin.isItemBookmarked(entry.path);
            starEl.textContent = on ? "★" : "☆";
            starEl.classList.toggle("is-active", on);
            starEl.title = on ? "Remove from Item Search favorites" : "Add to Item Search favorites";
        };
        refreshStar();
        starEl.addEventListener("click", async (e) => {
            e.preventDefault(); e.stopPropagation();
            await this.plugin.toggleItemBookmark(entry.path);
            refreshStar();
            if (this.showFavoritesOnly) this.refreshResults(false);
        });
        rightEl.appendChild(starEl);

        topEl.appendChild(mainEl); topEl.appendChild(rightEl);
        const pathEl = doc.createElement("div"); pathEl.className = "ttrpg-vs__path";
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
        if (this._openingEntry) return;
        this._openingEntry = true;
        const timeoutId = setTimeout(() => { this._openingEntry = false; }, 1000);
        try {
            await new Promise(resolve => setTimeout(resolve, 50));
            const entries = this.plugin.getReaderEntriesForEntry(entry);
            const idx = Math.max(0, entries.findIndex((e) => e.path === entry.path));
            const snap = this.getStateSnapshot();
            if (this.isPopout) {
                if (this.plugin.settings.openReaderInPopoutByDefault) {
                    await this.plugin.openReaderPopout(entries, idx, snap);
                } else {
                    try {
                        await this.plugin.openReaderNativeTab(entries, idx, snap);
                    } catch (err) {
                        new TTRPGReaderModal(this.app, this.plugin, entries, idx, snap).open();
                    }
                }
            } else {
                // In modal
                if (this.plugin.settings.openReaderInPopoutByDefault) {
                    if (this.onClose) this.onClose();
                    await this.plugin.openReaderPopout(entries, idx, snap);
                } else {
                    const reader = new TTRPGReaderModal(this.app, this.plugin, entries, idx, snap);
                    if (this.onClose) this.onClose();
                    reader.open();
                }
            }
        } finally {
            clearTimeout(timeoutId);
            this._openingEntry = false;
        }
    }
}

class TTRPGItemSearchModal extends Modal {
    constructor(app, plugin, initialState = null) {
        super(app);
        this.plugin = plugin;
        this.initialState = initialState;
        this.controller = null;
        this.hoverPopover = null;
    }

    onOpen() {
        this.plugin.registerModal(this);
        this.modalEl.classList.add("ttrpg-item-search-modal", "ttrpg-vs-modal");
        this.contentEl.empty();
        this.contentEl.classList.add("ttrpg-vs");
        this.titleEl.setText("Item Search");

        this.controller = new TTRPGItemSearchController(this.app, this.plugin, {
            containerEl: this.contentEl,
            isPopout: false,
            parentComponent: this,
            onClose: () => this.close(),
            initialState: this.initialState
        });
        this.controller.build();
    }

    onClose() {
        if (this.plugin.settings.saveLastItemSearch && this.controller) {
            const snap = this.controller.getStateSnapshot();
            this.plugin._cachedItemSearchState = snap;
            this.plugin.settings.lastItemSearchState = snap;
            void this.plugin.saveSettings(false);
        }
        if (this.controller) {
            this.controller.destroy();
            this.controller = null;
        }
        this.plugin.unregisterModal(this);
    }

    handleBookmarksChanged() {
        if (this.controller) {
            this.controller.handleBookmarksChanged();
        }
    }

    refreshFromPlugin() {
        if (this.controller) {
            this.controller.refreshFromPlugin();
        }
    }
}

class TTRPGItemSearchView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.controller = null;
        this.initialState = null;
        this.hoverPopover = null;
    }
    getViewType() { return TTRPG_ITEM_SEARCH_VIEW_TYPE; }
    getDisplayText() { return "TTRPG Item Search"; }
    getIcon() { return "package"; }
    async onOpen() {
        this.plugin.registerModal(this);
        this.contentEl.empty();
        this.contentEl.addClass("ttrpg-item-search-popout-view");
        this.contentEl.style.height = "100%";
        this.contentEl.style.overflow = "hidden";

        this.controller = new TTRPGItemSearchController(this.app, this.plugin, {
            containerEl: this.contentEl,
            isPopout: true,
            parentComponent: this,
            onClose: () => {
                this.leaf.detach();
            },
            initialState: this.initialState
        });
        this.controller.build();
    }
    initItemSearchView(initialState) {
        this.initialState = initialState;
        if (this.controller) {
            this.controller.loadState(initialState);
            this.controller.build();
        }
    }
    async onClose() {
        if (this.plugin.settings.saveLastItemSearch && this.controller) {
            const snap = this.controller.getStateSnapshot();
            this.plugin._cachedItemSearchState = snap;
            this.plugin.settings.lastItemSearchState = snap;
            void this.plugin.saveSettings(false);
        }
        if (this.controller) {
            this.controller.destroy();
            this.controller = null;
        }
        this.plugin.unregisterModal(this);
    }
    handleBookmarksChanged() {
        if (this.controller) this.controller.handleBookmarksChanged();
    }
    refreshFromPlugin() {
        if (this.controller) this.controller.refreshFromPlugin();
    }
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
        const doc = this.contentEl.ownerDocument;
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
                const indicator = doc.createElement("div");
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
        const allEl = doc.createElement("div");
        allEl.className = "ttrpg-vs-bm__group-item" + (this.selectedGroupId === null ? " is-active" : "");
        const allNameEl = doc.createElement("div");
        allNameEl.className = "ttrpg-vs-bm__group-name";
        allNameEl.textContent = "All bookmarks";
        const allCountEl = doc.createElement("div");
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
            const unEl = doc.createElement("div");
            unEl.className = "ttrpg-vs-bm__group-item" + (this.selectedGroupId === "ungrouped" ? " is-active" : "");
            const unNameEl = doc.createElement("div");
            unNameEl.className = "ttrpg-vs-bm__group-name";
            unNameEl.textContent = "Ungrouped";
            const unCountEl = doc.createElement("div");
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
            const groupEl = doc.createElement("div");
            groupEl.className = "ttrpg-vs-bm__group-item" + (this.selectedGroupId === group.id ? " is-active" : "");

            // Drag handle
            const handleEl = doc.createElement("div");
            handleEl.className = "ttrpg-vs-bm__drag-handle";
            handleEl.textContent = "⠿";
            handleEl.title = "Drag to reorder";
            groupEl.appendChild(handleEl);

            const nameEl = doc.createElement("div");
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

            const countEl = doc.createElement("div");
            countEl.className = "ttrpg-vs-bm__group-count";
            countEl.textContent = String(count);

            const deleteEl = doc.createElement("button");
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
        const doc = this.contentEl.ownerDocument;
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
            const emptyEl = doc.createElement("div");
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
                const indicator = doc.createElement("div");
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

        const fragment = doc.createDocumentFragment();

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

            const entryEl = doc.createElement("div");
            entryEl.className = "ttrpg-vs-bm__entry";

            // Drag handle (all single-group views)
            if (isDraggable) {
                const handleEl = doc.createElement("div");
                handleEl.className = "ttrpg-vs-bm__drag-handle";
                handleEl.textContent = "⠿";
                handleEl.title = "Drag to reorder";
                entryEl.appendChild(handleEl);
            }

            const infoEl = doc.createElement("div");
            infoEl.className = "ttrpg-vs-bm__entry-info";

            const nameEl = doc.createElement("div");
            nameEl.className = "ttrpg-vs-bm__entry-name";
            nameEl.contentEditable = "false";
            nameEl.title = "Double-click to rename bookmark visually";
            
            const displayText = entry
                ? (entry.collectionName && entry.collectionPath === path
                    ? `${entry.displayName} (${entry.typeLabel})`
                    : (entry.collectionName ? `${entry.collectionName} – ${entry.displayName}` : entry.displayName))
                : path.split("/").pop().replace(/\.md$/i, "");
            nameEl.textContent = displayText;

            const defaultEditText = entry ? entry.displayName : path.split("/").pop().replace(/\.md$/i, "");
            nameEl.addEventListener("dblclick", () => {
                nameEl.contentEditable = "true";
                nameEl.textContent = defaultEditText;
                nameEl.focus();
                const sel = window.getSelection();
                if (sel) sel.selectAllChildren(nameEl);
                nameEl.addEventListener("blur", async () => {
                    nameEl.contentEditable = "false";
                    const newName = (nameEl.textContent || "").trim();
                    const originalName = entry ? (entry.originalDisplayName || entry.displayName) : path.split("/").pop().replace(/\.md$/i, "");
                    if (newName === "") {
                        await this.plugin.setBookmarkDisplayName(path, null);
                    } else if (newName && newName !== originalName) {
                        await this.plugin.setBookmarkDisplayName(path, newName);
                    } else {
                        this.renderBookmarks();
                    }
                }, { once: true });
                nameEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        nameEl.blur();
                    }
                });
            });

            const metaEl = doc.createElement("div");
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
            const selectEl = doc.createElement("select");
            selectEl.className = "ttrpg-vs-bm__entry-select";

            const noneOpt = doc.createElement("option");
            noneOpt.value = "";
            noneOpt.textContent = "Ungrouped";
            selectEl.appendChild(noneOpt);

            for (const group of groups) {
                const opt = doc.createElement("option");
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

        const doc = this.contentEl.ownerDocument;
        if (!filtered.length) {
            const emptyEl = doc.createElement("div");
            emptyEl.className = "ttrpg-vs__empty";
            emptyEl.textContent = "No matching types.";
            this.listEl.appendChild(emptyEl);
            return;
        }

        const fragment = doc.createDocumentFragment();

        filtered.forEach((option) => {
            const labelEl = doc.createElement("label");
            labelEl.className = "ttrpg-vs-type__item";

            const checkboxEl = doc.createElement("input");
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

            const nameEl = doc.createElement("span");
            nameEl.className = "ttrpg-vs-source__name";
            nameEl.textContent = option.label;

            const countEl = doc.createElement("span");
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
        const renderList = () => { this.selectedType = typeSelect.value || "Any"; const query = input.value.trim(); const entries = this.plugin.getTTRPGSearchButtonCandidates(this.selectedType, query).slice(0, 40); list.replaceChildren(); for (const item of entries) { const btn = document.createElement("button"); btn.type = "button"; btn.className = "ttrpg-vs-source__item"; const name = item.label; const nameEl = btn.createDiv({ cls: "ttrpg-vs-source__name", text: name }); nameEl.title = name; const metaText = [item.entry.typeLabel, item.entry.sourceLabel].filter(Boolean).join(" • "); const metaEl = btn.createDiv({ cls: "ttrpg-vs-source__count", text: metaText }); metaEl.title = metaText; btn.addEventListener("click", () => { setTypeFromEntry(item.entry); this.selectedName = name; input.value = name; chapterInput.value = ""; this.selectedChapter = ""; this.selectedChapterPath = ""; renderChapterList(); renderPreview(); }); list.appendChild(btn); } renderPreview(); };
        const renderChapterList = () => { if (!this.plugin.isTTRPGBookOrAdventureType(this.selectedType) || !(this.selectedName || input.value.trim())) return; const chapterQuery = chapterInput.value.trim(); const chapters = this.plugin.getTTRPGSearchChapterCandidates(this.selectedType, this.selectedName || input.value.trim(), chapterQuery).slice(0, 40); if (!chapterQuery && chapters.length) return; list.replaceChildren(); for (const item of chapters) { const btn = document.createElement("button"); btn.type = "button"; btn.className = "ttrpg-vs-source__item"; const nameEl = btn.createDiv({ cls: "ttrpg-vs-source__name", text: item.label }); nameEl.title = item.path || item.label; btn.createDiv({ cls: "ttrpg-vs-source__count", text: item.path || "Chapter" }); btn.addEventListener("click", () => { chapterInput.value = item.baseLabel || item.label; this.selectedChapter = item.baseLabel || item.label; this.selectedChapterPath = item.path || ""; renderPreview(); }); list.appendChild(btn); } renderPreview(); };
        typeSelect.addEventListener("change", () => { this.selectedType = typeSelect.value || "Any"; this.selectedName = ""; input.value = ""; chapterInput.value = ""; this.selectedChapterPath = ""; renderList(); }); input.addEventListener("input", () => { this.selectedName = input.value.trim(); chapterInput.value = ""; this.selectedChapterPath = ""; renderList(); }); chapterInput.addEventListener("input", () => { this.selectedChapterPath = ""; renderChapterList(); }); colourSelect.addEventListener("change", renderPreview); customColourInput.addEventListener("input", renderPreview); insertBtn.addEventListener("click", () => { const name = this.selectedName || input.value.trim(); if (!name) return; const chapter = chapterInput.value.trim(); const colour = getColour(); const block = "```TTRPG_Search\nType: " + this.selectedType + "\nName: " + name + (chapter ? "\nChapter: " + chapter : "") + (this.selectedChapterPath ? "\nChapterPath: " + this.selectedChapterPath : "") + (colour ? "\nColour: " + colour : "") + "\n```"; this.editor.replaceSelection(block); this.close(); });
        renderList(); window.setTimeout(() => input.focus(), 0);
    }
}

class TTRPGSearchEmbedSuggest extends EditorSuggest {
    constructor(app, plugin) { super(app); this.plugin = plugin; this.context = null; }
    onTrigger(cursor, editor) { const line = editor.getLine(cursor.line).slice(0, cursor.ch); const typeMatch = line.match(/^\s*Type:\s*(.*)$/i); const nameMatch = line.match(/^\s*Name:\s*(.*)$/i); const chapterMatch = line.match(/^\s*Chapter:\s*(.*)$/i); const colourMatch = line.match(/^\s*(?:Colour|Color):\s*(.*)$/i); if (!typeMatch && !nameMatch && !chapterMatch && !colourMatch) return null; let blockHasFence = false; let blockType = "Any"; let blockName = ""; let fenceLine = -1; let typeLine = -1; let chapterPathLine = -1; for (let ln = cursor.line; ln >= Math.max(0, cursor.line - 30); ln--) { const value = editor.getLine(ln); if (/^```TTRPG_Search/i.test(value.trim())) { blockHasFence = true; fenceLine = ln; break; } const foundType = value.match(/^\s*Type:\s*(.+)$/i); if (foundType) { blockType = foundType[1].trim(); typeLine = ln; } const foundName = value.match(/^\s*Name:\s*(.+)$/i); if (foundName) blockName = foundName[1].trim(); if (/^\s*ChapterPath:/i.test(value)) chapterPathLine = ln; } if (!blockHasFence) return null; if (typeMatch) typeLine = cursor.line; const query = (typeMatch ? typeMatch[1] : nameMatch ? nameMatch[1] : chapterMatch ? chapterMatch[1] : colourMatch[1]) || ""; const startCh = cursor.ch - query.length; this.context = { mode: typeMatch ? "type" : nameMatch ? "name" : chapterMatch ? "chapter" : "colour", query, type: blockType, name: blockName, fenceLine, typeLine, chapterPathLine, start: { line: cursor.line, ch: startCh }, end: cursor, editor }; return this.context; }
    getSuggestions(context) { const query = String(context.query || "").trim(); if (context.mode === "colour") return this.plugin.getTTRPGSearchButtonColours().filter((c) => !query || c.label.toLowerCase().includes(query.toLowerCase()) || c.value.toLowerCase().includes(query.toLowerCase())).map((c) => ({ kind: "colour", label: c.label, value: c.value })).slice(0, 30); if (context.mode === "type") return this.plugin.getTTRPGSearchEmbedTypes().filter((t) => !query || t.label.toLowerCase().includes(query.toLowerCase())).slice(0, 30).map((t) => ({ kind: "type", label: t.label })); if (context.mode === "chapter") return this.plugin.getTTRPGSearchChapterCandidates(context.type, context.name, query).slice(0, 30).map((x) => ({ kind: "chapter", label: x.label, entry: x.entry, path: x.path, baseLabel: x.baseLabel, score: x.score })); return this.plugin.getTTRPGSearchButtonCandidates(context.type, query).slice(0, 30).map((x) => ({ kind: "entry", label: x.label, entry: x.entry, score: x.score })); }
    renderSuggestion(item, el) { el.createDiv({ cls: "ttrpg-vs-source__name", text: item.kind === "colour" && item.value ? item.label + " (" + item.value + ")" : item.label }); if (item.path) el.createDiv({ cls: "ttrpg-vs-source__meta", text: item.path }); else if (item.entry) { const meta = [item.entry.typeLabel, item.entry.sourceLabel].filter(Boolean).join(" • "); if (meta) el.createDiv({ cls: "ttrpg-vs-source__meta", text: meta }); } }
    updateTypeLineForEntry(entry) { if (!this.context || !entry || !entry.typeLabel) return; const editor = this.context.editor; const nextTypeLineText = "Type: " + entry.typeLabel; if (this.context.typeLine >= 0) { editor.replaceRange(nextTypeLineText, { line: this.context.typeLine, ch: 0 }, { line: this.context.typeLine, ch: editor.getLine(this.context.typeLine).length }); return; } const insertLine = this.context.fenceLine >= 0 ? this.context.fenceLine + 1 : this.context.start.line; editor.replaceRange(nextTypeLineText + "\n", { line: insertLine, ch: 0 }); }
    updateChapterPathLine(path) { if (!this.context || !path) return; const editor = this.context.editor; const lineText = "ChapterPath: " + path; if (this.context.chapterPathLine >= 0) { editor.replaceRange(lineText, { line: this.context.chapterPathLine, ch: 0 }, { line: this.context.chapterPathLine, ch: editor.getLine(this.context.chapterPathLine).length }); return; } editor.replaceRange("\n" + lineText, this.context.end); }
    selectSuggestion(item) { if (!this.context) return; const replacement = item.kind === "colour" ? (item.value || item.label) : (item.kind === "chapter" ? (item.baseLabel || item.label) : item.label); this.context.editor.replaceRange(replacement, this.context.start, this.context.end); if (this.context.mode === "name" && item.entry) this.updateTypeLineForEntry(item.entry); if (this.context.mode === "chapter" && item.path) this.updateChapterPathLine(item.path); }
}

class TTRPGVaultSearchSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Creates a collapsible settings group (details/summary) with premium styling.
     * @param {HTMLElement} containerEl - Parent container element
     * @param {string} title - Group title
     * @param {string} icon - Emoji icon shown before the title
     * @param {boolean} open - Whether to start expanded
     * @returns {HTMLElement} The inner content div to append settings to
     */
    createSettingsGroup(containerEl, title, icon = "⚙️", open = false) {
        const details = containerEl.createEl("details", { cls: "ttrpg-settings-group" });
        if (open) details.open = true;
        const summary = details.createEl("summary", { cls: "ttrpg-settings-group-title" });
        summary.createSpan({ cls: "ttrpg-settings-group-icon", text: icon });
        summary.createSpan({ text: " " + title });
        const content = details.createDiv({ cls: "ttrpg-settings-group-content" });
        return content;
    }

    renderSourceChipSettings(containerEl) {
        const details = containerEl.createEl("details", { cls: "ttrpg-settings-subdetails" });
        details.createEl("summary", { cls: "ttrpg-settings-subdetails-title", text: "Source chip labels & colours" });
        details.createEl("p", { text: "Collapsed by default because this list can be long. Chip labels are per raw source key, so duplicate visible labels do not merge filters." });
        const options = this.plugin.getSourceOptions();
        if (!options.length) return;
        const managerEl = details.createDiv({ cls: "ttrpg-vs-source-chip-manager" });
        for (const option of options) {
            const data = this.plugin.getSourceChipData(option.key); const row = managerEl.createDiv({ cls: "ttrpg-vs-source-chip-manager__row" }); row.createDiv({ cls: "ttrpg-vs-source-chip-manager__original", text: `${option.rawLabel || option.label} (${option.count})` }); const labelInput = row.createEl("input", { cls: "ttrpg-vs-source-chip-manager__input" }); labelInput.type = "text"; labelInput.value = data.label || option.label; const colorInput = row.createEl("input", { cls: "ttrpg-vs-source-chip-manager__input" }); colorInput.type = "color"; colorInput.value = /^#[0-9a-f]{6}$/i.test(data.color || "") ? data.color : "#7c3aed"; const saveBtn = row.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Save" }); saveBtn.type = "button"; saveBtn.addEventListener("click", async () => { await this.plugin.updateSourceChip(option.key, option.rawLabel || option.label, labelInput.value, colorInput.value); this.display(); }); const resetBtn = row.createEl("button", { cls: "ttrpg-vs__toolbutton", text: "Reset" }); resetBtn.type = "button"; resetBtn.addEventListener("click", async () => { await this.plugin.resetSourceChip(option.key); this.display(); });
        }
    }

    renderExclusionSettings(containerEl) {
        const details = containerEl.createEl("details", { cls: "ttrpg-settings-subdetails" });
        details.createEl("summary", { cls: "ttrpg-settings-subdetails-title", text: "Metadata exclusions (per-modal)" });
        details.createEl("p", {
            text: "Exclude files from specific search modals based on frontmatter property values. " +
                "For example, exclude entries where 'type' is 'NPC' from the Bestiary but keep them in general search."
        });

        // Gather all known frontmatter property keys for suggestions
        const allPropertyKeys = new Set();
        try {
            const allFiles = this.app.vault.getMarkdownFiles();
            for (const file of allFiles) {
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache && cache.frontmatter) {
                    for (const key of Object.keys(cache.frontmatter)) {
                        if (key !== "position") allPropertyKeys.add(key);
                    }
                }
                if (allPropertyKeys.size > 200) break; // cap for performance
            }
        } catch (e) { /* ignore */ }
        const propertySuggestions = [...allPropertyKeys].sort();

        const sections = [
            { key: "searchExclusions", label: "Search modal exclusions" },
            { key: "bestiaryExclusions", label: "Bestiary exclusions" },
            { key: "spellbookExclusions", label: "Spellbook exclusions" },
        ];

        for (const section of sections) {
            const sectionEl = details.createDiv();
            sectionEl.style.cssText = "margin: 12px 0 16px; padding: 10px; border: 1px solid var(--background-modifier-border); border-radius: 8px;";
            sectionEl.createEl("h4", { text: section.label });

            if (!Array.isArray(this.plugin.settings[section.key])) {
                this.plugin.settings[section.key] = [];
            }
            const exclusions = this.plugin.settings[section.key];

            const listEl = sectionEl.createDiv();
            listEl.style.cssText = "display: flex; flex-direction: column; gap: 6px;";

            const renderRows = () => {
                listEl.empty();
                for (let i = 0; i < exclusions.length; i++) {
                    const rule = exclusions[i];
                    const row = listEl.createDiv();
                    row.style.cssText = "display: flex; gap: 6px; align-items: center;";

                    const propInput = row.createEl("input", { attr: { type: "text", placeholder: "property name", list: `ttrpg-excl-props-${section.key}` } });
                    propInput.style.cssText = "flex: 1; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 13px;";
                    propInput.value = rule.property || "";

                    const colonEl = row.createSpan({ text: ":" });
                    colonEl.style.cssText = "font-weight: 700; color: var(--text-muted);";

                    const valInput = row.createEl("input", { attr: { type: "text", placeholder: "value to exclude" } });
                    valInput.style.cssText = "flex: 1; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 13px;";
                    valInput.value = rule.value || "";

                    const saveRule = async () => {
                        rule.property = propInput.value.trim();
                        rule.value = valInput.value.trim();
                        // Clear caches so exclusions take effect immediately
                        this.plugin._bestiaryEntriesCache = null;
                        this.plugin._spellEntriesCache = null;
                        await this.plugin.saveSettings(false);
                    };
                    propInput.addEventListener("change", saveRule);
                    valInput.addEventListener("change", saveRule);

                    const removeBtn = row.createEl("button", { text: "✕" });
                    removeBtn.type = "button";
                    removeBtn.style.cssText = "padding: 2px 8px; border-radius: 6px; cursor: pointer; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-muted); font-size: 14px;";
                    removeBtn.title = "Remove this exclusion";
                    removeBtn.addEventListener("click", async () => {
                        exclusions.splice(i, 1);
                        this.plugin._bestiaryEntriesCache = null;
                        this.plugin._spellEntriesCache = null;
                        await this.plugin.saveSettings(false);
                        renderRows();
                    });
                }
            };

            renderRows();

            // Datalist for property suggestions
            const datalist = sectionEl.createEl("datalist", { attr: { id: `ttrpg-excl-props-${section.key}` } });
            for (const prop of propertySuggestions) {
                datalist.createEl("option", { attr: { value: prop } });
            }

            const addBtn = sectionEl.createEl("button", { text: "+ Add exclusion" });
            addBtn.type = "button";
            addBtn.style.cssText = "margin-top: 6px; padding: 4px 12px; border-radius: 6px; cursor: pointer; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-normal); font-size: 13px;";
            addBtn.addEventListener("click", async () => {
                exclusions.push({ property: "", value: "" });
                await this.plugin.saveSettings(false);
                renderRows();
            });
        }
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        // ── Header ───────────────────────────────────────────────────────────
        const header = containerEl.createDiv({ cls: "ttrpg-settings-header" });
        header.style.cssText = "display:flex;align-items:center;gap:12px;padding:16px 0 8px;margin-bottom:12px;border-bottom:2px solid var(--background-modifier-border);";
        const logo = header.createSpan({ text: "⚔️" });
        logo.style.cssText = "font-size:28px;line-height:1;";
        const headerText = header.createDiv();
        headerText.createEl("h2", { text: "TTRPG Vault Search", cls: "ttrpg-settings-h2" }).style.cssText = "margin:0 0 2px;font-size:20px;";
        headerText.createEl("p", { text: "Configure search, pop-out windows, integrations, encounters, and more.", cls: "ttrpg-settings-subtitle" }).style.cssText = "margin:0;font-size:12px;color:var(--text-muted);";

        // ── 1. Indexing & Search ─────────────────────────────────────────────
        const grpSearch = this.createSettingsGroup(containerEl, "Indexing & Search", "🔍", true);

        new Setting(grpSearch)
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

        new Setting(grpSearch)
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
                const warning = text.inputEl.parentElement || grpSearch;
                const warnEl = document.createElement("div");
                warnEl.style.cssText = "font-size:11px;color:var(--text-warning,#e8a020);max-width:240px;margin-top:4px;";
                warnEl.textContent = "⚠ Values above 500 may cause noticeable lag on large vaults.";
                warning.appendChild(warnEl);
            });

        new Setting(grpSearch)
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

        new Setting(grpSearch)
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

        new Setting(grpSearch)
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

        new Setting(grpSearch)
            .setName("Manual rebuild")
            .setDesc("Force a full reindex of the vault immediately.")
            .addButton((button) => {
                button.setButtonText("Rebuild index").onClick(() => {
                    this.plugin.buildIndex(true);
                });
            });

        // ── 2. Session Restore ───────────────────────────────────────────────
        const grpSession = this.createSettingsGroup(containerEl, "Session Restore", "💾", false);

        new Setting(grpSession)
            .setName("Save last search")
            .setDesc("Re-opening the search modal restores the last query, filters, and scroll position.")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.saveLastSearch).onChange(async (value) => {
                    this.plugin.settings.saveLastSearch = value;
                    if (!value) this.plugin.settings.lastSearchState = null;
                    await this.plugin.saveSettings(false);
                });
            });

        new Setting(grpSession)
            .setName("Save last spellbook search")
            .setDesc("Re-opening the spellbook restores the last query, filters, and scroll position.")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.saveLastSpellbookSearch).onChange(async (value) => {
                    this.plugin.settings.saveLastSpellbookSearch = value;
                    if (!value) this.plugin.settings.lastSpellbookSearchState = null;
                    await this.plugin.saveSettings(false);
                });
            });

        new Setting(grpSession)
            .setName("Save last bestiary search")
            .setDesc("Re-opening the bestiary restores the last query, filters, scroll position, pop-out state, and encounter collapse state.")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.saveLastBestiarySearch).onChange(async (value) => {
                    this.plugin.settings.saveLastBestiarySearch = value;
                    if (!value) this.plugin.settings.lastBestiarySearchState = null;
                    await this.plugin.saveSettings(false);
                });
            });

        new Setting(grpSession)
            .setName("Save last item search")
            .setDesc("Re-opening the item search restores the last query, filters, and scroll position.")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.saveLastItemSearch).onChange(async (value) => {
                    this.plugin.settings.saveLastItemSearch = value;
                    if (!value) this.plugin.settings.lastItemSearchState = null;
                    await this.plugin.saveSettings(false);
                });
            });

        // ── 3. Pop-out Window Settings ───────────────────────────────────────
        const grpPopout = this.createSettingsGroup(containerEl, "Pop-out Window Settings", "🪟", true);

        new Setting(grpPopout)
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

        new Setting(grpPopout)
            .setName("Open search in pop-out by default")
            .setDesc("When enabled, the search command/ribbon opens directly in a pop-out window.")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.openSearchInPopoutByDefault !== false).onChange(async (value) => { this.plugin.settings.openSearchInPopoutByDefault = value; await this.plugin.saveSettings(false); }));

        new Setting(grpPopout)
            .setName("Open reader in pop-out by default")
            .setDesc("When enabled, selecting a result opens the reader in a pop-out window by default.")
            .addToggle((toggle) => toggle.setValue(!!this.plugin.settings.openReaderInPopoutByDefault).onChange(async (value) => { this.plugin.settings.openReaderInPopoutByDefault = value; await this.plugin.saveSettings(false); }));

        new Setting(grpPopout)
            .setName("Open spellbook in pop-out by default")
            .setDesc("When enabled, the spellbook opens directly in a pop-out window.")
            .addToggle((toggle) => toggle.setValue(!!this.plugin.settings.openSpellbookInPopoutByDefault).onChange(async (value) => { this.plugin.settings.openSpellbookInPopoutByDefault = value; await this.plugin.saveSettings(false); }));

        new Setting(grpPopout)
            .setName("Open bestiary in pop-out by default")
            .setDesc("When enabled, the bestiary opens directly in a pop-out window.")
            .addToggle((toggle) => toggle.setValue(!!this.plugin.settings.openBestiaryInPopoutByDefault).onChange(async (value) => { this.plugin.settings.openBestiaryInPopoutByDefault = value; await this.plugin.saveSettings(false); }));

        new Setting(grpPopout)
            .setName("Open item search in pop-out by default")
            .setDesc("When enabled, the item search opens directly in a pop-out window.")
            .addToggle((toggle) => toggle.setValue(!!this.plugin.settings.openItemSearchInPopoutByDefault).onChange(async (value) => { this.plugin.settings.openItemSearchInPopoutByDefault = value; await this.plugin.saveSettings(false); }));

        // ── 4. Integrations ──────────────────────────────────────────────────
        const grpIntegrations = this.createSettingsGroup(containerEl, "Integrations", "🔗", false);

        new Setting(grpIntegrations)
            .setName("Enable Initiative Tracker integration")
            .setDesc("When enabled, integrates with the Initiative Tracker plugin to load saved parties, sync player levels, and launch encounters directly into combat.")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableInitiativeTrackerIntegration !== false)
                    .onChange(async (value) => {
                        this.plugin.settings.enableInitiativeTrackerIntegration = value;
                        await this.plugin.saveSettings(false);
                    });
            });

        new Setting(grpIntegrations)
            .setName("Enable Fantasy Statblocks integration")
            .setDesc("When enabled, reads stats, hit dice, initiative modifiers, and tokens/images from the Fantasy Statblocks bestiary if they are missing from local notes.")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableFantasyStatblocksIntegration !== false)
                    .onChange(async (value) => {
                        this.plugin.settings.enableFantasyStatblocksIntegration = value;
                        await this.plugin.saveSettings(false);
                    });
            });

        // ── 5. Random Encounters ─────────────────────────────────────────────
        const grpEncounters = this.createSettingsGroup(containerEl, "Random Encounters", "🎲", false);

        new Setting(grpEncounters)
            .setName("Random encounter minimum CR")
            .setDesc("Minimum CR of monsters that can be chosen for random encounters.")
            .addText((text) => {
                text.setPlaceholder("e.g. 1/8")
                    .setValue(this.plugin.settings.randomEncounterMinCR || "")
                    .onChange(async (value) => {
                        this.plugin.settings.randomEncounterMinCR = value.trim();
                        await this.plugin.saveSettings(false);
                    });
            });

        new Setting(grpEncounters)
            .setName("Random encounter maximum CR")
            .setDesc("Maximum CR of monsters that can be chosen for random encounters.")
            .addText((text) => {
                text.setPlaceholder("e.g. 20")
                    .setValue(this.plugin.settings.randomEncounterMaxCR || "")
                    .onChange(async (value) => {
                        this.plugin.settings.randomEncounterMaxCR = value.trim();
                        await this.plugin.saveSettings(false);
                    });
            });

        new Setting(grpEncounters)
            .setName("Random encounter allowed sources")
            .setDesc("Comma-separated source keys to restrict random encounters to. E.g. 'MM, ToB'. Leave empty to use active sidebar filters.")
            .addText((text) => {
                text.setPlaceholder("e.g. MM, VGtM")
                    .setValue(this.plugin.settings.randomEncounterSources || "")
                    .onChange(async (value) => {
                        this.plugin.settings.randomEncounterSources = value.trim();
                        await this.plugin.saveSettings(false);
                    });
            });

        // ── 6. Source Filtering & Presets ────────────────────────────────────
        const grpSources = this.createSettingsGroup(containerEl, "Source Filtering & Presets", "📚", false);

        new Setting(grpSources)
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

        new Setting(grpSources)
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

        new Setting(grpSources)
            .setName("Apply forced source overrides")
            .setDesc("Rebuild the index after editing forced source override rules. This avoids rebuilding the whole vault on every keystroke.")
            .addButton((button) => button.setButtonText("Apply / rebuild index").onClick(async () => {
                await this.plugin.saveSettings(true);
                new Notice("Forced source overrides applied.");
            }));

        new Setting(grpSources)
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

        new Setting(grpSources)
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

        // ── 7. Source Chips & Exclusions ─────────────────────────────────────
        const grpChips = this.createSettingsGroup(containerEl, "Source Chip Customisation", "🏷️", false);
        this.renderSourceChipSettings(grpChips);

        const grpExclusions = this.createSettingsGroup(containerEl, "Metadata Exclusion Rules", "🚫", false);
        this.renderExclusionSettings(grpExclusions);

        // ── 8. Backups & Restoration ─────────────────────────────────────────
        const grpBackup = this.createSettingsGroup(containerEl, "Settings Backups & Restoration", "☁️", false);

        new Setting(grpBackup)
            .setName("Settings backups")
            .setDesc("Back up TTRPG Search settings/bookmarks/source customisations to a vault folder outside the plugin folder. These backups are intended to survive plugin corruption or replacement.")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.settingsBackupEnabled !== false).onChange(async (value) => {
                this.plugin.settings.settingsBackupEnabled = value;
                await this.plugin.saveSettings(false);
            }));

        new Setting(grpBackup)
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

        new Setting(grpBackup)
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

        new Setting(grpBackup)
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
    }
}

module.exports = TTRPGVaultSearchPlugin;
