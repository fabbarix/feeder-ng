// react-query keys for the Courses lib. `all` is the prefix a household event or a Courses write invalidates.
export const courseKeys = {
  all: ['courses'] as const,
  /** Prefix of the two list queries; a Course's impact is not under it. */
  lists: ['courses', 'list'] as const,
  list: (includeArchived: boolean) => ['courses', 'list', includeArchived ? 'all' : 'active'] as const,
  impact: (id: number) => ['courses', 'impact', id] as const,
}
