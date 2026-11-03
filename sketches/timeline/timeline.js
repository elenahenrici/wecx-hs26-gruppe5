/**
 * Sketch: Timeline + Palette (Elena)
 *
 * Multi selection of ARTWORKS on a timeline:
 *  - one row per artist, the bar shows the lifetime
 *  - artworks are points at the year they were made
 *  - clicking a point selects it, the artwork "falls" into the palette below
 *  - clicking it again, or the chip in the palette, deselects it
 *  - epochs are buttons side by side above the timeline.
 *    Clicking one marks its time span on the whole timeline and dims artists of other epochs,
 *    clicking it again (or "Alle") shows everything again
 *  - several palettes (e.g. "Ausstellung Louvre") as tabs on top of the palette, a click on a tab opens it.
 *    Each tab is also a drop target: drag a point onto a tab to put it into that palette,
 *    onto "Noch nicht zugeordnet" to take it off the timeline, no matter which palette is open.
 *    The "+" tab adds a new, empty palette. The × on a tab (or Delete on a focused tab) removes a palette,
 *    except "Noch nicht zugeordnet". The artworks stay on the timeline, and "Rückgängig" brings it back.
 *    Clicks on the timeline always go into the active palette.
 *  - palette "Noch nicht zugeordnet" holds artworks that have no place on the timeline yet.
 *    Drag one onto an artist's row: the row sets the artist, the position sets the year.
 *    Then it appears on the timeline and leaves this palette.
 *    The other way round: drag a point onto the palette, or click it (or press Delete) while
 *    "Noch nicht zugeordnet" is active, and it loses artist and year and goes back there.
 *    Dragging a point onto another row or position moves it. Dropping it on another palette adds it there.
 *  - keyboard: Tab to a point, Enter/Space toggles,
 *    arrow left/right = previous/next artwork in time, arrow up/down = row above/below
 *
 * Each palette has its own shared MultiSelect model (like one <select multiple> per palette).
 * This file only decides how it looks and how the user interacts with it.
 */
import { artists, artworks as courseArtworks, epochs, artistById, artistsOfArtwork } from "../shared/data.js";
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

/**
 * Approximate time spans of the epochs (the course data has no years for epochs).
 * Kept here so shared/data.js stays untouched. Epochs outside START..END are not shown.
 */
const EPOCH_YEARS = {
    "0": { from: -800, to:  500, color: "#9a9a9a" },   // Classic (antiquity)
    "1": { from: 1150, to: 1500, color: "#7d6bb3" },   // Gothic
    "2": { from: 1420, to: 1600, color: "#c08a3e" },   // Renaissance
    "3": { from: 1600, to: 1750, color: "#4f86b0" },   // Baroque
    "4": { from: 1860, to: 1900, color: "#5aa58a" },   // Impressionism
};
const clampYear = year => Math.max(START, Math.min(END, year));

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- model ----------

/**
 * Extra example artworks for the palette "Noch nicht zugeordnet": real works of our five artists,
 * on purpose WITHOUT artist and year, so they can be placed on the timeline by drag and drop.
 * Only used in this sketch, the course data stays untouched.
 */
const EXAMPLE_ARTWORKS = [
    { id: "x1", label: "Adoration of the Magi",          material: "Tempera on Panel" },
    { id: "x2", label: "The Last Supper",                material: "Tempera on Gesso" },
    { id: "x3", label: "Lady with an Ermine",            material: "Oil on Panel" },
    { id: "x4", label: "The Calling of Saint Matthew",   material: "Oil on Canvas" },
    { id: "x5", label: "Judith Beheading Holofernes",    material: "Oil on Canvas" },
    { id: "x6", label: "The Surrender of Breda",         material: "Oil on Canvas" },
    { id: "x7", label: "Self-Portrait with Two Circles", material: "Oil on Canvas" },
].map(work => ({ ...work, year: null, pictureUrl: "" }));

const artworks = [...courseArtworks, ...EXAMPLE_ARTWORKS];

// assignments changed here by drag and drop (shared/data.js stays untouched)
const placedArtist  = new Map();   // artworkId → artistId, set by dropping on a row
const removedArtist = new Set();   // artworkIds whose original artist was taken away (back to the palette)

