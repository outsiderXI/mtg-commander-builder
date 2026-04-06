# Bulk to Bracket

Turn your bulk Magic collection into a **synergistic, bracket-aware Commander deck**.

Bulk to Bracket is a web app that lets you:

* choose any Commander
* import your **ManaBox CSV collection export**
* analyze your owned cards
* pull synergy + averages from EDHREC
* build a **100-card legal Commander deck** using only cards you actually own
* export directly into **Moxfield format**

The builder is designed to preserve **theme synergy** while also respecting the **average card type ratios used by real EDHREC decks**.

---

The build process:

1. Reads EDHREC average type mix
2. Creates target buckets per card type
3. Fills those buckets with **owned EDHREC synergy matches first**
4. Backfills missing slots from the rest of your collection using **theme-fit scoring**
5. Allows **±2 variance** when the collection cannot fully support the exact average

This prevents issues like overloading instants or underfilling creatures.


## 🚀 How It Works

### 1) Select a Commander

Start typing your commander’s name and choose from autocomplete.

### 2) Upload ManaBox CSV

Export your collection from ManaBox and upload the `.csv`.

### 3) Generate

The app will:

* parse your collection
* fetch commander info
* fetch EDHREC synergy + averages
* detect themes
* build type buckets
* fill from EDHREC overlaps
* theme-backfill missing slots
* finalize land ratios
* export the deck

---

## 📁 CSV Requirements

Designed for **ManaBox CSV exports**.

Recommended fields include:

* Name
* Quantity
* Type
* Mana Cost
* Colors
* Tags (optional)

If extra columns are present, the parser safely ignores them.

---

## ❤️ Why This Exists

Most Commander builders assume you own every card.

**Bulk to Bracket** solves the real problem:

> *How do I turn the cards I already own into the strongest, most synergistic Commander deck possible?*

This project bridges the gap between:

* **bulk collection value**
* **EDHREC crowd intelligence**
* **Commander power optimization**

all while staying true to what’s actually in your collection.

---

## 📜 License

MIT License

Feel free to fork, improve, and build your own collection-aware Commander tools.
