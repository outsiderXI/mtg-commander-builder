const SCRYFALL_NAMED = "https://api.scryfall.com/cards/named?exact=";
const SCRYFALL_AUTOCOMPLETE = "https://api.scryfall.com/cards/autocomplete?q=";
const SCRYFALL_COLLECTION = "https://api.scryfall.com/cards/collection";
const EDHREC_BASE = "https://json.edhrec.com/pages/commanders/";
const EDHREC_CORS_PROXIES = [
  (url) => url,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://cors.isomorphic-git.org/${url}`
];
const SCRYFALL_CARD_SEARCH = "https://scryfall.com/search?q=!";

const commanderInput = document.getElementById("commanderInput");
const autocompleteList = document.getElementById("autocompleteList");
const generateBtn = document.getElementById("generateBtn");
const copyExportBtn = document.getElementById("copyExportBtn");

const commanderImage = document.getElementById("commanderImage");
const commanderMeta = document.getElementById("commanderMeta");
const commanderImageSkeleton = document.getElementById("commanderImageSkeleton");
const colorPips = document.getElementById("colorPips");
const toast = document.getElementById("toast");
const deckStats = document.getElementById("deckStats");

const cardCache = new Map();

let autocompleteTimer = null;
let activeAutocompleteIndex = -1;
let currentAutocompleteItems = [];
let toastTimer = null;
let currentBuildMode = "balanced";
let currentRunContext = null;

const BASIC_LANDS = [
  { name: "Plains", colorsProduced: ["W"] },
  { name: "Island", colorsProduced: ["U"] },
  { name: "Swamp", colorsProduced: ["B"] },
  { name: "Mountain", colorsProduced: ["R"] },
  { name: "Forest", colorsProduced: ["G"] },
  { name: "Wastes", colorsProduced: [] }
];

const COLOR_TO_BASIC = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest"
};

const TRIBAL_TYPES = [
  "angel", "artifact creature", "bear", "bird", "cat", "cleric", "demon", "devil",
  "dinosaur", "dragon", "drake", "druid", "elf", "faerie", "goblin", "human",
  "hydra", "knight", "merfolk", "pirate", "rat", "samurai", "shaman", "sliver",
  "snake", "soldier", "spirit", "treefolk", "vampire", "warlock", "warrior",
  "wizard", "wolf", "zombie"
];

const GAME_CHANGERS = new Set([
  "ad nauseam",
  "ancient tomb",
  "aura shards",
  "biorhythm",
  "bolas's citadel",
  "braids, cabal minion",
  "chrome mox",
  "coalition victory",
  "consecrated sphinx",
  "crop rotation",
  "cyclonic rift",
  "demonic tutor",
  "drannith magistrate",
  "enlightened tutor",
  "farewell",
  "field of the dead",
  "fierce guardianship",
  "force of will",
  "gaea's cradle",
  "gamble",
  "gifts ungiven",
  "glacial chasm",
  "grand arbiter augustin iv",
  "grim monolith",
  "humility",
  "imperial seal",
  "intuition",
  "jeska's will",
  "lion's eye diamond",
  "mana vault",
  "mishra's workshop",
  "mox diamond",
  "mystical tutor",
  "narset, parter of veils",
  "natural order",
  "necropotence",
  "notion theif",
  "opposition agent",
  "orcish bowmasters",
  "panoptic mirror",
  "rhystic study",
  "seedborn muse",
  "serra's sanctum",
  "smothering tithe",
  "survival of the fittest",
  "teferi's protection",
  "tegrid, god of fright",
  "thassa's oracle",
  "the one ring",
  "the tabernacle of pendrell vale",
  "underworld breach",
  "vampiric tutor",
  "worldly tutor"
]);

generateBtn.addEventListener("click", generateDeck);
copyExportBtn.addEventListener("click", copyMoxfieldExport);
commanderInput.addEventListener("input", onCommanderInput);
commanderInput.addEventListener("keydown", onAutocompleteKeydown);


document.addEventListener("click", (event) => {
  if (!autocompleteList.contains(event.target) && event.target !== commanderInput) {
    hideAutocomplete();
  }
});

const priorityButtonsWrap = document.getElementById("priorityButtons");
if (priorityButtonsWrap) {
  priorityButtonsWrap.addEventListener("click", (event) => {
    const button = event.target.closest(".priority-btn");
    if (!button) return;
    regenerateWithMode(button.dataset.mode);
  });
}

function updatePriorityButtons() {
  document.querySelectorAll(".priority-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === currentBuildMode);
  });
}

function renderPriorityButtons(commanderThemes = []) {
  const wrap = document.getElementById("priorityButtons");
  if (!wrap) return;

  const uniqueThemes = Array.from(new Set((commanderThemes || []).filter(Boolean))).slice(0, 5);
  const sections = [
    {
      title: "Build Style",
      buttons: [
        { mode: "balanced", label: "Balanced" },
        { mode: "fewer-staples", label: "Fewer Staples" }
      ]
    },
    {
      title: "Detected Themes",
      buttons: uniqueThemes.map((theme) => ({
        mode: `theme:${theme}`,
        label: formatThemeLabel(theme)
      }))
    },
    {
      title: "Bracket Target",
      buttons: [1, 2, 3, 4, 5].map((bracket) => ({
        mode: `bracket:${bracket}`,
        label: `Bracket ${bracket}`
      }))
    }
  ].filter((section) => section.buttons.length);

  wrap.innerHTML = sections.map((section) => `
    <div class="priority-section">
      <div class="priority-section-label">${escapeHtml(section.title)}</div>
      <div class="priority-section-buttons">
        ${section.buttons.map((btn) => `
          <button class="priority-btn" data-mode="${escapeHtml(btn.mode)}" type="button">${escapeHtml(btn.label)}</button>
        `).join("")}
      </div>
    </div>
  `).join("");

  updatePriorityButtons();
}

function updateProgress(percent, statusText, subStatus = "") {
  document.getElementById("progressBar").style.width = `${Math.max(0, Math.min(100, percent))}%`;
  document.getElementById("statusText").textContent = statusText;
  document.getElementById("subStatusText").textContent = subStatus;
}

function clearLog() {
  return;
}

function logMessage(message) {
  return;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 1800);
}

