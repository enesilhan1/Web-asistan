// Testler için sahte fetch: sıradaki yanıtları verir, gelen istekleri kaydeder.

/**
 * @param {Array<{durum?: number, govde?: any, basliklar?: Record<string,string>}
 *   | Error | ((istek: any) => any)>} yanitlar
 */
export function sahteFetch(yanitlar) {
  const istekler = [];
  const f = async (adres, secenekler) => {
    const istek = {
      adres,
      basliklar: secenekler.headers,
      govde: JSON.parse(secenekler.body),
      sinyal: secenekler.signal,
    };
    istekler.push(istek);
    let y = yanitlar.shift();
    if (typeof y === 'function') y = await y(istek);
    if (y === undefined) throw new Error('beklenmeyen istek');
    if (y instanceof Error) throw y;
    const metin = typeof y.govde === 'string' ? y.govde : JSON.stringify(y.govde ?? {});
    return {
      status: y.durum ?? 200,
      headers: new Headers(y.basliklar ?? {}),
      text: async () => metin,
    };
  };
  f.istekler = istekler;
  return f;
}

export const ARAC = {
  ad: 'sekmeyi_oku',
  aciklama: 'Bir sekmenin metnini okur.',
  sema: {
    type: 'object',
    properties: { sekme_id: { type: 'integer', description: 'Sekme kimliği' } },
    required: ['sekme_id'],
  },
};