const artistOf = work => {
    if (placedArtist.has(work.id))  return artistById(placedArtist.get(work.id));
    if (removedArtist.has(work.id)) return undefined;
    return artistsOfArtwork(work.id)[0];
};
const isPlaced  = work => work.year !== null && artistOf(work) !== undefined;   // has a place on the timeline
const workById  = id   => artworks.find(w => w.id === id);
const unassigned = artworks.filter(work => !isPlaced(work));

const palettes = [
    { id: "mine",   label: "Meine Auswahl",         editable: true,
      model: MultiSelect({ name: "palette-mine",   options: artworks }) },
    { id: "louvre", label: "Ausstellung Louvre",    editable: true,
      model: MultiSelect({ name: "palette-louvre", options: artworks }) },
    // not editable by clicking: artworks leave it by being dragged onto the timeline
    { id: "open",   label: "Noch nicht zugeordnet", editable: false,
      model: MultiSelect({ name: "palette-open",   options: artworks }) },
];
palettes.find(p => p.id === "louvre").model.select("2");                      // Mona Lisa hangs in the Louvre
unassigned.forEach(work => palettes.find(p => p.id === "open").model.select(work.id));

let active = palettes[0];

let activeEpoch = null; // null = all epochs

// ---------- static structure ----------

const root = document.getElementById("sketch");
root.innerHTML = `
    <div class="timeline">
        <div class="board">
            <div class="epoch-row" role="group" aria-label="Epoche">
                <div class="epoch-label">
                    <h2>Epoche</h2>
                    <button type="button" class="epoch-all">Alle</button>
                </div>
                <div class="epochs"></div>
            </div>
            <div class="axis" aria-hidden="true"></div>
            <div class="rows">
                <div class="band-layer" aria-hidden="true"><div class="band"><span></span></div></div>
            </div>
        </div>
    </div>
    <section class="palette" aria-label="Palette">
        <div class="tabs" role="tablist" aria-label="Paletten"></div>
        <ul class="slots"></ul>
        <p class="empty">Klick auf einen Punkt in der Timeline, um ein Kunstwerk auszuwählen.</p>
        <p class="note"></p>
        <button type="button" class="clear">Alle entfernen</button>
    </section>
`;
const epochBar      = root.querySelector(".epochs");
const allButton     = root.querySelector(".epoch-all");
const band          = root.querySelector(".band");
const axis          = root.querySelector(".axis");
const rows          = root.querySelector(".rows");
const slots         = root.querySelector(".slots");
const emptyHint     = root.querySelector(".empty");
const clearButton   = root.querySelector(".clear");
const paletteEl     = root.querySelector(".palette");
const tabBar        = root.querySelector(".tabs");
const note          = root.querySelector(".note");

// ---------- axis ----------

for (let year = Math.ceil(START / STEP) * STEP; year <= END; year += STEP) {
    const tick = document.createElement("span");
    tick.className   = "tick";
    tick.style.left  = position(year);
    tick.textContent = year;
    axis.append(tick);
}

// ---------- epochs above the timeline ----------

// only epochs that overlap the visible years
const shownEpochs = epochs
    .filter(e => EPOCH_YEARS[e.id] && EPOCH_YEARS[e.id].to > START && EPOCH_YEARS[e.id].from < END)
    .sort((a, b) => EPOCH_YEARS[a.id].from - EPOCH_YEARS[b.id].from);

const epochButtons = shownEpochs.map(epoch => {
    const { from, to, color } = EPOCH_YEARS[epoch.id];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "epoch";
    button.dataset.epoch = epoch.id;
    button.style.setProperty("--epoch", color);
    button.textContent = epoch.label;
    button.title = `${epoch.label}, ca. ${from}–${to}`;
    button.onclick = () => { activeEpoch = activeEpoch === epoch.id ? null : epoch.id; applyFilter(); }; // again = off
    return button;
});
epochBar.append(...epochButtons);
allButton.onclick = () => { activeEpoch = null; applyFilter(); };

const applyFilter = () => {
    epochButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.epoch === activeEpoch)));
    allButton.setAttribute("aria-pressed", String(activeEpoch === null));

    // the band marks the time span of the epoch on the whole timeline
    band.hidden = activeEpoch === null;
    if (activeEpoch !== null) {
        const { from, to, color } = EPOCH_YEARS[activeEpoch];
        band.style.left  = position(clampYear(from));
        band.style.width = `calc(${position(clampYear(to))} - ${position(clampYear(from))})`;
        band.style.setProperty("--epoch", color);
        band.querySelector("span").textContent = `${from}–${to}`;
    }

    rows.querySelectorAll(".row").forEach(row => {
        const artist = artists.find(a => a.id === row.dataset.artist);
        row.classList.toggle("dimmed", activeEpoch !== null && !artist.epochIds.includes(activeEpoch));
    });
};

