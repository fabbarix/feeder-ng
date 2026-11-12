// /settings/tags (ListPage): the Tags by name, each as a pill with what uses it. Add, edit, merge and delete through the sheet.
import type { ReactElement } from 'react'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { Button, Chip, EmptyState, ListGroup, ListPage, ListRow, PageHeader } from '../../../ui'
import { MergeTargetDialog } from '../components/MergeTargetDialog'
import { TagSheet } from '../components/TagSheet'
import { useTagsPage } from '../hooks/useTagsPage'
import { rowLabel, usageLine } from '../lib/usage'
import { tagsStrings } from '../strings'

/** /settings/tags on the shared ListPage. */
export function TagsScreen(): ReactElement | null {
  const page = useTagsPage()
  const breadcrumbs = useBreadcrumbs()
  return (
    <ListPage header={<PageHeader title={tagsStrings.title} breadcrumbs={breadcrumbs} />}>
      <p className="pg__muted">{tagsStrings.intro}</p>
      {page.isLoading ? (
        <p role="status">{tagsStrings.loading}</p>
      ) : page.isError ? (
        <p role="alert">{tagsStrings.loadFailed}</p>
      ) : page.tags.length === 0 ? (
        <EmptyState icon="tag" title={tagsStrings.empty.title} description={tagsStrings.empty.description} />
      ) : (
        <div ref={page.listRef}>
          <ListGroup label={tagsStrings.listLabel}>
            {page.tags.map((tag) => (
              <ListRow
                key={tag.id}
                data-tag-id={String(tag.id)}
                title={usageLine(tag)}
                aria-label={rowLabel(tag)}
                leading={<Chip kind="tag" tagColour={tag.colour}>{tag.name}</Chip>}
                chevron
                onActivate={() => page.openEdit(tag)}
              />
            ))}
          </ListGroup>
        </div>
      )}
      <Button ref={page.addRef} type="button" variant="tertiary" icon="add" onClick={page.openNew}>
        {tagsStrings.add}
      </Button>
      <TagSheet
        sheet={page.sheet}
        newColour={page.newColour}
        onClose={page.closeSheet}
        onSave={page.save}
        onMerge={page.openMergePicker}
        onDelete={() => void page.deleteTag()}
        busy={page.busy}
      />
      <MergeTargetDialog
        state={page.mergePicker}
        tags={page.tags}
        busy={page.busy}
        onTarget={page.setMergeTarget}
        onReview={() => void page.reviewMerge()}
        onClose={page.closeMergePicker}
      />
    </ListPage>
  )
}
