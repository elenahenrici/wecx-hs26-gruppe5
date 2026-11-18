/**
 * Gruppe 5: Timeline + Palette as a specialized connector for ARTIST → ARTWORKS.
 *
 * Same structure as König's week-10 example (appProjectors.js):
 *  - in the workbench of an artist: the list of her/his artworks and a button
 *  - the button opens a <dialog>
 *  - "Übernehmen" saves the selection through the RelationService
 *
 * Inside the dialog, instead of a plain <select multiple>, the artworks are shown on a timeline:
 *  - one row per artist, sorted by birth year, the bar shows the lifetime
 *  - every artwork is a point at the year it was made, in the row of its current artist
 *  - artworks without an artist are in the extra row "Noch nicht zugeordnet"
 *  - clicking a point puts the artwork into the palette (= selected), clicking again removes it
 *
 * The real <select multiple> is still there (hidden). It holds the state, the timeline only shows it.
 */
import {dom}             from "../../../framework/client/js/util/dom.js";
import {ONE_TO_MANY}     from "../../../framework/client/js/types.js";
import {ARTIST, ARTWORK} from "./appTypes.js";

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

const yearOfArtwork = artwork => artwork.year ?? ARTWORK_YEARS[artwork.id] ?? null;
const yearOfDate    = isoDate => isoDate ? Number(String(isoDate).slice(0, 4)) : null;
const position      = year    => `${((year - START) / (END - START)) * 100}%`;

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
                       Wählst du ein Werk von jemand anderem, wechselt es beim Übernehmen zu ${entity.displayedAs}.</p>
                </header>
                <div class="tl-board">
                    <div class="tl-axis" aria-hidden="true"></div>
                    <div class="tl-rows"></div>
                </div>
                <section class="tl-palette" aria-label="Palette">
                    <ul class="tl-blobs"></ul>
                    <p class="tl-empty">Noch keine Werke in der Palette. Klick auf einen Punkt im Zeitstrahl.</p>
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

    // data as loaded from the services
    let artists   = [];
    let artworks  = [];
    let relations = [];

    const ownerOf    = artworkId => relations.find(rel => rel[otherKey] === artworkId)?.[ourKey] ?? null;
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
        const year = yearOfArtwork(work);
        const [point] = dom(`
            <button type="button" class="tl-point ${extraClass}" data-id="${work.id}" style="--c:${ownerColor}"
                    aria-label="${work.displayedAs}${year ? ", " + year : ""}">
                <span class="tl-tip">
                    ${work.pictureUrl ? `<img src="${work.pictureUrl}" alt="" loading="lazy">` : ""}
                    ${work.displayedAs}${year ? " · " + year : ""}
                </span>
            </button>`);
        if (year) point.style.left = position(year);
        const img = point.querySelector("img");
        if (img) img.onerror = () => img.remove();                       // broken picture links are just left out
        point.onclick = _evt => {                                        // view binding: click toggles the option
            const option = optionOf(work.id);
            option.selected = !option.selected;
            selectEl.dispatchEvent(new Event("change"));
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
                <div class="tl-row ${artist.id === entity.id ? "current" : ""}" style="--c:${colorOf(artist.id)}">
                    <div class="tl-label"><strong>${artist.displayedAs}</strong><span>${born ?? "?"}–${died ?? "?"}</span></div>
                    <div class="tl-track">
                        ${born && died ? `<span class="tl-life" style="left:${position(born)}; width:calc(${position(died)} - ${position(born)})"></span>` : ""}
                    </div>
                </div>`);
            const track = row.querySelector(".tl-track");
            const works = artworks
                .filter(work => ownerOf(work.id) === artist.id)
                .sort((a, b) => (yearOfArtwork(a) ?? 0) - (yearOfArtwork(b) ?? 0));
            works.forEach((work, i) => {
                // artworks only a few years apart would overlap: move them slightly up and down
                const prev = works[i - 1], next = works[i + 1];
                let shift = "";
                if (next && yearOfArtwork(next) - yearOfArtwork(work) < 12) shift = "up";
                if (prev && yearOfArtwork(work) - yearOfArtwork(prev) < 12) shift = "down";
                const point = projectPoint(work, colorOf(artist.id), shift);
                if (!yearOfArtwork(work)) point.classList.add("no-year");
                track.append(point);
            });
            rowsEl.append(row);
        });

        // the extra row: artworks without artist (like the palette "Noch nicht zugeordnet" in the sketch)
        const unassigned = artworks.filter(work => ownerOf(work.id) === null);
        const [row] = dom(`
            <div class="tl-row unassigned" style="--c:${UNASSIGNED_COLOR}">
                <div class="tl-label"><strong>Noch nicht zugeordnet</strong><span>${unassigned.length} Werk${unassigned.length === 1 ? "" : "e"}</span></div>
                <div class="tl-track"><div class="tl-noyear"></div></div>
            </div>`);
        const track  = row.querySelector(".tl-track");
        const noYear = row.querySelector(".tl-noyear");
        unassigned.forEach(work => {
            const point = projectPoint(work, UNASSIGNED_COLOR, "unassigned");
            if (yearOfArtwork(work)) {
                track.append(point);
            } else {                                     // no year yet: shown as a labelled point at the start
                point.classList.add("no-year");
                const [item] = dom(`<span class="tl-noyear-item"></span>`);
                item.append(point, work.displayedAs + " (ohne Jahr)");
                noYear.append(item);
            }
        });
        rowsEl.append(row);
    };

    /** points and palette follow the hidden select (data binding select → view) */
    const renderSelection = () => {
        const selected = [...selectEl.selectedOptions].map(option => option.value);
        rowsEl.querySelectorAll(".tl-point").forEach(point =>
            point.setAttribute("aria-pressed", String(selected.includes(point.dataset.id))));

        blobsEl.innerHTML = "";
        selected.forEach(id => {
            const work  = artworks.find(w => w.id === id);
            const owner = ownerOf(id);
            const note  = owner === entity.id ? ""
                        : owner === null      ? "neu zugeordnet"
                        : `von ${artistById(owner)?.displayedAs ?? "?"}`;
            const [li] = dom(`
                <li>
                    <button type="button" class="tl-blob" aria-label="${work.displayedAs} aus der Palette entfernen">
                        <span class="dot"></span>
                        <span>${work.displayedAs}</span>
                        ${note ? `<small>${note}</small>` : ""}
                    </button>
                </li>`);
            li.querySelector("button").onclick = _evt => {
                optionOf(id).selected = false;
                selectEl.dispatchEvent(new Event("change"));
            };
            blobsEl.append(li);
        });
        emptyEl.hidden = selected.length > 0;
    };

    const renderAll = () => {
        renderChosen();
        renderOptions();
        renderTimeline();
        renderSelection();
    };

    const load = () => Promise.all([
            workbenchController.getAllEntities(ARTIST),
            workbenchController.getAllEntities(ARTWORK),
            workbenchController.getRelationService(rel_meta.relationId).getAll(),
        ])
        .then(([allArtists, allArtworks, allRelations]) => {
            artists   = allArtists;
            artworks  = allArtworks;
            relations = allRelations;
            renderAll();
        })
        .catch(err => console.error("cannot load timeline data", err));

    // ---------- view binding ----------

    selectEl.addEventListener("change", renderSelection);

    divEl.querySelector(".clear").onclick = _evt => {
        [...selectEl.options].forEach(option => option.selected = false);
        selectEl.dispatchEvent(new Event("change"));
    };

    // "Übernehmen": same logic as König's submit, only the selected ids come from our hidden select
    let submitted = false;
    divEl.querySelector(".submit").onclick = _evt => {
        submitted = true;
        const selectedIds     = [...selectEl.selectedOptions].map(option => option.value);
        const relationService = workbenchController.getRelationService(rel_meta.relationId);
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
            .then(load)                                                                       // show the saved state
            .catch(err => console.error("cannot save the selection", err));
    };

    // "Abbrechen" or Escape: throw away the changes in the dialog
    dialogEl.addEventListener("close", _evt => {
        if (!submitted) renderAll();
        submitted = false;
    });

    load();

    return [labelEl, divEl];
};