// ---------- rows: one per artist ----------

/** all point buttons, used for keyboard navigation */
let points = [];

/** year at a horizontal mouse position on a track, kept inside the artist's lifetime */
const yearAt = (track, clientX, artist) => {
    const box   = track.getBoundingClientRect();
    const ratio = (clientX - box.left) / box.width;
    const year  = Math.round(START + ratio * (END - START));
    return Math.max(artist.birthYear, Math.min(artist.deathYear, year));
};

/** (re)builds the points of one row, needed again after an artwork was dropped on it */
const renderPoints = (row, artist, rowIndex) => {
    const track = row.querySelector(".track");
    track.querySelectorAll(".point, .none").forEach(el => el.remove());
    points = points.filter(p => p.dataset.row !== String(rowIndex));

    const works = artworks.filter(work => isPlaced(work) && artistOf(work).id === artist.id);
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
        point.setAttribute("aria-pressed", String(active.model.isSelected(work.id)));
        point.innerHTML = `<span class="tip">${work.label} · ${work.year}</span>`;
        point.onclick = () => {
            if (!active.editable) { sendBack(work, point); return; }   // "Noch nicht zugeordnet": back to the palette
            const wasSelected = active.model.isSelected(work.id);
            active.model.toggle(work.id);
            if (!wasSelected) fallIntoPalette(point, work.id);
        };
        point.onkeydown = event => {
            if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); sendBack(work, point); return; }
            moveFocus(event, point);
        };
        // drag the point onto another row (move it) or onto the palette
        point.draggable = true;
        point.addEventListener("dragstart", event => {
            event.dataTransfer.setData(DRAG_TYPE, work.id);
            event.dataTransfer.effectAllowed = "move";
            rows.classList.add("dropping");
            paletteEl.classList.add("dropping");
            tabBar.classList.add("dropping");
        });
        point.addEventListener("dragend", endDrag);
        points.push(point);
        track.append(point);
    });
};

/** a row accepts artworks dragged out of the palette "Noch nicht zugeordnet" */
const makeDropTarget = (row, artist, rowIndex) => {
    const track  = row.querySelector(".track");
    const marker = document.createElement("span");          // shows where the artwork would land
    marker.className = "drop-marker";
    marker.hidden = true;
    track.append(marker);

    const isOurDrag = event => event.dataTransfer.types.includes(DRAG_TYPE);
    const hide = () => { marker.hidden = true; track.classList.remove("drag-over"); };

    track.addEventListener("dragover", event => {
        if (!isOurDrag(event)) return;
        event.preventDefault();                              // allows the drop
        const year = yearAt(track, event.clientX, artist);
        marker.hidden = false;
        marker.style.left = position(year);
        marker.textContent = year;
        track.classList.add("drag-over");
    });
    track.addEventListener("dragleave", event => { if (!track.contains(event.relatedTarget)) hide(); });
    track.addEventListener("drop", event => {
        if (!isOurDrag(event)) return;
        event.preventDefault();
        hide();
        const work = workById(event.dataTransfer.getData(DRAG_TYPE));
        if (!work) return;
        placeOnTimeline(work, artist, yearAt(track, event.clientX, artist), row, rowIndex);
    });
};

const endDrag = () => ["dropping", "drag-over"].forEach(cls =>
    [rows, paletteEl, tabBar, ...tabBar.querySelectorAll(".tab")].forEach(el => el.classList.remove(cls)));

/** all rows, so every row can be rebuilt after a move */
const rowInfos = [];
const renderAllPoints = () => rowInfos.forEach(({ row, artist, rowIndex }) => renderPoints(row, artist, rowIndex));

/** gives the artwork its artist and year, shows it on the row and takes it out of "Noch nicht zugeordnet" */
const placeOnTimeline = (work, artist, year, row, rowIndex) => {
    work.year = year;
    placedArtist.set(work.id, artist.id);
    removedArtist.delete(work.id);
    renderAllPoints();                                              // it might come from another row
    palettes.find(p => p.id === "open").model.deselect(work.id);   // re-renders the palette
    const point = points.find(p => p.dataset.id === work.id);
    if (point && !reducedMotion) {
        point.animate([{ scale: "2" }, { scale: "1" }], { duration: 300, easing: "ease-out" });
    }
};

