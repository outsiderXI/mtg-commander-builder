const SCRYFALL_NAMED = "https://api.scryfall.com/cards/named?exact=";
const SCRYFALL_AUTOCOMPLETE = "https://api.scryfall.com/cards/autocomplete?q=";
const SCRYFALL_COLLECTION = "https://api.scryfall.com/cards/collection";
const EDHREC_BASE = "https://json.edhrec.com/pages/commanders/";

const commanderInput = document.getElementById("commanderInput");
const autocompleteList = document.getElementById("autocompleteList");
const generateBtn = document.getElementById("generateBtn");
const copyExportBtn = document.getElementById("copyExportBtn");

const commanderImage = document.getElementById("commanderImage");
const commanderMeta = document.getElementById("commanderMeta");

const cardCache = new Map();

let autocompleteTimer = null;
let activeAutocompleteIndex = -1;
let currentAutocompleteItems = [];

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

generateBtn.addEventListener("click", generateDeck);
copyExportBtn.addEventListener("click", copyMoxfieldExport);
commanderInput.addEventListener("input", onCommanderInput);
commanderInput.addEventListener("keydown", onAutocompleteKeydown);

document.addEventListener("click", (event) => {
  if (!autocompleteList.contains(event.target) && event.target !== commanderInput) {
    hideAutocomplete();
  }
});

function updateProgress(percent, statusText, subStatus = "") {
  document.getElementById("progressBar").style.width = `${Math.max(0, Math.min(100, percent))}%`;
  document.getElementById("statusText").textContent = statusText;
  document.getElementById("subStatusText").textContent = subStatus;
}

function clearLog() {
  document.getElementById("activityLog").innerHTML = "";
}

function logMessage(message) {
  const log = document.getElementById("activityLog");
  const line = document.createElement("div");
  const now = new Date();
  const timestamp = now.toLocaleTimeString();
  line.className = "log-line";
  line.textContent = `[${timestamp}] ${message}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
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
  div.textContent = "Checking legal commanders...";
  autocompleteList.appendChild(div);
  autocompleteList.classList.remove("hidden");
}

async function onCommanderInput() {
  const query = commanderInput.value.trim();

  if (autocompleteTimer) {
    clearTimeout(autocompleteTimer);
  }

  if (query.length < 2) {
    hideAutocomplete();
    return;
  }

  autocompleteTimer = setTimeout(async () => {
    try {
      renderAutocompleteLoading();
      const matches = await fetchCommanderAutocomplete(query);
      const legalMatches = await filterCommanderAutocomplete(matches);
      renderAutocomplete(legalMatches);
    } catch (error) {
      console.error(error);
      hideAutocomplete();
    }
  }, 180);
}

function onAutocompleteKeydown(event) {
  if (autocompleteList.classList.contains("hidden")) {
    return;
  }

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
  const response = await fetch(`${SCRYFALL_AUTOCOMPLETE}${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error("Autocomplete request failed.");
  }

  const data = await response.json();
  return Array.isArray(data.data) ? data.data.slice(0, 12) : [];
}

async function filterCommanderAutocomplete(items) {
  if (!items.length) return [];

  const cardMap = await fetchCardDataBatchWithProgress(items);

  const legal = [];
  for (const name of items) {
    const card = cardMap.get(normalizeCardName(name));
    if (card && canBeCommander(card)) {
      legal.push(card.name);
    }
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

        if (lines.length < 2) {
          throw new Error("CSV file appears to be empty.");
        }

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
          originals.push({
            rawName,
            normalizedName,
            quantity
          });
        }

        resolve({
          byNormalized,
          originals
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Failed to read CSV file."));
    reader.readAsText(file);
  });
}

function toEdhrecSlug(name) {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/,/g, "")
    .replace(/\//g, " ")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function pickCommanderImage(data) {
  if (data.image_uris?.normal) {
    return data.image_uris.normal;
  }

  if (Array.isArray(data.card_faces)) {
    for (const face of data.card_faces) {
      if (face.image_uris?.normal) {
        return face.image_uris.normal;
      }
    }
  }

  return "";
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
  const response = await fetch(`${SCRYFALL_NAMED}${encodeURIComponent(name)}`);
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return convertScryfallCard(data);
}

