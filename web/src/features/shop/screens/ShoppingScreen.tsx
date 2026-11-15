// The Shop screen (bottom bar "Shop", route /shop). Wires hooks to components; no fetching or domain maths here.
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { markSlotPath } from '../../plan'
import { useMe } from '../../../app/useMe'
import { actionFailed, failureToast } from '../../../lib/errorCopy'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { useIngredientChoices } from '../../stock/hooks/useIngredientChoices'
import { ErrorState } from '../../../ui/ErrorState'
import { LoadState } from '../../../ui/LoadState'
import { IconButton } from '../../../ui/IconButton'
import { PageHeader } from '../../../ui/PageHeader'
import { ShopSelect } from '../../../ui/Select/ShopSelect'
import { SkeletonGroup, SkeletonList } from '../../../ui/Skeleton'
import { useToast } from '../../../ui/Toast'
import { PriceSheet } from '../../../ui/PriceSheet'
import { ExtraSheet } from '../components/ExtraSheet'
import { LineSheet } from '../components/LineSheet'
import { RangePicker } from '../components/RangePicker'
import { ShoppingBody } from '../components/ShoppingBody'
import { TickChangeSheet } from '../components/TickChangeSheet'
import { ANY_SHOP_ID, shopPickerChoices } from '../lib/anyShop'
import { listEntries, notNeededEntries, type ListEntry } from '../lib/lines'
import type { RowGroup } from '../lib/rows'
import { changeTargetOf } from '../lib/tickAmount'
import { addedNameOf } from '../lib/extraDraft'
import { useChangePrice } from '../hooks/useChangePrice'
import { useCompleteTile } from '../hooks/useCompleteTile'
import { useSubstitute } from '../hooks/useSubstitute'
import { useLineSheet } from '../hooks/useLineSheet'
import { useTickFlow } from '../hooks/useTickFlow'
import { useShopChoice } from '../hooks/useShopChoice'
import { useShopHere } from '../hooks/useShopHere'
import { AddShopSheet } from '../../shops/components/AddShopSheet'
import { useShoppingActions } from '../hooks/useShoppingActions'
import { useShoppingList } from '../hooks/useShoppingList'
import { shopStrings } from '../strings'
import '../shop.css'

type Sheet = { kind: 'extra' } | { kind: 'addShop'; name: string } | null