/** the other way round: the artwork loses artist and year and goes back to "Noch nicht zugeordnet" */
const unassign = work => {
    work.year = null;
    placedArtist.delete(work.id);
    removedArtist.add(work.id);
    renderAllPoints();
    palettes.find(p => p.id === "open").model.select(work.id);      // re-renders the palette
};

/** like unassign, but the paint drop flies from the point into the palette (only when that palette is visible) */
const sendBack = (work, point) => {
    if (!isPlaced(work)) return;
    const from  = point.getBoundingClientRect();                     // read before the point disappears
    const color = getComputedStyle(point.closest(".row")).getPropertyValue("--color");
    unassign(work);
    if (active.id === "open") fallIntoPalette(point, work.id, from, color);
    else showPalette("open");
};

const DRAG_TYPE = "text/x-artwork-id";

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
        rowInfos.push({ row, artist, rowIndex });
        renderPoints(row, artist, rowIndex);
        makeDropTarget(row, artist, rowIndex);
        rows.append(row);
    });

// ---------- keyboard navigation ----------

const yearOfPoint = p => workById(p.dataset.id).year;
const byYear = () => [...points].sort((a, b) => yearOfPoint(a) - yearOfPoint(b));

const moveFocus = (event, point) => {
    const yearOf = yearOfPoint;
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

/** what dropping an artwork on a palette means: add it, or for "Noch nicht zugeordnet" take it off the timeline */
const dropInto = (palette, work) => {
    if (palette.editable)   palette.model.select(work.id);
    else if (isPlaced(work)) unassign(work);
};

// tabs: one per palette, with the number of artworks. Click = open, drop = put the artwork in there
const createTab = p => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.setAttribute("role", "tab");
    tab.dataset.palette = p.id;
    tab.innerHTML = `<span class="tab-label">${p.label}</span> <span class="count"></span><span class="drop-hint">${p.editable ? "hier hinein" : "zurück"}</span>`;
    tab.querySelector(".tab-label").textContent = p.label;   // typed names are text, never HTML
    tab.onclick = () => showPalette(p.id);

    tab.addEventListener("dragover", event => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();                       // not the palette body below
        tab.classList.add("drag-over");
    });
    tab.addEventListener("dragleave", () => tab.classList.remove("drag-over"));
    tab.addEventListener("drop", event => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();
        endDrag();
        const work = workById(event.dataTransfer.getData(DRAG_TYPE));
        if (!work) return;
        dropInto(p, work);
        if (!reducedMotion) tab.animate([{ scale: "1.12" }, { scale: "1" }], { duration: 250 });
    });

    // the tab and its × sit side by side in a wrapper (a button inside a button is not allowed)
    const wrap = document.createElement("span");
    wrap.className = "tab-wrap";
    wrap.append(tab);
    if (p.editable) {                                  // "Noch nicht zugeordnet" cannot be deleted
        const close = document.createElement("button");
        close.type = "button";
        close.className = "tab-close";
        close.textContent = "×";
        close.setAttribute("aria-label", `Palette ${p.label} löschen`);
        close.onclick = () => deletePalette(p);
        wrap.append(close);
        tab.addEventListener("keydown", event => {
            if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deletePalette(p); }
        });
    }
    tab.wrap = wrap;
    return tab;
};
const tabs = palettes.map(createTab);
tabBar.append(...tabs.map(tab => tab.wrap));

// "+" at the end: type a name, Enter adds a new empty palette, Escape cancels
const addButton = document.createElement("button");
addButton.type = "button";
addButton.className = "tab add";
addButton.textContent = "+";
addButton.title = "Neue Palette";
addButton.setAttribute("aria-label", "Neue Palette hinzufügen");
tabBar.append(addButton);

const nameInput = document.createElement("input");
nameInput.type = "text";
nameInput.className = "tab-name";
nameInput.placeholder = "Name der Palette";
nameInput.setAttribute("aria-label", "Name der neuen Palette");
nameInput.hidden = true;
tabBar.append(nameInput);

