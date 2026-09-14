// Guards for the three delete flows (Batch, Box, Tax Bill), shared between
// the store (which enforces them) and pages (which preview them before the
// user confirms). Each guard splits its input into what's safe to delete
// and what's protected, with a human-readable reason for the block.
//
// The rule of thumb: money that's already happened (a Lunas/Menunggu
// Konfirmasi bill) protects itself, and structural dependents (a Batch
// whose items are in a published Tax Bill, a Box a Tax Bill still points
// at) inherit that protection one level up.
import { DEFAULT_BOX_STATUS, type Batch, type BatchBill, type Box, type Item, type TaxBill } from '../types'

export interface DeleteGuardResult<T> {
  eligible: T[]
  blocked: Array<{ item: T; reason: string }>
}

export function guardTaxBillDeletion(bills: TaxBill[]): DeleteGuardResult<TaxBill> {
  const eligible: TaxBill[] = []
  const blocked: Array<{ item: TaxBill; reason: string }> = []
  for (const bill of bills) {
    if (bill.status === 'Lunas') {
      blocked.push({ item: bill, reason: 'sudah lunas' })
    } else if (bill.status === 'Menunggu Konfirmasi') {
      blocked.push({ item: bill, reason: 'menunggu konfirmasi pembayaran' })
    } else {
      eligible.push(bill)
    }
  }
  return { eligible, blocked }
}

// A box's status is a one-way door — once it leaves the default, it's
// considered "in motion" and locks for good (see BoxForm/saveBox), so
// that's the only check needed here. Tax bills can only ever exist on a
// box past that point anyway (publishing requires Di Bea Cukai or later),
// so this single check already covers that case too.
export function guardBoxDeletion(boxes: Box[]): DeleteGuardResult<Box> {
  const eligible: Box[] = []
  const blocked: Array<{ item: Box; reason: string }> = []
  for (const box of boxes) {
    if (box.status !== DEFAULT_BOX_STATUS) {
      blocked.push({ item: box, reason: 'status box sudah berubah dari status awal' })
    } else {
      eligible.push(box)
    }
  }
  return { eligible, blocked }
}

export function guardBatchDeletion(
  batches: Batch[],
  items: Item[],
  taxBills: TaxBill[],
  batchBills: BatchBill[],
): DeleteGuardResult<Batch> {
  const eligible: Batch[] = []
  const blocked: Array<{ item: Batch; reason: string }> = []
  const billedItemIds = new Set(taxBills.flatMap((t) => t.itemIds))

  for (const batch of batches) {
    const hasBilledItems = items.some((i) => i.batchId === batch.id && billedItemIds.has(i.id))
    if (hasBilledItems) {
      blocked.push({ item: batch, reason: 'punya item yang sudah masuk tagihan pajak yang dipublikasikan' })
      continue
    }
    const hasProtectedBill = batchBills.some(
      (b) => b.batchId === batch.id && (b.status === 'Lunas' || b.status === 'Menunggu Konfirmasi'),
    )
    if (hasProtectedBill) {
      blocked.push({ item: batch, reason: 'punya tagihan yang sudah dibayar/menunggu konfirmasi' })
      continue
    }
    eligible.push(batch)
  }
  return { eligible, blocked }
}
