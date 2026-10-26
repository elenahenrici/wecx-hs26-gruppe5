/**
 * Sketch: Timeline + Palette (Elena)
 *
 * Multi selection of ARTWORKS on a timeline:
 *  - one row per artist, the bar shows the lifetime
 *  - artworks are points at the year they were made
 *  - clicking a point selects it, the artwork "falls" into the palette below
 *  - clicking it again, or the chip in the palette, deselects it
 *  - epoch filter on the left dims artists of other epochs
 *  - keyboard: Tab to a point, Enter/Space toggles,
 *    arrow left/right = previous/next artwork in time, arrow up/down = row above/below
 *
 * All selection state lives in the shared MultiSelect model (like <select multiple>).
 * This file only decides how it looks and how the user interacts with it.
 */
import { artists, artworks, epochs, artworksOfArtist, artistsOfArtwork } from "../shared/data.js";
import { MultiSelect } from "../shared/multiSelect.js";
import { DebugPanel }  from "../shared/debugPanel.js";

// ---------- configuration ----------

const START = 1440;
const END   = 1680;
const STEP  = 50;

/** one pigment colour per artist id */
const COLORS = {
    "0": "#C2416B", // Botticelli, madder rose
    "1": "#1E8A5C", // Leonardo, malachite
    "2": "#2C4BD1", // Velázquez, ultramarine
    "3": "#B8860B", // Rembrandt, ochre
    "4": "#E3412B", // Caravaggio, vermilion
};
const colorOf = artistId => COLORS[artistId] ?? "#555";

/** year → horizontal position on the track, in percent */
const position = year => `${((year - START) / (END - START)) * 100}%`;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- model ----------

const selectable = artworks.filter(work => work.year !== null && artistsOfArtwork(work.id).length > 0);
const model      = MultiSelect({ name: "artworks", options: selectable });

let activeEpoch = null; // null = all epochs

// ---------- static structure ----------

const root = document.getElementById("sketch");
root.innerHTML = `
    <div class="timeline">
        <aside class="filter" aria-label="Filter by epoch">
            <h2>Epoche</h2>
            <div class="filter-buttons"></div>
        </aside>
        <div class="board">
            <div class="axis" aria-hidden="true"></div>
            <div class="rows"></div>
        </div>
    </div>
    <section class="palette" aria-label="Selected artworks">
        <h2>Palette</h2>
        <ul class="slots"></ul>
        <p class="empty">Klick auf einen Punkt in der Timeline, um ein Kunstwerk auszuwählen.</p>
        <button type="button" class="clear">Alle entfernen</button>
    </section>
`;
const filterButtons = root.querySelector(".filter-buttons");
const axis          = root.querySelector(".axis");
const rows          = root.querySelector(".rows");
const slots         = root.querySelector(".slots");
const emptyHint     = root.querySelector(".empty");
const clearButton   = root.querySelector(".clear");

// ---------- axis ----------

for (let year = Math.ceil(START / STEP) * STEP; year <= END; year += STEP) {
    const tick = document.createElement("span");
    tick.className   = "tick";
    tick.style.left  = position(year);
    tick.textContent = year;
    axis.append(tick);
}

// ---------- epoch filter ----------

const usedEpochs = epochs.filter(epoch => artists.some(artist => artist.epochIds.includes(epoch.id)));

const filterButton = (label, epochId) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () => { activeEpoch = epochId; applyFilter(); };
    button.dataset.epoch = epochId ?? "";
    return button;
};
filterButtons.append(filterButton("Alle", null), ...usedEpochs.map(e => filterButton(e.label, e.id)));

const applyFilter = () => {
    filterButtons.querySelectorAll("button").forEach(button =>
        button.setAttribute("aria-pressed", String((button.dataset.epoch || null) === activeEpoch)));
    rows.querySelectorAll(".row").forEach(row => {
        const artist = artists.find(a => a.id === row.dataset.artist);
        row.classList.toggle("dimmed", activeEpoch !== null && !artist.epochIds.includes(activeEpoch));
    });
};

// ---------- rows: one per artist ----------

/** all point buttons, used for keyboard navigation */
const points = [];

[...artists]
    .sort((a, b) => a.birthYear - b.birthYear)
    .forEach((artist, rowIndex) => {
        const row = document.createElement("div");
        row.className = "row";
        row.dataset.artist = artist.id;
        row.style.setProperty("--color", colorOf(artist.id));
        row.innerHTML = `
            <div class="label">
                <strong>${artist.label}</strong>
                <span>${artist.birthYear}–${artist.deathYear}</span>
            </div>
            <div class="track">
                <span class="life" style="left:${position(artist.birthYear)}; width:calc(${position(artist.deathYear)} - ${position(artist.birthYear)})"></span>
            </div>`;
        const track = row.querySelector(".track");

        const works = artworksOfArtist(artist.id).filter(work => model.options.includes(work));
        if (works.length === 0) {
            const none = document.createElement("span");
            none.className = "none";
            none.style.left = position(artist.deathYear);
            none.textContent = "noch keine Werke";
            track.append(none);
        }
        works.sort((a, b) => a.year - b.year).forEach((work, i) => {
            const point = document.createElement("button");
            point.type = "button";
            point.className = "point";
            // artworks only a few years apart would overlap: move them slightly up and down
            const previous = works[i - 1], next = works[i + 1];
            if (next     && next.year - work.year < 12)     point.classList.add("up");
            if (previous && work.year - previous.year < 12) point.classList.add("down");
            point.style.left = position(work.year);
            point.dataset.id = work.id;
            point.dataset.row = String(rowIndex);
            point.setAttribute("aria-label", `${work.label}, ${work.year}, ${artist.label}`);
            point.innerHTML = `<span class="tip">${work.label} · ${work.year}</span>`;
            point.onclick = () => {
                const wasSelected = model.isSelected(work.id);
                model.toggle(work.id);
                if (!wasSelected) fallIntoPalette(point, work.id);
            };
            point.onkeydown = event => moveFocus(event, point);
            points.push(point);
            track.append(point);
        });
        rows.append(row);
    });