const closeNameInput = () => { nameInput.hidden = true; addButton.hidden = false; nameInput.value = ""; };
addButton.onclick = () => { addButton.hidden = true; nameInput.hidden = false; nameInput.focus(); };
nameInput.onkeydown = event => {
    if (event.key === "Escape") { closeNameInput(); addButton.focus(); return; }
    if (event.key !== "Enter") return;
    const label = nameInput.value.trim();
    if (!label) { closeNameInput(); return; }
    closeNameInput();
    addPalette(label);
};
nameInput.onblur = () => { if (!nameInput.hidden) closeNameInput(); };   // click elsewhere = cancel

let paletteCounter = 0;
/** creates a new editable palette with its own model, tab and debug panel, and opens it */
const addPalette = label => {
    const id = `custom-${++paletteCounter}`;
    const palette = { id, label, editable: true, model: MultiSelect({ name: `palette-${id}`, options: artworks }) };
    palettes.push(palette);
    const tab = createTab(palette);
    tabs.push(tab);
    tabBar.insertBefore(tab.wrap, addButton);
    const safeLabel = label.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const panel = DebugPanel(palette.model, `palette "${safeLabel}"`);
    debugPanels.push(panel);
    root.append(palette.model.element, panel);
    palette.model.element.addEventListener("change", () => console.log("change", id, palette.model.getValue()));
    active = palette;                     // open it right away
    palette.model.onChange(render);       // also renders once now
    tab.focus();
};

// ---------- delete a palette (with undo) ----------

const toast = document.createElement("div");
toast.className = "toast";
toast.setAttribute("role", "status");                  // screen readers announce it
toast.hidden = true;
document.body.append(toast);
let toastTimer;

/**
 * removes a palette: its tab, its hidden <select> and its debug panel.
 * The artworks are not touched, a palette is only a selection.
 */
const deletePalette = palette => {
    const index = palettes.indexOf(palette);
    if (index < 0 || !palette.editable) return;
    const tab = tabs[index], panel = debugPanels[index];

    palettes.splice(index, 1);
    tabs.splice(index, 1);
    debugPanels.splice(index, 1);
    tab.wrap.remove();
    panel.remove();
    palette.model.element.remove();

    if (active === palette) {                          // open a neighbour, or "Noch nicht zugeordnet" if none is left
        active = palettes.filter(p => p.editable)[Math.max(0, index - 1)] ?? palettes.find(p => !p.editable);
    }
    render();

    showToast(`Palette „${palette.label}“ gelöscht`, () => {    // undo: put everything back where it was
        palettes.splice(index, 0, palette);
        tabs.splice(index, 0, tab);
        debugPanels.splice(index, 0, panel);
        tabBar.insertBefore(tab.wrap, tabs[index + 1]?.wrap ?? addButton);
        root.append(palette.model.element, panel);
        active = palette;
        render();
        tab.focus();
    });
};

const showToast = (message, undo) => {
    clearTimeout(toastTimer);
    toast.innerHTML = `<span></span> <button type="button">Rückgängig</button>`;
    toast.querySelector("span").textContent = message;
    toast.querySelector("button").onclick = () => { toast.hidden = true; undo(); };
    toast.hidden = false;
    toastTimer = setTimeout(() => toast.hidden = true, 6000);
};

const showPalette = id => {
    active = palettes.find(p => p.id === id);
    render();
};

// the palette accepts points dragged from the timeline
paletteEl.addEventListener("dragover", event => {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    paletteEl.classList.add("drag-over");
});
paletteEl.addEventListener("dragleave", event => {
    if (!paletteEl.contains(event.relatedTarget)) paletteEl.classList.remove("drag-over");
});
paletteEl.addEventListener("drop", event => {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    paletteEl.classList.remove("drag-over");
    endDrag();
    const work = workById(event.dataTransfer.getData(DRAG_TYPE));
    if (!work || !isPlaced(work)) return;              // a blob from this palette dropped on itself
    dropInto(active, work);                            // same as dropping on the open tab
});
const updateCounts = () => palettes.forEach((p, i) => {
    tabs[i].querySelector(".count").textContent = p.model.getValue().length;
    tabs[i].setAttribute("aria-selected", String(p === active));
    tabs[i].classList.toggle("readonly", !p.editable);
});