function setGenerateEnabled(enabled) {
  generateBtn.disabled = !enabled;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCardName(name) {
  return String(name || "").trim().toLowerCase();
}

function getPrimaryCardName(name) {
  return String(name || "").split("//")[0].trim();
}

function normalizeUnicodeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function cleanCardNameForLookup(name) {
  return normalizeUnicodeName(getPrimaryCardName(name))
    .replace(/’/g, "'")
    .replace(/‘/g, "'")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function encodeCardNameForScryfall(name) {
  return encodeURIComponent(cleanCardNameForLookup(name));
}

function slugifyForEdhrec(name) {
  return cleanCardNameForLookup(name)
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/,/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatThemeLabel(theme) {
  if (!theme) return "";
  return String(theme)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeThemeName(theme) {
  return String(theme || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[\/_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyEdhrecTagCandidate(tag) {
  const value = normalizeThemeName(tag);
  if (!value || value.length < 2 || value.length > 40) return false;
  if (/^[-+]?\d+$/.test(value)) return false;
  if (["creatures","instants","sorceries","artifacts","enchantments","planeswalkers","lands","utility artifacts","utility lands","mana artifacts","top cards","high synergy cards","new cards","game changers","similar commanders","budget","expensive","salt","price","bracket","theme","tribe"].includes(value)) return false;
  return /[a-z]/.test(value);
}

function getThemeAliases(theme) {
  const normalized = normalizeThemeName(theme);
  const aliases = new Set([normalized]);

  const directAliases = {
    "+1/+1 counters": ["counters", "countersmatter"],
    "counters matter": ["counters", "countersmatter"],
    "-1/-1 counters": ["counters"],
    "tokens": ["tokens", "gowide"],
    "sacrifice": ["sacrifice"],
    "aristocrats": ["sacrifice", "tokens", "gowide"],
    "lifegain": ["lifegain"],
    "artifacts": ["artifacts"],
    "enchantress": ["enchantments"],
    "lands matter": ["lands"],
    "landfall": ["lands"],
    "spellslinger": ["spellslinger", "cantrips"],
    "cantrips": ["cantrips", "spellslinger"],
    "wheels": ["wheels"],
    "group hug": ["group hug", "opponent draw"],
    "card draw": ["cantrips"],
    "reanimator": ["reanimator", "graveyard"],
    "graveyard": ["graveyard", "reanimator"],
    "self mill": ["graveyard", "reanimator"],
    "mill": ["graveyard"],
    "blink": ["blink"],
    "voltron": ["voltron"],
    "equipment": ["voltron"],
    "auras": ["voltron"],
    "treasure": ["artifacts", "tokens"],
    "food": ["artifacts", "tokens", "lifegain"],
    "clues": ["artifacts", "tokens"],
    "populate": ["tokens", "gowide"],
    "proliferate": ["counters", "countersmatter"],
    "modified creatures": ["counters", "countersmatter", "voltron"],
    "sagas": ["enchantments"],
    "historic": ["artifacts"],
    "hatebears": ["hatebears"],
    "hydras": ["hydra tribal", "counters"],
    "artificers": ["artificer tribal", "artifacts"],
    "golems": ["golem tribal", "artifacts"],
    "thopters": ["thopter tribal", "artifacts", "tokens"],
    "constructs": ["construct tribal", "artifacts"]
  };

  if (directAliases[normalized]) {
    for (const alias of directAliases[normalized]) aliases.add(alias);
  }

  const singularMap = {
    bears: "bear tribal",
    elves: "elf tribal",
    zombies: "zombie tribal",
    dragons: "dragon tribal",
    vampires: "vampire tribal",
    humans: "human tribal",
    goblins: "goblin tribal",
    angels: "angel tribal",
    cats: "cat tribal",
    merfolk: "merfolk tribal",
    slivers: "sliver tribal",
    demons: "demon tribal",
    faeries: "faerie tribal",
    knights: "knight tribal",
    pirates: "pirate tribal",
    wizards: "wizard tribal",
    spirits: "spirit tribal",
    soldiers: "soldier tribal",
    hydras: "hydra tribal",
    ninjas: "ninja tribal",
    elementals: "elemental tribal",
    shapeshifters: "shapeshifter tribal",
    warriors: "warrior tribal",
    clerics: "cleric tribal",
    dogs: "dog tribal",
    snakes: "snake tribal",
    beasts: "beast tribal",
    wolves: "wolf tribal",
    giants: "giant tribal",
    oozes: "ooze tribal",
    wurms: "wurm tribal",
    frogs: "frog tribal",
    insects: "insect tribal",
    rogues: "rogue tribal",
    spiders: "spider tribal",
    squirrels: "squirrel tribal",
    mutants: "mutant tribal",
    gods: "god tribal",
    dwarves: "dwarf tribal",
    lizards: "lizard tribal",
    rabbits: "rabbit tribal",
    bats: "bat tribal",
    druids: "druid tribal",
    monks: "monk tribal",
    orcs: "orc tribal",
    devils: "devil tribal",
    robots: "robot tribal",
    crabs: "crab tribal",
    phoenixes: "phoenix tribal",
    praetors: "praetor tribal",
    plants: "plant tribal",
    turtles: "turtle tribal",
    archers: "archer tribal",
    illusions: "illusion tribal",
    unicorns: "unicorn tribal",
    monkeys: "monkey tribal",
    avatars: "avatar tribal",
    horses: "horse tribal",
    rebels: "rebel tribal",
    nightmares: "nightmare tribal",
    kithkin: "kithkin tribal",
    griffins: "griffin tribal",
    advisors: "advisor tribal",
    satyrs: "satyr tribal",
    shamans: "shaman tribal",
    foxes: "fox tribal",
    daleks: "dalek tribal",
    atogs: "atog tribal"
  };

  if (singularMap[normalized]) aliases.add(singularMap[normalized]);
  if (normalized.endsWith(" tribal")) aliases.add(normalized);
  return Array.from(aliases);
}

function buildThemeSignalSet(themes) {
  const signals = new Set();
  for (const theme of themes || []) {
    for (const alias of getThemeAliases(theme)) {
      if (alias) signals.add(alias);
    }
  }
  return signals;
}

function commanderHasTheme(commanderThemes, signal) {
  return buildThemeSignalSet(commanderThemes).has(normalizeThemeName(signal));
}

function getCommanderTribalThemes(commanderThemes) {
  const tribal = [];
  const seen = new Set();
  for (const theme of commanderThemes || []) {
    for (const alias of getThemeAliases(theme)) {
      if (alias.endsWith(" tribal") && !seen.has(alias)) {
        seen.add(alias);
        tribal.push(alias);
      }
    }
  }
  return tribal;
}

function extractLikelyTags(value, weights) {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) {
      value.forEach((tag, index) => {
        if (!isLikelyEdhrecTagCandidate(tag)) return;
        const key = normalizeThemeName(tag);
        weights.set(key, Math.max(weights.get(key) || 0, value.length - index));
      });
      return;
    }

    value.forEach((item) => extractLikelyTags(item, weights));
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    const lowerKey = normalizeThemeName(key);

    if (lowerKey.includes("tag") && typeof nested === "string" && isLikelyEdhrecTagCandidate(nested)) {
      const tagKey = normalizeThemeName(nested);
      weights.set(tagKey, Math.max(weights.get(tagKey) || 0, 6));
      continue;
    }

    if (lowerKey.includes("tag") && Array.isArray(nested) && nested.every((item) => typeof item === "string")) {
      nested.forEach((tag, index) => {
        if (!isLikelyEdhrecTagCandidate(tag)) return;
        const tagKey = normalizeThemeName(tag);
        weights.set(tagKey, Math.max(weights.get(tagKey) || 0, nested.length - index + 2));
      });
      continue;
    }

    if (lowerKey.includes("tag") && Array.isArray(nested)) {
      nested.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const label = item.name || item.label || item.tag || item.value || item.header;
        if (!isLikelyEdhrecTagCandidate(label)) return;
        const count = Number(item.count || item.num_decks || item.decks || item.value_count || 0);
        const score = count > 0 ? count : Math.max(1, nested.length - index + 1);
        const tagKey = normalizeThemeName(label);
        weights.set(tagKey, Math.max(weights.get(tagKey) || 0, score));
      });
    }

    extractLikelyTags(nested, weights);
  }
}

function extractEdhrecTagsFromData(data) {
  const weights = new Map();
  extractLikelyTags(data, weights);
  return Array.from(weights.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 5);
}


function getCardText(card) {
  return String(card?.text ?? card?.oracle_text ?? card?.rawText ?? "").toLowerCase();
}

function getCardType(card) {
  return String(card?.type ?? card?.type_line ?? card?.rawType ?? "").toLowerCase();
}

function sanitizeCard(card) {
  if (!card) return null;
  const type = getCardType(card);
  const text = getCardText(card);
  return {
    ...card,
    type,
    text,
    rawType: card.rawType ?? card.type_line ?? card.type ?? "",
    rawText: card.rawText ?? card.oracle_text ?? card.text ?? ""
  };
}

function sanitizeDeckCards(deck) {
  return (deck || []).map(sanitizeCard).filter(Boolean);
}

function getCardImageUrl(card) {
  if (!card) return "";

  if (card.imageUrl) return String(card.imageUrl);
  if (card.image_uris?.normal) return String(card.image_uris.normal);
  if (card.image_uris?.large) return String(card.image_uris.large);

  if (Array.isArray(card.card_faces)) {
    for (const face of card.card_faces) {
      if (face?.image_uris?.normal) return String(face.image_uris.normal);
      if (face?.image_uris?.large) return String(face.image_uris.large);
    }
  }

  if (card.image) return String(card.image);

  return "";
}

function renderPreviewCardLink(cardName, scryfallUrl, imageUrl) {
  const safeName = escapeHtml(cardName || "Unknown Card");
  const safeUrl = escapeHtml(scryfallUrl || "#");
  const safeImage = escapeHtml(imageUrl || "");
  const safeCardName = escapeHtml(cardName || "");

  return `
    <span class="preview-card-link-wrap">
      <a
        class="preview-card-link"
        href="${safeUrl}"
        target="_blank"
        rel="noopener noreferrer"
        data-card-name="${safeCardName}"
        ${safeImage ? `data-card-image="${safeImage}"` : ""}
      >
        ${safeName}
      </a>
    </span>
  `;
}

let hoverPreviewEl = null;
let hoverImageCache = new Map();
let previewHoverBound = false;

function ensureHoverPreview() {
  if (hoverPreviewEl) return hoverPreviewEl;

  hoverPreviewEl = document.createElement("div");
  hoverPreviewEl.className = "card-hover-preview";
  hoverPreviewEl.innerHTML = `<img alt="Card preview" />`;
  document.body.appendChild(hoverPreviewEl);

  return hoverPreviewEl;
}

function moveCardHoverPreview(mouseEvent) {
  if (!hoverPreviewEl) return;

  const padding = 18;
  const width = hoverPreviewEl.offsetWidth || 265;
  const height = hoverPreviewEl.offsetHeight || 370;

  let left = mouseEvent.clientX + 18;
  let top = mouseEvent.clientY + 18;

  if (left + width > window.innerWidth - padding) {
    left = mouseEvent.clientX - width - 18;
  }

  if (top + height > window.innerHeight - padding) {
    top = window.innerHeight - height - padding;
  }

  if (top < padding) top = padding;
  if (left < padding) left = padding;

  hoverPreviewEl.style.left = `${left}px`;
  hoverPreviewEl.style.top = `${top}px`;
}

function showCardHoverPreview(imageUrl, mouseEvent) {
  if (!imageUrl || window.innerWidth <= 900) return;

  const el = ensureHoverPreview();
  const img = el.querySelector("img");
  if (img.getAttribute("src") !== imageUrl) {
    img.setAttribute("src", imageUrl);
  }

  moveCardHoverPreview(mouseEvent);
  el.classList.add("visible");
}

async function resolveHoverImageUrl(link) {
  const inlineImage = link.getAttribute("data-card-image") || "";
  if (inlineImage) return inlineImage;

  const cardName = (link.getAttribute("data-card-name") || "").trim();
  if (!cardName) return "";

  if (hoverImageCache.has(cardName)) {
    return hoverImageCache.get(cardName);
  }

  try {
    const response = await fetchWithRetry(`${SCRYFALL_NAMED}${encodeURIComponent(cardName)}`);
    if (!response.ok) throw new Error(`Failed to fetch image for ${cardName}`);
    const data = await response.json();
    const imageUrl = getCardImageUrl(data);
    hoverImageCache.set(cardName, imageUrl || "");
    if (imageUrl) {
      link.setAttribute("data-card-image", imageUrl);
    }
    return imageUrl || "";
  } catch (error) {
    console.warn("Unable to fetch hover image", cardName, error);
    hoverImageCache.set(cardName, "");
    return "";
  }
}

function hideCardHoverPreview() {
  if (!hoverPreviewEl) return;
  hoverPreviewEl.classList.remove("visible");
}

function bindPreviewHoverImages() {
  if (previewHoverBound) return;

  const preview = document.getElementById("exportPreview");
  if (!preview) return;

  preview.addEventListener("mouseover", async (event) => {
    const link = event.target.closest(".preview-card-link");
    if (!link || !preview.contains(link)) return;

    const imageUrl = await resolveHoverImageUrl(link);
    if (!imageUrl) return;
    if (!link.matches(":hover")) return;

    showCardHoverPreview(imageUrl, event);
  });

  preview.addEventListener("mousemove", (event) => {
    const link = event.target.closest(".preview-card-link");
    if (!link || !preview.contains(link)) return;
    moveCardHoverPreview(event);
  });

  preview.addEventListener("mouseout", (event) => {
    const fromLink = event.target.closest(".preview-card-link");
    if (!fromLink) return;

    const toElement = event.relatedTarget;
    if (toElement && fromLink.contains(toElement)) return;

    hideCardHoverPreview();
  });

  window.addEventListener("scroll", hideCardHoverPreview, { passive: true });
  window.addEventListener("blur", hideCardHoverPreview);
  previewHoverBound = true;
}


function renderLoadingState() {
  const preview = document.getElementById("exportPreview");

  if (deckStats) {
    deckStats.innerHTML = `
      <div class="stat-skeleton-row">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-pill"></div>
      </div>
      <div class="stat-grid">
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
      </div>
    `;
  }

  if (preview) {
    preview.innerHTML = `
      <div class="preview-section fade-up">
        <div class="skeleton skeleton-section-title"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line short"></div>
      </div>
      <div class="preview-section fade-up">
        <div class="skeleton skeleton-section-title"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line short"></div>
      </div>
    `;
  }
}

function renderPreviewEmptyState(message = "Build a deck to see the grouped preview.") {
  const preview = document.getElementById("exportPreview");
  if (!preview) return;
  preview.innerHTML = `
    <div class="empty-state-card fade-up">
      <div class="empty-state-icon">🃏</div>
      <div class="empty-state-title">Nothing to preview yet</div>
      <div class="empty-state-copy">${escapeHtml(message)}</div>
    </div>
  `;
}

function renderPreviewErrorState(message = "Something went wrong while preparing the preview.") {
  const preview = document.getElementById("exportPreview");
  if (!preview) return;
  preview.innerHTML = `
    <div class="error-state-card fade-up">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-title">Preview failed</div>
      <div class="empty-state-copy">${escapeHtml(message)}</div>
    </div>
  `;
}

function getDeckTypeBucket(typeLine) {
  const type = String(typeLine || "").toLowerCase();
  if (type.includes("land")) return "Land";
  if (type.includes("creature")) return "Creature";
  if (type.includes("instant")) return "Instant";
  if (type.includes("sorcery")) return "Sorcery";
  if (type.includes("planeswalker")) return "Planeswalker";
  if (type.includes("battle")) return "Other";
  if (type.includes("enchantment")) return "Enchantment";
  if (type.includes("artifact")) return "Artifact";
  return "Other";
}

function countByType(deck) {
  const counts = {
    Land: 0,
    Creature: 0,
    Instant: 0,
    Sorcery: 0,
    Artifact: 0,
    Enchantment: 0,
    Planeswalker: 0,
    Other: 0
  };

  for (const card of deck || []) {
    const bucket = getDeckTypeBucket(card.type || card.type_line || "");
    counts[bucket] += 1;
  }

  return counts;
}

function averageManaValue(deck) {
  const spells = (deck || []).filter((card) => !String(card.type || card.type_line || "").toLowerCase().includes("land"));
  if (!spells.length) return "0";
  const total = spells.reduce((sum, card) => sum + (Number(card.cmc) || Number(card.mana_value) || 0), 0);
  return String(Math.round(total / spells.length));
}

function renderDeckStats(deck, commanderName, bracketInfo) {
  if (!deckStats) return;

  const typeCounts = countByType(deck);
  const total = deck?.length || 0;

  deckStats.innerHTML = `
    <div class="stat-panel-header fade-up">
      <div>
        <div class="eyebrow">Deck Snapshot</div>
        <div class="stat-panel-title">${escapeHtml(commanderName || "Commander Deck")}</div>
      </div>
      <div class="mini-badge">Bracket ${escapeHtml(String(bracketInfo?.bracket ?? "-"))}</div>
    </div>
    <div class="stat-grid">
      <div class="stat-card fade-up"><div class="stat-label">Cards</div><div class="stat-value">${total}</div></div>
      <div class="stat-card fade-up"><div class="stat-label">Lands</div><div class="stat-value">${typeCounts.Land}</div></div>
      <div class="stat-card fade-up"><div class="stat-label">Creatures</div><div class="stat-value">${typeCounts.Creature}</div></div>
      <div class="stat-card fade-up"><div class="stat-label">Avg MV</div><div class="stat-value">${averageManaValue(deck)}</div></div>
    </div>
  `;
}

let manaCurveChartInstance = null;
let typeBreakdownChartInstance = null;

function renderManaCurve(deck) {
  const canvas = document.getElementById("manaCurveChart");
  if (!canvas || typeof Chart === "undefined") return;

  const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const card of deck || []) {
    const typeLine = String(card.type || card.type_line || "").toLowerCase();
    if (typeLine.includes("land")) continue;
    const mv = Number(card.cmc) || Number(card.mana_value) || 0;
    const index = Math.min(Math.floor(mv), 7);
    buckets[index] += 1;
  }

  if (manaCurveChartInstance) manaCurveChartInstance.destroy();

  manaCurveChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["0", "1", "2", "3", "4", "5", "6", "7+"],
      datasets: [{ label: "Cards", data: buckets, borderRadius: 8, maxBarThickness: 36 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 650 },
      plugins: { legend: { display: false } },
      layout: { padding: 8 },
      scales: {
        x: { ticks: { color: "#cbd5e1" }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { beginAtZero: true, ticks: { precision: 0, color: "#cbd5e1" }, grid: { color: "rgba(255,255,255,0.05)" } }
      }
    }
  });
}

function renderTypeBreakdown(deck) {
  const canvas = document.getElementById("typeBreakdownChart");
  if (!canvas || typeof Chart === "undefined") return;

  const counts = countByType(deck);
  const labels = Object.keys(counts).filter((key) => counts[key] > 0);
  const data = labels.map((key) => counts[key]);

  if (typeBreakdownChartInstance) typeBreakdownChartInstance.destroy();

  typeBreakdownChartInstance = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 650 },
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 12, color: "#cbd5e1" }
        }
      },
      cutout: "62%",
      layout: { padding: 8 }
    }
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function renderAutocompleteLoading() {
  autocompleteList.innerHTML = "";
  const div = document.createElement("div");
  div.className = "autocomplete-item";
  div.textContent = "Searching commanders...";
  autocompleteList.appendChild(div);
  autocompleteList.classList.remove("hidden");
}

let autocompleteRequestId = 0;

async function onCommanderInput() {
  const query = commanderInput.value.trim();

  if (autocompleteTimer) clearTimeout(autocompleteTimer);

  if (query.length < 2) {
    hideAutocomplete();
    return;
  }

  const requestId = ++autocompleteRequestId;

  autocompleteTimer = setTimeout(async () => {
    try {
      renderAutocompleteLoading();
      const matches = await fetchCommanderAutocomplete(query);

      if (requestId !== autocompleteRequestId || commanderInput.value.trim() !== query) {
        return;
      }

      renderAutocomplete(matches);

      // Try to refine to legal commanders, but never block showing suggestions.
      try {
        const legalMatches = await filterCommanderAutocomplete(matches);
        if (requestId !== autocompleteRequestId || commanderInput.value.trim() !== query) {
          return;
        }
        if (legalMatches.length) {
          renderAutocomplete(legalMatches);
        }
      } catch (legalityError) {
        console.warn("Commander legality refinement failed; showing raw autocomplete results instead.", legalityError);
      }
    } catch (error) {
      console.error(error);
      hideAutocomplete();
    }
  }, 120);
}

function onAutocompleteKeydown(event) {
  if (autocompleteList.classList.contains("hidden")) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeAutocompleteIndex = Math.min(activeAutocompleteIndex + 1, currentAutocompleteItems.length - 1);
    refreshActiveAutocompleteItem();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeAutocompleteIndex = Math.max(activeAutocompleteIndex - 1, 0);
    refreshActiveAutocompleteItem();
  } else if (event.key === "Enter") {
    if (activeAutocompleteIndex >= 0 && currentAutocompleteItems[activeAutocompleteIndex]) {
      event.preventDefault();
      selectAutocompleteItem(currentAutocompleteItems[activeAutocompleteIndex]);
    }
  } else if (event.key === "Escape") {
    hideAutocomplete();
  }
}

