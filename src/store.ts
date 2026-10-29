/**
 * store.ts: a closure-based playlist store.
 *
 * How it works:
 *  - The current playlist lives in a `let` variable inside the closure. Nothing outside can reach it.
 *  - Every change calls a pure function from playlist.ts and then REASSIGNS the variable with the result.
 *  - Because states are never mutated, undo is just "keep the previous arrays and switch back".
 *  - Anything that leaves the store (and anything that enters it) is cloned once, at the boundary, so
 *    callers cannot reach in and corrupt private state through a shared reference.
 */
import type { Track } from "types";
import {
  addToPlaylist,
  buildPredicate,
  filterTracks,
  removeFromPlaylist,
  reorderTracks,
  searchTracks,
  sortTracks,
  summarize,
} from "playlist";
import type {
  FilterCriteria,
  NewTrack,
  PlaylistSummary,
  SortDirection,
  SortField,
} from "playlist";

export interface PlaylistStore {
  getName(): string;
  rename(newName: string): void;
  /** A copy of the current tracks. Changing it does not affect the store. */
  getTracks(): Track[];
  /** Adds a track, generating its id. Returns a copy of the created track (so you know its id). */
  add(newTrack: NewTrack): Track;
  /** Removes by id. An unknown id is a no-op. */
  remove(trackId: string): void;
  /** Moves a track so it ends up at index `dest`. Throws RangeError on invalid indexes. */
  move(source: number, dest: number): void;
  /** Returns a sorted COPY. The store's own order is not changed. */
  sort(field: SortField, direction?: SortDirection): Track[];
  search(query: string): Track[];
  filter(criteria: FilterCriteria): Track[];
  summary(): PlaylistSummary;
  /** Reverts the last add, remove or move. Returns false if there is nothing to undo. */
  undo(): boolean;
}

const ID_PREFIX = "trk-";
const ID_PATTERN = /^trk-(\d+)$/;

function highestIdNumber(tracks: readonly Track[]): number {
  return tracks.reduce((highest, track) => {
    const match = ID_PATTERN.exec(track.id);
    const digits = match === null ? undefined : match[1];
    return digits === undefined ? highest : Math.max(highest, Number(digits));
  }, 0);
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new Error("Playlist name cannot be empty");
  }
  return trimmed;
}

export function createPlaylistStore(
  name: string,
  initialTracks: readonly Track[] = []
): PlaylistStore {
  // Private state. Each store gets its own copy, so two stores (and the fixture) never share anything.
  let playlistName = normalizeName(name);
  let tracks: readonly Track[] = structuredClone(initialTracks);
  let nextIdNumber = highestIdNumber(tracks) + 1;
  const history: (readonly Track[])[] = [];

  // Single place where state changes, so undo history cannot get out of sync.
  const commit = (next: readonly Track[]): void => {
    history.push(tracks);
    tracks = next;
  };

  // Copy at the boundary: results contain the store's own Track objects, so hand out clones.
  const expose = <T>(value: T): T => structuredClone(value);

  return {
    getName: () => playlistName,

    rename(newName) {
      playlistName = normalizeName(newName);
    },

    getTracks: () => structuredClone([...tracks]),

    add(newTrack) {
      const id = `${ID_PREFIX}${String(nextIdNumber).padStart(3, "0")}`;
      const track: Track = { ...structuredClone(newTrack), id };

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

    filter: (criteria) =>
      expose(filterTracks(tracks, buildPredicate(criteria))),

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
