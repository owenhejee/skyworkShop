import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createProduct, fetchProducts } from '@/api/product'
import type { Product, ProductCreatePayload } from '@/types/product'

export const useProductStore = defineStore('product', () => {
  const products = ref<Product[]>([])
  const total = ref(0)
  const page = ref(1)
  const size = ref(10)
  const loading = ref(false)
  const keyword = ref('')

  async function loadProducts() {
    loading.value = true
    try {
      const { data } = await fetchProducts({
        page: page.value,
        size: size.value,
        keyword: keyword.value || undefined,
      })
      products.value = data.data.list
      total.value = data.data.total
    } finally {
      loading.value = false
    }
  }

  async function addProduct(payload: ProductCreatePayload) {
    // #region agent log
    fetch('http://127.0.0.1:7883/ingest/487bbb41-e458-49d8-9fd8-d6e85da85d68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4816f3'},body:JSON.stringify({sessionId:'4816f3',hypothesisId:'A',location:'product.ts:addProduct:entry',message:'addProduct called',data:{payload,page:page.value,keyword:keyword.value},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const res = await createProduct(payload)
    // #region agent log
    fetch('http://127.0.0.1:7883/ingest/487bbb41-e458-49d8-9fd8-d6e85da85d68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4816f3'},body:JSON.stringify({sessionId:'4816f3',runId:'post-fix',hypothesisId:'B',location:'product.ts:addProduct:afterCreate',message:'createProduct response',data:{code:res.data.code,productId:res.data.data?.id,name:res.data.data?.name},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    page.value = 1
    keyword.value = ''
    await loadProducts()
    // #region agent log
    fetch('http://127.0.0.1:7883/ingest/487bbb41-e458-49d8-9fd8-d6e85da85d68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4816f3'},body:JSON.stringify({sessionId:'4816f3',runId:'post-fix',hypothesisId:'D',location:'product.ts:addProduct:afterReload',message:'list reloaded',data:{total:total.value,productCount:products.value.length,page:page.value,keyword:keyword.value,firstId:products.value[0]?.id,newProductId:res.data.data?.id,containsNew:products.value.some((p)=>p.id===res.data.data?.id)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }

  function setPage(next: number) {
    page.value = next
  }

  function setKeyword(next: string) {
    keyword.value = next
    page.value = 1
  }

  return {
    products,
    total,
    page,
    size,
    loading,
    keyword,
    loadProducts,
    addProduct,
    setPage,
    setKeyword,
  }
})
