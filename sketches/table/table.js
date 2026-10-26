/**
 * Sketch: Table / Matrix (Larissa)
 * Assigns ARTISTS to ARTWORKS. Rows = artworks, columns = artists, a checked
 * cell means "assigned". Each row is its own multi selection of artists,
 * like one <select multiple> per artwork.
 *
 * What is already done: data + one shared selection model per artwork + debug panel.
 * The rendering below is only a plain baseline, replace it step by step.
 */
import { artists, artworks, artistsOfArtwork } from "../shared/data.js";
import { MultiSelect } from "../shared/multiSelect.js";
import { DebugPanel }  from "../shared/debugPanel.js";

const root = document.getElementById("sketch");

// one model per artwork, pre-filled with the existing assignments
const models = new Map(artworks.map(work => {
    const model = MultiSelect({ name: `artists-of-${work.id}`, options: artists });
    artistsOfArtwork(work.id).forEach(artist => model.select(artist.id));
    return [work.id, model];
}));

// TODO matrix: <table> with artworks as rows and artists as columns
// TODO cell click toggles the assignment, show "N/A" for artworks without artist
// TODO keyboard: arrow keys move between cells, Space toggles
// TODO optional: filter rows / columns

// ---- baseline rendering (replace) ----
artworks.forEach(work => {
    const model = models.get(work.id);
    const row = document.createElement("section");
    row.innerHTML = `<h2>${work.label}</h2>`;
    artists.forEach(artist => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = artist.label;
        button.onclick = () => model.toggle(artist.id);
        model.onChange(() => button.setAttribute("aria-pressed", String(model.isSelected(artist.id))));
        row.append(button, " ");
    });
    root.append(row, model.element);
});

root.append(DebugPanel(models.get("2"), "artists of Mona Lisa"));
