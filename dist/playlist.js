/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
const MIN_RELEASE_YEAR = 1900;
const MAX_RELEASE_YEAR = 2100;
const isBlank = (value) => value.trim() === "";
const normalize = (value) => value.trim().toLowerCase();
const compareText = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });
function assertIndex(label, index, length) {
    if (!Number.isInteger(index) || index < 0 || index >= length) {
        throw new RangeError(`${label} index ${index} is out of range for a playlist of ${length} tracks`);
    }
}
function assertRange(label, { min, max }) {
    if (min !== undefined && max !== undefined && min > max) {
        throw new RangeError(`${label}: min (${min}) cannot be greater than max (${max})`);
    }
}
function isWithin(value, { min, max }) {
    return ((min === undefined || value >= min) && (max === undefined || value <= max));
}
/** Collects every problem, so the error says what was wrong, not just that something was. */
function assertValidTrack(track) {
    const problems = [];
    if (isBlank(track.id))
        problems.push("id is required");
    if (isBlank(track.title))
        problems.push("title is required");
    if (isBlank(track.artist))
        problems.push("artist is required");
    if (!Number.isFinite(track.duration) || track.duration <= 0) {
        problems.push("duration must be a positive number of seconds");
    }
    if (track.genres.length === 0 || track.genres.some(isBlank)) {
        problems.push("genres must contain at least one non-empty genre");
    }
    if (!Number.isInteger(track.releaseYear) ||
        track.releaseYear < MIN_RELEASE_YEAR ||
        track.releaseYear > MAX_RELEASE_YEAR) {
        problems.push(`releaseYear must be an integer between ${MIN_RELEASE_YEAR} and ${MAX_RELEASE_YEAR}`);
    }
    if (problems.length > 0) {
        throw new Error(`Invalid track: ${problems.join("; ")}`);
    }
}
/* ------------------------------------------------------------------ */
/* Duration helpers                                                    */
/* ------------------------------------------------------------------ */
const DURATION_PATTERN = /^(\d+):([0-5]\d)$/;
/** "3:45" -> 225. Keep durations in seconds internally; convert only at the edges. */
export function parseDuration(text) {
    const match = DURATION_PATTERN.exec(text.trim());
    if (match === null) {
        throw new Error(`Invalid duration "${text}", expected m:ss (for example "3:45")`);
    }
    return Number(match[1]) * 60 + Number(match[2]);
}
/** 225 -> "3:45", 3725 -> "1:02:05" */
export function formatDuration(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
        throw new RangeError(`Cannot format duration: ${totalSeconds}`);
    }
    const whole = Math.round(totalSeconds);
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const seconds = whole % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return hours > 0
        ? `${hours}:${pad(minutes)}:${pad(seconds)}`
        : `${minutes}:${pad(seconds)}`;
}
/* ------------------------------------------------------------------ */
/* Add, remove, reorder                                                */
/* ------------------------------------------------------------------ */
/**
 * Appends a track. Throws if the track data is invalid.
 * If a track with the same id already exists, the playlist is returned unchanged (as a new array).
 * Ids are supplied by the caller. Generating them (and randomness or counters) is not this function's job.
 */
export function addToPlaylist(tracks, track) {
    assertValidTrack(track);
    if (tracks.some((existing) => existing.id === track.id)) {
        return [...tracks];
    }
    return [...tracks, track];
}
/** Removes by id. An id that is not present leaves the playlist unchanged. */
export function removeFromPlaylist(tracks, trackId) {
    if (isBlank(trackId)) {
        throw new Error("trackId is required");
    }
    return tracks.filter((track) => track.id !== trackId);
}
/**
 * Moves the track at `source` so that it ends up at index `dest` of the RESULTING playlist.
 * Both indexes must be integers in [0, length - 1]; otherwise a RangeError is thrown.
 */
