export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  author: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface BlogListResponse {
  posts: BlogPost[];
}

export interface BlogPostResponse {
  post: BlogPost;
}
