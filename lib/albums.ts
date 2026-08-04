export type Album = {
  id: string
  title: string
  artist: string
  year: string
  cover: string
  note?: string
}

export const STORAGE_KEY = "top-albums-v1"

export const SEED_ALBUMS: Album[] = [
  {
    id: "seed-1",
    title: "In Rainbows",
    artist: "Radiohead",
    year: "2007",
    cover: "",
    note: "Une texture sonore intemporelle.",
  },
  {
    id: "seed-2",
    title: "To Pimp a Butterfly",
    artist: "Kendrick Lamar",
    year: "2015",
    cover: "",
    note: "Jazz, funk et poésie brute.",
  },
  {
    id: "seed-3",
    title: "Blonde",
    artist: "Frank Ocean",
    year: "2016",
    cover: "",
  },
]

export function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
