/**
 * Sketch: Table / Matrix (Larissa)
 *
 * Assigns ARTISTS to ARTWORKS:
 *  - rows = artworks, columns = artists, a checked cell means "assigned"
 *  - each row is its own multi selection of artists (like one <select multiple> per artwork)
 *  - last column "N/A": marked when an artwork has no artist, clicking it clears the row
 *  - keyboard: Tab into the table, arrow keys move between cells,
 *    Home/End jump to the start/end of the row, Space/Enter toggles
 *  - the debug panel below always shows the row you are working on
 *
 * All selection state lives in the shared MultiSelect models.
 * This file only decides how it looks and how the user interacts with it.
 */
import {artists, artworks, artistsOfArtwork} from "../shared/data.js";
import {MultiSelect} from "../shared/multiSelect.js";
import {DebugPanel} from "../shared/debugPanel.js";

// ---------- configuration ----------

/** same pigment colours as in the timeline sketch, so both sketches feel like one product */
const COLORS = {
    "0": "#C2416B", // Botticelli, madder rose
    "1": "#1E8A5C", // Leonardo, malachite
    "2": "#2C4BD1", // Velázquez, ultramarine
    "3": "#B8860B", // Rembrandt, ochre
    "4": "#E3412B", // Caravaggio, vermilion
};
const colorOf = artistId => COLORS[artistId] ?? "#555";

/** columns = artists, sorted by birth year (same order as the timeline rows) */
const columns = [...artists].sort((a, b) => a.birthYear - b.birthYear);
const NA_COL = columns.length;   // index of the extra "N/A" column at the end

// ---------- model ----------

// one model per artwork, pre-filled with the existing assignments
const models = new Map(artworks.map(work => {
    const model = MultiSelect({name: `artists-of-${work.id}`, options: artists});
    artistsOfArtwork(work.id).forEach(artist => model.select(artist.id));
    return [work.id, model];
}));

const modelOfRow = row => models.get(artworks[row].id);

// ---------- static structure ----------

const root = document.getElementById("sketch");
root.innerHTML = `
    <form class="matrix-form">
        <table class="matrix" role="grid" aria-label="Zuordnung: Kunstwerke zu Künstler:innen">
            <thead><tr><th scope="col" class="corner">Kunstwerk / Künstler:in</th></tr></thead>
            <tbody></tbody>
        </table>
    </form>
    <p class="summary"></p>
    <div class="debug-area"></div>
`;
const form = root.querySelector("form");
const table = root.querySelector("table");
const headRow = table.querySelector("thead tr");
const tbody = table.querySelector("tbody");
const summary = root.querySelector(".summary");
const debugArea = root.querySelector(".debug-area");

// ---------- column headers: one per artist + N/A ----------

/** headers[col] = <th>, used to highlight the active column */
const headers = columns.map(artist => {
    const th = document.createElement("th");
    th.scope = "col";
    th.style.setProperty("--color", colorOf(artist.id));
    th.innerHTML = `<span class="dot"></span><strong>${artist.label}</strong><small>${artist.birthYear}–${artist.deathYear}</small>`;
    return th;
});
const naHeader = document.createElement("th");
naHeader.scope = "col";
naHeader.className = "na";
naHeader.innerHTML = `<strong>N/A</strong><small>keine Zuordnung</small>`;
headers.push(naHeader);
headRow.append(...headers);

// ---------- summary below the table ----------

const updateSummary = () => {
    const values = [...models.values()].map(model => model.getValue());
    const assigned = values.reduce((sum, value) => sum + value.length, 0);
    const unassigned = values.filter(value => value.length === 0).length;
    summary.textContent =
        `${artworks.length} Kunstwerke · ${columns.length} Künstler:innen · ${assigned} Zuordnungen · ${unassigned} ohne Künstler:in`;
};

// ---------- rows: one per artwork ----------

/** grid[row][col] = <td>, used for keyboard navigation */
const grid = [];
/** one debug panel per artwork, only the active one is visible */
const debugPanels = [];

const createCell = (row, col, label) => {
    const td = document.createElement("td");
    td.setAttribute("role", "gridcell");
    td.setAttribute("aria-label", label);
    td.tabIndex = -1;               // "roving tabindex": only the active cell gets 0
    td.dataset.row = String(row);
    td.dataset.col = String(col);
    td.innerHTML = `<span class="mark" aria-hidden="true"></span>`;
    return td;
};

