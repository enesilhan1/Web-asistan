// Asistan yanıtları için küçük ve güvenli Markdown → HTML çevirici. Önce
// bütün metin kaçışlanır (HTML enjekte edilemez); sonra yalnızca bilinen
// biçimler etikete çevrilir. Bağlantılar sadece http(s) olabilir.

const kacis = (t) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function satirIci(t) {
  // Satır içi kodlar yer tutucuya alınır ki içleri biçimlenmesin.
  const kodlar = [];
  let s = kacis(t).replace(/`([^`\n]+)`/g, (_, k) => {
    kodlar.push(k);
    return `\u0000${kodlar.length - 1}\u0000`;
  });
  s = s
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, metin, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${metin}</a>`)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${kodlar[Number(i)]}</code>`);
}

/** @param {string} md */
export function markdowndanHtml(md) {
  const satirlar = (md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const cikti = [];
  let paragraf = [];
  /** @type {{tur: 'ul'|'ol', ogeler: string[]}|null} */
  let liste = null;

  const paragrafiBitir = () => {
    if (paragraf.length) cikti.push(`<p>${paragraf.map(satirIci).join('<br>')}</p>`);
    paragraf = [];
  };
  const listeyiBitir = () => {
    if (liste) cikti.push(`<${liste.tur}>${liste.ogeler.map((o) => `<li>${satirIci(o)}</li>`).join('')}</${liste.tur}>`);
    liste = null;
  };

  for (let i = 0; i < satirlar.length; i++) {
    const satir = satirlar[i];

    const kodBasi = satir.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (kodBasi) {
      paragrafiBitir();
      listeyiBitir();
      const kod = [];
      for (i++; i < satirlar.length && !/^\s*```\s*$/.test(satirlar[i]); i++) kod.push(satirlar[i]);
      cikti.push(`<pre><code>${kacis(kod.join('\n'))}</code></pre>`);
      continue;
    }

    const baslik = satir.match(/^(#{1,6})\s+(.*)$/);
    if (baslik) {
      paragrafiBitir();
      listeyiBitir();
      const d = Math.min(baslik[1].length + 2, 6); // popup'ta küçük başlıklar
      cikti.push(`<h${d}>${satirIci(baslik[2])}</h${d}>`);
      continue;
    }

    const madde = satir.match(/^\s*[-*+]\s+(.*)$/);
    const sira = satir.match(/^\s*\d+[.)]\s+(.*)$/);
    if (madde || sira) {
      paragrafiBitir();
      const tur = madde ? 'ul' : 'ol';
      if (liste?.tur !== tur) listeyiBitir();
      liste ??= { tur, ogeler: [] };
      liste.ogeler.push((madde ?? sira)[1]);
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(satir)) {
      paragrafiBitir();
      listeyiBitir();
      cikti.push('<hr>');
      continue;
    }

    if (/^\s*>\s?/.test(satir)) {
      paragrafiBitir();
      listeyiBitir();
      cikti.push(`<blockquote>${satirIci(satir.replace(/^\s*>\s?/, ''))}</blockquote>`);
      continue;
    }

    if (!satir.trim()) {
      paragrafiBitir();
      listeyiBitir();
      continue;
    }
    listeyiBitir();
    paragraf.push(satir);
  }
  paragrafiBitir();
  listeyiBitir();
  return cikti.join('');
}
