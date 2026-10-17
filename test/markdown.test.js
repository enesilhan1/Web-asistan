import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { markdowndanHtml as md } from '../src/markdown.js';

describe('markdowndanHtml', () => {
  it('HTML kaçışlanır, betik enjekte edilemez', () => {
    assert.equal(md('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
    assert.equal(md('[tık](javascript:alert(1))'), '<p>[tık](javascript:alert(1))</p>');
    assert.equal(
      md('[a](https://x.com/"onmouseover="y)'),
      '<p><a href="https://x.com/&quot;onmouseover=&quot;y" target="_blank" rel="noopener noreferrer">a</a></p>',
    );
  });

  it('satır içi biçimler', () => {
    assert.equal(
      md('**kalın** *eğik* `kod **değil**` ~~sil~~ [link](https://a.com/b)'),
      '<p><strong>kalın</strong> <em>eğik</em> <code>kod **değil**</code> <del>sil</del> ' +
        '<a href="https://a.com/b" target="_blank" rel="noopener noreferrer">link</a></p>',
    );
    assert.equal(md('2*3*4'), '<p>2*3*4</p>');
  });

  it('başlık, listeler, paragraf, kod bloğu, alıntı', () => {
    const girdi = [
      '# Özet',
      'Birinci satır',
      'ikinci satır',
      '',
      '- a',
      '- **b**',
      '1. bir',
      '2. iki',
      '```js',
      'const x = "<b>";',
      '```',
      '> alıntı',
      '---',
    ].join('\n');
    assert.equal(
      md(girdi),
      '<h3>Özet</h3><p>Birinci satır<br>ikinci satır</p><ul><li>a</li><li><strong>b</strong></li></ul>' +
        '<ol><li>bir</li><li>iki</li></ol><pre><code>const x = &quot;&lt;b&gt;&quot;;</code></pre>' +
        '<blockquote>alıntı</blockquote><hr>',
    );
  });

  it('kapanmamış kod bloğu metnin sonuna kadar sürer', () => {
    assert.equal(md('```\na\nb'), '<pre><code>a\nb</code></pre>');
  });
});