async function getEDHREC(commanderName) {
  const slug = toEdhrecSlug(commanderName);
  const response = await fetch(`${EDHREC_BASE}${slug}.json`);

  if (!response.ok) {
    throw new Error("Failed to fetch EDHREC commander data.");
  }

  const data = await response.json();
  const cardlists = data?.container?.json_dict?.cardlists;

  if (!Array.isArray(cardlists)) {
    throw new Error("Unexpected EDHREC response format.");
  }

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

  return Array.from(deduped.values());
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

    const response = await fetch(SCRYFALL_COLLECTION, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ identifiers })
    });

    if (!response.ok) {
      throw new Error("Scryfall collection request failed.");
    }

    const data = await response.json();
    const returnedCards = Array.isArray(data.data) ? data.data : [];

    for (const rawCard of returnedCards) {
      const converted = convertScryfallCard(rawCard);
      cardCache.set(normalizeCardName(converted.name), converted);
    }

    for (const requestedName of chunk) {
      if (!cardCache.has(requestedName)) {
        cardCache.set(requestedName, null);
      }
    }

    done += chunk.length;
    if (progressCallback) {
      progressCallback(done, total);
    }

    await sleep(80);
  }

  const results = new Map();
  for (const name of uniqueNames) {
    const cached = cardCache.get(name);
    if (cached) {
      results.set(name, cached);
    }
  }

  return results;
}

function canBeCommander(card) {
  const type = card.type;
  const text = card.text;

  if (type.includes("legendary creature")) return true;
  if (text.includes("can be your commander")) return true;

  return false;
}

function detectTribalThemes(cards) {
  const counts = {};

  for (const tribalType of TRIBAL_TYPES) {
    counts[tribalType] = 0;
  }

  for (const card of cards) {
    if (!card) continue;

    const type = card.type;
    const text = card.text;
    const combined = `${type} ${text}`;

    for (const tribalType of TRIBAL_TYPES) {
      const pattern = new RegExp(`\\b${tribalType}\\b`, "g");
      const matches = combined.match(pattern);
      if (matches) {
        counts[tribalType] += matches.length;
      }
    }
  }

  return Object.entries(counts)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([tribe]) => `${tribe} tribal`);
}

async function detectCommanderThemes(edhrecCards) {
  const topSynergy = [...edhrecCards]
    .sort((a, b) => b.synergy - a.synergy)
    .slice(0, 36);

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
    countersMatter: 0,
    lifegain: 0,
    reanimator: 0,
    blink: 0,
    goWide: 0,
    voltron: 0
  };

  const topCardMap = await fetchCardDataBatchWithProgress(topSynergy.map((c) => c.name));
  const topCards = [];

  for (const entry of topSynergy) {
    const card = topCardMap.get(normalizeCardName(entry.name));
    if (!card) continue;

    topCards.push(card);

    const text = card.text;
    const type = card.type;

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
      themeCounts.countersMatter += 2;
    }

    if (text.includes("proliferate") || text.includes("double the number of")) {
      themeCounts.counters += 2;
      themeCounts.countersMatter += 3;
    }

    if (text.includes("graveyard")) themeCounts.graveyard += 2;

    if (text.includes("create") && text.includes("token")) {
      themeCounts.tokens += 2;
      themeCounts.goWide += 1;
    }

    if (type.includes("artifact")) themeCounts.artifacts += 1;
    if (type.includes("enchantment")) themeCounts.enchantments += 1;
    if (text.includes("landfall") || text.includes("search your library for a land")) themeCounts.lands += 2;
    if (type.includes("instant") || type.includes("sorcery")) themeCounts.spellslinger += 1;
    if (text.includes("sacrifice")) themeCounts.sacrifice += 2;
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

  const tribalThemes = detectTribalThemes(topCards);

  return [...normalThemes, ...tribalThemes].slice(0, 6);
}

function getCommanderStrategyProfile(commanderName, commanderThemes, commanderColors) {
  const normalizedName = normalizeCardName(commanderName);

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

  if (commanderThemes.includes("tokens")) profile.wantsTokens = true;
  if (commanderThemes.includes("sacrifice")) profile.wantsSacrifice = true;
  if (commanderThemes.includes("goWide")) profile.wantsGoWide = true;
  if (commanderThemes.includes("cantrips")) profile.wantsCantrips = true;
  if (commanderThemes.includes("counters")) profile.wantsCounters = true;
  if (commanderThemes.includes("group hug")) profile.wantsGroupHug = true;

  const tribalThemes = commanderThemes.filter((t) => t.endsWith(" tribal"));
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
    if (!profile.tribalTypes.includes("goblin")) {
      profile.tribalTypes.push("goblin");
    }
  }

  return profile;
}

