import { addToPlaylist, buildPredicate, filterTracks, removeFromPlaylist, reorderTracks, searchTracks, sortTracks, summarize, } from "playlist";
const ID_PREFIX = "trk-";
const ID_PATTERN = /^trk-(\d+)$/;
function highestIdNumber(tracks) {
    return tracks.reduce((highest, track) => {
        const match = ID_PATTERN.exec(track.id);
        const digits = match === null ? undefined : match[1];
        return digits === undefined ? highest : Math.max(highest, Number(digits));
    }, 0);
}
function normalizeName(name) {
    const trimmed = name.trim();
    if (trimmed === "") {
        throw new Error("Playlist name cannot be empty");
    }
    return trimmed;
}
export function createPlaylistStore(name, initialTracks = []) {
    // Private state. Each store gets its own copy, so two stores (and the fixture) never share anything.
    let playlistName = normalizeName(name);
    let tracks = structuredClone(initialTracks);
    let nextIdNumber = highestIdNumber(tracks) + 1;
    const history = [];
    // Single place where state changes, so undo history cannot get out of sync.
    const commit = (next) => {
        history.push(tracks);
        tracks = next;
    };
    // Copy at the boundary: results contain the store's own Track objects, so hand out clones.
    const expose = (value) => structuredClone(value);
    return {
        getName: () => playlistName,
        rename(newName) {
            playlistName = normalizeName(newName);
        },
        getTracks: () => structuredClone([...tracks]),
        add(newTrack) {
            const id = `${ID_PREFIX}${String(nextIdNumber).padStart(3, "0")}`;
            const track = { ...structuredClone(newTrack), id };
            // Throws if invalid, before any state has changed (and before the id counter moves).
            const next = addToPlaylist(tracks, track);
            nextIdNumber += 1; // ids are never reused, even after undo
            commit(next);
            return structuredClone(track);
        },
        remove(trackId) {
            const next = removeFromPlaylist(tracks, trackId);
            if (next.length !== tracks.length) {
                commit(next); // only record history when something actually changed
            }
        },
        move(source, dest) {
            commit(reorderTracks(tracks, source, dest));
        },
        sort: (field, direction) => expose(sortTracks(tracks, field, direction)),
        search: (query) => expose(searchTracks(tracks, query)),
        filter: (criteria) => expose(filterTracks(tracks, buildPredicate(criteria))),
        summary: () => expose(summarize(tracks)),
        undo() {
            const previous = history.pop();
            if (previous === undefined) {
                return false;
            }
            tracks = previous;
            return true;
        },
    };
}