const renderPalette = () => {
    const selected = active.model.getSelectedOptions();
    slots.replaceChildren(...selected.map(work => {
        const artist = isPlaced(work) ? artistOf(work) : undefined;   // grey blob while not on the timeline
        const item = document.createElement("li");
        item.dataset.id = work.id;
        item.style.setProperty("--color", artist ? colorOf(artist.id) : "#bbb");
        const details = [artist?.label ?? "keine Künstler:in", work.year ?? "Jahr unbekannt"].join(" · ");
        const action  = active.editable ? "Klicken zum Entfernen" : "Auf den Zeitstrahl ziehen";
        // only a paint blob is visible, the details appear on hover or keyboard focus
        item.innerHTML = `
            <button type="button" class="blob" aria-label="${work.label}, ${details}. ${action}">
                <span class="dot"></span>
                <span class="info" aria-hidden="true">
                    <strong>${work.label}</strong>
                    <span>${details}</span>
                    <em>${action}</em>
                </span>
            </button>`;
        const blob = item.querySelector("button");
        blob.onclick = () => active.editable ? fallOutOfPalette(item, work.id) : refuse();
        if (!active.editable) {                               // "Noch nicht zugeordnet": drag onto the timeline
            blob.draggable = true;
            blob.addEventListener("dragstart", event => {
                event.dataTransfer.setData(DRAG_TYPE, work.id);
                event.dataTransfer.effectAllowed = "move";
                rows.classList.add("dropping");
            });
            blob.addEventListener("dragend", endDrag);
        }
        return item;
    }));
    paletteEl.classList.toggle("readonly", !active.editable);
    emptyHint.hidden   = selected.length > 0 || !active.editable;
    note.hidden        = active.editable;
    note.textContent   = selected.length > 0
        ? "Zieh ein Kunstwerk auf die Zeile einer Künstler:in. Die Stelle bestimmt das Jahr. Zurück: Punkt auf diesen Reiter ziehen."
        : "Alle Kunstwerke haben einen Platz auf dem Zeitstrahl. Zurück: Punkt auf diesen Reiter ziehen.";
    clearButton.hidden = selected.length === 0 || !active.editable;
};

clearButton.onclick = () => active.model.clear();

/** clicking does not work in this palette (it is changed by drag and drop): shake it a little */
const refuse = () => {
    if (reducedMotion) return;
    paletteEl.animate(
        [{ translate: "0" }, { translate: "-6px" }, { translate: "6px" }, { translate: "0" }],
        { duration: 250 });
};

// ---------- animations ----------

/** a paint drop flies from the point and falls into its slot in the palette (simple gravity curve) */
const fallIntoPalette = (point, id, from = point.getBoundingClientRect(),
                         color = getComputedStyle(point.closest(".row")).getPropertyValue("--color")) => {
    const slot = slots.querySelector(`[data-id="${id}"]`);
    if (!slot || reducedMotion) return;

    const to   = slot.querySelector(".dot").getBoundingClientRect();
    const dx   = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy   = (to.top + to.height / 2) - (from.top + from.height / 2);

    const drop = document.createElement("div");
    drop.className  = "drop";
    drop.style.left = `${from.left + from.width / 2}px`;
    drop.style.top  = `${from.top + from.height / 2}px`;
    drop.style.background = color;
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
    const model = active.model;                      // remember it, the user might switch palettes meanwhile
    if (reducedMotion) { model.deselect(id); return; }
    item.animate(
        [{ transform: "translateY(0) rotate(0)", opacity: 1 }, { transform: "translateY(60px) rotate(18deg)", opacity: 0 }],
        { duration: 350, easing: "ease-in", fill: "forwards" }
    ).finished.then(() => model.deselect(id));
};

// ---------- wiring ----------

// one debug panel per palette, only the active one is visible
const debugPanels = palettes.map(p => DebugPanel(p.model, `palette "${p.label}"`));

/** shows the active palette: points on the timeline, blobs in the palette, counts, debug panel */
const render = () => {
    points.forEach(point => point.setAttribute("aria-pressed", String(active.model.isSelected(point.dataset.id))));
    renderPalette();
    updateCounts();
    debugPanels.forEach((panel, i) => panel.hidden = palettes[i] !== active);
};

// a change in any palette updates the view (and the counts on the tabs)
palettes.forEach(p => p.model.onChange(render));
applyFilter();

root.append(...palettes.map(p => p.model.element), ...debugPanels);

// each palette behaves like a native select: other code can listen to "change"
palettes.forEach(p =>
    p.model.element.addEventListener("change", () => console.log("change", p.id, p.model.getValue())));
