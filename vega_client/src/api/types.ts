export interface Credentials {
  server: string;
  username: string;
  password: string;
}

export interface AuthResponse {
  user_info?: {
    auth?: number;
    status?: string;
    message?: string;
    exp_date?: string | null;
    max_connections?: string | number;
    active_cons?: string | number;
  };
  server_info?: {
    timezone?: string;
  };
  m3u_editor?: {
    version?: string;
    features?: string[];
  };
  error?: string;
}

export interface Category {
  category_id: string;
  category_name: string;
}

export interface LiveStream {
  stream_id: number;
  name: string;
  stream_icon?: string;
  category_id?: string;
  epg_channel_id?: string | null;
  num?: number;
}

export interface VodStream {
  stream_id: number;
  name: string;
  stream_icon?: string;
  category_id?: string;
  container_extension?: string;
  rating?: string | number;
  year?: string | number;
}

export interface Series {
  series_id: number;
  name: string;
  cover?: string;
  backdrop_path?: string[] | string;
  category_id?: string;
  plot?: string;
  rating?: string | number;
  releaseDate?: string;
  release_date?: string;
  year?: string | number;
  genre?: string;
}

export interface VodInfo {
  info?: Record<string, unknown> & {
    name?: string;
    plot?: string;
    description?: string;
    genre?: string;
    director?: string;
    cast?: string;
    release_date?: string;
    year?: string | number;
    duration?: string;
    duration_secs?: number | string;
    rating?: string | number;
    cover_big?: string;
    movie_image?: string;
    backdrop_path?: string[] | string;
  };
  movie_data?: {
    stream_id?: number;
    name?: string;
    container_extension?: string;
  };
}

export interface Episode {
  id: string;
  episode_num: number | string;
  title?: string;
  container_extension?: string;
  season?: number | string;
  info?: {
    plot?: string;
    movie_image?: string;
    duration?: string;
    duration_secs?: number | string;
  };
}

export interface Season {
  season_number: number;
  name?: string;
  episode_count?: number;
}

export interface SeriesInfo {
  info?: Series & { cast?: string; director?: string };
  seasons?: Season[];
  episodes?: Record<string, Episode[]>;
}

export interface EpgListing {
  title?: string;
  description?: string;
  start_timestamp?: number | string;
  stop_timestamp?: number | string;
  start?: string;
  end?: string;
}

export interface Viewer {
  id: number;
  ulid: string;
  name: string;
  is_admin: boolean;
}

export type ProgressContentType = 'live' | 'vod' | 'episode';

export interface Progress {
  content_type: ProgressContentType | string;
  stream_id: number;
  series_id?: number | null;
  season_number?: number | null;
  episode_number?: number | null;
  position_seconds: number;
  duration_seconds?: number | null;
  completed?: boolean | number;
  title?: string | null;
  episode_title?: string | null;
  series_name?: string | null;
  thumbnail_url?: string | null;
  backdrop_url?: string | null;
  up_next?: boolean | number;
}

export interface ProgressUpdate {
  content_type: ProgressContentType;
  stream_id: number;
  position_seconds: number;
  duration_seconds?: number;
  completed: boolean;
  series_id?: number;
  season_number?: number;
  episode_number?: number;
  title?: string;
  episode_title?: string;
  series_name?: string;
  thumbnail_url?: string;
}

export type FavoriteContentType = 'live' | 'vod' | 'series';

export interface Favorite {
  content_type: FavoriteContentType | string;
  stream_id: number;
}

export interface Programme {
  title: string;
  description: string;
  start: number;
  end: number;
}

export type PlayableType = 'live' | 'vod' | 'episode';

export interface PlayRequest {
  type: PlayableType;
  title: string;
  subtitle?: string;
  streamId: number;
  extension?: string;
  startPosition?: number;
  seriesId?: number;
  seriesName?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  thumbnail?: string;
  channels?: LiveStream[];
}