// ---------- keyboard navigation ----------

const byYear = () => [...points].sort((a, b) =>
    model.options.find(w => w.id === a.dataset.id).year - model.options.find(w => w.id === b.dataset.id).year);

const moveFocus = (event, point) => {
    const yearOf = p => model.options.find(w => w.id === p.dataset.id).year;
    let target = null;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        const ordered = byYear();
        const index   = ordered.indexOf(point) + (event.key === "ArrowRight" ? 1 : -1);
        target = ordered[index];
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const rowIndex = Number(point.dataset.row);
        const step     = event.key === "ArrowDown" ? 1 : -1;
        for (let r = rowIndex + step; r >= 0 && r < artists.length && !target; r += step) {
            const candidates = points.filter(p => Number(p.dataset.row) === r);
            target = candidates.sort((a, b) => Math.abs(yearOf(a) - yearOf(point)) - Math.abs(yearOf(b) - yearOf(point)))[0];
        }
    }
    if (target) { event.preventDefault(); target.focus(); }
};

// ---------- palette ----------

const renderPalette = () => {
    const selected = model.getSelectedOptions();
    slots.replaceChildren(...selected.map(work => {
        const artist = artistsOfArtwork(work.id)[0];
        const item = document.createElement("li");
        item.dataset.id = work.id;
        item.style.setProperty("--color", colorOf(artist.id));
        // only a paint blob is visible, the details appear on hover or keyboard focus
        item.innerHTML = `
            <button type="button" class="blob" aria-label="${work.label}, ${artist.label}, ${work.year}. Entfernen">
                <span class="dot"></span>
                <span class="info" aria-hidden="true">
                    <strong>${work.label}</strong>
                    <span>${artist.label} · ${work.year}</span>
                    <em>Klicken zum Entfernen</em>
                </span>
            </button>`;
        item.querySelector("button").onclick = () => fallOutOfPalette(item, work.id);
        return item;
    }));
    emptyHint.hidden   = selected.length > 0;
    clearButton.hidden = selected.length === 0;
};

clearButton.onclick = () => model.clear();

// ---------- animations ----------

/** a paint drop flies from the point and falls into its slot in the palette (simple gravity curve) */
const fallIntoPalette = (point, id) => {
    const slot = slots.querySelector(`[data-id="${id}"]`);
    if (!slot || reducedMotion) return;

    const from = point.getBoundingClientRect();
    const to   = slot.querySelector(".dot").getBoundingClientRect();
    const dx   = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy   = (to.top + to.height / 2) - (from.top + from.height / 2);

    const drop = document.createElement("div");
    drop.className  = "drop";
    drop.style.left = `${from.left + from.width / 2}px`;
    drop.style.top  = `${from.top + from.height / 2}px`;
    drop.style.background = getComputedStyle(point.closest(".row")).getPropertyValue("--color");
    document.body.append(drop);

    slot.style.opacity = "0";
    const frames = Array.from({ length: 11 }, (_, i) => {
        const t = i / 10;
        return { transform: `translate(${dx * t}px, ${dy * t * t}px)` }; // x linear, y accelerates
    });
    drop.animate(frames, { duration: 650, easing: "linear" }).finished.then(() => {
        drop.remove();
        slot.style.opacity = "";
        slot.animate([{ transform: "scale(.7)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 250 });
    });
};

/** a chip drops out of the palette, then it is deselected */
const fallOutOfPalette = (item, id) => {
    if (reducedMotion) { model.deselect(id); return; }
    item.animate(
        [{ transform: "translateY(0) rotate(0)", opacity: 1 }, { transform: "translateY(60px) rotate(18deg)", opacity: 0 }],
        { duration: 350, easing: "ease-in", fill: "forwards" }
    ).finished.then(() => model.deselect(id));
};

// ---------- wiring ----------

model.onChange(() => {
    points.forEach(point => point.setAttribute("aria-pressed", String(model.isSelected(point.dataset.id))));
    renderPalette();
});
applyFilter();

root.append(model.element, DebugPanel(model, "artworks"));

// the component behaves like a native select: other code can listen to "change"
model.element.addEventListener("change", () => console.log("change", model.getValue()));