async function fetchCommanderAutocomplete(query) {
  const response = await fetchWithRetry(`${SCRYFALL_AUTOCOMPLETE}${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error("Autocomplete request failed.");
  const data = await response.json();
  return Array.isArray(data.data) ? data.data.slice(0, 12) : [];
}

async function filterCommanderAutocomplete(items) {
  if (!items.length) return [];
  const cardMap = await fetchCardDataBatchWithProgress(items);
  const legal = [];

  for (const name of items) {
    const card = cardMap.get(normalizeCardName(name));
    if (card && canBeCommander(card)) legal.push(card.name);
  }

  return legal;
}

function renderAutocomplete(items) {
  currentAutocompleteItems = items;
  activeAutocompleteIndex = -1;
  autocompleteList.innerHTML = "";

  if (!items.length) {
    const div = document.createElement("div");
    div.className = "autocomplete-item";
    div.textContent = "No legal commanders found";
    autocompleteList.appendChild(div);
    autocompleteList.classList.remove("hidden");
    return;
  }

  items.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "autocomplete-item";
    div.textContent = item;
    div.dataset.index = String(index);
    div.addEventListener("click", () => selectAutocompleteItem(item));
    autocompleteList.appendChild(div);
  });

  autocompleteList.classList.remove("hidden");
}

function refreshActiveAutocompleteItem() {
  const items = autocompleteList.querySelectorAll(".autocomplete-item");
  items.forEach((el) => el.classList.remove("active"));
  if (activeAutocompleteIndex >= 0 && items[activeAutocompleteIndex]) {
    items[activeAutocompleteIndex].classList.add("active");
  }
}

function selectAutocompleteItem(name) {
  commanderInput.value = name;
  hideAutocomplete();
}

function hideAutocomplete() {
  autocompleteList.classList.add("hidden");
  autocompleteList.innerHTML = "";
  currentAutocompleteItems = [];
  activeAutocompleteIndex = -1;
}

function isBasicLand(name) {
  const normalized = normalizeCardName(name);
  return BASIC_LANDS.some((land) => normalizeCardName(land.name) === normalized);
}

function hasOwnedCard(collectionData, cardName) {
  const normalized = normalizeCardName(cardName);
  return collectionData.byNormalized.has(normalized) || isBasicLand(cardName);
}

async function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r?\n/).filter(Boolean);

        if (lines.length < 2) throw new Error("CSV file appears to be empty.");

        const header = splitCsvLine(lines[0]).map((x) => x.trim().toLowerCase());
        const nameIndex = header.findIndex((h) => h === "name");
        const qtyIndex = header.findIndex((h) => h === "quantity");

        if (nameIndex === -1 || qtyIndex === -1) {
          throw new Error("CSV must contain Name and Quantity columns.");
        }

        const byNormalized = new Map();
        const originals = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = splitCsvLine(lines[i]);
          if (!cols.length) continue;

          const rawName = (cols[nameIndex] || "").trim();
          const rawQty = (cols[qtyIndex] || "").trim();
          if (!rawName) continue;

          const quantity = Number.parseInt(rawQty, 10);
          if (!Number.isFinite(quantity) || quantity <= 0) continue;

          const normalizedName = normalizeCardName(rawName);
          byNormalized.set(normalizedName, (byNormalized.get(normalizedName) || 0) + quantity);
          originals.push({ rawName, normalizedName, quantity });
        }

        resolve({ byNormalized, originals });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Failed to read CSV file."));
    reader.readAsText(file);
  });
}

async function fetchWithRetry(url, options = {}, retryCount = 1, timeoutMs = 15000) {
  let lastError = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < retryCount) await sleep(250 * (attempt + 1));
    }
  }

  throw lastError || new Error(`Network request failed for ${url}`);
}

function buildEdhrecCommanderUrls(commanderName) {
  const primaryName = getPrimaryCardName(commanderName);
  const slug = toEdhrecSlug(primaryName);
  const baseUrls = [
    `${EDHREC_BASE}${slug}.json`,
    `${EDHREC_BASE}${slug}/${slug}.json`
  ];

  return baseUrls.flatMap((baseUrl) => EDHREC_CORS_PROXIES.map((proxyFactory) => proxyFactory(baseUrl)));
}

function toEdhrecSlug(name) {
  return slugifyForEdhrec(name);
}

function pickCommanderImage(data) {
  if (data.image_uris?.normal) return data.image_uris.normal;
  if (Array.isArray(data.card_faces)) {
    for (const face of data.card_faces) {
      if (face.image_uris?.normal) return face.image_uris.normal;
    }
  }
  return "";
}

async function fetchScryfallCardByName(cardName) {
  const cleaned = cleanCardNameForLookup(cardName);
  if (!cleaned) throw new Error("Missing card name for Scryfall lookup.");

  let response = await fetchWithRetry(`${SCRYFALL_NAMED}${encodeCardNameForScryfall(cleaned)}`);
  if (response.ok) return await response.json();

  response = await fetchWithRetry(`https://api.scryfall.com/cards/named?fuzzy=${encodeCardNameForScryfall(cleaned)}`);
  if (response.ok) return await response.json();

  throw new Error(`Scryfall lookup failed for ${cardName}`);
}

async function fetchEdhrecCommanderJson(commanderName) {
  const urls = buildEdhrecCommanderUrls(commanderName);
  let lastError = null;

  for (const url of urls) {
    try {
      const response = await fetchWithRetry(url, {}, 1, 12000);
      if (response.ok) {
        return await response.json();
      }
      lastError = new Error(`EDHREC request returned ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
      console.warn("EDHREC fetch failed", url, error);
    }
  }

  throw lastError || new Error(`Failed to fetch EDHREC commander data for ${commanderName}.`);
}

function convertScryfallCard(data) {
  const producedMana =
    Array.isArray(data.produced_mana) ? data.produced_mana :
    Array.isArray(data.color_identity) ? data.color_identity :
    [];

  return {
    name: data.name,
    type: String(data.type_line || "").toLowerCase(),
    rawType: String(data.type_line || ""),
    text: String(data.oracle_text || "").toLowerCase(),
    rawText: String(data.oracle_text || ""),
    cmc: Number(data.cmc || 0),
    colors: Array.isArray(data.color_identity) ? data.color_identity : [],
    layout: String(data.layout || "").toLowerCase(),
    legalities: data.legalities || {},
    producedMana,
    imageUrl: pickCommanderImage(data),
    manaCost: String(data.mana_cost || ""),
    scryfallUrl: data.scryfall_uri || "",
    raw: data
  };
}

async function getCommander(name) {
  try {
    const data = await fetchScryfallCardByName(name);
    return convertScryfallCard(data);
  } catch (error) {
    console.warn("Commander lookup failed", name, error);
    return null;
  }
}

async function getEDHREC(commanderName) {
  const data = await fetchEdhrecCommanderJson(commanderName);
  const cardlists = data?.container?.json_dict?.cardlists;
  if (!Array.isArray(cardlists)) throw new Error("Unexpected EDHREC response format.");

  const deduped = new Map();

  for (const section of cardlists) {
    const cards = Array.isArray(section.cardviews) ? section.cardviews : [];
    for (const card of cards) {
      if (!card?.name) continue;
      const key = normalizeCardName(card.name);
      if (!deduped.has(key)) {
        deduped.set(key, {
          name: card.name,
          synergy: Number(card.synergy || 0),
          decks: Number(card.num_decks || 0),
          label: section.header || ""
        });
      }
    }
  }

  const tags = extractEdhrecTagsFromData(data);
  const typeAverages = extractEdhrecTypeAverages(data);
  const roleTargets = extractEdhrecRoleTargets(data, tags);

  return {
    cards: Array.from(deduped.values()),
    tags,
    typeAverages,
    roleTargets
  };
}

function parseEdhrecSectionAverage(section) {
  const numericCandidates = [
    section?.avg,
    section?.average,
    section?.count,
    section?.total,
    section?.num_cards,
    section?.numCards,
    section?.cards,
    section?.amount
  ];

  for (const candidate of numericCandidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return Math.round(candidate);
    }
  }

  const textCandidates = [section?.header, section?.value, section?.title, section?.label, section?.tag]
    .filter(Boolean)
    .map(String);

  for (const candidate of textCandidates) {
    const match = candidate.match(/(\d{1,2})/);
    if (match) return Number(match[1]);
  }

  if (Array.isArray(section?.cardviews) && section.cardviews.length) {
    return section.cardviews.length;
  }

  return null;
}

function extractEdhrecTypeAverages(data) {
  const typeKeyMap = {
    creature: "Creature",
    creatures: "Creature",
    instant: "Instant",
    instants: "Instant",
    sorcery: "Sorcery",
    sorceries: "Sorcery",
    artifact: "Artifact",
    artifacts: "Artifact",
    enchantment: "Enchantment",
    enchantments: "Enchantment",
    planeswalker: "Planeswalker",
    planeswalkers: "Planeswalker",
    land: "Land",
    lands: "Land"
  };

  const counts = {};

  function addCount(key, value) {
    const bucket = typeKeyMap[normalizeThemeName(key)];
    const numeric = Number(value);
    if (!bucket || !Number.isFinite(numeric) || numeric < 0) return;
    counts[bucket] = Math.max(counts[bucket] || 0, Math.round(numeric));
  }

  function visit(node, depth = 0) {
    if (!node || depth > 6) return;

    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }

    if (typeof node !== "object") return;

    const keys = Object.keys(node);
    const hasTypeShape = keys.some((key) => typeKeyMap[normalizeThemeName(key)]);
    if (hasTypeShape) {
      for (const [key, value] of Object.entries(node)) addCount(key, value);
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object") visit(value, depth + 1);
    }
  }

  visit(data?.container?.json_dict || data);

  const cardlists = data?.container?.json_dict?.cardlists;
  if (Array.isArray(cardlists)) {
    for (const section of cardlists) {
      const labelCandidates = [section?.header, section?.value, section?.title, section?.label, section?.tag]
        .filter(Boolean)
        .map((value) => normalizeThemeName(String(value)));

      let bucket = null;
      for (const label of labelCandidates) {
        if (typeKeyMap[label]) {
          bucket = typeKeyMap[label];
          break;
        }
      }
      if (!bucket) continue;

      const average = parseEdhrecSectionAverage(section);
      if (!average && average !== 0) continue;
      counts[bucket] = Math.max(counts[bucket] || 0, Math.round(average));
    }
  }

  return Object.keys(counts).length ? counts : null;
}

function extractEdhrecRoleTargets(data, edhrecTags = []) {
  const cardlists = data?.container?.json_dict?.cardlists;
  const roleMatchers = {
    ramp: ["ramp", "mana ramp", "mana rocks", "mana dorks", "acceleration", "treasure"],
    draw: ["card draw", "draw", "advantage", "cantrips", "wheel", "wheels"],
    removal: ["removal", "spot removal", "interaction", "counterspells", "counterspells", "control"],
    wipe: ["board wipes", "board wipe", "sweepers", "sweeper", "wraths", "wrath"]
  };

  const counts = {};

  if (Array.isArray(cardlists)) {
    for (const section of cardlists) {
      const labelCandidates = [section?.header, section?.value, section?.title, section?.label, section?.tag]
        .filter(Boolean)
        .map((value) => normalizeThemeName(String(value)));

      let matchedRole = null;
      for (const label of labelCandidates) {
        for (const [role, patterns] of Object.entries(roleMatchers)) {
          if (patterns.some((pattern) => label.includes(pattern))) {
            matchedRole = role;
            break;
          }
        }
        if (matchedRole) break;
      }
      if (!matchedRole) continue;

      const average = parseEdhrecSectionAverage(section);
      if (!average) continue;
      if (!counts[matchedRole] || average > counts[matchedRole]) counts[matchedRole] = average;
    }
  }

  const themeSignals = buildThemeSignalSet(edhrecTags);
  const defaults = {
    ramp: 10,
    draw: 10,
    removal: 8,
    wipe: 3
  };

  const adjusted = {
    ramp: counts.ramp ?? defaults.ramp,
    draw: counts.draw ?? defaults.draw,
    removal: counts.removal ?? defaults.removal,
    wipe: counts.wipe ?? defaults.wipe
  };

  if (themeSignals.has("spellslinger") || themeSignals.has("cantrips")) {
    adjusted.draw += 2;
    adjusted.removal += 1;
  }
  if (themeSignals.has("group hug") || themeSignals.has("opponent draw") || themeSignals.has("wheels")) {
    adjusted.draw += 2;
  }
  if (themeSignals.has("artifacts") || themeSignals.has("treasure") || themeSignals.has("lands") || themeSignals.has("landfall")) {
    adjusted.ramp += 1;
  }
  if (themeSignals.has("sacrifice") || themeSignals.has("aristocrats") || themeSignals.has("graveyard") || themeSignals.has("reanimator")) {
    adjusted.draw += 1;
    adjusted.removal += 1;
  }
  if (themeSignals.has("tokens") || themeSignals.has("gowide") || themeSignals.has("voltron")) {
    adjusted.removal += 1;
    adjusted.wipe = Math.max(adjusted.wipe - 1, 2);
  }
  if (themeSignals.has("counters") || themeSignals.has("countersmatter") || themeSignals.has("lifegain")) {
    adjusted.draw += 1;
  }

  return Object.fromEntries(
    Object.entries(adjusted).map(([role, value]) => {
      const minimum = role === "wipe" ? 2 : role === "removal" ? 6 : 8;
      const maximum = role === "wipe" ? 5 : 14;
      return [role, Math.max(minimum, Math.min(maximum, Math.round(Number(value) || defaults[role])))];
    })
  );
}

function buildTypeTargetPlan(edhrecTypeAverages, strategyProfile, targetLandCount, commanderThemes = []) {
  const themeSignals = buildThemeSignalSet(commanderThemes);
  const requestedLandCount = Math.max(32, Math.min(40, Math.round(Number(edhrecTypeAverages?.Land) || targetLandCount)));
  const targetNonlandCount = 99 - requestedLandCount;

  const defaults = {
    Creature: strategyProfile.wantsCreatures
      ? (strategyProfile.wantsTribal || strategyProfile.wantsGoWide ? 26 : 20)
      : 12,
    Instant: strategyProfile.wantsCantrips ? 10 : 7,
    Sorcery: strategyProfile.wantsCantrips ? 11 : 8,
    Artifact: themeSignals?.has?.("artifacts") ? 11 : 7,
    Enchantment: themeSignals?.has?.("enchantments") ? 10 : 5,
    Planeswalker: 1
  };

  const buckets = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker"];
  const raw = Object.fromEntries(
    buckets.map((bucket) => {
      const value = Number(edhrecTypeAverages?.[bucket]);
      return [bucket, Number.isFinite(value) && value >= 0 ? value : defaults[bucket]];
    })
  );

  let totalRaw = buckets.reduce((sum, bucket) => sum + (raw[bucket] || 0), 0);
  if (totalRaw <= 0) totalRaw = buckets.reduce((sum, bucket) => sum + defaults[bucket], 0);

  const scaled = {};
  let assigned = 0;
  for (const bucket of buckets) {
    const exact = ((raw[bucket] || defaults[bucket]) / totalRaw) * targetNonlandCount;
    scaled[bucket] = Math.max(bucket === "Planeswalker" ? 0 : 1, Math.round(exact));
    assigned += scaled[bucket];
  }

  const preferenceOrder = ["Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker"];
  while (assigned < targetNonlandCount) {
    for (const bucket of preferenceOrder) {
      scaled[bucket] += 1;
      assigned += 1;
      if (assigned >= targetNonlandCount) break;
    }
  }
  while (assigned > targetNonlandCount) {
    for (const bucket of ["Planeswalker", "Sorcery", "Instant", "Enchantment", "Artifact", "Creature"]) {
      const minimumFloor = bucket === "Creature"
        ? Math.max(8, strategyProfile.wantsCreatures ? 14 : 8)
        : bucket === "Planeswalker" ? 0 : 1;
      if (scaled[bucket] > minimumFloor) {
        scaled[bucket] -= 1;
        assigned -= 1;
      }
      if (assigned <= targetNonlandCount) break;
    }
  }

  const plan = {};
  for (const bucket of buckets) {
    const target = scaled[bucket];
    const flex = bucket === "Planeswalker" ? 1 : 2;
    const minimumFloor = bucket === "Creature"
      ? Math.max(8, strategyProfile.wantsCreatures ? 14 : 8)
      : bucket === "Planeswalker" ? 0 : 1;
    plan[bucket] = {
      target,
      min: Math.max(minimumFloor, target - flex),
      max: target + flex
    };
  }

  return {
    landCount: requestedLandCount,
    nonlandCount: targetNonlandCount,
    buckets: plan
  };
}

function canAddCardForTypePlan(card, deck, typePlan, strict = true) {
  const planBuckets = typePlan?.buckets || typePlan || {};
  const bucket = getDeckTypeBucket(card.type || card.type_line || "");
  if (!planBuckets[bucket]) return true;
  const counts = countByType(deck);
  const limit = strict ? planBuckets[bucket].max : planBuckets[bucket].max + 2;
  return counts[bucket] < limit;
}

function getCardsNeededForTypeMinimums(deck, typePlan) {
  const planBuckets = typePlan?.buckets || typePlan || {};
  const counts = countByType(deck);
  const needed = [];
  for (const [bucket, rule] of Object.entries(planBuckets)) {
    const deficit = Math.max(0, (rule?.min || 0) - (counts[bucket] || 0));
    for (let i = 0; i < deficit; i++) needed.push(bucket);
  }
  return needed;
}

function getTypePlanBucketNeed(deck, typePlan, bucket) {
  const planBuckets = typePlan?.buckets || typePlan || {};
  const counts = countByType(deck);
  const rule = planBuckets[bucket];
  if (!rule) return 0;
  return Math.max(0, (rule.target || 0) - (counts[bucket] || 0));
}

function getRoleCounts(deck) {
  return {
    ramp: deck.filter((card) => card.role === "ramp").length,
    draw: deck.filter((card) => card.role === "draw").length,
    removal: deck.filter((card) => card.role === "removal").length,
    wipe: deck.filter((card) => card.role === "wipe").length
  };
}

function pickBestCardForBucket(pool, usedNames, commanderName, bucket) {
  const normalizedCommander = normalizeCardName(commanderName);
  for (const card of pool) {
    const key = normalizeCardName(card.name);
    if (usedNames.has(key) || key === normalizedCommander) continue;
    if (getDeckTypeBucket(card.type || card.type_line || "") !== bucket) continue;
    return card;
  }
  return null;
}

function chooseBestFlexibleCard(pool, deck, typePlan, roleTargets, usedNames, commanderName) {
  const normalizedCommander = normalizeCardName(commanderName);
  const counts = countByType(deck);
  const roleCounts = getRoleCounts(deck);
  const planBuckets = typePlan?.buckets || typePlan || {};

  let best = null;
  let bestScore = -Infinity;

  for (const card of pool) {
    const key = normalizeCardName(card.name);
    if (usedNames.has(key) || key === normalizedCommander) continue;

    const bucket = getDeckTypeBucket(card.type || card.type_line || "");
    const rule = planBuckets[bucket];
    const bucketCount = counts[bucket] || 0;
    if (rule && bucketCount >= rule.max + 2) continue;

    let adjustedScore = Number(card.score || 0);

    if (rule) {
      const target = Number(rule.target || 0);
      const deficit = Math.max(0, target - bucketCount);
      const overflow = Math.max(0, bucketCount - target);
      adjustedScore += deficit * 30;
      adjustedScore -= overflow * 18;
      if (bucketCount < (rule.min || 0)) adjustedScore += 35;
      if (bucketCount >= (rule.max || 999)) adjustedScore -= 28;
    }

    if (roleTargets && roleTargets[card.role]) {
      const roleDeficit = Math.max(0, Number(roleTargets[card.role]) - Number(roleCounts[card.role] || 0));
      adjustedScore += roleDeficit * 12;
    }

    if (bucket === "Creature") adjustedScore += 4;

    if (adjustedScore > bestScore) {
      best = card;
      bestScore = adjustedScore;
    }
  }

  return best;
}

async function fetchCardDataBatchWithProgress(cardNames, progressCallback) {
  const uniqueNames = Array.from(new Set(cardNames.map(normalizeCardName)));
  const missingNames = uniqueNames.filter((name) => !cardCache.has(name));
  const total = missingNames.length;
  let done = 0;

  if (total === 0) {
    if (progressCallback) progressCallback(0, 0);
    return new Map(
      uniqueNames
        .map((name) => [name, cardCache.get(name)])
        .filter(([, value]) => value)
    );
  }

  const chunkSize = 75;

  for (let i = 0; i < missingNames.length; i += chunkSize) {
    const chunk = missingNames.slice(i, i + chunkSize);
    const identifiers = chunk.map((name) => ({ name }));

    const response = await fetchWithRetry(SCRYFALL_COLLECTION, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers })
    });

    if (!response.ok) throw new Error("Scryfall collection request failed.");

    const data = await response.json();
    const returnedCards = Array.isArray(data.data) ? data.data : [];

    for (const rawCard of returnedCards) {
      const converted = convertScryfallCard(rawCard);
      cardCache.set(normalizeCardName(converted.name), converted);
    }

    for (const requestedName of chunk) {
      if (!cardCache.has(requestedName)) cardCache.set(requestedName, null);
    }

    done += chunk.length;
    if (progressCallback) progressCallback(done, total);
    await sleep(80);
  }

  const results = new Map();
  for (const name of uniqueNames) {
    const cached = cardCache.get(name);
    if (cached) results.set(name, cached);
  }

  return results;
}

function canBeCommander(card) {
  const type = getCardType(card);
  const text = getCardText(card);
  if (type.includes("legendary creature")) return true;
  if (text.includes("can be your commander")) return true;
  return false;
}

function detectTribalThemes(cards) {
  const counts = {};
  for (const tribalType of TRIBAL_TYPES) counts[tribalType] = 0;

  for (const card of cards) {
    if (!card) continue;
    const combined = `${getCardType(card)} ${getCardText(card)}`;

    for (const tribalType of TRIBAL_TYPES) {
      const pattern = new RegExp(`\\b${tribalType}\\b`, "g");
      const matches = combined.match(pattern);
      if (matches) counts[tribalType] += matches.length;
    }
  }

  return Object.entries(counts)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([tribe]) => `${tribe} tribal`);
}

async function detectCommanderThemes(edhrecCards, edhrecTags, collectionData, allOwnedCardData, commanderColors) {
  const cleanedTags = Array.from(new Set((edhrecTags || []).map(normalizeThemeName).filter(Boolean)));
  if (cleanedTags.length) {
    return cleanedTags.slice(0, 5);
  }

  const topSynergy = [...edhrecCards]
    .sort((a, b) => b.synergy - a.synergy)
    .slice(0, 36);

  const edhrecCardMap = await fetchCardDataBatchWithProgress(topSynergy.map((c) => c.name));
  const themeCards = [];

  for (const entry of topSynergy) {
    const card = edhrecCardMap.get(normalizeCardName(entry.name));
    if (card) themeCards.push(card);
  }

  const ownedThemeCandidates = [];
  const seenOwned = new Set();

  for (const entry of collectionData.originals) {
    if (ownedThemeCandidates.length >= 80) break;
    if (seenOwned.has(entry.normalizedName)) continue;
    seenOwned.add(entry.normalizedName);

    const card = allOwnedCardData.get(entry.normalizedName);
    if (!card) continue;
    if (!legalForCommander(card.colors, commanderColors)) continue;

    if (
      getCardType(card).includes("creature") ||
      getCardText(card).includes("token") ||
      getCardText(card).includes("sacrifice") ||
      getCardText(card).includes("+1/+1 counter") ||
      getCardText(card).includes("draw") ||
      getCardText(card).includes("graveyard") ||
      getCardText(card).includes("whenever")
    ) {
      ownedThemeCandidates.push(card);
    }
  }

  const combinedCards = [...themeCards, ...ownedThemeCandidates];

  const themeCounts = {
    "group hug": 0,
    counters: 0,
    cantrips: 0,
    wheels: 0,
    "opponent draw": 0,
    graveyard: 0,
    tokens: 0,
    artifacts: 0,
    enchantments: 0,
    lands: 0,
    spellslinger: 0,
    sacrifice: 0,
    countersmatter: 0,
    lifegain: 0,
    reanimator: 0,
    blink: 0,
    gowide: 0,
    voltron: 0
  };

  for (const card of combinedCards) {
    const text = getCardText(card);
    const type = getCardType(card);

    if (text.includes("each player draws") || text.includes("each opponent draws")) {
      themeCounts["group hug"] += 3;
      themeCounts["opponent draw"] += 2;
    }

    if (
      text.includes("target opponent draws") ||
      text.includes("an opponent draws") ||
      text.includes("that player draws")
    ) {
      themeCounts["group hug"] += 2;
      themeCounts["opponent draw"] += 3;
    }

    if (
      text.includes("draw a card") &&
      (type.includes("instant") || type.includes("sorcery")) &&
      card.cmc <= 2
    ) {
      themeCounts.cantrips += 3;
      themeCounts.spellslinger += 1;
    }

    if (
      text.includes("each player discards") ||
      text.includes("then draws") ||
      text.includes("discard their hand") ||
      text.includes("wheel")
    ) {
      themeCounts.wheels += 3;
    }

    if (
      text.includes("+1/+1 counter") ||
      text.includes("put a counter on") ||
      text.includes("put counters on")
    ) {
      themeCounts.counters += 3;
      themeCounts.countersmatter += 2;
    }

    if (text.includes("proliferate") || text.includes("double the number of")) {
      themeCounts.counters += 2;
      themeCounts.countersmatter += 3;
    }

    if (text.includes("graveyard")) themeCounts.graveyard += 2;

    if (text.includes("create") && text.includes("token")) {
      themeCounts.tokens += 2;
      themeCounts.gowide += 2;
    }

    if (type.includes("artifact")) themeCounts.artifacts += 1;
    if (type.includes("enchantment")) themeCounts.enchantments += 1;
    if (text.includes("landfall") || text.includes("search your library for a land")) themeCounts.lands += 2;
    if (type.includes("instant") || type.includes("sorcery")) themeCounts.spellslinger += 1;
    if (text.includes("sacrifice")) themeCounts.sacrifice += 3;
    if (text.includes("gain life") || text.includes("life total")) themeCounts.lifegain += 2;

    if (text.includes("return target creature card from your graveyard") || text.includes("reanimate")) {
      themeCounts.reanimator += 3;
    }

    if (
      text.includes("exile another target") ||
      text.includes("return it to the battlefield") ||
      text.includes("blink")
    ) {
      themeCounts.blink += 3;
    }

    if (
      text.includes("equipped creature") ||
      text.includes("enchanted creature") ||
      text.includes("commander damage")
    ) {
      themeCounts.voltron += 2;
    }
  }

  const normalThemes = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count > 1)
    .slice(0, 4)
    .map(([theme]) => theme);

  const tribalThemes = detectTribalThemes(combinedCards);
  return [...normalThemes, ...tribalThemes].slice(0, 6);
}

function getCommanderStrategyProfile(commanderName, commanderThemes, commanderColors) {
  const normalizedName = normalizeCardName(commanderName);
  const themeSignals = buildThemeSignalSet(commanderThemes);

  const profile = {
    wantsCreatures: false,
    wantsTokens: false,
    wantsSacrifice: false,
    wantsTribal: false,
    tribalTypes: [],
    wantsCantrips: false,
    wantsCounters: false,
    wantsGroupHug: false,
    wantsGoWide: false,
    monoColor: commanderColors.length === 1
  };

  if (themeSignals.has("tokens")) profile.wantsTokens = true;
  if (themeSignals.has("sacrifice")) profile.wantsSacrifice = true;
  if (themeSignals.has("gowide")) profile.wantsGoWide = true;
  if (themeSignals.has("cantrips") || themeSignals.has("spellslinger")) profile.wantsCantrips = true;
  if (themeSignals.has("counters") || themeSignals.has("countersmatter")) profile.wantsCounters = true;
  if (themeSignals.has("group hug") || themeSignals.has("opponent draw")) profile.wantsGroupHug = true;

  const tribalThemes = getCommanderTribalThemes(commanderThemes);
  if (tribalThemes.length) {
    profile.wantsTribal = true;
    profile.wantsCreatures = true;
    profile.tribalTypes = tribalThemes.map((t) => t.replace(" tribal", ""));
  }

  if (profile.wantsTokens || profile.wantsSacrifice || profile.wantsGoWide) {
    profile.wantsCreatures = true;
  }

  if (normalizedName.includes("ib halfheart")) {
    profile.wantsCreatures = true;
    profile.wantsTokens = true;
    profile.wantsSacrifice = true;
    profile.wantsTribal = true;
    profile.wantsGoWide = true;
    if (!profile.tribalTypes.includes("goblin")) profile.tribalTypes.push("goblin");
  }

  return profile;
}

function getModePreferences(mode, strategyProfile) {
  const themeFocus = mode.startsWith("theme:") ? mode.slice(6) : "";
  const bracketTarget = mode.startsWith("bracket:") ? Number(mode.slice(8)) : null;
  const lowerBracket = bracketTarget && bracketTarget <= 2;
  const higherBracket = bracketTarget && bracketTarget >= 4;
  const focusedThemeSignal = normalizeThemeName(themeFocus);
  const tribalFocus = getCommanderTribalThemes(themeFocus ? [themeFocus] : []).length > 0;
  const creatureFocusedTheme = ["tokens", "blink", "reanimator", "elves", "zombies", "goblins", "humans", "angels", "dragons", "bears"].includes(focusedThemeSignal);

  return {
    mode,
    themeFocus,
    focusedThemeSignal,
    bracketTarget,
    synergyBias:
      themeFocus ? 1.35 :
      higherBracket ? 1.3 :
      lowerBracket ? 0.92 :
      1,
    creatureBias:
      tribalFocus || creatureFocusedTheme ? 1.3 :
      strategyProfile.wantsCreatures ? 1.1 : 1,
    casualBias: lowerBracket ? 1.45 : 1,
    manaBaseBias: higherBracket ? 1.2 : 1,
    fewerStaplesBias: mode === "fewer-staples" || lowerBracket ? 1.5 : 1,
    tribalBias: tribalFocus ? 1.55 : 1,
    minimumCreatureBonus:
      tribalFocus ? 6 :
      creatureFocusedTheme ? 4 :
      0
  };
}

function isCreatureCard(card) {
  return getCardType(card).includes("creature");
}

function hasTribalType(card, tribe) {
  const pattern = new RegExp(`\\b${tribe}\\b`);
  return pattern.test(`${getCardType(card)} ${getCardText(card)}`);
}

function isTokenMaker(card) {
  return getCardText(card).includes("create") && getCardText(card).includes("token");
}

function isSacrificeCard(card) {
  return getCardText(card).includes("sacrifice");
}

function isSynergisticMonoColorLand(card, commanderColors, profile) {
  const name = normalizeCardName(card.name);
  const text = getCardText(card);

  if (commanderColors.length !== 1) return true;

  if (name === "path of ancestry" && profile.wantsTribal) return true;
  if (name === "secluded courtyard" && profile.wantsTribal) return true;
  if (name === "unclaimed territory" && profile.wantsTribal) return true;
  if (name === "dwarven mine" && commanderColors[0] === "R") return true;
  if (name === "mines of moria" && profile.wantsTokens) return true;
  if (text.includes("create") && text.includes("token")) return true;
  if (text.includes("sacrifice") || text.includes("whenever a creature dies")) return true;

  return false;
}

function isLowPriorityMonoColorFixer(card, commanderColors) {
  if (commanderColors.length !== 1) return false;

  const name = normalizeCardName(card.name);
  const lowPriorityNames = new Set([
    "command tower",
    "exotic orchard",
    "rupture spire",
    "gateway plaza",
    "transguild promenade",
    "unclaimed territory",
    "secluded courtyard",
    "path of ancestry",
    "thriving bluff",
    "public thoroughfare",
    "vibrant cityscape",
    "tendo ice bridge",
    "uncharted haven",
    "command bridge",
    "crossroads village",
    "capital city",
    "gallifrey council chamber",
    "opal palace",
    "corrupted crossroads",
    "cascading cataracts",
    "secluded starforge"
  ]);

  return lowPriorityNames.has(name);
}

function isLowPriorityMonoColorRock(card, commanderColors, profile) {
  if (commanderColors.length !== 1) return false;
  if (!getCardType(card).includes("artifact")) return false;

  const name = normalizeCardName(card.name);
  if (name === "arcane signet") return true;
  if (name === "commander's sphere") return true;
  if (name === "heraldic banner") return false;
  if (name === "sol ring") return false;
  if (name === "mind stone") return false;
  if (name === "skullclamp") return false;
  if (name === "idol of oblivion" && profile.wantsTokens) return false;

  return false;
}

function isGenericStaple(card) {
  const staples = new Set([
    "sol ring",
    "arcane signet",
    "command tower",
    "swiftfoot boots",
    "skullclamp",
    "swords to plowshares",
    "path to exile",
    "cyclonic rift",
    "rhystic study",
    "smothering tithe",
    "demonic tutor",
    "vampiric tutor",
    "teferi's protection"
  ]);
  return staples.has(normalizeCardName(card.name));
}

function detectRole(card) {
  const text = getCardText(card);
  const type = getCardType(card);

  if (type.includes("land")) return "land";

  if (
    text.includes("add {") ||
    text.includes("create a treasure") ||
    text.includes("create treasure") ||
    text.includes("search your library for a land")
  ) {
    return "ramp";
  }

  if (
    text.includes("draw a card") ||
    text.includes("draw two cards") ||
    text.includes("draw three cards") ||
    text.includes("whenever you draw")
  ) {
    return "draw";
  }

  if (
    text.includes("destroy target") ||
    text.includes("exile target") ||
    text.includes("counter target spell") ||
    text.includes("return target permanent")
  ) {
    return "removal";
  }

  if (
    text.includes("destroy all creatures") ||
    text.includes("exile all creatures") ||
    text.includes("each creature gets")
  ) {
    return "wipe";
  }

  return "synergy";
}

function detectCardTags(card) {
  const tags = [];
  const text = getCardText(card);
  const type = getCardType(card);
  const combined = `${type} ${text}`;

  if (text.includes("graveyard")) tags.push("graveyard");
  if (text.includes("token")) {
    tags.push("tokens");
    tags.push("gowide");
  }
  if (type.includes("artifact")) tags.push("artifacts");
  if (type.includes("enchantment")) tags.push("enchantments");
  if (text.includes("landfall") || text.includes("search your library for a land")) tags.push("lands");
  if (type.includes("instant") || type.includes("sorcery")) tags.push("spellslinger");
  if (text.includes("sacrifice")) tags.push("sacrifice");

  if (text.includes("+1/+1 counter") || text.includes("put a counter on") || text.includes("put counters on")) {
    tags.push("counters");
    tags.push("countersmatter");
  }

  if (text.includes("gain life") || text.includes("life total")) tags.push("lifegain");
  if (text.includes("return target creature card from your graveyard")) tags.push("reanimator");

  if (
    text.includes("each player draws") ||
    text.includes("each opponent draws") ||
    text.includes("target opponent draws") ||
    text.includes("an opponent draws")
  ) {
    tags.push("group hug");
    tags.push("opponent draw");
  }

  if (
    text.includes("draw a card") &&
    (type.includes("instant") || type.includes("sorcery")) &&
    card.cmc <= 2
  ) {
    tags.push("cantrips");
  }

  if (
    text.includes("each player discards") ||
    text.includes("then draws") ||
    text.includes("discard their hand")
  ) {
    tags.push("wheels");
  }

  if (
    text.includes("exile another target") ||
    text.includes("return it to the battlefield")
  ) {
    tags.push("blink");
  }

  for (const tribalType of TRIBAL_TYPES) {
    const pattern = new RegExp(`\\b${tribalType}\\b`);
    if (pattern.test(combined)) tags.push(`${tribalType} tribal`);
  }

  return tags;
}

function scoreCard(card, edhrecCard, commanderThemes, strategyProfile, commanderColors, modePrefs) {
  const synergyScore = Number(edhrecCard.synergy || 0) * 6;
  const popularityScore = Math.min(Number(edhrecCard.decks || 0) / 1200, 18);

  let roleBonus = 0;
  const role = detectRole(card);

  if (role === "ramp") roleBonus = 4;
  else if (role === "draw") roleBonus = 4;
  else if (role === "removal") roleBonus = 4;
  else if (role === "wipe") roleBonus = 3;

  let curveBonus = 0;
  if (card.cmc <= 2) curveBonus = 3;
  else if (card.cmc <= 4) curveBonus = 4;
  else if (card.cmc <= 6) curveBonus = 1;

  const tags = detectCardTags(card);
  const themeSignals = buildThemeSignalSet(commanderThemes);
  let themeBonus = 0;

  for (const tag of tags) {
    if (themeSignals.has(normalizeThemeName(tag))) themeBonus += 5;
  }

  if (strategyProfile.wantsCreatures && isCreatureCard(card)) themeBonus += 5 * modePrefs.creatureBias;
  if (strategyProfile.wantsTokens && isTokenMaker(card)) themeBonus += 7 * modePrefs.synergyBias;
  if (strategyProfile.wantsSacrifice && isSacrificeCard(card)) themeBonus += 6 * modePrefs.synergyBias;
  if (strategyProfile.wantsGoWide && isCreatureCard(card)) themeBonus += 3 * modePrefs.creatureBias;

  if (strategyProfile.wantsTribal) {
    for (const tribe of strategyProfile.tribalTypes) {
      if (hasTribalType(card, tribe)) themeBonus += 10 * modePrefs.tribalBias;
    }
  }

  if (themeSignals.has("group hug") && tags.includes("opponent draw")) themeBonus += 4;
  if (themeSignals.has("counters") && tags.includes("counters")) themeBonus += 4;
  if (themeSignals.has("cantrips") && tags.includes("cantrips")) themeBonus += 3;

  let penalty = 0;
  if (isLowPriorityMonoColorRock(card, commanderColors, strategyProfile)) penalty += 8;
  if (modePrefs.casualBias > 1 && GAME_CHANGERS.has(normalizeCardName(card.name))) penalty += 10 * modePrefs.casualBias;
  if (modePrefs.fewerStaplesBias > 1 && isGenericStaple(card)) penalty += 6 * modePrefs.fewerStaplesBias;

  return synergyScore * modePrefs.synergyBias + popularityScore + roleBonus + curveBonus + themeBonus - penalty;
}

function scoreFallbackCard(card, commanderThemes, strategyProfile, commanderColors, modePrefs) {
  let score = 5;

  const role = detectRole(card);
  if (role === "ramp") score += 4;
  else if (role === "draw") score += 4;
  else if (role === "removal") score += 4;
  else if (role === "wipe") score += 3;

  if (card.cmc <= 2) score += 3;
  else if (card.cmc <= 4) score += 4;
  else if (card.cmc <= 6) score += 1;

  const tags = detectCardTags(card);
  const themeSignals = buildThemeSignalSet(commanderThemes);
  for (const tag of tags) {
    if (themeSignals.has(normalizeThemeName(tag))) score += 4 * modePrefs.synergyBias;
  }

  if (strategyProfile.wantsCreatures && isCreatureCard(card)) score += 6 * modePrefs.creatureBias;
  if (strategyProfile.wantsTokens && isTokenMaker(card)) score += 8 * modePrefs.synergyBias;
  if (strategyProfile.wantsSacrifice && isSacrificeCard(card)) score += 7 * modePrefs.synergyBias;
  if (strategyProfile.wantsGoWide && isCreatureCard(card)) score += 3 * modePrefs.creatureBias;

  if (strategyProfile.wantsTribal) {
    for (const tribe of strategyProfile.tribalTypes) {
      if (hasTribalType(card, tribe)) score += 12 * modePrefs.tribalBias;
    }
  }

  if (isLowPriorityMonoColorRock(card, commanderColors, strategyProfile)) score -= 8;
  if (modePrefs.casualBias > 1 && GAME_CHANGERS.has(normalizeCardName(card.name))) score -= 10 * modePrefs.casualBias;
  if (modePrefs.fewerStaplesBias > 1 && isGenericStaple(card)) score -= 6 * modePrefs.fewerStaplesBias;

  return score;
}

function legalForCommander(cardColors, commanderColors) {
  for (const color of cardColors) {
    if (!commanderColors.includes(color)) return false;
  }
  return true;
}

function recommendLandCount(commanderColors) {
  if (commanderColors.length === 0) return 38;
  if (commanderColors.length === 1) return 36;
  if (commanderColors.length === 2) return 37;
  return 38;
}

function evaluateNonbasicLand(card, commanderColors, strategyProfile, modePrefs) {
  if (!getCardType(card).includes("land")) return null;
  if (isBasicLand(card.name)) return null;

  const produced = Array.isArray(card.producedMana) ? card.producedMana : [];
  const relevantProduced = produced.filter((c) => commanderColors.includes(c));
  const normalizedName = normalizeCardName(card.name);
  const text = getCardText(card);

  let score = 0;
  score += relevantProduced.length * 4;

  if (normalizedName === "command tower") score += 10;
  if (normalizedName === "exotic orchard") score += 7;
  if (normalizedName === "path of ancestry" && strategyProfile.wantsTribal) score += 9;
  if (normalizedName === "secluded courtyard" && strategyProfile.wantsTribal) score += 8;
  if (normalizedName === "unclaimed territory" && strategyProfile.wantsTribal) score += 8;

  if (card.name.toLowerCase().includes("triome")) score += 8;
  if (card.name.toLowerCase().includes("pathway")) score += 6;

  if (text.includes("add one mana of any color")) score += 6;
  if (text.includes("add one mana of any type")) score += 5;

  if (strategyProfile.wantsTokens && text.includes("create") && text.includes("token")) score += 5;
  if (strategyProfile.wantsSacrifice && text.includes("sacrifice")) score += 4;
  if (strategyProfile.wantsGoWide && text.includes("creature")) score += 2;

  if (text.includes("enters tapped")) score -= 4;
  if (text.includes("unless you control")) score -= 1;
  if (text.includes("pay 1 life")) score -= 0.5;
  if (relevantProduced.length === 0) score -= 20;

  if (strategyProfile.monoColor) {
    if (!isSynergisticMonoColorLand(card, commanderColors, strategyProfile)) score -= 12;
    if (isLowPriorityMonoColorFixer(card, commanderColors)) score -= 12;
  }

  score *= modePrefs.manaBaseBias;

  return {
    name: card.name,
    role: "land",
    score,
    type: getCardType(card),
    cmc: 0,
    colors: produced,
    source: "nonbasic-land"
  };
}

function buildNonbasicManaBase(collectionData, allOwnedCardData, commanderColors, targetLandCount, strategyProfile, modePrefs) {
  const landPool = [];
  const seen = new Set();

  for (const entry of collectionData.originals) {
    const normalizedName = entry.normalizedName;
    if (seen.has(normalizedName)) continue;
    seen.add(normalizedName);

    const card = allOwnedCardData.get(normalizedName);
    if (!card) continue;
    if (!getCardType(card).includes("land")) continue;
    if (isBasicLand(card.name)) continue;
    if (!legalForCommander(card.colors, commanderColors)) continue;

    const landCandidate = evaluateNonbasicLand(card, commanderColors, strategyProfile, modePrefs);
    if (!landCandidate) continue;
    landPool.push(landCandidate);
  }

  landPool.sort((a, b) => b.score - a.score);

  const threshold =
    commanderColors.length === 1 ? 7 :
    commanderColors.length === 2 ? 6 :
    commanderColors.length === 3 ? 5 :
    4;

  const filtered = landPool.filter((land) => land.score >= threshold);

  const maxNonbasicCount =
    commanderColors.length === 1 ? Math.min(6, targetLandCount) :
    commanderColors.length === 2 ? Math.min(modePrefs.manaBaseBias > 1 ? 15 : 12, targetLandCount) :
    commanderColors.length === 3 ? Math.min(modePrefs.manaBaseBias > 1 ? 18 : 16, targetLandCount) :
    Math.min(modePrefs.manaBaseBias > 1 ? 22 : 20, targetLandCount);

  return filtered.slice(0, maxNonbasicCount);
}

function buildBasicManaBase(commanderColors, landCountNeeded, selectedNonbasics = []) {
  if (landCountNeeded <= 0) return [];

  if (commanderColors.length === 0) {
    return Array.from({ length: landCountNeeded }, () => ({
      name: "Wastes",
      role: "land",
      score: 0,
      type: "basic land",
      cmc: 0,
      colors: [],
      source: "basic-land"
    }));
  }

  const sourceCounts = {};
  for (const color of commanderColors) sourceCounts[color] = 0;

  for (const land of selectedNonbasics) {
    const produced = Array.isArray(land.colors) ? land.colors : [];
    for (const color of produced) {
      if (sourceCounts[color] !== undefined) sourceCounts[color] += 1;
    }
  }

  const lands = [];
  const colorsSorted = [...commanderColors].sort((a, b) => sourceCounts[a] - sourceCounts[b]);

  for (let i = 0; i < landCountNeeded; i++) {
    colorsSorted.sort((a, b) => sourceCounts[a] - sourceCounts[b]);
    const color = colorsSorted[0];
    sourceCounts[color] += 1;

    lands.push({
      name: COLOR_TO_BASIC[color],
      role: "land",
      score: 0,
      type: "basic land",
      cmc: 0,
      colors: [color],
      source: "basic-land"
    });
  }

  return lands;
}

function buildDeckFromScoredPool(
  scoredNonlands,
  commanderColors,
  collectionData,
  allOwnedCardData,
  commanderThemes,
  commanderName,
  modePrefs,
  edhrecTypeAverages = null,
  edhrecRoleTargets = null
) {
  const deck = [];
  const usedNames = new Set();
  const normalizedCommander = normalizeCardName(commanderName);
  const strategyProfile = getCommanderStrategyProfile(commanderName, commanderThemes, commanderColors);

  const recommendedLandCount = recommendLandCount(commanderColors);
  const typePlan = buildTypeTargetPlan(edhrecTypeAverages, strategyProfile, recommendedLandCount, commanderThemes);
  const targetLandCount = typePlan.landCount;
  const targetNonlandCount = typePlan.nonlandCount;

  const roleTargets = {
    ramp: Math.round(Number(edhrecRoleTargets?.ramp) || 10),
    draw: Math.round(Number(edhrecRoleTargets?.draw) || 10),
    removal: Math.round(Number(edhrecRoleTargets?.removal) || 8),
    wipe: Math.round(Number(edhrecRoleTargets?.wipe) || 3)
  };

  if (typePlan?.buckets?.Creature) {
    typePlan.buckets.Creature.min = Math.max(
      typePlan.buckets.Creature.min,
      strategyProfile.wantsCreatures
        ? (strategyProfile.wantsTribal || strategyProfile.wantsGoWide ? 22 : 16) + modePrefs.minimumCreatureBonus
        : 10 + Math.floor(modePrefs.minimumCreatureBonus / 2)
    );
    typePlan.buckets.Creature.max = Math.max(typePlan.buckets.Creature.max, typePlan.buckets.Creature.min);
  }

  const fallbackPool = [];
  const seenFallback = new Set();

  for (const entry of collectionData.originals) {
    const normalizedName = entry.normalizedName;
    if (seenFallback.has(normalizedName)) continue;
    seenFallback.add(normalizedName);
    if (normalizedName === normalizedCommander) continue;

    const card = allOwnedCardData.get(normalizedName);
    if (!card) continue;
    if (getCardType(card).includes("land")) continue;
    if (!legalForCommander(card.colors, commanderColors)) continue;

    fallbackPool.push({
      name: card.name,
      role: detectRole(card),
      score: scoreFallbackCard(card, commanderThemes, strategyProfile, commanderColors, modePrefs),
      type: getCardType(card),
      cmc: card.cmc,
      colors: card.colors
    });
  }

  scoredNonlands.sort((a, b) => b.score - a.score);
  fallbackPool.sort((a, b) => b.score - a.score);

  const buckets = ["Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker"];

  function addCard(card, source) {
    if (!card) return false;
    const key = normalizeCardName(card.name);
    if (usedNames.has(key) || key === normalizedCommander) return false;
    deck.push({ ...card, source });
    usedNames.add(key);
    return true;
  }

  // Phase 1: hit the EDHREC type mix using EDHREC-owned matches first.
  for (const bucket of buckets) {
    const target = Number(typePlan?.buckets?.[bucket]?.target || 0);
    while (getTypePlanBucketNeed(deck, typePlan, bucket) > 0 && deck.length < targetNonlandCount) {
      const edhrecPick = pickBestCardForBucket(scoredNonlands, usedNames, commanderName, bucket);
      if (edhrecPick) {
        addCard(edhrecPick, "edhrec");
        continue;
      }

      const fallbackPick = pickBestCardForBucket(fallbackPool, usedNames, commanderName, bucket);
      if (fallbackPick) {
        addCard(fallbackPick, bucket === "Creature" ? "fallback-creature" : "fallback");
        continue;
      }

      break;
    }
  }

  // Phase 2: satisfy missing type minimums from the rest of the collection.
  for (const neededBucket of getCardsNeededForTypeMinimums(deck, typePlan)) {
    if (deck.length >= targetNonlandCount) break;

    const edhrecPick = pickBestCardForBucket(scoredNonlands, usedNames, commanderName, neededBucket);
    if (edhrecPick) {
      addCard(edhrecPick, "edhrec");
      continue;
    }

    const fallbackPick = pickBestCardForBucket(fallbackPool, usedNames, commanderName, neededBucket);
    if (fallbackPick) {
      addCard(fallbackPick, neededBucket === "Creature" ? "fallback-creature" : "fallback");
    }
  }

  // Phase 3: fill the remaining slots with the best cards, prioritizing whatever type and role is still short.
  const combinedPool = [...scoredNonlands, ...fallbackPool];
  while (deck.length < targetNonlandCount) {
    const best = chooseBestFlexibleCard(combinedPool, deck, typePlan, roleTargets, usedNames, commanderName);
    if (!best) break;

    const bucket = getDeckTypeBucket(best.type || best.type_line || "");
    const source = scoredNonlands.includes(best)
      ? "edhrec"
      : bucket === "Creature" ? "fallback-creature" : "fallback";

    addCard(best, source);
  }

  // Phase 4: emergency creature backfill if the collection was extremely spell-heavy.
  const creatureRule = typePlan?.buckets?.Creature;
  if (creatureRule) {
    while ((countByType(deck).Creature || 0) < creatureRule.min && deck.length) {
      const fallbackCreature = pickBestCardForBucket(fallbackPool, usedNames, commanderName, "Creature");
      if (!fallbackCreature) break;

      let replaceIndex = -1;
      let replaceScore = Infinity;
      const counts = countByType(deck);
      for (let i = 0; i < deck.length; i++) {
        const existing = deck[i];
        const bucket = getDeckTypeBucket(existing.type || existing.type_line || "");
        if (bucket === "Creature") continue;
        const rule = typePlan?.buckets?.[bucket];
        if (rule && (counts[bucket] || 0) <= rule.min) continue;
        if ((existing.score || 0) < replaceScore) {
          replaceScore = existing.score || 0;
          replaceIndex = i;
        }
      }

      if (replaceIndex === -1) break;
      usedNames.delete(normalizeCardName(deck[replaceIndex].name));
      deck.splice(replaceIndex, 1);
      addCard(fallbackCreature, "fallback-creature");
    }
  }

  const selectedNonbasicLands = buildNonbasicManaBase(
    collectionData,
    allOwnedCardData,
    commanderColors,
    targetLandCount,
    strategyProfile,
    modePrefs
  );

  let remainingLandCount = targetLandCount - selectedNonbasicLands.length;
  if (remainingLandCount < 0) remainingLandCount = 0;

  const basicLands = buildBasicManaBase(
    commanderColors,
    remainingLandCount,
    selectedNonbasicLands
  );

  let finalDeck = [...deck, ...selectedNonbasicLands, ...basicLands];

  while (finalDeck.length < 99) {
    const extra = buildBasicManaBase(
      commanderColors,
      1,
      finalDeck.filter((c) => c.role === "land")
    );
    finalDeck.push(...extra);
  }

  if (finalDeck.length > 99) {
    finalDeck = finalDeck.slice(0, 99);
  }

  return finalDeck;
}

function mergeDeckCounts(deck) {
  const map = new Map();

  for (const card of deck) {
    const key = normalizeCardName(card.name);
    if (!map.has(key)) {
      map.set(key, {
        name: card.name,
        count: 1,
        type: getCardType(card),
        text: getCardText(card),
        role: card.role,
        source: card.source,
        reasons: card.reasons || [],
        scryfallUrl: card.scryfallUrl || card.scryfall_uri || "",
        imageUrl: getCardImageUrl(card)
      });
    } else {
      const existing = map.get(key);
      existing.count += 1;
      existing.reasons = Array.from(new Set([...(existing.reasons || []), ...(card.reasons || [])]));
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function getCardSection(cardType) {
  const type = String(cardType || "").toLowerCase();
  if (type.includes("creature")) return "Creatures";
  if (type.includes("artifact")) return "Artifacts";
  if (type.includes("enchantment")) return "Enchantments";
  if (type.includes("planeswalker")) return "Planeswalkers";
  if (type.includes("instant")) return "Instants";
  if (type.includes("sorcery")) return "Sorceries";
  if (type.includes("land")) return "Lands";
  return "Other";
}

function generateCardReasons(card, commanderThemes, strategyProfile, commanderColors) {
  const reasons = [];
  const tags = detectCardTags(card);
  const role = detectRole(card);

  if (role === "ramp") reasons.push("ramp");
  if (role === "draw") reasons.push("draw");
  if (role === "removal") reasons.push("removal");
  if (role === "wipe") reasons.push("wipe");
  if (isTokenMaker(card)) reasons.push("token maker");
  if (isSacrificeCard(card)) reasons.push("sac outlet");
  if (GAME_CHANGERS.has(normalizeCardName(card.name))) reasons.push("game changer");

  const themeSignals = buildThemeSignalSet(commanderThemes);
  for (const theme of commanderThemes) {
    const aliases = getThemeAliases(theme);
    if (aliases.some((alias) => tags.includes(alias)) || themeSignals.has(normalizeThemeName(theme)) && tags.includes(normalizeThemeName(theme))) {
      reasons.push(theme);
    }
  }

  if (strategyProfile.wantsTribal) {
    for (const tribe of strategyProfile.tribalTypes) {
      if (hasTribalType(card, tribe)) reasons.push(`${tribe} tribal`);
    }
  }

  if (card.role === "land") {
    if (card.source === "basic-land") reasons.push("basic fixing");
    if (card.source === "nonbasic-land") reasons.push("mana land");
  }

  if (card.source === "edhrec") reasons.push("edhrec match");
  if (card.source === "fallback") reasons.push("collection fallback");
  if (card.source === "fallback-creature") reasons.push("creature fallback");

  return Array.from(new Set(reasons)).slice(0, 5);
}

function displayThemeChips(themes) {
  const wrap = document.getElementById("themeChips");
  wrap.innerHTML = "";

  if (!themes.length) {
    const chip = document.createElement("div");
    chip.className = "theme-chip theme-chip-muted";
    chip.textContent = "No Clear Themes";
    wrap.appendChild(chip);
    return;
  }

  themes.forEach((theme) => {
    const chip = document.createElement("div");
    chip.className = "theme-chip";
    chip.textContent = formatThemeLabel(theme);
    wrap.appendChild(chip);
  });
}

function displayThemes(themes) {
  displayThemeChips(themes);
}

function displayDeckSummary(deck, commanderName, commanderColors) {
  const summary = document.getElementById("deckSummary");
  if (summary) summary.innerHTML = "";
}

function getBracketLabel(bracket) {
  const labels = {
    1: "Bracket 1 — Exhibition",
    2: "Bracket 2 — Core",
    3: "Bracket 3 — Upgraded",
    4: "Bracket 4 — Optimized",
    5: "Bracket 5 — cEDH"
  };
  return labels[bracket] || "Unknown";
}

function detectGameChangers(deck, commanderName) {
  const detected = [];
  const seen = new Set();

  const allNames = [commanderName, ...deck.map((c) => c.name)];
  for (const name of allNames) {
    const normalized = normalizeCardName(name);
    if (GAME_CHANGERS.has(normalized) && !seen.has(normalized)) {
      detected.push(name);
      seen.add(normalized);
    }
  }

  return detected.sort((a, b) => a.localeCompare(b));
}

function estimateDeckBracket(deck, commanderThemes, commanderColors, commanderName) {
  const names = deck.map((c) => normalizeCardName(c.name));
  const nonlands = deck.filter((c) => c.role !== "land");
  const lands = deck.filter((c) => c.role === "land");
  const creatures = nonlands.filter((c) => getCardType(c).includes("creature")).length;

  const rampCount = nonlands.filter((c) => c.role === "ramp").length;
  const drawCount = nonlands.filter((c) => c.role === "draw").length;
  const removalCount = nonlands.filter((c) => c.role === "removal").length;
  const wipeCount = nonlands.filter((c) => c.role === "wipe").length;

  const avgCmc =
    nonlands.length > 0
      ? nonlands.reduce((sum, c) => sum + (c.cmc || 0), 0) / nonlands.length
      : 0;

  const fastManaCards = [
    "sol ring", "mana crypt", "chrome mox", "mox diamond", "jeweled lotus", "mana vault", "grim monolith", "lotus petal"
  ];

  const tutorCards = [
    "demonic tutor", "vampiric tutor", "imperial seal", "worldly tutor", "enlightened tutor",
    "mystical tutor", "gamble", "diabolic intent", "eladamri's call", "green sun's zenith",
    "finale of devastation", "crop rotation"
  ];

  const extraTurnCards = [
    "time warp", "temporal manipulation", "capture of jingzhou", "nexus of fate", "time stretch", "expropriate"
  ];

  const massLandDenialCards = [
    "armageddon", "ravages of war", "ruination", "winter orb", "blood moon", "magus of the moon", "sunder"
  ];

  const compactComboCards = [
    "thassa's oracle", "underworld breach", "ad nauseam", "protean hulk", "bolas's citadel", "dockside extortionist", "food chain"
  ];

  const fastManaCount = names.filter((n) => fastManaCards.includes(n)).length;
  const tutorCount = names.filter((n) => tutorCards.includes(n)).length;
  const extraTurnCount = names.filter((n) => extraTurnCards.includes(n)).length;
  const massLandDenialCount = names.filter((n) => massLandDenialCards.includes(n)).length;
  const compactComboCount = names.filter((n) => compactComboCards.includes(n)).length;
  const gameChangers = detectGameChangers(deck, commanderName);
  const gameChangerCount = gameChangers.length;

  let score = 0;
  score += rampCount * 0.25;
  score += drawCount * 0.2;
  score += removalCount * 0.15;
  score += wipeCount * 0.2;

  if (avgCmc <= 2.2) score += 2.5;
  else if (avgCmc <= 2.8) score += 1.5;
  else if (avgCmc <= 3.3) score += 0.5;

  score += fastManaCount * 2.5;
  score += tutorCount * 1.75;
  score += extraTurnCount * 1.5;
  score += massLandDenialCount * 2;
  score += compactComboCount * 2.5;
  score += gameChangerCount * 1.2;

  if (commanderHasTheme(commanderThemes, "tokens")) score += 0.4;
  if (commanderHasTheme(commanderThemes, "sacrifice")) score += 0.4;
  if (commanderHasTheme(commanderThemes, "cantrips")) score += 0.6;
  if (commanderHasTheme(commanderThemes, "counters")) score += 0.3;
  if (getCommanderTribalThemes(commanderThemes).length) score += 0.3;

  if (commanderColors.length >= 3) score += 0.3;
  if (creatures >= 24) score -= 0.3;
  if (lands >= 37) score -= 0.2;

  let bracket = 2;
  if (score < 1.5) bracket = 1;
  else if (score < 4.5) bracket = 2;
  else if (score < 8.5) bracket = 3;
  else if (score < 13) bracket = 4;
  else bracket = 5;

  if (gameChangerCount > 0 && bracket < 3) bracket = 3;
  if (gameChangerCount > 3 && bracket < 4) bracket = 4;

  const reasons = [];
  if (gameChangerCount) reasons.push(`game changers: ${gameChangerCount}`);
  if (fastManaCount) reasons.push(`fast mana: ${fastManaCount}`);
  if (tutorCount) reasons.push(`tutors: ${tutorCount}`);
  if (compactComboCount) reasons.push(`combo pieces: ${compactComboCount}`);
  if (extraTurnCount) reasons.push(`extra turns: ${extraTurnCount}`);
  if (massLandDenialCount) reasons.push(`mass land denial: ${massLandDenialCount}`);
  reasons.push(`avg CMC: ${avgCmc.toFixed(2)}`);
  reasons.push(`ramp/draw/removal/wipes: ${rampCount}/${drawCount}/${removalCount}/${wipeCount}`);

  return {
    bracket,
    label: getBracketLabel(bracket),
    score: Number(score.toFixed(2)),
    reasons,
    gameChangers
  };
}

function displayDeckBracket(bracketInfo) {
  const el = document.getElementById("deckBracket");
  const badgeClass =
    bracketInfo.bracket === 1 ? "badge-b1" :
    bracketInfo.bracket === 2 ? "badge-b2" :
    bracketInfo.bracket === 3 ? "badge-b3" :
    bracketInfo.bracket === 4 ? "badge-b4" :
    "badge-b5";

  el.innerHTML = `
    <div class="power-card fade-up">
      <div class="power-card-copy">
        <div class="power-card-label">Deck Bracket</div>
        <div class="power-card-subtitle">A quick strength estimate based on your final list.</div>
      </div>
      <div class="badge ${badgeClass}">${escapeHtml(bracketInfo.label)}</div>
    </div>
  `;
}

function displayGameChangers(bracketInfo) {
  const el = document.getElementById("deckGameChangers");
  if (!bracketInfo.gameChangers.length) {
    el.innerHTML = `
      <div class="info-card fade-up">
        <div class="info-card-title">Game Changers</div>
        <div class="info-card-copy">None detected in this build.</div>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="info-card fade-up">
      <div class="info-card-title">Game Changers (${bracketInfo.gameChangers.length})</div>
      <div class="info-card-copy">${escapeHtml(bracketInfo.gameChangers.join(", "))}</div>
    </div>
  `;
}

function displayBuildBreakdown(deck) {
  const el = document.getElementById("buildBreakdown");

  const edhrecCount = deck.filter((c) => c.source === "edhrec").length;
  const fallbackCreatureCount = deck.filter((c) => c.source === "fallback-creature").length;
  const fallbackCount = deck.filter((c) => c.source === "fallback").length;
  const nonbasicCount = deck.filter((c) => c.source === "nonbasic-land").length;
  const basicCount = deck.filter((c) => c.source === "basic-land").length;

  el.innerHTML = `
    <div class="info-card fade-up">
      <div class="info-card-title">Build Breakdown</div>
      <div class="build-breakdown-grid">
        <div class="build-breakdown-item"><span>EDHREC Matches</span><strong>${edhrecCount}</strong></div>
        <div class="build-breakdown-item"><span>Fallback Creatures</span><strong>${fallbackCreatureCount}</strong></div>
        <div class="build-breakdown-item"><span>Other Fallbacks</span><strong>${fallbackCount}</strong></div>
        <div class="build-breakdown-item"><span>Nonbasic Lands</span><strong>${nonbasicCount}</strong></div>
        <div class="build-breakdown-item"><span>Basic Lands</span><strong>${basicCount}</strong></div>
      </div>
    </div>
  `;
}

function generateWarnings(deck, commanderThemes, bracketInfo) {
  const warnings = [];
  const creatures = deck.filter((c) => getCardType(c).includes("creature")).length;
  const ramp = deck.filter((c) => c.role === "ramp").length;
  const draw = deck.filter((c) => c.role === "draw").length;
  const removal = deck.filter((c) => c.role === "removal").length;
  const wipes = deck.filter((c) => c.role === "wipe").length;
  const basics = deck.filter((c) => c.source === "basic-land").length;
  const nonbasics = deck.filter((c) => c.source === "nonbasic-land").length;
  const fallbackCards = deck.filter((c) => c.source === "fallback" || c.source === "fallback-creature").length;

  if (getCommanderTribalThemes(commanderThemes).length && creatures < 22) {
    warnings.push("Low creature count for a tribal deck.");
  }
  if (commanderHasTheme(commanderThemes, "gowide") && creatures < 20) {
    warnings.push("Go-wide strategy may be light on creatures or token bodies.");
  }
  if (ramp < 8) warnings.push("Ramp count is on the low side.");
  if (draw < 8) warnings.push("Card draw count is on the low side.");
  if (removal < 6) warnings.push("Interaction count may be low.");
  if (wipes < 2 && bracketInfo.bracket >= 3) warnings.push("Only a small number of board wipes found.");
  if (nonbasics > basics * 1.5 && basics < 10) warnings.push("Mana base may still be a bit too greedy on nonbasics.");
  if (fallbackCards >= 18) warnings.push("A large portion of the deck came from fallback collection logic, not direct commander overlap.");
  if (bracketInfo.gameChangers.length >= 4) warnings.push("This build contains several Game Changers and may read stronger than expected at casual tables.");

  return warnings;
}

function displayWarnings(warnings) {
  const el = document.getElementById("warningsPanel");
  el.innerHTML = "";

  const title = document.createElement("div");
  title.className = "info-card-title";
  title.textContent = "Warnings / Confidence Notes";

  const card = document.createElement("div");
  card.className = "info-card fade-up";
  card.appendChild(title);

  if (!warnings.length) {
    const copy = document.createElement("div");
    copy.className = "info-card-copy";
    copy.textContent = "No major structural issues detected.";
    card.appendChild(copy);
    el.appendChild(card);
    return;
  }

  warnings.forEach((warning) => {
    const line = document.createElement("div");
    line.className = "warning-line";
    line.textContent = `• ${warning}`;
    card.appendChild(line);
  });

  el.appendChild(card);
}

function renderColorPips(colors) {
  colorPips.innerHTML = "";
  const displayColors = colors.length ? colors : ["C"];

  for (const color of displayColors) {
    const span = document.createElement("span");
    span.className = `color-pip pip-${color}`;
    span.textContent = color;
    colorPips.appendChild(span);
  }
}

function displayCommanderCard(commanderData) {
  commanderImage.classList.add("hidden");
  commanderImageSkeleton.classList.remove("hidden");

  if (commanderData?.imageUrl) {
    commanderImage.onload = () => {
      commanderImageSkeleton.classList.add("hidden");
      commanderImage.classList.remove("hidden");
    };
    commanderImage.onerror = () => {
      commanderImageSkeleton.classList.add("hidden");
      commanderImage.classList.add("hidden");
    };
    commanderImage.src = commanderData.imageUrl;
  } else {
    commanderImage.src = "";
    commanderImage.classList.add("hidden");
    commanderImageSkeleton.classList.add("hidden");
  }

  commanderMeta.textContent = "";
  renderColorPips(commanderData.colors);
}

function clearCommanderCard() {
  commanderImage.onload = null;
  commanderImage.onerror = null;
  commanderImage.src = "";
  commanderImage.classList.add("hidden");
  commanderImageSkeleton.classList.add("hidden");
  commanderMeta.textContent = "";
  colorPips.innerHTML = "";
}

function scryfallCardUrl(cardName) {
  return `${SCRYFALL_CARD_SEARCH}${encodeURIComponent(`"${cardName}"`)}`;
}

function generateMoxfieldExport(deck, commanderName) {
  const merged = mergeDeckCounts(deck);
  const lines = [`1 ${commanderName}`];
  for (const item of merged) {
    lines.push(`${item.count} ${item.name}`);
  }
  return lines.join("\n");
}

function displayExportPreview(deck, commanderName, commanderThemes, strategyProfile, commanderColors) {
  const preview = document.getElementById("exportPreview");
  preview.innerHTML = "";

  if (!deck?.length) {
    bindPreviewHoverImages();
renderPreviewEmptyState();
    return;
  }

  const commanderSection = document.createElement("div");
  commanderSection.className = "preview-section fade-up";
  commanderSection.innerHTML = `<div class="preview-section-title">Commander</div>`;
  const commanderLine = document.createElement("div");
  commanderLine.className = "preview-line";
  const commanderSourceCard = deck.find((card) => normalizeCardName(card.name) === normalizeCardName(commanderName));
  commanderLine.innerHTML = `<span class="preview-qty">1</span> ${renderPreviewCardLink(
    commanderName,
    scryfallCardUrl(commanderName),
    getCardImageUrl(commanderSourceCard)
  )}`;
  commanderSection.appendChild(commanderLine);
  preview.appendChild(commanderSection);

  const merged = mergeDeckCounts(deck);
  const sections = new Map();

  for (const item of merged) {
    const section = getCardSection(item.type);
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(item);
  }

  const sectionOrder = ["Creatures", "Artifacts", "Enchantments", "Planeswalkers", "Instants", "Sorceries", "Lands", "Other"];
  let renderedSections = 0;

  for (const sectionName of sectionOrder) {
    const items = sections.get(sectionName);
    if (!items || !items.length) continue;

    renderedSections += 1;
    const section = document.createElement("div");
    section.className = "preview-section fade-up";
    section.innerHTML = `<div class="preview-section-title">${escapeHtml(sectionName)} <span class="preview-count">${items.reduce((sum, item) => sum + item.count, 0)}</span></div>`;

    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "preview-row";

      const line = document.createElement("div");
      line.className = "preview-line";

      const sourceCard = deck.find((c) => normalizeCardName(c.name) === normalizeCardName(item.name));
      line.innerHTML = `<span class="preview-qty">${item.count}</span> ${renderPreviewCardLink(
        item.name,
        scryfallCardUrl(item.name),
        getCardImageUrl(sourceCard)
      )}`;
      row.appendChild(line);

      const reasons = sourceCard
        ? generateCardReasons(sourceCard, commanderThemes, strategyProfile, commanderColors).map(formatThemeLabel)
        : (item.reasons || []).map(formatThemeLabel);

      if (reasons.length) {
        const badges = document.createElement("div");
        badges.className = "reason-badges";
        reasons.forEach((reason) => {
          const badge = document.createElement("span");
          badge.className = "reason-badge";
          badge.textContent = reason;
          badges.appendChild(badge);
        });
        row.appendChild(badges);
      }

      section.appendChild(row);
    });

    preview.appendChild(section);
  }

  if (renderedSections === 0) {
    renderPreviewErrorState("The deck preview did not contain any grouped cards.");
    return;
  }

  bindPreviewHoverImages();
}

function displayMoxfieldExport(deck, commanderName, commanderThemes, strategyProfile, commanderColors) {
  document.getElementById("moxfieldExport").value = generateMoxfieldExport(deck, commanderName);
  displayExportPreview(deck, commanderName, commanderThemes, strategyProfile, commanderColors);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function copyMoxfieldExport() {
  const box = document.getElementById("moxfieldExport");
  if (!box.value.trim()) return;

  try {
    await navigator.clipboard.writeText(box.value);
    showToast("Decklist copied.");
  } catch (error) {
    box.select();
    document.execCommand("copy");
    showToast("Decklist copied.");
  }
}

async function generateDeck() {
  const commanderName = commanderInput.value.trim();
  const file = document.getElementById("csvFile").files[0];

  clearLog();
  clearCommanderCard();
  updateProgress(0, "Starting...");
  displayThemes([]);
  renderLoadingState();
  document.getElementById("deckSummary").textContent = "";
  document.getElementById("deckBracket").textContent = "";
  document.getElementById("deckGameChangers").textContent = "";
  document.getElementById("buildBreakdown").textContent = "";
  document.getElementById("warningsPanel").textContent = "";
  document.getElementById("moxfieldExport").value = "";

  if (!commanderName || !file) {
    renderPreviewEmptyState("Enter a commander and upload a CSV to build a deck.");
    showToast("Enter a commander and upload a CSV.");
    updateProgress(0, "Idle");
    return;
  }

  document.getElementById("emptyState").classList.add("hidden");
  setGenerateEnabled(false);

  try {
    logMessage("Parsing uploaded CSV.");
    updateProgress(5, "Parsing CSV...");
    const collection = await parseCSV(file);
    logMessage(`Parsed ${collection.byNormalized.size} unique cards from CSV.`);

    updateProgress(10, "Validating commander...");
    logMessage(`Fetching commander info for "${commanderName}" from Scryfall.`);
    const commanderData = await getCommander(commanderName);

    if (!commanderData) throw new Error("Commander not found on Scryfall.");
    if (!canBeCommander(commanderData)) throw new Error("Selected card does not appear to be a legal commander.");

    displayCommanderCard(commanderData);
    logMessage(`Commander found: ${commanderData.name} | Color identity: ${commanderData.colors.join("") || "Colorless"}`);

    updateProgress(18, "Fetching EDHREC synergy data...");
    logMessage("Loading commander recommendations from EDHREC.");
    let edhrecData = { cards: [], tags: [], typeAverages: null, roleTargets: null };
    try {
      edhrecData = await getEDHREC(commanderData.name);
    } catch (error) {
      console.warn("Continuing without EDHREC data.", error);
      logMessage(`WARNING: EDHREC could not be reached (${error?.message || "network error"}). Falling back to theme-aware collection scoring.`);
    }
    const edhrecCards = Array.isArray(edhrecData?.cards) ? edhrecData.cards : [];
    const edhrecTags = Array.isArray(edhrecData?.tags) ? edhrecData.tags : [];
    if (edhrecCards.length) {
      logMessage(`EDHREC returned ${edhrecCards.length} candidate cards.`);
    } else {
      logMessage("No EDHREC card candidates available; using collection backfill and theme scoring only.");
    }
    if (edhrecTags.length) {
      logMessage(`Using EDHREC tags: ${edhrecTags.map(formatThemeLabel).join(", ")}`);
    }
    if (edhrecData.typeAverages) {
      const typeSummary = Object.entries(edhrecData.typeAverages)
        .filter(([, count]) => Number.isFinite(count) && count > 0)
        .map(([type, count]) => `${type}: ${count}`)
        .join(", ");
      if (typeSummary) logMessage(`Using EDHREC type targets: ${typeSummary}`);
    }
    if (edhrecData.roleTargets) {
      const roleSummary = Object.entries(edhrecData.roleTargets)
        .filter(([, count]) => Number.isFinite(count) && count > 0)
        .map(([role, count]) => `${role}: ${count}`)
        .join(", ");
      if (roleSummary) logMessage(`Using EDHREC support package targets: ${roleSummary}`);
    }

    updateProgress(30, "Fetching collection metadata for theme discovery...");
    const allOwnedNames = collection.originals.map((x) => x.rawName);
    const allOwnedCardData = await fetchCardDataBatchWithProgress(
      allOwnedNames,
      (done, total) => {
        const pct = 30 + Math.floor((done / Math.max(total, 1)) * 18);
        updateProgress(pct, "Fetching collection metadata for theme discovery...", `Fetched ${done} / ${total}`);
      }
    );

    updateProgress(50, "Detecting commander themes...");
    logMessage("Analyzing EDHREC and your collection to infer deck themes.");
    const commanderThemes = await detectCommanderThemes(
      edhrecCards,
      edhrecTags,
      collection,
      allOwnedCardData,
      commanderData.colors
    );
    displayThemes(commanderThemes);
    currentBuildMode = "balanced";
    renderPriorityButtons(commanderThemes);
    logMessage(`Detected themes: ${commanderThemes.join(", ") || "none"}`);

    updateProgress(58, "Matching your collection...");
    const ownedCandidates = edhrecCards.filter((c) => hasOwnedCard(collection, c.name));
    logMessage(`${ownedCandidates.length} EDHREC cards overlap with your collection or basic lands.`);

    updateProgress(66, "Fetching EDHREC-overlap metadata...");
    const ownedCardData = await fetchCardDataBatchWithProgress(
      ownedCandidates.map((c) => c.name),
      (done, total) => {
        const pct = 66 + Math.floor((done / Math.max(total, 1)) * 10);
        updateProgress(pct, "Fetching EDHREC-overlap metadata...", `Fetched ${done} / ${total}`);
      }
    );

    logMessage(`Received metadata for ${ownedCardData.size} owned candidate cards.`);

    currentRunContext = {
      commanderData,
      collection,
      edhrecCards,
      ownedCardData,
      allOwnedCardData,
      commanderThemes,
      typeAverages: edhrecData?.typeAverages || null,
      roleTargets: edhrecData?.roleTargets || null
    };

    await performBuildFromContext();
    document.getElementById("postBuildControls").classList.remove("hidden");
  } catch (error) {
    console.error(error);
    updateProgress(0, "Error");
    renderPreviewErrorState(error?.message || "Unable to render deck preview.");
    logMessage(`ERROR: ${error.message}`);
    showToast(error.message);
  } finally {
    setGenerateEnabled(true);
  }
}

async function regenerateWithMode(mode) {
  if (!currentRunContext) return;
  currentBuildMode = mode;
  updatePriorityButtons();
  setGenerateEnabled(false);
  try {
    logMessage(`Regenerating with priority mode: ${mode}.`);
    updateProgress(90, "Regenerating deck...", mode);
    await performBuildFromContext();
    updateProgress(100, "Deck complete!", `${currentBuildMode}`);
  } catch (error) {
    console.error(error);
    renderPreviewErrorState(error?.message || "Unable to regenerate deck preview.");
    showToast(error.message);
    logMessage(`ERROR: ${error.message}`);
  } finally {
    setGenerateEnabled(true);
  }
}

async function performBuildFromContext() {
  const {
    commanderData,
    collection,
    edhrecCards,
    ownedCardData,
    allOwnedCardData,
    commanderThemes,
    typeAverages,
    roleTargets
  } = currentRunContext;

  const strategyProfile = getCommanderStrategyProfile(
    commanderData.name,
    commanderThemes,
    commanderData.colors
  );

  const modePrefs = getModePreferences(currentBuildMode, strategyProfile);

  updateProgress(78, "Checking legality and scoring cards...");
  const scoredNonlands = [];
  let processed = 0;
  const ownedCandidates = edhrecCards.filter((c) => hasOwnedCard(collection, c.name));
  const totalToScore = ownedCandidates.length;

  for (const edhrecCard of ownedCandidates) {
    processed += 1;
    const normalizedName = normalizeCardName(edhrecCard.name);
    const card = ownedCardData.get(normalizedName);

    if (!card || getCardType(card).includes("land") || !legalForCommander(card.colors, commanderData.colors)) {
      maybeUpdateScoringProgress(processed, totalToScore);
      continue;
    }

    const role = detectRole(card);
    const score = scoreCard(
      card,
      edhrecCard,
      commanderThemes,
      strategyProfile,
      commanderData.colors,
      modePrefs
    );

    scoredNonlands.push({
      name: card.name,
      role,
      score,
      type: getCardType(card),
      cmc: card.cmc,
      colors: card.colors
    });

    maybeUpdateScoringProgress(processed, totalToScore);
  }

  function maybeUpdateScoringProgress(done, total) {
    if (done % 20 === 0 || done === total) {
      updateProgress(
        78 + Math.floor((done / Math.max(total, 1)) * 8),
        "Checking legality and scoring cards...",
        `Processed ${done} / ${total}`
      );
    }
  }

  logMessage(`After legality checks, ${scoredNonlands.length} nonland cards remain in the EDHREC candidate pool.`);

  updateProgress(90, "Building deck structure and mana base...");
  const finalDeck = buildDeckFromScoredPool(
    scoredNonlands,
    commanderData.colors,
    collection,
    allOwnedCardData,
    commanderThemes,
    commanderData.name,
    modePrefs,
    typeAverages,
    roleTargets
  );

  logMessage(`Built final deck with ${finalDeck.length} cards.`);
  logMessage(`Final deck breakdown: ${finalDeck.filter(c => c.role !== "land").length} nonlands, ${finalDeck.filter(c => c.role === "land").length} lands.`);

  const sanitizedFinalDeck = sanitizeDeckCards(finalDeck);

  const bracketInfo = estimateDeckBracket(
    sanitizedFinalDeck,
    commanderThemes,
    commanderData.colors,
    commanderData.name
  );

  const warnings = generateWarnings(sanitizedFinalDeck, commanderThemes, bracketInfo);

  updateProgress(97, "Rendering results...");
  displayDeckSummary(sanitizedFinalDeck, commanderData.name, commanderData.colors);
  renderDeckStats(sanitizedFinalDeck, commanderData.name, bracketInfo);
  displayDeckBracket(bracketInfo);
  displayGameChangers(bracketInfo);
  displayBuildBreakdown(sanitizedFinalDeck);
  displayWarnings(warnings);
  displayMoxfieldExport(sanitizedFinalDeck, commanderData.name, commanderThemes, strategyProfile, commanderData.colors);
  renderManaCurve(sanitizedFinalDeck);
  renderTypeBreakdown(sanitizedFinalDeck);

  logMessage(`Estimated ${bracketInfo.label} (score ${bracketInfo.score}).`);
  updateProgress(100, "Deck complete!", `${finalDeck.length} cards selected`);
  logMessage("Finished.");
}


bindPreviewHoverImages();
renderPreviewEmptyState();