function isCreatureCard(card) {
  return card.type.includes("creature");
}

function hasTribalType(card, tribe) {
  const pattern = new RegExp(`\\b${tribe}\\b`);
  return pattern.test(`${card.type} ${card.text}`);
}

function isTokenMaker(card) {
  return card.text.includes("create") && card.text.includes("token");
}

function isSacrificeCard(card) {
  return card.text.includes("sacrifice");
}

function isSynergisticMonoColorLand(card, commanderColors, profile) {
  const name = normalizeCardName(card.name);
  const text = card.text;

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
  if (!card.type.includes("artifact")) return false;

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

function detectRole(card) {
  const text = card.text;
  const type = card.type;

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
  const text = card.text;
  const type = card.type;
  const combined = `${type} ${text}`;

  if (text.includes("graveyard")) tags.push("graveyard");
  if (text.includes("token")) {
    tags.push("tokens");
    tags.push("goWide");
  }
  if (type.includes("artifact")) tags.push("artifacts");
  if (type.includes("enchantment")) tags.push("enchantments");
  if (text.includes("landfall") || text.includes("search your library for a land")) tags.push("lands");
  if (type.includes("instant") || type.includes("sorcery")) tags.push("spellslinger");
  if (text.includes("sacrifice")) tags.push("sacrifice");

  if (text.includes("+1/+1 counter") || text.includes("put a counter on") || text.includes("put counters on")) {
    tags.push("counters");
    tags.push("countersMatter");
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
    if (pattern.test(combined)) {
      tags.push(`${tribalType} tribal`);
    }
  }

  return tags;
}

function scoreCard(card, edhrecCard, commanderThemes, strategyProfile, commanderColors) {
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
  let themeBonus = 0;

  for (const tag of tags) {
    if (commanderThemes.includes(tag)) {
      themeBonus += 5;
    }
  }

  if (strategyProfile.wantsCreatures && isCreatureCard(card)) {
    themeBonus += 5;
  }

  if (strategyProfile.wantsTokens && isTokenMaker(card)) {
    themeBonus += 7;
  }

  if (strategyProfile.wantsSacrifice && isSacrificeCard(card)) {
    themeBonus += 6;
  }

  if (strategyProfile.wantsGoWide && isCreatureCard(card)) {
    themeBonus += 3;
  }

  if (strategyProfile.wantsTribal) {
    for (const tribe of strategyProfile.tribalTypes) {
      if (hasTribalType(card, tribe)) {
        themeBonus += 10;
      }
    }
  }

  if (commanderThemes.includes("group hug") && tags.includes("opponent draw")) {
    themeBonus += 4;
  }

  if (commanderThemes.includes("counters") && tags.includes("counters")) {
    themeBonus += 4;
  }

  if (commanderThemes.includes("cantrips") && tags.includes("cantrips")) {
    themeBonus += 3;
  }

  let penalty = 0;
  if (isLowPriorityMonoColorRock(card, commanderColors, strategyProfile)) {
    penalty += 8;
  }

  return synergyScore + popularityScore + roleBonus + curveBonus + themeBonus - penalty;
}

function scoreFallbackCard(card, commanderThemes, strategyProfile, commanderColors) {
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
  for (const tag of tags) {
    if (commanderThemes.includes(tag)) {
      score += 4;
    }
  }

  if (strategyProfile.wantsCreatures && isCreatureCard(card)) {
    score += 6;
  }

  if (strategyProfile.wantsTokens && isTokenMaker(card)) {
    score += 8;
  }

  if (strategyProfile.wantsSacrifice && isSacrificeCard(card)) {
    score += 7;
  }

  if (strategyProfile.wantsGoWide && isCreatureCard(card)) {
    score += 3;
  }

  if (strategyProfile.wantsTribal) {
    for (const tribe of strategyProfile.tribalTypes) {
      if (hasTribalType(card, tribe)) {
        score += 12;
      }
    }
  }

  if (isLowPriorityMonoColorRock(card, commanderColors, strategyProfile)) {
    score -= 8;
  }

  return score;
}

function legalForCommander(cardColors, commanderColors) {
  for (const color of cardColors) {
    if (!commanderColors.includes(color)) {
      return false;
    }
  }
  return true;
}

function recommendLandCount(commanderColors) {
  if (commanderColors.length === 0) return 38;
  if (commanderColors.length === 1) return 36;
  if (commanderColors.length === 2) return 37;
  return 38;
}

function landEntersTappedPenalty(card) {
  const text = card.text;
  if (text.includes("enters tapped")) return 1.5;
  return 0;
}

function evaluateNonbasicLand(card, commanderColors, strategyProfile) {
  if (!card.type.includes("land")) return null;
  if (isBasicLand(card.name)) return null;

  const produced = Array.isArray(card.producedMana) ? card.producedMana : [];
  const relevantProduced = produced.filter((c) => commanderColors.includes(c));

  let score = 0;
  score += relevantProduced.length * 5;

  const lowerName = card.name.toLowerCase();
  const normalizedName = normalizeCardName(card.name);

  if (normalizedName === "command tower") score += 10;
  if (normalizedName === "exotic orchard") score += 8;
  if (lowerName.includes("triome")) score += 8;
  if (lowerName.includes("pathway")) score += 6;
  if (card.text.includes("add one mana of any color")) score += 7;
  if (card.text.includes("add one mana of any type")) score += 6;

  if (strategyProfile.monoColor) {
    if (!isSynergisticMonoColorLand(card, commanderColors, strategyProfile)) {
      score -= 12;
    }
    if (isLowPriorityMonoColorFixer(card, commanderColors)) {
      score -= 12;
    }
  }

  score -= landEntersTappedPenalty(card);

  return {
    name: card.name,
    role: "land",
    score,
    type: card.type,
    cmc: 0,
    colors: produced
  };
}

function buildNonbasicManaBase(collectionData, allOwnedCardData, commanderColors, targetLandCount, strategyProfile) {
  const landPool = [];
  const seen = new Set();

  for (const entry of collectionData.originals) {
    const normalizedName = entry.normalizedName;
    if (seen.has(normalizedName)) continue;
    seen.add(normalizedName);

    const card = allOwnedCardData.get(normalizedName);
    if (!card) continue;
    if (!card.type.includes("land")) continue;
    if (isBasicLand(card.name)) continue;
    if (!legalForCommander(card.colors, commanderColors)) continue;

    const landCandidate = evaluateNonbasicLand(card, commanderColors, strategyProfile);
    if (!landCandidate) continue;

    landPool.push({ ...landCandidate });
  }

  landPool.sort((a, b) => b.score - a.score);

  if (strategyProfile.monoColor) {
    return landPool.filter((l) => l.score > 0).slice(0, Math.min(8, targetLandCount));
  }

  return landPool.slice(0, targetLandCount);
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
      colors: []
    }));
  }

  const sourceCounts = {};
  for (const color of commanderColors) {
    sourceCounts[color] = 0;
  }

  for (const land of selectedNonbasics) {
    const produced = Array.isArray(land.colors) ? land.colors : [];
    for (const color of produced) {
      if (sourceCounts[color] !== undefined) {
        sourceCounts[color] += 1;
      }
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
      colors: [color]
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
  commanderName
) {
  const deck = [];
  const usedNames = new Set();
  const normalizedCommander = normalizeCardName(commanderName);
  const strategyProfile = getCommanderStrategyProfile(commanderName, commanderThemes, commanderColors);

  const targetLandCount = recommendLandCount(commanderColors);
  const targetNonlandCount = 99 - targetLandCount;

  const targets = {
    ramp: 10,
    draw: 10,
    removal: 8,
    wipe: 3
  };

  const minimumCreatureCount = strategyProfile.wantsCreatures
    ? (strategyProfile.wantsTribal || strategyProfile.wantsGoWide ? 24 : 18)
    : 10;

  const byRole = {
    ramp: [],
    draw: [],
    removal: [],
    wipe: [],
    synergy: []
  };

  for (const card of scoredNonlands) {
    if (byRole[card.role]) {
      byRole[card.role].push(card);
    } else {
      byRole.synergy.push(card);
    }
  }

  for (const role of Object.keys(byRole)) {
    byRole[role].sort((a, b) => b.score - a.score);
  }

  for (const [role, count] of Object.entries(targets)) {
    let addedForRole = 0;

    for (const card of byRole[role]) {
      if (deck.length >= targetNonlandCount) break;

      const key = normalizeCardName(card.name);
      if (usedNames.has(key)) continue;
      if (key === normalizedCommander) continue;

      deck.push(card);
      usedNames.add(key);
      addedForRole += 1;

      if (addedForRole >= count) break;
    }
  }

  const rankedEdhrecPool = [
    ...byRole.synergy,
    ...byRole.ramp,
    ...byRole.draw,
    ...byRole.removal,
    ...byRole.wipe
  ].sort((a, b) => b.score - a.score);

  for (const card of rankedEdhrecPool) {
    if (deck.length >= targetNonlandCount) break;

    const key = normalizeCardName(card.name);
    if (usedNames.has(key)) continue;
    if (key === normalizedCommander) continue;

    deck.push(card);
    usedNames.add(key);
  }

  const currentCreatureCount = () => deck.filter((c) => c.type.includes("creature")).length;

  if (currentCreatureCount() < minimumCreatureCount) {
    const creatureFallbackPool = [];
    const seenCreatures = new Set();

    for (const entry of collectionData.originals) {
      const normalizedName = entry.normalizedName;

      if (seenCreatures.has(normalizedName)) continue;
      seenCreatures.add(normalizedName);

      if (normalizedName === normalizedCommander) continue;
      if (usedNames.has(normalizedName)) continue;

      const card = allOwnedCardData.get(normalizedName);
      if (!card) continue;
      if (!card.type.includes("creature")) continue;
      if (!legalForCommander(card.colors, commanderColors)) continue;

      creatureFallbackPool.push({
        name: card.name,
        role: detectRole(card),
        score: scoreFallbackCard(card, commanderThemes, strategyProfile, commanderColors) + 10,
        type: card.type,
        cmc: card.cmc,
        colors: card.colors
      });
    }

    creatureFallbackPool.sort((a, b) => b.score - a.score);

    for (const card of creatureFallbackPool) {
      if (currentCreatureCount() >= minimumCreatureCount) break;
      if (deck.length >= targetNonlandCount) break;

      const key = normalizeCardName(card.name);
      if (usedNames.has(key)) continue;

      deck.push(card);
      usedNames.add(key);
    }
  }

  if (deck.length < targetNonlandCount) {
    const fallbackPool = [];
    const seenFallback = new Set();

    for (const entry of collectionData.originals) {
      const normalizedName = entry.normalizedName;

      if (seenFallback.has(normalizedName)) continue;
      seenFallback.add(normalizedName);

      if (normalizedName === normalizedCommander) continue;
      if (usedNames.has(normalizedName)) continue;

      const card = allOwnedCardData.get(normalizedName);
      if (!card) continue;
      if (card.type.includes("land")) continue;
      if (!legalForCommander(card.colors, commanderColors)) continue;

      fallbackPool.push({
        name: card.name,
        role: detectRole(card),
        score: scoreFallbackCard(card, commanderThemes, strategyProfile, commanderColors),
        type: card.type,
        cmc: card.cmc,
        colors: card.colors
      });
    }

    fallbackPool.sort((a, b) => b.score - a.score);

    for (const card of fallbackPool) {
      if (deck.length >= targetNonlandCount) break;

      const key = normalizeCardName(card.name);
      if (usedNames.has(key)) continue;
      if (key === normalizedCommander) continue;

      deck.push(card);
      usedNames.add(key);
    }
  }

  const selectedNonbasicLands = buildNonbasicManaBase(
    collectionData,
    allOwnedCardData,
    commanderColors,
    targetLandCount,
    strategyProfile
  );

  let remainingLandCount = targetLandCount - selectedNonbasicLands.length;
  if (remainingLandCount < 0) remainingLandCount = 0;

  let basicLands = buildBasicManaBase(
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
        count: 1
      });
    } else {
      map.get(key).count += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function displayThemes(themes) {
  const ul = document.getElementById("themes");
  ul.innerHTML = "";

  if (!themes.length) {
    const li = document.createElement("li");
    li.textContent = "No clear themes detected.";
    ul.appendChild(li);
    return;
  }

  themes.forEach((theme) => {
    const li = document.createElement("li");
    li.textContent = theme;
    ul.appendChild(li);
  });
}

function displayDeckSummary(deck, commanderName, commanderColors) {
  const summary = document.getElementById("deckSummary");

  const nonlands = deck.filter((c) => c.role !== "land").length;
  const lands = deck.filter((c) => c.role === "land").length;
  const creatures = deck.filter((c) => c.type.includes("creature")).length;
  const colorText = commanderColors.length ? commanderColors.join("") : "Colorless";

  summary.textContent =
    `Commander: ${commanderName}
Color Identity: ${colorText}
Total Cards: ${deck.length}
Creatures: ${creatures}
Nonlands: ${nonlands}
Lands: ${lands}`;
}

function displayCommanderCard(commanderData) {
  if (commanderData?.imageUrl) {
    commanderImage.src = commanderData.imageUrl;
    commanderImage.classList.remove("hidden");
  } else {
    commanderImage.src = "";
    commanderImage.classList.add("hidden");
  }

  const colorText = commanderData.colors.length ? commanderData.colors.join("") : "Colorless";
  commanderMeta.textContent =
    `Name: ${commanderData.name}
Mana Cost: ${commanderData.manaCost || "-"}
Type: ${commanderData.rawType || "-"}
Color Identity: ${colorText}`;
}

function clearCommanderCard() {
  commanderImage.src = "";
  commanderImage.classList.add("hidden");
  commanderMeta.textContent = "";
}

function generateMoxfieldExport(deck, commanderName) {
  const merged = mergeDeckCounts(deck);
  const lines = [`1 ${commanderName}`];

  for (const item of merged) {
    lines.push(`${item.count} ${item.name}`);
  }

  return lines.join("\n");
}

function displayMoxfieldExport(deck, commanderName) {
  document.getElementById("moxfieldExport").value = generateMoxfieldExport(deck, commanderName);
}

async function copyMoxfieldExport() {
  const box = document.getElementById("moxfieldExport");
  if (!box.value.trim()) return;

  try {
    await navigator.clipboard.writeText(box.value);
    alert("Decklist copied.");
  } catch (error) {
    box.select();
    document.execCommand("copy");
    alert("Decklist copied.");
  }
}

async function generateDeck() {
  const commanderName = commanderInput.value.trim();
  const file = document.getElementById("csvFile").files[0];

  clearLog();
  clearCommanderCard();
  updateProgress(0, "Starting...");
  displayThemes([]);
  document.getElementById("deckSummary").textContent = "";
  document.getElementById("moxfieldExport").value = "";

  if (!commanderName || !file) {
    alert("Enter a commander and upload a ManaBox CSV.");
    updateProgress(0, "Idle");
    return;
  }

  setGenerateEnabled(false);

  try {
    logMessage("Parsing uploaded CSV.");
    updateProgress(5, "Parsing CSV...");
    const collection = await parseCSV(file);
    logMessage(`Parsed ${collection.byNormalized.size} unique cards from CSV.`);

    updateProgress(10, "Validating commander...");
    logMessage(`Fetching commander info for "${commanderName}" from Scryfall.`);
    const commanderData = await getCommander(commanderName);

    if (!commanderData) {
      throw new Error("Commander not found on Scryfall.");
    }

    if (!canBeCommander(commanderData)) {
      throw new Error("Selected card does not appear to be a legal commander.");
    }

    displayCommanderCard(commanderData);
    logMessage(`Commander found: ${commanderData.name} | Color identity: ${commanderData.colors.join("") || "Colorless"}`);

    updateProgress(18, "Fetching EDHREC synergy data...");
    logMessage("Loading commander recommendations from EDHREC.");
    const edhrecCards = await getEDHREC(commanderData.name);

    if (!edhrecCards.length) {
      throw new Error("No EDHREC data returned for this commander.");
    }

    logMessage(`EDHREC returned ${edhrecCards.length} candidate cards.`);

    updateProgress(28, "Detecting commander themes...");
    logMessage("Analyzing top synergy cards to infer deck themes.");
    const commanderThemes = await detectCommanderThemes(edhrecCards);
    displayThemes(commanderThemes);
    logMessage(`Detected themes: ${commanderThemes.join(", ") || "none"}`);

    const strategyProfile = getCommanderStrategyProfile(
      commanderData.name,
      commanderThemes,
      commanderData.colors
    );

    updateProgress(38, "Matching your collection...");
    const ownedCandidates = edhrecCards.filter((c) => hasOwnedCard(collection, c.name));
    logMessage(`${ownedCandidates.length} EDHREC cards overlap with your collection or basic lands.`);

    updateProgress(46, "Fetching owned card metadata from Scryfall...");
    logMessage("Batching Scryfall metadata requests for owned EDHREC candidates.");
    const ownedCardData = await fetchCardDataBatchWithProgress(
      ownedCandidates.map((c) => c.name),
      (done, total) => {
        const pct = 46 + Math.floor((done / Math.max(total, 1)) * 18);
        updateProgress(pct, "Fetching owned card metadata from Scryfall...", `Fetched ${done} / ${total}`);
      }
    );

    logMessage(`Received metadata for ${ownedCardData.size} owned candidate cards.`);

    updateProgress(66, "Fetching all owned card metadata...");
    const allOwnedNames = collection.originals.map((x) => x.rawName);
    logMessage("Loading metadata for all owned cards so the builder can backfill missing slots and use real nonbasic lands.");
    const allOwnedCardData = await fetchCardDataBatchWithProgress(
      allOwnedNames,
      (done, total) => {
        const pct = 66 + Math.floor((done / Math.max(total, 1)) * 10);
        updateProgress(pct, "Fetching all owned card metadata...", `Fetched ${done} / ${total}`);
      }
    );

    updateProgress(78, "Checking legality and scoring cards...");
    const scoredNonlands = [];
    let processed = 0;
    const totalToScore = ownedCandidates.length;

    for (const edhrecCard of ownedCandidates) {
      processed += 1;

      const normalizedName = normalizeCardName(edhrecCard.name);
      const card = ownedCardData.get(normalizedName);

      if (!card) {
        maybeUpdateScoringProgress(processed, totalToScore);
        continue;
      }

      if (card.type.includes("land")) {
        maybeUpdateScoringProgress(processed, totalToScore);
        continue;
      }

      if (!legalForCommander(card.colors, commanderData.colors)) {
        maybeUpdateScoringProgress(processed, totalToScore);
        continue;
      }

      const role = detectRole(card);
      const score = scoreCard(
        card,
        edhrecCard,
        commanderThemes,
        strategyProfile,
        commanderData.colors
      );

      scoredNonlands.push({
        name: card.name,
        role,
        score,
        type: card.type,
        cmc: card.cmc,
        colors: card.colors
      });

      maybeUpdateScoringProgress(processed, totalToScore);
    }

    function maybeUpdateScoringProgress(done, total) {
      if (done % 20 === 0 || done === total) {
        updateProgress(
          78 + Math.floor((done / Math.max(total, 1)) * 10),
          "Checking legality and scoring cards...",
          `Processed ${done} / ${total}`
        );
      }
    }

    logMessage(`After legality checks, ${scoredNonlands.length} nonland cards remain in the EDHREC candidate pool.`);

    updateProgress(90, "Building deck structure and mana base...");
    logMessage("Selecting EDHREC matches, backfilling from the rest of your collection, then filling remaining slots with lands.");
    const finalDeck = buildDeckFromScoredPool(
      scoredNonlands,
      commanderData.colors,
      collection,
      allOwnedCardData,
      commanderThemes,
      commanderData.name
    );

    logMessage(`Built final deck with ${finalDeck.length} cards.`);
    logMessage(`Final deck breakdown: ${finalDeck.filter(c => c.role !== "land").length} nonlands, ${finalDeck.filter(c => c.role === "land").length} lands.`);

    updateProgress(97, "Rendering results...");
    displayDeckSummary(finalDeck, commanderData.name, commanderData.colors);
    displayMoxfieldExport(finalDeck, commanderData.name);

    updateProgress(100, "Deck complete!", `${finalDeck.length} cards selected`);
    logMessage("Finished.");
  } catch (error) {
    console.error(error);
    updateProgress(0, "Error");
    logMessage(`ERROR: ${error.message}`);
    alert(error.message);
  } finally {
    setGenerateEnabled(true);
  }
}
