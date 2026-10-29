/**
 * playlist.ts: pure playlist functions.
 *
 * Conventions used throughout this file:
 *  - Pure: no mutation of inputs, no logging, no fixtures or other globals.
 *    Every function that returns a playlist returns a NEW array.
 *  - Error policy (one rule, stated once):
 *      * malformed input (invalid track data, bad index, bad range)  -> throw
 *      * valid input that has nothing to do (duplicate id, id not found) -> return the playlist unchanged
 *  - Inputs are typed `readonly Track[]`, so the compiler rejects accidental mutation of the array.
 *    (This protects the array, not the individual Track objects. Treat tracks as immutable too.)
 *
 * Expected Track shape (update your "types" module to match):
 *   {
 *     id: string;
 *     title: string;
 *     artist: string;
 *     duration: number;     // seconds
 *     genres: string[];     // at least one
 *     releaseYear: number;  // e.g. 2019 (a plain number, not a Date or a string)
 *   }
 */
import type { Track } from "types";

/* ------------------------------------------------------------------ */
/* Shared types                                                        */
/* ------------------------------------------------------------------ */

export type NewTrack = Omit<Track, "id">;
export type Predicate<T> = (item: T) => boolean;
export type SortField = "title" | "artist" | "duration" | "releaseYear";
export type SortDirection = "asc" | "desc";

export interface NumericRange {
  min?: number; // inclusive; omit for "no lower bound"
  max?: number; // inclusive; omit for "no upper bound"
}

export interface FilterCriteria {
  artist?: string;
  genre?: string;
  years?: NumericRange;
  durationSec?: NumericRange;
}

export interface PlaylistSummary {
  totalTracks: number;
  totalDurationSec: number;
  totalDurationFormatted: string;
  tracksPerArtist: Map<string, number>;
  longestTrack: Track | null; // null for an empty playlist
  shortestTrack: Track | null; // null for an empty playlist
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const MIN_RELEASE_YEAR = 1900;
const MAX_RELEASE_YEAR = 2100;

const isBlank = (value: string): boolean => value.trim() === "";
const normalize = (value: string): string => value.trim().toLowerCase();
const compareText = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { sensitivity: "base" });

function assertIndex(label: string, index: number, length: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new RangeError(
      `${label} index ${index} is out of range for a playlist of ${length} tracks`
    );
  }
}

function assertRange(label: string, { min, max }: NumericRange): void {
  if (min !== undefined && max !== undefined && min > max) {
    throw new RangeError(
      `${label}: min (${min}) cannot be greater than max (${max})`
    );
  }
}

function isWithin(value: number, { min, max }: NumericRange): boolean {
  return (
    (min === undefined || value >= min) && (max === undefined || value <= max)
  );
}

