const SCRYFALL = "https://api.scryfall.com/cards/named?exact=";
const EDHREC = "https://json.edhrec.com/pages/commanders/";


async function generateDeck() {

    const commander = document.getElementById("commanderInput").value;
    const file = document.getElementById("csvFile").files[0];

    if (!commander || !file) {
        alert("Enter commander and upload CSV");
        return;
    }

    const collection = await parseCSV(file);

    const commanderData = await getCommander(commander);

    const edhrecCards = await getEDHREC(commander);

    const themes = await detectCommanderThemes(edhrecCards);

    displayThemes(themes);

    const deck = [];

    for (const c of edhrecCards) {

        if (!(c.name in collection)) continue;

        const card = await getCardData(c.name);

        if (!card) continue;

        if (!legalForCommander(card.colors, commanderData.colors)) continue;

        const role = detectRole(card);

        const score = scoreCard(card, c, themes);

        deck.push({
            name: c.name,
            role: role,
            score: score
        });

    }

    deck.sort((a,b) => b.score - a.score);

    displayDeck(deck.slice(0,99));

}


function parseCSV(file) {

    return new Promise((resolve) => {

        const reader = new FileReader();

        reader.onload = function(e) {

            const text = e.target.result;

            const lines = text.split("\n");

            const collection = {};

            for (let i=1;i<lines.length;i++) {

                const cols = lines[i].split(",");

                const name = cols[0];
                const qty = parseInt(cols[1]);

                if (name) collection[name] = qty;
            }

            resolve(collection);

        };

        reader.readAsText(file);

    });

}


async function getCommander(name) {

    const res = await fetch(SCRYFALL + encodeURIComponent(name));

    const data = await res.json();

    return {
        name: data.name,
        colors: data.color_identity
    };

}


async function getEDHREC(commander) {

    const slug = commander
        .toLowerCase()
        .replace(",", "")
        .replace(/ /g,"-");

    const url = EDHREC + slug + ".json";

    const res = await fetch(url);

    const data = await res.json();

    const cards = [];

    for (const section of data.container.json_dict.cardlists) {

        for (const card of section.cardviews) {

            cards.push({
                name: card.name,
                synergy: card.synergy || 0,
                decks: card.num_decks || 0
            });

        }

    }

    return cards;

}


async function getCardData(name) {

    const res = await fetch(SCRYFALL + encodeURIComponent(name));

    if (!res.ok) return null;

    const data = await res.json();

    return {
        name: data.name,
        type: data.type_line.toLowerCase(),
        text: (data.oracle_text || "").toLowerCase(),
        cmc: data.cmc,
        colors: data.color_identity
    };

}


function legalForCommander(cardColors, commanderColors) {

    for (const c of cardColors) {

        if (!commanderColors.includes(c)) return false;

    }

    return true;

}


function detectRole(card) {

    const text = card.text;
    const type = card.type;

    if (type.includes("land")) return "land";

    if (text.includes("add {") || text.includes("treasure")) return "ramp";

    if (text.includes("draw")) return "draw";

    if (text.includes("destroy target") || text.includes("exile target")) return "removal";

    if (text.includes("destroy all creatures")) return "wipe";

    return "synergy";

}


function detectCardTags(card) {

    const tags = [];

    if (card.text.includes("graveyard")) tags.push("graveyard");

    if (card.text.includes("token")) tags.push("tokens");

    if (card.type.includes("artifact")) tags.push("artifacts");

    if (card.type.includes("enchantment")) tags.push("enchantments");

    if (card.text.includes("draw")) tags.push("draw");

    if (card.text.includes("land")) tags.push("lands");

    return tags;

}


async function detectCommanderThemes(cards) {

    const themes = {
        graveyard:0,
        tokens:0,
        artifacts:0,
        enchantments:0,
        lands:0
    };

    for (let i=0;i<30;i++) {

        const card = await getCardData(cards[i].name);

        if (!card) continue;

        if (card.text.includes("graveyard")) themes.graveyard++;

        if (card.text.includes("token")) themes.tokens++;

        if (card.type.includes("artifact")) themes.artifacts++;

        if (card.type.includes("enchantment")) themes.enchantments++;

        if (card.text.includes("land")) themes.lands++;

    }

    return Object.entries(themes)
        .sort((a,b)=>b[1]-a[1])
        .slice(0,3)
        .map(t=>t[0]);

}


function scoreCard(card, edhrec, themes) {

    let score = edhrec.synergy * 5 + edhrec.decks / 1000;

    const tags = detectCardTags(card);

    for (const t of tags) {

        if (themes.includes(t)) score += 5;

    }

    return score;

}


function displayThemes(themes) {

    const ul = document.getElementById("themes");

    ul.innerHTML = "";

    themes.forEach(t => {

        const li = document.createElement("li");

        li.textContent = t;

        ul.appendChild(li);

    });

}


function displayDeck(deck) {

    const ul = document.getElementById("deck");

    ul.innerHTML = "";

    deck.forEach(card => {

        const li = document.createElement("li");

        li.textContent = `${card.name} — ${card.role} (${card.score.toFixed(2)})`;

        ul.appendChild(li);

    });

}
