// Guards for the three delete flows (Batch, Box, Tax Bill), shared between
// the store (which enforces them) and pages (which preview them before the
// user confirms). Each guard splits its input into what's safe to delete
// and what's protected, with a human-readable reason for the block.
//
// The rule of thumb: money that's already happened (a Lunas/Menunggu
// Konfirmasi bill) protects itself, and structural dependents (a Batch
// whose items are in a published Tax Bill, a Box a Tax Bill still points
// at) inherit that protection one level up.
import type { Batch, BatchBill, Box, Item, TaxBill } from '../types'

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

export function guardBoxDeletion(boxes: Box[], taxBills: TaxBill[]): DeleteGuardResult<Box> {
  const eligible: Box[] = []
  const blocked: Array<{ item: Box; reason: string }> = []
  for (const box of boxes) {
    const hasTaxBills = taxBills.some((t) => t.boxId === box.id)
    if (hasTaxBills) {
      blocked.push({ item: box, reason: 'masih punya tagihan pajak yang dipublikasikan' })
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
