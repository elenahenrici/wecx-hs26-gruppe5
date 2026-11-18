/**
 * Gruppe 5: Timeline + Palette as a specialized connector for ARTIST → ARTWORKS.
 *
 * Same structure as König's week-10 example (appProjectors.js):
 *  - in the workbench of an artist: the list of her/his artworks and a button
 *  - the button opens a <dialog>
 *  - "Übernehmen" saves the selection through the RelationService
 *
 * Inside the dialog, instead of a plain <select multiple>, the artworks are shown on a timeline,
 * with the same look and behaviour as Elena's sketch (sketches/timeline):
 *  - one row per artist, sorted by birth year, the bar shows the lifetime
 *  - every artwork is a point at the year it was made, in the row of its current artist,
 *    hovering shows its picture
 *  - artworks without an artist are in the extra row "Noch nicht zugeordnet"
 *  - epochs as buttons above the timeline: clicking one marks its time span and dims the other artists
 *  - clicking a point puts the artwork into the palette (= selected), clicking again removes it
 *  - artworks without artist can be dragged onto any artist's row (the position sets the year).
 *    Onto the row of this artist: into the palette. Onto another row: noted for that artist.
 *    Back onto "Noch nicht zugeordnet": undone. Everything is only saved with "Übernehmen".
 *    The grey blobs in the palette (artworks without artist) can be dragged onto a row the same way.
 *  - the palette is a painter's palette: the blobs sit on a ring that can be turned
 *    (‹ ›, mouse wheel, arrow keys), the blob in front is shown big in the middle
 *
 * The real <select multiple> is still there (hidden). It holds the state, the timeline only shows it.
 */
import {dom}             from "../../../framework/client/js/util/dom.js";
import {ONE_TO_MANY}     from "../../../framework/client/js/types.js";
import {ARTIST, ARTWORK, EPOCH, EPOCH_ARTIST} from "./appTypes.js";

export { projectTimelineConnection }

// ---------- configuration ----------

const START = 1440;
const END   = 1680;
const STEP  = 50;

/** one pigment colour per artist id, same as in the Figma and the sketch */
const COLORS = {
    "0": "#C2416B", // Botticelli, madder rose
    "1": "#1E8A5C", // Leonardo, malachite
    "2": "#2C4BD1", // Velázquez, ultramarine
    "3": "#B8860B", // Rembrandt, ochre
    "4": "#E3412B", // Caravaggio, vermilion
};
const colorOf          = artistId => COLORS[artistId] ?? "#555";
const UNASSIGNED_COLOR = "#bbb";

// TODO question for Prof. König: the artworks in memoryDB have no year yet.
// Until there is a field for it, the years of the sketch are used here.
const ARTWORK_YEARS = { "0": 1480, "1": 1485, "2": 1503, "3": 1656, "4": 1642 };

// years set by dropping an artwork on a row. Only kept while the page is open (memoryDB has no year field yet).
const placedYears = new Map();      // artworkId → year

const yearOfArtwork = artwork => artwork.year ?? placedYears.get(artwork.id) ?? ARTWORK_YEARS[artwork.id] ?? null;
// One RelationService per relation for the whole page.
// The DevRelationService counts new ids up from the table size at the moment it is created.
// A new instance for every save can therefore hand out an id that already exists, and the next
// removeById then deletes the wrong relation (question 6 for Prof. König). Reusing one instance
// keeps its counter going up, so every id stays unique.
const relationServices = new Map();
const relationServiceFor = (workbenchController, relationId) => {
    if (!relationServices.has(relationId)) {
        relationServices.set(relationId, workbenchController.getRelationService(relationId));
    }
    return relationServices.get(relationId);
};

const yearOfDate    = isoDate => isoDate ? Number(String(isoDate).slice(0, 4)) : null;
const position      = year    => `${((year - START) / (END - START)) * 100}%`;
const clampYear     = year    => Math.max(START, Math.min(END, year));