/** Collects every problem, so the error says what was wrong, not just that something was. */
function assertValidTrack(track: Track): void {
  const problems: string[] = [];

  if (isBlank(track.id)) problems.push("id is required");
  if (isBlank(track.title)) problems.push("title is required");
  if (isBlank(track.artist)) problems.push("artist is required");
  if (!Number.isFinite(track.duration) || track.duration <= 0) {
    problems.push("duration must be a positive number of seconds");
  }
  if (track.genres.length === 0 || track.genres.some(isBlank)) {
    problems.push("genres must contain at least one non-empty genre");
  }
  if (
    !Number.isInteger(track.releaseYear) ||
    track.releaseYear < MIN_RELEASE_YEAR ||
    track.releaseYear > MAX_RELEASE_YEAR
  ) {
    problems.push(
      `releaseYear must be an integer between ${MIN_RELEASE_YEAR} and ${MAX_RELEASE_YEAR}`
    );
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
export function parseDuration(text: string): number {
  const match = DURATION_PATTERN.exec(text.trim());
  if (match === null) {
    throw new Error(
      `Invalid duration "${text}", expected m:ss (for example "3:45")`
    );
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 225 -> "3:45", 3725 -> "1:02:05" */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    throw new RangeError(`Cannot format duration: ${totalSeconds}`);
  }
  const whole = Math.round(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");

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
export function addToPlaylist(tracks: readonly Track[], track: Track): Track[] {
  assertValidTrack(track);
  if (tracks.some((existing) => existing.id === track.id)) {
    return [...tracks];
  }
  return [...tracks, track];
}

/** Removes by id. An id that is not present leaves the playlist unchanged. */
export function removeFromPlaylist(
  tracks: readonly Track[],
  trackId: string
): Track[] {
  if (isBlank(trackId)) {
    throw new Error("trackId is required");
  }
  return tracks.filter((track) => track.id !== trackId);
}

/**
 * Moves the track at `source` so that it ends up at index `dest` of the RESULTING playlist.
 * Both indexes must be integers in [0, length - 1]; otherwise a RangeError is thrown.
 */
export function reorderTracks(
  tracks: readonly Track[],
  source: number,
  dest: number
): Track[] {
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
export const and =
  <T>(...predicates: readonly Predicate<T>[]): Predicate<T> =>
  (item) =>
    predicates.every((predicate) => predicate(item));

/** True if at least one predicate is true. With no predicates it is always false. */
export const or =
  <T>(...predicates: readonly Predicate<T>[]): Predicate<T> =>
  (item) =>
    predicates.some((predicate) => predicate(item));

/** Case-insensitive substring match. An empty term matches everything. */
export function byArtist(term: string): Predicate<Track> {
  const needle = normalize(term);
  return (track) => normalize(track.artist).includes(needle);
}

/** A track matches if ANY of its genres contains the term (case-insensitive). */
export function byGenre(term: string): Predicate<Track> {
  const needle = normalize(term);
  return (track) =>
    track.genres.some((genre) => normalize(genre).includes(needle));
}

/** Inclusive year range. Either bound may be omitted. */
export function byYearRange(range: NumericRange): Predicate<Track> {
  assertRange("years", range);
  return (track) => isWithin(track.releaseYear, range);
}

/** Inclusive duration range in seconds. Either bound may be omitted. */
export function byDuration(range: NumericRange): Predicate<Track> {
  assertRange("durationSec", range);
  return (track) => isWithin(track.duration, range);
}

/** Matches title or artist, case-insensitive, ignoring edge whitespace. Empty query matches everything. */
export function byText(query: string): Predicate<Track> {
  const term = normalize(query);
  return (track) =>
    term === "" ||
    normalize(track.title).includes(term) ||
    normalize(track.artist).includes(term);
}

/** Builds one predicate from whichever criteria were provided, combined with AND. */
export function buildPredicate(criteria: FilterCriteria): Predicate<Track> {
  const predicates: Predicate<Track>[] = [];

  if (criteria.artist !== undefined) predicates.push(byArtist(criteria.artist));
  if (criteria.genre !== undefined) predicates.push(byGenre(criteria.genre));
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

export function filterTracks(
  tracks: readonly Track[],
  predicate: Predicate<Track>
): Track[] {
  return tracks.filter(predicate);
}

export function searchTracks(tracks: readonly Track[], query: string): Track[] {
  return filterTracks(tracks, byText(query));
}

// Record<SortField, ...> makes the compiler force a comparator for every field in the union.
const comparators: Record<SortField, (a: Track, b: Track) => number> = {
  title: (a, b) => compareText(a.title, b.title),
  artist: (a, b) => compareText(a.artist, b.artist),
  duration: (a, b) => a.duration - b.duration,
  releaseYear: (a, b) => a.releaseYear - b.releaseYear,
};

/** Returns a sorted copy. Ties are broken by title (always ascending, regardless of direction). */
export function sortTracks(
  tracks: readonly Track[],
  field: SortField,
  direction: SortDirection = "asc"
): Track[] {
  const compare = comparators[field];
  const sign = direction === "asc" ? 1 : -1;

  return [...tracks].sort((a, b) => {
    const primary = compare(a, b) * sign;
    return primary !== 0 ? primary : compareText(a.title, b.title);
  });
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

interface Totals {
  totalDurationSec: number;
  tracksPerArtist: Map<string, number>;
  longestTrack: Track | null;
  shortestTrack: Track | null;
}

export function summarize(tracks: readonly Track[]): PlaylistSummary {
  // The accumulator is created inside this call, so mutating it does not touch the caller's data.
  const totals = tracks.reduce<Totals>(
    (acc, track) => {
      acc.totalDurationSec += track.duration;
      acc.tracksPerArtist.set(
        track.artist,
        (acc.tracksPerArtist.get(track.artist) ?? 0) + 1
      );
      if (
        acc.longestTrack === null ||
        track.duration > acc.longestTrack.duration
      ) {
        acc.longestTrack = track;
      }
      if (
        acc.shortestTrack === null ||
        track.duration < acc.shortestTrack.duration
      ) {
        acc.shortestTrack = track;
      }
      return acc;
    },
    {
      totalDurationSec: 0,
      tracksPerArtist: new Map<string, number>(),
      longestTrack: null,
      shortestTrack: null,
    }
  );

  return {
    totalTracks: tracks.length,
    totalDurationSec: totals.totalDurationSec,
    totalDurationFormatted: formatDuration(totals.totalDurationSec),
    tracksPerArtist: totals.tracksPerArtist,
    longestTrack: totals.longestTrack,
    shortestTrack: totals.shortestTrack,
  };
}
