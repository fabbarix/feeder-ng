// react-query keys for the Courses lib. `all` is the prefix a household event or a Courses write invalidates.
export const courseKeys = {
  all: ['courses'] as const,
  list: (includeArchived: boolean) => ['courses', includeArchived ? 'all' : 'active'] as const,
  impact: (id: number) => ['courses', 'impact', id] as const,
}
