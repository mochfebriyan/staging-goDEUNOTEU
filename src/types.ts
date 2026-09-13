// Domain model for GO Aikatsu — Admin Dashboard
// Field shapes follow the PRD's Functional Requirements (FR-GO-A/B/C/D-xxx).

export const TIPE_BARANG_OPTIONS = [
  'Kartu',
  'Ganci',
  'Binder',
  'Boneka',
  'Sleeve',
  'Standee',
  'Lainnya',
] as const
export type TipeBarang = (typeof TIPE_BARANG_OPTIONS)[number]

export const TIPE_KARTU_OPTIONS = [
  'Tops',
  'Skirt',
  'Shoes',
  'Set',
  'Accessories',
  'Dress',
] as const
export type TipeKartu = (typeof TIPE_KARTU_OPTIONS)[number]

// Order status reflects the parties named in the PRD executive summary
// (Mercari Seller → WH Japan → Bea Cukai → WH Indonesia → Customer).
export const ORDER_STATUS_OPTIONS = [
  'Dibeli dari Seller',
  'Di WH Jepang',
  'Dikirim ke Indonesia',
  'Di Bea Cukai',
  'Di WH Indonesia',
  'Selesai',
] as const
export type OrderStatus = (typeof ORDER_STATUS_OPTIONS)[number]

// A batch starts life at "Dibeli dari Seller" and stays there — uneditable
// from Order Recap — until it's placed into a Box. From then on its status
// is driven entirely by the Box's status (see Box below): a box ships as
// one physical unit, so every batch inside it always shares one status.
export const BOX_STATUS_OPTIONS = [
  'Di WH Jepang',
  'Dikirim ke Indonesia',
  'Di Bea Cukai',
  'Di WH Indonesia',
  'Selesai',
] as const
export type BoxStatus = (typeof BOX_STATUS_OPTIONS)[number]
export const DEFAULT_BOX_STATUS: BoxStatus = 'Di WH Jepang'

export const ORDER_TYPE_OPTIONS = ['ReqShare', 'Admin', 'Persod'] as const
export type OrderType = (typeof ORDER_TYPE_OPTIONS)[number]

export const BATCH_BILL_STATUSES = [
  'Belum Bayar',
  'Menunggu Konfirmasi',
  'Lunas',
] as const
export type BatchBillStatus = (typeof BATCH_BILL_STATUSES)[number]

export const TAX_BILL_STATUSES = [
  'Belum Bayar',
  'Menunggu Konfirmasi',
  'Lunas',
] as const
export type TaxBillStatus = (typeof TAX_BILL_STATUSES)[number]

export const SERVICE_FEE_TYPES = ['flat', 'percentage'] as const
export type ServiceFeeType = (typeof SERVICE_FEE_TYPES)[number]

// Payment channel the customer picks on their end when paying a bill.
// Customer Dashboard isn't built yet — Admin only ever sees this value,
// synced read-only from whatever the customer selected.
export const PAYMENT_METHOD_OPTIONS = [
  'QRIS',
  'Shopeepay',
  'DANA',
  'GoPay',
  'BCA',
  'SeaBank',
] as const
export type PaymentMethod = (typeof PAYMENT_METHOD_OPTIONS)[number]

export const KARTU_FLAT_TAX_IDR = 5000
export const TAX_PAYMENT_WINDOW_DAYS = 7

export interface Customer {
  id: string
  name: string
}

export interface BuktiTransfer {
  fileName: string
  dataUrl: string
  uploadedAt: string
  paymentMethod: PaymentMethod
}

// FR-GO-A-001: one submitted recap form = one Batch = one order/invoice
// link back to the seller. A Batch can hold items for several customers.
export interface Batch {
  id: string
  batchNumber: string
  boxId?: string
  orderIdWH: string
  orderType: OrderType
  photoDataUrls: string[]
  orderStatus: OrderStatus
  createdAt: string
  updatedAt: string
}

export interface Item {
  id: string
  batchId: string
  customerId: string
  tipeBarang: TipeBarang
  tipeKartu?: TipeKartu
  priceIDR: number
  weightGrams?: number
  createdAt: string
  updatedAt: string
}

export interface BatchBill {
  id: string
  batchId: string
  batchNumber: string
  customerId: string
  itemIds: string[]
  upnotesTotal: number
  bankAccount: string
  total: number
  status: BatchBillStatus
  createdAt: string
  paidAt?: string
  buktiTransfer?: BuktiTransfer
}

export interface TaxBill {
  id: string
  boxId: string
  customerId: string
  itemIds: string[]
  kartuCount: number
  kartuTax: number
  nonKartuWeightGrams: number
  nonKartuShare: number
  total: number
  // Optional, admin-entered flat amount for late payment — separate from
  // the product tax (`total`), never auto-suggested from days overdue.
  // The bill's grand total (what the customer actually owes) is
  // `total + lateFeeIDR`.
  lateFeeIDR: number
  publishedAt: string
  deadline: string
  status: TaxBillStatus
  buktiTransfer?: BuktiTransfer
}

// A shipping box: the unit that actually travels WH Japan → Bea Cukai →
// WH Indonesia. Groups the batches inside it and is the single source of
// truth for their orderStatus — editing a box's status cascades to every
// batch in batchIds.
export interface Box {
  id: string
  boxNumber: string
  batchIds: string[]
  status: BoxStatus
  createdAt: string
  updatedAt: string
}

export interface EstimatorConfig {
  exchangeRate: number
  serviceFeeType: ServiceFeeType
  serviceFeeValue: number
  updatedAt: string
}