export function reorderTracks(tracks, source, dest) {
    assertIndex("source", source, tracks.length);
    assertIndex("dest", dest, tracks.length);
    const moved = tracks[source];
    if (moved === undefined) {
        // Unreachable after assertIndex, but narrows the type (and guards noUncheckedIndexedAccess).
        throw new RangeError(`No track at index ${source}`);
    }
    const result = tracks.filter((_, index) => index !== source);
    result.splice(dest, 0, moved);
    return result;
}
/* ------------------------------------------------------------------ */
/* Predicates and combinators                                          */
/* ------------------------------------------------------------------ */
/** True only if every predicate is true. With no predicates it is always true. */
export const and = (...predicates) => (item) => predicates.every((predicate) => predicate(item));
/** True if at least one predicate is true. With no predicates it is always false. */
export const or = (...predicates) => (item) => predicates.some((predicate) => predicate(item));
/** Case-insensitive substring match. An empty term matches everything. */
export function byArtist(term) {
    const needle = normalize(term);
    return (track) => normalize(track.artist).includes(needle);
}
/** A track matches if ANY of its genres contains the term (case-insensitive). */
export function byGenre(term) {
    const needle = normalize(term);
    return (track) => track.genres.some((genre) => normalize(genre).includes(needle));
}
/** Inclusive year range. Either bound may be omitted. */
export function byYearRange(range) {
    assertRange("years", range);
    return (track) => isWithin(track.releaseYear, range);
}
/** Inclusive duration range in seconds. Either bound may be omitted. */
export function byDuration(range) {
    assertRange("durationSec", range);
    return (track) => isWithin(track.duration, range);
}
/** Matches title or artist, case-insensitive, ignoring edge whitespace. Empty query matches everything. */
export function byText(query) {
    const term = normalize(query);
    return (track) => term === "" ||
        normalize(track.title).includes(term) ||
        normalize(track.artist).includes(term);
}
/** Builds one predicate from whichever criteria were provided, combined with AND. */
export function buildPredicate(criteria) {
    const predicates = [];
    if (criteria.artist !== undefined)
        predicates.push(byArtist(criteria.artist));
    if (criteria.genre !== undefined)
        predicates.push(byGenre(criteria.genre));
    if (criteria.years !== undefined)
        predicates.push(byYearRange(criteria.years));
    if (criteria.durationSec !== undefined) {
        predicates.push(byDuration(criteria.durationSec));
    }
    return and(...predicates);
}
/* ------------------------------------------------------------------ */
/* Filter, search, sort                                                */
/* ------------------------------------------------------------------ */
export function filterTracks(tracks, predicate) {
    return tracks.filter(predicate);
}
export function searchTracks(tracks, query) {
    return filterTracks(tracks, byText(query));
}
// Record<SortField, ...> makes the compiler force a comparator for every field in the union.
const comparators = {
    title: (a, b) => compareText(a.title, b.title),
    artist: (a, b) => compareText(a.artist, b.artist),
    duration: (a, b) => a.duration - b.duration,
    releaseYear: (a, b) => a.releaseYear - b.releaseYear,
};
/** Returns a sorted copy. Ties are broken by title (always ascending, regardless of direction). */
export function sortTracks(tracks, field, direction = "asc") {
    const compare = comparators[field];
    const sign = direction === "asc" ? 1 : -1;
    return [...tracks].sort((a, b) => {
        const primary = compare(a, b) * sign;
        return primary !== 0 ? primary : compareText(a.title, b.title);
    });
}
export function summarize(tracks) {
    // The accumulator is created inside this call, so mutating it does not touch the caller's data.
    const totals = tracks.reduce((acc, track) => {
        acc.totalDurationSec += track.duration;
        acc.tracksPerArtist.set(track.artist, (acc.tracksPerArtist.get(track.artist) ?? 0) + 1);
        if (acc.longestTrack === null ||
            track.duration > acc.longestTrack.duration) {
            acc.longestTrack = track;
        }
        if (acc.shortestTrack === null ||
            track.duration < acc.shortestTrack.duration) {
            acc.shortestTrack = track;
        }
        return acc;
    }, {
        totalDurationSec: 0,
        tracksPerArtist: new Map(),
        longestTrack: null,
        shortestTrack: null,
    });
    return {
        totalTracks: tracks.length,
        totalDurationSec: totals.totalDurationSec,
        totalDurationFormatted: formatDuration(totals.totalDurationSec),
        tracksPerArtist: totals.tracksPerArtist,
        longestTrack: totals.longestTrack,
        shortestTrack: totals.shortestTrack,
    };
}
