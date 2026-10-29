interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  genres: Array<string>;
  releaseYear: number;
}

export { Track };