artworks.forEach((work, row) => {
    const model = modelOfRow(row);
    const tr = document.createElement("tr");
    tr.innerHTML = `<th scope="row"><strong>${work.label}</strong><small>${work.year ?? "Jahr unbekannt"}</small></th>`;

    const cells = columns.map((artist, col) => {
        const td = createCell(row, col, `${work.label} – ${artist.label}`);
        td.style.setProperty("--color", colorOf(artist.id));
        return td;
    });
    const naCell = createCell(row, NA_COL, `${work.label} – keine Künstler:in`);
    naCell.classList.add("na");
    naCell.querySelector(".mark").textContent = "N/A";
    cells.push(naCell);

    tr.append(...cells);
    tbody.append(tr);
    grid.push(cells);

    // data binding: model → view (onChange also runs once right away with the start value)
    model.onChange(value => {
        cells.forEach((td, col) => {
            const isOn = col === NA_COL
                ? value.length === 0                    // N/A is "on" when nothing is assigned
                : value.includes(columns[col].id);
            td.setAttribute("aria-selected", String(isOn));
        });
        tr.classList.toggle("unassigned", value.length === 0);
        updateSummary();
    });

    // the real (hidden) <select multiple> lives inside the form, so the form "sees" the value
    form.append(model.element);

    const panel = DebugPanel(model, `artists of ${work.label}`);
    panel.hidden = true;
    debugPanels.push(panel);
});
debugArea.append(...debugPanels);

// ---------- actions ----------

/** what happens when a cell is clicked or Space/Enter is pressed on it */
const activate = (row, col) => {
    const model = modelOfRow(row);
    if (col === NA_COL) {
        model.clear();                         // N/A: remove all artists of this artwork
    } else {
        model.toggle(columns[col].id);         // artist: assign / unassign
    }
};

// ---------- focus + highlight ----------

let active = {row: 0, col: 0};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const focusCell = (row, col) => {
    row = clamp(row, 0, grid.length - 1);
    col = clamp(col, 0, NA_COL);

    grid[active.row][active.col].tabIndex = -1;
    active = {row, col};
    const cell = grid[row][col];
    cell.tabIndex = 0;
    cell.focus();
    highlight();
};

/** marks the active row and column, and shows the debug panel of the active row */
const highlight = () => {
    tbody.querySelectorAll("tr").forEach((tr, row) => tr.classList.toggle("active-row", row === active.row));
    headers.forEach((th, col) => th.classList.toggle("active-col", col === active.col));
    grid.forEach(cells => cells.forEach((td, col) => td.classList.toggle("active-col", col === active.col)));
    debugPanels.forEach((panel, row) => panel.hidden = row !== active.row);
};

// ---------- view binding: mouse ----------

// event delegation: one listener on the table instead of one per cell
table.addEventListener("click", event => {
    const cell = event.target.closest('[role="gridcell"]');
    if (!cell) return;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    focusCell(row, col);
    activate(row, col);
});

// ---------- view binding: keyboard ----------

const moves = {
    ArrowRight: ({row, col}) => ({row, col: col + 1}),
    ArrowLeft: ({row, col}) => ({row, col: col - 1}),
    ArrowDown: ({row, col}) => ({row: row + 1, col}),
    ArrowUp: ({row, col}) => ({row: row - 1, col}),
    Home: ({row}) => ({row, col: 0}),
    End: ({row}) => ({row, col: NA_COL}),
};

table.addEventListener("keydown", event => {
    if (event.key === " " || event.key === "Enter") {
        event.preventDefault();               // Space would scroll, Enter would submit the form
        activate(active.row, active.col);
        return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();                   // arrow keys would scroll the page
    const next = move(active);
    focusCell(next.row, next.col);
});

// ---------- start ----------

grid[0][0].tabIndex = 0;                      // Tab lands on the first cell
highlight();

// the matrix behaves like native selects inside a form: other code can listen to "change"
form.onsubmit = event => event.preventDefault();
form.addEventListener("change", () => console.log("form value", [...new FormData(form)]));