/** approximate time spans and colours of the epochs (the course data has no years for epochs) */
const EPOCH_YEARS = {
    "0": { from: -800, to:  500, color: "#9a9a9a" },   // Classic (antiquity)
    "1": { from: 1150, to: 1500, color: "#7d6bb3" },   // Gothic
    "2": { from: 1420, to: 1600, color: "#c08a3e" },   // Renaissance
    "3": { from: 1600, to: 1750, color: "#4f86b0" },   // Baroque
    "4": { from: 1860, to: 1900, color: "#5aa58a" },   // Impressionism
};
/** German names, the course data has them in English */
const EPOCH_NAMES = { Classic: "Klassik", Gothic: "Gotik", Renaissance: "Renaissance", Baroque: "Barock", Impressionism: "Impressionismus" };
const epochName   = epoch => EPOCH_NAMES[epoch.displayedAs] ?? epoch.displayedAs;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- projector ----------

/**
 * @param workbenchController
 * @param { RelationMetaType } rel_meta - the ARTIST_ARTWORK relation
 * @param { EntityNameType }   entityName - must be the "one" side (ARTIST)
 * @param entity - the artist in the workbench
 * @return { [HTMLDivElement, HTMLDivElement] } label and content, like every connector
 */
const projectTimelineConnection = (workbenchController, rel_meta, entityName, entity) => {

    const isOneToMany = rel_meta.cardinality === ONE_TO_MANY;
    const ourKey      = rel_meta.oneFK;   // artistId
    const otherKey    = rel_meta.manyFK;  // artworkId
    const dialogId    = `${rel_meta.relationId}_timeline_dialog_${entity.id}`;
    const ourColor    = colorOf(entity.id);

    const [labelEl, divEl] = dom(`
        <div>${rel_meta.oneLabel}</div>
        <div class="timeline-select" style="--color:${ourColor}">
            <ul class="chosen"></ul>
            <button type="button" class="open" commandfor="${dialogId}" command="show-modal">
                Werke auf der Timeline wählen
            </button>
            <dialog id="${dialogId}" class="timeline-dialog" style="--color:${ourColor}">
                <header>
                    <h3>Werke von ${entity.displayedAs}</h3>
                    <p class="hint">Punkte anklicken, um Werke in die Palette zu legen. Ein Werk gehört genau einer Künstler:in:
                       Wählst du ein Werk von jemand anderem, wechselt es beim Übernehmen zu ${entity.displayedAs}.
                       Werke ohne Künstler:in kannst du auf eine Zeile ziehen, die Stelle bestimmt das Jahr.</p>
                </header>
                <div class="tl-epoch-row" role="group" aria-label="Epoche">
                    <span class="tl-epoch-label">Epoche <button type="button" class="tl-epoch-all">Alle</button></span>
                    <span class="tl-epochs"></span>
                </div>
                <div class="tl-board">
                    <div class="tl-axis" aria-hidden="true"></div>
                    <div class="tl-rows-wrap">
                        <div class="tl-band-layer" aria-hidden="true"><div class="tl-band" hidden><span></span></div></div>
                        <div class="tl-rows"></div>
                    </div>
                </div>
                <section class="tl-palette" aria-label="Palette">
                    <div class="tl-palette-board" tabindex="0">
                        <ul class="tl-blobs"></ul>
                        <button type="button" class="tl-rotate prev" aria-label="Vorheriges Werk">‹</button>
                        <button type="button" class="tl-rotate next" aria-label="Nächstes Werk">›</button>
                        <div class="tl-center">
                            <div class="tl-front" hidden>
                                <img alt="">
                                <strong></strong>
                                <span></span>
                                <button type="button" class="tl-front-remove">Aus Palette entfernen</button>
                            </div>
                            <p class="tl-empty">Noch keine Werke in der Palette. Klick auf einen Punkt im Zeitstrahl.</p>
                        </div>
                    </div>
                </section>
                <select multiple hidden name="${rel_meta.relationId}"></select>
                <footer>
                    <button type="button" class="clear">Alle entfernen</button>
                    <span class="spacer"></span>
                    <button type="button" class="cancel" commandfor="${dialogId}" command="close">Abbrechen</button>
                    <button type="button" class="submit" commandfor="${dialogId}" command="close">Übernehmen</button>
                </footer>
            </dialog>
        </div>
    `);

    const chosenEl = divEl.querySelector(".chosen");
    const dialogEl = divEl.querySelector("dialog");
    const axisEl   = divEl.querySelector(".tl-axis");
    const rowsEl   = divEl.querySelector(".tl-rows");
    const blobsEl  = divEl.querySelector(".tl-blobs");
    const emptyEl  = divEl.querySelector(".tl-empty");
    const selectEl = divEl.querySelector("select");
    const epochsEl = divEl.querySelector(".tl-epochs");
    const allEl    = divEl.querySelector(".tl-epoch-all");
    const bandEl   = divEl.querySelector(".tl-band");
    const paletteBoardEl = divEl.querySelector(".tl-palette-board");
    const frontEl  = divEl.querySelector(".tl-front");
    const prevEl   = divEl.querySelector(".tl-rotate.prev");
    const nextEl   = divEl.querySelector(".tl-rotate.next");

    // data as loaded from the services
    let artists   = [];
    let artworks  = [];
    let relations = [];
    let epochs    = [];          // { id, displayedAs }
    let epochOf   = {};          // artistId → [epochId, ...]

    let activeEpoch = null;      // null = all epochs
    let frontId     = null;      // the artwork in front of the palette
    let lastSelected = null;     // ids of the previous render, to find the one that was just added

    // changes made by drag and drop in the dialog, saved only with "Übernehmen"
    const pendingOwner = new Map();   // artworkId → artistId, for artworks that had no artist
    const pendingYear  = new Map();   // artworkId → year

    const ownerOf    = artworkId => relations.find(rel => rel[otherKey] === artworkId)?.[ourKey] ?? null;
    /** the artist shown on the timeline: the saved one, or the one an artwork was just dragged to */
    const ownerShown = artworkId => pendingOwner.get(artworkId) ?? ownerOf(artworkId);
    const yearShown  = artwork   => pendingYear.get(artwork.id) ?? yearOfArtwork(artwork);
    const DRAG_TYPE  = "text/x-artwork-id";
    const artistById = artistId  => artists.find(artist => artist.id === artistId);
    const optionOf   = artworkId => selectEl.querySelector(`option[value="${artworkId}"]`);

    // ---------- rendering ----------

    /** list in the closed view: the artworks that currently belong to this artist */
    const renderChosen = () => {
        const ours = artworks.filter(work => ownerOf(work.id) === entity.id);
        chosenEl.innerHTML = ours.length
            ? ours.map(work => `<li data-id="${work.id}">${work.displayedAs}</li>`).join("")
            : `<li class="none">noch keine Werke</li>`;
        // navigate from the closed view to the artwork, like in König's example
        chosenEl.querySelectorAll("li[data-id]").forEach(li =>
            li.onclick = _evt => workbenchController.selectId(ARTWORK, li.getAttribute("data-id")));
    };

    /** the hidden <select multiple>: one option per artwork, selected = belongs to this artist */
    const renderOptions = () => {
        selectEl.innerHTML = artworks
            .map(work => `<option value="${work.id}" ${ownerOf(work.id) === entity.id ? "selected" : ""}>${work.displayedAs}</option>`)
            .join("");
    };

    const projectPoint = (work, ownerColor, extraClass = "") => {
        const year = yearShown(work);
        const [point] = dom(`
            <button type="button" class="tl-point ${extraClass}" data-id="${work.id}" style="--c:${ownerColor}"
                    aria-label="${work.displayedAs}${year ? ", " + year : ""}">
                <span class="tl-tip">
                    ${work.pictureUrl ? `<img src="${work.pictureUrl}" alt="" loading="lazy">` : ""}
                    ${work.displayedAs}${year ? " · " + year : ""}
                </span>
            </button>`);
        if (year) point.style.left = position(year);
        if (ownerOf(work.id) === null) {                                 // artworks without artist can be dragged onto a row
            point.draggable = true;
            point.addEventListener("dragstart", event => {
                event.dataTransfer.setData(DRAG_TYPE, work.id);
                event.dataTransfer.effectAllowed = "move";
                rowsEl.classList.add("dropping");
            });
            point.addEventListener("dragend", () => rowsEl.classList.remove("dropping"));
        }
        if (pendingOwner.has(work.id)) point.classList.add("pending");
        const img = point.querySelector("img");
        if (img) img.onerror = () => img.remove();                       // broken picture links are just left out
        point.onclick = _evt => {                                        // view binding: click toggles the option
            const option = optionOf(work.id);
            option.selected = !option.selected;
            const movedToUs = option.selected && pendingOwner.has(work.id) && pendingOwner.get(work.id) !== entity.id;
            if (movedToUs) pendingOwner.set(work.id, entity.id);         // was noted for someone else: now it is ours
            selectEl.dispatchEvent(new Event("change"));
            if (movedToUs) { renderTimeline(); renderSelection(); return; }
            if (option.selected) fallIntoPalette(point, work.id, ownerColor);
        };
        return point;
    };

    /** the timeline: axis, one row per artist, one extra row for artworks without artist */
    const renderTimeline = () => {
        axisEl.innerHTML = "";
        for (let year = Math.ceil(START / STEP) * STEP; year <= END; year += STEP) {
            const [tick] = dom(`<span class="tl-tick" style="left:${position(year)}">${year}</span>`);
            axisEl.append(tick);
        }

        rowsEl.innerHTML = "";
        const sortedArtists = [...artists].sort((a, b) => yearOfDate(a.birthDate) - yearOfDate(b.birthDate));

        sortedArtists.forEach(artist => {
            const born  = yearOfDate(artist.birthDate);
            const died  = yearOfDate(artist.deathDate);
            const [row] = dom(`
                <div class="tl-row ${artist.id === entity.id ? "current" : ""}" data-artist="${artist.id}" style="--c:${colorOf(artist.id)}">
                    <div class="tl-label"><strong>${artist.displayedAs}</strong><span>${born ?? "?"}–${died ?? "?"}</span></div>
                    <div class="tl-track">
                        ${born && died ? `<span class="tl-life" style="left:${position(born)}; width:calc(${position(died)} - ${position(born)})"></span>` : ""}
                    </div>
                </div>`);
            const track = row.querySelector(".tl-track");
            const works = artworks
                .filter(work => ownerShown(work.id) === artist.id)
                .sort((a, b) => (yearShown(a) ?? 0) - (yearShown(b) ?? 0));
            works.forEach((work, i) => {
                // artworks only a few years apart would overlap: move them slightly up and down
                const prev = works[i - 1], next = works[i + 1];
                let shift = "";
                if (next && yearShown(next) - yearShown(work) < 12) shift = "up";
                if (prev && yearShown(work) - yearShown(prev) < 12) shift = "down";
                const point = projectPoint(work, colorOf(artist.id), shift);
                if (!yearShown(work)) point.classList.add("no-year");
                track.append(point);
            });
            makeDropTarget(track, artist, born, died);
            rowsEl.append(row);
        });

        // the extra row: artworks without artist (like the palette "Noch nicht zugeordnet" in the sketch)
        const unassigned = artworks.filter(work => ownerShown(work.id) === null);
        const [row] = dom(`
            <div class="tl-row unassigned" style="--c:${UNASSIGNED_COLOR}">
                <div class="tl-label"><strong>Noch nicht zugeordnet</strong><span>${unassigned.length} Werk${unassigned.length === 1 ? "" : "e"}</span></div>
                <div class="tl-track"><div class="tl-noyear"></div></div>
            </div>`);
        const track  = row.querySelector(".tl-track");
        const noYear = row.querySelector(".tl-noyear");
        unassigned.forEach(work => {
            const point = projectPoint(work, UNASSIGNED_COLOR, "unassigned");
            if (yearShown(work)) {
                track.append(point);
            } else {                                     // no year yet: shown as a labelled point at the start
                point.classList.add("no-year");
                const [item] = dom(`<span class="tl-noyear-item"></span>`);
                item.append(point, work.displayedAs + " (ohne Jahr)");
                noYear.append(item);
            }
        });
        makeDropTarget(track, null);
        rowsEl.append(row);
        applyEpoch();
    };

    // ---------- drag and drop: give an artwork without artist a place on the timeline ----------

    /**
     * A row accepts artworks without artist. The position sets the year (kept inside the lifetime).
     * artist === null: the row "Noch nicht zugeordnet", dropping there undoes the assignment.
     */
    const makeDropTarget = (track, artist, born, died) => {
        const [marker] = dom(`<span class="tl-drop-marker" hidden></span>`);
        track.append(marker);
        const yearAt = clientX => {
            const box  = track.getBoundingClientRect();
            const year = Math.round(START + (clientX - box.left) / box.width * (END - START));
            return born && died ? Math.max(born, Math.min(died, year)) : clampYear(year);
        };
        const isOurDrag = event => event.dataTransfer.types.includes(DRAG_TYPE);
        const hide = () => { marker.hidden = true; track.classList.remove("drag-over"); };

        track.addEventListener("dragover", event => {
            if (!isOurDrag(event)) return;
            event.preventDefault();                                      // allows the drop
            track.classList.add("drag-over");
            if (!artist) return;
            const year = yearAt(event.clientX);
            marker.hidden = false;
            marker.style.left = position(year);
            marker.textContent = year;
        });
        track.addEventListener("dragleave", event => { if (!track.contains(event.relatedTarget)) hide(); });
        track.addEventListener("drop", event => {
            if (!isOurDrag(event)) return;
            event.preventDefault();
            hide();
            rowsEl.classList.remove("dropping");
            const id = event.dataTransfer.getData(DRAG_TYPE);
            if (ownerOf(id) !== null) return;                            // only artworks without artist
            const option = optionOf(id);
            if (artist) {
                pendingOwner.set(id, artist.id);
                pendingYear.set(id, yearAt(event.clientX));
                option.selected = artist.id === entity.id;               // own row: into the palette, other row: not ours
            } else {                                                     // back to "Noch nicht zugeordnet"
                pendingOwner.delete(id);
                pendingYear.delete(id);
                option.selected = false;
            }
            renderTimeline();
            selectEl.dispatchEvent(new Event("change"));
            const point = rowsEl.querySelector(`.tl-point[data-id="${id}"]`);
            if (point && !reducedMotion()) point.animate([{ scale: "2" }, { scale: "1" }], { duration: 300, easing: "ease-out" });
        });
    };

    // ---------- epochs ----------

    const renderEpochs = () => {
        const shown = epochs
            .filter(e => EPOCH_YEARS[e.id] && EPOCH_YEARS[e.id].to > START && EPOCH_YEARS[e.id].from < END)
            .sort((a, b) => EPOCH_YEARS[a.id].from - EPOCH_YEARS[b.id].from);
        epochsEl.innerHTML = "";
        shown.forEach(epoch => {
            const { from, to, color } = EPOCH_YEARS[epoch.id];
            const [button] = dom(`<button type="button" class="tl-epoch" data-epoch="${epoch.id}" style="--epoch:${color}"
                                          title="${epochName(epoch)}, ca. ${from}–${to}">${epochName(epoch)}</button>`);
            button.onclick = _evt => { activeEpoch = activeEpoch === epoch.id ? null : epoch.id; applyEpoch(); };   // again = off
            epochsEl.append(button);
        });
        applyEpoch();
    };

    /** marks the time span of the active epoch on the timeline and dims artists of other epochs */
    const applyEpoch = () => {
        epochsEl.querySelectorAll(".tl-epoch").forEach(button =>
            button.setAttribute("aria-pressed", String(button.dataset.epoch === activeEpoch)));
        allEl.setAttribute("aria-pressed", String(activeEpoch === null));
        bandEl.hidden = activeEpoch === null;
        if (activeEpoch !== null) {
            const { from, to, color } = EPOCH_YEARS[activeEpoch];
            bandEl.style.left  = position(clampYear(from));
            bandEl.style.width = `calc(${position(clampYear(to))} - ${position(clampYear(from))})`;
            bandEl.style.setProperty("--epoch", color);
            bandEl.querySelector("span").textContent = `${from}–${to}`;
        }
        rowsEl.querySelectorAll(".tl-row[data-artist]").forEach(row =>
            row.classList.toggle("dimmed", activeEpoch !== null && !(epochOf[row.dataset.artist] ?? []).includes(activeEpoch)));
    };
    allEl.onclick = _evt => { activeEpoch = null; applyEpoch(); };

    // ---------- palette ----------

    /**
     * The blobs sit on the upper edge of the palette, like paint on a painter's palette.
     * The blob in front sits at the top, the others fan out to the left and right.
     */
    const placeOnRing = (item, index, count, frontIndex) => {
        let offset = index - frontIndex;                              // -n/2 .. n/2
        if (offset >  count / 2) offset -= count;
        if (offset < -count / 2) offset += count;
        const step  = count > 1 ? Math.min(24, 300 / count) : 0;      // degrees between two blobs
        const angle = (90 - offset * step) * Math.PI / 180;           // 90° = top
        item.style.left = `${50 - 41 * Math.cos(angle)}%`;
        item.style.top  = `${50 - 36 * Math.sin(angle)}%`;
        item.classList.toggle("in-front", offset === 0);
    };

    const noteFor = id => {
        const owner = ownerOf(id);
        return owner === entity.id ? entity.displayedAs
             : owner === null      ? "ohne Künstler:in, wird neu zugeordnet"
             : `von ${artistById(owner)?.displayedAs ?? "?"}, wechselt zu ${entity.displayedAs}`;
    };

    /** moves the blobs to their place on the ring and shows the front artwork in the middle */
    const updateRing = () => {
        const selected = [...selectEl.selectedOptions].map(option => option.value);
        let index = selected.indexOf(frontId);
        if (index < 0) index = 0;
        frontId = selected[index] ?? null;
        [...blobsEl.children].forEach((item, i) => placeOnRing(item, i, selected.length, index));
        prevEl.hidden = nextEl.hidden = selected.length < 2;

        frontEl.hidden = frontId === null;
        if (frontId === null) return;
        const work = artworks.find(w => w.id === frontId);
        const year = yearOfArtwork(work);
        const img  = frontEl.querySelector("img");
        img.hidden = !work.pictureUrl;
        if (work.pictureUrl) { img.src = work.pictureUrl; img.onerror = () => img.hidden = true; }
        frontEl.querySelector("strong").textContent = work.displayedAs + (year ? ` · ${year}` : "");
        frontEl.querySelector("span").textContent   = noteFor(frontId);
    };

    /** turns the ring by one blob (+1 = the next one comes to the front) */
    const rotate = direction => {
        const selected = [...selectEl.selectedOptions].map(option => option.value);
        if (selected.length < 2) return;
        const index = Math.max(0, selected.indexOf(frontId));
        frontId = selected[(index + direction + selected.length) % selected.length];
        updateRing();
    };

    const deselect = id => {
        optionOf(id).selected = false;
        selectEl.dispatchEvent(new Event("change"));
    };

    /** a paint drop flies from the point on the timeline into its blob on the palette */
    const fallIntoPalette = (point, id, color) => {
        const blob = blobsEl.querySelector(`[data-id="${id}"] .dot`);
        if (!blob || reducedMotion()) return;
        const from = point.getBoundingClientRect();
        const to   = blob.getBoundingClientRect();
        const dx   = (to.left + to.width / 2) - (from.left + from.width / 2);
        const dy   = (to.top + to.height / 2) - (from.top + from.height / 2);
        const [drop] = dom(`<span class="tl-drop" style="left:${from.left + from.width / 2}px; top:${from.top + from.height / 2}px; background:${color}"></span>`);
        dialogEl.append(drop);                                             // inside the dialog, so it is above the backdrop
        blob.style.opacity = "0";
        const frames = Array.from({ length: 11 }, (_, i) => {
            const t = i / 10;
            return { transform: `translate(${dx * t}px, ${dy * t * t}px)` };   // x linear, y accelerates like falling paint
        });
        drop.animate(frames, { duration: 600, easing: "linear" }).finished.then(() => {
            drop.remove();
            blob.style.opacity = "";
        });
    };

    /** points and palette follow the hidden select (data binding select → view) */
    const renderSelection = () => {
        const selected = [...selectEl.selectedOptions].map(option => option.value);
        rowsEl.querySelectorAll(".tl-point").forEach(point =>
            point.setAttribute("aria-pressed", String(selected.includes(point.dataset.id))));

        // an artwork that was just added comes to the front of the palette
        const added = lastSelected ? selected.filter(id => !lastSelected.includes(id)) : [];
        if (added.length === 1) frontId = added[0];
        lastSelected = selected;

        blobsEl.innerHTML = "";
        selected.forEach(id => {
            const work  = artworks.find(w => w.id === id);
            const owner = ownerShown(id);
            const color = owner === null ? UNASSIGNED_COLOR : colorOf(owner);
            const [li] = dom(`
                <li data-id="${id}" style="--blob:${color}">
                    <button type="button" class="tl-blob" aria-label="${work.displayedAs}. Klicken: nach vorne, vorne: entfernen">
                        <span class="dot"></span>
                        <span class="tl-blob-info" aria-hidden="true">${work.displayedAs}</span>
                    </button>
                </li>`);
            const blob = li.querySelector("button");
            blob.onclick = _evt => {
                if (frontId !== id) { frontId = id; updateRing(); return; }   // bring it to the front
                deselect(id);                                                 // already in front: remove
            };
            if (owner === null) {                                             // grey blob: can be put on the timeline
                blob.draggable = true;
                blob.addEventListener("dragstart", event => {
                    event.dataTransfer.setData(DRAG_TYPE, id);
                    event.dataTransfer.effectAllowed = "move";
                    rowsEl.classList.add("dropping");
                });
                blob.addEventListener("dragend", () => rowsEl.classList.remove("dropping"));
            }
            blobsEl.append(li);
        });
        emptyEl.hidden = selected.length > 0;
        updateRing();
    };

    const renderAll = () => {
        lastSelected = null;                       // a fresh start: nothing counts as "just added"
        renderChosen();
        renderOptions();
        renderEpochs();
        renderTimeline();
        renderSelection();
    };

    const epochMeta = workbenchController.getMeta().getRelationMeta(EPOCH_ARTIST);

    const load = () => Promise.all([
            workbenchController.getAllEntities(ARTIST),
            workbenchController.getAllEntities(ARTWORK),
            relationServiceFor(workbenchController, rel_meta.relationId).getAll(),
            workbenchController.getAllEntities(EPOCH),
            relationServiceFor(workbenchController, EPOCH_ARTIST).getAll(),
        ])
        .then(([allArtists, allArtworks, allRelations, allEpochs, epochRelations]) => {
            artists   = allArtists;
            artworks  = allArtworks;
            relations = allRelations;
            epochs    = allEpochs;
            epochOf   = {};
            epochRelations.forEach(rel => {
                const artistId = rel[epochMeta.manyFK], epochId = rel[epochMeta.oneFK];
                (epochOf[artistId] ??= []).push(epochId);
            });
            renderAll();
        })
        .catch(err => console.error("cannot load timeline data", err));

    // ---------- view binding ----------

    selectEl.addEventListener("change", () => {
        // an artwork dragged onto this artist's row and then taken out of the palette goes back to "Noch nicht zugeordnet"
        let changed = false;
        pendingOwner.forEach((artistId, id) => {
            if (artistId === entity.id && !optionOf(id).selected) { pendingOwner.delete(id); pendingYear.delete(id); changed = true; }
        });
        if (changed) renderTimeline();
        renderSelection();
    });

    prevEl.onclick = _evt => rotate(-1);
    nextEl.onclick = _evt => rotate(+1);
    frontEl.querySelector(".tl-front-remove").onclick = _evt => { if (frontId) deselect(frontId); };

    let lastWheel = 0;
    paletteBoardEl.addEventListener("wheel", event => {          // mouse wheel turns the ring, one blob per notch
        event.preventDefault();
        if (Date.now() - lastWheel < 180) return;
        lastWheel = Date.now();
        rotate(event.deltaY > 0 || event.deltaX > 0 ? 1 : -1);
    }, { passive: false });
    paletteBoardEl.addEventListener("keydown", event => {
        if (event.key === "ArrowRight") { event.preventDefault(); rotate(+1); }
        if (event.key === "ArrowLeft")  { event.preventDefault(); rotate(-1); }
    });

    divEl.querySelector(".clear").onclick = _evt => {
        [...selectEl.options].forEach(option => option.selected = false);
        selectEl.dispatchEvent(new Event("change"));
    };

    // "Übernehmen": same logic as König's submit, only the selected ids come from our hidden select
    let submitted = false;
    divEl.querySelector(".submit").onclick = _evt => {
        submitted = true;
        const selectedIds     = [...selectEl.selectedOptions].map(option => option.value);
        const relationService = relationServiceFor(workbenchController, rel_meta.relationId);
        relationService
            .getAll()
            .then(allRelations => {
                // first remove all relations that might get in the way, then add the selected ones
                const removePromises = allRelations
                    .filter(rel => rel[ourKey] === entity.id                                  // all artworks of this artist
                               || (isOneToMany && selectedIds.includes(rel[otherKey])))      // selected artworks of other artists
                    .map(rel => rel.id)
                    .map(id => relationService.removeById(id));
                return Promise.all(removePromises);
            })
            .then(_ => Promise.all(selectedIds.map(artworkId =>
                relationService.add({ [ourKey]: entity.id, [otherKey]: artworkId }))))
            .then(_ => Promise.all([...pendingOwner]                                         // artworks dragged onto other artists' rows
                .filter(([artworkId, artistId]) => artistId !== entity.id && !selectedIds.includes(artworkId))
                .map(([artworkId, artistId]) => relationService.add({ [ourKey]: artistId, [otherKey]: artworkId }))))
            .then(_ => {
                pendingYear.forEach((year, id) => placedYears.set(id, year));                // years only live while the page is open
                pendingOwner.clear();
                pendingYear.clear();
            })
            .then(load)                                                                       // show the saved state
            .catch(err => console.error("cannot save the selection", err));
    };

    // "Abbrechen" or Escape: throw away the changes in the dialog
    dialogEl.addEventListener("close", _evt => {
        if (!submitted) { pendingOwner.clear(); pendingYear.clear(); renderAll(); }
        submitted = false;
    });

    load();

    return [labelEl, divEl];
};
