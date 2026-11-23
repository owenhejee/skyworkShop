/** 分 → 元显示（金额字段单位为分） */
export function formatPriceInCents(priceInCents: number): string {
  return (priceInCents / 100).toFixed(2)
}

/** 元 → 分（表单输入） */
export function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100)
}
