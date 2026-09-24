const BASE=(import.meta.env.VITE_API_URL||'/api').replace(/\/+$/,'');

async function publicRequest(path,options={}){
  const response=await fetch(`${BASE}${path}`,{
    ...options,
    headers:{
      'Content-Type':'application/json',
      ...(options.headers||{})
    }
  });

  const data=await response.json().catch(()=>({}));

  if(!response.ok){
    const error=new Error(
      data.message||
      data.error||
      `HTTP_${response.status}`
    );
    error.status=response.status;
    error.code=data.error;
    error.data=data;
    throw error;
  }

  return data;
}

export const saasPublicApi={
  plans:()=>publicRequest('/public/saas/plans'),

  plan:code=>
    publicRequest(
      `/public/saas/plans/${encodeURIComponent(code)}`
    ),

  promotion:code=>
    publicRequest(
      `/public/saas/promotions/${encodeURIComponent(code)}`
    ),

  createCheckout:(body,idempotencyKey)=>
    publicRequest('/public/saas/checkout',{
      method:'POST',
      headers:{
        'x-idempotency-key':idempotencyKey
      },
      body:JSON.stringify(body)
    }),

  checkout:(publicId,token)=>
    publicRequest(
      `/public/saas/checkout/${encodeURIComponent(publicId)}`,
      {
        headers:{
          'x-checkout-token':token
        }
      }
    )
};