export function ShoppingScreen() {
  const system = useDisplayUnitSystem()
  const navigate = useNavigate()
  const choice = useShopChoice()
  const [to, setTo] = useState<string | undefined>(undefined)
  const [sheet, setSheet] = useState<Sheet>(null)
  const list = useShoppingList({ shopId: choice.shopId, to })
  const actions = useShoppingActions()
  const toast = useToast()
  const here = useShopHere({ shopId: choice.shopId, setShopId: choice.setShopId, onAddHere: () => setSheet({ kind: 'addShop', name: '' }) })
  const ingredients = useIngredientChoices()
  const data = list.data
  const shopName = choice.shops.find((s) => s.id === choice.shopId)?.name ?? null
  // b8-shop, B9-15: the Shop chip shows "Any" when its own row has no room for "Any Shop" (the chip Select fits it); the list keeps "Any Shop".
  const shopOptions = useMemo(() => shopPickerChoices(choice.shops, shopStrings.anyShop, shopStrings.anyShopShort), [choice.shops])
  // B9-34: times of ticks are the Household's; while its zone is unknown no time is shown (never the device's).
  const timeZone = useMe().data?.householdTimeZone ?? null
  // B9-34 (SSP-01): one tap ticks; the toast offers Change and Undo; the ticked sheet's Take back, Change amount and Untick.
  // A11Y-07: after an Undo the restored row's tick takes the focus back
  const [restoreFocusKey, setRestoreFocusKey] = useState<string | null>(null)
  const onUndone = useCallback((entry: ListEntry) => setRestoreFocusKey(entry.key), [])
  const onFocusRestored = useCallback(() => setRestoreFocusKey(null), [])
  const flow = useTickFlow({ to: data?.to, shopId: choice.shopId, system, onUndone })
  // B9-43 (SSP-09): "Shopping List complete" with Put away and Read the receipt
  const complete = useCompleteTile({ list: data, shopId: choice.shopId, shopName })
  // B9-43 (SSP-13): Change the Price of the Line's Product, at the picked Shop (or the priced fallback's under Any Shop)
  const changePrice = useChangePrice({ shopId: choice.shopId, today: data?.today })
  const priceShopId = changePrice.target ? (choice.shopId ?? changePrice.target.details?.priceShopId ?? null) : null
  const priceShopName = choice.shops.find((s) => s.id === priceShopId)?.name ?? ''
  // B9-43 (SSP-14): Get something else… (add an extra, take the Line off, one Undo)
  const substitute = useSubstitute({ to: data?.to, shopId: choice.shopId })

  // B9-20 (RES-06): a failed action is a toast that names it ("Couldn’t mark Passata Not needed"), with Try again running
  // the same action; a refusal with its own message is that one line. The inline ErrorState is for load failures only.
  const run = (phrase: string, fn: () => Promise<unknown>) => {
    fn().catch((err: unknown) => toast.show(failureToast(actionFailed(phrase, err, { serverMessage: true }), () => run(phrase, fn))))
  }

  const onTick = (entry: ListEntry) => run(shopStrings.failed.tick(entry.title), () => flow.tick(entry))

  // The row's own tick on a ticked row, and Untick in its sheet: every hand addition is taken back; no toast (main-session ruling).
  const onUntick = (entry: ListEntry) => run(shopStrings.failed.untick(entry.title), () => flow.untick(entry))

  const onTakeBack = (entry: ListEntry, addition: Parameters<typeof flow.takeBack>[1]) =>
    run(shopStrings.failed.takeBack(entry.title), () => flow.takeBack(entry, addition))

  const onChangeAmount = (entry: ListEntry) => {
    const target = changeTargetOf(entry)
    if (target) flow.openChange(target)
  }

  const onDelete = (entry: ListEntry) => run(shopStrings.failed.delete(entry.title), () => actions.deleteExtra(entry.extraId as number))

  // B5-SH: Not needed for the range and the picked Shop; the toast offers Undo ("Needed after all").
  const onNotNeeded = (entry: ListEntry) => {
    if (!data || entry.ingredientId === null) return
    const ingredientId = entry.ingredientId
    const to = data.to
    const shopId = choice.shopId
    run(shopStrings.failed.notNeeded(entry.title), async () => {
      await actions.notNeeded({ ingredientId, to, shopId })
      toast.show(shopStrings.notNeededToast(entry.title), {
        actionLabel: shopStrings.undo,
        onAction: () => run(shopStrings.failed.neededAfterAll(entry.title), () => actions.neededAfterAll(ingredientId, to, shopId)),
      })
    })
  }

  const onNeededAfterAll = (entry: ListEntry) => {
    if (!data || entry.ingredientId === null) return
    run(shopStrings.failed.neededAfterAll(entry.title), () => actions.neededAfterAll(entry.ingredientId as number, data.to, choice.shopId))
  }

  // The open sheet follows the list: after a Take back the refreshed entry replaces the one it opened with.
  const groups = useMemo(() => {
    if (!data) return null
    const { open, ticked } = listEntries(data, system)
    return { open, ticked, 'not-needed': notNeededEntries(data, system) } satisfies Record<RowGroup, ListEntry[]>
  }, [data, system])
  const resolve = useCallback((entry: ListEntry, group: RowGroup) => groups?.[group].find((e) => e.key === entry.key) ?? null, [groups])

  // DS-SHOP: a row opens its sheet; the sheet's actions run the handlers above.
  const lineSheet = useLineSheet(
    {
      onNotNeeded,
      onNeededAfterAll,
      onMarkIt: (entry) => {
        if (entry.markIt) navigate(markSlotPath(entry.markIt))
      },
      onDelete,
      onChangeAmount,
      onUntick,
      onGetSomethingElse: substitute.start,
    },
    resolve,
  )

  const onChangeFailed = (err: unknown) => {
    const title = flow.changing?.entry.title ?? ''
    toast.show(failureToast(actionFailed(shopStrings.failed.change(title), err, { serverMessage: true })))
  }

  const onExtraSubmit = (input: Parameters<typeof actions.addExtra>[0]) => {
    if (substitute.target) {
      // B9-43: a failure leaves the sheet open for another try (all or nothing: the Line is untouched)
      const phrase = shopStrings.failed.addExtra('text' in input ? input.text : null)
      substitute.submit(input, addedNameOf(input, ingredients.choices)).catch((err: unknown) => toast.show(failureToast(actionFailed(phrase, err, { serverMessage: true }))))
      return
    }
    setSheet(null)
    run(shopStrings.failed.addExtra('text' in input ? input.text : null), () => actions.addExtra(input))
  }

  return (
    <section className="shop-screen">
      <PageHeader
        title={shopStrings.title}
        actions={<IconButton icon="add" label={shopStrings.addExtra} onClick={() => setSheet({ kind: 'extra' })} />}
      />
      <div className="shop-screen__controls">
        {data ? <RangePicker today={data.today} maxTo={data.maxTo} to={data.to} onChange={setTo} /> : null}
        <div className="shop-screen__shop">
          <ShopSelect
            label={shopStrings.shopLabel}
            appearance="chip"
            icon="shops"
            shops={shopOptions}
            value={choice.shopId ?? ANY_SHOP_ID}
            onChange={(id) => choice.setShopId(id === ANY_SHOP_ID ? null : id)}
            disabled={choice.isLoading}
            onCreate={(name) => setSheet({ kind: 'addShop', name })}
            createLabel={shopStrings.addShopNamed}
          />
          {here.anyLocated ? (
            <IconButton
              icon="location"
              label={here.status === 'locating' ? shopStrings.findingShopHere : shopStrings.findShopHere}
              onClick={here.find}
              disabled={here.status === 'locating'}
            />
          ) : null}
        </div>
      </div>
      {list.state === 'loading' ? (
        <SkeletonGroup className="shop-skeleton">
          <SkeletonList rows={6} />
        </SkeletonGroup>
      ) : null}
      {list.state === 'offlineUnknown' ? <LoadState title={shopStrings.offlineUnknownTitle} text={shopStrings.offlineUnknownText} /> : null}
      {list.state === 'failed' ? <ErrorState message={shopStrings.loadFailed} onRetry={list.retry} /> : null}
      {list.status === 'offline' ? <p className="shop-screen__stale">{shopStrings.offlineList}</p> : null}
      {data ? (
        <ShoppingBody
          list={data}
          system={system}
          shopName={shopName}
          onTick={onTick}
          onUntick={onUntick}
          onOpenLine={lineSheet.open}
          onScan={() => navigate('/scan')}
          onMarkIt={(slot) => navigate(markSlotPath(slot))}
          pendingKeys={flow.pendingKeys}
          restoreFocusKey={restoreFocusKey}
          onFocusRestored={onFocusRestored}
          complete={complete}
        />
      ) : null}
      <LineSheet
        entry={lineSheet.entry}
        actions={lineSheet.actions}
        onAction={lineSheet.run}
        onClose={lineSheet.close}
        system={system}
        timeZone={timeZone}
        onTakeBack={onTakeBack}
        shopName={shopName}
        onChangePrice={changePrice.open}
      />
      {changePrice.target && changePrice.product && data ? (
        <PriceSheet
          productName={changePrice.product.name}
          shopName={priceShopName}
          currency={data.currency}
          pack={changePrice.product.pack}
          last={changePrice.last}
          error={changePrice.error}
          onSave={(entry) => void changePrice.save(entry)}
          onClose={changePrice.close}
          entryKey={changePrice.target.key}
        />
      ) : null}
      <TickChangeSheet flow={flow} system={system} timeZone={timeZone ?? undefined} onFailed={onChangeFailed} />
      <AddShopSheet
        open={sheet?.kind === 'addShop'}
        initialName={sheet?.kind === 'addShop' ? sheet.name : ''}
        onClose={() => setSheet(null)}
        onAdded={(shop) => {
          setSheet(null)
          choice.setShopId(shop.id)
        }}
      />
      {sheet?.kind === 'extra' || substitute.target ? (
        <ExtraSheet
          open
          autoOpenIngredient={substitute.target !== null}
          onClose={() => {
            setSheet(null)
            substitute.cancel()
          }}
          ingredients={ingredients.choices}
          onSubmit={onExtraSubmit}
        />
      ) : null}
    </section>
  )
}
