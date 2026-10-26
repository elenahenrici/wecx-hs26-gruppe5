/**
 * Shared data for all sketches.
 * Reads the course data from memoryDB.js (unchanged) and turns it into
 * simple objects that are easy to render.
 * A few values that memoryDB does not have yet (artwork years, some epochs
 * and artist links) are added in SKETCH_EXTRAS below, so the template stays untouched.
 */
import { memoryDB } from "../../app/client/js/memoryDB.js";
import { ARTIST, ARTWORK, EPOCH, EPOCH_ARTIST, ARTIST_ARTWORK } from "../../app/client/js/appTypes.js";

export { artists, artworks, epochs, artistById, artworkById, artworksOfArtist, artistsOfArtwork };

const SKETCH_EXTRAS = {
    artworkYear: { "0": 1480, "1": 1485, "2": 1503, "3": 1656, "4": 1642, "5": null },
    epochArtist: [ { epochId: "3", artistId: "2" }, { epochId: "3", artistId: "3" } ],   // Velázquez, Rembrandt: Baroque
    artistArtwork: [ { artistId: "2", artworkId: "3" }, { artistId: "3", artworkId: "4" } ] // Las Meninas, Night Watch
};

const appBase = new URL("../../app/client/", import.meta.url);
const year    = isoDate => isoDate ? Number(isoDate.slice(0, 4)) : null;

const epochArtist   = [...memoryDB[EPOCH_ARTIST],   ...SKETCH_EXTRAS.epochArtist];
const artistArtwork = [...memoryDB[ARTIST_ARTWORK], ...SKETCH_EXTRAS.artistArtwork];

/** @type {Array<{id:string, label:string}>} */
const epochs = memoryDB[EPOCH].map(e => ({ id: e.id, label: e.displayedAs }));

/** @type {Array<{id:string, label:string, fullName:string, birthYear:number, deathYear:number, pictureUrl:string, bioUrl:string, epochIds:string[]}>} */
const artists = memoryDB[ARTIST].map(a => ({
    id:         a.id,
    label:      a.displayedAs,
    fullName:   a.fullName,
    birthYear:  year(a.birthDate),
    deathYear:  year(a.deathDate),
    pictureUrl: new URL(a.pictureUrl, appBase).href,
    bioUrl:     a.bioUrl,
    epochIds:   epochArtist.filter(r => r.artistId === a.id).map(r => r.epochId),
}));

/** @type {Array<{id:string, label:string, material:string, year:(number|null), pictureUrl:string}>} */
const artworks = memoryDB[ARTWORK].map(w => ({
    id:         w.id,
    label:      w.displayedAs,
    material:   w.material,
    year:       SKETCH_EXTRAS.artworkYear[w.id] ?? null,
    pictureUrl: w.pictureUrl,
}));

const artistById        = id => artists.find(a => a.id === id);
const artworkById       = id => artworks.find(w => w.id === id);
const artworksOfArtist  = artistId  => artistArtwork.filter(r => r.artistId  === artistId ).map(r => artworkById(r.artworkId));
const artistsOfArtwork  = artworkId => artistArtwork.filter(r => r.artworkId === artworkId).map(r => artistById(r.artistId));
