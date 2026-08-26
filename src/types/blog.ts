export interface BlogAuthorProfile {
  username: string;
  displayName: string;
  pfpUrl: string | null;
  /** Presentational staff badge ('admin' renders an AdminBadge). */
  badge: 'admin' | null;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  author: string;
  authorProfile: BlogAuthorProfile | null;
  published: boolean;
  publish_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogListResponse {
  posts: BlogPost[];
}

export interface BlogPostResponse {
  post: BlogPost;
}
